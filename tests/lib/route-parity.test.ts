import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The client, the mock and the service must agree on the route table, or the mock
 * certifies flows the service refuses — which has happened, and is why this test
 * exists in the console and is kept here.
 *
 * The service's table is read from the sibling checkout of the product repo
 * (`account_api/hq/routes.py`). When that checkout is absent (CI clones one repo),
 * the comparison is skipped loudly rather than passed silently.
 */

const SERVICE_ROUTES_FILE = resolve(
  process.cwd(),
  "../Quantify Terminal/cloud/azure/account_function/account_api/hq/routes.py",
);

type ServiceRoute = { route: string; method: string };

function serviceTable(): ServiceRoute[] | null {
  if (!existsSync(SERVICE_ROUTES_FILE)) return null;
  const source = readFileSync(SERVICE_ROUTES_FILE, "utf8");
  const entries: ServiceRoute[] = [];
  const pattern = /"((?:hq|public)\/[^"]+)":\s*_(anonymous|authenticated)\(\s*"(GET|POST)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ route: match[1]!, method: match[3]! });
  }
  return entries;
}

function clientRoutes(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const apiDir = resolve(process.cwd(), "src/lib/api");
  for (const name of readdirSync(apiDir)) {
    if (!name.endsWith(".ts")) continue;
    const source = readFileSync(join(apiDir, name), "utf8");
    const fetchPattern = /fetchHqJson(?:<[^>]*>)?\(\s*[`"]((?:hq|public)\/[^`"$]+)[`"]/g;
    const postPattern = /postHqJson(?:<[^>]*>)?\(\s*[`"]((?:hq|public)\/[^`"$]+)[`"]/g;
    let match: RegExpExecArray | null;
    while ((match = fetchPattern.exec(source)) !== null) {
      const methods = found.get(match[1]!) ?? new Set<string>();
      methods.add("GET");
      found.set(match[1]!, methods);
    }
    while ((match = postPattern.exec(source)) !== null) {
      const methods = found.get(match[1]!) ?? new Set<string>();
      methods.add("POST");
      found.set(match[1]!, methods);
    }
  }
  return found;
}

function mockRoutes(): ServiceRoute[] {
  const source = readFileSync(resolve(process.cwd(), "scripts/mock-hq-api.ts"), "utf8");
  const entries: ServiceRoute[] = [];
  const pattern = /method:\s*"(GET|POST)",\s*pattern:\s*"((?:hq|public)\/[^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ route: match[2]!, method: match[1]! });
  }
  return entries;
}

const table = serviceTable();
const maybe = table === null ? describe.skip : describe;

if (table === null) {
  console.warn(
    `[route-parity] service checkout not found at ${SERVICE_ROUTES_FILE}; parity skipped.`,
  );
}

maybe("route parity with the service table", () => {
  const service = new Map((table ?? []).map((entry) => [entry.route, entry.method]));

  it("the service table was actually parsed", () => {
    expect(service.size).toBeGreaterThanOrEqual(20);
  });

  it("every literal route the client calls exists upstream with that method", () => {
    for (const [route, methods] of clientRoutes()) {
      const upstream = service.get(route);
      expect(upstream, `client calls ${route} which the service does not register`).toBeDefined();
      for (const method of methods) {
        expect(method, `client uses ${method} ${route}; the service says ${upstream}`).toBe(
          upstream,
        );
      }
    }
  });

  it("the mock never serves a route or method the service refuses", () => {
    for (const entry of mockRoutes()) {
      const upstream = service.get(entry.route);
      expect(
        upstream,
        `mock serves ${entry.route} which the service does not register`,
      ).toBeDefined();
      expect(
        entry.method,
        `mock serves ${entry.method} ${entry.route}; the service says ${upstream}`,
      ).toBe(upstream);
    }
  });
});
