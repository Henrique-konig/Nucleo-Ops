import { describe, expect, it } from "vitest";
import { onCallUserIds, parseIcs } from "./calendar";

const ics = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART:20261022T110000Z",
  "DTEND:20261022T230000Z",
  "SUMMARY:Plantão - Tânia Técnica",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Sao_Paulo:20261023T080000",
  "DTEND;TZID=America/Sao_Paulo:20261023T180000",
  "SUMMARY:Plantão",
  "ATTENDEE;CN=Bruno:mailto:Bruno@Empresa.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261024",
  "DTEND;VALUE=DATE:20261025",
  "SUMMARY:Plantão de fim de sema",
  " na - Carla",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const members = [
  { id: "t", name: "Tânia Técnica", email: "tania@empresa.com" },
  { id: "b", name: "Bruno", email: "bruno@empresa.com" },
  { id: "c", name: "Carla", email: "carla@empresa.com" },
];

describe("escala de plantão (iCal)", () => {
  it("lê eventos em UTC, com TZID e de dia inteiro, incluindo linhas dobradas", () => {
    const events = parseIcs(ics);
    expect(events).toHaveLength(3);
    expect(events[1].start.toISOString()).toBe("2026-10-23T11:00:00.000Z");
    expect(events[2].summary).toBe("Plantão de fim de semana - Carla");
  });

  it("identifica quem está de plantão pelo nome no título ou pelo participante", () => {
    const events = parseIcs(ics);
    expect(onCallUserIds(events, members, new Date("2026-10-22T15:00:00Z"))).toEqual(["t"]);
    expect(onCallUserIds(events, members, new Date("2026-10-23T12:00:00Z"))).toEqual(["b"]);
    expect(onCallUserIds(events, members, new Date("2026-10-24T12:00:00Z"))).toEqual(["c"]);
    expect(onCallUserIds(events, members, new Date("2026-10-22T05:00:00Z"))).toEqual([]);
  });
});
