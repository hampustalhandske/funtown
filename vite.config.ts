import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [
    react(),
    {
      // The bundled Recursive font's OFL licence ships next to its files, as the licence asks.
      name: "font-licence",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "assets/Recursive-OFL.txt", source: readFileSync("node_modules/@fontsource-variable/recursive/LICENSE") });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: { input: { main: "web/index.html", work: "web/work.html", kit: "web/kit.html" } },
  },
});
