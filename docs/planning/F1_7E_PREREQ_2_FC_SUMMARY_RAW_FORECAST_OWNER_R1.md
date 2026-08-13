# F1-7E-PREREQ-2-FC-SUMMARY-RAW-FORECAST-OWNER-R1 — AI-Plan Layer-1 raw forecast read owner

**Outcome: IMPLEMENTED (backend scoped raw-forecast read owner; BEFORE FACT == AFTER FACT proven).** Baseline HEAD
`5424585`. A new backend owner exposes two AI-Plan Layer-1 RAW facts — `basicFcRawT3Qty` (raw regular-forecast N+1..N+3
sum) and `specialEventFcRawQty` (raw special-event prep-month sum) — per SKU/site/planning_cycle, provably equal to the
current browser `basicT3()` + `_roSpecialEventsTotal()`. **No AI-Plan cutover.** No Target%, no blending, no
Recommendation/Gap/Forecast-engine change.

## Owner placement
**New dedicated owner `53_api_v1_fc_summary_raw_owner.gs`**, action **`fcSummary.raw.get`**. Reads ONLY
`fc_regular_forecast` + `fc_special_events`. Deliberately named `fcSummary.raw.get` (NOT `.workspace.get`) so this bounded
raw read does NOT claim or collide with the future full `fcSummary` **workspace** (which `fc-summary.js` will need, with
target rules/campaigns) — no `EXISTING_FC_SUMMARY_AUTHORITY_CONFLICT`. It is NOT a forecast engine: it sums PERSISTED
forecast rows exactly as the browser does. Consistent with the PREREQ-1 dedicated-owner pattern; no foundation/frontend
registration (PREREQ-5 composes it).

## PDR-2 resolved — time authority = `planning_cycle`
The N+1..N+3 window is derived from `planning_cycle = "RECO-YYYY-MM"` (**REQUIRED**), never the server/browser clock.
`anchor` = the cycle month; `window[i] = anchor + 1 + i` (i=0..2) with year wrap — **identical to the browser
`_roMonthWindow(1, 3)`** anchored to the cycle month. No existing canonical `RECO-YYYY-MM` window parser exists in the
repo (`planning_cycle` is only an opaque scope key elsewhere), so it is parsed inline (`/^RECO-(\d{4})-(\d{1,2})$/`,
month 1–12) and **fails closed** (`VALIDATION_FAILED`) on malformed input — never a silent clock fallback. Year-crossing
proven: `RECO-2026-10 → Nov 2026/Dec 2026/Jan 2027`; `RECO-2026-11 → Dec/Jan/Feb`; `RECO-2026-12 → Jan/Feb/Mar 2027`.

## Frozen fact contracts (extracted verbatim; no formula invented)
**Basic FC (`basicFcRawT3Qty`)** = reproduce `basicT3(sku, country, marketplace)`: group `fc_regular_forecast` by
`UPPER(sku)|UPPER(country)|LOWER(marketplace)` (**company does NOT participate** — matches the browser key); per window
month pick the row whose `String(year)===String(window.year)` else the first row; add `parseFloat(row[monthKey])||0`
(monthKey ∈ jan..dec). `0` when no rows (browser `null` → raw fact `0`; the "--" display is preserved by the PREREQ-5
composer). RAW — **not** Target%-adjusted, **not** blended, **not** planning demand.

**Special Event FC (`specialEventFcRawQty`)** = reproduce `_roSpecialEventsTotal({sku, company, country, marketplace})`:
scope-match each event (`skuMatch` = `sku` OR `scope_type='sku'`+`scope_id`; `company`/`country`/`marketplace` filter
**only when both event and scope carry the field** — conditional wildcard; drop dead statuses
`{inactive,deleted,archived,cancelled,void}`; **company DOES participate** — asymmetry with Basic preserved); prep-month =
`UTC(event_start_date) − 30 days` (with the free-text-period start fallback ported verbatim from the normalizer's
`_fcParseEventPeriodDates`); if the prep `YYYY-MM` is in the window add `parseFloat(fc_qty||qty)||0` — **100%, each event
once, never Target%-multiplied**. `0` when no scoped events. **Basic and Special stay SEPARATE facts — never blended.**

## Scope contract (audited, preserved)
- **Basic:** `sku|country|marketplace` (company-independent). **Special:** `sku`+`company`+`country`+`marketplace` with
  conditional wildcard (blank fields don't filter). This asymmetry is the CURRENT browser semantic — deterministic, not
  ambiguous (no `RAW_FORECAST_SCOPE_CONTRACT_AMBIGUOUS`). `factory_id` is irrelevant to forecast (not read).
- Input `scope.company` is applied to Special only; Basic ignores it (proven: KM and ResTW scopes give the same
  `basicFcRawT3Qty`).

## API grain
- **Action:** `fcSummary.raw.get` (router dispatch added). **Tables read:** `fc_regular_forecast` + `fc_special_events`
  ONLY, **missing-safe** (a missing/unprovisioned FC table → `[]` → 0 facts, never an error — matching the browser's
  `_opDbCache` []-on-missing; ERROR ≠ EMPTY ≠ ZERO for transport failures). Never `getOperationDb`.
- **Input:** `{ planning_cycle (required), scope:{country, marketplace, company?}, skus:[...] }` (per-site call).
- **Output:** `{ planningCycle, anchorMonth, windowMonths:[...], scope, items:[{ sku, basicFcRawT3Qty,
  specialEventFcRawQty }], count }`. RAW qualifiers retained in field names (never a bare `forecastQty`).
- Discipline mirrors `40_`/`50_`/`52_`: pure `fcrBuild_` + injectable `io`; S0/S0.5 exact-ID + validate-only presence;
  fail-closed on malformed cycle. Read-only; writes nothing; no second forecast engine.

## BEFORE == AFTER equivalence (gold-standard)
`api-fc-summary-raw-owner-f1-7e-prereq2-r1.test.js` **40/0**. The harness runs the **actual** browser `basicT3()` +
`_roSpecialEventsTotal()` (extracted, with a **frozen** `_roTpeNow` anchor == `planning_cycle`) over records from the
**actual** db-api normalizers (`normalizeFcRegularForecastRecord`/`…SpecialEvent`/`_fcParseEventPeriodDates`), and the
**actual** backend `fcrBuild_` over the raw rows, asserting `backend === (browser === null ? 0 : browser)` for both facts.
Covered: single/multi-SKU, one/multi-site strict scoping, regular-only, special-only, both, zero/missing, invalid numeric
cells, duplicate rows, exact prep-month boundary, event exactly outside window, year crossing, blank country/marketplace,
company filter on special + scope_type='sku' via scope_id, multiple events, 100%-quantity, Basic-ignores-company,
Target%-isolation (structural: 53_ reads no `fc_target_rules`/no KMPD adjusted demand), Basic/Special separateness, and
ZERO/EMPTY/ERROR + missing-table contracts. Source guards: no getOperationDb/write/second-engine/PO/gap tables; bounded
raw action (does not claim `.workspace.get`); `request-order.js` still owns `basicT3()`/`_roSpecialEventsTotal()` + broad
cache and does NOT yet consume the owner.

## No AI-Plan cutover (this round)
`request-order.js` unchanged: still `basicT3()`, `_roSpecialEventsTotal()`, `loadOperationDb({force:true})`; no UI/loading/
Suggest-Order/Target-Rules/recommendation/draft change. Owner composed later in PREREQ-5. No frontend/db-api/foundation
wiring → no `UNEXPECTED_FRONTEND_DEPENDENCY`.

## Tests / regression
PREREQ-2 suite 40/0; PREREQ-1 28/0; recommendation/gap/order-planning + foundation/router suites green. **Full regression:
221 files, only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## Deployment / version
- **PRE HEAD** `5424585` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `53_api_v1_fc_summary_raw_owner.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** (new router action + handler). No deploy-ordering hazard: nothing consumes the action
  yet — deploy independently ahead of PREREQ-5.
- **Frontend deploy: NO.** **Bundle rebuild: NO** (`53_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `fcSummary.raw.get`; no existing route/DTO changed; KMPD/recommendation/gap untouched.
- **Rollback:** revert this commit (removes `53_` + the router dispatch); nothing depends on it.

## Prerequisite status
PREREQ-0 = DONE · PREREQ-1 = DONE · **PREREQ-2 = DONE** · PREREQ-3 = NOT_STARTED · PREREQ-4 = NOT_STARTED ·
PREREQ-5 = NOT_STARTED. F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).

## FINAL GATE — PASS
`basicFcRawT3Qty` == current AI-Plan Basic FC fact ✓ · `specialEventFcRawQty` == current Special Event FC fact ✓ (same
frozen cycle/scope) · no Target% ✓ · no blending ✓ · no frontend cutover ✓ · no Forecast/Recommendation engine
duplicated ✓ · no business formula change ✓ · no broad DB read ✓.

**Exact next task:** **PREREQ-3 — scoped raw-inventory read owner** (raw per-SKU `amazon_inventory_snapshot` latest strict
scope + `overseas_inventory_snapshot` Σ + `factory_stock` Σ; raw pools only, no allocation). Do NOT begin automatically.
