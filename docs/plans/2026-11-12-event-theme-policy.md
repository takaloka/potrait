# Event theme availability

Approved behavior: Bojonegoro Doelo active/default for the local event; other themes visible with top-right locks and an explanatory dialog. Operators can enable themes and choose the default.

## Implementation checklist
- [x] Atomic `settings.themePolicy` containing `enabled` and `defaultTheme`.
- [x] Migration 0008 preserves previous availability by default; local event explicitly configured to Bojonegoro-only after backup.
- [x] Operator switches and default radios; at least one enabled theme required.
- [x] Participant initial default and polling fallback when selected theme becomes unavailable.
- [x] Locked theme buttons open accessible Radix dialogs with active-default CTA.
- [x] Server rejects new locked submissions, including policy changes during normalization/storage; existing duplicate retries survive.
- [x] Complete local launcher restarted with PORT=3017, including backend and worker.

## Verification
- New offline theme-policy test failed with missing policy before implementation, then passed.
- `npm test`: 23/23 suites passed, including migration rerun, existing record preservation, policy validation and admission race cleanup.
- `npm run typecheck` and `npm run build`: passed.
- Targeted ESLint: zero errors; three existing image/navigation warnings.
- Real local browser: Bojonegoro selected; each locked button opens its dialog; CTA closes and retains Bojonegoro selection.
- Same-origin iframe viewports 320/768/1024/1440: document scroll width equals viewport, two locks and Bojonegoro selected in each.
- Dialog screenshot inspected: temporary `theme-lock-dialog.png` in the session temp directory.
- Operator browser checks stopped at login; operator API behavior covered offline. No production AI call made during these checks.

Deployment status: local only. VPS not updated by this task.
