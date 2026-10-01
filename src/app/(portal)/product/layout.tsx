import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { PATH_HEADER } from "@/lib/api/core";
import { fetchProductLink, type ProductLink } from "@/lib/product/account-api";

const REASONS: Record<string, string> = {
  "account-not-linked":
    "Product acts as your own Quantify Terminal account, and none is linked to your staff record yet.",
  "linked-account-missing":
    "The Quantify Terminal account linked to your staff record no longer exists.",
  "linked-account-inactive":
    "The Quantify Terminal account linked to your staff record is deactivated.",
  "linked-account-not-staff":
    "The Quantify Terminal account linked to your staff record no longer holds a staff role in the product.",
};

/**
 * The product's administration: customer accounts, plans, notices, releases, keys — the
 * console's Administration, moved here. Every screen runs as the staff member's own linked
 * Quantify Terminal account, so this frame says plainly when there is none, and offers a
 * fresh code before any change (reading needs none).
 */
export default async function ProductLayout({ children }: { children: ReactNode }) {
  const context = await requireStaff("/product");
  if (!hasCapability(context, "product:access")) {
    return (
      <>
        <PageHeader title="Product" />
        <Callout tone="neutral">Product is for Owners, Admins and Support.</Callout>
      </>
    );
  }
  let link: ProductLink | null = null;
  try {
    link = await fetchProductLink(context.token);
  } catch {
    link = null;
  }
  if (link && !link.linked) {
    const owner = context.me.role === "owner";
    return (
      <>
        <PageHeader title="Product" />
        <Callout tone="attention" title="No Quantify Terminal account to act as">
          {REASONS[link.reason] ?? REASONS["account-not-linked"]}{" "}
          {owner ? (
            <>
              Link one on{" "}
              <Link
                className="text-link"
                href={`/admin/staff/${context.me.staff.staff_id}#staff-product`}
              >
                your staff record
              </Link>
              : it must already hold a staff role in the product.
            </>
          ) : (
            "An Owner links it on your staff record; it must already hold a staff role in the product."
          )}
        </Callout>
      </>
    );
  }
  const path = (await headers()).get(PATH_HEADER) || "/product";
  return (
    <>
      {!context.me.sudo_fresh && (
        <div className="product-sudo">
          <SudoGate
            action={confirmSudoAction}
            fresh={false}
            untilLabel={null}
            returnPath={path.startsWith("/product") ? path : "/product"}
            purpose="Changes in Product need a fresh code from your authenticator app; reading needs none."
          />
        </div>
      )}
      {children}
    </>
  );
}
