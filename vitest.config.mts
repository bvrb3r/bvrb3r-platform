import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const projectRoot = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    env: {
      TZ: "America/New_York"
    },
    globals: true,
    setupFiles: "./vitest.setup.ts"
  },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "."),
      "server-only": path.resolve(projectRoot, "tests/stubs/server-only.ts")
    }
  }
});
