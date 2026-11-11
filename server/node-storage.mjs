import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync,chmodSync,existsSync} from 'node:fs';
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';

export function createNodeStorage(directory,{migrationsDirectory=path.resolve('drizzle')}={}) {
  if(!path.isAbsolute(directory))throw Error('LOKA_DATA_DIR must be absolute');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,'app.sqlite'),existing=existsSync(filename);
  const sqlite=new DatabaseSync(filename);
  chmodSync(filename,0o600);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS loka_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied=new Set(sqlite.prepare('SELECT name FROM loka_migrations').all().map(row=>row.name));
  const pending=readdirSync(migrationsDirectory).filter(name=>name.endsWith('.sql')&&!applied.has(name)).sort();
  if(existing&&pending.length){
    const backup=path.join(directory,`before-migration-${Date.now()}.sqlite`);
    sqlite.prepare('VACUUM INTO ?').run(backup);chmodSync(backup,0o600);
  }
  try{
    sqlite.exec('BEGIN IMMEDIATE');
    for(const name of pending){sqlite.exec(readFileSync(path.join(migrationsDirectory,name),'utf8'));sqlite.prepare('INSERT INTO loka_migrations VALUES(?,?)').run(name,Date.now());}
    sqlite.exec('COMMIT');
  }catch(error){sqlite.exec('ROLLBACK');sqlite.close();throw error;}
  sqlite.prepare("INSERT OR IGNORE INTO photobooth_settings(id,event_name,theme,accepting,paused,duration_seconds) VALUES(1,'Loka Portrait · Takaloka','Loka Studio',0,0,10)").run();

  class Prepared {
    constructor(sql,params=[]){this.sql=sql;this.params=params;}
    bind(...params){return new Prepared(this.sql,params);}
    execute(){
      const statement=sqlite.prepare(this.sql),started=performance.now();
      const results=statement.all(...this.params).map(row=>({...row}));
      const readonly=/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(this.sql);
      const changes=readonly?0:Number(sqlite.prepare('SELECT changes() AS n').get().n);
      return {success:true,results,meta:{changes,duration:performance.now()-started,last_row_id:Number(sqlite.prepare('SELECT last_insert_rowid() AS n').get().n)}};
    }
    async all(){return this.execute();}
    async run(){return this.execute();}
    async first(column){const row=this.execute().results[0]??null;return column&&row?row[column]:row;}
    async raw(){return this.execute().results.map(row=>Object.values(row));}
  }
  const DB={
    prepare:sql=>new Prepared(sql),
    async batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{const results=statements.map(statement=>statement.execute());sqlite.exec('COMMIT');return results;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
    async exec(sql){sqlite.exec(sql);return {count:1,duration:0};},
  };
  const photos=path.join(directory,'photos');mkdirSync(photos,{recursive:true,mode:0o700});
  function mediaPath(key){
    if(!/^[0-9a-f-]{36}-(original|result)\.(jpg|png|webp)$/i.test(key))throw Error('Invalid media key');
    return path.join(photos,key);
  }
  const mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const BUCKET={
    async put(key,value){
      const destination=mediaPath(key),temporary=`${destination}.${crypto.randomUUID()}.tmp`;
      const bytes=value instanceof ArrayBuffer||ArrayBuffer.isView(value)?Buffer.from(value instanceof ArrayBuffer?value:value.buffer,value.byteOffset??0,value.byteLength):Buffer.from(await new Response(value).arrayBuffer());
      try{await writeFile(temporary,bytes,{mode:0o600});await rename(temporary,destination);}finally{await rm(temporary,{force:true});}
      return {key,size:bytes.length};
    },
    async get(key){
      let bytes;try{bytes=await readFile(mediaPath(key));}catch(error){if(error.code==='ENOENT')return null;throw error;}
      const buffer=new Uint8Array(bytes);
      return {body:buffer,size:bytes.length,httpMetadata:{contentType:mime[key.split('.').at(-1)]},arrayBuffer:async()=>buffer.slice().buffer};
    },
    async delete(key){await rm(mediaPath(key),{force:true});},
  };
  return {DB,BUCKET,close:()=>sqlite.close()};
}
