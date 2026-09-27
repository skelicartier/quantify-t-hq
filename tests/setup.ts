import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

/**
 * A router every component test can render against.
 *
 * `useRouter` throws outside an app-router tree, so any component that keeps itself
 * current — anything using `LiveRefresh` — would take down every test that renders a page
 * containing one, for a reason that has nothing to do with what those tests check. A file
 * that cares about navigation still declares its own `vi.mock("next/navigation", …)`,
 * which replaces this one for that file.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
