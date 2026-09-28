import { Desk, deskFilters } from "@/app/(portal)/support/_desk/desk";
import { requireStaff } from "@/lib/access/core";

export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";

type SupportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The desk with no conversation open: the queue and an invitation to pick one. */
export default async function SupportPage({ searchParams }: SupportPageProps) {
  const context = await requireStaff("/support");
  const filters = deskFilters(await searchParams);
  return <Desk context={context} filters={filters} selected={null} />;
}
