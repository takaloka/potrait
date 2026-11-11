import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const base = new URL("../public/art/nusantara/", import.meta.url);
const { data, info } = await sharp(new URL("floral-sheet.png", base).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const seen = new Uint8Array(info.width * info.height);
const parts = [];
for (let start = 0; start < seen.length; start++) {
  if (seen[start] || data[start * 4 + 3] < 48) continue;
  const pixels = [start]; seen[start] = 1;
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i], x = p % info.width, y = Math.floor(p / info.width);
    for (const q of [x > 0 ? p - 1 : -1, x < info.width - 1 ? p + 1 : -1, y > 0 ? p - info.width : -1, y < info.height - 1 ? p + info.width : -1]) {
      if (q >= 0 && !seen[q] && data[q * 4 + 3] >= 48) { seen[q] = 1; pixels.push(q); }
    }
  }
  if (pixels.length > 5000) parts.push(pixels);
}
parts.sort((a, b) => b.length - a.length);
if (parts.length !== 4) throw new Error(`Expected four separate botanical clusters; found ${parts.length}`);
const outputs = [];
for (const pixels of parts) {
  let left = info.width, top = info.height, right = 0, bottom = 0;
  const clean = Buffer.alloc(data.length);
  for (const p of pixels) {
    const x = p % info.width, y = Math.floor(p / info.width);
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    data.copy(clean, p * 4, p * 4, p * 4 + 4);
  }
  const name = `${top < 400 ? "top" : "bottom"}-${left < 300 ? "left" : "right"}.png`;
  await sharp(clean, { raw: info }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toFile(new URL(name, base).pathname);
  outputs.push({ name, left, top, width: right - left + 1, height: bottom - top + 1 });
}
await writeFile(new URL("provenance.json", base), JSON.stringify({ source: "User-supplied reference fee700b358d7e0477e148e7e376b5425.jpg", method: "AI-generated reconstruction; not recovered original layers. Transparent flower clusters isolated by alpha connected components.", assets: outputs }, null, 2));
console.log(outputs);
