# FC Summary — Spec & DB Mapping

> **Owner Boundary (reviewed 2026-07-28).**
> - **Document Role:** the FC Summary page + domain contract (Regular Forecast / Special Event / Target % Rules) DB mapping + write-path wiring.
> - **Canonical Owner For:** the FC Summary page contract only.
> - **Not Owner For:** Engine A/B forecast formulas (`SUPPLY_PLANNING_CALCULATION_RULES.md`), schema authority (`DATABASE_RELATIONSHIP_MAP.md`).
> - **Status:** Reviewed — Batch B Blockers Remain (FC Summary itself has no Batch B blocker, but some fields are runtime-pending).
> - **Current Version:** v1.1 (Batch A repair: **Source Code Verified / Deployment Status Unverified** split; grain-vs-key gap recorded).
> - **Last Reviewed:** 2026-07-28.
> - **Depends On:** Calculation Rules (formulas), Database Relationship Map (schema).
> - **Blocked By:** none in Batch B; internal PENDING items are Campaign/CampaignLine writers + single-row Regular FC writer (Phase 2); **deployment status = UNVERIFIED**.
> **Verification split (Batch A 2026-07-28).** *Source Code Verified* means the active `.gs` mirror + adapter carry the contract; it is **NOT** proof of the Google Apps Script deployment. **Deployment status = UNVERIFIED** in this environment (see §3.1 / §6). No deployment claim is made anywhere in this document.
>
> | Item | Current Source Behavior (verified in `.gs`/adapter) | Deployment |
> |---|---|---|
> | Regular row grain | one row per SKU × year × company × country × marketplace × category × series (12 month cols) | Adapter read path present (Demo OFF → Operation DB); Deployment UNVERIFIED; single-row write = Phase 2 (not wired) |
> | Regular upsert **key** | `year + country + marketplace + sku` (§8.4) — **does NOT include company / category / series** | **Known Contract Gap** vs the row grain (below) |
> | Company scope | per-row `company`; multi-company; Company filter dropdown | Filter + display; not part of the Regular upsert key |
> | Event PK | `event_fc_id` in `14_fc_write_handlers.gs` header + upsert key; adapter reads `event_fc_id` → legacy `event_id`/`special_event_id` fallback | Source Code Verified; **Deployment UNVERIFIED** (§3.1/§6) |
> | Builder | `saveRegularUpdate` / `saveEventUpdate` (modals); CSV `importFcRegularForecastBatch` | Adapter read path present; event write via `upsertFcSpecialEvent` (Deployment UNVERIFIED) |
> | Writer | `handleUpsertFcSpecialEvent_` / `handleImportFcRegularForecastBatch_`; inline table-edit "Save" is a **mock** | `upsertCampaign`/`upsertCampaignSkuLine` = **PENDING** (§12.1) |
> | Read source | `getFcRegularForecast` / `getFcSpecialEvents` / `getFcTargetRules` (adapter cache) | Adapter read path present; Deployment UNVERIFIED |
> | Forecast months | selected year's Jan–Dec (12 fixed columns) | Adapter read path present; Deployment UNVERIFIED |
> | Write permission | display read-only; writes via builder + import only | — |
> | Empty-selection filter | **empty = NONE** (positive inclusion) | Adapter read path present; Deployment UNVERIFIED |
>
> **Known Contract Gap (recorded, not silently reconciled):** the Regular **row grain** includes `company / category / series`, but the Regular **upsert key** is only `year + country + marketplace + sku`. These are **not** made to look identical here — the gap and any future key decision are Required Future Fixes, not a current fact.

> Scope: the **FC Summary page** (`assets/html/pages/fc-summary.html` + `assets/js/pages/fc-summary.js`). Three datasets: **Regular Forecast**, **Special Event**, **Target % Rules**. This spec records the DB mapping and the phased write-path wiring. **No FC calculation formula / Target-rule resolver formula is changed here** — only data source + read/write wiring.

---

## 1. Tables

"Read/Write status" below records the **source-code** wiring only. **Source Code Present ≠ Deployment Verified**: the live Apps Script deployment is **UNVERIFIED** in this environment (see the Verification split in the header + §3.1 redeploy gap). "Demo OFF → Operation DB" means the adapter reads the Operation DB when Demo is off; it is not a claim that the Google Apps Script project is deployed.

| UI dataset | DB table | Read (source code) | Write (source code) |
|---|---|---|---|
| Regular Forecast | `fc_regular_forecast` | Adapter reader present (Demo OFF → Operation DB); deployment UNVERIFIED | Batch **Import Forecast** only (`importFcRegularForecastBatch`). Edit Base FC / + Add SKU single-row upsert = **Not Started (Phase 2)** |
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
- **Phase 2 (NOT in this task):** Edit Base FC (single-row `fc_regular_forecast` update) · single-row Regular FC upsert writer/action · eliminating the `fcRegularMock`/render dual-track for Regular edits.

---

## 3. `fc_special_events` schema (Phase 1 write header)

Auto-created with this header row on first write (`14_fc_write_handlers.gs`; missing tab reads as `[]`):

| Column | Note |
|---|---|
| `event_id` | PK (auto `fc_special_events-<uuid>` when absent) |
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

> Task-defined core columns: `event_id, company, country, marketplace, scope_type, scope_id, sku, series, category, event_name, event_month, fc_qty, note, created_by, created_at, updated_by, updated_at`. `event_period` + `year` are additional columns retained so the existing Event table (which displays Event Period and filters by Year) keeps working.

### 3.1 Target schema (authoritative — for reconciliation)

The **target** `fc_special_events` schema is:

| Column | Note |
|---|---|
| `event_fc_id` | **PK** — canonical name, now the writer's PK (see reconciliation note). **Backend-generated** `EFC-<12-hex>`; the frontend never supplies it. |
| `campaign_id` | FK → `campaigns` — set when the row was created/synced from a Campaign; **blank** for FC Summary direct creation (**pending** column) |
| `campaign_sku_line_id` | FK → `campaign_sku_lines` — the specific promotion line; **blank** for direct creation (**pending** column) |
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
- No Edit Base FC / + Add SKU single-row `fc_regular_forecast` write (Phase 2).
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
When **Manual Monthly Forecast** is selected — or when **Country / Marketplace / SKU** change while in Manual mode — the Jan–Dec inputs are **prefilled from the existing `fc_regular_forecast` row** for SKU + Country + Marketplace + Target Year (read-only lookup). Matching resolves the Marketplace dropdown value to the **canonical marketplace key** first (a display name is mapped back to its key — see §11), then matches `sku + year + country + marketplace`.

**Prefill states + protections (no silent zero overwrite):**
- **No SKU selected** → the month inputs are **not touched** (prevents wiping a partially-typed grid to 0). Helper: *"Enter a SKU to load its existing monthly forecast."*
- **Live mode + DB cache not loaded yet** → prefill is **skipped**, **Save is disabled**, helper shows *"Loading existing forecast… please wait."* (never reads an empty set and overwrites).
- **Match found** → each month is filled; a **blank/empty** stored month **stays blank** (never coerced to 0). Helper: *"Existing forecast loaded for <sku> …"*.
- **No match** → months remain 0 and helper shows *"No existing FC found. Saving will create a new forecast row."*

Save is therefore an **upsert** (edit existing month values, or create a new row) — **target = `fc_regular_forecast`, key = year + country + marketplace + sku**. Full Jan–Dec is written only on the user's Save action (see §8.4 — single-row writer PENDING; no fake success).

### 8.3 Update Method definitions + conditional fields

| Method (value) | Meaning / source | Fields shown | Validation |
|---|---|---|---|
| **Apply Growth Rate (Based on Actual Sales)** (`actual`) | Base Year **actual sales from BQ** for the selected Country / Marketplace / SKU × (1 + Growth Rate). **BQ source = PENDING.** | Country, Marketplace, Target Year, Base Year, Growth Rate | Growth Rate **required, > 0** |
| **Adjust From Previous Month Forecast** (`prevMonth`) | Use an **explicitly selected** source `fc_regular_forecast` month × (1 + Rate) → Target month. The source month is **never silently inferred** — the user picks Based Year + Based Month (defaulted to the month before Target, editable). | Country, Marketplace, SKU, Target Year, **Target Month**, **Based Year**, **Based Month**, Growth/Adjustment Rate | Country, Marketplace, SKU, Target Year, Target Month, Based Year, Based Month all required |
| **Manual Monthly Forecast** (`manual`) | Direct monthly input. | Country, Marketplace, Target Year, Jan–Dec inputs | — |

### 8.4 DB mapping + Pending backend
- **Update target:** `fc_regular_forecast`. **Key = `year` + `country` + `marketplace` + `sku`.** `company` derived from `marketplaces` / `marketplace_skus` (not input).
- **PENDING (not implemented — do not fake success):**
  - No **single-row `fc_regular_forecast` upsert** writer / action exists yet (only batch `importFcRegularForecastBatch`). On **Demo OFF (live)** the modal reports "not yet written to DB — pending" and writes nothing.
  - **BQ actual-sales source** for `actual` mode is not implemented.
  - Previous-month sourcing (`prevMonth`) and manual write are **spec + UI only** for live DB.
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
- **Group key = category + series + regular_price** → one card per distinct triple. **Same series, different regular_price ⇒ separate cards.**
- Each card shows Category, Series, Regular Price, SKU list (chips, removable), **Deal Price**, **Forecast Qty**, and Remove-group / Remove-SKU controls. User-typed Deal/FC values are preserved across a rebuild for matching keys.
- **Discount %** (Part 4): shown **only when All Category or All Series** is checked. **Apply Discount to Cards** pre-fills each card `deal_price = regular_price × (1 − discount%)` (rounded to cents); user may still override per card.
- **Forecast Assist** (Part 5, Category/Series only): optional **Base Year**, **Base Campaign**, **Forecast Growth Rate %**. **Apply Forecast Assist** computes a suggested Forecast Qty per group = base × (1 + growth%) and **only pre-fills** the card's Forecast Qty — the user must review and click **Save** (never silently written). Base = the Base Campaign's linked `fc_special_events` qty for that group key (read-only lookup); if no Base Campaign, base = the card's current qty. **Base Campaign source** = `getCampaigns()`; if there are **no campaign records**, the select is **disabled / pending** and the assist reports it.

### 9.4 Event Flag enum + rules (Part 6)
Event Flag enum: **Normal / Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day**.

| Event Flag | Behaviour |
|---|---|
| **Normal** | **Creates nothing** (no campaigns / campaign_sku_lines / fc_special_events). Event Period hidden; Save shows an explanatory message (baseline covered by `fc_regular_forecast`). |
| **!= Normal** | **Target Year + Event Period required**; **Forecast Qty required (> 0)** per SKU row (Single) / group card (Category-Series). |

---

## 10. Campaign ↔ fc_special_events sync rule (Part 2)

`fc_special_events` can be populated from **two independent sources**, linked (not blind two-way synced) by `campaign_id` / `campaign_sku_line_id`:

**Source-of-truth model**
- **Campaign** (`campaigns` + `campaign_sku_lines`) is the **promotion source of truth**.
- **`fc_special_events`** is the **supply-chain forecast source of truth**.
- They are joined by `campaign_id` / `campaign_sku_line_id`. **No unconditional two-way loop** — each side owns its own fields; the link lets a Campaign locate the FC row it created and lets FC report which Campaign a forecast came from.

**A. Campaign → fc_special_events (Add Promotion save)** — *spec only; writer PENDING (Campaign write out of scope this task)*
- Event Flag = **Normal** → no `fc_special_events` required.
- Event Flag **!= Normal** → **Forecast field required**.
- On Save, the Campaign flow should create/update, in order:
  1. `campaigns`
  2. `campaign_sku_lines`
  3. `fc_special_events` linked by `campaign_id` / `campaign_sku_line_id`, `source='campaign_sync'`.

**B. FC Summary → fc_special_events (this modal)** — *implemented (subject to §3.1 header reconciliation)*
- Can create `fc_special_events` **directly**.
- `campaign_id` / `campaign_sku_line_id` are **blank**.
- `source='manual_fc_summary'`.
- **Future enhancement:** allow linking a direct FC row to an existing Campaign (populate `campaign_id` after the fact). Not built.

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

### 12.1 Backend writer status — **PENDING (Part 8)**
- **`upsertCampaign` and `upsertCampaignSkuLine` writers do NOT exist.** Only `upsertFcSpecialEvent` exists.
- On **live (Demo OFF)** the builder writes **NOTHING** and shows a clear PENDING message enumerating what *would* be created (1 campaign, N sku lines, N fc_special_events) and which writers are missing. **`fc_special_events` is intentionally NOT written on its own** — doing so would create rows with a blank `campaign_id` (orphans) and fake completeness. **No fake success.**
- On **Demo ON** the builder pushes illustrative `fc_special_events` rows into the in-memory mock only (clearly labelled DEMO) and notes the campaign / line counts that would be created live.
- To complete: add Apps Script `upsertCampaign` / `upsertCampaignSkuLine` handlers + adapter writers, then wire the 3-table transaction (campaign → lines → events, back-filling `campaign_id` / `campaign_sku_line_id`). The live `fc_special_events` header must also gain `campaign_id` / `campaign_sku_line_id` / `source` / `status` (see §3.1 reconciliation).

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
