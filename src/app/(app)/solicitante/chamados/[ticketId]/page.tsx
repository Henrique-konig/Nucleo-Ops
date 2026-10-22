import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTicketForRequester } from "@/lib/tickets";
import { NotFoundError } from "@/lib/errors";
import { RequesterTicketView } from "@/components/tickets/requester-view";
import { rateOwnTicket, sendRequesterMessage } from "../../actions";

export const metadata = { title: "Chamado" };

export default async function RequesterTicketPage({ params }: PageProps<"/solicitante/chamados/[ticketId]">) {
  const user = await requireUser();
  const { ticketId } = await params;
  const ticket = await getTicketForRequester({ id: ticketId, requesterId: user.id }).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <RequesterTicketView
      ticket={ticket}
      sendMessage={sendRequesterMessage.bind(null, ticket.id)}
      rate={rateOwnTicket.bind(null, ticket.id)}
    />
  );
}
