import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Fixed-purpose transport, not an open proxy. OAuth tokens/images live only in
// the request's memory. No retries: a lost response may still have consumed quota.
export function createCodexBackend({ key, fetchImpl = fetch, maxBodyBytes = 9 * 1024 * 1024, maxConcurrent = 2 } = {}) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('CODEX_BACKEND_KEY must contain at least 32 characters');
  const expected = Buffer.from(`Bearer ${key}`);
  let active = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fail = (status, error) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error })); };
    if (!['/images/edits','/images/normalize'].includes(req.url)) return fail(404, 'Not found');
    if (req.method !== 'POST') return fail(405, 'POST required');
    if (req.headers.origin) return fail(403, 'Browser requests are not supported');
    const supplied = Buffer.from(req.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail(401, 'Backend authentication required');
    if (active >= maxConcurrent) return fail(503, 'Backend busy; no upstream request sent');
    if(req.url==='/images/normalize') {
      if(!['image/jpeg','image/png','image/webp'].includes(req.headers['content-type']))return fail(415,'Image required');
      active++;
      try {
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)return fail(413,'Image too large');chunks.push(chunk);}
        const source=Buffer.concat(chunks);
        const meta=await sharp(source,{limitInputPixels:25000000,failOn:'warning'}).metadata();
        if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height||meta.width<64||meta.height<64||(meta.pages||1)>1)return fail(422,'Invalid image');
        const normalized=await sharp(source,{limitInputPixels:25000000,failOn:'warning'}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer();
        res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(normalized);
      } catch { if(!res.headersSent)fail(422,'Invalid image'); }
      finally{active--;}
      return;
    }
    const contentType = req.headers['content-type'] || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) return fail(415, 'Multipart image required');
    const access = req.headers['x-codex-access-token'];
    const account = req.headers['x-codex-account-id'];
    if (typeof access !== 'string' || !/^[A-Za-z0-9._~+\/-]+=*$/.test(access) || access.length > 16000 || (account && (typeof account !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(account)))) return fail(400, 'Invalid Codex credentials');
    if (Number(req.headers['content-length']) > maxBodyBytes) return fail(413, 'Image request too large');
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    const disconnected = () => { if (!res.writableFinished) controller.abort(); };
    res.on('close', disconnected);
    try {
      const chunks = []; let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > maxBodyBytes) { fail(413, 'Image request too large'); return; }
        chunks.push(chunk);
      }
      // Codex accepts JSON image references, not multipart. This matches the
      // OpenAI Images provider's image_url representation in installed OpenCode.
      const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
      const image = form.get('image[]');
      const prompt = form.get('prompt');
      if (form.get('model') !== 'gpt-image-2' || typeof prompt !== 'string' || !prompt || prompt.length > 16000 || !(image instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 8 * 1024 * 1024 || form.getAll('image[]').length !== 1) { fail(400, 'Invalid portrait image request'); return; }
      const imageData = Buffer.from(await image.arrayBuffer()).toString('base64');
      const body = JSON.stringify({ model: 'gpt-image-2', prompt, images: [{ image_url: `data:${image.type};base64,${imageData}` }], n: 1, size: '1024x1280', stream: true, partial_images: 0 });
      const upstream = await fetchImpl('https://chatgpt.com/backend-api/codex/images/edits', {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', originator: 'opencode', ...(account ? { 'chatgpt-account-id': account } : {}) },
        body,
      });
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); fail(502, 'Upstream redirect rejected'); return; }
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res); else res.end();
    } catch {
      if (!res.headersSent) fail(502, 'Codex backend request failed; generation status may be unknown');
      else res.destroy();
    } finally { clearTimeout(timer); res.off('close', disconnected); active--; }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createCodexBackend({ key: process.env.CODEX_BACKEND_KEY });
  server.listen(Number(process.env.PORT || 8790), process.env.HOST || '127.0.0.1', () => console.log('Codex image backend ready'));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
