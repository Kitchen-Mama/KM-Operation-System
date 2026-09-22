# FC Summary — Spec & DB Mapping

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the FC Summary page + domain contract (Regular Forecast / Special Event / Target % Rules) DB mapping + write-path wiring.
> - **Canonical Owner For:** the FC Summary page contract only.
> - **Not Owner For:** Engine A/B forecast formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md`), schema authority (`DATABASE_RELATIONSHIP_MAP.md`).
> - **Status:** Reviewed — Batch B Blockers Remain (FC Summary itself has no Batch B blocker, but some fields are runtime-pending).
> - **Current Version:** v1.1 (Batch A repair: **Source Code Verified / Deployment Status Unverified** split; grain-vs-key gap recorded).
> - **Last Reviewed:** 2026-07-28.
> - **Depends On:** Calculation Rules (formulas), Database Relationship Map (schema).
> - **Blocked By:** none in Batch B; internal items pending verification = the **atomic 3-table (campaign→line→event) Save orchestration** (individual writers SOURCE-EXIST but not a single transaction) + a **dedicated single-row Regular FC backend writer/action** (NOT IMPLEMENTED — future target; note the **Demo OFF Manual single-row Save already persists** via the existing batch upsert with a one-record payload, so this is a "no dedicated writer" gap, **not** an "unwired / non-persistent UI" gap — see §8.4); all Apps Script **deployment status = UNVERIFIED**.
> **Verification split (Batch A 2026-07-28).** *Source Code Verified* means the active `.gs` mirror + adapter carry the contract; it is **NOT** proof of the Google Apps Script deployment. **Deployment status = UNVERIFIED** in this environment (see §3.1 / §6). No deployment claim is made anywhere in this document.
>
> | Item | Current Source Behavior (verified in `.gs`/adapter) | Deployment |
> |---|---|---|
> | Regular row grain | one row per SKU × year × company × country × marketplace × category × series (12 month cols) | Adapter read path present (Demo OFF → Operation DB); Deployment UNVERIFIED; **Demo OFF Manual single-row Save IS wired and persists** via the batch upsert (one-record payload); a **dedicated single-row backend writer = Not Implemented** (§8.4) |
> | Regular upsert **key** | `year + company + country + marketplace + sku` (§8.4; **SOURCE-VERIFIED** `04_marketplace_forecast_import.gs:532/583`) — **includes company**; does **not** include category / series | **Known Contract Gap** on category/series only (below) |
> | Company scope | per-row `company`; multi-company; Company filter dropdown | Filter + display; **`company` IS part of the Regular upsert key** (verified) |
> | Event PK | `event_fc_id` in `14_fc_write_handlers.gs` header + upsert key; adapter reads `event_fc_id` → legacy `event_id`/`special_event_id` fallback | Source Code Verified; **Deployment UNVERIFIED** (§3.1/§6) |
> | Builder | `saveRegularUpdate` / `saveEventUpdate` (modals); CSV `importFcRegularForecastBatch` | Adapter read path present; event write via `upsertFcSpecialEvent` (Deployment UNVERIFIED) |
> | Writer | `handleUpsertFcSpecialEvent_` / `handleImportFcRegularForecastBatch_`; inline table-edit "Save" is a **mock** | `upsertCampaign` / `upsertCampaignSkuLines` writers **SOURCE EXISTS + router-wired** (§12.1); **Deployment/Runtime UNVERIFIED**; atomic 3-table Save NOT IMPLEMENTED |
> | Read source | `getFcRegularForecast` / `getFcSpecialEvents` / `getFcTargetRules` (adapter cache) | Adapter read path present; Deployment UNVERIFIED |
> | Forecast months | selected year's Jan–Dec (12 fixed columns) | Adapter read path present; Deployment UNVERIFIED |
> | Write permission | display read-only; writes via builder + import only | — |
> | Empty-selection filter | **empty = NONE** (positive inclusion) | Adapter read path present; Deployment UNVERIFIED |
>
> **Known Contract Gap (recorded, not silently reconciled):** the Regular **row grain** includes `category / series`, which are **NOT** part of the SOURCE-VERIFIED upsert key `year + company + country + marketplace + sku` (**`company` IS** in the key). The `category / series` gap and any future key decision are Required Future Fixes, not a current fact.

> Scope: the **FC Summary page** (`assets/html/pages/fc-summary.html` + `assets/js/pages/fc-summary.js`). Three datasets: **Regular Forecast**, **Special Event**, **Target % Rules**. This spec records the DB mapping and the phased write-path wiring. **No FC calculation formula / Target-rule resolver formula is changed here** — only data source + read/write wiring.

---

## 1. Tables

"Read/Write status" below records the **source-code** wiring only. **Source Code Present ≠ Deployment Verified**: the live Apps Script deployment is **UNVERIFIED** in this environment (see the Verification split in the header + §3.1 redeploy gap). "Demo OFF → Operation DB" means the adapter reads the Operation DB when Demo is off; it is not a claim that the Google Apps Script project is deployed.

| UI dataset | DB table | Read (source code) | Write (source code) |
|---|---|---|---|
| Regular Forecast | `fc_regular_forecast` | Adapter reader present (Demo OFF → Operation DB); deployment UNVERIFIED | Persists via `importFcRegularForecastBatch` — **Batch Import** (multi-record payload) **and Demo OFF Manual single-row Save** (one-record payload) **both write** through it. **No dedicated single-row backend writer/action** (Not Implemented); the inline **Edit Base FC** editable-cell surface is **demo-only** (`fcRegularMock`) and **+ Add SKU** is removed (§1.1) — a dedicated live single-row action is a **future target**. Deployment UNVERIFIED |
| Special Event | `fc_special_events` | Adapter reader present; deployment UNVERIFIED | `upsertFcSpecialEvent` / `deleteFcSpecialEvent` present in source; deployment UNVERIFIED |
| Target % Rules | `fc_target_rules` | Adapter reader present; deployment UNVERIFIED | `upsertFcTargetRule` / `deleteFcTargetRule` present in source; deployment UNVERIFIED |

**Data-source rule (all three):** Demo ON → local demo/mock arrays; **Demo OFF → Operation DB** (`window.KM.DB.getFcRegularForecast/getFcSpecialEvents/getFcTargetRules`). The page never reads another page's DOM. Deployment of the writers to the live Apps Script project is **UNVERIFIED** (§3.1 / §6).

### 1.1 FC Summary data ownership (SKU creation is out of scope)
- **FC Summary must NOT create SKUs or `fc_regular_forecast` base rows.** The **+ Add SKU** button is **removed / deprecated** (data safety).
- **SKU + FC base-row creation is owned by the SKU Details / Inventory SKU flow** (and the batch **Import Forecast**, which auto-creates base rows on marketplace import). FC Summary only **reads** and **updates** existing forecast values.
- Rationale: independent SKU creation from FC Summary risks orphan / inconsistent `sku_details` ↔ `marketplace_skus` ↔ `fc_regular_forecast` rows.

---

## 2. Current status (post Phase 1)

- `fc_regular_forecast` **read** adapter connected in source; **Import Forecast** writer present in source (batch upsert + auto-create base rows on marketplace import). **Deployment UNVERIFIED.**
- **Special Event / Target Rules have a read + write path in the source code** (Phase 1 — this task); **deployment to the live Apps Script project is UNVERIFIED**:
  - Special Event tab reads `getFcSpecialEvents()` on Demo OFF (no longer a fixed empty array).
  - `+ New FC Update` → Special Event (Manual Input **and** growth/copy batch) writes `fc_special_events`.
  - Target % Rules tab reads `getFcTargetRules()`; **Add / Save** writes `fc_target_rules`; **Delete** hard-deletes by id. The local `const targetRules = []` is used **only in Demo ON**.
- **+ Add SKU — REMOVED (data safety, this task):** the FC Summary "+ Add SKU" button is gone; SKU / FC base-row creation is owned by the SKU Details / Inventory SKU flow (see §1.1). Not to be re-enabled.
- **Future target (dedicated single-row backend action — NOT a current-behavior gap):** a dedicated inline **Edit Base FC** single-row `fc_regular_forecast` writer/action, and eliminating the `fcRegularMock`/render dual-track for Regular edits. This does **not** change current UI persistence — the **Demo OFF Manual single-row Save already persists** through the existing batch upsert with a one-record payload (§8.4). What is absent is a *dedicated* single-row backend writer, not single-row persistence itself.

---

## 3. `fc_special_events` schema (Phase 1 write header)

Auto-created with this header row on first write (`14_fc_write_handlers.gs`; missing tab reads as `[]`):

| Column | Note |
|---|---|
| `event_fc_id` | **PK (canonical)** — backend-generated `EFC-<12-hex>`. **SOURCE-VERIFIED** in `14_fc_write_handlers.gs` (header col 0 + upsert key); **DEPLOYMENT/RUNTIME UNVERIFIED**. |
| `event_id` | **LEGACY alias — NOT written** by the active writer; retained read-only as a delete/backfill fallback only (never the current PK). |
| `company` / `country` / `marketplace` | scope context |
| `scope_type` / `scope_id` | scope descriptor (UI writes `SKU` / the SKU value) |
| `sku` / `series` / `category` | SKU + classification |
| `event_name` | event label (normalizer reads `event` ← `event_name`) |
| `event_period` | display range string (e.g. `2026/07/15-2026/07/16`) — **UI-continuity column** |
| `event_month` | reserved (optional; month index/label) |
| `year` | forecast year — **UI-continuity column** (Event table shows/filters by year) |
| `fc_qty` | forecast quantity |
| `note` | free text |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit meta (stamped by handler) |

> Core columns (canonical PK `event_fc_id`; the older task definition led with a since-retired `event_id` PK): `event_fc_id, company, country, marketplace, scope_type, scope_id, sku, series, category, event_name, event_month, fc_qty, note, created_by, created_at, updated_by, updated_at`. `event_period` + `year` are additional columns retained so the existing Event table (which displays Event Period and filters by Year) keeps working.

### 3.1 FC Summary Expected Field Mapping (Reconciliation Target — NOT Schema Authority)

> This section describes the fields and key structure **expected by FC Summary as a consumer / runtime contract**. Authoritative table schema, column existence, primary identity and relationships remain owned by **`DATABASE_RELATIONSHIP_MAP.md`** and the applicable domain schema owner. **If this FC Summary mapping conflicts with the schema owner, the schema owner prevails** and this consumer mapping must be reconciled. (This section does not confer schema authority — consistent with the Header "Not Owner For: schema authority".)

The `fc_special_events` fields expected by FC Summary are:

| Column | Note |
|---|---|
| `event_fc_id` | **PK** — canonical name, now the writer's PK (see reconciliation note). **Backend-generated** `EFC-<12-hex>`; the frontend never supplies it. |
| `campaign_id` | FK → `campaigns` — **REQUIRED** by the current writer (`handleUpsertFcSpecialEvent_` rejects a blank `campaign_id`, `14_fc_write_handlers.gs:272-273`). Blank only on **legacy** rows created before the campaign-link contract (never for a current Save). |
| `campaign_sku_line_id` | FK → `campaign_sku_lines` — the specific promotion line. **OPTIONAL**: primary business key `campaign_id + campaign_sku_line_id` when present, else fallback key `campaign_id + marketplace_id + sku + event_month + year` (`14_fc_write_handlers.gs:179-199`). |
| `marketplace_id` | FK → marketplaces (**pending** — not written by the current handler) |
| `sku` · `year` · `country` · `marketplace` | scope |
| `company` | **derived** from marketplace / marketplace_skus relation (never entered in UI) |
| `category` · `series` | joined from `sku_details` (written on save) |
| `event` | Event Flag enum: **Normal / Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day**. `Normal` never produces a row. |
| `event_period` | display range string |
| `event_month` | may be derived from `event_period` or stored as the primary month |
| `fc_qty` | forecast quantity (required when event ≠ Normal) |
| `fc_share` | **runtime-calculated** (DB column may be retained but not required) |
| `source` | enum: **`manual_fc_summary` / `campaign_sync` / `import` / `growth_actual_sales`** |
| `status` | enum: **`active` / `inactive` / `archived`** |
| `created_by` / `created_at` / `updated_by` / `updated_at` · `note` | audit + note |

**Full target column order (Part 3):** `event_fc_id, campaign_id, campaign_sku_line_id, marketplace_id, sku, year, company, country, marketplace, category, series, event, event_period, event_month, fc_qty, fc_share, source, status, created_by, created_at, updated_by, updated_at, note`.

**Reconciliation — Source Code Verified; Deployment Status Unverified (Batch A 2026-07-28):** in the active source, `14_fc_write_handlers.gs` uses **`event_fc_id`** as the canonical PK (header + upsert key) and the adapter (`operation-system-db-api.js`) reads `event_fc_id` with `event_id` / `special_event_id` as **read-only legacy fallbacks**. The header includes `event_fc_id / campaign_id / campaign_sku_line_id / marketplace_id / event_start_date / event_end_date`; additive columns are appended non-destructively; any legacy `event_id` column is left untouched (no longer written). **This is source-mirror evidence only.** **Deployment status = UNVERIFIED** (§6): the runtime writer's PK cannot be confirmed from this environment and is not asserted here.
- **event_fc_id is generated by the BACKEND** (`fcSpecialEventUpsert_`): `EFC-<12-hex>` on create; **preserved** on update (never regenerated by fc_qty / date / name edits); the frontend no longer fabricates an id.
- **Idempotency** = the stable business key **campaign_id + campaign_sku_line_id** (fallback `campaign_id + marketplace_id + sku + event_month + year`) → a double-click / retry updates the SAME row (no duplicate) and inline-backfills a blank id on the row being saved.
- **Validation** before write: `campaign_id`, `sku`/`scope_id`, `event_name`, numeric `fc_qty ≥ 0`.
- **Legacy blank `event_fc_id` rows:** a **read-only audit** (`auditFcSpecialEventIds`) reports blank count / re-identifiability / duplicate business keys; a **standalone, re-runnable, one-time backfill** (`backfillFcSpecialEventIds`) is **DRY-RUN by default** (reports would-fill / ambiguous-no-campaign / colliding-business-key + sample, writes nothing) and only writes with `{confirm:true}` — assigning ids to blank rows that carry a `campaign_id` (ambiguous rows without one are never auto-filled). Neither runs automatically. **Runtime deployment status = UNVERIFIED** (§6); the runtime writer's PK is not asserted from this environment.

---

## 4. `fc_target_rules` schema (Phase 1 write header)

| Column | Note |
|---|---|
| `target_rule_id` | PK (auto `fc_target_rules-<uuid>` when absent) |
| `company` / `country` / `marketplace` | **site identity — matched EXACTLY** (R2B-A2-R5-F2 D1). `All` is not a valid value (D2); blank is a refusal, not a wildcard (D3) |
| `scope_type` | `CATEGORY` / `SERIES` / `SKU` — canonicalised through ONE mapping; comparison is case-insensitive, persistence is uppercase |
| `scope_id` | the scoped value (category / series / sku by scope) |
| `year` | **site identity — matched EXACTLY.** Not a UI-continuity column: a rule for 2026 never applies to 2025 |
| `category` / `series` / `sku` | round-trip fidelity — **UI-continuity columns** |
| `target_percentage` | **authoring convenience / summary only — NEVER runtime authority.** Carries the common value when all twelve months are equal; **blank when they differ**. No resolver may read it in place of a named month |
| `jan_pct … dec_pct` | per-month target % — **the ONLY runtime authority**, read by the requested month's NAME. `0` is a valid percentage and stays `0` |
| `note` | free text |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit meta |

> Task-defined core columns: `target_rule_id, company, country, marketplace, scope_type, scope_id, target_percentage, jan_pct..dec_pct, created_by, created_at, updated_by, updated_at, note`. `year` + `category`/`series`/`sku` are additional columns so the Target table (shows year/category/series/sku) and the effective-rule resolver keep working.

### 4.1 Canonical Target Rule contract (R2B-A2-R5-F2 — AUTHORISED)

Every consumer — FC Summary, Request Order, Inventory Replenishment, Supply Planning and Procurement —
resolves a Target Rule through the SAME contract. Before this round each implemented its own, and the
five disagreed on which fields even participate; the audit is recorded in `FC-SUMMARY-R2B-A2-R5-F1`.

**Canonical business key**

```
year | company | country | marketplace | scope_type | scope_id
```

1. **Site identity is exact.** `year`, `company`, `country` and `marketplace` must all match the requested
   site exactly. A rule for one site never applies to another.
2. **Scope identity** is `scope_type` + `scope_id`. `scope_type` is one of `CATEGORY`, `SERIES`, `SKU`;
   `scope_id` is the canonical category, series or SKU respectively.
3. **Scope precedence** is `SKU > SERIES > CATEGORY > default 100%`, as
   `SUPPLY_PLANNING_CALCULATION_RULES.md` §2D has always required.
4. **`All` is retired.** It is not a wildcard, not a valid identity value and not a fallback. A future
   global or multi-market rule needs a separately specified explicit scope model — never the string `All`.
5. **Blank required identity is a refusal**, never a wildcard. A blank `company` used to widen a rule to
   every company silently, because the comparison was skipped when the field was empty.
6. **Runtime percentage comes only from the named month column** (`mar_pct` for March, and so on).
   `target_percentage` is authoring convenience and is never substituted for a month.
7. **`0%` is valid** and must survive as `0`. A reader of the form `parseInt(v) || 100` is defective.
8. **Duplicate business identity is a deterministic refusal**, `DUPLICATE_TARGET_RULE_IDENTITY`. No
   resolver may choose between duplicates, and none may depend on sheet row order.
9. **A supplied `target_rule_id` may update only the row whose canonical business identity equals the
   payload's.** A mismatch refuses with `TARGET_RULE_IDENTITY_MISMATCH` and writes nothing, so a rule's
   site or scope can never be silently repointed.
10. **No resolver may depend on row order** — reversing the rows must produce an identical answer.

---

## 5. API / Apps Script actions (Phase 1)

**Apps Script `14_fc_write_handlers.gs`** (routed via `01_router.gs`):
- `upsertFcSpecialEvent` / `deleteFcSpecialEvent`
- `upsertFcTargetRule` / `deleteFcTargetRule`
- Behavior: auto-create tab + header row; **update** the row matching the id column, else **create** a new row with a generated id + `created_at`; always stamp `updated_by`/`updated_at`; header-based writes (only known columns). Delete = hard delete by id.

**Read tabs** `fc_special_events` / `fc_target_rules` were already registered in `handleGetOperationDb_` / `handleGetTable_` / `filterRows_`.

**API adapter (`operation-system-db-api.js`):**
- Getters (pre-existing): `getFcRegularForecast()` · `getFcSpecialEvents()` · `getFcTargetRules()` · added `getSupplierPriceList()` (prior task).
- Writers (Phase 1): `upsertFcSpecialEvent(payload)` · `deleteFcSpecialEvent({event_id})` · `upsertFcTargetRule(payload)` · `deleteFcTargetRule({target_rule_id})` — each POSTs `{action,…}`, then `loadOperationDb({force:true})` so getters reflect the write.

---

## 6. Deployment note

The `.gs` files under `assets/specs/active/apps-script/` are a **source mirror**. `14_fc_write_handlers.gs` + the updated `01_router.gs` must be deployed into the Apps Script project before the write path functions against the Google Sheet. **Deployment status = UNVERIFIED** from this environment. If not deployed, `upsert*/delete*` return `{success:false}` (API not configured) or 404, and a Demo-OFF read shows whatever the sheet already contains (or empty).

---

## 7. Non-Goals (Phase 1)

- No change to FC calculation or the Target-rule resolver **formula**.
- No **dedicated** inline Edit Base FC single-row writer/action added this task, and no + Add SKU (removed, §1.1). This is a *dedicated-writer* scope note only — the Demo OFF Manual single-row Save still persists via the batch upsert (§8.4); single-row persistence is not disabled.
- No change to Regular Forecast Import behavior.
- No change to Request Order / Inventory / PO / Shipment / Weekly Shipping Plan.

---

## 8. New FC Update — first screen + Regular Forecast modal (UI + mapping)

### 8.1 First screen
`+ New FC Update` opens a chooser with **two large card buttons**: **Regular Forecast** ("Create or update monthly base forecast for selected Country / Marketplace / SKU") and **Special Events** ("Create special event forecast that will be added on top of regular FC"). Cards have hover + selected state; footer has **Cancel / Next**; Next routes to the chosen flow.

### 8.2 Regular Forecast modal fields
- **Country** + **Marketplace** (selectable; options from `marketplaces` / `fc_regular_forecast` distinct, prefilled from the current filter when unambiguous).
- **SKU** (text input) — required; drives the Manual prefill (§8.3a).
- **No Company field** — `company` is **derived from the `marketplaces` / `marketplace_skus` relation**, never manually chosen in the UI.
- **Target Year**, **Base Year**, **Update Method**, **Growth Rate**, **Target Month**, **Jan–Dec** — shown/hidden by method (§8.3). The Update Method select spans a full row so the option label is never truncated.

### 8.3a Manual prefill (existing-data) + no-silent-zero protection
When **Manual Monthly Forecast** is selected — or when **Country / Marketplace / SKU** change while in Manual mode — the Jan–Dec inputs are **prefilled from the existing `fc_regular_forecast` row** for the **full SITE identity: `company` + `country` + `marketplace` + `sku` + Target Year** (read-only lookup). Matching resolves the Marketplace dropdown value to the **canonical marketplace key** first (a display name is mapped back to its key — see §11), then matches on **`company` + `country` + `marketplace` + `sku` + `year`** — i.e. the **existing-row lookup identity is the SAME five-key as the upsert match key** (SOURCE-VERIFIED: `_regularPrefillManual` `assets/js/pages/fc-summary.js:1556-1568` filters `up(r.company) === up(company) && up(r.country) === up(country) && lo(r.marketplace) === lo(marketplace) && up(r.sku) === up(sku) && String(r.year) === String(year)`; "**Company MUST match — never fall back to a different company's row**"). `company` may be **derived from the selected UI / business context (the marketplace/site option) rather than manually entered, but it remains part of both the existing-row lookup identity and the upsert match key** — it is never a company-less four-key lookup.

**Prefill states + protections (no silent zero overwrite):**
- **No SKU selected** → the month inputs are **not touched** (prevents wiping a partially-typed grid to 0). Helper: *"Enter a SKU to load its existing monthly forecast."*
- **Live mode + DB cache not loaded yet** → prefill is **skipped**, **Save is disabled**, helper shows *"Loading existing forecast… please wait."* (never reads an empty set and overwrites).
- **Match found** → each month is filled; a **blank/empty** stored month **stays blank** (never coerced to 0). Helper: *"Existing forecast loaded for <sku> …"*.
- **No match** → months remain 0 and helper shows *"No existing FC found. Saving will create a new forecast row."*

Save is therefore an **upsert** (edit existing month values, or create a new row) — **target = `fc_regular_forecast`, key = `year + company + country + marketplace + sku`** (SOURCE-VERIFIED, batch writer `handleImportFcRegularForecastBatch_`). On the user's Save action the affected month(s) are written (see §8.4). **No _dedicated_ single-row backend writer exists; instead the single-row Manual Save routes through the batch upsert `importFcRegularForecastBatch` with a one-record (per-SKU) payload** — SOURCE-VERIFIED `saveRegularUpdate` `assets/js/pages/fc-summary.js:3059-3075` (Demo OFF branch `_fcUseDb()` → `window.KM.DB.importFcRegularForecastBatch(toWrite, …)`, then re-render + "Regular Forecast saved"). This is a **live write path, not a mock**; no fake success. **Deployment/Runtime UNVERIFIED** (the Apps Script writer is a source mirror).

### 8.3 Update Method definitions + conditional fields

| Method (value) | Meaning / source | Fields shown | Validation |
|---|---|---|---|
| **Apply Growth Rate (Based on Actual Sales)** (`actual`) | Base Year **actual sales from BQ** for the selected Country / Marketplace / SKU × (1 + Growth Rate). **BQ source = PENDING.** | Country, Marketplace, Target Year, Base Year, Growth Rate | Growth Rate **required, > 0** |
| **Adjust From Previous Month Forecast** (`prevMonth`) | Use an **explicitly selected** source `fc_regular_forecast` month × (1 + Rate) → Target month. The source month is **never silently inferred** — the user picks Based Year + Based Month (defaulted to the month before Target, editable). | Country, Marketplace, SKU, Target Year, **Target Month**, **Based Year**, **Based Month**, Growth/Adjustment Rate | Country, Marketplace, SKU, Target Year, Target Month, Based Year, Based Month all required |
| **Manual Monthly Forecast** (`manual`) | Direct monthly input. | Country, Marketplace, Target Year, Jan–Dec inputs | — |

### 8.4 DB mapping + Pending backend
- **Update target:** `fc_regular_forecast`. **Upsert match key = `year` + `company` + `country` + `marketplace` + `sku`** (SOURCE-VERIFIED, `04_marketplace_forecast_import.gs:532/537-543/583/594` — `bk(year, company, country, marketplace, sku)` builds the existing-row map and the per-row match; **`company` IS part of the match key**). `company` may be **derived from the selected UI / business context (`marketplaces` / `marketplace_skus`) rather than manually entered, but it remains part of the source-verified upsert match key** — "derived" does **not** mean "not part of the key".
- **Live-write call-path matrix (SOURCE-VERIFIED `fc-summary.js`; Deployment/Runtime UNVERIFIED):**

| Mode | UI action | Frontend handler | Router / API action | Backend writer | Actual write |
|---|---|---|---|---|---|
| **Demo ON** | Save Regular Update | `saveRegularUpdate` (`:3077-3087` in-memory branch) | — (no network call) | — | **No** (in-memory `fcRegularMock` only, labeled "DEMO … NOT written to DB") |
| **Demo OFF (live)** | Save Regular Update | `saveRegularUpdate` (`:3059-3075`, guard `_fcUseDb()`) | `importFcRegularForecastBatch` | `handleImportFcRegularForecastBatch_` (`04_..:485`) | **Yes** (one-record/per-SKU payload `toWrite`) |
| **Single-row edit (Manual)** | Save Regular Update | same `saveRegularUpdate` | `importFcRegularForecastBatch` | same batch writer | **Yes** — routes through the batch upsert with a one-record payload (there is **no separate single-row writer**) |
| **Batch save / CSV Import** | Import | `runFcImport` (`:3562-3638`) | `importFcRegularForecastBatch` | same batch writer | **Yes** (multi-record payload) |

  - **Correction (supersedes earlier wording):** the previous claim *"Demo OFF modal writes nothing / no single-row writer/action exists / pending"* is **INCORRECT vs active source** — Demo OFF Save **does** persist via `importFcRegularForecastBatch`. What is accurate: there is **no _dedicated_ single-row backend writer**; the single-row UI reuses the batch writer with a one-record payload. **Source existence + a wired UI call path do NOT prove Deployment or Runtime execution** — Apps Script `.gs` is a source mirror; **Deployment status: UNVERIFIED · Runtime status: UNVERIFIED**.
  - **BQ actual-sales source** for `actual` mode is **not implemented** (writer absent).
  - Previous-month sourcing (`prevMonth`) is **spec + UI**; its Save reuses the same live batch-upsert path above.
- **Demo ON:** the modal applies an **in-memory** illustrative update (clearly labeled "DEMO (in-memory only, NOT written to DB)"). Manual targets the specific SKU row (upsert).

---

## 9. Special Event Forecast **Builder v2** (UI + mapping)

The Special Event builder (FC Summary → **+ New FC Update → Special Events**) supports two modes: **Single SKU** and **Category / Series**. It is deal-/price-aware and campaign-oriented (Save target = campaigns → campaign_sku_lines → fc_special_events; see §12).

### 9.1 Common header
- **Scope** — Country, Marketplace (marketplace dropdown shows display name, value = canonical key — §11).
- **Event Info** — **Event Flag**, **Target Year** (readonly, = next year), **Event Period**.
- **Builder Mode** — radio pills: **Single SKU** / **Category / Series**.
- **No Company field** — derived from `marketplaces` / `marketplace_skus`. **Regular Price** is read from `marketplace_skus.regular_price` for the selected Country + Marketplace.

### 9.2 Single SKU mode (Part 2)
- Up to **8 SKU rows** (add/remove; always ≥ 1 row; `+ Add SKU Row` disables at 8).
- Row fields: **SKU**, **Regular Price** (auto-filled read-only from `marketplace_skus`), **Deal Price**, **Forecast Qty**.
- **No** Growth Rate / Base Campaign in Single SKU mode.
- Validation (Event Flag ≠ Normal): each row needs **SKU + Deal Price + Forecast Qty (> 0)**; max 8 rows.

### 9.3 Category / Series mode (Part 3–5)
- **Category** multi-select + **Series** multi-select, each with an **All** checkbox (checking All disables + clears the matching multi-select).
- **Build / Refresh Group Cards** resolves candidate SKUs from `marketplace_skus` (selected Country + Marketplace, for regular price + company) joined with `sku_details` (category / series), filtered by the selection.
- **UI card group key = category + series ONLY** (SOURCE-VERIFIED `fc-summary.js:2643`, `_evtBuildGroups` builds `key = category + '||' + series`). `regular_price` is a **per-SKU display / derived-calc value, NOT part of the card/group identity**: SKUs of the same category + series with **different** `regular_price` stay as **separate rows within ONE card** — **never separate cards** (explicit at `fc-summary.js:2631-2632`). It is likewise **not** any DB key (the `fc_regular_forecast` upsert key is `year + company + country + marketplace + sku`; campaign-line identity is `campaign_sku_line_id`). **SOURCE VERIFIED; Deployment/Runtime UNVERIFIED.**
- Each card shows Category, Series, and a **per-SKU** SKU list (chips, removable) — each SKU row carrying its own **Regular Price**, **Deal Price**, **Forecast Qty** — plus Remove-group / Remove-SKU controls. User-typed Deal/FC values are preserved across a rebuild for matching keys.
- **Discount %** (Part 4): shown **only when All Category or All Series** is checked. The discount percentage is a **group-level suggestion parameter only** — it is **not** a card-level Deal Price. **Apply Discount to Cards** computes `deal_price = regular_price × (1 − discount%)` (rounded to cents) **against each SKU's own `regular_price`** and pre-fills **each SKU row's own `deal_price` field** (SOURCE-VERIFIED `_evtCardDiscount` `fc-summary.js:2703-2712` iterates `g.rows.forEach(r => r.dealPrice = …)`); the user may **override Deal Price independently per SKU row** (`_evtLineField(gi, ri, 'dealPrice')` `:2692/2715`). There is **no single shared card-level Deal Price input**.
- **Forecast Assist** (Part 5, Category/Series only) — method-aware, **computed PER SKU** (never a single shared card value): **Manual** (editable per-SKU New Event FC), **Growth** (Base Campaign + Growth Rate %), **Adjust** (Base Year + Base Month + adjustment). **Apply Forecast Assist** computes, **for each in-scope SKU independently**, `newFc = compute(base(sku))` and **pre-fills that SKU's own New Event FC input** — SOURCE-VERIFIED `_evtApplyForecastAssist` `fc-summary.js:2830-2845` (`_evtGroups.forEach(g => g.rows.forEach(r => { base = baseFor(r.sku); r.newFc = compute(base); }))`). The suggested value is a **defaulting input only**: it is copied into **independently editable per-SKU Forecast Qty fields** (`class="evt-line-fc"`, `_evtLineField(gi, ri, 'newFc')` `:2686/2715`); the user must review and click **Save** (never silently written). The **group card is a container of per-SKU rows — there is NO single card-level Forecast Qty input**; the only card-level control is Discount % (`_evtCardDiscount` `:2703`), which propagates to each row's Deal Price but is not a Forecast input. Growth base = the selected Base Campaign's linked `fc_special_events` fc_qty **for that SKU** (`_evtGrowthBaseForSku` `:2429-2430`); if a SKU has no base, its New Event FC stays **blank and is skipped on Save** (never fabricated 0). **Base Campaign source** = `getCampaigns()`; if there are **no campaign records**, the select is **disabled / pending** and the assist reports it.

**§9.3a Grain Matrix (SOURCE-VERIFIED `fc-summary.js`; Deployment/Runtime UNVERIFIED) — no ambiguity:**

| Dimension | Current verified grain | Evidence |
|---|---|---|
| UI group key | **category + series** (only) | `_evtBuildGroups` `:2643` |
| Group/card role | **presentation & campaign-organization container only** (not an input/save/DB grain) | card render `:2664-2700` |
| Forecast suggestion calculation | **per SKU** (`base(sku)`) | `_evtApplyForecastAssist` `:2832-2838` |
| Forecast display | **per SKU row** | assist preview `:2842`; card rows `:2679-2687` |
| Forecast editable input | **per SKU row** (`.evt-line-fc`) | `:2686`, `_evtLineField(gi,ri,'newFc')` `:2715` |
| Deal Price suggestion calculation | **per SKU** (against that SKU's own `regular_price`) | `_evtCardDiscount` `:2708-2710` |
| Deal Price display | **per SKU row** | card rows `:2690-2692` |
| Deal Price editable input | **per SKU row** (`.evt-line-deal`) — independent of Forecast; the group Discount % is only a suggestion parameter | `:2692`, `_evtLineField(gi,ri,'dealPrice')` `:2715` |
| Save payload | **per SKU row** (one `lines[]` entry per SKU) | `saveEventUpdate` `:2911-2925` |
| `campaign_sku_lines` | **one row per SKU** | §12 — Campaign persistence mapping |
| `fc_special_events` | **one row per SKU** | §12 — `campaign_sku_lines` / `fc_special_events` per-SKU persistence |
| DB persistence | **per SKU row** | §12 — Campaign persistence mapping |

Forecast Qty grain and Deal Price grain are recorded **separately** (both per-SKU row here), each with its own Source evidence, and neither is inferred from the other. The `category + series` group/card is a **grouping container only** — never the input, save, or DB grain.

### 9.4 Event Flag enum + rules (Part 6)
Event Flag enum: **Normal / Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day**.

| Event Flag | Behaviour |
|---|---|
| **Normal** | **Creates nothing** (no campaigns / campaign_sku_lines / fc_special_events). Event Period hidden; Save shows an explanatory message (baseline covered by `fc_regular_forecast`). |
| **!= Normal** | **Target Year + Event Period required**; **Forecast Qty required (> 0) per SKU** — in Single-SKU mode directly, and in Category-Series mode **per SKU row within each group card** (the group card is a container of per-SKU rows, **not** a single card-level quantity; persistence grain = one `fc_special_events` row per SKU, §12). |

---

## 10. Campaign ↔ fc_special_events sync rule (Part 2)

`fc_special_events` can be populated from **two independent sources**, linked (not blind two-way synced) by `campaign_id` / `campaign_sku_line_id`:

**Source-of-truth model**
- **Campaign** (`campaigns` + `campaign_sku_lines`) is the **promotion source of truth**.
- **`fc_special_events`** is the **supply-chain forecast source of truth**.
- They are joined by `campaign_id` / `campaign_sku_line_id`. **No unconditional two-way loop** — each side owns its own fields; the link lets a Campaign locate the FC row it created and lets FC report which Campaign a forecast came from.

**A. Campaign → fc_special_events (Add Promotion save)** — *the campaign / line / event writers **SOURCE-EXIST and are router-wired** (`20_campaign_write_handlers.gs` `handleUpsertCampaign_` / `handleUpsertCampaignSkuLines_`; `14_fc_write_handlers.gs` `handleUpsertFcSpecialEvent_`; router `01_router.gs` ≈207-213 / 182). A **single atomic three-table Save orchestration is NOT implemented** (client-side sequential writes, no cross-table rollback). Source status: **SOURCE-EXISTS / ROUTER-WIRED**; Deployment status: **UNVERIFIED**; Runtime status: **UNVERIFIED** — see §12.1. This is **not** "writer source not yet built".*
- Event Flag = **Normal** → no `fc_special_events` required.
- Event Flag **!= Normal** → **Forecast field required**.
- On Save, the Campaign flow should create/update, in order:
  1. `campaigns`
  2. `campaign_sku_lines`
  3. `fc_special_events` linked by `campaign_id` / `campaign_sku_line_id`, `source='campaign_sync'`.

**B. FC Summary → fc_special_events (this modal)** — *the current Builder Save writes `campaigns` → `campaign_sku_lines` → `fc_special_events`, so `campaign_id` is always populated (see §12).*
- **`campaign_id` is REQUIRED** (SOURCE-VERIFIED: `handleUpsertFcSpecialEvent_` rejects a body lacking `campaign_id` — `14_fc_write_handlers.gs:272-273`, error "Missing campaign_id — an event forecast must link to a campaign"). An event forecast must therefore carry a `campaign_id`; however, rejecting a **blank** `campaign_id` only guarantees the link ID is present — the handler does NOT validate that the referenced parent campaign actually exists, no DB foreign-key enforcement is proven, and no atomic three-table transaction/rollback exists. Blank `campaign_id` rejection is verified; full orphan prevention remains **Not Proven / Risk Exists**.
- **`campaign_sku_line_id` is OPTIONAL** and is a **separate rule** from `campaign_id`: when present it forms the primary business key `campaign_id + campaign_sku_line_id`; when absent the handler uses the fallback key `campaign_id + marketplace_id + sku + event_month + year` (`14_fc_write_handlers.gs:179-199`). It is never required for the write to succeed.
- **LEGACY / SUPERSEDED — NOT CURRENT SUPPORTED CONTRACT:** an earlier design in which FC Summary created `fc_special_events` **directly with `campaign_id` / `campaign_sku_line_id` blank** (`source='manual_fc_summary'`). The current source-verified handler **rejects** a blank `campaign_id`, so a direct no-campaign Save is **not a verified supported flow**. Legacy rows created before the campaign-link contract may still carry blank ids (handled by the read-only `auditFcSpecialEventIds` / one-time `backfillFcSpecialEventIds`), but that is a legacy-data condition, not a current Save capability.
- **Future enhancement (not built):** allow linking an already-persisted FC row to an existing Campaign after the fact.

**Guardrails honoured:** no Tier Event DB, no Campaign full rewrite, no performance calculation, no BQ actual-sales query, no blind two-way sync.

---

### 10.1 Special Event identity and window change — FROZEN (FC-SUMMARY-R2B-A3-R9, 2026-09-21)

**This section supersedes the A3-R8 freeze it replaces.** A3-R8 ruled that a different window was a
different logical event, because at the time nothing said otherwise and the campaign header — which
carries the window and is shared — could not be repointed. Live smoke settled the product question the
other way: for one scoped SKU, **one event flag in one target year is one event**, whatever its dates.
The A3-R8 text is removed rather than annotated, because two frozen answers to one question are worse
than either of them.

```window-policy
SPECIAL_EVENT_UNIQUENESS_KEY   = company + country + marketplace + sku + event_flag + target_year
SECOND_EVENT_FOR_SAME_KEY      = FORBIDDEN
WINDOW_CHANGE_SEMANTICS        = EXPLICIT_CONFIRMED_EDIT_OF_THE_SAME_EVENT
EVENT_FC_ID_POLICY             = PRESERVED_ACROSS_A_WINDOW_EDIT
WINDOW_EDIT_STRATEGY           = CAMPAIGN_REASSIGNMENT
OLD_CAMPAIGN_POLICY            = PRESERVE
EMPTY_CAMPAIGN_AUTO_DELETE     = NO
PER_SKU_SHARED_HEADER_MUTATION = FORBIDDEN
```

The date window is **not** part of event identity. It remains part of **campaign** identity —
`HEADER_IDENTITY_KEY` in
[`CAMPAIGN_PROMOTION_RECORD_CONTRACT.md` §1.2](./CAMPAIGN_PROMOTION_RECORD_CONTRACT.md) is unchanged and
is still cited rather than copied. Those two facts are what make reassignment the only safe strategy:
the event keeps its identity, and it moves to the campaign header that matches its new window.

#### A · Creating an event

A new event may be created **only** when no event exists for its uniqueness key. If one does, creation is
refused and the operator is directed to the existing event. A different window does **not** authorise a
second event. For a multi-SKU save the refusal is **one validation result listing every conflicting SKU**
with the window each already occupies — conflicting rows are never silently skipped so the rest can save.
Zero campaign writes, zero line writes, zero event writes.

This is enforced **twice, in two authorities**: a client preflight before stage 1, so the operator is told
before anything is attempted, and an authoritative server guard in `fcSpecialEventUpsert_`, because a
stale browser cache, a second tab, a concurrent save, a direct API caller and a replayed request are all
outside the client's knowledge.

#### B · Editing an event

The existing event is the canonical path for changing **forecast quantity, deal/discount data and the
event period**. Start and end dates are editable in existing-event mode, behind an explicit
**Change the event period** checkbox (§10.2 owns what that control looks like and when it appears):

| dates | checkbox | outcome |
|---|---|---|
| unchanged | not required | ordinary existing-event save |
| changed | unchecked | **Save blocked, zero network writes**, old window → new window shown |
| changed | checked | the same logical event is edited, by reassignment |

#### C · Reassignment, and why not mutation

A confirmed window change performs, in order:

1. **resolve or create** the `campaigns` header for the NEW window — by `HEADER_IDENTITY_KEY`, quoting no
   `campaign_id`, so an existing header for that window is reused with zero writes and a missing one is
   created;
2. **repoint the line** — `campaign_sku_lines` is upserted by its existing `campaign_sku_line_id` under the
   new `campaign_id`, so the line keeps its identity and changes parent;
3. **repoint the event** — `fc_special_events` is upserted by its existing `event_fc_id`, quoting the
   version it was loaded at, with the new `campaign_id` and the new window.

`event_fc_id` and `campaign_sku_line_id` are preserved throughout: the lineage moves with the event.

**The old campaign header is never mutated and never deleted.** A header can be shared by many SKU lines,
and mutating its window would silently move every sibling SKU's event — which is why the server refuses it
(`CAMPAIGN_IDENTITY_MISMATCH`, *"a campaign's site, type or event window is never silently repointed"*).
Sibling lines and sibling events keep pointing at the old header and are untouched, including when the
move leaves that header with no members: an emptied campaign is preserved, never swept.

#### D · Still out of scope

No cascade of a date change to sibling SKUs. No deletion of an emptied campaign. No mutation of a shared
header on one SKU's behalf. Moving an **entire** campaign window for every member at once remains a
Campaign-level lifecycle operation that needs its own spec.

#### E · Where this is enforced

Client — `_evtUniquenessKey_` / `_evtDuplicateConflicts_` (create preflight), `_evtWindowChangeGate_` and
the confirm checkbox, `_evtWindowEditActive_` (which suppresses the `campaign_id` quote so stage 1
resolves the new window) and `_evtSingleRowIdentity_` (which keeps the loaded lineage through the move),
all in `assets/js/pages/fc-summary.js`. Server — `fcSpecialEventUpsert_` refuses
`DUPLICATE_SPECIAL_EVENT_IDENTITY` for a second event on one uniqueness key and keeps the
`STALE_SPECIAL_EVENT_VERSION` gate (`14_fc_write_handlers.gs`); `campaignResolveOrTerminal_` keeps
refusing a repointed header (`20_campaign_write_handlers.gs`).

### 10.2 Event period — what the operator sees — FROZEN (FC-SUMMARY-R2B-A3-R10, 2026-09-22)

§10.1 froze what a window change MEANS. This freezes what it LOOKS LIKE, because live smoke found the
two had come apart: an existing event offered a confirmation tick for dates it was not showing, and a
new event asked for a period it had hidden. The period controls had exactly one owner —
`toggleEventFlagFields`, keyed on the event flag alone — and nothing re-ran it when hydration set the
flag programmatically, so the visible form did not follow the mode it was in.

```
PERIOD_UI_AUTHORITY            = ONE function, derived from (builder mode, confirmation state)
NEW_EVENT_DATES                = ALWAYS VISIBLE, ALWAYS REQUIRED
NEW_EVENT_PERIOD_CONFIRM       = NEVER SHOWN
EXISTING_EVENT_DATES_DEFAULT   = HIDDEN
EXISTING_EVENT_PERIOD_CONFIRM  = ALWAYS SHOWN while an event is loaded
EXISTING_EVENT_DATES_CONFIRMED = VISIBLE, PREFILLED WITH THE SAVED WINDOW, REQUIRED
SAVED_WINDOW_DISPLAY           = shown whenever an event is loaded, edited or not
```

The flag still decides whether a period is MEANINGFUL — `Normal` writes no event at all — but it no
longer decides whether the controls exist. A form that hides a field it will later refuse to save
without is the defect this replaces.

| mode | dates | confirm tick | validation |
|---|---|---|---|
| New event | visible, empty | hidden | both dates required |
| Existing, unconfirmed | hidden | shown, unticked | **dates not required, and never demanded** |
| Existing, confirmed | visible, prefilled with the saved window | shown, ticked | both dates required |

Ticking the box is not itself a change. Confirmed **with the saved dates unaltered** is an ordinary
existing-event save: no reassignment, no campaign resolution for a window nobody moved. The
reassignment in §10.1 C runs only when the confirmation and a genuinely different window are both
present.

**Operator-facing language.** The Builder describes the EVENT, never the storage that holds it.
`campaign_id`, `event_fc_id`, `campaign_sku_line_id`, "identity", "scope" and "reassignment" are
implementation vocabulary and do not appear in it. The banner carries at most two short lines: which
saved event is open, its saved window, how many SKUs it holds, that the forecast values can be edited,
and that the period changes through the tick.

---

## 11. Marketplace display label rule (UI display vs DB key)

The `marketplaces` table carries both a **canonical key** (`marketplace`, e.g. `Walmart`) and a human **display name** (`marketplace_display_name`, e.g. `KM Walmart`). The normalizer already exposes `marketplaceDisplayName` on each marketplace record.

**Rule (applies to FC Summary + Inventory Replenishment):**
- **Dropdown / table label = `marketplace_display_name`**, falling back to `marketplace` when the display name is blank.
- **Dropdown value / stored value / write payload = the canonical `marketplace` key** — the display name is **never** written to the DB as the key.
- On read/lookup, a value that is a display name is **resolved back to its canonical key** before matching (`_fcResolveMarketplaceKey` in FC Summary).
- **Dedupe by the `value` + `label` pair**, never by key alone — distinct display names for the same canonical key are all shown and selectable (so **KM Walmart** appears even when its key is `Walmart`).

**Applied to:**
- FC Summary filters (marketplace panel), FC Summary Regular + Special Event modal marketplace dropdowns, FC Summary Regular/Event tables (marketplace column).
- Inventory Replenishment main Marketplace filter + results-table marketplace column (`_replenMarketplaceLabel`). (The Add SKU / Import marketplace dropdowns already displayed the display name.)

**Helpers:** FC Summary `_fcMarketplaceLabel(key, company, country)` / `_fcMarketplaceOptions()` / `_fcResolveMarketplaceKey(value)`; Inventory Replenishment `_replenMarketplaceLabel(key, company, country)`. **No normalizer / API / DB-key change** — display is a presentation-layer concern only.

---

## 12. Special Event Builder — Save mapping + backend status (Part 7–8)

On Save (Event Flag ≠ Normal), the builder targets **three linked tables**. Campaign is the promotion source of truth; `fc_special_events` is the supply-chain forecast source of truth; they are **linked by `campaign_id` / `campaign_sku_line_id`** — **not** blind two-way synced.

**1. `campaigns`** (one per Save): `campaign_id`, `campaign_name` (= `<Event Flag> <Year>`), `country`, `marketplace` (canonical key), `promotion_type` (= Event Flag), `major_event_flag / event_flag`, `year`, `start_date` / `end_date` (from Event Period), `status` (`active`), `source` (`fc_summary_builder`), `created_at`, `updated_at`.

**2. `campaign_sku_lines`** (one per SKU): `campaign_sku_line_id`, `campaign_id`, `sku`, `regular_price`, `promo_price / deal_price`, `discount_percent` (explicit Discount % if set, else derived `1 − deal/regular`), `line_status` (`active`), `source` (`fc_summary_builder`), `created_at`, `updated_at`.

**3. `fc_special_events`** (one per SKU): `event_fc_id`, `campaign_id`, `campaign_sku_line_id`, `marketplace_id`, `sku`, `year`, `company`, `country`, `marketplace`, `category`, `series`, `event` (= Event Flag), `event_period`, `event_month`, `fc_qty`, `fc_share` (runtime), `source` (`campaign_sync`), `status` (`active`), `created_by/at`, `updated_by/at`, `note`.

### 12.1 Backend writer status — **SOURCE EXISTS; DEPLOYMENT/RUNTIME UNVERIFIED; atomic 3-table Save NOT IMPLEMENTED**
- **Campaign writers SOURCE-EXIST and are router-wired** (corrected 2026-07-29 from the earlier "do NOT exist"): `handleUpsertCampaign_` (`20_campaign_write_handlers.gs:99`, action `upsertCampaign`) and `handleUpsertCampaignSkuLines_` (`20_campaign_write_handlers.gs:136`, action **`upsertCampaignSkuLines`** — plural) are real upsert handlers wired in `01_router.gs` (≈207-213); `fcSpecialEventUpsert_` / `handleUpsertFcSpecialEvent_` (`14_fc_write_handlers.gs:219/268`) also exist. **This is source-mirror evidence only — DEPLOYMENT and RUNTIME execution are UNVERIFIED in this environment.**
- **What is NOT implemented:** a **single atomic three-table Save** (one backend transaction writing `campaigns → campaign_sku_lines → fc_special_events` with cross-table rollback). The three writers exist **individually**; there is **no backend orchestrator / transaction** — any three-layer flow would be **client-side sequential POSTs** with no rollback. Do not describe a unified atomic "three-layer Save" as implemented.
- `handleUpsertFcSpecialEvent_` **rejects** an event with a blank `campaign_id` (write campaign → line first) — this verifies the link ID is present, but it does NOT validate that the referenced parent campaign (or, when supplied, the parent `campaign_sku_line_id`) actually exists, no DB foreign-key enforcement is proven, and no atomic three-table transaction/rollback exists. Blank `campaign_id` rejection is verified; full orphan prevention of `fc_special_events` rows remains **Not Proven / Risk Exists**.
- To reach a verified state: confirm Apps Script **deployment** + **runtime execution** of the above writers, and (if required) build a backend three-table orchestrator; the live `fc_special_events` header carries `campaign_id` / `campaign_sku_line_id` / `source` / `status` (see §3.1 reconciliation).

---

## 13. Target Year editable + FC Summary cascading filters

### 13.1 Target Year — editable, default only on open
- **Regular FC Update** and **Special Event Forecast** Target Year inputs are **editable** (the `readonly` attribute was removed).
- The default value (`fcTargetYear` = next year) is applied **only when the modal opens** (`openRegularUpdateModal` / `openEventModal`). It is the **only** code path that writes the Target Year field.
- Changing **Country / Marketplace / SKU / Update Method / Event Flag / Builder Mode** does **not** reset Target Year (the render / method-toggle / prefill functions only *read* it — e.g. `_regularSyncBasedFromTarget`, `_regularPrefillManual`). A user edit (2027 → 2028) persists through all other field changes until the modal is reopened.

### 13.2 Filter options — full set, non-cascading (reverted)
FC Summary dropdown filters — **Company / Marketplace / Country / Category / Series / Event Type** — always show their **full option set**. Selecting a value (e.g. Country = US) filters the **table** but does **NOT** narrow the other dropdowns' options to only the related values. (An earlier cascading/faceted narrowing was **removed** — `_fcCascadeFilters` / `_rebuildFcPanelChecked` deleted and their calls removed from `updateFcFilter` / `toggleFcAll`.)

- Options are built **once per load** by `_populateFcFilterOptionsFromDb` (Demo OFF) from distinct `fc_regular_forecast` values per dimension, independently; the Event Type panel is static. SKU is a free-text substring filter.
- **All-toggle behaviour (unchanged):** default all checked → all rows; toggling **All** off clears the dimension → **no rows** for it until the user selects; toggling **All** on → all rows again.
- **Marketplace** options: checkbox **value = canonical `marketplace` key** (internal), **label = `marketplace_display_name`** (fallback `marketplace`) — see §11.

**Table filtering (Part 4):** `filterFcRegular` / `filterFcEvent` include a row only when its value is among the checked values for each dimension (marketplace compared by the internal canonical key); the table **displays** `_fcMarketplaceLabel(...)`. A dimension with **no** value checked shows nothing. No change to FC calculation.

**Data source note:** options are built from live `fc_regular_forecast`; `marketplace_display_name` is resolved from the normalized `marketplaces` registry (`_fcMarketplaceLabel`). If registry display data is missing, the label falls back to the canonical `marketplace` value.

---

## 14. FC Summary initial read — recovery and single authority — FROZEN (FC-SUMMARY-R2B-A3-R10, 2026-09-22)

### 14.1 One authority for "which slices are in hand"

The page held **two**: `_fcReadModel` (the data) and `_fcSliceState_` (the ledger describing it). A
refusal nulled the model — correctly, so the primary render can never fall back to the broad cache —
and left the ledger untouched. A slice that had already landed therefore stayed `CURRENT` over a model
that no longer contained it, and Retry, which asks only for what the ledger calls failed, never asked
for it again.

Reproduced: Regular lands, bootstrap times out, the refusal nulls the model, Retry fetches bootstrap
only, the banner clears, and the Regular table renders **empty with no error** — recoverable only by
navigating away and back.

```
MODEL_AND_LEDGER_INVALIDATION  = ONE OPERATION, never two writes to be kept in step
REFUSAL_THAT_NULLS_THE_MODEL   = MUST reset every slice record that described it
RETRY_SCOPE                    = every slice the active tab needs and does not have
SILENT_EMPTY_TABLE             = FORBIDDEN — unread is not empty, and must never render as empty
```

### 14.2 Generations — a late answer may not overwrite a newer one

A slice merge is a commit into shared state. It is guarded by a generation captured at dispatch and
checked at the commit point, not at the draw point: an answer whose generation has been superseded is
dropped rather than merged. Invalidating the model advances the generation, so a request issued before
the reset cannot repopulate the model it was reset out of.

### 14.3 The cold mount is arbitrated, not re-timed

A client timeout starts at **dispatch**, so a read dispatched beside the boot capability read spends
part of its own 60 s budget queueing for a backend slot. That is arithmetic about when the clock
starts, not a claim about the backend scheduler, and it is why the remedy is never a longer timeout.

FC Summary's cold mount waits on the **existing** boot arbiter (`KM.bootArbiter`, R6-R5) for the
`capabilities` dependency, by settlement and under a cap that can only make the read start sooner. No
second coordinator is introduced. The bootstrap and active-tab slices still go out **together** — two
parallel requests were measured at 4.5 s against 10 s sequential, and that measurement is not reversed
here.

```
READ_TIMEOUT_MS                = 60000, UNCHANGED — enlarging it is not a fix for contention
COLD_MOUNT_DEPENDENCY          = capabilities (settlement, capped)
COLD_MOUNT_PARALLELISM         = bootstrap + active slice together, unchanged
AUTOMATIC_RETRY_ON_TIMEOUT     = NO — the bound already elapsed; Retry is the operator's
```

### 14.4 `marketplaces` has one owner

`marketplaces` is carried by the **bootstrap slice** and adapted through `normalizeMarketplaceRecord`
with the same filter `normalizeOperationDb` applies — so the workspace array and the broad-cache array
are the same rows in the same shape. The Special Event and Regular builders therefore read it from the
page read model, and it is **not** a builder prerequisite: no `getTable('marketplaces')` is issued.

```
MARKETPLACES_OWNER             = fcSummary bootstrap slice -> _fcReadModel.marketplaces
MARKETPLACES_BUILDER_ACCESSOR  = _fcGetMarketplaces()
MARKETPLACES_PHYSICAL_GETTABLE = 0
```

`marketplace_skus` is **not** in the workspace and stays a prerequisite read. The difference is which
rows an authoritative read already brought, not a preference for one path.

---

## 15. FC write performance and atomicity — FROZEN (FC-SUMMARY-R2B-B1-PERF, 2026-09-22)

A3 froze what the writes MEAN. This freezes what they COST and what they may leave behind when they
fail. Nothing here changes a business rule; every A3 guard is carried forward unmodified.

### 15.1 Regular forecast — the write is one transaction, not a row-by-row walk

The handler validated row 1, wrote row 1, then validated row 2. A bad row 5 therefore left rows 1-4
committed and row 5 half-written, because a row was itself written cell by cell. The order is now
fixed, and the first mutation is the eighth step rather than the third:

```
1 parse            the whole batch                       no sheet access
2 normalise        the whole batch                       no sheet access
3 validate PURE    every row                             no sheet access, no lock
4 read reference   sku_details                           OUTSIDE the lock — this write cannot change it
5 acquire lock     LockService.getScriptLock()
6 read authority   fc_regular_forecast + build the key index
7 validate RACE-SENSITIVE and build the whole write plan IN MEMORY
8 FIRST MUTATION   bounded setValues blocks + ONE append block
9 release          in a finally
```

```
REGULAR_INVALID_BATCH_WRITES   = 0 — one bad row and the batch writes nothing at all
REGULAR_FIRST_WRITE_AFTER_ALL_VALIDATION = YES
REGULAR_PER_CELL_SETVALUE      = FORBIDDEN
REGULAR_PER_ROW_APPENDROW      = FORBIDDEN
NETWORK_INSIDE_LOCK            = FORBIDDEN
```

### 15.2 Column ownership — the writer owns a subset, and writes only that

The canonical order is declared in `04_marketplace_forecast_import.gs`. The owned columns are **not
contiguous**: `fc_share` sits between `total_fc` and `forecast_status`, and `created_at` between
`source` and `updated_at`. A full-width row write is therefore FORBIDDEN — it would destroy both.

| column | on create | on update |
|---|---|---|
| `forecast_id`, `year`, `company`, `country`, `marketplace`, `sku` | written | **never touched** (identity) |
| `category`, `series`, `jan`..`dec`, `total_fc` | written | written |
| `fc_share` | `''` | **never touched** — runtime-calculated, §3.1; not this writer's column |
| `forecast_status` | written | only when blank, or `options.overwriteStatus === true` |
| `source`, `updated_at` | written | written |
| `created_at` | written | **never touched** |

Column positions are resolved at runtime from the sheet header, never from a constant, so a reordered
sheet cannot silently shift a span.

### 15.3 Range write — bounded blocks, not cells

An update writes the two owned spans plus `updated_at`; an insert joins ONE append block. Physical
Spreadsheet mutation calls, for N updates and M inserts:

```
BEFORE   17N..18N setValue  +  M appendRow
AFTER    <= 3N   setValues  +  (M ? 1 : 0) setValues
```

Adjacent owned spans are merged where the header makes them contiguous, so the bound is an upper one.
The count is independent of the number of months.

### 15.4 Lock — the smallest boundary that makes the race safe

There was no lock. Two concurrent batches could interleave per CELL on one row, and two batches
creating the same business key could each append, leaving two rows under one key. The lock covers the
authoritative read, the race-sensitive validation and the writes — and nothing else.

```
REGULAR_LOCK              = LockService.getScriptLock()
REGULAR_LOCK_WAIT_MS      = 30000, matching the campaign writer
REGULAR_LOCK_REFUSAL      = REGULAR_FORECAST_LOCK_TIMEOUT, zero_write: true
REGULAR_LOCK_RELEASE      = finally, on every path
OUTSIDE THE LOCK          = parse, normalise, every pure rule, the sku_details read, the response
```

The script lock is project-wide and contended. Enlarging its timeout is NOT the remedy for contention —
A3-R6 established that the remedy is to hold it over less. That is why the reference read sits outside.

### 15.5 Regular delivery — the canonical write transport

`importFcRegularForecastBatch` was the last FC writer on a raw `fetch`: no request id, no timeout bound,
no typed classification, no proven-zero-write. It moves onto `_kmCanonicalWrite_`, the path every other
FC writer already uses. The handler is idempotent by `year|company|country|marketplace|sku` and
de-duplicates within a batch, so the action joins `REPLAY_SAFE_ON_LOST_DELIVERY_`: a replay of a request
that did land updates the same rows instead of minting new ones.

The `if (json && json.success) { await _kmWriterPostWrite_(); }` seam is PRESERVED verbatim. It is a
posture-gated fail-safe, not a duplicate read: in a healthy session every canonical workspace is active
and it is a no-op.

### 15.6 Special Event — stage 3 is one request

Stage 3 looped `upsertFcSpecialEvent` once per SKU. It now calls the batch action that already exists,
over the same server core, so every A3 guard is inherited by construction rather than re-implemented.

```
BEFORE   2 + N logical writes     N=1 -> 3   N=4 -> 6   N=8 -> 10   N=20 -> 22
AFTER    3 logical writes         N=1 -> 3   N=4 -> 3   N=8 -> 3    N=20 -> 3
ACTION   importFcSpecialEventsBatch — EXISTING; no new action is introduced
CORE     fcSpecialEventUpsert_ — the same one the single path calls
```

**The failure semantics invert, and the UI must say so.** The loop stopped at the first refusal; the
batch commits the rest and reports per row. `success: true` therefore means "the batch ran", NEVER
"everything committed". A result carrying any skipped row is reported as PARTIAL, naming each SKU, its
reason and its current row version, and saying plainly which rows did commit.

Results are positional: `results[i]` belongs to `lines[i]`. The classifier maps them by index and
carries `event_fc_id`, `campaign_sku_line_id`, `row_version` and `fc_qty` per row.

### 15.7 Post-write cache — a write invalidates what it can change, and nothing else

The builder prerequisites are recorded per TABLE. A write drops only the tables it can touch:

```
regular write   -> fc_regular_forecast
special write   -> campaigns, campaign_sku_lines, fc_special_events
target write    -> fc_target_rules   (held by NEITHER builder path, so both stay warm)
never dropped by any of them: sku_details, marketplace_skus, pricing_list
```

So after a successful Special save, reopening the Builder re-reads the three tables that write could
have staled and reuses the rest:

```
POST_SPECIAL_WRITE_WARM_NEXT_PREREQ_READS = 3, never 6
POST_REGULAR_WRITE_SPECIAL_PATH           = stays warm
POST_TARGET_WRITE_BOTH_PATHS              = stay warm
```

Precision, not preservation: the three tables a Special write CAN change are always dropped. Keeping
them would present stale campaign data as fresh.

### 15.8 What B1 did not touch

Every A3 contract stands: the Special Event uniqueness key and its server guard, the confirmed window
edit and its campaign reassignment, the stale-version gates, the MAX-8 authoring cap and the absence of
a storage cap, the Base Event FC semantics, and every A3-R10 read-recovery property. No DB migration,
no schema change, no new routed action, and no client timeout was enlarged.

---

## 16. FC Share — what the two columns mean — FROZEN (FC-SHARE-DUAL-MODEL-R1, 2026-09-22)

> Formula authority is `SUPPLY_PLANNING_CALCULATION_RULES.md` §7/§7.1 and the runtime owner is KMFCS
> (`assets/js/core/supply-planning-forecast-share.js`). This section owns only what FC Summary DISPLAYS.

### 16.1 The defect this closes

The `FC占比` column was produced by a page-local function with no spec owner and no test. Measured by
running the shipped function over three real sites:

```
KM/US/Amazon/CO1100-R   Σ=1200   displayed 14.3%   (correct: 57.1%)
KM/CA/Amazon/CO1100-R   Σ= 600   displayed 14.3%   (correct: 28.6%)
KM/JP/Amazon/CO1100-R   Σ= 300   displayed 14.3%   (correct: 14.3%)
SUM ON SCREEN = 42.9%
```

Its entry key was `company-sku-marketplace`, which drops **country** — three sites the page's own
`fcRowIdentityKey` calls distinct collapsed onto one entry and the last write won. Four further causes:
the denominator was the **filtered** set; it was computed over the filtered set but displayed **25 rows at
a time**; the numerator was twelve individually ceiled months of **one calendar year** rather than the
canonical rolling basis; and it rounded per row then validated the **unrounded** sum, so 33.3×3 = 99.9
never warned. Demo mode hard-codes a single company, which is why this was invisible there.

### 16.2 What the columns are

```
COLUMN  Company FC Share   = site basis ÷ Σ basis of all sites of the SAME COMPANY
COLUMN  Site FC Share      = site basis ÷ Σ basis of ALL sites (diagnostic; NOT an allocation weight)
BASIS                      = Σ RAW Regular FC over M+1..M+4  (never annual Total FC)
KEY                        = KMFSA canonical site identity — marketplace_id, else company|country|marketplace
DENOMINATOR SOURCE         = the AUTHORITATIVE UNFILTERED row set, never the filtered or paginated view
EVENT TAB SHARE COLUMN     = REMOVED (§B10) — never computed from fc_special_events.fc_qty
```

### 16.3 Why both columns currently read "—"

A rolling-window share needs a **calculation month**, and FC Summary has no canonical planning anchor:

| Candidate | Why it is not an anchor |
|---|---|
| `58_` workspace `observed_at` | a read timestamp; carries no calculation month or planning cycle |
| `km-api-foundation` `lastCalculationMonth` | a diagnostic of the last **recommendation** request; FC Summary issues none |
| IR `validateCalculationMonth` | **operator-entered** on that page, persisted to that page's state — an input, not an authority |
| Site Inventory `new Date()` | the browser clock (`inventory-replenishment.js:11484`) — the precedent not to copy |

There is no `planning_cycles` table and no global anchor owner in the repository. So the anchor is typed
**ANCHOR_UNAVAILABLE**, both columns render an em dash, and the cell `title` says why.

This is deliberate. The browser clock would make a planning figure a property of the viewer's system
date — two operators comparing screens on the 31st and the 1st would see different shares of the same
forecast. The selected year's annual total would answer a **different question under the same heading**,
which is exactly how the old column came to be trusted while being wrong. **A number nobody can act on
beats a number everybody acts on wrongly.**

```
SITE_ALLOCATION_SHARE_UI_CONTEXT = UNAVAILABLE   (FC Summary has no factory-source context either,
                                                  so the eligible-receiver share is never displayed
                                                  here and allocation stays with KMFSA)
MISSING_OWNER                    = a canonical planning-anchor owner. Supplying one value to
                                   `_FC_SHARE_ANCHOR_` lights both columns up; no formula moves.
```

### 16.4 The legacy column

```
fc_regular_forecast.fc_share   LEGACY · empty · never written with a value · read by nothing
B1 Regular writer              create -> ''   ·   update -> untouched      (UNCHANGED this round)
DO NOT                         rename · drop · populate · add a formula
fc_special_events              has NO fc_share column and must not gain one
DB MIGRATION                   NONE. No column was added, altered or removed.
```
