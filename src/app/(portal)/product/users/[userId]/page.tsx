import type { Metadata } from "next";

import {
  revokeAdminUserSession,
  updateAdminUserActivation,
  updateAdminUserEntitlement,
  updateAdminUserRole,
  updateAdminUserSubscription,
} from "@/app/(portal)/product/users/[userId]/actions";
import { AdminUserDetail } from "@/components/product/admin-user-detail";
import { getAdminUserDetailAccess } from "@/lib/product/access";
import { requestNow } from "@/lib/request-time";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

type AdminUserDetailPageProps = {
  params: Promise<{ userId: string }>;
};

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { userId } = await params;
  const access = await getAdminUserDetailAccess(userId);

  return (
    <AdminUserDetail
      access={access}
      activationAction={updateAdminUserActivation}
      sessionRevokeAction={revokeAdminUserSession}
      roleAction={updateAdminUserRole}
      planAction={updateAdminUserSubscription}
      overrideAction={updateAdminUserEntitlement}
      now={requestNow()}
    />
  );
}
