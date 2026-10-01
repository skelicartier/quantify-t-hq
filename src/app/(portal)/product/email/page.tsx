import type { Metadata } from "next";

import { AdminEmail } from "@/components/product/admin-email";
import { getAdminEmailAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Product email" };
export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const access = await getAdminEmailAccess();

  return <AdminEmail access={access} now={requestNow()} />;
}
