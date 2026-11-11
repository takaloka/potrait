import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createCodexBackend} from '../server/codex-image-backend.mjs';
import {createNodeStorage} from '../server/node-storage.mjs';

const data=process.env.LOKA_DATA_DIR;
if(!data)throw Error('LOKA_DATA_DIR is required');
const migrated=createNodeStorage(data);migrated.close();
const port=Number(process.env.PORT||8791);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT');
const key=randomBytes(32).toString('hex'),backend=createCodexBackend({key});
await new Promise((resolve,reject)=>{backend.once('error',reject);backend.listen(0,'127.0.0.1',resolve);});
const child=spawn(process.execPath,['node_modules/vinext/dist/cli.js','start','--hostname','127.0.0.1','--port',String(port)],{
  stdio:'inherit',
  env:{...process.env,NODE_ENV:'production',LOKA_RUNTIME:'node',CODEX_BACKEND_URL:`http://127.0.0.1:${backend.address().port}`,CODEX_BACKEND_KEY:key},
});
let stopping=false,ticking=false;
const timer=setInterval(async()=>{
  if(stopping||ticking)return;ticking=true;
  try{const result=await fetch(`http://127.0.0.1:${port}/api/internal/tick`,{method:'POST',headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(400000)});if(!result.ok)console.error(JSON.stringify({event:'tick_failed',status:result.status}));}
  catch(error){if(!stopping)console.error(JSON.stringify({event:'tick_unavailable',error:error.name}));}
  finally{ticking=false;}
},2000);
function stop(){if(stopping)return;stopping=true;clearInterval(timer);child.kill('SIGTERM');backend.closeAllConnections();backend.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.once('error',error=>{console.error(error);stop();process.exitCode=1;});
child.once('exit',code=>{stop();process.exitCode=code??1;});
