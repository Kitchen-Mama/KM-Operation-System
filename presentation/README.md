# Kitchen Mama Operation System — Presentation Portal

A **fully standalone** introduction & presentation portal for the Kitchen Mama Operation System.

> **This is NOT the ERP runtime.** It is a separate static documentation/intro site. It does **not** modify `index.html`, `assets/`, Apps Script, the DB/API, or add any route. It can be deleted or moved without affecting the operation system.

---

## How to open

This portal is plain static HTML/CSS/JS with **no build step and no backend**.

- **Easiest:** double-click `presentation/index.html` (opens in your browser via `file://`). Everything — theme, search, expand/collapse, and the LocalStorage memo — works locally.
- **Optional (recommended for sharing):** serve the folder over HTTP, e.g. from the project root:
  - `python -m http.server 8080` → open `http://localhost:8080/presentation/`
  - or any static server / VS Code Live Server.

No internet connection or external library is required (no CDN dependencies).

---

## File structure

```
presentation/
├── index.html          # Lightweight shell: top bar + empty sidebar/content containers
├── css/
│   └── portal.css       # Notion / Linear / Stripe-docs hybrid styling, light + dark
├── js/
│   ├── i18n.js          # Full bilingual content map (zh + en): all UI labels + all section content
│   └── portal.js        # Renders the active language · language toggle · theme · sidebar ·
│                         # search · expand-all · LocalStorage memo CRUD
└── README.md            # This file
```

All content is centralized in `js/i18n.js` as a `window.I18N = { zh, en }` map; `portal.js`
renders the sidebar + all sections from the active language into `index.html`'s containers.

---

## Page structure

| # | Section | Content |
|---|---------|---------|
| A | **System Vision** | What problem the system solves · Before / After comparison · the connected chain |
| B | **System Blueprint** | Phase 1 (incl. ★ Site Health Dashboard) · Phase 2 (incl. ★ Amazon Ads Intelligence Center) · spotlights |
| C | **Full Supply Chain Flow** | Main backbone + order branch diagrams (Forecast → … → Shipment → Receiving) |
| D | **Shipment Flow** | Weekly Shipping Plan → Shipment Draft → Confirm & Ship → Overview → On The Way → Receiving, with DB created / status changes / documents annotated |
| E | **Request Order Flow** | 下單系統 → Request Draft → approval → PO Overview → PO List → Production → Shipment, with the three-layer request + PO table relationships |
| F | **Document Automation** | Document types · one Shipment Document Dataset → many templates · `document_templates` / `generated_documents` |
| G | **Go To Details** | 18 module demo cards (What / Why / Which flow / Demo talking point) |
| H | **Discussion Memo** | Add / edit / delete notes; saved in browser LocalStorage |
| — | **Sources & Authority** | Which doc is authoritative for each topic |

---

## Main features

- **繁體中文 / English language toggle** — button in the top bar. **Default: Traditional Chinese.** All UI labels and all presentation content switch language; preference saved to LocalStorage and restored on reload. (Technical terms — DB table names, file names, API / BigQuery / SKU / PO / Shipment / Request Order, status enum values — intentionally stay in Latin even in Chinese mode.) User-created memo text is never auto-translated; only system-provided memo labels (category / priority / status) localize.
- **Sidebar navigation** + **anchor navigation** (smooth scroll, active-section highlight on scroll).
- **Search** — filters sections and cards live; `Esc` clears.
- **Dark / Light mode** — toggle in the top bar; preference saved to LocalStorage; respects OS preference on first load.
- **Expand / collapse** — per-panel `▸` disclosures + a global Expand/Collapse-all button.
- **Discussion Memo** — full CRUD (Title, Category, Priority, Status, Note, Created At, Updated At), status filter, and **Export JSON**; persisted in LocalStorage (no DB).
- **Responsive** — sidebar collapses on small screens.
- **3-minute read** at a glance; **30-minute read** when panels are expanded.

---

## Content provenance (which doc each part comes from)

**From `docs/planning/KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md`:**
- A · System Vision (all-in-one positioning, Before/After).
- B · System Blueprint — Phase 1 & Phase 2 module lists, **Site Health Dashboard**, **Amazon Ads Intelligence Center**, company/factory context.
- C · Full Supply Chain Flow (main backbone + order branch).

**From `docs/planning/SHIPMENT_CENTER_SPEC.md` (v2.3):**
- D · Shipment Flow (Weekly Shipping Plan → Shipment Draft → Confirm & Ship → Overview → On The Way → Receiving).
- Shipment Draft = `shipments.status = draft` (no `shipment_drafts` table); reservation/deduction timing (Confirm & Ship is the deduction point); `shipment_events` / `shipment_routes` as enrichment only; Amazon FBA via API/live sync.
- F · Document Automation — shipment document types + **one Shipment Document Dataset → many templates**.

**From `docs/planning/REQUEST_ORDER_AND_PO_SPEC.md` (v1.3):**
- E · Request Order Flow (下單系統 → Request Draft → approval → PO Overview → PO List → Production → Shipment).
- Three-layer request structure (`request_orders` / `request_order_lines` / `request_order_line_sources`); `purchase_orders` / `purchase_order_lines`; PO `draft` / `issued`; `available_to_ship = completed_qty − shipped_qty`; PO List as a read/view.
- F · Document Automation — PO document generation node.

**From `docs/presentation/KITCHEN_MAMA_SYSTEM_PRESENTATION_PORTAL_SPEC.md`:**
- Overall portal structure (tabs A–I), design principles, the Go To Details demo-card format, and the Discussion Memo concept (fields + statuses).

> No flows, DBs, or architecture were invented. Where details conflict, the newer domain spec wins.

---

## Future / extensible items

- Turn this into a real in-app presentation page (would follow the app convention: partial under `assets/html/pages/` + mount point + `KM.lifecycle`).
- Deep-link "Go To Details" cards to actual system pages.
- Role-based views (leadership vs team vs developer).
- Memo persistence beyond LocalStorage (export already provided; future DB-backed option).
- Integrate with KM University.
- Auto-generate content from the planning markdown (single-source sync) instead of hand-mirrored HTML.

---

## Confirmation

- ✅ No ERP runtime modified.
- ✅ `index.html` (app shell) not touched.
- ✅ `assets/` not touched.
- ✅ No route added.
- ✅ Presentation Portal is a completely independent static site under `presentation/`.
