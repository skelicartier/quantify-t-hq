import { Desk, deskFilters } from "@/app/(portal)/support/_desk/desk";
import { requireStaff } from "@/lib/access/core";

export const metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

type TicketPageProps = {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A conversation open in the desk: the same three panes, this one in the middle. */
export default async function TicketPage({ params, searchParams }: TicketPageProps) {
  const { ticketId } = await params;
  const context = await requireStaff(`/support/${ticketId}`);
  const filters = deskFilters(await searchParams);
  return <Desk context={context} filters={filters} selected={ticketId} />;
}
