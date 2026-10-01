import type { Metadata } from "next";

import { AdminConfiguration } from "@/components/product/admin-platform-status";
import { getAdminConfigurationAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Configuration" };
export const dynamic = "force-dynamic";

export default async function AdminConfigurationPage() {
  const access = await getAdminConfigurationAccess();
  return <AdminConfiguration access={access} now={requestNow()} />;
}
