# Weekly Shipping Plan — Five-Handler Source Reconciliation (Round WSR-1, 2026-08-04)

> **Round:** WSR-1 — READ-ONLY audit + documentation. Reconciles the five Weekly Shipping Plan actions API-0 flagged as handler-missing. **No JS/GS/HTML/CSS/DB changed; no live execution.**
> **Repo/HEAD:** `Operation System` @ `d7a10f8`. **Method:** current-mirror source + `git log -S` history across all commits + router/adapter/UI/spec inspection. Evidence keys per action: SOURCE-PROVEN_CURRENT · SOURCE-PROVEN_HISTORICAL · TEST-PROVEN · SPEC-SUPPORTED · LIVE-DEPLOYMENT_UNKNOWN · NOT_FOUND.

---

## 0. Headline reconciliation

| # | Action | Handler in mirror | Ever committed? (git -S) | Engine/logic present? | Spec contract | Reachability | API v1 disposition |
|---|---|---|---|---|---|---|---|
| 1 | `getWeeklyPlanRateCandidates` | **absent** | **never** (0 commits) | **YES — orphaned** `shippingRoughRateCandidates_` (`17:629`) + `shippingRateMatch_` (`17:532`), 0 callers | SPEC-SUPPORTED (§3.1A) canonical | ROUTER_ONLY + ADAPTER_ONLY (engine SOURCE-PROVEN_CURRENT but unwired) | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE |
| 2 | `updateShippingPlanRationale` | **absent** | **never** | no write engine found | SPEC-SUPPORTED (§3.1A L1) canonical | ROUTER_ONLY + ADAPTER_ONLY | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE |
| 3 | `selectShippingPlanCarrier` | **absent** | **never** | candidate shape ready (`shippingRoughRateCandidates_`); no persist handler | SPEC-SUPPORTED (§3.1A L2) canonical | ROUTER_ONLY + ADAPTER_ONLY | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE |
| 4 | `combineShippingPlans` | **absent** | **never** | data-model + dormant submit-guard only | **SPEC-SUPERSEDED** (B-2, §3.1A/§4.3) | ROUTER_ONLY + ADAPTER_ONLY | **DEAD_OR_LEGACY_CANDIDATE** + REQUIRES_USER_DECISION |
| 5 | `uncombineShippingPlans` | **absent** | **never** | dormant submit-guard reference only | **SPEC-SUPERSEDED** (B-2) | ROUTER_ONLY + ADAPTER_ONLY | **DEAD_OR_LEGACY_CANDIDATE** + REQUIRES_USER_DECISION |

**No action is IMPLEMENTED_HISTORICALLY_BUT_MISSING_CURRENTLY** — `git log -S"function handle<X>_" --all` returns **0 commits** for all five handler names. They have never existed in committed source; they are **router + adapter stubs** added on **2026-07-28** in commit `b7a216d` ("0728_backup_submit"), together with contract comments. No active UI caller exists; not present in `backup_legacy_files_20260116/`.

---

## 1. Evidence by artifact (SOURCE-PROVEN_CURRENT unless noted)

- **Router** (`01_router.gs:112-126`): all five registered in `doPost` with contract comments — L2 rate "user picks; never auto-selected", L1 "clears carrier/cost, bumps version", L2 select "snapshot carrier+rate+cost; NO rate_card_id". Each dispatches to a `handle…_` that **is not defined** → at runtime the mirror returns `{success:false, error:'…is not defined'}` (caught by the doPost try/catch).
- **Adapter** (`operation-system-db-api.js:2735-2743`): all five exposed via `window.KM.DB.*` → `_kmShippingPost_(action,…)`. Read one (`getWeeklyPlanRateCandidates`, `reloadAfter=false`); four writes (`reloadAfter=true`).
- **Active UI**: **none** — `grep` of `assets/js/pages/**` + `assets/html/**` for all five names + `KM.DB.<action>` = 0 hits. The Weekly Shipping Plan page (`shipping-plan.js`) renders/uses only status/qty/note/complete controls (API-0 F1). No carrier-select / rate-candidate / combine UI is rendered.
- **Git history**: `git log --oneline -S"function handleGetWeeklyPlanRateCandidates_" --all` (and the other four) = **0**. `git log -S"getWeeklyPlanRateCandidates"` on router + adapter → both first appear in `b7a216d` (2026-07-28).
- **Tests**: `shipping-plan-runtime.test.js` contains **no** reference to the five handler/action names (NOT TEST-PROVEN).
- **Sibling reference**: `getShippingMethodCandidates` → `handleGetShippingMethodCandidates_` (`17:663`) **IS** implemented (method/last-mile/customs cascade), proving the pattern — but it does **not** call the rate engine.

---

## 2. Action 1 — `getWeeklyPlanRateCandidates` (rate candidates)

- **Status:** engine SOURCE-PROVEN_CURRENT but **ORPHANED**; HTTP handler **NOT_IMPLEMENTED** (never committed).
- **Engine present:** `shippingRoughRateCandidates_(ss, criteria)` (`17_carrier_handlers.gs:629`) → `shippingRateMatch_(ss,{mode:'rough',originCountry,destinationCountry,batteryType,quoteDate,shippingMethod,lastMile,customsType})` (`17:532`). Returns per-card candidates: `{ rate_card_id (transient — "NOT persisted"), carrier_id, carrier_name, charge_type, charge_unit, unit_rate, min_charge, fuel_surcharge, customs_fee, import_duty_treatment, customs_type, currency }`. Per-card cost via `shippingFreight_` (weight/volume/carton/shipment; min-charge floor; fuel = base × surcharge%).
- **Canonical contract (SPEC-SUPPORTED, §3.1A):** rough mode = recommendation set + method + last_mile + customs → Weekly Layer-2 candidates. **If >1 card qualifies, the user chooses; the engine NEVER auto-selects / auto-cheapest / auto-first.** Excludes non-matching cards via `shippingRateMatch_` (effective-date / battery / route / method filters live in the matcher).
- **Missing piece:** a thin `handleGetWeeklyPlanRateCandidates_(body)` that maps body criteria (+ plan/lines measures) → `shippingRoughRateCandidates_` → `{success,data:{candidates,…}}`. Read-only; no lock.
- **Tables read:** `carrier_rate_cards` (matcher), `carriers` (name via `shippingCarrierNameById_`), plan/line measures from `shipping_plans`/`shipping_plan_lines`. **Writes:** none.

## 3. Action 2 — `updateShippingPlanRationale` (Layer-1)

- **Status:** NOT_IMPLEMENTED (no handler, no write engine).
- **Canonical contract (SPEC-SUPPORTED, §3.1A "Layer 1 — Plan Rationale"):** stores `shipping_method` + `last_mile_delivery` + `customs_type` (CODES; display at render). **Any Layer-1 code change OR a warehouse-endpoint change CLEARS** `carrier_id` / `carrier_unit_rate` / `carrier_rate_type` / `import_duty_treatment` / `estimated_freight_cost` / `estimated_duty` / `estimated_customs_fee` / `estimated_total_cost` / `currency` **and bumps `plan_version`** (re-quote required). `customs_type` = export-side arrangement only; **never** decides Duty. Text-only `note` is append-only via `appendShippingPlanNote` (a **separate** implemented action — not an execution-condition change).
- **Invalidation split:** (A) execution-condition change (method/last_mile/customs/warehouse) → clear carrier+cost + bump version + require fresh candidate lookup; (B) reason/note text → no invalidation (already served by `appendShippingPlanNote`).
- **Data model ready:** all target columns exist on `shipping_plans` (§table map). **Tables written:** `shipping_plans`. Lock recommended (concurrent decision edits).

## 4. Action 3 — `selectShippingPlanCarrier` (Layer-2)

- **Status:** NOT_IMPLEMENTED (no persist handler); candidate shape provided by Action-1 engine.
- **Canonical contract (SPEC-SUPPORTED, §3.1A "Layer 2 — Carrier & Cost"):** snapshots the chosen candidate's `carrier_id`, `unit_rate → carrier_unit_rate`, `charge_type → carrier_rate_type`, `import_duty_treatment`, `currency`, and computes Phase-1 cost (`estimated_*`). **`rate_card_id` is NOT stored on the plan** (re-resolved at Shipment exact match). **`carrier_name` is NEVER stored** (resolve `carrier_id → carriers.carrier_name` at render). Selection must belong to the current plan conditions; a stale quote / plan-version mismatch must **fail closed**. Carrier display name is not the identity.
- **Data model ready:** `carrier_id`, `carrier_unit_rate`, `carrier_rate_type`, `import_duty_treatment`, `estimated_*`, `currency`, `plan_version` all on `shipping_plans`. **Tables written:** `shipping_plans`. Lock recommended.

## 5. Action 4 — `combineShippingPlans` (SUPERSEDED)

- **Status:** NOT_IMPLEMENTED **and SPEC-SUPERSEDED**.
- **Canonical reconciliation (SPEC-SUPPORTED, §3.1A + §4.3 + v1.13 changelog, B-2 resolved 2026-07-31):** a "Combined Plan" is now simply **a single `shipping_plan` whose effective lines span ≥2 marketplaces → `marketplace = MULTI` (derived)**, produced **directly by the five-value Shipping Group Key at Submit** (Marketplace is not in the Key, so different-marketplace lines on the same route land in the same plan automatically). **"No separate 'combine two plans' action, and no parent/child plan rows, are required."** `parent_shipping_plan_id` is **version-lineage ONLY (MVP = self)** — never Combined-Plan membership. The interim `combineShippingPlans` parent/child overload is **explicitly SUPERSEDED**.
- **Source drift note:** a **dormant** submit-guard survives in `11_shipping_plan_handlers.gs:546-551` ("a CHILD … cannot be submitted/approved/cancelled … uncombine first"). Because `parent_shipping_plan_id` is MVP = self, `parentRef !== planId` is never true → the guard never fires. It is a vestige of the superseded model, not an active combine implementation.
- **Disposition:** DEAD_OR_LEGACY_CANDIDATE. Do **not** implement as designed. REQUIRES_USER_DECISION: keep the router/adapter stub as a no-op, remove it, or repurpose — a later cleanup task, not WSR-1.

## 6. Action 5 — `uncombineShippingPlans` (SUPERSEDED)

- **Status:** NOT_IMPLEMENTED **and SPEC-SUPERSEDED** (same B-2 basis as Action 4).
- **Canonical reconciliation:** with combined plans represented by derived `MULTI` (not parent/child rows), there is nothing to "uncombine" at the plan-row level; scope changes are handled by the Group-Key re-derivation at Submit and by line-qty edits (which bump `plan_version` + clear carrier/cost, §3.1A). No post-approval uncombine behavior is defined (and none should be invented).
- **Disposition:** DEAD_OR_LEGACY_CANDIDATE + REQUIRES_USER_DECISION (retire the stub in a later cleanup).

---

## 7. Reachability matrix

| Action | Router | HTTP | Adapter | UI caller | Backend caller | Handler | Source file | Tests | Reads | Writes | KMSAFE | Lock | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| getWeeklyPlanRateCandidates | ✔`01:112` | POST(read) | ✔`api:2735` | ✖ | ✖ (engine orphaned) | absent | engine `17:629` | ✖ | carrier_rate_cards, carriers | — | inherits (read) | none | ROUTER_ONLY + ADAPTER_ONLY; engine SOURCE-PROVEN_CURRENT |
| updateShippingPlanRationale | ✔`01:115` | POST | ✔`api:2737` | ✖ | ✖ | absent | — | ✖ | shipping_plans | shipping_plans | via S0.5 ensure | yes (rec.) | ROUTER_ONLY + ADAPTER_ONLY |
| selectShippingPlanCarrier | ✔`01:118` | POST | ✔`api:2739` | ✖ | ✖ | absent | — | ✖ | carrier_rate_cards, carriers, shipping_plans | shipping_plans | via S0.5 ensure | yes (rec.) | ROUTER_ONLY + ADAPTER_ONLY |
| combineShippingPlans | ✔`01:121` | POST | ✔`api:2741` | ✖ | dormant guard `11:546` | absent | — | ✖ | shipping_plans | (n/a — superseded) | n/a | n/a | ROUTER_ONLY; SPEC-SUPERSEDED |
| uncombineShippingPlans | ✔`01:124` | POST | ✔`api:2743` | ✖ | dormant guard ref | absent | — | ✖ | shipping_plans | (n/a — superseded) | n/a | n/a | ROUTER_ONLY; SPEC-SUPERSEDED |

## 8. Table read/write map (`shipping_plans` columns confirmed at `11_:20-40`)

`shipping_plans` carries every field the L1/L2 contracts need: `source_warehouse_id, ship_from_type, destination_warehouse_id, destination_type, shipping_method, last_mile_delivery, customs_type, carrier_id, carrier_unit_rate, carrier_rate_type, import_duty_treatment, estimated_freight_cost, estimated_duty, estimated_customs_fee, estimated_total_cost, currency, status, plan_version, parent_shipping_plan_id` (version-lineage only). `carrier_rate_cards` + `carriers` (+ `carrier_lead_times`) back the rate engine. **No new column or table is required** for actions 1–3 (data model already provisioned); actions 4–5 need none (superseded).

## 9. Safety / lock

- Read (Action 1): read-only; inherits the S0.5 exact-Spreadsheet-ID gate at any write-adjacent access; no lock.
- Writes (Actions 2–3): would route Canonical writes through the S0.5 validate-only ensure chokepoint (no Header/schema mutation, exact-ID gate, fail-closed). LockService recommended (optimistic decision edits + version bump), consistent with the recommendation-path lock model.

## 10. Blocking decision — **Possibility A (first Weekly slice NOT blocked)**

- The recommended first Weekly slice (`getWeeklyShippingPlanWorkspace` **read** + the FULLY_CONNECTED status writes `updateShippingPlanStatus` / `updateShippingPlanLineQty` / `appendShippingPlanNote` / `completeShippingPlan`, API-0 F1) **does not call any of the five**. Weekly page load has **zero** dependency on them (no UI caller, not rendered).
- Therefore **API-1 / API-2 / the first Weekly read+status slice can proceed**, excluding the advanced carrier/rate/combine functions. Actions 1–3 are an **advanced later slice** (contract landed; thin implementation over the existing rate engine + provisioned columns). Actions 4–5 are **superseded — do not build**.

## 11. API v1 disposition (per §9 vocabulary)

| Action | Disposition | Rationale |
|---|---|---|
| getWeeklyPlanRateCandidates | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE | engine exists; needs thin handler wrapper |
| updateShippingPlanRationale | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE | contract canonical; data model ready |
| selectShippingPlanCarrier | CONTRACT_PENDING_IMPLEMENTATION → INCLUDE_LATER_WEEKLY_ADVANCED_SLICE | contract canonical; depends on Action 1 candidates |
| combineShippingPlans | DEAD_OR_LEGACY_CANDIDATE + REQUIRES_USER_DECISION | superseded by derived-MULTI (B-2) |
| uncombineShippingPlans | DEAD_OR_LEGACY_CANDIDATE + REQUIRES_USER_DECISION | superseded by derived-MULTI (B-2) |

- **LIVE-DEPLOYMENT_UNKNOWN caveat:** whether the deployed Apps Script Web App contains hand-added versions of handlers 1–3 cannot be verified from the repo. Git proves none were ever committed; if the live project has them, that is undocumented **source-mirror drift** and must be captured back into Git (governance) before API exposure. This does not change the disposition (implement-in-repo either way), only the sequencing.

## 12. Required next actions (NOT this round)

1. **Actions 1–3:** land the three handlers in the existing FC/shipping write owners (Action 1 = thin wrapper over `shippingRoughRateCandidates_`), test-first, as a later Weekly **advanced** slice after the read+status slice ships. Reuse `shippingRateMatch_`; enforce "never auto-select" (Action 1) and clear-carrier-and-bump-version (Action 2) + no-rate_card_id / no-carrier_name-stored (Action 3).
2. **Actions 4–5:** USER DECISION — retire the superseded `combine/uncombine` router+adapter stubs (and the dormant `11:546-551` guard) in a later cleanup, or leave as documented no-ops. Do not implement.
3. **Governance:** if a live-deploy comparison later reveals hand-added handlers, capture them into Git and record the drift per `DEPLOYMENT_RELEASE_GOVERNANCE.md`.

---

*Companions:* `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md` §3.3 + `API_MIGRATION_MASTER_PLAN.md` §3 (both updated with this reconciliation). `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1A/§4.3 is the canonical contract owner. Documentation only; no code/DB/deploy change. Golden 39/1/0; Scenario #34 Pending.
