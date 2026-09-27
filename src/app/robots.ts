import type { MetadataRoute } from "next";

/** A staff portal has no page for a crawler, including the public certificate check —
 * a serial is verified by the person holding it, not found by search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
