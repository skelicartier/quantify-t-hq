import type { Metadata } from "next";

import { AdminSubscriptions } from "@/components/product/admin-subscriptions";
import { getAdminSubscriptionsAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const access = await getAdminSubscriptionsAccess();

  return <AdminSubscriptions access={access} now={requestNow()} />;
}
