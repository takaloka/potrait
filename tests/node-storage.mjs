import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createNodeStorage} from '../server/node-storage.mjs';
const directory=await mkdtemp(path.join(tmpdir(),'loka-node-storage-'));
let store;
try{
 store=await createNodeStorage(directory);
 const {DB,BUCKET}=store;
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM photobooth_jobs').first()).n,0);
 await DB.prepare("INSERT INTO photobooth_budget(id,used) VALUES(1,0) ON CONFLICT DO NOTHING").run();
 await assert.rejects(DB.batch([DB.prepare('UPDATE photobooth_budget SET used=10 WHERE id=1'),DB.prepare('INSERT INTO missing_table(x) VALUES(1)')]));
 assert.equal(await DB.prepare('SELECT used FROM photobooth_budget WHERE id=1').first('used'),0,'batch rollback');
 const result=await DB.batch([DB.prepare('UPDATE photobooth_budget SET used=used+1 WHERE id=1'),DB.prepare('SELECT used FROM photobooth_budget WHERE id=1')]);
 assert.equal(result[0].meta.changes,1);assert.equal(result[1].results[0].used,1);
 const key=crypto.randomUUID()+'-result.jpg',bytes=Uint8Array.from([1,2,3]);
 await BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 assert.deepEqual(new Uint8Array(await (await BUCKET.get(key)).arrayBuffer()),bytes);
 assert.equal((await BUCKET.get(key)).httpMetadata.contentType,'image/jpeg');
 await assert.rejects(BUCKET.put('../escape',bytes));
 store.close();store=await createNodeStorage(directory);
 assert.equal(await store.DB.prepare('SELECT used FROM photobooth_budget WHERE id=1').first('used'),1,'database survives restart');
 assert.deepEqual(new Uint8Array(await (await store.BUCKET.get(key)).arrayBuffer()),bytes,'media survives restart');
 await store.BUCKET.delete(key);assert.equal(await store.BUCKET.get(key),null);
 await store.BUCKET.delete(key);
 console.log('PASS native storage: migrations, transactional rollback, metadata, media persistence, restart and path rejection.');
}finally{store?.close();await rm(directory,{recursive:true,force:true});}
