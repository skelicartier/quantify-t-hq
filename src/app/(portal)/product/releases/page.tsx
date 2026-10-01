import type { Metadata } from "next";

import {
  publishRelease,
  rollbackRelease,
  setReleaseDisabled,
} from "@/app/(portal)/product/releases/actions";
import { AdminReleases } from "@/components/product/admin-platform-status";
import { getAdminReleaseStatusAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

export default async function AdminReleasesPage() {
  const access = await getAdminReleaseStatusAccess();
  return (
    <AdminReleases
      access={access}
      now={requestNow()}
      publish={publishRelease}
      rollback={rollbackRelease}
      setDisabled={setReleaseDisabled}
    />
  );
}
