import {spawnSync} from 'node:child_process';
const suites=['node-storage','ai-provider','bfl-worker','chatgpt-callback','chatgpt-connection','codex-connection','codex-node-backend','chatgpt-worker','operator-auth','nusantara-art','kolase-assets','portrait-water-loading','release-hardening','migrations'];
const commands=[...suites.map(name=>[`tests/${name}.mjs`]),...['','persibo-v2','chatgpt','styles','slideshow','delete','screen-public'].map(name=>['tests/photobooth-offline.mjs',...(name?[name]:[])]),['--experimental-strip-types','--test','tests/photobooth-client.test.mjs']];
let failures=0;
for(const args of commands){console.log(`\nTesting ${args.join(' ')}`);const result=spawnSync(process.execPath,args,{stdio:'inherit',timeout:120000});if(result.status!==0){failures++;console.error('FAILED',args.join(' '));}}
if(failures)process.exitCode=1;
console.log(`${commands.length-failures}/${commands.length} suites passed.`);
