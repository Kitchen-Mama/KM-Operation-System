# F1-7E-PREREQ-4-LEAD-TIME-SCOPED-OWNER-R1 — AI-Plan Layer-1 lead-time read owner

**Outcome: IMPLEMENTED (backend scoped lead-time read owner; BEFORE FACT == AFTER FACT proven).** Baseline HEAD
`9342904`. A new backend owner exposes the AI-Plan Layer-1 reference fact `leadTimeDays` per SKU, provably equal to the
current browser `leadTime()`. **No AI-Plan cutover.** No lead-time business semantic changed. With this, **PREREQ-0..4
collectively cover every Layer-1 AI-Plan fact** — see the PREREQ-5 readiness map below.

## Phase 1 — Frozen current lead-time semantic (extracted verbatim from `request-order.js` `leadTime(sku)`)
1. **Source table:** `supplier_price_list`.
2. **SKU identity:** group by `UPPER(TRIM(sku))`.
3–7. **company / country / marketplace / supplier / factory participation:** **NONE** — `leadTime(sku)` takes only sku.
8. **Active filter:** keep rows where `LOWER(TRIM(is_active)) ∈ {active, true, yes, 1}` (`_roIsActiveFlag`); blank/other
   is_active is NOT active.
9. **Row selection:** sort active rows by `effective_from` DESCENDING via `String(b).localeCompare(String(a))`; take the
   FIRST (latest `effective_from`).
10. **Duplicate rows:** all active rows compete; the latest `effective_from` wins.
11–12. **lead_time_days field / normalization:** the selected row's `lead_time_days`: NULL when blank (`''`/null); else
   `parseFloat(lead_time_days) || 0` (present-but-invalid → 0; real 0 → 0).
13. **Missing-row behavior:** no rows / no active rows → NULL.
14. **Zero vs null:** a real 0-day lead time is `0`; "no active row" or a blank cell is `null` — **EMPTY (null) ≠ ZERO
   (0)** (the browser shows "--" for null).
15. **Tie-breaking:** equal `effective_from` → **stable sort** keeps the original (sheet) order → the first active row in
   sheet order wins. Both the browser (V8) and Apps Script (V8) use a stable `Array.sort` and identical `localeCompare`
   on ASCII date strings — deterministic and identical.

Deterministic → **no `LEAD_TIME_CURRENT_SEMANTIC_AMBIGUOUS`**; no defect found → **no `CURRENT_BROWSER_LEAD_TIME_BUG_FOUND`**.

## Phase 3 — Reuse audit
No existing backend owner exposes `supplier_price_list.lead_time_days` at this grain/semantic: the recommendation/gap
backends read no `supplier_price_list`; the two `lead_time` hits in Apps Script (`17_carrier_handlers`,
`03_master_data_handlers`) are carrier transit / master-data, a different concept. Reuse would change the fact →
avoided. **No `LEAD_TIME_OWNER_CONFLICT` / `BEFORE_AFTER_NOT_EQUIVALENT`.**

## Phase 4 — Owner placement
**New dedicated owner `55_api_v1_lead_time_owner.gs`**, action **`leadTime.raw.get`**. Bounded lookup, not an engine.
Reads ONLY `supplier_price_list` (missing-safe). Consistent with PREREQ-1/2/3.

## Phase 5 — Grain & scope matrix
- **Input:** `{ scope:{company?, country?, marketplace?, factory_id?, supplier_id?}, skus:[...] }`.
- **Scope matrix:** `sku` = **REQUIRED_FILTER** (group key); `company`, `country`, `marketplace`, `factory_id`,
  `supplier_id` = **CONTEXT_ONLY** (echoed, never filter — `leadTime()` uses only sku). Proven: a KM scope and a ResTW
  scope return the same lead time; all five extra dimensions ignored.
- **Output:** `{ scope, items:[{ sku, leadTimeDays }], count }`. **Output field:** `leadTimeDays` (number or **null**;
  null = EMPTY, distinct from 0). Batch — one call answers many SKUs, no N+1.

## Phase 7 — Zero / empty / error
Valid → number; no active/applicable row or blank `lead_time_days` → `null`; unknown SKU → `null`; invalid numeric on the
selected row → `0`; real 0 → `0`; missing `supplier_price_list` table → `null` facts (graceful-empty, matching the browser
`_opDbCache` []-on-missing); transport/backend failure → **error envelope** (never a number/null fact). **ERROR ≠ EMPTY ≠
ZERO.**

## Phase 8 — BEFORE == AFTER equivalence (gold-standard)
`api-lead-time-owner-f1-7e-prereq4-r1.test.js` **27/0**. The harness runs the **actual** browser `leadTime()` (extracted)
over records from the **actual** db-api `normalizeSupplierPriceListRecord`, and the **actual** backend `ltoBuild_` over the
raw rows, asserting exact equality (`null` stays `null`; `0` stays `0`). Covered: single active + zero-vs-null,
latest-`effective_from` selection, active/inactive filter (newer inactive excluded), multi-supplier (SKU-only),
company-independence, same-date tie (stable → first), multi-SKU, blank→null, invalid→0, all-inactive→null, full scope
matrix ignored, ZERO/EMPTY/ERROR + missing-table. Source guards: no getOperationDb/write/second-engine/cross-domain
(no forecast/inventory/PO/gap/recommendation/KMPS-KMHP-KMTPP reads); `supplier_price_list`-only scope; qualified
`leadTimeDays` field; `request-order.js` still owns `leadTime()` + broad cache and does NOT yet consume the owner.

## Phase 9/10 — No cutover / cross-domain guards
`request-order.js` unchanged (still `leadTime()` + broad cache). 55_ performs no Forecast/Gap/Recommendation/allocation,
reads no inventory/PO/factory/shipment tables, writes nothing, and makes no factory↔company inference (neither is read).
No `UNEXPECTED_FRONTEND_DEPENDENCY`.

## Phase 14 — PREREQ-5 readiness map (audit; do NOT build)
Every AI-Plan first-layer fact now has a backend authority:

| Fact | Owner | Action | Input grain | Output field | READY |
|---|---|---|---|---|---|
| Basic FC | `53_` | `fcSummary.raw.get` | `{planning_cycle, scope:{country,marketplace,company?}, skus}` | `basicFcRawT3Qty` | **YES** |
| Special Event FC | `53_` | `fcSummary.raw.get` | (same call) | `specialEventFcRawQty` | **YES** |
| Site Stock | `54_` | `rawInventory.get` | `{scope:{country,marketplace,company?,factory_id?}, skus}` | `siteStockRawQty` | **YES** |
| Overseas Stock | `54_` | `rawInventory.get` | (same call) | `overseasStockRawQty` | **YES** |
| Factory Stock | `54_` | `rawInventory.get` | (same call) | `factoryStockRawQty` | **YES** |
| Open PO Remaining | `52_` | `openPoRemaining.raw.get` | `{skus, scope?}` | `openPoRemainingRawQty` | **YES** |
| Lead Time | `55_` | `leadTime.raw.get` | `{skus, scope?}` | `leadTimeDays` | **YES** |
| Gap (T1–T4) | `43_` | `orderPlanningGap.get` (materialized) | `{company, country, marketplace(, sku)}` | `rows[].t{1..4}_gap_qty/_suggested_qty` | **YES (already consumed)** |
| Recommendation | `42_` | `recommendation.workspace.get` | `{scope, filters, pagination, include}` | `lines[]` (recommendedQty, calculatedGap, …) | **YES (already consumed)** |

**Any remaining Layer-1 fact lacking a backend authority: NONE.** PREREQ-5 can proceed as a pure COMPOSER (no new
formula/engine).

**Browser functions removable/dormant ONLY AFTER PREREQ-5 equivalence is proven (do NOT remove now; first verify no other
page/panel consumes the shared helpers):** `basicT3`, `_roSpecialEventsTotal` (+ `_roScopedActiveEvents`,
`_roEventScopeMatch`, `_roEventPrepMonth`, `_roParseDate`, `_roNextMonths`/`_roMonthWindow`/`_roTpeNow`, `_roYmKey`),
`siteStock`, `thirdParty`, the `factoryBySku` accumulation, `ongoing`, `leadTime`, and the broad-cache table reads inside
`_buildRequestOrderRowsFromDb` (→ replaced by composing the owners above + the already-scoped Gap/Recommendation).

## Tests / regression
PREREQ-4 suite 27/0; PREREQ-1 28/0; PREREQ-2 40/0; PREREQ-3 46/0; procurement/supplier + recommendation/gap +
foundation/router suites green. **Full regression: 223 files, only the 4 known baseline failures (none new).** Bundle
unchanged (`aaf5b07`, --check PASS).

## Deployment / version
- **PRE HEAD** `9342904` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `55_api_v1_lead_time_owner.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** (new router action + handler). No deploy-ordering hazard — nothing consumes it yet;
  deploy independently.
- **Frontend deploy: NO.** **Bundle rebuild: NO** (`55_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `leadTime.raw.get`; no existing route/DTO changed.
- **Rollback:** revert this commit (removes `55_` + the router dispatch); nothing depends on it.

## Prerequisite status
PREREQ-0 = DONE · PREREQ-1 = DONE · PREREQ-2 = DONE · PREREQ-3 = DONE · **PREREQ-4 = DONE** · PREREQ-5 = NOT_STARTED.
F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).

## FINAL GATE — PASS
`leadTimeDays` == current AI-Plan `leadTime()` fact for the same fixture/scope ✓ · no lead-time business semantic changed
✓ · no planning engine duplicated ✓ · no frontend cutover ✓ · no broad DB read ✓ · PREREQ-0..4 cover every Layer-1
AI-Plan fact ✓ · PREREQ-5 readiness map has NO missing authority ✓.

**Exact next task:** **F1-7E-PREREQ-5-AI-PLAN-FIRST-LAYER-COMPOSER-AND-CUTOVER-R1** — compose owners `52_`/`53_`/`54_`/`55_`
+ the already-scoped Gap/Recommendation into ONE scoped AI-Plan first-layer read model and cut `request-order.js`'s
first-layer render off `_opDbCache`. Do NOT begin automatically.
