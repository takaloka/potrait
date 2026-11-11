import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/nusantara-art.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { nusantaraSvg } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const unsafe = '\"><script>alert(1)</script>&';
const svg = nusantaraSvg({ name: unsafe, image: '/api/media/photo.png?name=" onload="bad', id: ":r0:" });
assert.ok(!svg.includes("<script>"));
assert.ok(svg.includes("&lt;script&gt;"));
assert.ok(!svg.includes(' onload="bad'));
assert.ok(svg.includes('width="1200" height="1500"'));
assert.ok(!svg.includes('textLength=""'));
const wide = nusantaraSvg({ name: "A very long participant name that needs to stay inside the central frame", image: "", landscape: true });
for (const artwork of [svg, wide]) {
  assert.ok(artwork.includes('fill="#A64032"'), "vintage brick-red stripe");
  assert.ok(artwork.includes('fill="#B64D3D"'), "muted lighter-red stripe instead of pink");
  assert.ok(!artwork.includes('#e85b68') && !artwork.includes('#d53629'), "replace only the old stripe palette");
}
assert.ok(wide.includes('textLength="640"'));
assert.ok(wide.includes('width="1920" height="1080"'));
assert.ok(!wide.includes('href=""'));
assert.ok(nusantaraSvg({ name: "Cutout", image: "data:image/png;base64,AAAA", containPortrait: true }).includes('preserveAspectRatio="xMidYMax meet"'));
console.log("PASS: escaped participant/image strings, portrait/landscape sizes, long names, empty portrait, export cutout fit.");
