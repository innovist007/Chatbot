import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "unsafe-none",
    },
    proxy: {
      // Regex keys (^...) require a trailing slash so bare page paths like
      // /acquisition are NOT proxied — Vite falls back to index.html for SPA routing.
      "^/acquisition/":  { target: "http://localhost:8000", changeOrigin: true },
      "^/web-cr/":       { target: "http://localhost:8000", changeOrigin: true },
      "^/app-cr/":       { target: "http://localhost:8000", changeOrigin: true },
      "^/d2c-rto/":      { target: "http://localhost:8000", changeOrigin: true },
      "^/d2c/":          { target: "http://localhost:8000", changeOrigin: true },
      "^/promo/":        { target: "http://localhost:8000", changeOrigin: true },
      "^/retention/":    { target: "http://localhost:8000", changeOrigin: true },
      "^/d2c-overview/": { target: "http://localhost:8000", changeOrigin: true },
      "^/supply-chain/": { target: "http://localhost:8000", changeOrigin: true },
      "^/dashboard/":    { target: "http://localhost:8000", changeOrigin: true },
      "^/auth/":         { target: "http://localhost:8000", changeOrigin: true },
      "^/chat/":         { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  base: "/",
});
