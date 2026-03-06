import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default: node for pure unit tests.
    // Component tests override with @vitest-environment jsdom per file.
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    // React 19's `act` is only in the dev build; test env must be non-production.
    environmentOptions: {
      jsdom: { pretendToBeVisual: true },
    },
  },
  // Ensure React dev build loads in tests (act is not in production bundle)
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
});
