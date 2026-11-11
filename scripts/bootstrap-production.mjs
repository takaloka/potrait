// Provision only the salted operator password hash; never OAuth/jobs/sessions.
import {DatabaseSync} from 'node:sqlite';
import {readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--production'))throw Error('Run with --production after configuring the target and creating the operator locally.');
const folder='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const accounts=[];
for(const file of await readdir(folder)){
 if(!file.endsWith('.sqlite')||file==='metadata.sqlite')continue;
 const db=new DatabaseSync(path.join(folder,file),{readOnly:true});
 try{const account=db.prepare('SELECT salt,password_hash FROM operator_account WHERE id=1').get();if(account)accounts.push(account);}catch{}finally{db.close();}
}
if(accounts.length!==1)throw Error('Exactly one configured local operator account is required.');
const {salt,password_hash:hash}=accounts[0];
if(!/^[a-f0-9-]{36}$/.test(salt)||!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid local operator hash');
const folderName=await mkdtemp(path.join(tmpdir(),'loka-bootstrap-'));
try{
 const file=path.join(folderName,'operator.sql');
 await writeFile(file,`INSERT OR IGNORE INTO operator_account(id,salt,password_hash) VALUES(1,'${salt}','${hash}');`,{mode:0o600});
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','wrangler.production.jsonc','--file',file],{stdio:'inherit'});
 if(result.status!==0)throw Error('Operator provisioning failed');
}finally{await rm(folderName,{recursive:true,force:true});}
