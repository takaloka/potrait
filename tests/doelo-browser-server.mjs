import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const built=await build({configFile:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[react()],resolve:{alias:{'@':process.cwd()}},logLevel:'error',build:{write:false,lib:{entry:path.resolve('tests/doelo-browser.tsx'),name:'DoeloProof',formats:['iife']}}});
const js=(Array.isArray(built)?built[0]:built).output.find(item=>item.type==='chunk').code;
const css=await readFile('app/nusantara.css','utf8');
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/') {res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Doelo fictional fixture</title><style>html,body{margin:0}*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}'+css+'</style><div id="root"></div><script src="/proof.js"></script>');}
  if(url.pathname==='/proof.js'){res.setHeader('Content-Type','text/javascript');return res.end(js);}
  if(url.pathname==='/grid') {res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Doelo print and portrait TV proof</title><body style="margin:10px;background:#e5e2dc;font:13px Georgia;display:flex;gap:18px"><section><p>Preview / PNG (4:5)</p><iframe src="/?view=print" style="border:0;width:280px;height:350px"></iframe></section><section><p>TV portrait (9:16)</p><div style="width:197px;height:350px;overflow:hidden"><iframe src="/" style="border:0;width:1080px;height:1920px;transform:scale(.18229);transform-origin:top left"></iframe></div></section>');}
  const file=path.resolve('public','.'+url.pathname);
  if(!file.startsWith(path.resolve('public')+path.sep)){res.writeHead(403);return res.end();}
  try{const bytes=await readFile(file);res.setHeader('Content-Type',path.extname(file)==='.jpg'?'image/jpeg':'image/png');res.end(bytes);}catch{res.writeHead(404);res.end();}
}).listen(3049,'127.0.0.1',()=>console.log('Doelo browser fixture: http://127.0.0.1:3049/grid (fictional photo, mocked API)'));
