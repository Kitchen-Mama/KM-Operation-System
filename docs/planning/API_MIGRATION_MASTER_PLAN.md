# API / Loading Migration — Master Plan

Concise baseline for subsequent implementation prompts. Full evidence:
`docs/planning/F1_7A_SYSTEM_API_TRANSPORT_LOADING_AUDIT_R1.md`. Baseline HEAD `2f43ed9`.

## Goal
No page loads the entire Operation DB merely to render its primary UI. Replace the global `_opDbCache` /
`loadOperationDb({force:true})` bootstrap and the ~40 post-write full reloads with **scoped page reads + scoped
invalidation**, reusing the existing `KM.api` workspace registry and the `_opMatCache` scoped-cache pattern. **No
business-logic change; BEFORE business output == AFTER for the same fixture.**

## §7 API design rules (frozen)
1. API = transport/read-model boundary, never factual authority. 2. Reuse existing canonical business owners.
3. Server-side scope filtering. 4. No whole-table sends when a scoped subset suffices. 5. No per-SKU N+1 fan-out — one
bounded batch endpoint. 6. Detail/history may lazy-load. 7. Preserve optimistic locking/idempotency + failure codes +
reload persistence. 8. No mock/stale fallback in production. 9. No new parallel table/cache authority. 10. Legacy
`getOperationDb` broad path may remain during migration; retire only after **zero-consumer proof**.

## Migration batches (evidence-ordered)

**BATCH A — Shared infra (only what's missing).** Generalize `KM.api.getWorkspace(name, scope)` into the standard page
read; add ONE reusable loading/error/empty/stale state helper (§8 states); add a **scoped-invalidation helper** so a
write invalidates only its domain/scope instead of `loadOperationDb({force:true})`. Do NOT rewrite pages yet.
*Frozen tests:* existing suites green; no page behavior change.

**BATCH B — Quick wins already built.** (1) **Activate `weeklyShipping.workspace`** (implemented, flag OFF) for
shipping-plan + inventory-replenishment read path. (2) Remove `app.js:381/382` global prime once pages self-load.
*Frozen tests:* shipping-plan qty/status, inv-repl gap/suggest unchanged; first paint no longer waits on full DB.

**BATCH C — Planning / Procurement core.** Implement the **`purchaseOrder`** + **`requestOrder`** + **`skuDetails`/
`fcSummary`** workspaces (all REGISTERED-not-implemented). Migrate request-order, request-order-draft,
purchase-order-overview, purchase-order-list, fc-summary. **Retire the LEGACY_PARALLEL client math** (PO
`remaining=completed−shipped`, request-order PO-remaining fallback, `_spLineDisplay` stock/avg/days, fc-summary
Event-Assist) onto canonical backend read-models — display mirrors only.
*Frozen tests:* PO ordered/completed/shipped/remaining, RO qty, gap/recommendation qty, forecast values identical.

**BATCH D — Shipment / On-the-Way.** Implement **`shipment.workspace`** + `shipment.get(id)` detail; migrate
shipping-history, global-logistics-map (8-table logistics workspace), overseas-stock. Lazy-load routes/events/history.
*Frozen tests:* shipment qty, FIFO/executed allocations, PO shipped/remaining, receipt qty, incoming remaining, map
state identical.

**BATCH E — Admin / master.** Migrate sku-details, sku-regional-details, sku-handbook, campaign-risk, factory-stock,
carrier-rate-card to scoped collection/detail reads. Route `calculateSkuRisk` through a backend read-model (or confirm
display-only). automation-schedule already done.
*Frozen tests:* SKU/tax/regional values, factory `available=max(current−reserved,0)`, campaign risk classification,
carrier lead-time joins identical.

**BATCH F — Legacy retirement.** Convert the ~40 writers from `loadOperationDb({force:true})` to scoped invalidation;
after zero-consumer proof, retire the broad `getOperationDb` action / `_opDbCache`. Keep `warehouses` (+ other small
reference tables) as a light bundled reference if cheaper than an endpoint.
*Frozen tests:* every write persists + reloads identically; no full-DB refetch after a single-row edit.

**Post-migration follow-on (not in this plan's core path):** wire the 14 unconsumed actions where a UI is intended —
especially the Final Output document chain (`finalizeShipmentFinalOutput`/`getShipmentFinalOutput`/
`renderShipmentDocument`/`documentTemplate.*`/`shipmentDocument.get|list`) into shipping-history, and drop the 5 admin
one-off actions from the router surface if truly one-time.

## §12 Global frozen "do-not-break" contracts (every batch)
Inventory / Forecast / Gap values · Recommendation & AI-Plan persisted qty · Request Order qty · PO
ordered/completed/shipped/remaining · FIFO allocation · Factory Stock · Shipment qty · Receipt qty · incoming remaining
· shipment-map state · Final Output values · generated-document values · automation trigger semantics. **PASS iff
BEFORE == AFTER on the same fixture.**

## §14 Per-batch version discipline (report every batch)
PRE HEAD · POST HEAD · files changed · API contract delta · Apps Script sync? · new /exec version? · frontend deploy? ·
bundle rebuild? · schema impact (expected NONE) · tests · rollback point. **No giant unversioned migration** — one
bounded, reversible batch at a time; local commit only (RG-1), USER owns push/deploy.

## Known deferred (not blockers): SNAPSHOT_VERSIONING_ACTIVATION · COMPANY_LEGAL_ENTITY_VERSION_IDENTITY ·
FINAL_OUTPUT_RELATIONSHIP_RESOLVED_DISPLAY_AUDIT · PO_DOCUMENT_IMMUTABILITY_AUDIT · Weekly Inventory actionable-draft
persistence · Automation Last-Run UI · 4 known baseline test failures. `F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED` (ledgers
preserved; resumes after this migration's final gate).

## Recommended next slice
**BATCH A** (shared scoped-read + loading + scoped-invalidation infra) — smallest, unblocks all others, zero page
behavior change. Then **BATCH B** (activate the already-built `weeklyShipping` workspace + drop the `app.js` global
prime) for the first visible first-paint win.
