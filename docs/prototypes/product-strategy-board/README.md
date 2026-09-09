# Product Strategy Board — non-runtime prototype

**This is not part of the application.** It is a static illustration of the Product Strategy Board's
information architecture and user flow, produced in round `PRODUCT-STRATEGY-BOARD-P0-R1`.

- **Design authority:** [`docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md`](../../planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md)
  — §22 specifies this prototype; §§2–15 are what it illustrates.
- **How to open:** double-click `index.html`, or open its local file path in a browser. No server,
  no build step, no install.

## What it is

| | |
|---|---|
| **Is** | The screens, the element types, the resolution states and the refusals — as decided in the design freeze |
| **Is not** | Runtime. Not a page of the app, not a drag engine, not CRUD, not a data layer, and not a preview of the final visual design |

## Hard constraints, and how each is met

| Constraint | How |
|---|---|
| Local mock data only | One `MOCK` object literal at the top of `prototype.js`. Every SKU, price, campaign and note is **invented** |
| No network request | No `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `EventSource`, no dynamic `import()`, and no `<script src>` / `<link href>` to any remote origin. The only two subresources are the sibling `prototype.css` and `prototype.js` |
| No production DB read | No `KM.DB`, no Apps Script action invoked, no Apps Script URL |
| Not loaded by the app | Nothing in the app's `index.html` or under `assets/**` references `docs/prototypes/**`. It is reachable only by opening it directly |
| No production frontend change | Zero bytes changed under `assets/**` or in the app's `index.html` |
| Not deployed | `docs/**` is not part of any deployment or bundle |
| No new dependency | Plain HTML + CSS + vanilla JS. No CDN, no library, no remote font, no build tool |
| No `localStorage` for real data | `localStorage` / `sessionStorage` / IndexedDB are **never called**. State lives in one JS object for the page's lifetime and is gone on reload |

## The fifteen things it demonstrates

1. The **Product Strategy** page shell — a top-level surface, not a *Pricing Center* child (**D-1**).
2. **Board selector** with board type and version.
3. **Series / Company / Country / Marketplace** filters.
4. **Left toolbar**: Text · SKU · Regional · Price Band · Matrix · **Deal Plan** (enabled, **D-4**);
   Chart / Group / Connector marked deferred.
5. **Central board** with placed, selectable element cards on a fixed grid.
6. **Right properties panel** — source, mode, notes, geometry, `author_type`, `version`.
7. **`SKU_CARD`** at master-SKU grain, with the three price levels.
8. **`REGIONAL_SKU_CARD`** at `company|country|marketplace|sku` grain, with `marketplace_sku_status`
   labelled as coming from `marketplace_skus` (the regional table declares that it carries no status).
9. **`TEXT_NOTE`**.
10. **`DEAL_PLAN`** with a permanent, non-dismissible **`PROPOSAL ONLY`** marker, `proposed_*` fields,
    and the official campaign line shown as a **separate** section (**D-4**).
11. **`SERIES_PRICE_BAND`** — normal marker, official deal marker, proposal marker, entry/core/premium
    positions, an **overlap**, two **gaps each labelled with the threshold that produced them**, and a
    **cannibalisation warning marked proposal-driven**.
12. **One track per currency**, each with its own axis and domain, plus
    `MIXED_CURRENCY_COMPARISON_REFUSED` stated on the element (**D-3**). No conversion, no shared axis.
13. **`LIVE_REFERENCE` vs `FROZEN_SNAPSHOT`** — badges, `captured_at`, `value_provenance`, and the
    refresh-diff idea (the snapshot always renders; a re-freeze is explicit).
14. **`SOURCE_MISSING`** — a band member listed with its reason and **plotted nowhere** (**D-2**, never
    back-filled from `sku_details.selling_price`), and an absent official `promo_price` rendered as
    missing rather than as "no deal".
15. **Save checkpoint and the revision concept** (**D-7**) — the button, the revision count, and a
    revision list with `revision_type` and who caused it.

Also visible throughout: `owner` rendered with a **provenance** qualifier and an explicit statement
that anyone in the deployment can edit the board — no "Private", no "Secure", no lock icon (**D-9**);
and "current selling price" (**D-6**) and margin (**D-8**) absent with nothing standing in for them.

## Interactions it does implement

Deliberately few, and enough to walk the flow:

- **Select an element** — the properties panel follows the selection.
- **Live ⇄ Snapshot** on the selected element — the badge and `captured_at` change, and switching to
  Snapshot appends a `FREEZE_SNAPSHOT` revision (the revision is written *before* the change, §8.6).
- **History** drawer toggle.
- **Save checkpoint** — appends a `SAVE_CHECKPOINT` row to the in-memory revision list and bumps the
  displayed board version.
- **Series** switch — re-renders the price band, its arithmetic and its refusals.

**Drag, resize, pan, zoom, real CRUD and persistence are out of scope.** They belong to the Canvas Core
(design freeze §11.5), which P1 extracts from the existing `supplychain.js` engine — *extracts*, not
copies, and this prototype neither imports nor forks it. Tools and the board selector open a short
explanatory dialog rather than pretending to work.

## Files

| File | Lines | Purpose |
|---|---|---|
| `index.html` | 185 | Page shell, top bar, history drawer, toolbar rail, board container, properties container |
| `prototype.css` | 401 | All styling. No `@import`, no remote font |
| `prototype.js` | 992 | Mock data, price-band arithmetic, element renderers, properties panel, revisions |
| `README.md` | this file | What it is, what it is not, and how each constraint is met |
