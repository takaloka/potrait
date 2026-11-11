import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const original=await load('kolase-source-assets'),display=await load('kolase-display-assets');
for(const [key,uri] of Object.entries(original.kolaseSourceAssets)){
 const bytes=await readFile(new URL('../public'+display.kolaseSourceAssets[key],import.meta.url));
 assert.deepEqual(bytes,Buffer.from(uri.split(',')[1],'base64'),`${key}: unchanged approved pixels`);
}
const oldTemplate=await load('kolase-landscape-template'),newTemplate=await load('kolase-display-template');
let restored=newTemplate.kolaseLandscapeTemplate;
for(const [key,url] of Object.entries(display.kolaseSourceAssets))restored=restored.split(url).join(original.kolaseSourceAssets[key]);
restored=restored.split(display.kolaseSourceFont).join(`data:font/ttf;base64,${original.kolaseSourceFont}`);
assert.equal(restored,oldTemplate.kolaseLandscapeTemplate,'all SVG geometry and animation hooks preserved');
assert((await readFile(new URL('../lib/kolase-display-template.ts',import.meta.url))).length<20000);
console.log('PASS Kolase external assets: byte-identical artwork/font references and unchanged landscape geometry.');
