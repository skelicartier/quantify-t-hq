import type { Metadata } from "next";

import { AdminDashboard } from "@/components/product/admin-dashboard";
import { getAdminDashboardAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Product overview" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAdminDashboardAccess();
  return <AdminDashboard access={access} now={requestNow()} />;
}
