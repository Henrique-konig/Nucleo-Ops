import { notFound } from "next/navigation";
import { getTicketForRequester } from "@/lib/tickets";
import { NotFoundError } from "@/lib/errors";
import { RequesterTicketView } from "@/components/tickets/requester-view";
import { rateTrackedTicket, sendTrackedMessage } from "./actions";

export const metadata = { title: "Acompanhar chamado", robots: { index: false } };

export default async function TrackingPage({ params }: PageProps<"/acompanhar/[token]">) {
  const { token } = await params;
  const ticket = await getTicketForRequester({ accessToken: token }).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-4 py-2 font-semibold dark:border-slate-800 dark:bg-slate-900">Plantão</header>
      <RequesterTicketView
        ticket={ticket}
        sendMessage={sendTrackedMessage.bind(null, token)}
        rate={rateTrackedTicket.bind(null, token)}
      />
    </div>
  );
}
