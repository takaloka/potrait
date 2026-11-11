# Codex Node image backend

Current deployment and operational instructions: [deployment.md](deployment.md). The authenticated service now also provides `POST /images/normalize`: bounded JPEG/PNG/WebP decode, 25 MP ceiling, EXIF orientation, metadata removal and JPEG encoding up to 2048px. All real-photo uploads require this service (or a trusted normalizer binding), including BFL and demo mode. `npm start` also runs migrations and independent processing ticks; status polling no longer invokes AI.

## Local preview

Run `npm run build`, then `npm start`. The start command runs a loopback-only Node image backend alongside Wrangler and injects `CODEX_BACKEND_URL` / `CODEX_BACKEND_KEY` from an ephemeral private environment file. No OpenCode runtime, credential file or API key is used. Existing D1 OAuth credentials and R2 images are preserved.

Keep that process running for the event. Stopping it stops both local services. Sign in through `/operator` → **Hubungkan Codex** if there is no existing Codex session. Restarting the backend creates a fresh server-to-server key, but does not disconnect the Codex account.

This affects `npm start` (built preview), not the framework's standalone `npm run dev` command. For development with an independently managed backend, supply the two server-only bindings explicitly.

## Boundaries

- Worker owns operator authentication, OAuth device login/refresh, D1 jobs and R2 results.
- Node receives one multipart edit request plus the current short-lived Codex access token and optional account-routing ID. It validates one image and converts it to JSON `images: [{image_url: "data:..."}]`, because the Codex endpoint rejects multipart. It does not receive refresh tokens and does not store credentials/photos on disk.
- Only `POST /images/edits` exists. Upstream URL is fixed to the Codex image-edit endpoint. Redirects are refused. Browser-origin requests are refused; no CORS is enabled.
- Server-to-server authentication requires a random key of at least 32 characters. Never put it in client bundles, browser localStorage, URL parameters or Git.
- Requests are capped at 9 MiB and two concurrent edits, with a 180-second deadline. Upstream response is streamed back. Transport errors do not trigger automatic retries because image-generation acceptance may be unknown.
- Local HTTP is allowed only for loopback. A nonlocal Worker binding must use HTTPS, no URL credentials, query or path. The backend must be trusted with access tokens and participant photos.

## Production deployment (not automatically configured)

Deploy `server/codex-image-backend.mjs` on a Node 22+ host. Set a server secret `CODEX_BACKEND_KEY`, choose a `PORT`, and set `HOST` according to the hosting platform. `npm run start:codex-backend` starts it. Put the service behind HTTPS and restrict network access to the application where possible.

Configure Worker secrets/bindings:

```
CODEX_BACKEND_URL=https://your-trusted-image-backend.example
CODEX_BACKEND_KEY=<same high-entropy secret stored on Node>
```

Do not upload the ephemeral local environment file. Do not expose the local Node service with an unauthenticated tunnel. A Cloudflare deployment alone cannot start Node; it requires this separate service. A transport that reaches the API still does not establish the account's image entitlement/billing.

## Verification

`node tests/codex-node-backend.mjs` validates the actual local HTTP service using a fixture upstream: authentication, origin/path/method checks, request limits, concurrency, credential forwarding, redirect refusal, stream handling and safe network errors.

`node tests/chatgpt-worker.mjs` sends an edit through actual workerd Fetch → authenticated Node service → local provider fixture → completed image parser. No live entitlement is inferred from these tests.

Live format diagnostics: an authenticated multipart request received HTTP 400 `Unsupported content type`; JSON with only model/settings received HTTP 400 `missing_required_parameter` for `images`. No image generation was requested by those validation-only diagnostics. The Node adapter uses JSON image references based on the installed OpenAI Images provider serialization.

### Live application result — 11 November 2026

Participant `Uji Node Codex`, job `f3e7ff7e-b811-467c-9b64-bb5b3b4c5a6e`, completed a real beskap edit after the JSON correction. Processing-to-ready interval was 41.3 seconds. R2 result `/api/media/daa395bb-00c3-4f0b-b3c6-d8e3ea2c5877-result.png` differs from the stored original; connection has `method: codex` and `verified: true`. The browser displayed the vintage portrait in the Nusantara poster with the download button, and the job entered the repeating display rotation. This confirms one working image edit; it does not establish billing allocation, quality for every photo, production deployment or sustained event capacity.
