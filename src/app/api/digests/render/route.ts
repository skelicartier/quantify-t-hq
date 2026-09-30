import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { deliverDigest } from "@/lib/api/digests";
import { DIGEST_LISTS, renderDigest } from "@/lib/digests/render";

export const dynamic = "force-dynamic";

const batchSchema = z.object({
  digests: z
    .array(
      z.object({
        digest_id: z.string().regex(/^[0-9a-f-]{36}$/i),
        token: z.string().startsWith("hqd_").max(80),
        list_key: z.enum(DIGEST_LISTS),
        view_name: z.string().max(80),
        query: z.string().max(400),
        send_empty: z.boolean(),
      }),
    )
    .max(200),
});

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The service's hourly pass hands over the digests that are due, each with a digest token
 * for its recipient. Each is rendered as that person — their list, their filters, their
 * money gate — and posted back to be mailed. Only a caller holding the shared portal key
 * gets in; without the key configured, nobody does.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = (process.env.HQ_ACCOUNT_API_PORTAL_KEY ?? "").trim();
  if (!expected || !sameKey(request.headers.get("x-qt-portal-key") ?? "", expected)) {
    return Response.json({ ok: false, error: "not_allowed" }, { status: 401 });
  }
  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "malformed" }, { status: 400 });
  let rendered = 0;
  let failed = 0;
  for (const item of parsed.data.digests) {
    try {
      const table = await renderDigest(item.token, item.list_key, item.query);
      await deliverDigest(item.token, item.digest_id, table);
      rendered += 1;
    } catch {
      // Left due on the service side: its next pass mints a fresh token and tries again.
      failed += 1;
      console.error(`[digests] digest=${item.digest_id} outcome=render-failed`);
    }
  }
  return Response.json({ ok: true, rendered, failed });
}
