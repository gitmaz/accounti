import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": path.resolve(__dirname, "../shared") } },
  server: {
    port: 3060,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3061", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
