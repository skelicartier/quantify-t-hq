import type { Metadata } from "next";

import { AdminCredentials } from "@/components/product/admin-platform-status";
import { getAdminCredentialStatusAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Credentials" };
export const dynamic = "force-dynamic";

export default async function AdminCredentialsPage() {
  const access = await getAdminCredentialStatusAccess();
  return <AdminCredentials access={access} now={requestNow()} />;
}
