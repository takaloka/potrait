// Manual browser proof of the real canvas exporter, fictional sample only.
import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const built=await build({configFile:false,logLevel:'error',build:{write:false,lib:{entry:path.resolve('lib/poster-download.ts'),name:'LokaExport',formats:['iife']}}});
const javascript=(Array.isArray(built)?built[0]:built).output.find(item=>item.type==='chunk').code;
const root=path.resolve('public');
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Fictional poster export proof</title><script src="/export.js"></script><main id="proof"></main>');}
 if(url.pathname==='/export.js'){res.setHeader('Content-Type','text/javascript');return res.end(javascript);}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{const bytes=await readFile(file);res.setHeader('Content-Type',({'.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1',()=>console.log(`EXPORT_PROOF_URL=http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM',()=>server.close());
