import type { Metadata } from "next";

import { AdminUsers } from "@/components/product/admin-users";
import { getAdminUsersAccess } from "@/lib/product/access";
import { parsePagination, parseUserFilters, type SearchParams } from "@/lib/search-params";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const { limit, offset } = parsePagination(params);
  const access = await getAdminUsersAccess(limit, offset, parseUserFilters(params));

  return <AdminUsers access={access} now={requestNow()} />;
}
