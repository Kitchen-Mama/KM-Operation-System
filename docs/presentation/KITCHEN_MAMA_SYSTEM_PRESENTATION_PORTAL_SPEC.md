# Kitchen Mama Operation System — Presentation Portal Spec

**Status:** 🟡 Draft v3.2 — Presentation Portal Spec only (NO code, NO route, NO DB, NO implementation)
**Last Updated:** 2026-06-25
**Maintained By:** Development Team
**Audience:** leadership · OP / supply chain · procurement · factory & overseas-warehouse stakeholders · future developers · new employees
**Primary authority:** [`KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md`](../planning/KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md), [`SHIPMENT_CENTER_SPEC.md`](../planning/SHIPMENT_CENTER_SPEC.md), [`REQUEST_ORDER_AND_PO_SPEC.md`](../planning/REQUEST_ORDER_AND_PO_SPEC.md)
**Supporting context only:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](../planning/SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](../planning/SUPPLY_PLANNING_CALCULATION_RULES.md), [`DATABASE_RELATIONSHIP_MAP.md`](../planning/DATABASE_RELATIONSHIP_MAP.md), [`FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md`](../planning/FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md)

> **Spec only.** This document describes a **future internal presentation portal page** for leadership reporting, internal alignment, and live-demo support. It introduces **no** code, route, `index.html` change, DB, API, or runtime behavior. It lives under `docs/presentation/` (intentionally **outside `assets/`**). Where this document and a domain spec differ, the **domain spec is authoritative**.

### Changelog

- **Draft v3.2 (2026-06-25)** — **Business-Blueprint-first architecture.** The presentation no longer starts at module level. Added a new **Kitchen Mama Business Blueprint** section (new tab **D**, inserted **before** the existing detailed Blueprint): a one-page executive capability map of **8 business domains** (each with a suggested icon, a one-sentence business goal, and an *expandable* module list — no module detail shown up front), a conceptual **Executive Blueprint Diagram** (HTML/CSS card layout described, no Mermaid), a **4-Layer model** (Business Blueprint → Domains → Modules → Features), and a **Blueprint vs Roadmap** clarification (capability-oriented vs implementation-oriented). The existing detailed domain decomposition is retained as tab **E** (downstream tabs re-lettered E→N). Added **Presenter Notes** with the recommended executive speaking order. **Roadmap is unchanged** — all Phase 1 / Phase 2 modules remain exactly as defined; only its position in the hierarchy is clarified.
- **Draft v3.1 (2026-06-25)** — Added an **Executive Summary** cover section as the new first content section (title, tagline, one-line description, six one-line capability cards, closing statement, transition). No module detail; no Blueprint content duplicated.
- **Draft v3 (2026-06-25)** — **Business-story upgrade.** Narrative flow **Vision → Business Problems → Solution (Principles) → Blueprint → System Data Flow → Roadmap → Flows → System Demo → Future Vision**. Added System Design Principles, System Data Flow, and End Vision; Blueprint domains gained Business Goals; Before/After added a transformation flow; Pain Points became Problem → Impact → Solution; Go To Details cards mapped to domain/goal/problem/flow.
- **Draft v2 (2026-06-25)** — Presentation-flow redesign: added lead-in sections Why / Pain Points / Blueprint before Roadmap; moved Roadmap after Blueprint; Go To Details cards mapped to domain/problem/flow.
- **Draft v1 (2026-06-18)** — Initial Presentation Portal Spec (tabs A–I): Vision, Before/After, Roadmap, Supply Chain Flow, Shipment Flow, Order/PO Flow, Document Automation, Go To Details, Memo; Site Health Dashboard (Phase 1) and Amazon Ads Intelligence Center (Phase 2) spotlights.

---

## 0. Executive Summary

> **The 60-second overview.** This is the cover page — it explains KMOS in under a minute for executives and stakeholders, **before** any business problem or system architecture. Concise, visual, presentation-oriented. (No module detail here; depth lives in the sections below.)

### Kitchen Mama Operation System

**One Company. One System. One Source of Truth.**

Build a unified operational platform that connects **products, inventory, forecasting, purchasing, logistics, knowledge, and future AI capabilities** into one system.

### Core Capability Overview

> Six high-level capabilities (rendered as cards / icons in a future implementation) — one line each.

| Capability | In one line |
|------------|-------------|
| **Supply Chain** | Plan and move inventory across every site on one connected backbone. |
| **Forecast** | Turn demand signals into reliable, forward-looking plans. |
| **Shipment** | Execute and track every shipment from factory to destination. |
| **Factory** | Standardize purchasing and production into a traceable workflow. |
| **Knowledge** | Make company experience a shared, reusable asset. |
| **AI** | Sit intelligence on top of clean, connected data. |

### Closing Statement

**Everything Connected. Everything Traceable. Everything Scalable.**

---

> *Next, we will look at why Kitchen Mama needs this system.*

---

## 1. Page Positioning

- This is a **standalone internal presentation portal** — a single, well-organized page that tells the KMOS business story at a glance and on expand.
- It is **not the ERP runtime module** yet.
- It is **not a replacement for the planning specs** — it summarizes and links to them.
- It is **not stored under `assets/`** (it is documentation today).
- It **may later become a lightweight presentation / reporting page** in the system if leadership wants it — but that is a future, separate task.

---

## 2. Target Audience

- **Leadership** — *why the system exists*, the problems it removes, the design philosophy, the big-picture blueprint, roadmap, and the long-term vision.
- **Management / non-technical team members** — understand the system as a business story without reading the planning specs or seeing 15+ modules first.
- **OP / supply chain team** — flows and where their work fits.
- **Procurement team** — request → PO → factory flow.
- **Factory / warehouse stakeholders** — where their data and future portals fit.
- **Future developers** — expandable detail + links to authoritative specs.
- **New employees** — onboarding overview of how the system operates.

---

## 3. Page Design Principles (of the portal itself)

The portal should be:
- **Blueprint-first, then story-ordered** — a CEO should grasp the whole system from the **Business Blueprint** in 30–60 seconds, *before* any individual module. The full narrative then flows **Vision → Business Problems → Solution → Business Blueprint → Detailed Domains → Data Flow → Roadmap → Flows → System Demo → Future Vision.**
- **High-level first** — a leader can understand each section in one glance.
- **Expandable for details** — "Expand Details" reveals depth; Blueprint domains expand to reveal modules.
- **Split by topics / pages** — each major theme is its own section/tab.
- **Connected through flow navigation** — sections cross-link along the supply-chain flow.
- **Demo-friendly** and **Memo-friendly** — supports a live walkthrough with talking points and captured notes.
- **Simple enough for leadership, detailed enough for developers when expanded.**

> Note: Section C below covers **the design principles of the *system* (KMOS)**. This Section 3 covers the design principles of the *presentation page*. They are different things.

---

## 4. Top-Level Portal Structure

Major sections / tabs — **the business-story order**:

| Tab | Title | Story beat |
|-----|-------|-----------|
| **A** | **Why We Need This System** | **Vision** — the business reason + before/after transformation |
| **B** | **Current Pain Points** | **Business Problems** — Problem → Impact → KMOS Solution |
| **C** | **Kitchen Mama Operation System Principles** | **Solution** — the 8 design principles behind the system |
| **D** | **Kitchen Mama Business Blueprint** | **Big picture (executive)** — 8 business domains as a one-page capability map |
| **E** | **Blueprint — Capability Domains (detailed)** | **Big picture (full)** — the same domains decomposed to modules |
| **F** | **System Data Flow** | **Architecture** — how information moves, as layers |
| G | Phase 1 & Phase 2 Roadmap | *What gets built first* (sequencing) |
| H | Full Supply Chain Flow | How the end-to-end backbone works |
| I | Shipment Flow | How shipments execute |
| J | Order / Request / PO Flow | How procurement executes |
| K | Document Automation / Export Direction | How documents are generated |
| L | Go To Details / Live Demo | **System Demo** — module cards (domain · goal · problem · flow) |
| M | Memo / Discussion Notes | Capture discussion notes per section |
| **N** | **Kitchen Mama Operation System Vision** | **Future Vision** — Today → Tomorrow → Future |

Each tab opens high-level content with optional **Expand Details**; a **Memo panel** is reachable from any tab; the Business Blueprint (D) and detailed domains (E) expand to their modules; flow tabs (H/I/J) use step cards and arrows.

### Presenter Notes — Recommended Speaking Order

> The document above is organized for reading. For a **live executive presentation**, the recommended **speaking order** is a curated subset that lands fastest with leadership:

```
Executive Summary
   ↓
Business Blueprint        (the whole system in one page)
   ↓
System Principles         (why it is built this way)
   ↓
Pain Points               (what hurts today)
   ↓
Before / After            (the transformation)
   ↓
Roadmap                   (what we build first)
   ↓
System Flow               (how it all connects)
   ↓
Shipment Flow
   ↓
Request / Purchase Flow
   ↓
Demo                      (see it live)
   ↓
Vision                    (where this goes)
```

**Why this order is easier for executives:**
- **Blueprint before modules** — leadership sees the *whole company system* on one page first, so every later detail has a place to hang. Starting at module level forces executives to assemble the big picture themselves.
- **Principles before problems** — once they see *how* the system is designed, the pain points read as "this is exactly what the design fixes," not a complaint list.
- **Roadmap after the big picture** — they already know *what the system is*, so the roadmap is simply *sequencing*, not a second attempt to explain the system.
- **Flows and Demo last** — depth is earned: by the time modules appear, the audience already has the map. Vision closes on ambition.

*(Data Flow and Document Automation are reference sections — include them on demand for technical stakeholders, not in the core executive walkthrough.)*

---

## 5. A. Why We Need This System

> Authority: the Blueprint. Keep concise and leadership-friendly. Answers **"why does KMOS exist?"** before any module is shown.

### Executive Summary

**Kitchen Mama Operation System (KMOS) is an all-in-one company operation system — not just a project tracker.**

Kitchen Mama runs a real, cross-border consumer-products operation: forecasting demand, planning inventory, ordering from factories, producing, shipping worldwide, receiving into overseas warehouses, generating trade documents, and learning from the results. Today that work lives across scattered spreadsheets and manual files. KMOS exists to **connect all of it into one source of truth** so the company can plan, order, ship, track, and learn on a single connected backbone.

It connects, in one backbone:
- forecast · replenishment · factory stock · overseas warehouse stock
- request order · purchase order · production completion
- shipment execution · document automation · risk alerts
- knowledge base / KM University
- future AI / API / BigQuery / Mapping

**One sentence for leadership:** *"Plan, order, ship, track, and learn — on one connected source of truth."*

### The shift KMOS represents

| From | → | To |
|------|---|----|
| **Manual Operations** | → | **Data-Driven Operations** |
| **Fragmented Information** | → | **Single Source of Truth** |
| **Reactive Decision Making** | → | **Predictive Planning** |
| **Department Silos** | → | **Cross-Team Collaboration** |
| **Manual Documents** | → | **Automation** |
| **Human Experience (in people's heads)** | → | **System Knowledge (captured & shared)** |

### Visual Before / After Comparison (table)

| | **Before** | **After** |
|---|------------|-----------|
| Data | scattered in Sheets and manual files | **one system, one source of truth** |
| Connection | forecast / order / shipment / inventory not fully connected | **forecast → replenishment → request → PO → shipment → document connected** |
| Entry | repeated manual key-in | **less repeated manual entry** |
| Traceability | shipment & PO status hard to trace | **PO and shipment status traceable** |
| Documents | manually created | **generated from existing records** |
| Inventory | factory / overseas / on-the-way not always visible | **factory stock / overseas stock / on-the-way visible** |
| Decisions | reactive, discovered late | **predictive planning + future alerts and AI analysis** |
| Alignment | factory / overseas / office not always aligned | **factory & warehouse portals share the same data backbone** |
| Knowledge | lives in individual experience | **captured as shared system knowledge / KM University** |

### Visual Transformation Flow (before → after as a cascade)

**Today — the failure cascade:**
```
Manual Google Sheets
   ↓
Data Synchronization (breaks)
   ↓
Forecast Errors
   ↓
Late Purchasing
   ↓
Stockout Risk
   ↓
Lost Sales
```

**With Kitchen Mama Operation System — the growth cascade:**
```
Kitchen Mama Operation System
   ↓
Single Source of Truth
   ↓
AI Forecast
   ↓
Purchase Recommendation
   ↓
Shipment Planning
   ↓
Stable Inventory
   ↓
Business Growth
```

**Talking point:** the same chain that today *cascades into lost sales* becomes a chain that *cascades into business growth* — because each step shares one source of truth instead of a fragile re-keyed spreadsheet.

---

## 6. B. Current Pain Points

> Authority: the Blueprint. The **problem** made concrete before the solution. Each pain point reads **Problem → Business Impact → KMOS Solution**, and maps to the Blueprint domain (Sections D–E) that resolves it.

### 1. Data Fragmentation
- **Problem:** Google Sheets are scattered — Inventory, Forecast, Sales, Cost, Shipment, and Factory planning all live separately.
- **Business Impact:** no shared picture; teams reconcile by hand; decisions made on stale or conflicting numbers.
- **KMOS Solution:** **Single Source of Truth** across all Blueprint domains.

### 2. Data Synchronization Issues
- **Problem:** a SKU added in one place is not updated elsewhere. *Example:* Inventory Replenishment updated, Forecast table not.
- **Business Impact:** forecast inconsistency → **wrong purchasing quantity**.
- **KMOS Solution:** one SKU master flowing forward (Supply Chain Planning Center + Product & Supplier Center).

### 3. Spreadsheet Risk
- **Problem:** multiple users editing; formulas accidentally modified; broken calculations; version-control issues.
- **Business Impact:** silent calculation errors propagate into orders and shipments; no reliable audit trail.
- **KMOS Solution:** calculations move into the system (with traceability) instead of fragile shared-sheet formulas.

### 4. Forecasting Limitation
- **Problem:** static formulas only — cannot react intelligently to Seasonality, Events, Ads, Promotions, or Trends.
- **Business Impact:** forecasts miss real demand → stockouts or overstock.
- **KMOS Solution:** Supply Chain Planning Center (AI Forecast Engine) + Marketing & Demand Center signals.

### 5. Excessive Manual Work
- **Problem:** Purchase Orders, Shipment Documents, Packing Lists, Invoices, and Carrier Forms require repeated manual entry.
- **Business Impact:** slow, error-prone, expensive human time spent re-keying the same data.
- **KMOS Solution:** Document Automation / Export — one dataset → many templates.

### 6. Inventory Accuracy Problems
- **Problem:** inventory records and actual inventory diverge; no complete inventory movement history.
- **Business Impact:** unreliable available-to-ship; wrong replenishment; lost trust in the numbers.
- **KMOS Solution:** Logistics & Shipment Center + factory / overseas stock movement tracking.

### 7. Knowledge & Communication Gaps
- **Problem:** departments lack visibility; Campaign changes, Product updates, SKU knowledge, and Factory information are not centralized.
- **Business Impact:** knowledge stuck in individuals; slow onboarding; repeated questions and mistakes.
- **KMOS Solution:** Knowledge & Intelligence Center (KM University, SKU Handbook) + Marketing & Demand Center.

---

## 7. C. Kitchen Mama Operation System Principles

> The **design philosophy** behind the entire system — the "Solution" beat of the story, shown as concise executive-style cards. These principles are *why* the Blueprint and flows are shaped the way they are.

### 1. One Source of Truth
Every business data point has **only one authoritative source**. No duplicated business logic across sheets or modules.

### 2. Planning ≠ Execution
Planning data and execution data are **kept separate**, and connected in a clear chain:
```
Forecast → Request Order → Purchase Order → Shipment → Receiving
```
Planning expresses intent; execution records what actually happened. They never overwrite each other.

### 3. Everything Traceable
Every **inventory movement, purchase, shipment, forecast, and approval** must be traceable — who, what, when, and from which record.

### 4. Automation First
Reduce manual work wherever possible. **Documents, calculations, notifications, and reports** should be generated automatically from existing records.

### 5. API First
Future integrations connect through **APIs** instead of manual import/export — so external systems feed the backbone directly.

### 6. AI Ready
The architecture supports **AI Forecast, AI Assistant, AI Recommendations, and AI Notifications** — AI plugs into clean, connected data rather than being bolted on.

### 7. Knowledge Driven
Knowledge belongs to **the company, not individual employees**. **SOPs, SKU knowledge, and training** become reusable assets.

### 8. Scalable Architecture
Every module is **independently expandable** — new capability can be added without redesigning the whole system.

---

## 8. D. Kitchen Mama Business Blueprint

> **The one-page executive overview of the entire system.** A CEO should understand all of KMOS from this page in **30–60 seconds**. It deliberately does **not** list every module — it introduces the **major business capability domains**. Each domain can be expanded to reveal its modules (the full decomposition lives in Section E).

### Executive Blueprint Overview — 8 Business Domains

> Each domain: **suggested icon · one-sentence business goal · expandable module list.** Modules are shown collapsed by default; expand only on demand.

#### 🏠 1. Executive Dashboard
- **Business Goal:** One place to immediately understand the health of the company.
- **Purpose:** Daily operational command center.
- **Contains (expand):** Home · Site Health Dashboard

#### 📦 2. Supply Chain Planning Center
- **Business Goal:** Prevent stockouts while minimizing inventory.
- **Purpose:** Inventory risk management and forward planning.
- **Contains (expand):** Inventory Replenishment · Forecast Review · Warehouse Stock

#### 📈 3. Marketing & Demand Center
- **Business Goal:** Understand and influence demand before inventory becomes a problem.
- **Purpose:** Demand generation and promotion monitoring.
- **Contains (expand):** Campaign Center · Amazon Ads Intelligence Center

#### 📋 4. Product & Supplier Center
- **Business Goal:** Maintain a single source of truth for every product.
- **Purpose:** Product and supplier master data.
- **Contains (expand):** SKU Data Center · Supplier Management · Pricing · Product Cost

#### 🏭 5. Procurement & Factory Center
- **Business Goal:** Standardize purchasing and production management.
- **Purpose:** Purchase planning and production execution.
- **Contains (expand):** Request Order · Purchase Order · Factory Order Management

#### 🚢 6. Logistics & Shipment Center
- **Business Goal:** Track every shipment from factory to destination.
- **Purpose:** Global shipment execution and document output.
- **Contains (expand):** Weekly Shipping Plan · Shipment Draft · Shipment Overview · Shipment On The Way · Export Center

#### 📚 7. Knowledge & Intelligence Center
- **Business Goal:** Turn operational experience into company knowledge.
- **Purpose:** Company knowledge and future intelligence.
- **Contains (expand):** KM University · AI Assistant · Knowledge Base

#### ⚙️ 8. Organization Control Center
- **Business Goal:** Maintain standardized master data and governance.
- **Purpose:** Master data governance and access control.
- **Contains (expand):** Company · Warehouse · Marketplace · People · Roles · Permissions · Settings

### Executive Blueprint Diagram (conceptual)

> Future implementation: a simple **HTML/CSS card grid** — one card per domain (icon + title + one-line goal), with the Executive Dashboard as a full-width banner card on top and the operating centers as a responsive 2-column (desktop) / 1-column (mobile) grid beneath. **No Mermaid; no technical/ERD diagram** — this is a business capability map, not an implementation diagram.

```
                          🏠 Executive Dashboard
                                   │
   ───────────────────────────────────────────────────────────────
   │                                                               │
   📦 Supply Chain                                   📈 Marketing
   📋 Product                                        🏭 Procurement
   🚢 Shipment                                       💰 Cost Analysis
   📚 Knowledge                                      ⚙️ Organization
```

**Reading the diagram:** the **Executive Dashboard** sits on top as the daily entry point; beneath it, the operating centers run the business across **planning, marketing, product, procurement, shipment, cost, knowledge, and organization**. A reader should grasp the entire KMOS architecture from this single picture in **under a minute**.

> **Note on Cost:** in the executive map, cost visibility appears two ways — **Product Cost** lives under *Product & Supplier Center* (per-product truth) and **Cost Analysis** appears as its own tile (cross-product profitability). Section E breaks this out fully as a dedicated **Cost & Profitability Center** domain.

### Four-Layer Model

KMOS is organized in four layers, from business intent down to clickable detail:

```
Layer 1 · Business Blueprint
   ↓
Layer 2 · Business Domains
   ↓
Layer 3 · Modules
   ↓
Layer 4 · Features
```

- **Layer 1 — Business Blueprint:** the whole company system on one page. *"What is KMOS?"* — answered in 60 seconds.
- **Layer 2 — Business Domains:** the 8 capability centers above. Each owns a clear business goal.
- **Layer 3 — Modules:** the actual pages inside each domain (e.g. *Inventory Replenishment*, *Shipment Draft*). This is where the existing module-level detail lives (Section E and the demo cards).
- **Layer 4 — Features:** the specific functions inside a module (e.g. *suggested replenishment quantity*, *carrier booking form*). The deepest level — surfaced only when needed.

**Why it matters:** executives stay at Layers 1–2; operators work at Layer 3; developers build at Layer 4. The presentation lets each audience enter at the right altitude instead of forcing everyone to start at module level.

### Blueprint vs Roadmap (they answer different questions)

| | **Blueprint (Sections D–E)** | **Roadmap (Section G)** |
|---|------------------------------|--------------------------|
| Answers | **"What capabilities does KMOS have?"** | **"What will be delivered first?"** |
| Orientation | **Capability-oriented** | **Implementation-oriented** |
| Organized by | Business domains | Phase 1 / Phase 2 sequencing |
| Audience question | *"What is this system?"* | *"When do I get each part?"* |

They serve **different purposes** and are intentionally separate: the Blueprint defines the destination; the Roadmap defines the order of arrival.

---

## 9. E. Blueprint — Capability Domains (detailed)

> Authority: the Blueprint. This is the **full decomposition** behind the executive map in Section D — the same business idea, expanded so each domain leads with a one-sentence **Business Goal** and lists its modules. Use this when an audience wants the complete capability set.

> **Relationship to Section D:** Section D is the *executive one-pager* (8 domains led by the Executive Dashboard entry point). This Section E is the *full capability breakdown*; it additionally calls out **Cost & Profitability Center** as a standalone domain. Both describe the same system at different altitudes. Domains describe the **full intended capability** and span both Phase 1 and Phase 2; the **Roadmap (Section G)** sequences *which modules get built first*.

### Domain map (8 capability domains)

| # | Capability Domain | Business Goal |
|---|-------------------|---------------|
| 1 | **Supply Chain Planning Center** | Never run out of stock while minimizing inventory. |
| 2 | **Marketing & Demand Center** | Understand and influence customer demand before it becomes inventory risk. |
| 3 | **Product & Supplier Center** | Create a single source of truth for every product and supplier. |
| 4 | **Procurement & Factory Center** | Turn purchasing into a standardized and traceable workflow. |
| 5 | **Logistics & Shipment Center** | Track every shipment from factory to destination. |
| 6 | **Cost & Profitability Center** | Provide complete visibility into product profitability. |
| 7 | **Knowledge & Intelligence Center** | Transform operational experience into company knowledge. |
| 8 | **Organization Control Center** | Standardize all master data and organizational governance. |

### 1. Supply Chain Planning Center
**Business Goal:** Never run out of stock while minimizing inventory.
**Modules (expand):**
- Inventory Replenishment
- Forecast Review
- FC Summary
- AI Forecast Engine
- Stockout Risk Monitoring
- Overstock Risk Monitoring

### 2. Marketing & Demand Center
**Business Goal:** Understand and influence customer demand before it becomes inventory risk.
**Modules (expand):**
- Campaign Center
- Promotion Risk Tracker
- Campaign Calendar
- Amazon Ads Intelligence Center
- Marketing Performance Review

### 3. Product & Supplier Center
**Business Goal:** Create a single source of truth for every product and supplier.
**Modules (expand):**
- SKU Details
- Supplier Management
- Pricing Management
- Product Knowledge

### 4. Procurement & Factory Center
**Business Goal:** Turn purchasing into a standardized and traceable workflow.
**Modules (expand):**
- Request Order
- Request Order Draft
- Purchase Order Overview
- Purchase Order List
- Production Schedule
- Factory Portal

### 5. Logistics & Shipment Center
**Business Goal:** Track every shipment from factory to destination.
**Modules (expand):**
- Weekly Shipping Plan
- Shipment Draft
- Shipment Overview
- On The Way
- World Map
- ETA Monitoring
- Shipment Risk Monitoring

### 6. Cost & Profitability Center
**Business Goal:** Provide complete visibility into product profitability.
**Modules (expand):**
- Cost Analysis
- Product Cost Review
- Margin Analysis
- Cost Trend Monitoring

### 7. Knowledge & Intelligence Center
**Business Goal:** Transform operational experience into company knowledge.
**Modules (expand):**
- KM University
- SOP Center
- SKU Handbook
- AI Assistant
- Internal Training

### 8. Organization Control Center
**Business Goal:** Standardize all master data and organizational governance.
**Modules (expand):**
- Company
- Country
- Marketplace
- Warehouse
- Factory
- People
- Roles & Permissions

---

## 10. F. System Data Flow

> A **high-level architecture overview** — how information moves through the system, shown as **layers** (a conceptual view for executives, **not** a technical implementation diagram).

```
┌─────────────────────────────────────────────────────────────┐
│  EXTERNAL DATA SOURCES                                        │
│  Amazon · Amazon Ads · ERP · Factory · Warehouse · Carrier    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                   │
│  BigQuery · Google Sheets Snapshot · Master Data              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  BUSINESS LOGIC LAYER                                         │
│  Forecast · Inventory · Allocation · Request Order ·          │
│  Purchase Order · Shipment · Export                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                            │
│  Inventory Replenishment · Shipment Center · Factory Order ·  │
│  Forecast Center · Export Center · Dashboard                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  AI LAYER                                                     │
│  Forecast AI · Risk Detection · Decision Support · AI Assistant│
└─────────────────────────────────────────────────────────────┘
```

**Layer-by-layer (plain language):**
- **External Data Sources** — where raw operational data originates (sales channels, ads, ERP, factory, warehouse, carrier).
- **Data Layer** — where that data is consolidated and held (BigQuery warehouse, Google Sheets snapshot, master data).
- **Business Logic Layer** — where the company's rules turn data into decisions (forecast, inventory, allocation, request/PO, shipment, export).
- **Application Layer** — what users actually open and use every day (the modules / pages).
- **AI Layer** — where intelligence sits on top of clean, connected data (forecast AI, risk detection, decision support, assistant).

**Talking point:** data flows **up** the layers (sources → decisions → screens → intelligence); each layer only depends on the one below it — which is exactly what the "One Source of Truth," "API First," and "AI Ready" principles make possible.

---

## 11. G. Phase 1 & Phase 2 Roadmap

> Authority: the Blueprint. **Roadmap follows the Blueprint** — see the Blueprint-vs-Roadmap table in Section D. The Blueprint answered *"what capabilities does KMOS have?"*; the Roadmap answers *"what gets built first?"* — sequencing, not definition. Each item belongs to one of the 8 capability domains (Sections D–E). **No Phase 1 / Phase 2 modules are removed or simplified — they remain exactly as defined; only their position in the presentation hierarchy changed (now after the Blueprint).**

**Phase 1 (operational MVP — what gets built first):**
- Home
- **Site Health Dashboard (站點概況快速總覽)** — one-glance operational control-tower across all sites (see below)
- Campaign Center
- Inventory Replenishment / 貨物庫存表
- Forecast Review / FC Summary
- SKU Data Center
- Warehouse Stock
- Factory Stock
- Request Order / 下單系統
- Request Order Draft
- Purchase Order Overview
- Purchase Order List
- Weekly Shipping Plan
- Shipment Draft
- Shipment Overview
- On The Way / World Map
- Export Center
- KM University
- Company / Site / Warehouse / People Management

**Phase 2 (intelligence, portals, integrations — built next):**
- AI-assisted demand prediction (AI Forecast Engine)
- AI operations assistant
- Campaign calendar / Gantt
- Factory portal
- Overseas warehouse portal
- New Product Monitoring Center
- **Amazon Ads Intelligence Center** — connect Amazon Ads API data with operational planning (see below)
- Cost & Profitability deepening (Margin / Cost Trend)
- BigQuery / data warehouse
- Permission / sensitive-data control

### Phase 1 spotlight — Site Health Dashboard (站點概況快速總覽)

- **Purpose:** give leadership and OP teams a **one-glance operational overview across all sites**.
- **Suggested metrics:** Today's sales · 7-day sales trend · 30-day sales trend · Days of Supply · Stockout Risk · Overstock Risk · In-Transit Status · Forecast Accuracy · Promotion Risk.
- **Dimensions:** Company · Country · Marketplace · Warehouse.
- **Positioning:** should become **one of the most important Home dashboard capabilities** — a **daily operational control-tower view**.

### Phase 2 spotlight — Amazon Ads Intelligence Center

- **Purpose:** connect **Amazon Ads API** data with operational planning (broader than a plain "Amazon / logistics API integration").
- **Potential functions:** Spend · ROAS · ACOS · TACOS · Campaign performance · Keyword performance · Promotion effectiveness · Ads-to-sales correlation.
- **Future direction:** AI Campaign Advisor · AI Budget Suggestion · AI Forecast Adjustment.

---

## 12. H. Full Supply Chain Flow

**Main backbone:**
```
Forecast / FC Summary
   ↓
Inventory Projection
   ↓
Factory Stock Allocation Planning
   ↓
Inventory Replenishment / 貨物庫存表
   ↓
Weekly Shipping Plan
   ↓
Shipment Draft
   ↓
Shipment Overview / On The Way / World Map
   ↓
Receiving / Inventory Update
   ↓
Export Center / Document Generation
   ↓
Cost Analysis / Future AI / BQ
```

**Order branch:**
```
Forecast / Inventory / Factory Stock / On The Way
   ↓
下單系統
   ↓
Request Order Draft
   ↓
Purchase Order Overview
   ↓
Purchase Order List
   ↓
Production Completion
   ↓
available_to_ship = completed_qty − shipped_qty
   ↓
Shipment allocation
```

> The two branches meet at **factory stock / available_to_ship** — orders produce supply; shipments consume it.

---

## 13. I. Shipment Flow

> Authority: Shipment Center Spec (Draft v2.3).

**Simple version:**
```
Inventory Replenishment suggestion
   ↓
Weekly Shipping Plan
   ↓
Manager approval
   ↓
COO approval
   ↓
shipments + shipment_lines created
   ↓
Shipment Draft
   ↓
Confirm & Ship
   ↓
Shipment Documents
   ↓
Manual email to factory / carrier (MVP)
   ↓
In Transit
   ↓
Receiving
   ↓
Completed
```

**Expand Details:**
- **Shipment Draft = `shipments.status = draft`** — an editable preparation view, not a new DB.
- **No `shipment_drafts` table.**
- **Confirm & Ship is the `factory_stock.current_stock` deduction point.**
- **`reserved_stock` increases after approval / shipment creation** (reservation), not at plan/submit time.
- **Shipment Overview / On The Way / World Map read `shipments` + `shipment_lines`** (authoritative).
- **`shipment_events` / `shipment_routes` are future enrichment only** — never replacements.
- **Amazon FBA inventory should usually come from API / live sync**, not manual increase.

---

## 14. J. Order / Request / PO Flow

> Authority: Request Order & PO Spec (Draft v1.3).

**Simple version:**
```
下單系統 calculation
   ↓
One combined Request
   ↓
request_orders / request_order_lines / request_order_line_sources
   ↓
Request Order Draft approval
   ↓
Manager approval
   ↓
COO approval
   ↓
Purchase Order Overview
   ↓
PO document generation
   ↓
Manual email to factory (MVP)
   ↓
PO issued
   ↓
Production completion
   ↓
Purchase Order List
   ↓
Shipment allocation
```

**Expand Details:**
- **`request_orders` owns approval** (submit / approve / reject / cancel).
- **PO does NOT own the approval workflow.**
- **PO `draft`** = formal PO exists but is **not yet issued** to factory (execution preparation, not approval).
- **PO `issued`** = generated / sent / confirmed to factory.
- **`request_order_line_sources` stores the company / site source breakdown** (the request stays SKU-level aggregated in `request_order_lines`).
- **Purchase Order List is a read / view** over `purchase_orders` + `purchase_order_lines` (with `shipment_line_allocations` for shipped relationship).
- **`available_to_ship = completed_qty − shipped_qty`** — never ship uncompleted quantity.

---

## 15. K. Document Automation / Export Direction

> **Documents are derived outputs, not source of truth.**

**MVP DB:**
- `document_templates`
- `generated_documents`

**Document examples:**
- Purchase Order
- Shipment Detail Sheet
- Carrier Booking Form / 托單
- Commercial Invoice
- Packing List
- Commercial Invoice + Packing Combined (e.g. Amazon AGL)
- Customs Declaration
- Certificate of Origin
- MSDS

**Key idea:** **one Shipment Document Dataset can feed multiple document templates** — the template controls layout, the dataset controls values. **Exact token-to-DB mapping belongs to a future Template Mapping / Export Center Spec.**

---

## 16. L. Go To Details / Live Demo

The **System Demo** beat. Cards keep the current structure. **Each card references five things** so a non-technical viewer always knows where a module sits in the big picture:

1. **Blueprint Domain** — which of the 8 capability domains (Sections D–E).
2. **Business Goal** — the domain's one-sentence goal.
3. **Business Problem** — which pain point (Section B) it solves.
4. **Flow** — which flow (Sections H/I/J) it supports.
5. **Demo Talking Points** — the live walkthrough line.

- **Site Health Dashboard (站點概況快速總覽)** — one-glance cross-site overview (sales trend, Days of Supply, stockout/overstock risk, in-transit, forecast accuracy, promotion risk) by company/country/marketplace/warehouse · **Domain:** Executive Dashboard / Supply Chain Planning Center · **Goal:** immediately understand company health; never run out while minimizing inventory · **Problem:** Data Fragmentation + Inventory Accuracy · **Flow:** spans the whole supply backbone · **Talking point:** "Start every day here — it tells you where to look before opening any single page."
- **Amazon Ads Intelligence Center** — Amazon Ads data tied to operations (Spend / ROAS / ACOS / TACOS, campaign & keyword performance, promotion effectiveness, ads-to-sales correlation) · **Domain:** Marketing & Demand Center · **Goal:** understand and influence demand before it becomes inventory risk · **Problem:** Forecasting Limitation · **Flow:** feeds Forecast/Replenishment (Order branch) · **Talking point:** "This is how ad spend feeds forecast and order decisions — and where AI advisor/budget/forecast-adjustment will live."
- **Forecast Review / FC Summary** — forecast accuracy + base/event/target management · **Domain:** Supply Chain Planning Center · **Goal:** never run out while minimizing inventory · **Problem:** Forecasting Limitation + Data Synchronization · **Flow:** Supply backbone (top) · **Talking point:** "This is where demand expectations start."
- **Inventory Replenishment / 貨物庫存表** — site inventory vs coverage; suggested replenishment · **Domain:** Supply Chain Planning Center · **Goal:** never run out while minimizing inventory · **Problem:** Data Synchronization + Inventory Accuracy · **Flow:** Main backbone · **Talking point:** "Suggestions only — nothing is committed until submit."
- **Request Order / 下單系統** — recommended order qty across companies/sites · **Domain:** Procurement & Factory Center · **Goal:** standardized, traceable purchasing · **Problem:** Data Fragmentation · **Flow:** Order branch · **Talking point:** "One push creates one combined Request."
- **Request Order Draft** — request approval (draft → pending → approved) · **Domain:** Procurement & Factory Center · **Goal:** standardized, traceable purchasing · **Problem:** Spreadsheet Risk · **Flow:** Order branch · **Talking point:** "Manager then COO approve — approval lives here, not on the PO."
- **Purchase Order Overview** — formal PO execution + production tracking · **Domain:** Procurement & Factory Center · **Goal:** standardized, traceable purchasing · **Problem:** Excessive Manual Work · **Flow:** Order branch · **Talking point:** "PO draft → issued → in production."
- **Purchase Order List** — raw PO line status (ordered/completed/shipped/remaining) · **Domain:** Procurement & Factory Center · **Goal:** standardized, traceable purchasing · **Problem:** Spreadsheet Risk · **Flow:** Order branch · **Talking point:** "A live view, not a separate database."
- **Weekly Shipping Plan** — planned shipping needs + approval · **Domain:** Logistics & Shipment Center · **Goal:** track every shipment factory→destination · **Problem:** Data Synchronization · **Flow:** Shipment flow · **Talking point:** "Approval spawns shipment drafts."
- **Shipment Draft** — complete formal shipment data (carrier/ETD/ETA/cartons) · **Domain:** Logistics & Shipment Center · **Goal:** track every shipment factory→destination · **Problem:** Excessive Manual Work · **Flow:** Shipment flow · **Talking point:** "`shipments.status = draft`; Confirm & Ship is the real execution moment."
- **Shipment Overview** — tracking / history / search · **Domain:** Logistics & Shipment Center · **Goal:** track every shipment factory→destination · **Problem:** Inventory Accuracy · **Flow:** Shipment flow · **Talking point:** "Reads shipments + shipment_lines, no parallel DB."
- **Factory Stock** — current / reserved / available + movements · **Domain:** Procurement & Factory Center (meets Logistics) · **Goal:** standardized, traceable purchasing · **Problem:** Inventory Accuracy · **Flow:** Both branches meet here · **Talking point:** "Available = current − reserved."
- **Warehouse / Overseas Stock** — overseas/3PL inventory + movements · **Domain:** Logistics & Shipment Center · **Goal:** track every shipment factory→destination · **Problem:** Inventory Accuracy · **Flow:** Main backbone · **Talking point:** "Receiving updates this (except Amazon API-synced)."
- **Export Center** — generate PO / shipment / invoice / packing docs · **Domain:** Logistics & Shipment Center + Document Automation · **Goal:** automate documents from captured records · **Problem:** Excessive Manual Work · **Flow:** End of both flows · **Talking point:** "Documents come from records already captured."
- **SKU Details / SKU Handbook** — SKU master + product knowledge · **Domain:** Product & Supplier Center (SKU Handbook also in Knowledge & Intelligence Center) · **Goal:** single source of truth for every product · **Problem:** Knowledge & Communication Gaps · **Flow:** Foundation · **Talking point:** "Series/category/units-per-carton all live here."
- **KM University** — knowledge base & training · **Domain:** Knowledge & Intelligence Center · **Goal:** turn operational experience into company knowledge · **Problem:** Knowledge & Communication Gaps · **Flow:** Knowledge layer · **Talking point:** "Where new staff and product knowledge connect."
- **Cost Analysis** — product cost / margin / cost-trend visibility · **Domain:** Cost & Profitability Center · **Goal:** complete visibility into product profitability · **Problem:** Data Fragmentation · **Flow:** End of main backbone (Cost / Future AI / BQ) · **Talking point:** "Once the chain is connected, cost and margin become visible automatically."

---

## 17. M. Memo / Discussion Notes (future design)

A memo capability so discussion notes can be captured per section during a demo/review.

**Each memo should support:**
```
note_id
topic
related_section
note_text
priority
status
owner
created_at
updated_at
```

**Suggested `status`:** `open`, `in_review`, `done`, `deferred`.

> **Future design only.** **Do not add DB schema now. Do not implement now.** It can start as **local notes** and later become **DB-backed notes** (see Open Items).

---

## 18. N. Kitchen Mama Operation System Vision

> The **final presentation page** — the long-term vision and the close. This is the "Future Vision" beat the whole story builds toward.

### Evolution

```
        TODAY                    TOMORROW                      FUTURE
   ┌──────────────┐        ┌──────────────────────┐     ┌────────────────────┐
   │ Google Sheets│   →    │ Kitchen Mama          │  →  │ AI Operation       │
   │ (manual,     │        │ Operation System      │     │ Platform           │
   │  scattered)  │        │ (connected, traceable)│     │ (predictive, self- │
   └──────────────┘        └──────────────────────┘     │  optimizing)       │
                                                          └────────────────────┘
```

- **Today — Google Sheets:** scattered, manual, fragile.
- **Tomorrow — Kitchen Mama Operation System:** one connected, traceable, automated operation backbone.
- **Future — AI Operation Platform:** forecasting, risk detection, and decision support running on top of clean, connected data.

### What this means in practice

- **Every department works from the same data.**
- **Every decision is supported by real-time information.**
- **Every process becomes traceable.**
- **Every workflow becomes automated.**
- **Every piece of knowledge belongs to the company.**

### Closing statement

> **Kitchen Mama Operation System is not just an ERP.**
> **It is the operational foundation of the entire company.**

---

## 19. Interaction Design

- **The page opens Blueprint-first, in business-story order:** Executive Summary (§0) → Why (A) → Pain Points (B) → Principles (C) → **Business Blueprint (D)** → Detailed Domains (E) → Data Flow (F) → Roadmap (G) → Flows (H/I/J) → Documents (K) → Demo (L) → Memo (M) → Vision/Close (N). *(For a live executive talk, follow the curated Presenter Notes speaking order in Section 4.)*
- **Cards show a short summary by default.**
- **"Expand Details"** reveals the detailed explanation.
- **Business Blueprint (D) shows domains collapsed;** each domain expands to its module list. Detailed Domains (E) provide the full decomposition.
- **Flow sections (H/I/J) use visual arrows / step cards;** Before/After (A), the Executive Blueprint Diagram (D), Data Flow (F), and End Vision (N) use cascade / card-grid / layered / evolution diagrams.
- **A Memo panel can be opened from any section.**
- **Related sections can cross-link** (Pain Point → the Domain that addresses it; Principle → where it shows up in a flow; Order flow → Shipment flow at `available_to_ship`).
- **Go To Details cards can link to actual system pages in the future.**
- The page should be **presentation-friendly and not too text-heavy** — depth lives behind Expand.

---

## 20. Authority / Source Rules

- **Blueprint** is authority for **vision, pain points, principles, business-blueprint domains, data-flow layers, and roadmap**.
- **Shipment Center Spec** is authority for **shipment flow**.
- **Request Order & PO Spec** is authority for **order / PO flow**.
- **Supporting docs are context only** (`SUPPLY_CHAIN_SYSTEM_FLOW.md`, `SUPPLY_PLANNING_CALCULATION_RULES.md`, `DATABASE_RELATIONSHIP_MAP.md`, `FRONTEND_MODULARIZATION_PHASE3_COMPLETION_AUDIT.md`).
- **If details conflict, the newer domain spec wins.**

> **Frontend architecture note (future implementation only):** if this portal later becomes a real page, it must follow the established convention — a partial under `assets/html/pages/` + mount point + `KM.lifecycle` (per the Phase 3 audit). This is **not** part of the current task.

---

## 21. Non-Goals

Do **not** implement (now):
- actual frontend page
- a route
- `index.html` changes
- DB changes
- memo DB
- API
- BigQuery
- AI assistant
- permission system

---

## 22. Open Items

- final visual design
- whether this becomes a real system page later
- memo persistence method (local vs DB-backed)
- links to actual app pages (deep-link targets)
- role-based visibility (leadership vs team vs developer views)
- future integration with KM University
- reconcile the executive 8-domain map (D, incl. Executive Dashboard) with the detailed 8-domain set (E, incl. Cost & Profitability Center) if a single canonical domain list is later desired

---

**Draft v3.2 — Presentation Portal Spec. Spec only. No code, route, DB, API, or runtime changes are implied by this document. Domain specs remain authoritative.**

**End of Document**
