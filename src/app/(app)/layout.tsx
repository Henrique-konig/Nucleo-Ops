import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { navFor } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <nav aria-label="Principal" className="flex items-center gap-4">
          <Link href="/" className="font-semibold">Plantão</Link>
          <ul className="flex flex-wrap gap-3 text-sm">
            {navFor(user.role).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-slate-700 hover:underline dark:text-slate-300">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/conta" className="hover:underline">
            {user.name} <span className="text-slate-500 dark:text-slate-400">· {ROLE_LABELS[user.role]}</span>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="btn">Sair</button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
