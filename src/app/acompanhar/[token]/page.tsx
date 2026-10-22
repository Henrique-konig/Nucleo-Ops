import { notFound } from "next/navigation";
import { getTicketForRequester } from "@/lib/tickets";
import { NotFoundError } from "@/lib/errors";
import { RequesterTicketView } from "@/components/tickets/requester-view";
import { rateTrackedTicket, sendTrackedMessage } from "./actions";
import { Logo } from "@/components/shell/sidebar";

export const metadata = { title: "Acompanhar chamado", robots: { index: false } };

export default async function TrackingPage({ params }: PageProps<"/acompanhar/[token]">) {
  const { token } = await params;
  const ticket = await getTicketForRequester({ accessToken: token }).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-slate-200/80 bg-slate-50/80 px-4 backdrop-blur-xl sm:px-6 dark:border-slate-800 dark:bg-slate-950/80"><Logo /></header>
      <RequesterTicketView
        ticket={ticket}
        sendMessage={sendTrackedMessage.bind(null, token)}
        rate={rateTrackedTicket.bind(null, token)}
      />
    </div>
  );
}
