import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: { input: { main: "web/index.html", work: "web/work.html", kit: "web/kit.html" } },
  },
});
