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
| `company` / `country` / `marketplace` | scope context (`marketplace` = `All` or specific) |
| `scope_type` | `Category` / `Series` / `SKU` |
| `scope_id` | the scoped value (category / series / sku by scope) |
| `year` | rule year — **UI-continuity column** (resolver matches year) |
| `category` / `series` / `sku` | round-trip fidelity — **UI-continuity columns** |
| `target_percentage` | single-value fallback (= Jan %) |
| `jan_pct … dec_pct` | per-month target % |
| `note` | free text |
| `created_by` / `created_at` / `updated_by` / `updated_at` | audit meta |

> Task-defined core columns: `target_rule_id, company, country, marketplace, scope_type, scope_id, target_percentage, jan_pct..dec_pct, created_by, created_at, updated_by, updated_at, note`. `year` + `category`/`series`/`sku` are additional columns so the Target table (shows year/category/series/sku) and the effective-rule resolver (matches on year + scope value) keep working. The resolver **logic is unchanged** — it now reads the live rows instead of the local array.

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
