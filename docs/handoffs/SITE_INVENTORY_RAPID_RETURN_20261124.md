# Site Inventory Rapid Return

Date: 2026-11-24
Baseline: 4f215a8a2fec0796de715aa7cbdb6172e2bfd470

## Fix

- Completed metric cells are captured after the real row render and in-place
  velocity/exposure updates, not only at unmount or restored bootstrap.
  An intervening background refresh can no longer erase the only completed copy
  before the operator navigates away.
- A display snapshot belongs to both applied site and Search sequence. It can
  cover a pending background read in the original session as well as a restored
  mount. Explicit Search, another site and cold loads retain their loading gates.
- Cached presentation is never recaptured as newly authoritative data. No cached
  HTML is fed into supply, Gap, route validation or Submit.
- Restored primary reads check the existing source revision, local write epochs,
  Taipei day and ten-minute freshness threshold. A fresh SAME result needs no
  workspace request and no completion-triggered full table rebuild. Changed,
  expired and UNKNOWN sources still refresh quietly.
- Repeated mounts join one matching pending primary refresh. Old mounts cannot
  publish into a later mount, Search or site. Explicit Search/write readbacks
  continue using their existing independent fresh-read paths.
- Frontend cache keys are bumped in index.html and app.js.

## Verification

- `node assets/tests/inventory-rapid-return-browser.cjs`: 18 checks at 1440px and
  390px. Uses the actual lifecycle, partial loader, full DB DTO normalizer,
  inventory projection, renderers and revision helpers; only the API boundary is
  mocked. Includes a nonzero shipment, first completed paint, ten rapid switches
  with async mounts allowed to execute, per-frame cell comparisons, unchanged
  revision zero workspace reads, refresh before return and shared primary reads.
- `node -e "process.env.KM_INVENTORY_BASELINE_REV='4f215a8a';require('./assets/tests/inventory-rapid-return-browser.cjs')"`:
  fails the first-completed-paint capture assertion on the previous source.
- `node assets/tests/inventory-cache-pending-route-browser.cjs`: 42 checks pass.
- `node assets/tests/ir-cache-invalidation-counterexamples-s8-b3-r3-cp2x-r2.test.js`:
  54 checks pass.
- JS syntax checks and `git diff --check` pass.
- Screenshots inspected at desktop/mobile widths under
  `output/inventory-rapid-return-20261124/` (ignored generated output).

These are offline fixture regressions, not an authenticated live-data audit.
External services were blocked in browser tests; no business data was written.
The browser test server is closed on completion.

## Related Work

Inventory Gap's ongoing warning policy is documented separately in
`inventory-gap-ongoing-warning-20261124.md`. It requires Apps Script file 43 and
a new version of the existing Web App deployment, then normal Gap recalculation;
GitHub Pages publication alone does not deploy that backend change.

FBA19PYJ56KK receiving remains the separately recorded OPEN follow-up in
`SITE_INVENTORY_CACHE_PENDING_ROUTE_20261124.md`; it is not claimed fixed here.
