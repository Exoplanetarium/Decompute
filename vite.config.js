import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,   // pops the browser open automatically on `npm run dev`
    host: true,   // also reachable from your phone on the same wifi
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
