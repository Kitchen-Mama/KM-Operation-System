# F1-7E-PREREQ-1-OPEN-PO-REMAINING-SCOPED-OWNER-R1 — AI-Plan Layer-1 raw read owner

**Outcome: IMPLEMENTED (backend scoped raw-fact read owner; BEFORE FACT == AFTER FACT proven).** Baseline HEAD `13f4b92`.
A new backend owner exposes the AI-Plan Layer-1 RAW OPERATIONAL FACT `open_po_remaining_raw_qty` per SKU, provably equal
to the current browser `ongoing()` fact. **No AI-Plan cutover** — `request-order.js` still uses its broad-cache path. No
PO/Recommendation/Gap/Forecast/Inventory logic changed; F1-7C `50_` untouched.

## Owner placement decision
**New dedicated owner `52_api_v1_open_po_remaining_owner.gs`** (action `openPoRemaining.raw.get`), NOT folded into
`50_ purchaseOrder.workspace`. Rationale (per the PREREQ-0 fact contract): `50_` owns the **canonical** PO-line
`remaining_qty = max(0, completed − shipped)`; this owner exposes a **different, Layer-1 informational** fact with a
**different per-line rule** (persisted `remaining_qty` preferred, else the browser fallback) and a **different grain**
(per SKU, OPEN-PO statuses, company-independent). Sharing `50_`'s helper would blur two authority classes
(`DUPLICATE_FACT_AUTHORITY` risk). Least duplication + clearest authority + cleanest PREREQ-5 composition + no circular
ownership. `52_` is self-contained (its own trivial numeric helpers) and reads only PO tables. **`50_` is not modified.**

## Frozen fact contract (extracted verbatim from `request-order.js` `ongoing()`)
`open_po_remaining_raw_qty(sku)` =
1. Group `purchase_order_lines` by `UPPER(TRIM(sku))` — **company-INDEPENDENT** (the raw factory pipeline is a shared
   pool per SKU, exactly like factory stock; consistent with the PREREQ-0 Layer-1 classification).
2. Keep a line only if its parent PO status `LOWER(TRIM(order_status || status))` ∈ the frozen **OPEN set**:
   `issued, in_production, partial_completed, partial_shipped, ready_to_ship, confirmed` (verified byte-identical to
   `request-order.js` `RO_OPEN_PO_STATUS` — **no `OPEN_PO_STATUS_CONTRACT_MISMATCH`**).
3. Per-line remaining = persisted `remaining_qty` when the raw cell is present (not `''`/null), **ELSE** the current
   browser fallback `max(0, ordered_qty − max(shipped_qty, completed_qty))` — **PDR-1 = OPTION (a)**: preserve current
   behavior; do NOT substitute the canonical `max(0, completed − shipped)` on blank rows (a future business-cleanup task).
4. Add the per-line value to the SKU total only when `> 0`.
5. `openPoRemainingRawQty` = that total. **ZERO contract:** no OPEN-PO contribution → `0` (browser returns `null`→"--";
   the numeric raw fact is `0`; the display convention is preserved by the PREREQ-5 composer). ERROR ≠ EMPTY ≠ ZERO —
   transport/backend failure fails closed with an error envelope, never `0`.

## Authority distinction (why `openPoRemainingRawQty`, not `remainingQty`)
The DTO field is deliberately named `openPoRemainingRawQty` (Layer-1 aggregate, OPEN-status, per SKU, company-independent),
NOT `remainingQty` (which already carries the F1-7C PO-**line** canonical semantic). Never interchange them.

## Scope contract (company independence)
Current `ongoing()` aggregates **per SKU across all companies** (it does not filter by company/country/marketplace). This
is INTENDED (shared factory pipeline; the shared-pool principle from PREREQ-0: raw pool is company-independent, only
*allocated* supply is company-scoped) — **not a defect** (no `CURRENT_SCOPE_DEFECT_FOUND`). The owner therefore takes
`{ skus: [...] }` as the primary grain; `scope.company/country/marketplace` are **echoed for context only and never
filter the aggregate**. Proven: a scope `{company:'ResTW'}` does NOT filter out a KM PO's remaining. `factory_id` never
determines company; KM/ResTW/ResUS remain independent (a shared factory's three companies' open POs each contribute their
own remaining to the same SKU raw pool — see the shared-factory fixture).

## API grain
- **Action:** `openPoRemaining.raw.get` (router dispatch added). **Tables read:** `purchase_orders`,
  `purchase_order_lines` ONLY (never `getOperationDb`; no shipment/FIFO/forecast/gap/inventory tables).
- **Input:** `{ skus?: [...], scope?: {...} }`. With `skus` → exactly those (0 for no-match; caller SKU spelling echoed).
  Without `skus` → every SKU present on an OPEN-eligible line (bounded by `OPR_MAX_SKUS_ = 5000`, `truncated` flag).
- **Output:** `{ scope, statusSet, fallbackFormula, items:[{ sku, openPoRemainingRawQty }], count, truncated }`.
- Discipline mirrors `40_`/`50_`: pure `oprBuild_` + injectable `io`; S0/S0.5 exact-ID + validate-only presence;
  fail-closed. Read-only; writes nothing; derives no `shipped_qty`; runs no FIFO.

## BEFORE == AFTER equivalence (gold-standard)
`api-open-po-remaining-owner-f1-7e-prereq1-r1.test.js` **28/0**. The harness runs the **actual** browser `ongoing()`
(extracted from `request-order.js`) over records produced by the **actual** db-api normalizers
(`normalizePurchaseOrderRecord`/`…Line`), and the **actual** backend `oprBuild_` over the raw rows, asserting
`backend === (browser === null ? 0 : browser)` per SKU. Covered: persisted present, blank→fallback, multi-OPEN same SKU,
OPEN+CLOSED+cancelled+closure mixture, shipped<completed, shipped>completed, boundary/zero, no-match/unknown SKU,
multi-SKU, **KM/ResTW/ResUS shared-factory** (SHARED = 100+200+30 = 330, company-independent), status case/legacy-`status`
normalization, invalid/blank numeric cells. Plus: OPEN status set == source; PDR-1 fallback ≠ canonical
`max(0, completed − shipped)` (no silent convergence); ZERO/empty/scope-echo contract; source guards (no getOperationDb /
no write / no second engine / does not reuse `50_ poLineRemaining_`); `50_` canonical formula unchanged;
`request-order.js` still uses `ongoing()` + broad cache and does NOT yet consume the new owner.

## No AI-Plan cutover (this round)
`request-order.js` unchanged: still calls `ongoing()`, still `loadOperationDb({force:true})`, no UI/loading/qty/allocation
change. The owner is composed later in PREREQ-5. No frontend/db-api/foundation wiring → no `UNEXPECTED_FRONTEND_DEPENDENCY`.

## Tests / regression
PREREQ-1 suite 28/0; F1-7C PO workspace suite 56/0; foundation/router/RO/AI-Plan contract suites green. **Full regression:
220 files, only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## Deployment / version
- **PRE HEAD** `13f4b92` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `52_api_v1_open_po_remaining_owner.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** (new router action + handler). No deploy-ordering hazard: nothing consumes the action
  yet (no canonical-ON frontend), so it can be deployed independently ahead of PREREQ-5.
- **Frontend deploy: NO.** **Bundle rebuild: NO** (`52_` is not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `openPoRemaining.raw.get` (new READ owner); no existing route/DTO changed; `50_`
  untouched.
- **Rollback:** revert this commit (removes `52_` + the router dispatch); nothing depends on it.

## Prerequisite status
PREREQ-0 = DONE · **PREREQ-1 = DONE** · PREREQ-2 = NOT_STARTED · PREREQ-3 = NOT_STARTED · PREREQ-4 = NOT_STARTED ·
PREREQ-5 = NOT_STARTED. F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).

## FINAL GATE — PASS
`openPoRemainingRawQty` == the current AI-Plan Open-PO Remaining fact for the same fixture/scope ✓ · no frontend cutover ✓
· no PO business logic changed ✓ · no planning engine duplicated ✓ · no broad DB ✓ · company independence preserved ✓.

**Exact next task:** **PREREQ-2 — fcSummary scoped raw-forecast owner** (raw `fc_regular_forecast` window Σ + raw
`fc_special_events` prep-month Σ as separate Layer-1 facts; honor PDR-2 time-anchor; no Target%/blend). Do NOT begin
automatically.
