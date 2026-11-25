# Warehouse Lifecycle Read Models

## Release

Frontend tag: `warehouse-lifecycle-20261125-v1`.
Includes the already-pushed `ab10026c` Status recovery (`gap-status-recovery-20261125-v7`).
That Status fix was verified on GitHub Pages before this warehouse release.

The warehouse changes require an Apps Script deployment. Git push does NOT deploy Apps Script.
No production database writes, historical re-imports, recalculation starts, or backend deployment were performed during this task.

## Apps Script Deployment

Update these existing files from the release ZIP:

- `01_router.gs`
- `63_api_v1_system_health.gs`
- `70_api_v1_overseas_stock_workspace.gs`
- `90_generated_supply_planning_bundle.gs` (unchanged published canonical dependency, includes KMSLS)

Add `88_api_v1_warehouse_lifecycle.gs`, then publish a new Web App deployment version using the existing deployment.
Do not replace other installed handlers or configuration. In particular, 17_, 21_, 22_, 31_, and 80_ are not part of this change.

Health checks must expose `factoryInventory.workspace.get` and both `OSW_BUILD_VERSION_` / `FIW_BUILD_VERSION_` as `WAREHOUSE-LIFECYCLE-20261125-V1`.

## Definitions

- Overseas On The Way: canonical KMSLS Shipment-line unreceived quantities, grouped by exact destination warehouse ID and SKU. Company must match the destination warehouse. Includes committed historical COUNTED and DISPLAY_ONLY incoming; excludes unfinished imports, removed lines, drafts, cancellations, and received/closed/completed shipments.
- Shipped, in_transit, arrived, delivered and partial receipt states remain incoming until receipt. A missing ETA does not erase physical incoming; it is flagged. Planning horizon ETA qualification is unchanged.
- Snapshot `wh_on_the_way_qty` is preserved as reconciliation context, never added to Shipment incoming. Available/Reserved/Damaged are unchanged.
- Factory In Production: open formal PO ordered minus completed quantity. Draft/cancelled/closed/completed POs do not contribute. Historical shipped/remaining counters do not replace the production formula.
- Factory Pending Shipout: actual reservation linked to live draft/ready_to_ship Shipment lines, reconciled against factory reserved stock. Historical imports do not create new reservations. A mismatch displays unavailable with a named reconciliation warning, not a fabricated count.
- Factory is a shared pool: warehouse company does not exclude another company's valid factory PO/Shipment.
- New PO/incoming-only warehouse/SKU keys appear without creating stock rows. Their unknown physical balances display a dash.
- Unknown quantities/statuses and conflicting duplicate identities fail closed. No local ledger repair or automatic write occurs.
- Re-entering either page reads current lifecycle facts once. Readback uses the same workspace and request-generation guard. Movement Log remains deferred.
- An older deployment can still show stock using the bounded legacy fallback, but unavailable lifecycle metrics are never presented as zero.

## Read-Only Production Audit

Bounded connected-Sheets reads on 2026-11-25 found:

- Six in-transit shipments to `WH-KM-US-3PL-AMZLGS`: 1,116 + 998 + 40 + 1,058 + 180 + 94 = **3,486 units**.
- The WINIT shipment is already received and contributes zero incoming.
- Ten partial-completed POs: **2,528 units** not completed.
- Factory physical stock: **52,183 units**; reserved: **0**; Pending Shipout: **0**.
- Existing incoming destination warehouse IDs resolve. The new pure read model reproduced these totals with no quantity/identity reconciliation issues.

The audit input is local under ignored `output/warehouse-lifecycle-20261125/`, not committed or embedded in the release ZIP.
These are audit-time totals, not a claim that live data cannot change afterward.

## Acceptance Checklist

- [ ] Hard-refresh the app after Pages publishes this frontend; deploy the five GAS files above.
- [ ] Open Overseas Inventory. Audit-time six AMZLGS shipments total 3,486 incoming; WINIT received shipment contributes zero.
- [ ] More Info shows contributing Shipment numbers, remaining quantities, ETA and separately the reported snapshot incoming.
- [ ] A newly dispatched Shipment increases only its destination warehouse/SKU incoming, not Available.
- [ ] Partial receipt decreases incoming by received quantity; the existing receipt writer alone credits stock. Full receipt removes incoming.
- [ ] No historical Shipment re-import or manual Available adjustment is needed merely to surface existing incoming.
- [ ] Open Factory Inventory. Audit-time Current remains 52,183, In Production 2,528, Pending Shipout 0, subject to subsequent business changes.
- [ ] Issue a formal PO: production increases. Receive production: production decreases through completed quantity, without adding it to physical stock twice.
- [ ] Create a Shipment Draft: Pending Shipout reflects its actual reservation; Current is unchanged. Dispatch/cancel releases pending through the existing writers.
- [ ] Return to either page after business changes: the current read model refreshes without a browser restart.
- [ ] For the old Status hold, press Check status after hard refresh. Exact confirmed run completion releases the hold. A missing/superseded ID reads latest status separately.
- [ ] When latest state is idle/terminal but the original cannot be confirmed, Clear local wait requires confirmation and a second fresh status check. It does not cancel a job, prove the old run completed, or start another calculation. X only hides the notification.

## Verification

- `warehouse-lifecycle.test.cjs`: 69 assertions.
- `warehouse-lifecycle-workspace.test.cjs`: 16 assertions; real foundation canonical routing, immutable envelope, read registry, profiles, health entry.
- `warehouse-lifecycle-browser.cjs`: 20 assertions at 1440px / 390px, actual DB normalizers and page scripts, screenshots, no live requests/writes.
- `manual-gap-status-browser.cjs`: 90 assertions. The acknowledged-progress scenario now retains its real observation deadline so taking a screenshot cannot race a synthetic 120ms timeout; production deadlines unchanged.
- `manual-gap-unlinked-status-browser.cjs`: 64 assertions.
- `manual-gap-response-deadlines.test.cjs`: 19 assertions.
- `km-api-foundation.test.js`: 70 assertions; compatibility suite: 50.
- `inventory-site-sku.cjs`: 27 tests.
- Legacy `action-registry-and-router-completeness-f1-7n-fb-4e-r2.test.js` is not green: obsolete build/diagnostic assumptions culminate in a TypeError at line 290. Repeated with unmodified HEAD router/health/workspace sources and reproduced the same failures. Not changed as part of this task.

Live Web App end-to-end validation remains pending owner deployment; local fixtures are not presented as a live business transaction.
