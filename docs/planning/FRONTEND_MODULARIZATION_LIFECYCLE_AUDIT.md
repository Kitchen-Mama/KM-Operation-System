# Frontend Modularization — Lifecycle & Manual-Init Audit (Phase 2A)

**Status:** 🟡 Audit only — NO code changes, NO file moves, NO behavior changes
**Last Updated:** 2026-06-12
**Maintained By:** Development Team
**Related:** [`FRONTEND_MODULARIZATION_PLAN.md`](./FRONTEND_MODULARIZATION_PLAN.md)

> Factual audit of page lifecycle registration vs. manual init. All findings cite `file:line`. No code was modified.

---

## 1. Current Lifecycle Flow

- **Manager:** `assets/js/core/lifecycle.js` — `KM.lifecycle.register(pageName, {mount, unmount})`, `switchTo(pageName)` (unmounts current, mounts target, wraps both in try/catch — lifecycle.js:44–61), `getCurrentPage`, `unregister`.
- **Router:** `assets/js/app.js` `showSection(section)` (app.js:47):
  - hides `#home-section` (null-guarded, app.js:49–50) + `#world-time-bar`, clears `.module-section.active`;
  - calls `KM.lifecycle.switchTo(targetSectionId)` (app.js:54–72);
  - **then ALSO runs per-page manual `setTimeout(init*)` blocks** (app.js:112–176).
- **Startup:** `DOMContentLoaded` (app.js:377) now runs `switchTo('home-section')` first, then guarded `renderRecords/initWorldTimes/renderHomepage/initSkuUnifiedScroll` (Phase-1 fix).
- **Home:** partial-loaded via `KM.partialLoader` inside Home `mount` → `_ensureHomeMarkup()` (home.js:112).

**Core issue:** for several pages, **both** `switchTo` (→ lifecycle `mount`) **and** a `setTimeout(init*)` in `showSection` fire on every navigation → **double invocation**.

---

## 2. Pages Already Using `KM.lifecycle` Correctly

All 12 registered sections (registration sites):

| Page | Section id | Register | Mount calls |
|------|-----------|----------|-------------|
| Home | `home-section` | home.js:236 | `_ensureHomeMarkup().then(renderHomepage)` |
| Inventory Replenishment | `ops-section` | inventory-replenishment.js:2349 | bind + populate + `renderReplenishment()` |
| Factory Stock | `factory-stock-section` | factory-stock.js:858 | `initFactoryStockPage()` |
| Overseas Stock | `overseas-stock-section` | overseas-stock.js:1121 | `initOverseasStockPage()` |
| FC Summary | `fc-summary-section` | fc-summary.js:2221 | `initFcSummaryPage()` |
| Forecast Review | `forecast-section` | forecast.js:1880 | `initForecastReviewPage()` |
| Request Order | `request-order-section` | request-order.js:1191 | `initRequestOrderSection()` |
| SKU Details | `sku-section` | sku-details.js:333 | `renderSkuDetailsTable()` + scroll |
| Shipping Plan | `shippingplan-section` | shipping-plan.js:547 | `renderShippingPlan()` |
| Shipping History | `shippinghistory-section` | shipping-history.js:703 | `initShippingHistoryPage()` |
| Supply Chain Canvas | `supplychain-section` | supplychain.js:1561 | `CanvasController.init()` |
| SKU Handbook | `sku-handbook-section` | sku-handbook.js:812 | `initSkuHandbook()` |

**Clean (lifecycle is the ONLY init; no duplicate manual init in `showSection`):**
- **Factory Stock** and **Inventory Replenishment (ops)** — `showSection` explicitly comments the manual init was removed (app.js:133, app.js:148). These are the reference pattern.
- **Home** — startup uses `switchTo`; logo uses `showHome()` (home.js:95) which also ensures markup.
- **Overseas Stock** — only lifecycle mount (no `showSection` manual init block exists for it).

---

## 3. Pages Using Manual Init / setTimeout / Direct Render from `app.js`

`showSection` (app.js) still contains per-page manual init that **duplicates** the lifecycle mount:

| Page | `showSection` manual init | Also has lifecycle mount? | Result |
|------|---------------------------|---------------------------|--------|
| Forecast Review | app.js:112–118 `setTimeout(initForecastReviewPage)` | Yes (forecast.js:1880) | **Double init** (guarded by `root._forecastInitialized`, forecast.js:31 → 2nd call no-op) |
| Request Order | app.js:119–125 `setTimeout(initRequestOrderSection)` | Yes (request-order.js:1191) | **Double init** |
| FC Summary | app.js:126–132 `setTimeout(initFcSummaryPage)` | Yes (fc-summary.js:2221) | **Double init** |
| SKU Details | app.js:134–147 `renderSkuDetailsTable()` + `setTimeout(initSkuScroll/…)` | Yes (sku-details.js:333) | **Double init** (mount does the same) |
| Supply Chain | app.js:149–155 `setTimeout(CanvasController.init)` | Yes (supplychain.js:1561) | **Double init** (see §5 leak) |
| SKU Handbook | app.js:156–162 `setTimeout(initSkuHandbook)` | Yes (sku-handbook.js:812) | **Double init** |
| Shipping History | app.js:163–169 `setTimeout(initShippingHistoryPage, 200)` | Yes (shipping-history.js:703) | **Double init** |
| **Promotion Risk Tracker** | app.js:170–176 `setTimeout(renderCampaignRiskTracker)` | **NO** (campaign-risk.js has no `register`) | **Manual-only — no lifecycle** |

> **Promotion Risk Tracker / campaign-risk.js is the only page with no `KM.lifecycle.register`.** Its only entry points are `window.renderCampaignRiskTracker` (campaign-risk.js:1016), called from `showSection` (app.js:170) and a `DOMContentLoaded` handler (campaign-risk.js:1009). It therefore has **no mount/unmount** at all.

---

## 4. Pages with Missing or Weak `unmount` Behavior

| Page | unmount | Assessment |
|------|---------|-----------|
| Promotion Risk Tracker | none (no registration) | **Missing** — no cleanup of its document listeners (§5) |
| Supply Chain Canvas | empty body (supplychain.js:1568–1570) | **Weak** — binds many document listeners in `init` but never removes them (§5) |
| FC Summary | empty body (fc-summary.js:2228–2230) | Weak — relies on module-level `document` click (fc-summary.js:467) bound once; acceptable but not explicit |
| Request Order | empty body (request-order.js:1198–1200) | Weak, but its dropdown `document` click is stored & removed inside init (request-order.js:84) → OK in practice |
| Shipping History | empty body (shipping-history.js:710–712) | Weak — `_shOutside` document click (shipping-history.js:665) cleanup not confirmed |
| Forecast Review | strong (forecast.js:1887+) | **Good** — destroys charts, resets `_forecastInitialized`; ESC `keydown` (forecast.js:84) not removed |
| SKU Details | empty body (sku-details.js:341) | Weak; module-level document click (sku-details.js:310) bound once → OK |
| SKU Handbook | `closeSkuDetailModal()` (sku-handbook.js:814) | Partial — closes modal, but document click/keydown (sku-handbook.js:694,702) cleanup not confirmed |
| Shipping Plan | empty body, documented "nothing to clean" (shipping-plan.js:552–556) | OK (no listeners/charts) |
| Factory Stock | strong (factory-stock.js:874+) | **Good** — removes `root._clickHandler`, detaches scroll sync |
| Overseas Stock | strong (overseas-stock.js:1133+) | **Good** — removes click handler, scroll sync, closes modals |
| Inventory Replenishment | strong (inventory-replenishment.js:2356+) | **Good** — removes expand panels, scroll sync |

---

## 5. Pages with Document-Level Event Listeners That May Leak

`document.addEventListener` sites and whether a matching removal exists:

| Page | Listener(s) | Removed? | Leak risk |
|------|-------------|----------|-----------|
| **Supply Chain Canvas** | `mousemove`/`mouseup` (supplychain.js:35,36,1020,1024,1285,1289), `keydown` (109) | **No removal found**; unmount empty; `CanvasController.init()` re-runs each mount | **HIGH** — accumulates document listeners every visit |
| **Promotion Risk Tracker** | `click` (campaign-risk.js:334), `keydown` (340) | **No removal**; no unmount | **HIGH** — re-bound on each re-render/visit |
| SKU Handbook | `click` (sku-handbook.js:694), `keydown` (702) | Not confirmed removed | **MEDIUM** — verify if re-bound per mount |
| Shipping History | `click _shOutside` (shipping-history.js:665) | Not confirmed removed | **MEDIUM** |
| Forecast Review | `keydown` ESC (forecast.js:84) | Not removed; but init guarded by `_forecastInitialized` (bound once) | LOW |
| Forecast Review | dropdown `click` (forecast.js:189) | Removed (forecast.js:186) | OK |
| Overseas Stock | `click` (overseas-stock.js:69), date `keydown` (918) | Removed (62,1133); keydown bound once via `_ovsDatePickerBound` | OK |
| Factory Stock | `click` (103), `_fmvOutside` (532), date `keydown` (680) | Removed (36,100,874); others guarded once | OK |
| Request Order | dropdown `click` (request-order.js:87) | Removed (84) | OK |
| SKU Details | `click` (sku-details.js:310) | Module-level, bound once | OK |
| FC Summary | `click` (fc-summary.js:467) | Module-level, bound once | OK |
| Inventory Replenishment | `DOMContentLoaded` (227,366) | Module-level, one-time | OK |

---

## 6. Pages with DOM Assumptions That Break Partial Loading

Once a page's markup is partial-loaded (Phase 3), its section DOM is **absent at script-load / `DOMContentLoaded`**. Hazards:

- **`DOMContentLoaded` handlers that assume their section exists at load** — will run before any partial is injected:
  - campaign-risk.js:1009, fc-summary.js:543 and fc-summary.js:1113, inventory-replenishment.js:227 and :366.
  - These rely on inline markup existing at load. They must move into `mount` (or be made markup-agnostic) before those pages are partial-loaded.
- **Promotion Risk Tracker** has no `mount`; all rendering is triggered externally → it has no safe hook to "ensure markup, then render" once its markup is extracted. **Blocks partial-loading until it gets a lifecycle.**
- Pages whose `mount`/`init*` already do **all** DOM work lazily (Factory Stock, Overseas Stock, Inventory Replenishment, Forecast, Request Order, Shipping Plan/History, SKU Handbook, FC Summary mount) are **partial-load-ready in structure** — provided their markup is injected before `mount` runs (the Home pattern, home.js:112).
- Supply Chain Canvas `init` measures/positions DOM nodes and binds document drag listeners; it must run **after** markup injection and **clean up** on unmount before partial-loading is safe.

---

## 7. Recommended Phase 2B Migration Order

Standardize all pages onto `KM.lifecycle` (single mount mechanism) and remove duplicate manual inits. Order by risk (lowest first):

1. **Shipping History** — remove app.js:163–169; rely on existing mount (shipping-history.js:703).
2. **SKU Handbook** — remove app.js:156–162; rely on mount (sku-handbook.js:812).
3. **Request Order** — remove app.js:119–125; rely on mount (request-order.js:1191).
4. **FC Summary** — remove app.js:126–132; rely on mount (fc-summary.js:2221).
5. **SKU Details** — remove app.js:134–147; rely on mount (sku-details.js:333).
6. **Forecast Review** — remove app.js:112–118; rely on mount (forecast.js:1880).
7. **Promotion Risk Tracker** — **add** `KM.lifecycle.register('campaign-risk-section', {mount, unmount})`; mount → `renderCampaignRiskTracker()`; unmount → remove its document click/keydown listeners; then remove app.js:170–176.
8. **Supply Chain Canvas (highest risk)** — remove app.js:149–155; add real `unmount` that removes all document drag/keydown listeners (supplychain.js:35,36,109,1020,1024,1285,1289); make `CanvasController.init()` idempotent (avoid re-binding).

> Items 1–6 are mechanical (delete duplicate manual init). Item 7 adds a missing lifecycle. Item 8 also fixes a real leak.

---

## 8. Exact Code-Change Plan for Phase 2B (DO NOT IMPLEMENT)

**app.js (`showSection`):** delete the now-redundant manual blocks once each page is verified via its mount:
- Remove app.js:112–118 (forecast), 119–125 (request-order), 126–132 (fc-summary), 134–147 (skuDetails), 149–155 (supplychain), 156–162 (sku-handbook), 163–169 (shippinghistory), 170–176 (campaign-risk — only after campaign-risk registers a lifecycle).
- Keep the central `switchTo(targetSectionId)` (app.js:54–72) as the single trigger.
- Do **not** alter route keys or `sectionMap` entries.

**campaign-risk.js:** add at end:
- `KM.lifecycle.register('campaign-risk-section', { mount(){ renderCampaignRiskTracker(); }, unmount(){ /* remove document click(334)/keydown(340) via stored refs */ } })`.
- Refactor the two `document.addEventListener` (334,340) to store handler references so unmount can remove them; ensure binding is idempotent (bind once).

**supplychain.js:** 
- Store references for document `mousemove`/`mouseup`/`keydown` handlers; add `unmount` that removes them; guard `CanvasController.init()` so repeat mounts don't stack listeners.

**sku-handbook.js / shipping-history.js:** verify and, if needed, store + remove their document listeners in `unmount` (sku-handbook.js:694,702; shipping-history.js:665).

**Per-page sequencing:** one page per commit; verify visual + behavioral parity (and no duplicate init / no listener growth) before the next.

> No markup is moved in Phase 2B. (Markup extraction is Phase 3.)

---

## 9. Risks

- **Double-init removal regressions:** a page might have *relied* on the `setTimeout` delay (e.g., layout/scroll measured after paint). Removing it could change timing. Mitigate: keep any needed `setTimeout` **inside** the page's `mount`, not in `showSection`.
- **Supply Chain listener cleanup** could over-remove if handlers are shared; must store exact bound references.
- **Promotion Risk Tracker** has a `DOMContentLoaded` render (campaign-risk.js:1009) — adding a lifecycle must not double-render or conflict with that startup call.
- **Idempotency varies:** only Forecast clearly guards re-init (`_forecastInitialized`); others must be confirmed idempotent before relying solely on mount.
- **Partial-loading dependency:** §6 `DOMContentLoaded` handlers must be migrated into `mount` before Phase 3, or extracted markup will be missing when they run.

---

## 10. Acceptance Criteria for Phase 2B

- Every page mounts via `KM.lifecycle` only; **no page is initialized from a `setTimeout(init*)` in `showSection`**.
- `app.js showSection` contains no per-page manual init blocks (only `switchTo` + nav/active-state updates).
- **Promotion Risk Tracker registers a lifecycle** with working mount + unmount.
- Navigating A → B → A repeatedly does **not** grow `document` listener count (verify Supply Chain, Promotion Risk Tracker, SKU Handbook, Shipping History).
- Each migrated page is **visually + behaviorally identical** to before.
- No route key / section id renames; no markup moved.
- No console errors; no DB / API / Apps Script / CSS changes.

---

**Audit only — no code, files, or behavior changed by this document.**

**End of Document**
