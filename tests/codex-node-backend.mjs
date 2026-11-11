import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
const modulePath = new URL('../server/codex-image-backend.mjs', import.meta.url);
assert.ok(existsSync(modulePath), 'Node image backend must exist');
const { createCodexBackend } = await import(modulePath);
const key = 'fixture-service-key-'.repeat(3);
let calls=0, mode='ok', release;
const upstream = async (url, init) => {
  calls++;
  assert.equal(url,'https://chatgpt.com/backend-api/codex/images/edits');
  assert.equal(init.headers.Authorization,'Bearer fixture-access');
  assert.equal(init.headers['chatgpt-account-id'],'fixture-account');
  assert.equal(init.headers.originator,'opencode');
  assert.equal(init.headers['x-backend-key'],undefined);
  assert.equal(init.redirect,'manual');
  assert.equal(init.headers['Content-Type'],'application/json');
  const form=JSON.parse(init.body);
  assert.equal(form.prompt,'beskap'); assert.equal(form.model,'gpt-image-2');
  assert.equal(form.images[0].image_url,'data:image/jpeg;base64,cGhvdG8=');
  assert.equal(form.n,1); assert.equal(form.stream,true); assert.equal(form.partial_images,0);
  if(mode==='redirect')return new Response(null,{status:302,headers:{Location:'https://other.example/'}});
  if(mode==='error')throw new Error('fixture-access private-provider-detail');
  if(mode==='wait')await new Promise(resolve=>{release=resolve;});
  return new Response('event: image_edit.completed\ndata: {"b64_json":"fixture"}\n\n',{headers:{'Content-Type':'text/event-stream','Set-Cookie':'private-cookie'}});
};
const server=createCodexBackend({key,fetchImpl:upstream,maxBodyBytes:2048,maxConcurrent:1});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
function send(headers={},body){
  const form=new FormData();form.set('model','gpt-image-2');form.set('prompt','beskap');form.set('image[]',new Blob(['photo'],{type:'image/jpeg'}),'photo.jpg');
  return fetch(base+'/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`,'x-codex-access-token':'fixture-access','x-codex-account-id':'fixture-account',...headers},body:body??form});
}
try{
  const normal=await sharp({create:{width:120,height:150,channels:3,background:'#abcdef'}}).png().toBuffer();
  const normalize=(body,auth=`Bearer ${key}`)=>fetch(base+'/images/normalize',{method:'POST',headers:{Authorization:auth,'Content-Type':'image/png'},body});
  assert.equal((await normalize(normal,'Bearer wrong')).status,401);
  assert.equal((await normalize(Buffer.from([137,80,78,71,13,10,26,10]))).status,422);
  const valid=await normalize(normal);assert.equal(valid.status,200);
  const normalized=await sharp(Buffer.from(await valid.arrayBuffer())).metadata();assert.equal(normalized.format,'jpeg');assert.equal(normalized.width,120);assert.equal(normalized.exif,undefined);
  assert.equal((await send({Authorization:'Bearer wrong'})).status,401);
  assert.equal((await send({Origin:'https://other.example'})).status,403);
  assert.equal((await fetch(base+'/images/edits')).status,405);
  assert.equal((await fetch(base+'/arbitrary')).status,404);
  assert.equal(calls,0,'invalid requests never reach upstream');
  assert.equal((await send({'Content-Type':'text/plain'},'x')).status,415);
  assert.equal((await send({'x-codex-access-token':''})).status,400);
  assert.equal((await send({'Content-Type':'multipart/form-data; boundary=test'},'x'.repeat(2050))).status,413);
  const response=await send();assert.equal(response.status,200);assert.match(await response.text(),/image_edit.completed/);
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('access-control-allow-origin'),null);
  mode='redirect';assert.equal((await send()).status,502);
  mode='error';const failed=await send();assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/fixture-access|private-provider/);
  mode='wait';const waiting=send();while(!release)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await send()).status,503);release();assert.equal((await waiting).status,200);
  console.log('PASS Node backend: auth, origin/method/path restrictions, payload limits, multipart/credential forwarding, stream, redirects, sanitized failures and concurrency (fixture upstream).');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
