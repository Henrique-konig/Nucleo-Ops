import "server-only";
import { db } from "@/lib/db";
import { getIntegration } from "@/lib/integrations";

// Escala de plantão a partir de uma agenda iCal (Google Calendar: "Endereço secreto
// no formato iCal"; também funciona com Outlook). Está de plantão quem aparece no
// evento em andamento, pelo e-mail do participante ou pelo nome no título.
// Limites: eventos recorrentes (RRULE) não são expandidos; horários com TZID são
// lidos no fuso de Brasília (UTC−3).

export type CalendarEvent = { summary: string; start: Date; end: Date; attendees: string[] };

function parseIcsDate(value: string, params: string): Date {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) {
    return new Date(Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8), 3));
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s, z] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return new Date(z ? utc : utc + 3 * 3_600_000);
}

export function parseIcs(ics: string): CalendarEvent[] {
  // Desfaz as linhas dobradas (continuação começa com espaço).
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> & { attendees: string[] } | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = { attendees: [] };
    else if (line === "END:VEVENT" && current) {
      if (current.start && current.end && !isNaN(+current.start)) events.push({ summary: current.summary ?? "", start: current.start, end: current.end, attendees: current.attendees });
      current = null;
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const [name, ...params] = line.slice(0, idx).split(";");
      const value = line.slice(idx + 1);
      if (name === "SUMMARY") current.summary = value.replace(/\\,/g, ",").replace(/\\n/g, " ");
      if (name === "DTSTART") current.start = parseIcsDate(value, params.join(";"));
      if (name === "DTEND") current.end = parseIcsDate(value, params.join(";"));
      if (name === "ATTENDEE" || name === "ORGANIZER") {
        const email = /mailto:(.+)$/i.exec(value)?.[1];
        if (email && name === "ATTENDEE") current.attendees.push(email.toLowerCase());
      }
    }
  }
  return events;
}

export function onCallUserIds(events: CalendarEvent[], members: { id: string; name: string; email: string }[], now = new Date()): string[] {
  const active = events.filter((e) => e.start <= now && now < e.end);
  const ids = new Set<string>();
  for (const e of active) {
    for (const m of members) {
      if (e.attendees.includes(m.email.toLowerCase()) || e.summary.toLowerCase().includes(m.name.toLowerCase())) ids.add(m.id);
    }
  }
  return [...ids];
}

const cache = new Map<string, { at: number; events: CalendarEvent[] }>();

/** Ids dos membros de plantão agora. Sem integração de agenda, ninguém. */
export async function getOnCallUserIds(teamId: string): Promise<string[]> {
  const integration = await getIntegration(teamId, "GOOGLE_CALENDAR");
  if (!integration) return [];
  let entry = cache.get(integration.id);
  if (!entry || Date.now() - entry.at > 5 * 60_000) {
    try {
      const res = await fetch(integration.config.icsUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Agenda respondeu ${res.status}`);
      entry = { at: Date.now(), events: parseIcs(await res.text()) };
      cache.set(integration.id, entry);
    } catch (err) {
      console.error("[agenda] falha ao ler a escala de plantão", err);
      return [];
    }
  }
  const members = await db.user.findMany({
    where: { teamId, active: true, role: { in: ["TECHNICIAN", "COORDINATOR", "ADMIN"] } },
    select: { id: true, name: true, email: true },
  });
  return onCallUserIds(entry.events, members);
}
