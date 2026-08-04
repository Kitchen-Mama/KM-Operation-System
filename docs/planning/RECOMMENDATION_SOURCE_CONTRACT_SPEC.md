# Canonical Recommendation Source Contract (FROZEN — Decision Only, Phase 2C Round 1R, 2026-08-04)

> **Status: CONTRACT FROZEN — DOCUMENTATION ONLY.** This spec defines and freezes the canonical *source* contract
> for the Recommendation Runtime so the next-round Apps Script wrapper knows exactly which sources to read, who
> owns each field, and which values must be produced by an upstream projection rather than read/derived by the
> Reader or wrapper. **No Runtime / Apps Script / bundle / DB / schema / migration / km-lb change is made here.**
> Canonical link from the main tracker: `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` §Source-Contract. Where a
> field's owner is already frozen there (§Source-Facts CONTRACT, line ~219), this spec **cites, never overrides**.

## SC-0. Scope & non-negotiable boundary

The **Round 1P Reader** (`supply-planning-source-reader.js`) is FROZEN and owns EXACTLY `Sheet Row → Domain Object →
Runtime DTO` (row-map / null-normalize / type-normalize / enum-normalize / identity-normalize / column-rename /
DTO-build). It owns NO business logic. The **future Apps Script wrapper likewise owns NO business calculation.**
The following are **NEVER** the Reader's or the wrapper's to compute — they belong to the cited upstream owners:
Forecast, Demand generation, Supply calculation, Gap, Net Order Need, Survival Need, Demand Weight, FC Share,
Run-rate, Company allocation, Factory decision, Priority decision, 18-day, lifecycle derivation, snapshot-freshness
decision, source-selection decision.

**Classification legend** (used in every lineage table below):
- **DB-CONFIRMED** — a real canonical stored column exists and is cited (file:line / §).
- **SPEC-CONFIRMED / NOT-IMPLEMENTED** — a canonical owner spec defines it but no runtime/column emits it yet.
- **DERIVED-UPSTREAM** — a runtime (calc engine / projector) computes it; it is an OUTPUT, not a raw source.
- **DTO-ONLY** — exists only as a runtime DTO field; no canonical source column defined.
- **DECISION-REQUIRED** — no canonical owner; a user/architecture decision is needed before implementation.

---

## SC-1. Field lineage decision table (covers all Reader default columns)

Reader default column map = `supply-planning-source-reader.js` `DEFAULT_COLUMNS` (Round 1P). `Runtime DTO Location`
is the frozen consumer. `Missing/Zero` follows the frozen rule: MISSING is never silently 0 — only an explicit
source 0 is 0; MISSING → excluded + issue (fail-closed), never fabricated.

### A. Demand source rows (→ `buildDemandLedger` §39 entries)

| Field (col) | DTO field | Canonical owner | Canonical source | Stored/Derived | Status | Missing/Zero | Req/Opt | Next round |
|---|---|---|---|---|---|---|---|---|
| `demand_type` | demandType | CALC demand assembly (§39.3 enum) | none (enum assigned when a forecast/event/sales row becomes a demand entry) | Derived | DERIVED-UPSTREAM | MISSING→excluded | Required | Projection |
| `source_ref` | sourceRef | CALC demand assembly | forecast/event/sales natural id (e.g. `forecast_id`, `event_fc_id`, `snapshot_date+sku`) | Derived (renamed natural id) | DERIVED-UPSTREAM | MISSING→excluded | Required | Projection |
| `required_by_date` | requiredByDate | CALC demand assembly (window/cycle → date) | none raw; from `request_month`/window vs `fc` month cols | Derived | DERIVED-UPSTREAM | MISSING→ Ledger RangeError (strict ISO) | Required | Projection |
| `quantity` | quantity | Forecast §7 / event `fc_qty` / run-rate §22 | `fc_regular_forecast.jan..dec`, `fc_special_events.fc_qty`, `amazon_daily_sales_snapshot.sales_units` | Derived (monthly-column → single qty) | DERIVED-UPSTREAM | explicit 0 valid; MISSING→excluded | Required | Projection |
| `sku` (Master) | masterSku | `sku_details` | `sku_details.sku` (DATABASE_RELATIONSHIP_MAP §sku_details) | Stored | DB-CONFIRMED | MISSING→excluded | Required | — |
| `destination_warehouse_id` | destinationWarehouseId | `warehouses` (id authority) | resolved dest warehouse_id | Derived (routing) | SPEC-CONFIRMED / NOT-IMPLEMENTED | MISSING→excluded | Required | Projection |
| `planning_cycle` | planningCycle | run-lineage (caller) | `recommendation_calculation_runs.planning_cycle` (`23_…:26-30`) | Stored (run header) | DB-CONFIRMED (run-level) | must match run; mismatch→excluded | Required | wrapper run-meta |
| `event_id` | eventId | `fc_special_events` | `fc_special_events.event_fc_id`/`campaign_*` | Stored | DB-CONFIRMED (event rows only) | required iff SPECIAL_EVENT | Cond. | Projection |
| `company` | company | `marketplaces`/scope | scope + `company` cols | Stored | DB-CONFIRMED | MISSING→excluded | Required | — |
| `country` | country | scope | `country` cols | Stored (nullable) | DB-CONFIRMED | nullable | Optional | — |
| `marketplace` | marketplace | `marketplaces` | `marketplace` cols | Stored (nullable) | DB-CONFIRMED | nullable | Optional | — |

### B. Supply source rows (→ `buildSupplyLedger` §39 entries; CURRENT_STOCK authority + lifecycle)

| Field (col) | DTO field | Canonical owner | Canonical source | Stored/Derived | Status | Missing/Zero | Req/Opt | Next round |
|---|---|---|---|---|---|---|---|---|
| `pool_type` | poolType | §39.4 enum (FBA/THREE_PL/FACTORY) | none raw (bucket assigned per source table) | Derived | DERIVED-UPSTREAM | MISSING→excluded | Required | Projection |
| `warehouse_id` | warehouseId | `warehouses` (id authority, never code) | `overseas_inventory_snapshot.warehouse_id` / `factory_stock.warehouse_id` | Stored | DB-CONFIRMED | MISSING→excluded | Required | — |
| `supply_lineage_ref` | supplyLineageRef | Ledger count-once identity (§30) | none raw (Reader synthesizes `stock:<pool>:<wh>:<sku>` when absent) | Derived | DTO-ONLY | absent→synthesized (stock only) | Optional | Projection |
| `quantity` | quantity | inventory authority | `overseas_inventory_snapshot.wh_available_stock` / `factory_stock.fac_current_stock` / FBA available | Stored | DB-CONFIRMED | explicit 0 valid; MISSING→excluded | Required | — |
| `lifecycle_bucket` | lifecycleBucket | §39.5 (adapter-owned per §39.2/§39.4) | none raw (CURRENT_STOCK default; other buckets = `projectSupplyLifecycle` output) | Derived | DERIVED-UPSTREAM | absent→CURRENT_STOCK | Optional | Projection |
| `sku` (Master) | masterSku | `sku_details` | `…snapshot.sku` | Stored | DB-CONFIRMED | MISSING→excluded | Required | — |
| `company` | company | `warehouses` join (not on 3PL/factory row) | resolved from `warehouse_id` | Derived | SPEC-CONFIRMED / NOT-IMPLEMENTED | MISSING→excluded | Required | Projection |

**Supply table map (which is canonical vs projection):** `overseas_inventory_snapshot` (3PL CURRENT_STOCK, has
`snapshot_date`) = canonical; `factory_stock` (FACTORY CURRENT_STOCK, **no full canonical header, no `company`/
`snapshot_date`** — DECISION-REQUIRED for those two) = canonical-partial; `amazon_inventory_snapshot` (FBA
CURRENT_STOCK) = canonical (headers owned by AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC §7.1). **Qualified Incoming /
Approved Shipping Plan / Shipped-in-transit / Delivered-not-received / Received-not-reflected are NOT tables** —
they are **§39.5 lifecycle projections** (`projectSupplyLifecycle`, Round 1K) over shipment/plan/event sources;
the wrapper must NOT hand-assemble them. Only `CURRENT_STOCK` (inventory snapshots) + shipment on-the-way statuses
are actually produced today; delivered/received buckets read empty (spec-only event/receiving layers).

### C. Receiver facts (Weekly overseas) & Factory demand facts (Monthly) — Allocation-Input inputs

| Field (col) | Owner | Source | Status | Notes |
|---|---|---|---|---|
| `receiver_key` | Allocation-Input Projection | synthesized per (demand, receiver) | DTO-ONLY | identity for the overseas receiver |
| `demand_source_ref` | Reader link key | = demand `source_ref` | DTO-ONLY | linked to Ledger `demandKey` by `resolveDemandKeys` (never recomputed) |
| `eligible_pool_types` | warehouse eligibility §23.6/§24.9 | `warehouses` (company+country+`warehouse_type`='3PL'+`is_active`) + FBA composition | DERIVED-UPSTREAM | FBA/THREE_PL only |
| `survival_need_qty` | §20.3/§24.4 `CEILING(18 × daily_demand)` | none (calc output) | DERIVED-UPSTREAM | `daily_demand` = run-rate §22 / forecast §2D (itself derived) |
| `daily_demand` | run-rate §22 / forecast §2D | none | DERIVED-UPSTREAM | alt input to survival |
| `allocation_priority` | `marketplaces.allocation_priority` (§20.4) | `marketplaces` | DB-CONFIRMED | numeric |
| `demand_weight` | FC-share §7 / sales-share §24.5 | none (calc output) | DERIVED-UPSTREAM | — |
| `fulfillment_model` | `marketplace_skus.fulfillment_model` (§24.1) | `marketplace_skus` | DB-CONFIRMED | enum self/platform/hybrid |
| `eligible_factory_warehouse_ids` | is_factory_warehouse §40/§35 | `warehouses.is_factory_warehouse` + company | DERIVED-UPSTREAM | warehouse_id, not code |
| `required_by_date` (factory) | CALC demand assembly | = demand `required_by_date` | DERIVED-UPSTREAM | FIFO key |

The frozen `projectAllocationInputs` (Round 1L) is the runtime that CONSUMES these facts and runs the real §40
allocators. The **producer** of the facts (survival/weight/eligibility derivation) is the **Allocation-Input
Projection / calc engine**, spec-frozen (line ~219) but **not yet wired into a per-generation producer**.

### D. Weekly Planning Facts (→ `resolveWeeklyRecommendationFacts`)

| Field (col) | Owner | Source | Status | Notes |
|---|---|---|---|---|
| `recommendation_type` | run-lineage | `recommendation_calculation_runs.recommendation_type` (`23_…`) | DB-CONFIRMED (run-level) | enum {WEEKLY_SHIPPING, MONTHLY_ORDER} |
| `sku` | `sku_details` | `sku_details.sku` | DB-CONFIRMED | — |
| `site_sku` | `marketplace_skus` | `marketplace_skus.site_sku` | DB-CONFIRMED | — |
| `window_code` | Weekly window owner | `shipping_allocation_draft_lines.window_code` (`16_…:44`) | DB-CONFIRMED (draft-line) | Weekly grain |
| **`calculated_gap_qty`** | **CALC `calculateGap` (Engine A)** — NOT Reader/wrapper | `shipping_allocation_draft_lines.calculated_gap_qty` (`16_…:47`) is the persisted SNAPSHOT of this OUTPUT | **DERIVED-UPSTREAM** | resolver may also take the 4 raw gap inputs and call `calculateGap` itself |
| `units_per_carton` | `sku_details.units_per_carton` | `sku_details` / draft-line `units_per_carton` | DB-CONFIRMED | carton size |
| `company`/`country`/`marketplace` | scope | scope/marketplaces | DB-CONFIRMED | line scope |
| `fulfillment_model` | `marketplace_skus` | `marketplace_skus.fulfillment_model` | DB-CONFIRMED | — |
| `planning_cycle`/`formula_version`/`source_data_as_of` | run-lineage | `recommendation_calculation_runs` / draft header | DB-CONFIRMED (run-level) | see SC-4 |

### E. Monthly Planning Facts (→ `resolveMonthlyRecommendationFacts`)

| Field (col) | Owner | Source | Status | Notes |
|---|---|---|---|---|
| `recommendation_type` | run-lineage | `recommendation_calculation_runs` | DB-CONFIRMED (run-level) | MONTHLY_ORDER |
| `sku` | `sku_details` | `sku_details.sku` | DB-CONFIRMED | Monthly scope carries sku |
| `request_month` | Monthly grain owner | `request_order_allocation_draft_lines.request_month` (`15_…:39`) | DB-CONFIRMED (draft-line) | — |
| `request_bucket` | Monthly grain owner | `request_order_allocation_draft_lines.request_bucket` (`15_…`) | DB-CONFIRMED (draft-line) | — |
| **`net_order_need_snapshot`** | **CALC Engine A→B→reallocation / `sumRemainingShortages` (§12/§32)** — NOT Reader/wrapper | `request_order_allocation_draft_lines.net_order_need_snapshot` (`15_…:43`) is the persisted SNAPSHOT of this OUTPUT | **DERIVED-UPSTREAM** | resolver may also take explicit `netOrderNeed` / `remainingShortages` / 4 gap inputs |
| `units_per_carton` | `sku_details.units_per_carton` | `sku_details` / draft-line | DB-CONFIRMED | — |
| `company`/`country`/`marketplace`/`fulfillment_model` | scope / `marketplace_skus` | as Weekly | DB-CONFIRMED | — |
| `planning_cycle`/`formula_version`/`source_data_as_of` | run-lineage | run header | DB-CONFIRMED (run-level) | see SC-4 |

**Frozen owner note (citations confirmed, Round 1R investigation):** `calculated_gap_qty` and
`net_order_need_snapshot` are **calculation-engine OUTPUTS** whose persisted forms live on the draft-line tables.
They are **explicitly NOT** the Reader's or the Apps Script wrapper's to derive.
- Weekly Gap owner = `SUPPLY_PLANNING_CALCULATION_RULES.md` **§2C.1/§31**, function `calculateGap`
  (`supply-planning-calculations.js:160-167` = `max(demand − stock − incoming − committed, 0)`); persisted as
  `shipping_allocation_draft_lines.calculated_gap_qty` (`16_shipping_allocation_handlers.gs:47`) /
  `request_order_allocation_draft_lines.calculated_gap_qty_snapshot` (`15_…:41`).
- Monthly Net Order Need owner = **§12/§32**, `sumRemainingShortages` (Engine A→B→reallocation); persisted as
  `request_order_allocation_draft_lines.net_order_need_snapshot` (`15_…:43`).
- These snapshot columns are **blank until the calculation writer runtime is implemented — NEVER faked 0**
  (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md:656`). The recommendation calculation engine
  (`calculateGap`/`sumRemainingShortages`/`calculateSuggestedOrderQty`) is their sole owner.

**Convergent DECISION-REQUIRED gap (single biggest freeze finding):** `survival_need_qty`, `daily_demand`,
`demand_weight`, `eligible_pool_types`, `eligible_factory_warehouse_ids`, and the whole **demand-entry assembly**
(fc_regular_forecast jan..dec / fc_special_events.fc_qty / amazon_daily_sales_snapshot run-rate → demand entries
with a `demand_type` + `required_by_date`) all converge on ONE missing piece: **there is NO canonical
recommendation-SOURCE sheet/table and NO implemented Forecast/Sales/warehouse → planning-facts projector.** The
formulas are owned (§20.3/§24.4, §7/§24.5, §23.6/§24.9, §40/§35, §25.1/§39) and the CONSUMING pure runtime
(`projectAllocationInputs`) is built + test-verified, but it **consumes** these facts — it does not **produce**
them; today they are caller-supplied DTO facts with no persisted producer, and the Reader is explicitly forbidden
from deriving them (`supply-planning-source-reader.js:65`). This is exactly what SC-5's recommended Projection
Runtime (SC-9 dependency #1) must build.

---

## SC-2. Value semantics (frozen, apply to every table)

- **Missing vs Zero:** MISSING (empty / null / undefined) is NEVER 0. Only an explicit finite `0` is 0. MISSING on a
  required field → row excluded + issue (fail-closed); the run BLOCKS if no valid recommendation line survives.
- **Row granularity:** Demand = one row per (company, destination_warehouse_id, master_sku, planning_cycle,
  demand_type, source_ref [+event_id]) — the `demandKey` grain (§39.3, Ledger-owned). Supply = one row per physical
  pool lineage (company, warehouse_id, master_sku, pool_type; §23.1/§39.6). Weekly fact = one per `sku|site_sku|
  window_code`. Monthly fact = one per `sku|request_month|request_bucket` (sku in scope).
- **Duplicate behavior:** duplicate demand `source_ref` within a scope (ambiguous `demandRef`) → Reader/link
  RangeError (fail-closed). Duplicate Weekly/Monthly line identity → Reader RangeError. Same demandKey + differing
  qty → Ledger `DEMAND_SOURCE_QTY_CONFLICT` (blocked, 0). Same lineage in >1 (pool,bucket) → `SUPPLY_LINEAGE_
  CONFLICT`; same lineage differing qty → `PHYSICAL_POOL_QTY_CONFLICT` (all Ledger-owned, fail-closed).
- **Identity:** `warehouse_id` is the ONLY warehouse identity (never `warehouse_code`). Master SKU = `sku`
  (`sku_details`); marketplace SKU = `site_sku`. Duplicate marketplace-SKU → `IDENTITY_CONFLICT`; duplicate master
  → `DUPLICATE_SOURCE` (`resolveSourceIdentity`, frozen).
- **Snapshot rules:** each read pass captures a single `sourceDataAsOf`; only `amazon_*` snapshots +
  `overseas_inventory_snapshot` carry `snapshot_date` (+ Amazon `synced_at`); all other tables expose only
  `updated_at`/`created_at`. No `imported_at`/`source_data_as_of` column exists on the raw source tables.

---

## SC-3. Run-level ownership (SC-3.1 sourceDataAsOf · SC-3.2 formulaVersion · SC-3.3 planningCycle · SC-3.4 businessScope)

| Field | Owner | Source of truth | Reader/wrapper may derive? |
|---|---|---|---|
| `source_data_as_of` | run-lineage; computed from the freshest read snapshot | `amazon_*.snapshot_date`/`synced_at`, `overseas_inventory_snapshot.snapshot_date`, else `updated_at` summary; persisted on the draft header / run journal (`source_data_as_of`) | **NO** — captured from the source snapshots at read time; never invented |
| `formula_version` | calc runtime (rules version, e.g. `v4.x`) | `recommendation_calculation_runs.formula_version` / draft header | **NO** — supplied by the calc runtime / caller; never invented |
| `planning_cycle` | scheduler/caller | `recommendation_calculation_runs.planning_cycle` / draft header | **NO** — caller-supplied run parameter |
| `business_scope` | scheduler/caller | draft header scope cols (Weekly: +`source_page`; Monthly: +`draft_purpose`,`sku`) | **NO** — caller-supplied |

Weekly vs Monthly segregation: **separate runs, separate scope grain, separate readers** — never merged. Weekly
scope = `planning_cycle+company+country+marketplace+source_page`; Monthly = `planning_cycle+company+country+
marketplace+draft_purpose+sku`.

---

## SC-4. Source-contract options (evaluated; nothing presupposed)

**OPTION A — Direct multi-table read + existing projections.** Wrapper `getValues()` on the canonical source
tables (`fc_regular_forecast`, `fc_special_events`, `amazon_daily_sales_snapshot`, `overseas_inventory_snapshot`,
`factory_stock`, `amazon_inventory_snapshot`, `marketplaces`, `marketplace_skus`, `sku_details`, `warehouses`),
then existing upstream projections assemble Reader input.

**OPTION B — New canonical Recommendation Source Snapshot tables.** A calc runtime writes immutable per-run
snapshot tables (demand/supply/receiver/factory/planning-fact rows keyed by `calculation_run_id`); Reader reads the
snapshot only.

**OPTION C — Runtime-only projection (no new long-term storage).** A **Recommendation Source Projection Runtime**
composes the existing frozen source-facts projectors (`projectDemandLedger` / `projectCurrentStockSupplyLedger` /
`projectSupplyLifecycle` / `projectAllocationInputs`) + the closed calc Engine A/B to emit Reader-compatible rows
per generation; nothing new is persisted long-term (audit/replay served by the existing Persistence OUTPUT
snapshot — `recommended_qty` + `calculated_gap_qty` + `net_order_need_snapshot` per `draft_version`/`calculation_
run_id`).

| Criterion | A (direct) | B (snapshot tables) | C (runtime projection) |
|---|---|---|---|
| Canonical ownership | reuses existing owners | NEW tables + writer own it | reuses existing owners |
| Auditability | weak (inputs not frozen) | **strongest** (immutable per run) | medium (OUTPUT snapshot already persisted) |
| Reproducibility / replay | weak (raw tables mutate) | **strongest** | medium (re-project from tables + run journal) |
| Apps Script feasibility | many getValues, complex | read one snapshot (simple) | many getValues + projection (complex) |
| Snapshot consistency | **weak** (multi-table skew) | **strong** (one atomic snapshot) | medium (one read pass, captured as-of) |
| Partial-update / stale risk | **high** | low | medium |
| Duplicate risk | table-level | de-duped at write | de-duped in projection |
| Runtime cost | medium | write cost + storage | projection cost per run |
| Testing complexity | high (many fixtures) | medium (snapshot fixture) | medium (reuse frozen projector tests) |
| DB migration impact | none | **new tables + migration** | **none** |
| Future API migration | fragile | clean (stable snapshot API) | clean (projection API) |
| Scheduler compatibility | ok | **best** | ok |
| Persistence boundary | none added | adds a source-writer | none added |
| Rollback / replay | poor | **best** | medium |

---

## SC-5. RECOMMENDED contract (single recommendation)

**RECOMMENDED = OPTION C — a spec-defined `Recommendation Source Projection Runtime` (NOT implemented this round),
with OPTION B reserved as a future audit/replay upgrade if scheduler/compliance later requires frozen per-run
input snapshots.** Rationale (Database-First): it adds **NO new canonical table / migration / DB change** (respects
the boundary and "不得預設一定新增新表"); it **reuses only already-frozen, test-verified runtimes** (source-facts
projectors + closed Engine A/B); reproducibility is already served because the Persistence layer snapshots the
recommendation OUTPUTS per `draft_version`/`calculation_run_id`; and it slots directly into the frozen Reader →
Integration → Orchestrator chain with no contract change.

1. **Source Dataset name:** Recommendation Source Projection (runtime view; no table).
2. **Canonical table/snapshot/projection:** projection (runtime-only).
3. **Producer:** Recommendation Source Projection Runtime (NEW spec owner; composes frozen projectors + Engine A/B;
   **not implemented this round**).
4. **Consumer:** the frozen Round 1P Reader → Round 1Q Integration → Orchestrator.
5. **Refresh timing:** once per generation, immediately before `computeFacts`.
6. **Transaction/snapshot boundary:** a single read pass over the canonical source tables; one captured
   `source_data_as_of`; the projection output is treated as immutable within the generation.
7. **Row granularity:** as SC-2 (demandKey / physical-pool / Weekly / Monthly grains).
8. **Primary identity:** demand `source_ref`→`demandKey` (Ledger-emitted); Weekly `sku|site_sku|window_code`;
   Monthly `sku|request_month|request_bucket`.
9. **Required columns:** per SC-1 (Required rows).
10. **Optional columns:** per SC-1 (Optional rows; nullable country/marketplace, synthesized supply_lineage_ref).
11. **enum contract:** demand_type {REGULAR, SALES_RUN_RATE, SPECIAL_EVENT, SAFETY}; pool_type {FBA, THREE_PL,
    FACTORY}; fulfillment_model {self_fulfilled, platform_fulfilled, hybrid}; recommendation_type {WEEKLY_SHIPPING,
    MONTHLY_ORDER}. Unknown → excluded + issue (fail-closed).
12. **Missing/Zero:** SC-2 (MISSING ≠ 0; explicit 0 valid).
13. **Duplicate:** SC-2 (fail-closed at Reader/Ledger).
14. **sourceDataAsOf:** SC-3.1 (captured from snapshots; never invented).
15. **formulaVersion:** SC-3.2 (calc runtime).
16. **planningCycle:** SC-3.3 (caller/scheduler).
17. **businessScope:** SC-3.4 (caller; Weekly/Monthly grain).
18. **Weekly/Monthly segregation:** SC-3 (separate runs/readers/scope).
19. **archival/replay:** re-project from canonical tables + `recommendation_calculation_runs` journal; OUTPUT
    snapshot already immutable per draft_version. (Upgrade path = Option B frozen input snapshot.)
20. **Apps Script getValues mapping:** SC-6.
21. **Reader column override map:** SC-7.
22. **downstream fail-closed:** Reader/projection issues propagate into `sourceIssues`; `ready=false` when no valid
    line → Orchestrator BLOCKS; never a blank-but-successful plan; never a `SOURCE_READER_PENDING` fallback.

**Canonical sheet/table decision:** **NO new canonical source table/sheet is created or specified for storage this
round.** The Projection Runtime is the owner; its input = canonical source-table rows, its output = Reader input
rows. If a future round adopts Option B, its schema will be specified here first (no migration/sheet/DB change may
be made in a decision-only round).

---

## SC-6. Apps Script wrapper contract (next round — NOT implemented here)

The future wrapper is **I/O + orchestration ONLY** (no business derivation):

- **Spreadsheet:** the canonical Operation System DB spreadsheet (same the importers/writers use).
- **Sheets read:** the canonical source tables in SC-4 Option A list (demand: `fc_regular_forecast`,
  `fc_special_events`, `amazon_daily_sales_snapshot`; supply: `overseas_inventory_snapshot`, `factory_stock`,
  `amazon_inventory_snapshot`; identity: `marketplace_skus`, `sku_details`, `warehouses`, `marketplaces`; run
  journal: `recommendation_calculation_runs`). **No recommendation-source sheet exists** — the wrapper does not read
  one.
- **Header row / data start row:** header = row 1; data = row 2 (Apps Script `getValues()` convention already used
  by the importers).
- **Empty sheet:** accepted → yields zero rows for that source → downstream fail-closed (BLOCK if no valid line).
- **Partial rows:** accepted → each invalid/short row excluded + issue by the Reader (never fabricated).
- **sourceDataAsOf:** SC-3.1 (from snapshot columns; wrapper passes through, never invents).
- **formulaVersion / planningCycle / recommendationType / businessScope:** SC-3 (caller/run-journal; wrapper passes
  through).
- **identityTables:** `marketplace_skus` / `sku_details` / `warehouses` (for `resolveSourceIdentity`).
- **→ Reader input:** wrapper calls the **Projection Runtime** to turn raw table rows into Reader-compatible rows,
  then calls the frozen Reader; wrapper itself does NO mapping/normalize/derivation.
- **Reader issues:** surfaced into the integration `sourceIssues`; never cleared.
- **No valid rows:** `ready=false` → Orchestrator BLOCK (no blank plan).
- **No `SOURCE_READER_PENDING` fallback:** once wired, the `24_…` stub is replaced by the real projection→reader
  path; until then it BLOCKS (never fabricates).

---

## SC-7. Reader column override map (for the wrapper/projection)

The Reader default columns (Round 1P `DEFAULT_COLUMNS`) already align to DB-CONFIRMED names where they exist
(`sku`, `site_sku`, `units_per_carton`, `window_code`, `calculated_gap_qty`, `request_month`, `request_bucket`,
`net_order_need_snapshot`, `warehouse_id`, `allocation_priority`, `fulfillment_model`, `planning_cycle`,
`formula_version`, `source_data_as_of`, `recommendation_type`). The DERIVED-UPSTREAM / DTO-ONLY columns
(`demand_type`, `source_ref`, `pool_type`, `supply_lineage_ref`, `quantity`, `destination_warehouse_id`,
`demand_source_ref`, `survival_need_qty`, `daily_demand`, `demand_weight`, `eligible_pool_types`,
`eligible_factory_warehouse_ids`, `event_id`, `lifecycle_bucket`) are the Projection Runtime's OUTPUT column names
— the projection emits exactly these (or the wrapper passes a `createRecommendationSourceReader({columns})`
override). No override is required if the projection emits the default names.

---

## SC-8. SOURCE_READER_PENDING remaining scope

- **Pure-runtime seam:** REPLACED (Round 1Q) — the Orchestrator's `deps.computeFacts` runs the real reader-backed
  chain in the pure runtime + tests.
- **Apps Script wrapper stub:** `24_recommendation_orchestrator.gs:47` `SOURCE_READER_PENDING` **still present** —
  its replacement depends on this canonical source contract (frozen here) + the Projection Runtime + the wrapper.
- **Full-project removal:** only after the next round wires the Projection Runtime + wrapper (SC-5/SC-6) may
  `SOURCE_READER_PENDING` be declared fully removed. **Do not modify `24_…` before then.**

> **SC-STATUS (Round 1S-P1, 2026-08-04):** the **Apps Script production Sheet reader + projection boundary** is
> IMPLEMENTED / TEST VERIFIED (pure `supply-planning-source-reader-production.js` `KMSRP` + thin `.gs`
> `26_recommendation_source_reader.gs`; 38 assertions; bundled). It reads the SC-6 tables as raw snapshots
> (read-only, value-preserving, fail-closed schema validation) and drives the frozen KMSR→KMSI→Plan Builder
> pipeline (Weekly 96 / Monthly 24 in tests). **The `Recommendation Source Projection Runtime` of SC-5 (that SHAPES
> raw DB tables — fc_regular_forecast jan..dec / inventory snapshots / calc-engine gap+net-order-need — INTO the
> DTO-convention source sheets) remains NOT IMPLEMENTED (SC-9 #1).** The `24_…` `SOURCE_READER_PENDING` stub is
> unchanged (SC-8; replacement = Round 1S-P2). No writes / no LockService / no Submit / no deploy.

## SC-9. Next implementation dependency (ordered)

1. **Recommendation Source Projection Runtime** (Option C) — compose frozen projectors + Engine A/B → Reader rows;
   captures `source_data_as_of`; emits the SC-1 columns. (Pure runtime; new module + tests.)
2. **Apps Script wrapper** (SC-6) — getValues on canonical tables → Projection Runtime → Reader → Integration →
   Orchestrator; replaces the `24_…` `SOURCE_READER_PENDING` stub.
3. **DECISION-REQUIRED items to resolve before/with #1:** `factory_stock` missing `company`/`snapshot_date`
   (needed for supply company scope + as-of); `destination_warehouse_id` routing owner for demand; whether to adopt
   Option B input snapshot for stronger replay.
