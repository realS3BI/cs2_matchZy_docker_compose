import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const publicUrl = process.env.DEV_PUBLIC_URL ? new URL(process.env.DEV_PUBLIC_URL) : undefined;

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss(), {
    name: "development-browser-url",
    configureServer(server) {
      if (process.env.DEV_PUBLIC_URL) {
        server.printUrls = () => server.config.logger.info(`  Browser: ${process.env.DEV_PUBLIC_URL}/`);
      }
    }
  }],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  },
  build: {
    outDir: "../build/dist",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.DEV_PORT || 5173),
    strictPort: true,
    allowedHosts: publicUrl ? [publicUrl.hostname] : [],
    hmr: publicUrl?.protocol === "https:" ? {
      protocol: "wss",
      host: publicUrl.hostname,
      clientPort: Number(publicUrl.port || 443)
    } : undefined,
    watch: process.env.DEV_USE_POLLING === "1" ? { usePolling: true } : undefined,
    proxy: {
      "/api": { target: process.env.DEV_API_URL || "http://127.0.0.1:8080", ws: true }
    }
  }
});
