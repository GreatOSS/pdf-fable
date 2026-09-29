// Copies the PDF.js runtime assets (CMaps, standard fonts, wasm decoders,
// ICC profiles, annotation icons) into public/pdfjs so the app can serve them.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");
const dirs = [
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
  ["iccs", "iccs"],
  ["web/images", "images"],
];
mkdirSync(dest, { recursive: true });
for (const [from, to] of dirs) {
  const s = join(src, from);
  if (!existsSync(s)) { console.warn(`skip missing ${s}`); continue; }
  cpSync(s, join(dest, to), { recursive: true });
}
console.log("pdf.js assets copied to public/pdfjs");
