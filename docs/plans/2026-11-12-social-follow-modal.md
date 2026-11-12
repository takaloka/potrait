# Social Follow Modal Implementation Plan

**Goal:** Valid photo submission opens a consistent social-follow dialog before uploading.
**Architecture:** Keep existing validation/upload/idempotency flow. A one-shot confirmation re-submits the same native form, so constraints and latest event status are rechecked. Links open new tabs with noopener; no claim of verified follow.
**Tech Stack:** React, existing Radix Dialog/Button, Lucide icons and CSS tokens.

- [x] Add modal after successful form validation, three exact social links and confirmation button.
- [x] Preserve draft on close, revalidate on confirmation, retain existing submission lock.
- [x] Typecheck passed; browser fixture measured zero uploads before confirmation, exactly one after; screenshot inspected.
- [x] VPS build passed, service active; production modal verified with fictional draft only (no upload or paid generation).

VPS release: `/srv/loka-portrait/releases/follow-ui-20261112`. Previous compact-ui release retained. Only participant-form.tsx and workspace.css deployed; no data migration. Mobile-specific visual inspection remains unperformed; layout uses existing responsive Dialog and a three-column minmax link grid.

User approved implementation and deployment. Follow status is self-attested, not API verified. No Git repository available.
