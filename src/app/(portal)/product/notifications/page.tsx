import type { Metadata } from "next";

import { AdminNotifications } from "@/components/product/admin-notifications";
import { getAdminNotificationsAccess } from "@/lib/product/access";

export const metadata: Metadata = { title: "Notices" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const access = await getAdminNotificationsAccess();

  return <AdminNotifications access={access} />;
}
