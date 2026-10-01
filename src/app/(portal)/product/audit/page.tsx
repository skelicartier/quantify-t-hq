import type { Metadata } from "next";

import { AdminAuditEvents } from "@/components/product/admin-audit-events";
import { getAdminAuditEventsAccess } from "@/lib/product/access";
import { parseAuditFilters } from "@/lib/product/audit-filters";
import { parsePagination, type SearchParams } from "@/lib/search-params";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Product audit" };
export const dynamic = "force-dynamic";

type AdminAuditPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const params = await searchParams;
  const { limit, offset } = parsePagination(params);
  const filters = parseAuditFilters(params);
  const access = await getAdminAuditEventsAccess(limit, offset, filters);

  return <AdminAuditEvents access={access} now={requestNow()} />;
}
