import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,symlink,readFile,readdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'loka-migrations-'));
try{
 for(const name of ['scripts','drizzle','node_modules','dist','.openai'])await symlink(path.join(root,name),path.join(temp,name));
 const dir=path.join(temp,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');await mkdir(dir,{recursive:true});
 const file=path.join(dir,'fixture.sqlite'),db=new DatabaseSync(file);
 for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')&&n<'0006').sort())db.exec(await readFile(path.join('drizzle',name),'utf8'));
 db.exec("INSERT INTO photobooth_jobs(id,request_id,fingerprint,name,status,mode,is_sample,original_url,created_at,queued_at) VALUES('fixture','request','fingerprint','Fictional','done','demo',1,'/samples/before.jpg',1,1)");db.close();
 for(let i=0;i<2;i++){const result=spawnSync(process.execPath,[path.join(root,'scripts/migrate-local.mjs')],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);}
 const migrated=new DatabaseSync(file);assert.equal(migrated.prepare('SELECT name FROM photobooth_jobs WHERE id=?').get('fixture').name,'Fictional');assert.equal(migrated.prepare('SELECT result_token,expires_at FROM photobooth_jobs WHERE id=?').get('fixture').expires_at,null);migrated.close();
 assert.equal((await readdir(path.join(temp,'.wrangler/backups'))).length,1,'idempotent rerun makes no extra backup');
 console.log('PASS migrations: existing records preserved, hardening schema applied, backup and idempotent rerun.');
}finally{await rm(temp,{recursive:true,force:true});}
