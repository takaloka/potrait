import {createNodeStorage} from './node-storage.mjs';
const key=Symbol.for('loka.native.storage');
function storage(){
  if(!globalThis[key])globalThis[key]=createNodeStorage(process.env.LOKA_DATA_DIR||'');
  return globalThis[key];
}
// Server-only alias for the binding import. No credential is serialized to clients.
export const env=new Proxy({}, {get(_target,name){
  if(name==='DB'||name==='BUCKET')return storage()[name];
  return process.env[name];
}});
