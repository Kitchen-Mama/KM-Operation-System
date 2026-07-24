# Kitchen Mama Operation System — Master Blueprint

**Status:** 🟡 Draft v1 — Master Architecture Blueprint / Spec only (NO code, NO DB, NO implementation)
**Last Updated:** 2026-06-17
**Maintained By:** Development Team
**Audience:** Company leadership · internal users · future developers · Claude / Codex agents · factory & overseas-warehouse stakeholders
**Related (authoritative sources):** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md), [`FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md`](./FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md), `assets/specs/active/SYSTEM_ROADMAP.md`, `assets/specs/active/project-current-state.md`, `KM Website Road Map.xlsx`

> **Spec only.** This is a high-level + structural blueprint intended to (a) orient all stakeholders and (b) serve as source material for a future system-introduction page. It introduces **no** code, Apps Script, API, UI, DB migration, BigQuery, or runtime changes. Where this document and a domain spec disagree, the **domain spec is authoritative** (Shipment → `SHIPMENT_CENTER_SPEC.md`; Request/PO → `REQUEST_ORDER_AND_PO_SPEC.md`; calculations → `SUPPLY_PLANNING_CALCULATION_RULES.md`; frontend → the Phase 3 audit).

---

## 1. Vision

The **Kitchen Mama Operation System** is **not merely a project-management tool**. It is an **all-in-one company operation system** — the single place where Kitchen Mama plans, executes, tracks, and learns across its entire supply and sales operation.

It is built to deliver:

- **Supply chain stability** — keep the right stock in the right place at the right time.
- **Replenishment planning** — turn forecast + inventory reality into clear "what to ship / what to order" signals.
- **Ordering / procurement** — convert planning into formal purchase orders to factories.
- **Shipment execution** — turn approved plans into real, tracked logistics records.
- **Inventory monitoring** — marketplace, overseas warehouse, factory, and in-transit stock in one view.
- **Risk management** — promotion risk, shortage / overstock, and stuck-shipment alerts.
- **Future prediction** — forecast review today, AI-assisted demand prediction later.
- **Intelligent assistant analysis** — an operations assistant that reads the same data and surfaces insight.
- **Dangerous alert notification** — proactive warnings before a stockout, missed shipment, or risky promotion.
- **Cross-department synchronization** — operations, procurement, factory, and overseas warehouses working from one truth.
- **Knowledge base / training** — SKU handbook + KM University for onboarding and product knowledge.
- **Document automation** — generate POs, invoices, packing lists, shipment sheets, and booking docs from existing records.
- **Reducing manual data entry** — data flows forward through the system instead of being re-keyed at each step.

The end-state is a connected operating backbone where **planning, execution, tracking, and knowledge reinforce each other**, and where the main office, factories, and overseas warehouses all act on the **same data**.

---

## 2. System Principles

These principles govern every module and every future addition:

1. **One system, one source of truth.** A fact (a SKU, a shipment, a PO line) is stored once and referenced everywhere; it is not re-typed or duplicated per page.
2. **Planning / Execution / Tracking / Knowledge are connected.** Forecast → replenishment → order → shipment → tracking → documents → knowledge form one chain, not isolated tools.
3. **Main system, factory portal, and overseas-warehouse portal share the same data backbone.** Portals are *role-scoped lenses* over the same database, not separate systems.
4. **No duplicate parallel DB when existing execution tables are authoritative.** e.g. Shipment Draft / Overview / On-the-Way all read `shipments` + `shipment_lines`; there is **no** separate `shipment_drafts` table. Request views read the request tables; PO views read the PO tables.
5. **Page UI can aggregate by Series, but DB stays SKU-level when required.** Series/category are presentation groupings joined from SKU Details; quantities are stored at SKU granularity (e.g. `request_order_lines` is SKU-level).
6. **Calculated preview is not persisted until the user creates / submits a formal record.** Replenishment math, allocation previews, and recommendations are ephemeral until an explicit Submit / Push / Create action writes a record.
7. **Sensitive cost / payment data must later be permission-controlled.** Supplier prices, unit cost, deposit/balance, and payment status are sensitive; a permission model is required before broad exposure (future).

---

## 3. Phase 1 Roadmap — Module-by-Module

Phase 1 is the operational MVP: the pages and data that run the weekly supply cycle. Status references draw from `SYSTEM_ROADMAP.md` (UI largely complete; most pages are Demo-data or planning stage for cloud write).

> **Company / factory context** (from `SUPPLY_CHAIN_SYSTEM_FLOW.md`): **KM** = brand/operating entity, **ResTW** = procurement / supply-chain hub, **ResUS** = US operating entity. **KM and ResUS place demand through ResTW.** Factories **CN_YOUXIN (東莞侑鑫)** and **TW_SHENGYI (南投勝一)** are **production resources / a shared stock pool — not company entities.**

### 3.1 General
- **Purpose:** shared shell, navigation, design system, and cross-page conventions (filters, tables, date pickers, lifecycle).
- **Target users:** all users.
- **Core functions:** sidebar navigation, world-time bar, standard filter/button/table components, page lifecycle.
- **Data / future DB:** none directly; depends on the shared frontend architecture (§14).
- **Connections:** hosts every other module.

### 3.2 Home
- **Purpose:** landing / dashboard entry point.
- **Target users:** all users.
- **Core functions:** overview entry, world time, quick context.
- **Data / future DB:** mostly static today; future summary widgets may read execution data.
- **Connections:** gateway to all modules.

### 3.3 Site Health Dashboard / 站點概況快速總覽
- **Purpose:** give leadership and OP teams a **one-glance operational control tower across all sites** — a daily management entrance.
- **Target users:** leadership, OP / supply chain.
- **Core functions:** at-a-glance metrics per site — **Today's Sales · 7-Day Sales Trend · 30-Day Sales Trend · Days of Supply · Stockout Risk · Overstock Risk · In-Transit Status · Forecast Accuracy · Promotion Risk**; filterable by **Company · Country · Marketplace · Warehouse**.
- **Data / future DB:** reads across forecast, inventory (overseas/factory), `shipments` (in-transit), sales data, and promotion-risk sources — a **read/aggregation view**, not a new record store.
- **Connections:** a **major Home Dashboard capability**; surfaces signals from Forecast Review, Inventory Replenishment, Warehouse/Factory Stock, Shipment On The Way, and Campaign Center, pointing users to the right page before they drill in.
- **Positioning:** should become one of the most important Home dashboard capabilities and the **daily operational entrance**.

### 3.4 Campaign Center
- **Purpose:** promotion & campaign management and risk.
- **Target users:** marketing / operations.
- **Core functions:** Promotion Risk Tracker (rolling promotion analysis), Campaign Overview / Detail (Gantt UI direction).
- **Data / future DB:** `campaigns`, `campaign_sku_lines`, future `marketplace_skus`, `pricing_list`, sales data; currently localStorage/Demo (migration pending — `SYSTEM_ROADMAP.md` Stage 4-4).
- **Connections:** Forecast (event pull-forward), SKU Data Center, future Sales Data, risk management.

### 3.5 Inventory Replenishment / 貨物庫存表
- **Purpose:** monitor marketplace/site inventory and compute **suggested replenishment** to the site.
- **Target users:** operations / supply planners.
- **Core functions:** select Country / Marketplace / Target Days; show current inventory, sales, forecast, factory stock, on-the-way, suggested replenishment; **shipping allocation is preview-only**. Submit Plan creates `shipping_plans` / `shipping_plan_lines`.
- **Data / future DB:** forecast, inventory, `factory_stock`, overseas snapshot, `shipments` (on-the-way); future `marketplace_skus`, `pricing_list`.
- **Connections:** feeds Shipping Center; shares calculation inputs with Request Order (see §6, §16-distinction in calc rules).

### 3.6 Shipping Center
- **Purpose:** weekly shipping planning + formal shipment preparation. Renames the current Shipping Plan area (see `SHIPMENT_CENTER_SPEC.md` §2).
- **Target users:** operations / logistics.
- **Core functions:** **Weekly Shipping Plan** (draft → submit → approve/reject) and **Shipment Draft** (complete formal shipment data; advance to `ready_to_ship`).
- **Data / future DB:** `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `factory_stock` (reservation), future `shipment_line_allocations`.
- **Connections:** consumes approved replenishment plans; feeds Shipment Overview / On-the-Way; reserves & deducts factory stock; consumes PO lines via FIFO (§8).

### 3.7 Shipment On The Way / 全球在途貨物監控
- **Purpose:** real-time visibility of in-transit shipments (world-map direction).
- **Target users:** operations / leadership.
- **Core functions:** active in-transit view, ETA buckets, status.
- **Data / future DB:** reads `shipments` + `shipment_lines` (+ future `shipment_events` / `shipment_routes`) — **no parallel DB**. `completed` / `cancelled` shipments do **not** count as on-the-way (§8).
- **Connections:** Shipping Center (source), Shipment Overview (shared data).

### 3.8 Forecast Review / Forecast 成效監管中心
- **Purpose:** monitor forecast accuracy and manage base/event/target forecast.
- **Target users:** planners / leadership.
- **Core functions:** charts (unit/comparison/period), achievement sections, FC Summary editing (base FC, special events, target % rules).
- **Data / future DB:** `fc_regular_forecast` (+ events/targets); future sales data for accuracy.
- **Connections:** feeds Inventory Replenishment & Request Order calculations; campaign events.

### 3.9 SKU Data Center
- **Purpose:** SKU master data + product knowledge.
- **Target users:** all; product/operations owners.
- **Core functions:** SKU Details (lifecycle, dimensions/weights, GS1, ASIN, prices/declared value, units per carton), SKU Handbook (product knowledge, i18n).
- **Data / future DB:** `sku_details`, `product_features`, `sku_handbook_summaries`; future `marketplace_skus`, `pricing_list`.
- **Connections:** the SKU backbone joined by nearly every module (Series/category, units_per_carton, declared_value, etc.).

### 3.10 Warehouse Stock
- **Purpose:** monitor non-factory inventory (overseas / 3PL / FBA) and movements.
- **Target users:** operations / overseas-warehouse stakeholders.
- **Core functions:** Overseas Stock snapshot (available / reserved / damaged), movement log with filters.
- **Data / future DB:** overseas inventory snapshot + movements; `warehouses` (identity by `warehouse_id`).
- **Connections:** input to replenishment; precursor to the future overseas-warehouse portal (§9).

### 3.11 Factory Order Management
- **Purpose:** factory-side stock, purchase orders, and production tracking.
- **Target users:** procurement / factory stakeholders.
- **Core functions:** Factory Stock (current/reserved, movements), Purchase Order Overview (formal PO execution), Purchase Order List (raw line status), production schedule visibility.
- **Data / future DB:** `factory_stock`, `factory_stock_movements`, `purchase_orders`, `purchase_order_lines`, `production_schedule`; identity via `warehouses` (`is_factory_warehouse`).
- **Connections:** receives converted Request Orders (§7); supplies stock to Shipping Center; precursor to the future factory portal (§9).

### 3.12 Company / Site / Warehouse / People Management
- **Purpose:** master/admin data underpinning every module.
- **Target users:** admins.
- **Core functions:** manage companies, sites/marketplaces, warehouses/factories, people/departments.
- **Data / future DB:** `warehouses`, company/site/marketplace masters, people/department masters (see §12).
- **Connections:** referenced by inventory, shipment, PO, replenishment, portals.

### 3.12A Import Job Framework *(platform — sequenced BEFORE Export Center)*
- **Purpose:** a **reusable, review-gated platform layer** every import flows through — External Data → Import Job → Validation → Review → Apply → History → Business Tables. Import **never** writes a business table directly; users review + approve, the system applies, history remains.
- **Target users:** operators (upload), reviewers/approvers (review + apply), admins (history/audit).
- **Core functions:** Task Card (pending import) → **Review Page** (Top Summary counts + row-level warnings showing *Original → Imported → Recommended Action*; locked-field change defaults to Keep Original with Override) → Apply → searchable Import History. Popup = quick summary only, never the main workflow.
- **Data / future DB:** `import_jobs`, `import_job_details` (generic, all modules). See `IMPORT_JOB_FRAMEWORK_SPEC.md` + `IMPORT_JOB_DATABASE_SPEC.md`.
- **Connections:** **Carrier Rate Card is the first adopter**; future adopters include Warehouse Rate, Container Rate, Forecast, Amazon Inventory/Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import. **Sequenced before Export Center** because Export Center's future carrier-email round-trip (send template → carrier reply → attachment) **lands on** this framework. Future Gmail / API automation only *creates + validates* jobs (up to Waiting Review); human review still applies.

### 3.13 Export Center
- **Purpose:** document generation (PO, invoice, packing list, shipment sheet, carrier booking, customs).
- **Target users:** operations / logistics / finance.
- **Core functions:** generate documents from existing execution records; Template Management is a sub-tab.
- **Data / future DB:** `document_templates`, `generated_documents`, sourced from PO / shipment / SKU / warehouse / cost.
- **Connections:** Shipping Center, Factory Order Management, Cost Analysis (§10).

### 3.14 KM University
- **Purpose:** internal knowledge base & training.
- **Target users:** all internal users (onboarding & reference).
- **Core functions:** structured training content, product knowledge, process guides.
- **Data / future DB:** knowledge content store (future); links to SKU Handbook.
- **Connections:** SKU Data Center; expands in Phase 2.

---

## 4. Phase 2 Roadmap — Module Summary

Phase 2 layers intelligence, portals, and integrations on top of the stable Phase 1 backbone (AI strictly **after** data sources are stable and history accumulates — `SYSTEM_ROADMAP.md` Stage 5).

- **AI-assisted demand prediction & replenishment** — forecast and order recommendations powered by accumulated history.
- **AI operations assistant / analytics** — a natural-language assistant reading the same DB to answer and analyze.
- **Campaign calendar / campaign management / Gantt** — full promotion planning timeline.
- **Overseas warehouse independent portal** — role-scoped warehouse view (§9).
- **Factory independent portal** — role-scoped factory view (§9).
- **KM University knowledge base expansion** — richer training/knowledge, possibly AI-assisted Q&A / RAG.
- **New Product Monitoring Center** — track new SKU launch performance and ramp.
- **Amazon Ads Intelligence Center** — connect **Amazon Ads API** data with operational planning (broader than a plain marketplace/logistics API pull).
  - **Potential capabilities:** Spend Analysis · ROAS Analysis · ACOS Analysis · TACOS Analysis · Campaign Performance Analysis · Keyword Analysis · Promotion Effectiveness Analysis · Ads-to-Sales Correlation Analysis.
  - **Future direction:** AI Campaign Advisor · AI Budget Suggestion · AI Forecast Adjustment.
- **Marketplace / logistics API integration** — pull marketplace + carrier data to reduce manual entry (e.g. Amazon FBA inventory live sync, carrier tracking).

---

## 5. Supply Chain Core Flow (backbone)

The end-to-end backbone that ties the modules together:

```
Forecast
   ↓
Inventory Projection
   ↓
Factory Stock Allocation            (planning layer; factory_stock_allocation_plans — future)
   ↓
Inventory Replenishment             (suggested replenishment; Submit → shipping_plans)
   ↓
Request Order                       (下單系統: calc/recommend across companies/sites)
   ↓
Request Order Draft                 (request_orders approval: draft→pending→approved/rejected/cancelled)
   ↓
Purchase Order Overview             (approved request → purchase_orders + purchase_order_lines)
   ↓
Production Schedule                 (production readiness; completed_qty)
   ↓
Shipment Draft                      (shipments.status = draft → ready_to_ship)
   ↓
Shipment Overview                   (read shipments + shipment_lines)
   ↓
On The Way / World Map              (+ future shipment_events / shipment_routes; no parallel DB)
   ↓
Export Center / Cost Analysis       (documents + cost from PO/shipment/SKU/warehouse)
```

Each arrow is a **forward data hand-off**, honoring Principle #6 (preview not persisted until submit) and Principle #4 (no parallel DB).

---

## 6. Replenishment Architecture

- **Inventory Replenishment monitors marketplace / site inventory** and computes the suggested quantity to ship to each site (Target Days × avg sales vs current coverage — see `SUPPLY_PLANNING_CALCULATION_RULES.md`).
- **Inputs:** **Overseas Stock + Factory Stock + On-the-Way + Forecast** (plus reallocation and carton rounding).
- **Factory Stock is physical inventory** at a factory warehouse (`factory_stock`, keyed by `warehouse_id + sku`); `available_stock = current_stock − reserved_stock` (computed).
- **`factory_stock_allocation_plans` is a planning-layer allocation** snapshot (future): it virtually allocates factory stock across company / country / marketplace / warehouse / SKU to support replenishment and shortage review. It does **not** deduct factory stock, transfer ownership, or create SO/PO/intercompany transactions (`SHIPMENT_CENTER_SPEC.md` §9).
- **Allocation by company / site / marketplace is planning metadata, not ownership / accounting.** ResTW is the procurement hub; allocation answers "who needs it," not "who owns/bills it."
- **Shortage / overstock alerts feed risk management** — net shortage (after reallocation) signals order need; overstock signals surplus to redistribute. Carton rounding: `CEILING(Order Need ÷ units_per_carton) × units_per_carton`.

---

## 7. Request Order / Purchase Order Architecture

> **Current authority:** [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) (Procurement Phase 1 — implemented schema + Request/PO status lifecycle + Convert-to-PO + allocation persistence). **PO Workspace / Remaining Overview / Receive / Production Timeline** detail: [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) (PO v2). [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) is the **EXTENDED / FUTURE** reference only (three-layer sources, `supplier_price_list` / `payment_terms`, `request_order_po_links`) and does **not** govern the current runtime. This summary points to those specs — it does not redefine the schema.

- **下單系統 is the calculation / recommendation page** — it computes recommended order quantities across all companies / sites / marketplaces.
- **One push creates one combined Request** → writes the three-layer structure in a single action.
- **`request_orders`** = overall request **header / batch** (no company/country/marketplace on the header).
- **`request_order_lines`** = **SKU-level aggregated** order quantity (Series joined from SKU Details, not stored).
- **`request_order_line_sources`** = **company / country / marketplace / warehouse / site_sku source breakdown** — answers "this total qty came from which demand origin." Includes future `source_type` / `source_priority` metadata and `ownership_company` (default **ResTW**, planning metadata only).
- **Request Order Draft handles approval** — `draft → pending_approval → approved / rejected / cancelled`. Approval workflow lives **only** on the request layer.
- **Purchase Order Overview handles formal PO execution** — an approved request converts to `purchase_orders` + `purchase_order_lines`; the PO does **not** own a submit/approve/reject workflow. One-request → many-PO is designed via the planned `request_order_po_links` table (MVP uses `converted_purchase_order_id` for one→one).
- **PO execution lifecycle (v1.3):** `draft → issued → in_production → … → closed/cancelled`. **PO `draft`** = formal PO created but **not yet issued** to factory (execution-preparation, NOT approval). **PO `issued`** = PO document generated / sent / confirmed to factory. This is separate from the request approval lifecycle.
- **PO document generation** uses `document_templates` / `generated_documents` (`document_type = PURCHASE_ORDER`); **MVP factory communication is a manual email**, then the user sets `order_status = issued` (automation/portal is future).
- **Purchase Order List shows raw line status** — ordered / completed / shipped / remaining (a read/view over `purchase_orders` + `purchase_order_lines`, not a separate DB).
- **Production completion updates `purchase_order_lines.completed_qty`.**
- **`available_to_ship = completed_qty − shipped_qty`** — only produced-but-not-yet-shipped units may ship.
- **`shipment_line_allocations` (PLANNED — NOT IMPLEMENTED)** will consume PO lines during shipment (FIFO default; one shipment line ← many PO lines; one PO line → many shipment lines). **Current runtime uses the single-link `shipment_lines.purchase_order_line_id`**; the multi-PO allocation table + writer are planned (`SHIPMENT_CENTER_SPEC.md` §16 / §6).

---

## 8. Shipment Architecture

> Authority: [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (Draft v2.3).

- **Weekly Shipping Plan creates `shipping_plans` + `shipping_plan_lines`** (planning + approval).
- **An approved Weekly Shipping Plan creates `shipments` + `shipment_lines`** as a snapshot (execution layer).
- **Shipment Draft IS `shipments.status = draft`** — it is an editable preparation **view**, not a new table. **Do NOT create a separate `shipment_drafts` table.**
- **Shipment Draft completes formal shipment details** (carrier, ETD/ETA, cartons, container/BL/invoice) and advances status to `ready_to_ship` (triggering FIFO PO allocation and factory-stock deduction).
- **Shipment Overview reads `shipments` + `shipment_lines`** (tracking / history / search, read-only).
- **On The Way / world map reads `shipments` + `shipment_lines` + future `shipment_events` + `shipment_routes`** — the **same** data source.
- **`completed` / `cancelled` shipments do NOT count as on-the-way**; only `ready_to_ship` / `in_transit` / `partial_received` are active candidates.
- **`shipment_events` and `shipment_routes` are future tracking-detail tables, not replacement DBs** — they enrich, never duplicate, `shipments` / `shipment_lines`.

Status lifecycle: `draft → planned → ready_to_ship → in_transit → partial_received → completed` (+ `cancelled`, `stuck`). Factory stock is **reserved** on plan approval, **deducted** on ready-to-ship, **released** on cancel (never deducting `current_stock` on cancel).

**v2.2 / v2.3 sync:**
- **Confirm & Ship is the single physical `factory_stock.current_stock` deduction trigger** (plan creation/submission and Shipment Draft never deduct `current_stock`).
- **Shipment documents** (Shipment Detail Sheet · Carrier Booking Form / 托單 · Commercial Invoice · Packing List · AGL Combined) are generated via `document_templates` / `generated_documents`; **MVP communication to factory/carrier is manual email**.
- **One shared Shipment Document Dataset → many rendered templates** (template controls layout, dataset controls values; token-to-DB mapping is future Export Center / Mapping Spec).
- **Shipment Center executes planned needs — it does NOT run a parallel replenishment calculation engine.** Inventory Replenishment's per-site **allocated factory stock is planning metadata only** (no `current_stock` deduction, no ownership transfer), and a site's planned shipment qty should not exceed its allocated available factory stock (cross-site/company borrowing is a future planning exception, never accounting).

---

## 9. Factory / Overseas Warehouse Portal Concept

Portals are **role-scoped lenses over the same core DB — never separate duplicated records** (Principle #3, #4).

**Factory portal users should later see only factory-relevant information:**
- factory stock (`factory_stock`)
- stock movements (`factory_stock_movements`)
- PO / production schedule (`purchase_orders`, `purchase_order_lines`, `production_schedule`)
- inbound / outbound tasks
- comments / notes

**Overseas warehouse portal users should see:**
- warehouse stock (overseas snapshot)
- inbound / outbound movements
- ETA tracking (from `shipments` / `shipment_lines`)
- receiving task
- arrival notification

Both portals **read the same backbone**; identity and scoping come from `warehouses` (`warehouse_id`, `is_factory_warehouse`, `company`, `country`). Permission scoping is a future requirement (§13, §15).

---

## 10. Export Center / Document Automation

Future document automation generates, from existing records:
- **PO**
- **invoice**
- **packing list**
- **shipment sheet** (出貨明細)
- **carrier template / booking sheet** (托單)
- **customs / declaration data**

Data is **sourced from PO, shipment, SKU, warehouse, and cost records** (e.g. `purchase_orders` / lines, `shipments` / lines, `sku_details`, `warehouses`, cost tables) via `document_templates` → `generated_documents`. **Goal: reduce manual key-in** — documents are assembled from data already captured upstream, not re-typed.

---

## 11. Cost Analysis Direction

- **Cost Analysis should eventually become an independent / finance-related module.**
- It **may initially be connected from Inventory / Supply Chain** before becoming standalone.
- **Inputs:** supplier price list · PO unit-cost snapshot · freight cost · duty · shipment qty · marketplace fee · storage fee.
- It is a **simulation / analysis layer** built on top of the pricing master (`pricing_list` is the source of truth for selling prices; Cost Analysis covers cost/margin/landed cost/scenarios — `SYSTEM_ROADMAP.md` 3.5-4).
- **Sensitive data requires future permission control** (Principle #7): supplier prices, unit costs, margins.

---

## 12. Admin / Master Data Direction

These masters support all downstream modules:
- **Company management** (KM / ResTW / ResUS)
- **Site / marketplace management** (country + marketplace; future `marketplace_skus`)
- **Warehouse / factory management** (`warehouses`, `is_factory_warehouse`)
- **People / department management**
- **Template management** (`document_templates`)
- **Supplier management**
- **Supplier price list** (`supplier_price_list` — cost master; PO unit_cost is a snapshot)
- **Payment terms** (`payment_terms` — deposit/balance rate + due triggers)

Master data is referenced (not duplicated) by inventory, shipment, PO, replenishment, export, and portals.

---

## 13. System Foundation / Future Infrastructure

These are **required foundation items**, not necessarily Phase 1 UI pages:

- **Mapping / Sync Governance** — DB-to-UI mapping rules; keep the API layer (`operation-system-db-api.js`) replaceable; no parallel loaders.
- **Calculation Engine Spec** — formalize replenishment / allocation / order-need math (`calculation_run_id` traceability).
- **API Migration** — unified request layer (local / demo / cloud), error handling, retry, caching (`SYSTEM_ROADMAP.md` Phase 4-2).
- **BigQuery / Data Warehouse** — analytics/reporting target and field mapping.
- **Notification Center** — dangerous alerts (stockout, missed shipment, risky promotion), arrival notifications, due-payment reminders. **Phase 2+** (role-based email after Role & Permission).
- **Permission / Sensitive Data Control** — role model gating cost/payment data and portal scope. **Phase 2.**
- **AI Assistant / Prediction Engine** — only after data sources are stable and history has accumulated (`SYSTEM_ROADMAP.md` Stage 5).

> **Clarification:** These are **system foundation** items. Some surface as background services or governance rather than as standalone Phase 1 pages, but the system depends on them being designed deliberately.

> **Phase 1A / Phase 2 / Phase 2+ boundary (CANONICAL 2026-07-23):** **Login** confirms *who* the user is; **Permission** decides *what* they may do; the **Deployment URL** is the *entry point* only (delivery/access, **not** authentication/authorization). **Phase 1A Go-Live** = Supply Chain Closed Loop + **GitHub deployment (system URL)** + controlled internal trial by approved employees — **not** gated on Google Login, Gmail, full RBAC, or DB Capacity Monitor; **"knowing the URL" is not a security control**; and **no** Client Secret / Refresh Token / API credential / sensitive data goes in the frontend, repo, Google Sheet, or any public environment (environment isolation + controlled sharing + minimal exposure still apply). Formal **Login + Session + Role & Permission (+ DB Capacity Monitor) = Phase 2**; role-based **notification email + personal Gmail Connect = Phase 2+** (signing in with Google does **not** grant Gmail access). Authority: `SYSTEM_ROADMAP.md` → "Phase 1A / Phase 2 / Phase 2+ Boundaries".

---

## 14. Frontend Architecture

> Authority: [`FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md`](./FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md).

- **`index.html` is the app shell only** — header, sidebar nav, `<main>` with mount points, world-time bar, and one shared date-picker modal. It contains **zero inline page `<section>` blocks** (Phase 3 complete).
- **All pages are `assets/html/pages/*.html` partials** (13 partials: Home + 12 module pages), injected on first navigation via `KM.partialLoader`.
- **Each page has a JS lifecycle** registered through `KM.lifecycle.register(<section-id>, { mount, unmount })`, with an idempotent `_ensure…Markup()` loader.
- **New pages must follow: partial + mount point + `KM.lifecycle`** (ensure markup → re-apply `.active` → init), with the per-page guard + loader registry preventing duplicate sections.
- **No new inline page sections in `index.html`** — the shell convention must be enforced in review.
- **Serving note:** partial-loaded pages require an **HTTP(S) server** (`fetch` is blocked under `file://`).

---

## 15. Non-Goals (now)

Do **not** implement now:
- full ERP accounting
- intercompany SO / AP / AR
- full BigQuery migration
- full API rewrite
- AI agent **actions** (autonomous writes)
- permission system implementation
- automatic email
- full dashboard beautification

---

## 16. Open Items

- exact **replenishment calculation formula**
- **factory stock allocation engine** (`factory_stock_allocation_plans` calculation + versioning)
- **request order calculation engine** (`source_calculation_run_id` / `calculation_run_id`)
- **`shipment_events` / `shipment_routes`** detail design
- **carrier master / rate card** (`carriers`, `carrier_routes`, `carrier_rate_cards`, lead times, performance)
- **export document templates** (layout/fields per document type)
- **cost analysis formula** (landed cost, margin, scenarios)
- **permission model** (who sees/edits cost/payment; portal scope)
- **API / BigQuery / mapping sequence**
- **notification rules** (thresholds, channels, escalation)
- **factory portal scope** (exact screens/fields)
- **overseas warehouse portal scope** (exact screens/fields)

---

**Draft v1 — Master Blueprint. Spec only. No code, DB, API, Apps Script, or runtime changes are implied by this document. Domain specs remain authoritative where details differ.**

**End of Document**
