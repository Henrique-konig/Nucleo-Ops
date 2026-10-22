import { currentUser } from "@/lib/session";
import { globalSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await globalSearch(user, q) });
}
