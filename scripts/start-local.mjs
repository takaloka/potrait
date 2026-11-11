import './sites-env.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCodexBackend } from '../server/codex-image-backend.mjs';
await import('./migrate-local.mjs');

const key = randomBytes(32).toString('hex');
const backend = createCodexBackend({ key });
await new Promise((resolve, reject) => { backend.once('error', reject); backend.listen(0, '127.0.0.1', resolve); });
const directory = await mkdtemp(path.join(tmpdir(), 'loka-codex-'));
const envFile = path.join(directory, '.env');
await writeFile(envFile, `CODEX_BACKEND_URL=http://127.0.0.1:${backend.address().port}\nCODEX_BACKEND_KEY=${key}\n`, { mode: 0o600 });
// Secrets are loaded from a private file, never CLI arguments or client bundles.
const child = spawn(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state', '--ip', '127.0.0.1', '--inspector-port', '0', '--env-file', envFile], { stdio: 'inherit' });
console.log('Local Codex Node backend enabled (loopback only).');
let stopping = false;
let ticking = false;
const tick = setInterval(async () => {
  if (ticking || stopping) return;
  ticking = true;
  try {
    const response=await fetch('http://127.0.0.1:8787/api/internal/tick',{method:'POST',headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(400000)});
    if(!response.ok) console.error('Background portrait worker returned',response.status);
  } catch { /* Preview may still be starting. Persisted jobs remain queued. */ }
  finally { ticking=false; }
},2000);
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  clearInterval(tick);
  child.kill('SIGTERM');
  backend.close(); backend.closeAllConnections();
  await rm(envFile, { force: true });
  await rmdir(directory).catch(() => {});
  process.exitCode = code;
}
child.on('exit', code => void stop(code ?? 1));
child.on('error', () => void stop(1));
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
