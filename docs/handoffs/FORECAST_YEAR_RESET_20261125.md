# Forecast Year Selection and Calculation Reset

Frontend cache tag: `forecast-year-reset-20261125-v3`.
This frontend release includes the production identity repair in commit `7c58191d`.

## Search Failure Prerequisite

The previous warehouse package did not synchronize the router's OSW version pin or production policy digest/public config. This caused production identity checks to refuse reads, including Search and Check status. The repair does not disable those checks.

See `PRODUCTION_IDENTITY_REPAIR_20261125.md`. If all five warehouse GAS files were already installed, update only the corrected `01_router.gs` and publish a new version of the existing Web App deployment. Otherwise install all five files in `output/production-identity-20261125/km-production-status-20261125-v3.zip`.
The final profile also moves the previously blocked `gapJob.status.get` action to the explicit READ allowlist in both layers. The earlier v2 package does not contain this status-policy repair.

Git push publishes frontend sources, not Apps Script. The owner must deploy the corrected GAS router. Live authenticated Search and calculation status cannot be certified before that deployment.

## Forecast Fix

- Old code found one site's first annual FC row and wrapped month indices into that same row. The Breakdown and 90 days FC reference could consequently use January/February of the wrong year.
- One forecast window now computes three complete year-month keys from a single instant in the site's planning timezone.
- In November 2026: December 2026, January 2027, February 2027. In December 2026: January/February/March 2027.
- Every month resolves through the existing canonical `planningDemand.baseRegularFc` exact year/company/country/marketplace/SKU authority. Raw source rows are retained so a blank cell cannot be normalized into an invented zero.
- Missing annual rows, conflicting values, unusable scope, or missing authority remain unavailable. No fallback to the previous year or another site; actual numeric zero remains zero.
- The Breakdown keeps its existing per-month Target% behavior, with the correct year's rule. Month labels now include year. An incomplete total shows a dash instead of a partial total presented as complete.
- The main 90 days FC reference still means three Base FC months plus scoped special-event reference FC, not daily D90 gap or stock subtraction. Its base months use the identical year-month window; special events must also match the full applicable year-month.
- The legacy two-month planning display helper uses the same year-aware month facts. The canonical backend daily Forecast-Driven gap engine is unchanged and already selects monthly FC by full year-month.
- No forecast table, quantity, inventory balance, or stored calculation result is rewritten by this frontend fix.

## Reset Semantics

`Reset calculation` is available in the unconfirmed-status notice.

1. Read current server status with an observation deadline.
2. If idle/terminal, request confirmation and reread before clearing only this browser's wait.
3. If active, only a positively identified matching run/scope can be stopped. Request confirmation, call the existing run-ID-scoped cancel owner once, and require a same-ID terminal reply before clearing the hold.
4. Another run, unavailable status, rejected cancellation, or a timeout keeps the wait with an explicit notice.
5. Never delete results, force-clear a server lease, cancel an unidentified job, retry cancellation automatically, or START another calculation.

Reset is not a workaround for a broken production identity check; deploy the router repair first.

## Visible Status Diagnostics

Check status displays an immediate checking state and a last-check time/result afterward. Safe Console logs use the prefix `[Inventory status]`; they contain only build, request count, run identity, timestamps, phase and error code, never authentication credentials or request bodies.

Read-only Console commands, after this frontend is loaded:

```js
console.table(window._irJobStatusDiagnostic_?.());
console.table(window.KM?.passwordAccess?.diagnostics?.());
```

No mutation or new calculation is triggered by either diagnostic.

## Same-Tab Hard Reload Authentication

- Login previously accepted a numeric-string expiry but stored it without conversion; restore required a number and could invalidate it on Ctrl+Shift+R. Both old persisted string expiries and new login replies are normalized.
- Locally stored expiry is conservatively capped to the server-reported expiry or four hours from login, whichever is earlier. Reload does not renew/extend it. Every request still undergoes server expiry/revocation checks.
- Only explicit session-invalid/expired/revoked/missing responses clear a session. Temporary auth infrastructure/configuration failures preserve it, surface a safe diagnostic and do not replay any business request.
- Storage remains same-tab sessionStorage, not localStorage or URLs. True expiry/revocation still requires login.
- This repairs concrete frontend failure paths; it does not assert an authenticated production trace proved the exact cause of every reported logout.

## Verification

- `inventory-forecast-year.test.cjs`: 62 checks; all 12 anchor months, row order, adjacent years, scoped isolation, duplicate conflict, raw blank versus real zero, missing next-year FC, per-year Target%, dated events, and US/AU year-boundary timezone differences.
- `inventory-forecast-year-browser.cjs`: 18 checks at 1440px and 390px using real DB normalizers, the actual cloud row mapper, the scoped Breakdown renderer, and non-overlapping full-year labels. Screenshots under ignored `output/forecast-year-20261125/`.
- `manual-gap-reset-browser.cjs`: 56 checks at 1440px and 390px; idle, active, declined confirmation, unrelated run, failed read, hung cancel, wrong-ID reply, repeated clicks, no STARTs and no real network/business writes.
- Production identity integration suite: 16 tests; full policy digest/config projection, real OSW/FIW/router/health stamp alignment, actual status READ dispatch through both gates, typed guard-refusal preservation, retained fail-closed checks and retry recovery.
- Hard-reload auth browser suite: 40 checks at desktop/mobile, cache-disabled CDP reload, legacy string and numeric expiries, no renewed TTL, temporary refusals retained, real session expiry enforced and no credential-bearing URLs.
- Existing auth-busy/login regression: 37 checks; job-status recovery browser suite: 66 checks, including visible last-check results and safe Console diagnostics; ordinary job-state browser suite: 90 checks.
- Daily formula regression: 392 checks; existing Site Inventory daily browser suite: 50 checks.
- Existing target-rule consumer suite still has six baseline failures comparing comment/whitespace-stripped published bundle bytes with source; reproduced using unmodified HEAD page source. The new forecast tests compare actual canonical resolver results, not formatting.
- The legacy 90-day reference suite's FC tests were updated for explicit annual fixtures and missing-data semantics. It still has one unrelated existing W2 assertion against the unchanged warehouse recommendation backend.

## Owner Acceptance

- [ ] Deploy the corrected router (or full five-file repair package), confirm identity checks pass, then hard-refresh the app.
- [ ] Search AU Amazon and a Forecast-Driven non-Amazon site successfully.
- [ ] In November, verify Breakdown labels include Dec. 2026 / Jan. 2027 / Feb. 2027 and compare each value to its annual row and applicable Target%.
- [ ] Confirm missing 2027 FC shows a dash, never 2026 January/February values; enter an actual zero to verify it displays 0.
- [ ] Confirm 90 days FC uses the same three annual base months. It need not equal the Target%-adjusted Breakdown if rules/events differ.
- [ ] Check status produces a status result or a named failure; Reset requires confirmation, keeps already-calculated data, and does not start a new job.

No live calculation was reset and no Apps Script deployment was performed by the agent during this work.
