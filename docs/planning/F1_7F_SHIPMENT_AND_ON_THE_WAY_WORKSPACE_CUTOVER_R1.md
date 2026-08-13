# F1-7F-SHIPMENT-AND-ON-THE-WAY-WORKSPACE-CUTOVER-R1 — Shipment scoped workspace + page cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE == AFTER).** Baseline HEAD `279d9d3`. The two active
Shipment surfaces — `shipping-history.js` (Shipment Draft + Overview) and `global-logistics-map.js` (On-the-Way Map) —
now render from ONE scoped `shipment` workspace: no broad Operation DB for their primary read, scoped post-write refresh,
fail-closed on error. No Shipment/FIFO/receipt/PO/factory-stock/Final-Output authority changed.

## §0 Audit — both surfaces are READ_MODEL_ASSEMBLY of persisted facts (no HALT)
- **shipping-history.js:** init/render lazily `loadOperationDb({force:true})` then reads `getShipments`/`getShipmentLines`
  (+ `getCarrierRateCards`/`getWarehouses` in edit mode) from `_opDbCache`; groups lines by shipment; **display sums** of
  persisted per-line qty/carton/cbm/weight; the Execution Snapshot is rendered READ-ONLY (never recalculated). No client
  FIFO/allocation/PO-shipped/receipt math — allocation is delegated to the backend (`generateShipmentLineAllocations`).
- **global-logistics-map.js:** `ensureDb` broad-loads, `buildReadModel` reads 8 getters (shipments, shipment_lines,
  shipment_routes, shipment_events, warehouses, logistics_locations, shipment_route_templates,
  shipment_route_template_nodes); joins/pins/arcs from **persisted** event/route/location coords (never synthesized);
  received/remaining and attention buckets are **display arithmetic/classification** over persisted columns.
- **`derivedReceiptStatus` = DISPLAY_ONLY** (a display mirror of the backend deriver over `shipmentQty`/
  `shipmentReceivedQty`; the authoritative status is the persisted `v.status`; if they diverged the page still shows the
  persisted one). It stays presentation-side. **No `ON_THE_WAY_STATUS_AUTHORITY_CONFLICT`.**
- No existing `shipment.workspace.get` (only writes + document reads). The registered `shipment` workspace is
  unimplemented → **implemented** here (no v2).

## §2/§3 Shipment workspace (NEW backend `57_api_v1_shipment_workspace.gs`)
- Action `shipment.workspace.get` (router dispatch added). Reads ONLY the Shipment table set — **never `getOperationDb`**.
- **Collection grain:** ONE bounded page-oriented read (all shipments for the client to filter/paginate; default/cap size
  3000). **Detail grain:** no per-shipment N+1 — the collection carries all lines/routes/events for the returned page in
  one read.
- **BASE tables** (Draft/Overview): `shipments`, `shipment_lines`, `warehouses`, `carrier_rate_cards` — fail-closed on
  missing schema. **MAP-extra tables** (On-the-Way): `shipment_routes`, `shipment_events`, `logistics_locations`,
  `shipment_route_templates`, `shipment_route_template_nodes` — returned **only when the matching include flag is set**
  (bounded includes, not broad loading) and read **missing-safe** (a sparse/absent route tab → `[]`, matching the browser
  getters; no read cost when not requested).
- **Input grain:** `{ filters, search, sort, page, include }`. **Output grain:** `{ filters, summary, shipments[]
  (raw passthrough), shipmentLines[] (flat), warehouses[], carrierRateCards[], (+ include-gated) shipmentRoutes[],
  shipmentEvents[], logisticsLocations[], shipmentRouteTemplates[], shipmentRouteTemplateNodes[], pagination }`.
- Same discipline as `40_`/`50_`: pure builders + injectable `io`; S0/S0.5 exact-ID + validate-only presence; fail-closed.

## §4 DTO facts (raw passthrough → adapter re-normalizes → BEFORE == AFTER)
Per shipment the collection carries identity/status/dates/tracking/warehouses/carrier + line-derived display totals +
`raw`; the flat `shipmentLines`/routes/events/locations/templates are raw passthrough. The db-api
`KM.DB.adaptShipmentWorkspace` maps each array through the **SAME** canonical normalizer with the **SAME per-array filter**
`normalizeOperationDb` applies (`normalizeShipmentRecord`/`…Line`/`…Route`/`…Event`/`normalizeLogisticsLocationRecord`/
`normalizeShipmentRouteTemplate(Node)Record`/`normalizeCarrierRateCardRecord`/`normalizeWarehouseRecord`) → the adapted
arrays equal the legacy getters exactly.

## §12/§13/§16 Frozen authorities (proved untouched — source guards)
`57_` reads no `shipment_line_allocations`, runs no FIFO (`slaFifoCompare_`/`generateShipmentLineAllocations` absent),
computes no PO `shipped_qty`/`remaining`, reads no `factory_stock`, and **writes nothing**. `shipment_qty` and
`shipment_received_qty` are passed through verbatim (read/compare only — never assigned/recomputed). Receipt authority
stays `updateShipmentReceipt` → `handleUpdateShipmentReceipt_` (unchanged); the map's receipt/remaining is display
arithmetic. `shipment_lines.purchase_order_line_id` is passthrough, not a multi-PO authority. Final Output / document
contracts (`generateShipmentDocument`, Shipping Detail / Packing List, `getShipmentFinalOutput`) are untouched — the
workspace carries no Final-Output calculation.

## §9/§10 Frontend cutover
- **shipping-history.js:** `_shEffectiveWorkspace()` gates on canonical `shipment`; `_shReadModel` sourced from
  `KM.api.getWorkspace('shipment')` → `KM.DB.adaptShipmentWorkspace`; read-model-first accessors
  (`_shGetShipments/_shGetShipmentLines/_shGetCarrierRateCards/_shGetWarehouses`) swap the source (Workspace → DTO,
  Legacy → getters). Both render functions + the confirm modal + edit-mode masters use the accessors. `KM.loadState`
  region on the active list. On error → bounded region ERROR (`_shRenderError_`, `SHIPMENT_READ_FAILED`) — **no silent
  legacy broad fallback** (the broad load lives ONLY in the Legacy branch). Post-write `_shLoadAndRender` → in Workspace
  mode a scoped `shipment` re-read (`_shReadModel = null; _shRefresh_`).
- **global-logistics-map.js:** `ensureDb` fetches `getWorkspace('shipment', { include:{ routes,events,locations,templates },
  page:{size:3000} })` → adapts into `_glmReadModel`; `buildReadModel` sources `rm` from `_glmReadModel` when canonical,
  else the getters. Fail-closed via the existing `state.error` path (`WORKSPACE_UNAVAILABLE`/`WORKSPACE_ERROR`/
  `MAP_READ_FAILED`) — no broad fallback. `afterShipmentWrite` re-reads the scoped workspace in Workspace mode. The map
  UI is unchanged (transport only).
- `shipment` activated **CANONICAL** (`WORKSPACE_CANONICAL.shipment = true`, per-workspace flag default ON); kill switch
  `KM.api.setWorkspaceEnabled('shipment', false)` → instant legacy.

## §11 Writes / refresh
| Write | Owner | Old refresh | New refresh |
|---|---|---|---|
| updateShipment (save / ready / ship / return / done / advance) | 12_ | `_shLoadAndRender` (render-only) | scoped `shipment` re-read |
| generateShipmentLineAllocations + confirmShipmentAndDispatch | 32_/22_ | render-only | scoped re-read |
| generateShipmentDocument | 34_/35_/37_ | Download link (no reload) | unchanged |
| updateShipmentReceipt / updateShipmentEta / advanceShipmentRoutePoint (map) | 31_ | `afterShipmentWrite` (buildReadModel) | scoped `shipment` re-read |
Write API/validation/authority unchanged. **Boundary:** the shared `KM.DB.*` writers still `loadOperationDb({force:true})`
INTERNALLY (the ~40-writer pattern) — that populates `_opDbCache` the pages now ignore; removing it is deferred **Batch F**.

## Tests
New `api-shipment-workspace-f1-7f-r1.test.js` **45/0**: collection rollups + raw passthrough, include-gated MAP tables
(absent without include; present with), filter/sort/search/pagination, empty, invalid-sort fail-closed, source guards
(no getOperationDb/write/FIFO/allocation/PO/factory; shipment_received_qty read-only), activation + router dispatch,
adapter reuses canonical normalizers + the SAME per-array filters, both pages workspace-primary-read + no-broad-DB +
fail-closed + map includes. Contract tests updated to the post-cutover contract (shipment canonical): km-api-foundation
(R3b "other three"; F2/F3/R6/L4 repointed to `inventoryReplenishment`), km-api-foundation-compat (NS1/NS2/FF4 →
`inventoryReplenishment`; PG1 CUTOVER_PAGES + the two shipment pages), km-api-weekly-workspace (CR2/other →
`inventoryReplenishment`). **Full regression: 226 files, only the 4 known baseline failures (none new).** Bundle
unchanged (`aaf5b07`, --check PASS).

## §17 app.js prime / broad-cache pages
Unchanged (KEEP). **Shipment surfaces independent: YES. On-the-Way independent: YES** (both render from the composer with
no broad-DB dependency). Remaining broad-cache pages ≈ 9 (fc-summary.js, inventory pages, request-order.js secondary
surfaces, etc.). Global-prime removal remains Batch F.

## §20 Deployment / version
- **PRE HEAD** `279d9d3` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `57_api_v1_shipment_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** — a new router action + backend handler were added; deploy the **backend FIRST**
  (canonical-ON), then the frontend, or hold with the kill switch. If the frontend ships first the Shipment surfaces
  fail-closed with a bounded read error (never Legacy, never silent) until the backend is live.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `shipping-history.js`,
  `global-logistics-map.js` (`index.html` unchanged). **Bundle rebuild: NO** (`57_` not a bundle source).
  **DB/schema: NONE.**
- **API contract delta:** +1 route `shipment.workspace.get`; no existing route/DTO changed.
- **Rollback:** revert this commit; or runtime kill switch `KM.api.setWorkspaceEnabled('shipment', false)` → instant
  legacy (no deploy).

## FINAL GATE — PASS
Shipment primary reads = scoped API ✓ · On-the-Way primary read = scoped API ✓ · no broad Operation DB for those primary
surfaces ✓ · shipment/FIFO/receipt/PO/factory-stock authorities unchanged ✓ · BEFORE == AFTER (adapter = SAME normalizers
+ filters as the getters; 45/0) ✓ · no frontend parallel business authority ✓ · no silent broad fallback ✓ · no new
regression failures ✓.

**Shipment scoped read: DONE. On-the-Way scoped read: DONE.**

**Exact next slice:** Batch F (retire the ~40-writer WRITE_FORCES_FULL_RELOAD + app.js global prime), or migrate the
remaining broad-cache surfaces (fcSummary/skuDetails workspaces, request-order.js secondary panels). Do NOT begin Batch F
automatically.
