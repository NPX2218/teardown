import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/*" → repo root mapping as tsconfig.json "paths".
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // The real package throws outside a React Server Component. Tests import those modules in Node.
      "server-only": fileURLToPath(new URL("./lib/fixtures/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts", "lib/__tests__/**/*.test.tsx"],
    css: true,
  },
});
