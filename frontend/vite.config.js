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
    proxy: {
      // proxy API calls to FastAPI during development
      "/web-cr":    "http://localhost:8000",
      "/dashboard": "http://localhost:8000",
      "/chat":      { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "../static/app",
    emptyOutDir: true,
  },
  base: "/app/",
});