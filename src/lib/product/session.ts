import "server-only";

import { requireStaff } from "@/lib/access/core";

/**
 * Where the console read its Account API session, the product's administration in HQ reads
 * the staff member's HQ session: the service runs each administration route as their linked
 * Quantify Terminal account, so this is the only credential the copied screens need.
 */
export async function createServerAzureClient(_options?: { cookieWriteMode?: string }) {
  void _options;
  const context = await requireStaff("/product");
  return { getAccessToken: () => context.token };
}
