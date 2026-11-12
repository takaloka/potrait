import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createServer} from 'node:http';
import path from 'node:path';
const participant=process.env.FOLLOW_PROOF==='1';
const built=await build({configFile:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[react()],resolve:{alias:{'@':process.cwd()}},logLevel:'error',build:{write:false,lib:{entry:path.resolve(participant?'tests/participant-follow-browser.tsx':'tests/operator-theme-browser.tsx'),name:'OperatorProof',formats:['iife']}}});
const output=(Array.isArray(built)?built[0]:built).output;
const js=output.find(item=>item.type==='chunk').code;
const css=output.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>item.source).join('\n');
createServer((req,res)=>{
  if(req.url==='/proof.js'){res.setHeader('Content-Type','text/javascript');return res.end(js);}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Operator theme fixture</title><style>'+css+'</style></head><body><div id="root"></div><script src="/proof.js"></script></body></html>');
}).listen(participant?3052:3051,'127.0.0.1',()=>console.log('Local browser fixture; fictional state, no generation.'));
