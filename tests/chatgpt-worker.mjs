// Exercise actual workerd Fetch behavior; Node mocks cannot validate RequestInit support.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
import {createCodexBackend} from '../server/codex-image-backend.mjs';
let refreshes=0, edits=0, redirected=0, redirectModels=false, mainline=false;
const photo=await readFile(new URL('../public/samples/before.jpg',import.meta.url));
const server=createServer((req,res)=>{
  req.resume();
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/accounts/oauth/token'){refreshes++;res.end(JSON.stringify({access_token:'fixture-rotated',expires_in:3600}));}
  else if(req.url==='/api/accounts/deviceauth/usercode')res.end(JSON.stringify({device_auth_id:'fixture-device',user_code:'TEST-CODE',interval:'5'}));
  else if(req.url==='/api/accounts/deviceauth/token')res.end(JSON.stringify({authorization_code:'fixture-code',code_verifier:'fixture-verifier'}));
  else if(req.url==='/oauth/token')res.end(JSON.stringify({access_token:'fixture-codex',refresh_token:'fixture-codex-refresh',expires_in:3600}));
  else if(req.url==='/codex/images/edits'){
    edits++;res.setHeader('Content-Type','text/event-stream');
    res.end(`event: image_edit.completed\ndata: ${JSON.stringify({type:'image_edit.completed',b64_json:photo.toString('base64'),output_format:'jpeg'})}\n\n`);
  }
  else if(req.url==='/v1/models'){
    if(redirectModels){res.writeHead(302,{Location:'/redirect-target'});res.end('{}');}
    else res.end(JSON.stringify({data:[{id:mainline?'gpt-6-astra':'gpt-image-1'}]}));
  } else if(req.url==='/v1/images/edits'){edits++;res.end(JSON.stringify({data:[{b64_json:photo.toString('base64')}]}));}
  else if(req.url==='/v1/responses'){
    edits++;res.setHeader('Content-Type','text/event-stream');
    res.end(`event: response.completed\ndata: ${JSON.stringify({type:'response.completed',response:{output:[{type:'image_generation_call',status:'completed',result:photo.toString('base64')}]}})}\n\n`);
  }
  else if(req.url==='/redirect-target'){redirected++;res.end('{}');}
  else res.end('{}');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const backendKey='fixture-service-key'.repeat(3);
let backendCalls=0;
const backend=createCodexBackend({key:backendKey,fetchImpl:async(url,init)=>{backendCalls++;assert.equal(init.headers.Authorization,'Bearer fixture-codex');return fetch(`${origin}/codex/images/edits`,init);}});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const source=(await readFile(new URL('../lib/chatgpt-connection.ts',import.meta.url),'utf8')).replaceAll('https://auth.openai.com',origin).replaceAll('https://api.openai.com/v1',`${origin}/v1`).replaceAll('https://chatgpt.com/backend-api/codex',`${origin}/codex`);
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{CODEX_BACKEND_URL:`http://127.0.0.1:${backend.address().port}`,CODEX_BACKEND_KEY:backendKey},script:compiled+`
export default {async fetch(request, env){try{
 const connection=new ChatgptConnection(env.DB,env);
  const action=new URL(request.url).pathname;
  if(action==='/connect')return Response.json(await connection.beginCodex());
  if(action==='/poll')return Response.json(await connection.pollCodex());
 if(action==='/edit') return Response.json({bytes:(await connection.edit(new Uint8Array([1,2,3]),'image/jpeg','vintage portrait')).length});
 return Response.json(await connection.check());
}catch(error){return Response.json({name:error.name,message:error.message},{status:503});}}};`});
try{
 const db=await mf.getD1Database('DB');
 await db.exec('CREATE TABLE photobooth_jobs (id TEXT PRIMARY KEY)');
 const migration=await readFile(new URL('../drizzle/0003_chatgpt_connection.sql',import.meta.url),'utf8');
 for(const sql of migration.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.prepare('INSERT INTO chatgpt_connection (id,host_id,selected,session_json) VALUES (1,?,?,?)').bind('fixture-host',1,JSON.stringify({access_token:'fixture-expired',refresh_token:'fixture-refresh',client_id:'fixture-client',expires_at:0,scopes:['chatgpt.tokens.use.direct'],model:null,verified:false})).run();
 const checked=await mf.dispatchFetch('http://app.test/check');
 const result=await checked.json();
 assert.equal(checked.status,200,JSON.stringify(result));
 assert.equal(result.model,'gpt-image-1');assert.equal(refreshes,1);
 const edited=await mf.dispatchFetch('http://app.test/edit');
 assert.equal(edited.status,200,await edited.clone().text());assert.equal((await edited.json()).bytes,photo.length);assert.equal(edits,1);
 redirectModels=true;
 assert.equal((await mf.dispatchFetch('http://app.test/check')).status,503);
  assert.equal(redirected,0,'never forward credentials by following provider redirects');
  redirectModels=false;mainline=true;
  assert.equal((await (await mf.dispatchFetch('http://app.test/check')).json()).model,'gpt-6-astra');
  const generated=await mf.dispatchFetch('http://app.test/edit');
  assert.equal(generated.status,200,await generated.clone().text());
  assert.equal((await generated.json()).bytes,photo.length);assert.equal(edits,2);
  const device=await mf.dispatchFetch('http://app.test/connect');
  assert.equal(device.status,200,await device.clone().text());
  assert.equal((await device.json()).pending.userCode,'TEST-CODE');
  await db.prepare("UPDATE chatgpt_connection SET pending_json = json_set(pending_json, '$.nextPoll', 0)").run();
  const poll=await mf.dispatchFetch('http://app.test/poll');
  assert.equal(poll.status,200,await poll.clone().text());assert.equal((await poll.json()).method,'codex');
  const portrait=await mf.dispatchFetch('http://app.test/edit');
  assert.equal(portrait.status,200,await portrait.clone().text());
  assert.equal((await portrait.json()).bytes,photo.length);assert.equal(edits,3);
  assert.equal(backendCalls,1,'workerd image edit passed through authenticated Node transport');
  console.log('PASS workerd: Codex device login/D1 CAS/streamed image edits, legacy refresh and redirect rejection; local HTTP provider fixture only.');
}finally{await mf.dispose();backend.closeAllConnections();backend.close();server.close();}
