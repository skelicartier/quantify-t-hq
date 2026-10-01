import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

/**
 * Product: the console's administration, run from HQ. The client keeps the console's
 * `admin/*` route names and the transport sends each one to `hq/product/*`, where the
 * service runs its own `admin/*` handler as the staff member's linked account. The three
 * route lists — the client's, the mock's and the service's `BRIDGED` — are built from
 * lists rather than literal table entries, so the general route-parity test cannot see
 * them; this one compares them directly.
 */

const SERVICE_FILE = resolve(
  process.cwd(),
  "../Quantify Terminal/cloud/azure/account_function/account_api/hq/product_admin_routes.py",
);

type Route = { route: string; method: string };

function serviceBridged(): Route[] | null {
  if (!existsSync(SERVICE_FILE)) return null;
  const source = readFileSync(SERVICE_FILE, "utf8");
  const block = /BRIDGED[^=]*=\s*\(([\s\S]*?)\n\)/.exec(source)?.[1] ?? "";
  return [...block.matchAll(/\("(hq\/product\/[^"]+)",\s*"(GET|POST)"\)/g)].map((match) => ({
    route: match[1]!,
    method: match[2]!,
  }));
}

function mockBridged(): Route[] {
  const source = readFileSync(resolve(process.cwd(), "scripts/mock-hq-api.ts"), "utf8");
  const block = /const PRODUCT_BRIDGED[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source)?.[1] ?? "";
  return [...block.matchAll(/\["(hq\/product\/[^"]+)",\s*"(GET|POST)"\]/g)].map((match) => ({
    route: match[1]!,
    method: match[2]!,
  }));
}

/** Every `admin/…` route the client names, as the `hq/product/…` route it becomes. */
function clientRoutes(): string[] {
  const source = readFileSync(resolve(process.cwd(), "src/lib/product/account-api.ts"), "utf8");
  const routes = new Set<string>();
  for (const match of source.matchAll(/[`"]admin\/([^`"*]+)[`"]/g)) {
    const path = match[1]!.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "{param}");
    routes.add(`hq/product/${path}`);
  }
  return [...routes];
}

const normalise = (route: string) => route.replace(/\{[a-z_]+\}/g, "{param}");
const service = serviceBridged();
const maybe = service === null ? describe.skip : describe;

if (service === null) {
  console.warn(`[product-bridge] service checkout not found at ${SERVICE_FILE}; parity skipped.`);
}

maybe("Product routes agree with the service's bridge", () => {
  const table = new Map((service ?? []).map((entry) => [normalise(entry.route), entry.method]));

  it("the service list was actually parsed", () => {
    expect(table.size).toBeGreaterThanOrEqual(25);
  });

  it("the mock bridges exactly the routes and methods the service does", () => {
    const mock = mockBridged().map((entry) => `${entry.method} ${normalise(entry.route)}`);
    const upstream = (service ?? []).map((entry) => `${entry.method} ${normalise(entry.route)}`);
    expect(mock.sort()).toEqual(upstream.sort());
  });

  it("every route the client names is bridged", () => {
    const routes = clientRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(20);
    for (const route of routes) {
      // `admin/secrets/${slot}${suffix}`: the slot, then nothing, /revoke or /restore.
      const expanded = route.endsWith("{param}{param}")
        ? ["", "/revoke", "/restore"].map((suffix) =>
            route.replace("{param}{param}", `{param}${suffix}`),
          )
        : [route];
      for (const each of expanded) {
        expect(table.has(each), `client calls ${each}, which the service does not bridge`).toBe(
          true,
        );
      }
    }
  });

  it("support is never bridged: HQ has its own desk", () => {
    expect([...table.keys()].filter((route) => route.startsWith("hq/product/support"))).toEqual([]);
  });
});

const calls = vi.hoisted(() => ({
  list: [] as { kind: string; route: string; options: unknown }[],
}));

vi.mock("@/lib/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/core")>();
  return {
    ...actual,
    fetchHqJson: vi.fn(async (route: string, _schema: unknown, options: unknown) => {
      calls.list.push({ kind: "GET", route, options });
      if (route === "hq/product/metrics") {
        throw new actual.HqApiRequestError(403, "forbidden", "corr-1", {
          required_capability: "metrics:read",
          reason: "product-role",
        });
      }
      throw new actual.HqApiUnavailableError("down");
    }),
    postHqJson: vi.fn(async (route: string, _schema: unknown, options: unknown) => {
      calls.list.push({ kind: "POST", route, options });
      throw new actual.HqApiUnavailableError("down");
    }),
  };
});

describe("the Product transport", () => {
  it("sends the console's admin route to hq/product with the staff member's HQ session", async () => {
    const api = await import("@/lib/product/account-api");
    calls.list.length = 0;
    const refused = await api
      .fetchAccountApiAdminMetrics("hq_token")
      .catch((error: unknown) => error);
    expect(calls.list[0]).toMatchObject({ kind: "GET", route: "hq/product/metrics" });
    expect(calls.list[0]!.options).toMatchObject({ token: "hq_token" });
    // HQ's refusal reaches the screens as the console's own error, details intact, so
    // every page keeps the messages it already had.
    expect(refused).toBeInstanceOf(api.AccountApiRequestError);
    expect(refused).toMatchObject({
      status: 403,
      code: "forbidden",
      correlationId: "corr-1",
      details: { required_capability: "metrics:read", reason: "product-role" },
    });
  });

  it("posts a change with its idempotency key, and an unreachable service is unavailable", async () => {
    const api = await import("@/lib/product/account-api");
    calls.list.length = 0;
    const userId = "9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33";
    const failed = await api
      .setAccountApiAdminUserRole("hq_token", userId, "support", { idempotencyKey: "key-1" })
      .catch((error: unknown) => error);
    expect(calls.list[0]).toMatchObject({ kind: "POST", route: `hq/product/users/${userId}/role` });
    expect(calls.list[0]!.options).toMatchObject({
      token: "hq_token",
      idempotencyKey: "key-1",
      body: { role: "support" },
    });
    expect(failed).toBeInstanceOf(api.AccountApiUnavailableError);
  });

  it("calls nothing without a session", async () => {
    const api = await import("@/lib/product/account-api");
    calls.list.length = 0;
    await expect(api.fetchAccountApiAdminMetrics("  ")).rejects.toBeInstanceOf(
      api.AccountApiUnavailableError,
    );
    expect(calls.list).toEqual([]);
  });
});
