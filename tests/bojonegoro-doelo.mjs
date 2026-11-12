import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
const migrations = (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort();
for (const file of migrations.filter(f => f < '0007')) db.exec(await readFile(`drizzle/${file}`, 'utf8'));
db.exec("INSERT INTO photobooth_jobs(id,request_id,fingerprint,name,status,mode,is_sample,original_url,created_at,queued_at,poster_theme) VALUES('old','old','old','Existing','done','demo',1,'/samples/before.jpg',1,1,'kolase')");
for (const file of migrations.filter(f => f >= '0007')) db.exec(await readFile(`drizzle/${file}`, 'utf8'));
assert.doesNotThrow(() => db.exec("UPDATE photobooth_jobs SET poster_theme='bojonegoro-doelo' WHERE id='old'"), 'new theme accepted by migrated database');
assert.equal(db.prepare("SELECT name FROM photobooth_jobs WHERE id='old'").get().name, 'Existing');
assert.throws(() => db.exec("UPDATE photobooth_jobs SET poster_theme='unknown'"));
db.close();

const source = await readFile('lib/bojonegoro-art.ts', 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {bojonegoroSvg} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const print = bojonegoroSvg({name:'<script>Bad</script>',image:'/photo.jpg?x=" onload="bad',id:':r0:'});
assert.ok(print.includes('width="1200" height="1500"'));
assert.ok(print.includes('&lt;script&gt;'));
assert.ok(!print.includes('<script>') && !print.includes(' onload="bad'));
assert.ok(!print.includes('/art/nusantara/') && !print.includes('data-portrait-slot'));
assert.ok(print.includes('Genetik Bodjonegoro Doeloe'), 'exact user-requested footer');
assert.ok(print.includes('<mask') && print.includes('<clipPath'), 'stamp edge and arched photograph');
assert.ok(!/UNESCO|Mahabalipuram|JUNE|2024|FRIDAY/.test(print), 'reference labels are not reproduced');
const loading = bojonegoroSvg({name:'Waiting',image:'/private-original.jpg',portraitLoading:true});
assert.ok(!loading.includes('/private-original.jpg'), 'loading never displays original image');
for (const ratio of [9/16, 16/9, 4/3]) {
  const screen = bojonegoroSvg({name:'Guest',image:'',landscape:true,viewportRatio:ratio,liveSlots:true});
  const [,w,h] = screen.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(Math.abs(Number(w)/Number(h)-ratio)<0.0001, 'screen fills real viewport ratio');
  assert.ok(screen.includes('data-portrait-slot') && screen.includes('data-portrait-name'));
  assert.ok(!screen.includes('href=""'));
}
console.log('PASS Bojonegoro Doelo: database migration/retention, invalid theme rejection, escaped SVG, private loading, print and TV geometry.');
