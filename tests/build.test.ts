import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { build } from "vite";

test("the_built_dist_holds_the_fonts_ofl_licence_in_the_folder_of_the_font_files", async () => {
  const out = mkdtempSync(join(tmpdir(), "funtown-build-"));
  const root = fileURLToPath(new URL("..", import.meta.url));
  await build({ configFile: join(root, "vite.config.ts"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  const dirs = [out, join(out, "assets")];
  const withFonts = dirs.filter((d) => readdirSync(d).some((f) => /recursive.*\.woff2?$/i.test(f)));
  expect(withFonts.length).toBeGreaterThan(0);
  const licences = withFonts.flatMap((d) =>
    readdirSync(d).filter((f) => /\.(txt|md)$|licen[cs]e/i.test(f) && /SIL OPEN FONT LICENSE/i.test(readFileSync(join(d, f), "utf8"))),
  );
  expect(licences.length).toBeGreaterThan(0);
}, 180_000);
