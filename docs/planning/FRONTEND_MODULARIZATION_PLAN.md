# Frontend Modularization Plan — Kitchen Mama Operation System

**Status:** 🟡 Draft v1 — Architecture / Plan only (NO code, NO file moves, NO behavior changes)
**Last Updated:** 2026-06-12
**Maintained By:** Development Team
**Related:** `assets/specs/active/project-current-state.md`, `assets/specs/active/SYSTEM_ROADMAP.md`, [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md)

> **Spec only.** This document defines a safe, phased plan to reduce `index.html` size and prepare future modules. It does **not** modify `index.html`, JS, CSS, Apps Script, or DB/API. No file is moved and no UI behavior changes as a result of this document.

---

## 1. Current State

- **`index.html` ≈ 3,079 lines**, containing **12 `.module-section` page blocks** inline (the full HTML markup of every page).
- **JS is already modularized** per concern and loaded via 26 `<script src>` tags:
  - **Core:** `assets/js/core/namespace.js`, `core/lifecycle.js`, `core/state.js`
  - **Utils:** `utils/forecast-engine.js`, `utils/i18n.js`, `utils/sku-overrides.js`, `utils/data.js`, `utils/demo-shared-data.js`, `utils/scroll-sync.js`
  - **API:** `assets/js/api/operation-system-db-api.js` (single DB adapter — `window.KM.DB.*`)
  - **Pages:** `pages/home.js`, `inventory-replenishment.js`, `factory-stock.js`, `overseas-stock.js`, `fc-summary.js`, `forecast.js`, `request-order.js`, `sku-details.js`, `shipping-plan.js`, `shipping-history.js`, `supplychain.js`, `sku-handbook.js`, `campaign-risk.js`
  - **i18n / app:** `i18n/sku-handbook.js`, `app.js`
- **CSS is already modularized** via 15 `<link rel="stylesheet">` (base/components/layout + per-page CSS under `assets/css/pages/`).
- **Lifecycle pattern exists and works:** `KM.lifecycle.register(sectionId, { mount, unmount })`; `app.js` `showSection()` maps a route key → section id and calls `KM.lifecycle.switchTo(sectionId)` which fires `unmount` on the old page and `mount` on the new one.
- **Routing:** `showSection(key)` uses two `sectionMap` objects (route key → `*-section` id), toggles `.module-section.active`, and (for some pages) calls a manual `init*` in a `setTimeout`.

**Key observation:** the JS/CSS layers are *already* per-module. The remaining monolith is **the inline page HTML inside `index.html`** plus a few page-specific modal blocks. That is the primary target of this plan.

---

## 2. Problems with Current `index.html`

1. **Size / navigability** — a single ~3,000-line file mixing app shell, sidebar, 12 pages, and many modals is hard to read, diff, and review.
2. **Merge-conflict surface** — every page edit touches the same file; concurrent work collides.
3. **Cognitive coupling** — page markup, shared modals, and shell are interleaved; it is easy to edit the wrong page's block (we have already hit "wrong section" risks).
4. **Inconsistent mount triggers** — most pages use `KM.lifecycle`, but a few still call manual `init*()` via `setTimeout` in `showSection()`; two parallel mechanisms.
5. **Duplicated shared UI** — date-range picker, filter bars, dual-layer tables, dropdowns, and modals are re-authored per page (e.g. Forecast vs Overseas vs Factory date pickers) instead of shared, isolated components.
6. **No clear ownership boundary** — there is no rule that says "this markup belongs to this page module," so shared and page-specific HTML drift together.

---

## 3. Target Frontend Architecture

**End-state `index.html` keeps ONLY:**
- the app shell (`<html>`/`<head>`/`<body>` wrappers),
- the global header / world-time bar,
- the sidebar / nav menu,
- a **main mount point** (the container where page sections live),
- truly **global** shared modals (only if a modal is genuinely cross-page),
- the `<script>` / `<link>` import manifest.

**Everything else (per-page markup) moves out of `index.html`** into per-page HTML partials that are injected into the mount point.

```
index.html  (shell only)
 ├─ header / world-time bar
 ├─ sidebar / nav
 ├─ <main id="app-mount">  ← page partials injected here
 ├─ global shared modals (only if cross-page)
 └─ <link>/<script> manifest

assets/
 ├─ html/pages/<page>.html        (planned) — extracted page markup partial
 ├─ html/components/<comp>.html    (planned) — shared component markup (optional)
 ├─ css/ (existing: base, components, layout, pages/*)
 └─ js/
     ├─ core/ (namespace, lifecycle, state, + planned: partial-loader)
     ├─ components/ (planned) — shared UI component modules
     ├─ utils/
     ├─ api/operation-system-db-api.js  (unchanged single DB adapter)
     └─ pages/<page>.js  (existing per-page render/init/destroy)
```

**Loading model (must stay simple, no build step required for MVP):**
- A small **partial loader** in `core/` fetches a page's HTML partial and injects it into the mount point **on first navigation**, then hands off to the existing `KM.lifecycle` mount. (Alternative for a zero-fetch option: keep partials as inline `<template>` blocks split into include files — decided per phase; either way the public contract is "page markup is owned by the page module.")
- **No bundler / framework is introduced.** Plain ES5-compatible scripts + `KM.*` namespace, exactly as today. No React/Vue/parallel SPA.

---

## 4. Module Boundary Rules

1. **One page = one module = one markup partial + one `pages/<page>.js` + (optional) one `css/pages/<page>.css`.**
2. A page module **owns its own markup**; no other module edits it.
3. A page module **must register `KM.lifecycle.register(sectionId, { mount, unmount })`** and do all DOM work inside `mount`; clean up listeners/handlers in `unmount`.
4. **All DB access goes through `window.KM.DB.*`** (the single adapter). Pages never `fetch` the Sheet directly and never create a parallel data loader.
5. **No cross-page DOM reach-in.** A page may only query within its own section root. Shared behavior comes from shared components (§5), not from querying another page's nodes.
6. **Global namespace discipline:** page-scoped state/functions are module-local or namespaced; only the documented entry points are attached to `window`.
7. **Routing stays centralized** in `app.js` `showSection()` + `KM.lifecycle`; pages do not invent their own navigation.
8. **No parallel architecture.** Migration reuses the existing lifecycle/namespace/CSS-link pattern — it does not introduce a second way to do the same thing.

---

## 5. Shared Components Strategy

Promote repeated UI into **shared, isolated components** (markup + CSS + a small JS factory), consumed by pages without copy-paste. Candidates (already duplicated today):

| Component | Today | Target |
|-----------|-------|--------|
| **Date range picker** | re-authored in Forecast (`fr-*`), Overseas (`ovs-date-*`), Factory (`fmvd-*`) | one component + theme; each instance gets isolated ids/state, shared CSS |
| **Filter bar** | `fc-filter-bar` / `forecast-filters` variants | one filter-bar layout + checkbox-dropdown primitive |
| **Dual-layer table** | `dual-layer-table` scoped per section (`#factory-stock-section …`, `#overseas-stock-section …`) | one shared table style + a render helper |
| **Modal** | `fc-modal`, `ovs-modal`, `fr-date-modal` | one modal primitive (overlay + open/close) |
| **Dropdown (checkbox multi-select)** | `fc-dropdown-*`, `forecast-dropdown-*`, `fmv-dropdown-*` | one dropdown primitive with scoped binding |
| **Pagination** | per-page implementations (e.g. FC Summary) | one pagination helper |

**Component rules:**
- **Isolation first:** each instance must not let one page's global handlers bind to another page's nodes (the current `.fr-preset-item` / `.fr-calendar-nav` global-binding hazard). Shared components must scope their queries to an instance root or unique ids.
- **Style via shared CSS classes**, behavior via a factory function that takes a root element + options.
- **Components are extracted only after ≥2 pages already use the pattern** (avoid premature abstraction).
- Extraction of a shared component is its **own phase step**, verified independently, and must be visually + behaviorally identical for every consuming page before continuing.

---

## 6. Page Module Strategy

Each page becomes a self-contained module with a consistent contract:

- **Markup:** `assets/html/pages/<page>.html` (planned) — the section's HTML, currently inline in `index.html`.
- **Logic:** `assets/js/pages/<page>.js` (exists) — exposes `mount`/`unmount` via `KM.lifecycle.register`.
- **Style:** `assets/css/pages/<page>.css` (exists where needed) — scoped to the section id.
- **Lifecycle contract:**
  - `mount()` — ensure markup is present (load partial if not yet injected), populate filters from `KM.DB`, bind events scoped to the section, render.
  - `unmount()` — remove document-level listeners, detach scroll-sync handlers, close modals.
- **Standardize mount triggers:** migrate the few pages still using manual `setTimeout(init*)` in `showSection()` onto `KM.lifecycle` so there is exactly one mechanism (behavior-preserving).

Pages in scope (existing sections): Home, Inventory Replenishment, Factory Stock, Overseas Stock, FC Summary, Forecast Review, Request Order, SKU Details, Shipping Plan, Shipping History, Supply Chain Canvas, SKU Handbook, Promotion Risk Tracker.

---

## 7. Migration Phases

**Migrate one page at a time. Each migrated page must be visually + behaviorally equivalent before continuing.**

- **Phase 0 — Foundations (no markup moves):**
  - Add a `main` **mount point** wrapper and a `core/` **partial loader** utility (dormant; nothing uses it yet).
  - Document the page-module contract. No page markup moved. No behavior change.
- **Phase 1 — Pilot page (lowest risk):**
  - Extract **one** simple page's markup (e.g. Home or Factory Stock) into a partial loaded on first navigation; keep its `pages/*.js` unchanged.
  - Prove the loader + lifecycle handoff with full visual/behavioral parity.
- **Phase 2 — Standardize mount triggers:**
  - Move any pages still using manual `init*()` in `showSection()` onto `KM.lifecycle` (behavior-preserving), so all pages share one mount mechanism.
- **Phase 3 — Page-by-page extraction:**
  - Migrate remaining pages one at a time, each as its own commit, verified before the next.
  - Order suggestion: simplest/most-isolated first (Factory Stock, Overseas Stock, Shipping History) → medium (FC Summary, Request Order, Inventory Replenishment) → heaviest/most-shared (Forecast Review, Supply Chain Canvas, SKU Details/Handbook).
- **Phase 4 — Shared component extraction:**
  - Once ≥2 pages are migrated and share a pattern, extract shared components (date picker → filter bar → dropdown → modal → dual-layer table → pagination), one component per step, re-verifying every consumer.
- **Phase 5 — Shell cleanup:**
  - Reduce `index.html` to shell-only (header, sidebar, mount point, global modals, import manifest). Confirm no orphaned markup remains.

> Phases are sequential; **do not start a new page/component until the previous one is verified.**

---

## 8. What Must NOT Change

- **No behavior rewrite during migration** — extraction is mechanical (move markup, load it, same JS).
- **No DB or Apps Script changes**; `window.KM.DB.*` remains the only data path.
- **No parallel architecture / no framework / no bundler requirement** for MVP.
- **No route key or section id renames** unless a phase explicitly calls for it (then update both `sectionMap`s + `KM.lifecycle` registration together).
- **Demo mode behavior** unchanged.
- **Visual output** identical per migrated page (same DOM, classes, and styles).
- **Other planning docs / specs** untouched.

---

## 9. Acceptance Criteria per Phase

- **Phase 0:** mount point + partial loader exist and are inert; every page still loads exactly as before; no visual diff anywhere.
- **Phase 1:** pilot page renders from its extracted partial; mount/unmount, filters, tables, modals behave identically; navigating away/back works; no console errors.
- **Phase 2:** all pages mount via `KM.lifecycle`; no page relies on `setTimeout(init*)` in `showSection()`; navigation parity preserved.
- **Phase 3 (per page):** the migrated page is **visually + behaviorally equivalent** (filters, search-gating, date pickers, scroll-sync, modals, demo on/off) before the next page starts; `index.html` shrinks by that page's block.
- **Phase 4 (per component):** every consuming page is pixel/behavior-identical after switching to the shared component; isolation verified (one page's handlers never bind another page's nodes).
- **Phase 5:** `index.html` contains only shell + manifest; all 12+ pages still function; full regression pass.

**Global acceptance:** at no point does a phase change UI behavior, DB, or Apps Script; each phase is independently revertable.

---

## 10. Risks and Rollback Plan

| Risk | Mitigation |
|------|------------|
| Partial loader introduces async timing bugs (mount before markup present) | Loader resolves a promise before `mount`; pilot (Phase 1) proves the handoff; fall back to inline markup if needed |
| Shared component global-binding leakage (the `.fr-preset-item` hazard) | Components scope queries to an instance root / unique ids; isolation is a Phase-4 acceptance gate |
| Hidden cross-page DOM dependency surfaces during extraction | Migrate one page per commit; verify before continuing; boundary rule §4.5 forbids cross-page reach-in |
| Route/section id drift between `sectionMap`s and lifecycle registration | Never rename in extraction phases; if renamed, update both maps + registration in the same commit |
| Visual regression | Per-page visual-equivalence acceptance gate before proceeding |
| Scope creep into behavior rewrites | §8 "must not change" + mechanical-only extraction rule |

**Rollback plan:**
- Each phase = one (or few) small commits → revert that commit to restore prior state.
- Phases 1–3 are per-page, so a problem reverts a single page without affecting others.
- Until a page is verified, its original inline markup can be restored verbatim (extraction is a move, not a rewrite).
- Phase 0 utilities are inert, so they can remain or be removed with no behavioral impact.

---

**Draft v1 — Plan only. No code, file moves, or behavior changes are implied by this document.**

**End of Document**
