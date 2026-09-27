import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // A fixed non-UTC timezone, on purpose. Every timezone bug this codebase has had was
    // invisible at UTC — a datetime-local field whose value was relabelled rather than
    // converted round-tripped perfectly until somebody ran the console from India, where a
    // notice published now was stored five and a half hours ahead and read SCHEDULED. CI
    // runs at UTC by default, which is exactly where such a bug survives.
    env: { TZ: "Asia/Kolkata" },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
