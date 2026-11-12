import {DatabaseSync,backup} from 'node:sqlite';
import {readdir,readFile,mkdir,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
// Invoke only before starting Wrangler: never change its open SQLite database.
const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
async function findDatabase() {
let databasePath;
for(const file of await readdir(folder).catch(()=>[])){
 if(!file.endsWith('.sqlite')||file==='metadata.sqlite')continue;
 const p=path.join(folder,file),db=new DatabaseSync(p,{readOnly:true});
 const found=db.prepare("SELECT name FROM sqlite_master WHERE name='photobooth_jobs'").get();db.close();
 if(found){if(databasePath)throw Error('More than one local application DB; select manually.');databasePath=p;}
}
return databasePath;
}
let databasePath=await findDatabase();
if(!databasePath){
 const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--file','drizzle/0000_soft_zaladane.sql'],{stdio:'inherit'});
 if(r.status!==0)throw Error('Initial database setup failed');
 databasePath=await findDatabase();
 if(!databasePath)throw Error('Created database could not be located');
}
const db=new DatabaseSync(databasePath);
const table=name=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
const column=name=>db.prepare('PRAGMA table_info(photobooth_jobs)').all().some(c=>c.name===name);
const present={
 '0008_event_theme_policy.sql':db.prepare('PRAGMA table_info(photobooth_settings)').all().some(c=>c.name==='theme_policy'),
 '0000_soft_zaladane.sql':table('photobooth_jobs'),
 '0001_operator_access.sql':table('operator_account'),
 '0002_portrait_style.sql':column('portrait_style'),
 '0003_chatgpt_connection.sql':table('chatgpt_connection'),
 '0004_poster_theme.sql':column('poster_theme'),
 '0005_kolase_portrait_styles.sql':db.prepare("SELECT sql FROM sqlite_master WHERE name='photobooth_jobs'").get().sql.includes('retro-festival'),
  '0006_release_hardening.sql':column('result_token')&&table('photobooth_cleanup'),
  '0007_bojonegoro_doelo.sql':db.prepare("SELECT sql FROM sqlite_master WHERE name='photobooth_jobs'").get().sql.includes('bojonegoro-doelo'),
};
try{
 const pending=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')&&!present[f]);
 if(pending.length){
  await mkdir('.wrangler/backups',{recursive:true,mode:0o700});
  const saved=`.wrangler/backups/before-migration-${Date.now()}.sqlite`;
  await backup(db,saved);await chmod(saved,0o600);
  console.log('Private pre-migration backup saved under .wrangler/backups');
 }
 db.exec('BEGIN IMMEDIATE');
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
  if(present[file])continue;
  db.exec(await readFile(path.join('drizzle',file),'utf8'));console.log('Applied local migration:',file);
 }
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
