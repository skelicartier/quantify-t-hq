import type { Metadata } from "next";

import { AdminReports } from "@/components/product/admin-reports";
import { getAdminReportsAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Product reports" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const access = await getAdminReportsAccess();

  return <AdminReports access={access} now={requestNow()} />;
}
