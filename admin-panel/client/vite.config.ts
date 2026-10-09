import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const archiveAssets = ["worker-bundle.js", "libarchive.wasm"].map(name => ({
  name, source: readFileSync(require.resolve(`libarchive.js/dist/${name}`)),
}));

const publicUrl = process.env.DEV_PUBLIC_URL ? new URL(process.env.DEV_PUBLIC_URL) : undefined;

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss(), {
    name: "archive-worker-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const asset = archiveAssets.find(asset => req.url?.split("?")[0] === `/archive/${asset.name}`);
        if (!asset) return next();
        res.setHeader("Content-Type", asset.name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(asset.source);
      });
    },
    generateBundle() {
      for (const asset of archiveAssets) this.emitFile({ type: "asset", fileName: `archive/${asset.name}`, source: asset.source });
    },
  }, {
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
    host: process.env.DEV_HOST || "0.0.0.0",
    port: Number(process.env.DEV_PORT || 5173),
    strictPort: true,
    allowedHosts: publicUrl ? [publicUrl.hostname] : [],
    hmr: publicUrl?.protocol === "https:" ? {
      protocol: "wss",
      host: publicUrl.hostname,
      clientPort: Number(publicUrl.port || 443)
    } : undefined,
    proxy: {
      "/api": { target: process.env.DEV_API_URL || "http://127.0.0.1:8080", ws: true }
    }
  }
});
