import type { Metadata } from "next";

import { AdminAccess } from "@/components/product/admin-access";
import { getAdminStaffAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Product staff" };
export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const access = await getAdminStaffAccess();

  return <AdminAccess access={access} now={requestNow()} />;
}
