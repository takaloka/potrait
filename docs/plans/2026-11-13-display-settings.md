# Display Settings Implementation Plan

**Goal:** Add operator-controlled duration, replay window and TV rotation.
**Architecture:** Persist settings in D1, use one shared next-slide SQL for previews and atomic claims, and rotate an inner presentation canvas while fullscreen remains on the outer viewport.
**Tech Stack:** React, TypeScript, CSS, D1/SQLite.

## Approved design
- Settings2 icon immediately before pause/play opens the existing Dialog pattern.
- Duration 5–60 seconds, replay window 1–1000 people (default 10), rotation 0/90/270 degrees.
- Every ready photo gets its first turn in FIFO order; only the newest N eligible participants (by creation time) repeat. Include the currently displaying participant in that N. Keep stored photos.
- Save atomically, retain drafts on failure, show field constraints and inline errors. Duration changes apply to the next slide.
- Rotate the whole presentation, swapping logical canvas dimensions so artwork, QR and controls remain correctly oriented.

## Work checklist
- [x] Add behavioral regression coverage for settings validation and replay scheduling.
- [x] Add migration, typed settings and server validation/selection.
- [x] Add modal and rotated presentation canvas using existing styles.
- [x] Run offline API tests, migration tests, typecheck and browser checks.

## Verification
- `npm test`: 24/24 suites passed, including new display settings regression and existing slideshow/migration suites.
- `npm run typecheck` and `npm run build`: passed.
- Una browser with fictional API: saved 7 seconds / 15 people / right rotation; failed save retained dialog, draft and inline error.
- Dialog measured at widths 320/768/1024/1440: no horizontal overflow, inside viewport. Preview charset fixed to UTF-8 and wording simplified following feedback.
- Rotation canvas bug found through browser measurements (zero-height grid track); explicit grid track fixes it. Fresh left-rotation proof: physical 756x413, logical stage 413x756, bounds exactly cover viewport. Right-rotation screenshot inspected with photo, text and QR rotated together.
- Actual app at localhost:8787/operator displays the header and operator login. Physical Android TV behavior remains a device check.

No git metadata is present in this project directory; commits are unavailable.
