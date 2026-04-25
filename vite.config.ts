import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Vercel serves us at the root of the (sub)domain — no base prefix needed.
  base: "/",
  server: {
    host: "::",
    // Honour PORT env var (preview/CI tools pass it). Falls back to 8080 locally.
    port: Number(process.env.PORT) || 8080,
    // Allow access via Tailscale tailnet domains and any localhost / .local
    // hostname so the dev server is reachable from the phone on the same VPN.
    // Leading-dot entries are subdomain wildcards in Vite.
    allowedHosts: [
      "localhost",
      ".local",
      ".ts.net",
      ".tailscale.net",
    ],
    fs: {
      allow: ["./client", "./shared", "./node_modules", "index.html"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
