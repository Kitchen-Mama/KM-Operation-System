# SKU Regional Details — UI / UX Visual Specification

**Status:** 🟡 Draft v1.0 — **UI / UX visual spec only.** NO Runtime, NO frontend, NO backend, NO API, NO Apps Script, NO DB migration, NO schema change. Nothing here is implemented. This document is the authority for **page layout, visual hierarchy, interaction states and navigation only.**
**Last Updated:** 2026-07-20
**Maintained By:** Development Team
**Related (authority chain):**
- [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) — **canonical authority** for Master SKU + Regional Detail business data. **This UI spec is subordinate to it.**
- [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §4/§4A/§4B — **authority** for existing DB fields and relationships.
- [`TEMPLATE_UI_STANDARD_SPEC.md`](./TEMPLATE_UI_STANDARD_SPEC.md), [`UI_COMPONENT_GUIDELINES.md`](./UI_COMPONENT_GUIDELINES.md) — shared visual / sticky-header conventions.
- [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) — Tax/Referral SSOT (referenced by link only; never duplicated here).

---

## 1. Purpose

Define the complete visual and interaction specification that replaces the current wide, all-field **SKU Regional Details table** with a **Filterable Master–Detail Workspace**.

**Page positioning (canonical):**
- **SKU Details** answers: *"What is this product?"* (Product Master — `sku_details`).
- **SKU Regional Details** answers: *"How is this product represented, packaged, labeled and operated for a specific Company / Country / Marketplace context?"* (`sku_regional_details`, SKU Domain v2 Layer 2).

The workspace must let users:
1. Quickly find Regional SKU records.
2. Understand which **Company / Country / Marketplace** version they are viewing.
3. See completeness and missing-information status **without reading many empty columns**.
4. View full Regional Detail **without horizontal scrolling**.
5. Open the related **Master SKU** information.
6. Clearly distinguish **Edit Master SKU** from **Edit Regional Detail**.
7. Support ~500 current records and future growth.

---

## 2. Authority and Scope

### 2.1 Canonical Authority Boundary

| Document | Authority |
|---|---|
| `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` | Master SKU + Regional Detail **business data** (fields, meaning, sync rules, SSOT ownership). |
| `DATABASE_RELATIONSHIP_MAP.md` | Existing **DB fields and relationships**. |
| **This document** | **Only** page layout, visual hierarchy, interaction states, navigation. |

### 2.2 This UI spec MUST NOT
- Create new canonical DB columns.
- Create new business meanings.
- Duplicate Tax, Pricing or SKU Master rules.
- Treat calculated visual completeness as stored DB truth.
- Claim any Runtime is implemented.
- Become a second SKU data SSOT.

### 2.3 Subordination declaration
Where this document and `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` disagree on **what a field means or which table owns it**, the SKU Master spec wins. This document may only decide **how** canonical data is arranged on screen.

### 2.4 Canonical field basis (from the SSOT, do not extend)
`sku_regional_details` (v2) canonical columns — the only Regional fields this UI may display/edit:
`regional_detail_id` (PK), `sku`, `company`, `country`, `marketplace`, `site_sku`, `marketplace_product_id`, `product_url`, `packaging_regulation`, `regulation_url`, `language`, `manual_version`, `label_version`, `battery_regulation`, `created_at`, `updated_at`.

**Not present on the Regional row (must be treated honestly):**
- **No `status` column** on `sku_regional_details` (removed in v2). Any "Status" shown is a **cross-reference** to the paired `marketplace_skus.marketplace_sku_status` (operational copy) and/or `sku_details.lifecycle` (master), and there is an **unresolved naming divergence** (`marketplace_sku_status` vs `status`, DB map §closing note). → **Proposed UI mapping — requires field/source verification.**
- **No `created_by` / `updated_by`** on `sku_regional_details` (only `created_at` / `updated_at`). Actor identity is a placeholder in MVP anyway. → audit "by whom" is **not available yet**.
- **No regional product name / regional content / image / certification columns.** Product name is Master (`sku_details.product_name`). Any regional-specific content field is **Proposed — requires field/source verification** before it may appear as anything other than an empty/omitted section.

---

## 3. Current UX Problems

The present page ([`assets/html/pages/sku-regional-details.html`](../../assets/html/pages/sku-regional-details.html), [`assets/js/pages/sku-regional-details.js`](../../assets/js/pages/sku-regional-details.js)) is a single wide table:

1. **13 columns, `white-space: nowrap`** → horizontal scrolling is the primary navigation method.
2. **An `Edit` button in every row** → editing is the loudest action even while browsing.
3. **Empty cells dominate** — compliance-document fields are blank until filled, so most of the grid reads as empty spreadsheet cells.
4. **No way to see Company / Country / Marketplace context at a glance** without scanning columns.
5. **No completeness signal** — a user cannot tell a finished record from an unfinished one.
6. **No Master SKU access** — no path from a regional row to "what is this product".
7. **Single free-text search only**, no structured filters, no dependency between Company → Country → Marketplace.
8. **Does not scale** — at ~500 rows the flat nowrap table is slow to scan and slow to render.
9. **Off-standard color** — the current primary/edit buttons use blue/indigo, not the Kitchen Mama green system.

---

## 4. Design Principles

1. **Master–Detail over mega-table.** Identify in a compact list; read/act in a structured panel.
2. **Identity always visible.** Master SKU + Company + Country/Site + Marketplace + Site SKU (+ Marketplace Product ID when present) are shown on every list item and pinned in the detail header.
3. **Show signal, hide emptiness.** Never present a wall of empty cells; summarize completeness instead.
4. **No horizontal scroll as navigation.** The detail panel wraps and groups; it never forces sideways scrolling to read a record.
5. **One clear primary action per surface.** Browsing ≠ editing. Editing lives in the detail header, not in every row.
6. **Two edit paths, never ambiguous.** *Edit Master SKU* and *Edit Regional Detail* have different labels, different workflows, and a preserved return path.
7. **SSOT respect.** Tax → `tax_referral_rates`; Pricing → `pricing_list`. This page shows **summary/link only**, never editable duplicates.
8. **Honest metadata.** Completeness is UI-derived and labeled as such; audit "by whom"/history that the DB does not store gets an honest empty state, never a fabricated value.
9. **Scale-ready, implementation-deferred.** Pagination / virtual scroll / debounce are named as future Runtime choices, not claimed as done.

---

## 5. Page Information Architecture

```
SKU Regional Details (workspace)
├── Page Header ............. title · description · record summary · [Add Regional Detail]
├── Search + Filter Toolbar . 1 search input · primary filters · [More Filters]
├── Active Filter Chips ..... removable chips · Clear all
└── Two-Panel Workspace
    ├── Result List (38–42%) ............ compact identification items; single selection
    └── Detail Panel (58–62%)
        ├── Fixed Detail Header ......... identity + status + updated + [Edit Regional Detail] · [View Master SKU]
        ├── Regional Detail Tabs ........ Overview · Packaging & Label · Content & Localization · Compliance · Commercial · Audit
        └── (overlay) Master SKU Information drawer  ← read-only, with its own [Edit Master SKU]
```

Navigation model: **select-in-list → read-in-panel**. Selecting a list item never navigates away; it swaps the detail panel content. Opening Master SKU info **overlays** without losing the Regional selection.

---

## 6. Desktop Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ SKU Regional Details          Manage marketplace identity, packaging…       │
│ 492 records · 436 complete · 42 incomplete · 14 inactive     [+ Add Regional]│
├───────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search SKU / Site SKU / ASIN / product name        ]  Company▾ Country▾ │
│                                                    Marketplace▾ Status▾ Compl▾ [More ▾]│
├───────────────────────────────────────────────────────────────────────────┤
│ [ResUS ×] [US ×] [Amazon ×] [Missing Packaging ×]                 Clear all │
├───────────────────────────────┬───────────────────────────────────────────┤
│ RESULT LIST  (38–42%)          │ DETAIL PANEL  (58–62%)                     │
│                                │ ┌─ fixed header ──────────────────────────┐│
│ ▸ CO1100-R          Active     │ │ CO1100-R   Active                        ││
│   ResUS · US · Amazon          │ │ ResUS · US · Amazon                      ││
│   Site CO1100-R · B07FVQLBL3   │ │ Site SKU CO1100-R · ASIN B07FVQLBL3      ││
│   Complete                     │ │ Updated 2026-07-14                       ││
│ ────────────────────────────── │ │ [Edit Regional Detail]  [View Master SKU]││
│ ▸ CO1150-AG      Needs Review  │ └──────────────────────────────────────────┘│
│   ResUS · US · Amazon          │  Overview | Packaging | Content | Compliance│
│   Site CO1150-AG · B0HQ…       │          | Commercial | Audit               │
│   Missing Packaging · Label    │ ┌──────────────────────────────────────────┐│
│   …                            │ │ (scrolls independently under the tabs)   ││
│ (list scrolls independently)   │ │                                          ││
└───────────────────────────────┴───────────────────────────────────────────┘
```

- Recommended proportions: **Result list 38–42%**, **Detail panel 58–62%**.
- Result list and detail panel **scroll independently**.
- The **selected-record detail header and the tab bar remain visible** (pinned) while detail content scrolls. Reuse the KM Sticky Header Framework (`UI_COMPONENT_GUIDELINES.md` §1) for the pinned header/tabs and the toolbar offset — no hard-coded magic numbers.
- The page header + toolbar + chip bar sit above the two panels; the workspace fills remaining height.

---

## 7. Header and Summary

Displays:
- **Page title:** `SKU Regional Details`.
- **Short description:** `Manage marketplace identity, regional packaging, content and compliance.`
- **Record summary** (visual concept, counts computed at render): e.g. `492 records · 436 complete · 42 incomplete · 14 inactive`.
- **Primary action:** `+ Add Regional Detail` (single primary button, KM green).

> The summary counts are a **visual concept only**. Completeness ("complete/incomplete") is **UI-derived** (§14), not a stored DB field, and "inactive" reflects the referenced operational/master status (§2.4), not a Regional-row column. The calculation is **not implemented**.

---

## 8. Search and Filter System

### 8.1 Search
- **One prominent search input** spanning the toolbar content width.
- **Placeholder:** `Search SKU, Site SKU, ASIN or product name…`
- **Search targets (canonical sources only):**
  - Master SKU — `sku_regional_details.sku`
  - Site SKU — `sku_regional_details.site_sku`
  - Marketplace Product ID / ASIN — `sku_regional_details.marketplace_product_id`
  - Product name — `sku_details.product_name` (join to Master)
  - **Series** — `sku_details.series` (join to Master; canonical, so allowed)
- **Clear-search:** an inline `×` clears the term and restores the full (filtered) list; focus returns to the input.
- **Enter / debounce:** the choice between search-on-Enter vs debounced search-as-you-type is a **future Runtime decision** (§20), not decided here.
- **No-result state:** §15.
- **Term highlighting (recommended):** matched substrings in the result list's identity lines (SKU / Site SKU / ASIN / name) may be highlighted with a subtle neutral emphasis (not color-only; e.g. bold/underline) to show why a row matched.

### 8.2 Primary filters (always visible)
| Filter | Canonical source | Status |
|---|---|---|
| **Company** | `sku_regional_details.company` | Canonical |
| **Country / Site** | `sku_regional_details.country` | Canonical |
| **Marketplace** | `sku_regional_details.marketplace` | Canonical |
| **Status** | paired `marketplace_skus.marketplace_sku_status` (and/or `sku_details.lifecycle`) | **Proposed UI filter — requires field/source verification** (no status column on the Regional row; naming divergence unresolved). |
| **Completeness** | UI-derived (§14) | **Proposed UI-derived metadata — not a stored field.** |

### 8.3 More Filters panel (progressive disclosure)
| Filter | Canonical source | Status |
|---|---|---|
| **Series** | `sku_details.series` (join) | Canonical |
| **Language** | `sku_regional_details.language` | Canonical |
| **Packaging requirement/status** | `sku_regional_details.packaging_regulation` (present/blank) | Canonical field; "status" is UI-derived presence. |
| **Manual version/status** | `sku_regional_details.manual_version` | Canonical field; "status" is UI-derived presence. |
| **Label version/status** | `sku_regional_details.label_version` | Canonical field; "status" is UI-derived presence. |
| **Battery requirement** | `sku_regional_details.battery_regulation` (regional) | Canonical. (`sku_details.battery_type` is the master attribute — different field.) |
| **Missing fields** | UI-derived (§14) | **Proposed UI-derived metadata.** |
| **Updated date** | `sku_regional_details.updated_at` | Canonical. |
| **Updated by** | *(no `updated_by` on the Regional row)* | **Proposed UI filter — requires field/source verification** (field does not exist yet). |

> **Rule:** a filter appears only if its source exists in the canonical model. Every filter whose source is not verifiable is explicitly labeled **"Proposed UI filter — requires field/source verification"** and must render disabled or clearly marked until its source is confirmed by a business-rule decision.

### 8.4 Filter dependency
```
Company → Country / Site → Marketplace → Additional filters
```
- Selecting a **Company** narrows the **Country/Site** options to that company's sites; Country narrows **Marketplace**; then additional filters apply within scope.
- **Country alone must not infer Company** (the same country exists under multiple companies). Country is a filter, never a Company derivation.

### 8.5 Active filter chips
- Each active filter renders as a **removable chip** with an `×`: e.g. `[ResUS ×] [US ×] [Amazon ×] [Missing Packaging ×]`.
- **Clear individual filter** (chip `×`) and **Clear all** (trailing action) are both provided.
- The **result count updates** on every filter change (ties to the header summary and list count).
- **Persisted filter preference** (local storage / saved views) is a **future Runtime decision** (§20) — not implemented.

---

## 9. Result List

Each item shows **only** what is needed to identify and decide — no full field dump, no per-row Edit.

**Item structure:**
```
Line 1:  <Master SKU>                         <Status chip>
Line 2:  <Company> · <Country> · <Marketplace>
Line 3:  Site SKU <site_sku> · ASIN <marketplace_product_id>
Line 4:  <Completeness or missing-data summary>
```

**Complete example**
```
CO1100-R                                      Active
ResUS · US · Amazon
Site SKU CO1100-R · ASIN B07FVQLBL3
Complete
```

**Incomplete example**
```
CO1150-AG                                     Needs Review
ResUS · US · Amazon
Site SKU CO1150-AG · ASIN B0HQ…
Missing Packaging · Label Version
```

**Rules:**
- **No Edit button on any result row.**
- **Clicking the item selects it** (whole item is the hit target).
- **Keyboard focus** and **selected** states are **visually distinct from each other and from hover** (e.g. focus = ring, selected = KM-green left border + tint; not color-only — see §17).
- The **selected item stays visible/highlighted** while the detail panel changes.
- Show **at most one primary status indicator (Line 1) and one secondary indicator (Line 4)** — never a cluster of chips.
- **Avoid large numbers of empty values** — when a field is blank, omit it or fold it into the completeness summary rather than printing an empty slot.
- The label is **"ASIN"** when `marketplace = Amazon`, else **"Product ID"** (the DB column is always `marketplace_product_id`). When Marketplace Product ID is missing, Line 3 shows `Site SKU <site_sku>` only (see §15 missing-ID state).
- **Pagination vs virtual scrolling** for ~500+ rows is a **future Runtime option** (§20) — neither is implemented; the spec only requires that the chosen mechanism preserve independent scrolling and the visible selected item.

### 9.1 Sorting (UI choices; implementation deferred)
- **Default canonical grouping:** SKU → Company → Country → Marketplace.
- Recently Updated (`updated_at` desc)
- Incomplete First (UI-derived completeness)
- SKU A–Z
- Country
- Marketplace

Sorting **implementation is future Runtime work** (§20).

---

## 10. Detail Panel

### 10.1 No record selected
Calm empty state, centered:
> **Select a regional SKU to view its details.**

### 10.2 Selected — fixed detail header (pinned)
Contains:
- **Master SKU** (clickable → Master SKU Information, §12)
- **Status** (referenced status chip, per §2.4 / §8.2 — proposed source)
- **Company / Country / Marketplace**
- **Site SKU**
- **Marketplace Product ID** (labeled ASIN when Amazon)
- **Last updated summary** (`updated_at`)
- **`Edit Regional Detail`** — **primary** button (KM green)
- **`View Master SKU`** — **secondary** button

**Button hierarchy:** primary = *Edit Regional Detail*; secondary = *View Master SKU*. Never a permanent Edit button in list rows.

The header + tab bar stay pinned; only the tab content scrolls (§6).

---

## 11. Regional Detail Tabs

Six visual sections. Each groups **existing canonical fields only**; no DB field is invented to fill a section. A section with no canonical content shows an honest empty/"not applicable" state (§14/§15), not fabricated data.

1. **Overview** — Master SKU, Company, Country, Marketplace, Site SKU, Marketplace Product ID (ASIN label when Amazon), Product name *(Master, read-only join)*, Product URL (`product_url`), Status *(referenced — §2.4)*, Last updated (`updated_at`).
2. **Packaging & Label** — Packaging requirement (`packaging_regulation`), Regulation URL (`regulation_url`), Manual version (`manual_version`), Label version (`label_version`), Language requirement (`language`). *(Regional insert/sticker/carton-marking and regional packaging-material fields are NOT canonical → shown only if a source is later verified; otherwise omitted, not empty-slotted.)*
3. **Content & Localization** — Language (`language`), Product URL (`product_url`), Manual/Label references (`manual_version` / `label_version`). *(Regional product name, regional content bodies, image/content requirements, localized manual/label bodies are NOT canonical → "Proposed — requires field/source verification"; not displayed as empty fields.)*
4. **Compliance** — Battery requirement (`battery_regulation`), Regulatory reference (`regulation_url`). **Tax summary/link only** → link to the Tax/Referral Reference Master (`tax_referral_rates`, keyed by `sku_details.series`) **if an existing mapping exists**; Tax values remain owned by the Tax SSOT and are **never duplicated or edited here**. *(Regional warnings / certifications are NOT canonical → proposed.)*
5. **Commercial** — **Pricing summary/link only** → link to `pricing_list` (live marketplace pricing SSOT); Launch date (`marketplace_skus.launch_date`, operational paired) shown read-only **if mapping exists**. *(Regional selling status = referenced `marketplace_sku_status` — proposed; "launch/delist" beyond `launch_date` and "regional commercial notes" are NOT canonical → proposed.)* **No pricing field is editable here; no second pricing source is created.**
6. **Audit** — Created at (`created_at`), Updated at (`updated_at`). **Created by / Updated by are NOT stored on the Regional row** → show honest empty state: *"Change author is not tracked yet."* Detailed change/status history is not implemented → *"Detailed change history is not available yet."* **No audit records are fabricated.**

Full field→section mapping table in §18.

---

## 12. Master SKU Information Interaction

- Clicking the **Master SKU value** (detail header or Overview) or **`View Master SKU`** opens a **Master SKU Information surface** (right-side drawer / detail overlay) **without losing the current Regional selection** — closing it returns to the same selected Regional record and scroll position.
- This surface is **read-only** and may group Master data (from `sku_details`, per that spec):
  - **Basic** (identity, category, series, lifecycle, image)
  - **Dimensions** (item/package/carton dims + units + weights + `units_per_carton`)
  - **Packaging Master**
  - **Product Attributes** (`material`, `battery_type`, `magnet_type`)
  - **Commercial Summary** (brand baseline prices — read-only reference; live pricing stays in `pricing_list`)
  - **Tax Summary / Link** (to `tax_referral_rates` — link only, per Tax SSOT)
- It provides a **clearly separate** button: **`Edit Master SKU`**.

**Edit Master SKU vs Edit Regional Detail must:**
- Use **different labels** (`Edit Master SKU` vs `Edit Regional Detail`).
- Open **different workflows/pages** (Master → the SKU Details editor; Regional → the Regional Detail editor).
- **Never be visually ambiguous** (different surfaces, never two identical buttons side by side).
- **Preserve a return path** to the selected Regional record after either edit flow.

---

## 13. Edit Entry Points

This task defines only the **visual entry point and proposed edit layout** — editing is **not implemented**.

- **`Edit Regional Detail`** — primary button in the Regional detail header (§10.2).
- **`Edit Master SKU`** — button inside the Master SKU Information surface (§12).

**Proposed Edit Regional Detail page sections:**
1. **Identity** — Master SKU, Company, Country, Marketplace (presented as **identity-level fields**). Whether these are immutable is a **Requirement / Business Rule decision** and is **NOT invented here**.
2. **Packaging & Label**
3. **Content & Localization**
4. **Compliance**
5. **Commercial**
6. **Review**

**Proposed bottom action bar:**
```
Cancel        Save Draft*        Review Changes & Save
```
> `Save Draft` is labeled **"Proposed UX action — requires lifecycle decision"** — a draft lifecycle does not exist in the current business model and must not be assumed. `Cancel` and `Review Changes & Save` are the baseline actions.

> Editing `site_sku` / `marketplace_product_id` propagates to `marketplace_skus` (Regional = higher-priority source, per SKU Master spec §6). This sync rule is owned by the Master spec; this UI spec only positions the fields and the save affordance — it does not redefine sync behavior.

---

## 14. Completeness Presentation

Visual-only categories (chips / summary labels):
- **Complete**
- **Incomplete**
- **Needs Review**
- **Not Applicable**
- **Inactive**

Detail-panel summary example (per section, not per raw column):
```
Packaging          Complete
Localization       Missing Language
Compliance         Needs Review
Commercial         Complete
```

**Hard rules:**
- **Do NOT add a stored completeness DB field.**
- **Do NOT invent required-field rules.**
- **Do NOT claim completeness calculation is implemented.**
- Required fields **must later be defined by Company / Country / Marketplace business rules**. Until formalized, completeness is **proposed UI-derived metadata** only.
- Completeness categories drive Line 1 (primary status) / Line 4 (secondary summary) in the result list and the summary block in the detail panel; they **never** override the referenced operational/master status.

---

## 15. Empty / Loading / Error States

| State | Visual behavior |
|---|---|
| **Initial loading** | Skeleton rows in the result list + a calm "Loading regional details…" placeholder in the detail panel. No layout jump when data arrives. |
| **Loaded with results** | List populated; detail panel shows the empty-selection prompt until a row is chosen. |
| **No result (filtered/search)** | List area: *"No regional SKUs match your search and filters."* + **Clear all** affordance. Detail panel stays in empty-selection state. |
| **No selected record** | Detail panel: *"Select a regional SKU to view its details."* |
| **Selected record** | Detail header + tabs render (§10–§11). |
| **Filtered result** | Chips reflect active filters; count updates; list shows the narrowed set. |
| **Missing / incomplete data** | Blank canonical fields are folded into completeness summaries, not shown as empty slots; a field with no value shows a subtle `—` **only inside a group the user opened**, never as a wall. |
| **Inactive record** | List item + detail header show the **Inactive** treatment (neutral/muted chip + label text, not color-only); record remains viewable/read paths intact. |
| **Load failure** | Non-destructive error banner in the workspace: *"Couldn't load regional details. Retry."* with a **Retry** action; existing selection preserved if possible. |
| **Unauthorized / read-only (future)** | Edit affordances render **disabled with an explanatory tooltip**; read paths remain. Permission behavior is a **future Runtime decision** (§20). |
| **Very long product names / URLs** | Truncate with ellipsis + **full-value tooltip / expandable display** (§17); never break the two-panel layout or force horizontal scroll. |
| **Missing Marketplace Product ID** | Line 3 shows `Site SKU <site_sku>` only; detail Overview shows the Product ID field as `—` with a "not set" affordance; not treated as an error. |
| **Record deleted / inactivated while selected (future)** | If the selected record disappears/goes inactive during a session, the detail panel surfaces a non-destructive notice (*"This record is no longer active — showing last loaded values"*) and offers return to results. Handling specifics are a **future Runtime case** (§20). |

---

## 16. Responsive Behavior

- **Desktop:** two-panel Master–Detail workspace (§6).
- **Tablet:** narrow result panel + detail panel, **or** a collapsible filter drawer to reclaim width; two panels may remain side by side only if both stay readable.
- **Mobile / narrow viewport:**
  - Filters open in a **drawer / sheet** (not inline).
  - **Show the record list first.**
  - **Selecting a record opens a full detail page/view** (not a squeezed side panel).
  - **Do NOT compress both panels side by side.**
  - Provide **Back to Results**, preserving the current filters and scroll position.

---

## 17. Accessibility

- **Keyboard navigation:** filters and result items are reachable and operable by keyboard; arrow-key movement through the list + Enter/Space to select is the target model. Tabs are keyboard-operable with a clear selected state.
- **Visible focus states:** every interactive element has a visible focus ring; focus and selected are distinguishable.
- **Status not by color alone:** every status/completeness signal carries **text or an icon + text**, never color as the sole cue (covers Active/Inactive/Needs Review, warning/incomplete, blocking error).
- **Accessible names:** all buttons have textual labels or `aria-label`s (`Edit Regional Detail`, `View Master SKU`, `Edit Master SKU`, chip remove = "Remove <filter> filter").
- **Contrast:** text and chips meet WCAG AA contrast against their surfaces in the KM palette.
- **Truncation:** any truncated value (long name/URL) offers a full-value tooltip or expandable display.
- **Tabs:** the selected tab has a clear, non-color-only selected indicator and correct `aria-selected` semantics.

---

## 18. Field-to-Visual-Section Mapping

Only canonical sources are mapped. "Proposed" rows must not render as populated fields until a source is verified by a business-rule decision.

| Visual section | Visual field | Canonical source | Notes |
|---|---|---|---|
| Overview | Master SKU | `sku_regional_details.sku` → `sku_details.sku` | clickable → Master info |
| Overview | Company | `sku_regional_details.company` | identity |
| Overview | Country | `sku_regional_details.country` | identity |
| Overview | Marketplace | `sku_regional_details.marketplace` | identity |
| Overview | Site SKU | `sku_regional_details.site_sku` | identity |
| Overview | Marketplace Product ID | `sku_regional_details.marketplace_product_id` | label "ASIN" when Amazon |
| Overview | Product name | `sku_details.product_name` | **Master join, read-only** |
| Overview | Product URL | `sku_regional_details.product_url` | regional-only |
| Overview | Status | `marketplace_skus.marketplace_sku_status` / `sku_details.lifecycle` | **Proposed — requires verification** (no status on Regional row) |
| Overview | Last updated | `sku_regional_details.updated_at` | |
| Packaging & Label | Packaging requirement | `sku_regional_details.packaging_regulation` | |
| Packaging & Label | Regulation URL | `sku_regional_details.regulation_url` | |
| Packaging & Label | Manual version | `sku_regional_details.manual_version` | |
| Packaging & Label | Label version | `sku_regional_details.label_version` | |
| Packaging & Label | Language requirement | `sku_regional_details.language` | |
| Packaging & Label | Insert/sticker/carton-marking, packaging material | *(none)* | **Proposed — requires field/source verification** |
| Content & Localization | Language | `sku_regional_details.language` | |
| Content & Localization | Product URL | `sku_regional_details.product_url` | |
| Content & Localization | Manual/Label references | `sku_regional_details.manual_version` / `label_version` | |
| Content & Localization | Regional product name, content, images, localized bodies | *(none)* | **Proposed — requires field/source verification** |
| Compliance | Battery requirement | `sku_regional_details.battery_regulation` | regional (≠ master `battery_type`) |
| Compliance | Regulatory reference | `sku_regional_details.regulation_url` | |
| Compliance | Tax summary / link | `tax_referral_rates` via `sku_details.series` | **link only; Tax SSOT owns values** |
| Compliance | Regional warnings / certifications | *(none)* | **Proposed — requires field/source verification** |
| Commercial | Pricing summary / link | `pricing_list` | **link only; Pricing SSOT owns values** |
| Commercial | Launch date | `marketplace_skus.launch_date` | operational paired; read-only if mapping exists |
| Commercial | Regional selling status | `marketplace_skus.marketplace_sku_status` | **Proposed — requires verification** |
| Commercial | Delist info / regional commercial notes | *(none)* | **Proposed — requires field/source verification** |
| Audit | Created at | `sku_regional_details.created_at` | |
| Audit | Updated at | `sku_regional_details.updated_at` | |
| Audit | Created by / Updated by | *(none on Regional row)* | **Honest empty state — not tracked yet** |
| Audit | Change / status history | *(not implemented)* | **Honest empty state** |

---

## 19. Visual Wireframe

Documentation only — not final pixel design.

```
┌─ PAGE HEADER ───────────────────────────────────────────────────────────────┐
│ SKU Regional Details                                                          │
│ Manage marketplace identity, regional packaging, content and compliance.      │
│ 492 records · 436 complete · 42 incomplete · 14 inactive       [+ Add Regional]│
├─ SEARCH / FILTER TOOLBAR ─────────────────────────────────────────────────────┤
│ [🔍 Search SKU, Site SKU, ASIN or product name…]                              │
│ Company ▾   Country ▾   Marketplace ▾   Status ▾   Completeness ▾   [More ▾]  │
├─ ACTIVE FILTER CHIPS ─────────────────────────────────────────────────────────┤
│ [ResUS ×] [US ×] [Amazon ×] [Missing Packaging ×]                  Clear all  │
├───────────────────────────────┬───────────────────────────────────────────────┤
│ RESULTS  (38–42%)             │ DETAIL  (58–62%)                              │
│                               │ ┌─ DETAIL HEADER (pinned) ───────────────────┐│
│ ▸ CO1100-R        [Active]    │ │ CO1100-R                          [Active]  ││
│   ResUS · US · Amazon         │ │ ResUS · US · Amazon                         ││
│   Site CO1100-R · B07FVQLBL3  │ │ Site SKU CO1100-R · ASIN B07FVQLBL3         ││
│   Complete                    │ │ Updated 2026-07-14                          ││
│ ───────────────────────────── │ │ [ Edit Regional Detail ]  [ View Master SKU ]││
│ ▸ CO1150-AG    [Needs Review] │ └─────────────────────────────────────────────┘│
│   ResUS · US · Amazon         │ [Overview][Packaging & Label][Content & Local.] │
│   Site CO1150-AG · B0HQ…      │ [Compliance][Commercial][Audit]                 │
│   Missing Packaging · Label   │ ┌─ TAB CONTENT (scrolls) ────────────────────┐ │
│ ─────────────────────────────  │ │ Label      Value                          │ │
│ ▸ …                           │ │ Company    ResUS                          │ │
│   (virtual/paged — future)    │ │ Product    Corkscrew Opener (master)      │ │
│                               │ │ Product URL amazon.com/…  ↗               │ │
│                               │ └───────────────────────────────────────────┘ │
└───────────────────────────────┴───────────────────────────────────────────────┘

  (View Master SKU → read-only drawer overlays the right, Regional selection kept)
  ┌─ MASTER SKU INFORMATION (read-only drawer) ─────────────┐
  │ CO1100 · Corkscrew Opener              [ Edit Master SKU ]│
  │ Basic | Dimensions | Packaging Master | Attributes |     │
  │ Commercial Summary | Tax Summary ↗                       │
  └──────────────────────────────────────────────────────────┘
```

---

## 20. Runtime Decisions Deferred

Explicitly **NOT decided / NOT implemented** in this document:
- Actual search implementation
- Debounce timing (search-on-Enter vs debounced)
- Pagination vs virtual scrolling
- Saved filters / local-storage persistence
- Completeness formula
- Required fields by market (Company / Country / Marketplace)
- Permission / read-only behavior
- Audit history (and change author)
- Add Regional Detail lifecycle (incl. any "Save Draft" state)
- Edit validation
- API contract
- Frontend component structure
- Data fetching
- Save behavior

---

## 21. Acceptance Criteria

1. ✅ Canonical page pattern is **Master–Detail**, not a wide all-field table (§4–§6).
2. ✅ **No per-row Edit button** (§9).
3. ✅ Search and **dependent filters** fully specified (§8).
4. ✅ Active filters are **visible and removable** (§8.5).
5. ✅ Regional identity **always visible** (§9, §10.2).
6. ✅ A selected record opens a **structured detail panel** (§10).
7. ✅ Regional fields **grouped into tabs** (§11, §18).
8. ✅ Master vs Regional edit paths **visually distinct** (§12–§13).
9. ✅ Clicking SKU provides a **Master SKU information surface** (§12).
10. ✅ Master SKU info includes an **Edit Master SKU** entry point (§12).
11. ✅ Regional detail header includes **Edit Regional Detail** (§10.2).
12. ✅ Completeness is **visual/proposed**, not falsely stored (§14).
13. ✅ **No new canonical DB fields** invented (§2, §18).
14. ✅ Tax and Pricing remain **subordinate to their SSOT** (§11, §18).
15. ✅ Desktop/tablet/mobile behavior defined (§16).
16. ✅ Loading, empty, error, incomplete states defined (§15).
17. ✅ Accessibility requirements included (§17).
18. ✅ Implementation status accurately reflects **IMPLEMENTED IN SOURCE, V1** (frontend live; no backend/schema change; live E2E pending) — §22.
19. ✅ No Database, Runtime, UI code or API changes occur (this is a spec file only).
20. ✅ The UI spec declares **subordination** to `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` (§2.3, header).

---

## 22. Implementation Status (updated 2026-07-21 — IMPLEMENTED IN SOURCE, V1)

**IMPLEMENTED IN SOURCE (frontend live on reload; no backend/schema change; live in-browser E2E pending).** The wide all-field table is replaced by the Filterable Master–Detail Workspace in [`assets/js/pages/sku-regional-details.js`](../../assets/js/pages/sku-regional-details.js) / `.html` / `.css`.

**Implemented (V1):**
- 40/60 Master–Detail workspace; tablet narrows; mobile = list → full detail + **Back to Results**.
- Prominent search (Master SKU / Site SKU / Marketplace Product ID / Master product name + Series via `sku_details` join), debounced.
- Dependent primary filters **Company → Country → Marketplace** (Country never infers Company; downstream cleared on upstream change) + Status + Data Coverage; More Filters (Series, Language, packaging/manual/label/battery present-missing, Updated date range); removable chips + Clear all.
- Compact selectable result list (no per-row Edit; distinct hover/focus/selected; keyboard Enter/Space/Arrows); **client-side pagination 25/50/100** (default 50).
- Detail panel with pinned header + six tabs (Overview, Packaging & Label, Content & Localization, Compliance, Commercial, Audit) showing **only canonical fields**; blanks render `—`, not a wall.
- **Data Coverage** = neutral UI-derived `N/8 fields populated` over the 8 verified Regional fields; tooltip clarifies it is not readiness/approval; never stored; never "Complete/Incomplete".
- **Operational status join** = exactly-one `marketplace_skus` match by `sku+company+country+marketplace`; zero → *Not linked*; multiple → *Ambiguous marketplace link*; **never first-row fallback**. Commercial tab shows `launch_date` only on a unique match.
- **Edit Regional Detail** (header only) + **Add Regional Detail** — both write via the existing `KM.DB.upsertSkuRegionalDetail` (composite key; preserves omitted fields; `sync_marketplace_sku:true` preserved). Duplicate-submit guard, Saving…, error retention, selection/filters/page preserved.
- **View Master SKU** read-only drawer; **Edit Master SKU** reuses the shared `window.openSkuMasterForm('edit')` (body-level modal — safe over this page). Tax/Pricing = navigation/summary only; no Regional Save writes Master/Tax/Pricing.
- Accessibility (tablist/tab/tabpanel, aria-selected list, visible focus, status not color-only, Escape closes topmost overlay), single state object, no duplicate listeners on re-entry, stale-async guard.

**STILL DEFERRED / NOT IMPLEMENTED:** business "completeness"/required-field matrix (Data Coverage is the neutral stand-in), server-side pagination (client-side V1), permissions, full audit history (metadata + honest empty states only), Regional content/certification/image fields (no canonical columns), Save Draft. **After Master edit, Regional Master-derived labels refresh on the next re-select/filter** (the shared form emits no Regional callback in V1).

**Build / Redeploy:** frontend static reload only — **no Apps Script/DB change** (existing Regional handler + marketplace sync reused unchanged). **Live in-browser + live-Sheet E2E verification pending.**

---

## 23. V2 Redesign — Master-SKU / Country-Tab (updated 2026-07-21 — IMPLEMENTED IN SOURCE; supersedes the V1 filterable record list where they conflict)

The Filterable Master–Detail record list (V1, §22) is replaced by a **Master-SKU-first** workspace. Same three frontend files; **still no backend/DB/schema/API change** (existing `handleUpsertSkuRegionalDetail_` + `marketplaceSkuSyncIdentity_` reused; tax read via existing `KM.DB.getTaxReferralRates`/`getTaxRateComponents`; tax editor reuses `window.handleSkuTaxRates`).

- **Toolbar (single row):** left = **Category → Series → Search SKU** (options from loaded `sku_details`, distinct, natural sort; AND); right = **Add Regional Details**. The V1 Company/Country/Marketplace/Status/Coverage/language/packaging·manual·label·battery/date-range/More-Filters set is **removed** (no longer needed under Master-SKU-first navigation).
- **Left panel = Master SKU list** (compact ~260–300px): **one row per Master SKU** that has ≥1 regional record — Master SKU, Product Name, Series·Category. No per-country/company/marketplace/site-SKU/ASIN/coverage repetition. Whole-row select, distinct selected + keyboard-focus, pagination 25/50/100 (default 50), selection preserved if the SKU still matches else cleared honestly.
- **Right panel = country tabs** (first level): standard order **US, CA, FR, DE, ES, UK, AU, JP** ∪ any other country present in data (appended). Tabs with data show a count; countries without data render muted **“Not configured”**; selecting an unconfigured country offers **Add {country} Regional Detail** (prefills SKU + country). Active country preserved when possible. The 8-country list is a display order, **not** a supported-country whitelist.
- **Multiple Company·Marketplace in one country →** a deterministic second-level **Company · Marketplace selector**; the record is **never silently first-picked** when identity is ambiguous (user chooses; a single record shows directly).
- **Six sections:** Overview · Marketplace · Packaging & Localization · Compliance · **Tax & Commercial** · Audit. Identity is not repeated in every section.
- **Tax & Commercial = READ-ONLY join** to `tax_referral_rates` (SSOT): resolved by **Series + country_of_origin → duty_country (the active country tab) + effective date** (latest applicable `effective_from`; deterministic tiebreak origin, `tax_rate_id`) — **never first-row, never country-only**. Shows origin → duty route, HS Code, duty/port/referral rates, declared value/currency, effective window, and `tax_rate_components` (name/type, rate, effective_to) **only when components exist** (subsection hidden otherwise — no placeholder rows). **Open HS Code & Tax Rates** navigates to the canonical Series editor. No tax value is copied into or written through Regional.
- **Write boundary unchanged:** Edit Regional Detail writes only `sku_regional_details` (+ the verified deterministic `marketplace_skus` identity sync). Master = View/Edit Master SKU; Tax = Open HS Code & Tax Rates; Pricing = read-only note.

**STILL DEFERRED:** business completeness matrix, server pagination, permissions, full audit history, Regional content/certification/image fields (no canonical columns). **Build/Redeploy:** frontend static reload only; live E2E pending.

**End of Document**
