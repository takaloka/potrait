import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
const image=await readFile(new URL('../public/samples/before.jpg',import.meta.url));
let redirects=false,calls=0;
const server=createServer((req,res)=>{
 calls++;
 if(redirects){res.writeHead(302,{Location:'/forbidden'});return res.end();}
 if(req.url==='/image'){res.writeHead(200,{'Content-Type':'image/jpeg'});return res.end(image);}
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify(req.method==='POST'?{id:'fixture',polling_url:'https://api.bfl.ai/poll'}:{status:'Ready',result:{sample:'https://api.bfl.ai/image'}}));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const source=ts.transpileModule(await readFile(new URL('../lib/ai-provider.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const worker=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:`const fetch=(url,init)=>globalThis.fetch(${JSON.stringify(origin)}+new URL(url).pathname,init);${source}
export default {async fetch(){try{const task=await submitAiPortrait(getAiConfig({AI_MODE:'live',BFL_API_KEY:'fixture'}),new Uint8Array(20),'beskap');const result=await pollAiPortrait(task.pollingUrl);return Response.json({status:result.status,length:result.bytes?.length});}catch(e){return Response.json({error:e.message},{status:502});}}}`});
try{
 const response=await worker.dispatchFetch('https://fixture.invalid');const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,{status:'ready',length:image.length});assert.equal(calls,3);
 redirects=true;const before=calls;assert.equal((await worker.dispatchFetch('https://fixture.invalid')).status,502);assert.equal(calls,before+1,'redirect never followed');
 console.log('PASS BFL workerd: real fetch submit/poll/image and redirect rejection, local upstream only.');
}finally{await worker.dispose();await new Promise(r=>server.close(r));}
