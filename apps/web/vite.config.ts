import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Compose sets 0.0.0.0, so the server is reachable from outside the
    // container.
    host: process.env.WEB_HOST ?? "localhost",
    // The API runs on 3000 (`pnpm dev:api`). Same origin in the browser, so no
    // CORS.
    proxy: { "/api": "http://localhost:3000" },
    // The sample case is loaded from fixtures/, outside this package.
    fs: { allow: [repoRoot] },
  },
});
