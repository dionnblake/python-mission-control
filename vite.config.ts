import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true },
  clearScreen: false,
  optimizeDeps: { entries: ["index.html"] },
  build: { assetsInlineLimit: 0 },
  test: { include: ["src/**/*.test.ts"] },
});
