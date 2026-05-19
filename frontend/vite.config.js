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
    // Only proxy actual API endpoints (with sub-paths)
    "/auth/google": "http://localhost:8000",
    "/auth/verify-otp": "http://localhost:8000",
    "/auth/resend-otp": "http://localhost:8000",
    "/auth/me": "http://localhost:8000",
    "/auth/logout": "http://localhost:8000",
    
    "/web-cr/filter-options": "http://localhost:8000",
    "/web-cr/ai-summary": "http://localhost:8000",
  "/app-cr/ai-summary": "http://localhost:8000",
  
  // OR use this single line that catches everything:
    
    "/d2c/overview": "http://localhost:8000",
    "/d2c/filter-options": "http://localhost:8000",
    
    "/app-cr/overview": "http://localhost:8000",
    "/app-cr/filter-options": "http://localhost:8000",
    
    "/chat/agent": "http://localhost:8000",
    "/chat/ask": "http://localhost:8000",
    "/chat/ask/stream": "http://localhost:8000",

    "/d2c-rto/overview": "http://localhost:8000",
    "/d2c-rto/ai-summary": "http://localhost:8000",

    "/promo/overview": "http://localhost:8000",
    "/promo/ai-summary": "http://localhost:8000",

    "/retention/overview": "http://localhost:8000",
    "/retention/ai-summary": "http://localhost:8000",
    
    "/dashboard": {
      target: "http://localhost:8000",
      changeOrigin: true,
    },

    // Supply chain — single prefix covers every sub-endpoint
    "/supply-chain": {
      target: "http://localhost:8000",
      changeOrigin: true,
    },
  },
},
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  base: "/",
});