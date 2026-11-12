# Bojonegoro Doelo Implementation Plan

**Goal:** Approved third theme: a simple vintage Javanese studio print for preview/download, and a full-height thin-framed photograph for a portrait TV.

**Architecture:** Shared SVG renderer with print and viewport-sized display modes. Register `bojonegoro-doelo` throughout the existing theme pipeline, retain existing jobs, and add an additive SQLite constraint migration using the existing rename/add/copy/drop pattern. The same AI result serves both compositions. Existing beskap/kebaya/jas options remain; the theme requests an uncluttered old Javanese studio treatment with recognizable identity.

**Tech Stack:** React, TypeScript, SVG, SQLite/D1, existing PNG exporter.

## Approved direction
- Revised print per user reference: red ground, cream scalloped postage-stamp mount, arch-topped photograph. Remove all reference scenery, foliage, UNESCO marks, dates and location text. Footer is participant name, then exactly `Genetik Bodjonegoro Doeloe`. No QR in download. This replaces the rejected plain cream studio mount.
- TV: viewport-sized photograph, narrow uncarved dark wood frame, name lower left, QR lower right. Hide brand/captions and fullscreen controls while fullscreen. Preserve QR node across changes.
- Keep participants' identity, apparent age and skin tone; vintage styling changes clothes/lighting, not facial ancestry.

## Tasks
- [x] Renderer, theme registry, export asset selection, and display-specific typography/fit.
- [x] Theme allowlist/type, migration preserving old records, local migration idempotence and provider prompt plumbing.
- [x] Screen styling and theme handoff, including portrait aspect ratio and fullscreen CSS.
- [x] Verify migration retention/rejection, renderer escaping/loading, API theme persistence, typecheck/build and browser preview/export/display at multiple sizes.

## Evidence
- `npm test`: 22/22 suites passed after updating the data-URL test loader to include the third renderer. Includes real SQLite migrations, retained records, invalid-theme rejection, theme-aware idempotency, and mocked provider prompt dispatch.
- `npm run typecheck`, `npm run build`: pass. Targeted ESLint across edited TypeScript, scripts and tests: pass. No new paid AI generation was performed.
- Una profile `loka-doelo` successfully opened the local app and selected the third theme. Real canvas PNG export via `tests/doelo-browser-server.mjs` produced `1200x1500:image/png`.
- Visually reviewed reference-inspired print and portrait TV using a fictional existing sample photograph (not a newly generated beskap photo). Screenshot: session temp `doelo-stamp-proof.png`.
- Actual isolated iframe viewport sizes 320x568, 768x1024, 1024x768, 1440x900 and 1080x1920: stage matched viewport, no horizontal overflow, QR within viewport and participant name clear of QR. Doelo → Kolase → Doelo retained the same QR element and one portrait image. Fullscreen CSS implemented; actual TV fullscreen and QR scan distance remain device checks.
- Stopped the session's local dev server, ran `scripts/migrate-local.mjs` (private backup created automatically, applied only `0007_bojonegoro_doelo.sql`), then restarted port 3017 and confirmed the revised theme is available.
- These theme changes are local only; VPS still uses the previously deployed camera release.

Work in existing non-Git workspace. No production deployment until the new theme has been checked. Native camera work remains intact.
