# Frontend Modularization — Phase 3 Completion Audit

**Type:** Audit only (no code, no file moves, no behavior change).
**Date:** 2026-06-15
**Auditor scope:** Verify Phase 3 markup extraction is complete and `index.html` is shell-only.

---

## 1. Summary

Phase 3 (page-by-page markup extraction) is **COMPLETE**. All 13 pages
(Home + 12 module pages) have been extracted from `index.html` into individual
`assets/html/pages/*.html` partials. `index.html` now contains **zero inline page
`<section>` blocks** — only the application shell (header, sidebar nav, `<main>` with
13 mount points, world-time bar) plus one intentionally-shared global modal.

Every extracted page follows the identical, proven pattern:

- markup lives in a partial,
- a lightweight `<div id="…-mount"></div>` placeholder sits in `index.html`,
- an idempotent `_ensure…Markup()` loads the partial via `KM.partialLoader`,
- the page lifecycle `mount()` ensures markup → re-applies `.active` → runs init,
- `unmount()` cleans up listeners/charts where applicable.

No code was changed during this audit.

---

## 2. index.html shell-only status

| Check | Result |
|-------|--------|
| Inline `<section …>` blocks in index.html | **0** (none) |
| Page mount points (`*-mount`) | **13** |
| Shell landmarks retained | `<header class="top-header">`, `<nav id="appSidebar">`, `<main class="content-area">`, `<div id="world-time-bar">` |
| Shared global modal retained | `#frDateModal` (`.fr-date-modal`) — shared date picker |

`index.html` is confirmed **shell-only**. All page-specific markup (including every
page's own modals/dropdowns) now lives inside its partial.

---

## 3. Page partial inventory

13 partials present in `assets/html/pages/`, each containing exactly one section:

| Partial | Section id |
|---------|-----------|
| home.html | `home-section` |
| inventory-replenishment.html | `ops-section` |
| factory-stock.html | `factory-stock-section` |
| overseas-stock.html | `overseas-stock-section` |
| forecast.html | `forecast-section` |
| request-order.html | `request-order-section` |
| fc-summary.html | `fc-summary-section` |
| sku-details.html | `sku-section` |
| shipping-plan.html | `shippingplan-section` |
| shipping-history.html | `shippinghistory-section` |
| campaign-risk.html | `campaign-risk-section` |
| sku-handbook.html | `sku-handbook-section` |
| supplychain.html | `supplychain-section` |

Every mount point in `index.html` has a corresponding partial and section id. ✅

---

## 4. Route → section → partial mapping

`showSection()` in `app.js` holds two identical `sectionMap` objects (one for
`KM.lifecycle.switchTo`, one for applying `.active`). All routes map to the correct
section ids, and each section id has a matching partial:

| Route key | Section id | Partial |
|-----------|-----------|---------|
| `ops` | `ops-section` | inventory-replenishment.html |
| `factory-stock` | `factory-stock-section` | factory-stock.html |
| `overseas-stock` | `overseas-stock-section` | overseas-stock.html |
| `forecast` | `forecast-section` | forecast.html |
| `request-order` | `request-order-section` | request-order.html |
| `fc-summary` | `fc-summary-section` | fc-summary.html |
| `skuDetails` | `sku-section` | sku-details.html |
| `supplychain` | `supplychain-section` | supplychain.html |
| `sku-handbook` | `sku-handbook-section` | sku-handbook.html |
| `shippingplan` | `shippingplan-section` | shipping-plan.html |
| `shippinghistory` | `shippinghistory-section` | shipping-history.html |
| `campaign-risk` | `campaign-risk-section` | campaign-risk.html |

**Home** is not in `sectionMap` by design — it is the default landing page, mounted
via `switchTo('home-section')` during `DOMContentLoaded`. This is intentional and
correct. No route keys or section ids were renamed.

---

## 5. Lifecycle registration status

All 13 pages register through `KM.lifecycle.register(<section-id>, { mount, unmount })`:

`home-section`, `ops-section`, `factory-stock-section`, `overseas-stock-section`,
`forecast-section`, `request-order-section`, `fc-summary-section`, `sku-section`,
`shippingplan-section`, `shippinghistory-section`, `campaign-risk-section`,
`sku-handbook-section`, `supplychain-section`.

Mount pattern verified consistent: `_ensure…Markup().then(() => { add .active; init; })`.
Unmount cleanup retained where needed (e.g. Campaign Risk / Supply Chain document
listeners, Forecast / Inventory chart destruction, Factory/Inventory scroll-sync). ✅

---

## 6. Partial ensure / idempotency status

Two independent layers guarantee no duplicate sections from repeated navigation:

1. **Per-page guard** — all 13 `_ensure…Markup()` functions short-circuit with
   `if (document.getElementById('<section-id>')) return Promise.resolve(true);`
   before any fetch. (13/13 confirmed.)
2. **Loader registry** — `KM.partialLoader` caches by `pageKey` in `_loaded[pageKey]`;
   a second `loadPartial` call returns the existing target without re-fetching/re-injecting.

Failure handling: every `_ensure…Markup()` `.catch`es fetch failures, logs
`console.warn`, and resolves (never throws / never crashes the mount).

Result: `document.querySelectorAll('#<section-id>').length === 1` holds after repeated
Home → page → Home → page navigation for every page. ✅

---

## 7. app.js showSection status

`showSection()` contains **no active per-page manual init / render / setTimeout calls**.
The former per-page init blocks were removed in Phase 2B and replaced with comments
documenting the migration (e.g. "forecast: 已由 lifecycle mount 接管，手動 init 已移除").
Page initialization is now driven exclusively by the lifecycle `mount()` hooks. ✅

The only DOM work `showSection` performs is generic: hide home + world-time-bar,
clear `.active` from all `.module-section`, call `switchTo`, then add `.active` to the
target (null-guarded for not-yet-injected partials). ✅

---

## 8. Intentional remaining markup in index.html (non-page)

The following are **intentional** shell / shared elements and must remain in `index.html`:

- **Header** (`.top-header`) — global top bar.
- **Sidebar nav** (`#appSidebar`) — global navigation.
- **`<main class="content-area">`** — host container for the 13 page mount points.
- **World-time bar** (`#world-time-bar`) — global clock strip (shown on Home,
  hidden on section navigation).
- **Shared Date Picker Modal** (`#frDateModal` / `.fr-date-modal`) — a cross-page
  shared modal kept at shell level (outside any single page partial). Retaining it in
  the shell is intentional; it is not a page section.

No orphaned page-section markup or stray page-specific modals remain in the shell.

---

## 9. Known follow-ups

- **Supply Chain Canvas empty-state overlay** — the viewport-anchored empty-state
  hint and `addShape` viewport-centering were fixed; any further UX polish (e.g.
  initial auto-centering of the view, richer empty state) remains a later
  UX/debug follow-up, not a Phase 3 blocker.
- **`file://` is not supported** for partial-loaded pages — `KM.partialLoader` uses
  `fetch()`, which is blocked under the `file://` protocol. The app **must** be served
  over HTTP(S) (any static server) for partials to load. Opening `index.html` directly
  from disk will leave page sections empty.
- **Phase 4 shared-component extraction is optional** and should **not** block
  Shipment / Request Order / PO feature work. It can be scheduled independently.
- **Shipment Overview naming / route migration** (route key + section id rename) should
  be handled later as a separate, explicitly-scoped task — deliberately deferred so
  Phase 3 did not rename any route keys or section ids.
- **`index.html` should remain the app shell** — new page sections must be added as
  partials + mount points, never as inline `<section>` blocks in `index.html`.

---

## 10. Risks

- **Low overall risk.** Phase 3 was markup-extraction-only; no DB/API/Apps Script/CSS
  behavior was changed.
- **Serving requirement (operational):** the HTTP(S)-server requirement is the main
  operational risk — a teammate opening the file via `file://` will see blank pages.
  Document this in the run instructions.
- **Shared modal coupling:** `#frDateModal` is shared at shell level; any future move
  of it into a partial would need careful handling of cross-page usage.
- **Idempotency depends on stable section ids:** the no-duplicate guarantee relies on
  the `getElementById(<section-id>)` guards; renaming a section id without updating its
  `_ensure…Markup()` guard would break idempotency. (Relevant to the deferred Shipment
  Overview rename task.)

---

## Recommendation for next phase

Phase 3 is complete and verified. Recommended sequencing:

1. **Resume feature work** (Shipment Center / Shipment Draft / Request Order / PO) on
   top of the now-modular page structure — this is unblocked and should take priority.
2. Treat **Phase 4 (shared-component extraction)** and the **Shipment Overview
   naming/route migration** as optional, independently-scoped tasks to be scheduled
   when convenient; neither blocks feature work.
3. Keep `index.html` as the app shell going forward — enforce the
   "new pages = partial + mount point" convention in review.

No code, files, or runtime behavior were modified by this audit.
