import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/stream": "http://127.0.0.1:4777", "/events": "http://127.0.0.1:4777" } },
});
