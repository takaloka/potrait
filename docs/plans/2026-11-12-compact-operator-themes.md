# Compact Operator Theme Controls Implementation Plan

**Goal:** Three equal event controls with theme configuration in a modal.
**Architecture:** Reuse Card, Button, Dialog and Switch. Keep a local policy draft; save through the existing mutation flow, cancel discards edits.
**Tech Stack:** React, Radix Dialog, existing CSS tokens.

- [x] Replace large theme card with third control showing default theme and settings icon.
- [x] Add modal draft, switches, default radios, inline error, Cancel/Save.
- [x] Add three-column desktop / stacked mobile layout and compact modal rows.
- [x] Typecheck, policy regression, isolated browser inspection, VPS build passed.
- [x] Deploy UI-only release to VPS; systemd active and live operator login loads.

Browser evidence: isolated fixture confirms zero saves while editing, cancellation restores previous policy, and Save performs one update and closes modal. Screenshot inspected. Widths 320/768/1024/1440 have no document overflow, with one column at 320 and three equal columns at larger sizes. Authenticated production operator layout was not inspected (browser at login).

Active VPS release: `/srv/loka-portrait/releases/compact-ui-20261112`. Previous release retained: `event-themes-20261112`. No database migration in this UI release.

Approved design: three controls in one bar; theme modal applies changes only on Save. No Git repository available.
