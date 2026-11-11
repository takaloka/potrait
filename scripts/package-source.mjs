import {mkdir,cp,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const temp=await mkdtemp(path.join(tmpdir(),'loka-source-'));
const allow=['app','components','hooks','lib','db','drizzle','server','worker','scripts','tests','public','vendor','.github','.openai','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','vite.config.ts','postcss.config.mjs','eslint.config.mjs','cloudflare-env.d.ts','components.json','drizzle.config.ts','wrangler.production.jsonc','.gitignore','.dockerignore','README.md','THIRD_PARTY_NOTICES.md'];
try{
 const root=path.join(temp,'loka-portrait');await mkdir(root);
 for(const file of allow)await cp(file,path.join(root,file),{recursive:true,filter:source=>!/(^|\/)\.DS_Store$/.test(source)});
 await mkdir(path.join(root,'docs'));
 for(const file of ['deployment.md','codex-node-backend.md','release-status.md'])await cp(`docs/${file}`,path.join(root,'docs',file));
 await mkdir('release',{recursive:true});
 const result=spawnSync('tar',['-czf',path.resolve('release/loka-portrait-source.tar.gz'),'-C',temp,'loka-portrait'],{stdio:'inherit'});
 if(result.status!==0)throw Error('Source archive failed');
 console.log('Created release/loka-portrait-source.tar.gz from an explicit source allowlist. Asset permission gaps remain documented in THIRD_PARTY_NOTICES.md.');
}finally{await rm(temp,{recursive:true,force:true});}
