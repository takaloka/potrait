import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
import sharp from "sharp";

const base = new URL("../public/art/nusantara/", import.meta.url);
const source = await readFile(new URL("../lib/nusantara-art.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { nusantaraSvg, NUSANTARA_ASSETS } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const assets = Object.fromEntries(await Promise.all(NUSANTARA_ASSETS.map(async key => [key, `data:image/png;base64,${(await readFile(new URL(`${key}.png`, base))).toString("base64")}`])));
const svg = nusantaraSvg({ name: "", image: "", assets });
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
for (const [name, body, width, height] of [
  ["background", '<rect width="1200" height="1500" fill="url(#nusantara-stripes)"/><rect width="1200" height="1500" fill="#fff" opacity=".07" filter="url(#nusantara-paper)"/>', 1200, 1500],
  ["wave-pattern", '<rect width="600" height="600" fill="url(#nusantara-waves)"/>', 600, 600],
]) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}${body}</svg>`)).png().toFile(new URL(`${name}.png`, base).pathname);
}
await sharp(Buffer.from(svg)).png().toFile(new URL("template-preview.png", base).pathname);
await writeFile(new URL("README.md", base), `# Nusantara layers\n\nGenerated reconstruction of the supplied reference; not the original source artwork.\n\n- top-left.png: coral flower cluster\n- top-right.png: pink orchid cluster\n- bottom-left.png: hanging foliage and orchid\n- bottom-right.png: orange/coral botanical cluster\n- window.png: transparent fanlight window and shutters\n- cloud.png: cream/mint cloud\n- background.png: 1200×1500 stripe/paper plate\n- wave-pattern.png: 600×600 turquoise repeat\n- template-preview.png: assembled blank portrait template\n\nPhoto and name are rendered dynamically by lib/nusantara-art.ts. The web screen animates separate floral/cloud groups. PNG downloads are static and share the same SVG geometry. Branding uses Loka Portrait; no Sarinah logo or social accounts are reproduced.\n`);
console.log("Rendered background, wave pattern and assembled template PNGs.");
