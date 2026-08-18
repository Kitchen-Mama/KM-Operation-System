# F1-7M-B2-BOUNDED-BACKEND-READBACK-ENDPOINTS-R1

**Mode:** AUDIT → CONTRACT DESIGN → MINIMAL ADDITIVE BACKEND → FRONTEND CUTOVER → BEFORE==AFTER PROOF → VALIDATION.
**Goal:** retire the F1-7M-B-deferred high-cost post-write readbacks by adding bounded exact-id read contracts. TRANSPORT/PROJECTION/READBACK only — no authority/formula/schema/idempotency/optimistic change.
**PRE HEAD:** `dbc9e8a` (on origin). **Baseline:** `F1_7M_PERFORMANCE_AND_INTERACTION_BASELINE_R1.md` + `F1_7M_B_POST_WRITE_BOUNDED_READBACK_R1.md`.

Frozen invariants held: `WRITE_FORCES_FULL_RELOAD=0` · `ACTIVE_PRIMARY_BROAD=0` · `ACTIVE_SECONDARY_BROAD=0` · `APP_PRIME_READ_DEPENDENCY=0` · `CANONICAL_STARTUP_WHOLE_DB_PRIME=0`. WRITE → SERVER READBACK freshness model preserved (no optimistic business substitution).

**Implemented:** B2-3 PO (`purchaseOrderId`) + B2-1 Shipment (`shipmentId`) — additive backend filters + frontend cutover on the provably-safe commands. **HALT:** B2-2 IR.

---

## §2 Audit matrix

| Flow | Writer(s) | Current readback | Current tables | Identity avail. today | Extend existing? | Classification |
|---|---|---|---|---|---|---|
| **Shipment** | updateShipment, receipt, eta, route-advance, confirm&dispatch | `shipment.workspace.get` size≈3000 + routes/events/locations/templates full | 9 (map) / 4 (history) | NO exact shipmentId (only substring search) | YES (additive) | **SAFE_ADDITIVE_FILTER** |
| **Inventory Replenishment** | importMarketplaceSkusBatch, upsertMarketplaceSku, updateMarketplaceSkuModel | `inventoryReplenishment.workspace.get` (~19 tables, `{}`) | 19 (+2 carrier) | NO (full-set by design) | NO | **HALT** — `BOUNDED_READ_REQUIRES_SCHEMA_CHANGE` + `NOT_EQUIVALENT` |
| **Purchase Order** | updatePurchaseOrderHeader (edit), status (issue/cancel), receive | `purchaseOrder.workspace.get` size 2000 | 4 | exact `requestOrderId` exists; NO `purchaseOrderId` | YES (additive) | **SAFE_ADDITIVE_FILTER** |

## §15 Filter-contract matrix

| Workspace | New optional param | Absent behavior | Present behavior | Reference tables |
|---|---|---|---|---|
| `purchaseOrder` | `filters.purchaseOrderId` | `null` → clause inert → **byte-identical** response | only that PO's header + its lines survive `poFilterOrders_` | `warehouses`,`sku_details` emitted from own arrays → structurally unfilterable by PO id; `filterOptions` from all orders |
| `shipment` | `filters.shipmentId` | `null` → inert → **byte-identical** | only that shipment; `shipment_lines` auto-scopes via existing `pageLines`; `shipment_routes`/`shipment_events` scoped to the id (they carry `shipment_id`) | `logistics_locations`/route templates/nodes carry no `shipment_id` → REFERENCE, unscoped |

Backend edits: **50_** +2 lines (`poNormalizeFilters_` key, `poFilterOrders_` clause). **57_** +3 (`shipNormalizeFilters_` key, `shipFilterShipments_` clause, conditional routes/events scoping in `shipWorkspaceBuild_`). No router/foundation/DTO change — `params.filters` is already forwarded verbatim.

## §16 Read-cost matrix (honest)

| Level | PO | Shipment |
|---|---|---|
| **SHEET_READ_BOUNDED** | **NO** — `getDataRange().getValues()` reads all sheets fully before in-memory filter (Sheets has no indexed query; no schema change made) | **NO** (same) |
| **NORMALIZATION_BOUNDED** | partial — server still maps all rows; client adapts only the 1 returned order | partial — client adapts only the 1 shipment + its rows |
| **PAYLOAD_BOUNDED** | **YES** — response goes from ≤2000 orders + details + options + summary → 1 order + its lines | **YES** — from ≤3000 shipments + full routes/events/locations/templates → 1 shipment + its lines/routes/events |

The win is **payload + client normalization/render**, NOT backend sheet-read cost. This is a Google Sheets architecture limit, not a defect — stated per §16, not misrepresented as a read-cost win.

## §5/§11/§13 BEFORE==AFTER proofs
- **PO:** `poFilterOrders_(orders, {purchaseOrderId:X})` === `poFilterOrders_(orders, {})` then select X (tested). Unknown id → `[]` (bounded empty, never full list). Frontend `_poMergeOnePo_` replaces order X + its lines in place, retains all other orders + `skuDetails`/`warehouses` masters (tested: PO2 + masters untouched; count preserved).
- **Shipment:** `shipFilterShipments_` exact-id parity + unknown→`[]` (tested). Frontend `_glmMergeShipment_` replaces shipment X's `shipments`/`shipmentLines`/`shipmentRoutes`/`shipmentEvents` (old rows removed first so a disappeared route/event does not linger — tested with a grown route set + added event), retains `logisticsLocations`/templates/nodes/warehouses (tested: static ref not clobbered).

## §6/§14 Frontend reconciliation matrix

| Command | Cutover | Reason |
|---|---|---|
| PO **confirmEdit** (Save/Update) | **bounded** readback + in-place merge | status-invariant (edits dates/payment/note; never `order_status`) → group/section/position unchanged |
| PO sendPo / receive / cancel | **full** readback (unchanged) | issue/receive move sections; cancel removes (group→null) → single-PO splice error-prone |
| Map **receipt / eta / route-advance** | **bounded** readback + merge (retain static ref) | map only updates the shipment in place; static tables held; keyed by shipment id throughout |
| History save/ready/ship/done/status-advance | **full** readback (unchanged) | status moves cards between draft/ready/shipped sections + out of the pool → single-card splice can't re-partition |

**Deploy-order safety (important):** both frontend merges *extract the one entity by id* from whatever the response contains. Against the OLD backend (filter ignored → full list), the merge still extracts the correct entity (or, if the entity is beyond the default page, `merge → false` → **degrade to full readback**). Against the NEW backend, the response is bounded. So the cutover is **correctness-safe regardless of deploy order**; backend-first only realizes the payload win sooner (§22).

## §19 Stale-response protection
Both bounded readbacks reuse the existing per-page sequence guards — PO `_poReadSeq`, map `_glmReadSeq` — bumped at fetch start and checked in `.then`/`.catch`; a newer read invalidates an older bounded response. Per-entity, no global lock. Failure / not-found → the existing full readback (fresh, never a silent stale; §18 fail-closed).

## §10 IR HALT (source-grounded)
`BOUNDED_READ_REQUIRES_SCHEMA_CHANGE` — `60_` reads every sheet via `getDataRange().getValues()`; Sheets has no indexed query, so a per-SKU read still costs a full-sheet read (bounding needs an index/materialized table = schema). Compounded by `NOT_EQUIVALENT` — the visible IR row is NOT a single-SKU projection: "3rd Party Stock" is a scope-wide shared-3PL-pool allocation (`IR.sitePlanningAllocation` over the whole SKU set) and incoming-ETA buckets need the full shipments + shipping-plan lineage. A bounded endpoint would be a `NEW_BOUNDED_ENDPOINT_REQUIRED` re-implementing server-side scope reduction — the exact optimization `60_`'s header defers. IR post-write readback **UNCHANGED** (full workspace). Gap/Recommendation boundary preserved (separate owners; 60_ authors neither).

## Safety
Optimistic patch? **NO** (both merges consume server-adapted data). Authority / formula / schema / transaction / idempotency / optimistic-lock changed? **NO**. Error semantics? **preserved** (existing envelopes + fail-closed degrade). Writer reload 0 / app prime 0 / canonical broad 0: **all preserved**.

## Tests
- New focused `api-bounded-backend-readback-endpoints-f1-7m-b2-r1.test.js` — 46/0 (backend filter-absent parity + exact-present + unknown→empty + reference-not-filtered + routes/events scoping; frontend PO & map merge equivalence incl. static-retention + not-found→false; IR HALT + invariants).
- Relevant: PO-workspace 7c 56/0, Shipment-workspace 7f 45/0 (both eval the edited builders → filter-absent parity confirmed), F1-7M-B 39/0, F1-7M-D 31/0, IR-workspace 66/0, shipment-runtime PASS.
- Full regression: **236 suites pass; 4 fail = the 4 known historical baseline failures**. **Zero new failures.** No prior-suite contract updates needed.

## §22 Deployment matrix
| Item | Value |
|---|---|
| Apps Script files changed | `assets/specs/active/apps-script/50_api_v1_purchase_order_workspace.gs`, `assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs` |
| Router changed | **NO** |
| Full-folder Apps Script sync | The 2 files above are `APPS_SCRIPT_SYNC_REQUIRED`. Sync them (or the whole folder) to the live Apps Script project. |
| New /exec deployment version | **YES** — the additive filters go live only after a NEW Web App deployment version is created from the synced source |
| Bundle | **NO** — `90_generated_supply_planning_bundle.gs` is unaffected (50_/57_ are standalone workspace handlers, not bundle sources) |
| DB/schema | **NONE** |
| Frontend deploy | **YES** — GitHub Pages redeploy (PO overview + map) |
| **Release order (§22)** | 1) sync 50_/57_ + create new Apps Script deployment version → 2) smoke: `purchaseOrder`/`shipment` filter-absent unchanged, filter-present returns bounded → 3) frontend GitHub Pages redeploy. (Correctness-safe in any order per the deploy-order note; backend-first realizes the payload win and matches §22.) |
| **Rollback** | Frontend: revert the commit + redeploy Pages (the merge degrades to full readback, so old frontend + new backend also works). Backend: roll the Apps Script deployment back to the prior version (the additive filter is inert when unused, so leaving 50_/57_ in place is also harmless). |

## Rollback (repo)
Revert the single commit. Frontend cutovers degrade to the full readback on any miss; backend filters are inert when absent → reverting either side independently is safe.

## Performance (§21) — LIVE_MEASUREMENT_REQUIRED for absolute ms
| Flow | Requests | Serial waves | Tables read (server) | Response rows | Payload grain | Render grain |
|---|---|---|---|---|---|---|
| PO confirmEdit | 1 → 1 | 1 → 1 | 4 → 4 (Sheets full-read, unchanged) | ≤2000 orders+details+options+summary → **1 order + its lines** | broad → **bounded** | full `#po-groups` rebuild → in-place merge + rebuild |
| Map receipt/eta/route | 1 → 1 | 1 → 1 | 9 → 6 (drops locations+templates reads) | ≤3000 shipments + full routes/events/locations/templates → **1 shipment + its lines/routes/events** | broad → **bounded** | full model replace → merge-one + rebuild |

## Deferred / HALT items
- **IR** bounded readback — HALT (schema/not-equivalent), stays full workspace.
- **PO** sendPo/receive/cancel + **Shipment history** commands — kept on full readback (section-move/removal not single-entity reconcilable); a future round could add delete/section-aware reconciliation.
- Backend **sheet-read cost** for all workspaces — only bounded by a schema/index change (out of scope; no schema work).

## Recommended next task
The remaining baseline-roadmap item is **F1-7M-E** (backend algorithm cost — 43_ gap `preReadSnapshots`, 42_ recommendation per-SKU maps, 56_/58_) — a separate Apps Script slice. Do not begin automatically. This B2 round's Apps Script deployment (50_/57_) is USER-owned and must be released before further backend work stacks on it.
