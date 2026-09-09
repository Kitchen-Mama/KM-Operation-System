# Product Strategy Board — non-runtime interactive prototype

**This is not part of the application.** It is a static, self-contained prototype of the board's
first-priority screen: pick SKUs, read a real X/Y price band, and watch the gap / overlap /
cannibalisation arithmetic move.

- **Design authority:** [`docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md`](../../planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md)
  — §9 is the price-band rulebook this obeys; §22 specifies the prototype itself.
- **How to open:** double-click `index.html`, or open its local file path in a browser. No server,
  no build step, no install. It works from `file://`.
- **Rounds:** `P0-R1` built the information architecture as static cards. `P0-R2` made the price
  band interactive and added the SKU selector, the working filters and the self-test.

## What is open, and what is not

| Open and working | |
|---|---|
| **`SERIES_PRICE_BAND_CHART`** | X axis = SKU, Y axis = price. Five levels per SKU: MSRP, regular, official deal, proposed deal, minimum. Vertical minimum→MSRP band, Y-axis ticks, rotated SKU labels, hover tooltip and a click-through details panel. |
| **SKU selector** | Multi-select checkboxes, **Select all**, **Clear all**, and a search over SKU code and product name. Ticking or unticking updates the chart immediately. |
| **Filters** | Series, Company, Country, Marketplace — all four really narrow the SKU universe. Series also *replaces* it. |
| **Gap threshold** | An input, in currency units. Changing it recomputes and re-labels every finding. |
| **Analysis** | Price gap, price overlap, deal cannibalisation risk, and entry / core / premium positions — computed live from the mock data, each finding carrying the number that produced it. |
| **Multi-currency** | USD / EUR / GBP split into separate panels, each with its own Y axis. |
| **Board elements** | **Text** (editable note), **Price Band** (a chart element that snapshots the current selection), **Matrix** (2×2 with editable axis names and editable cells). Every one of the three can be **deleted** again. |
| **History** | Save checkpoint appends a revision; the drawer lists them. |
| **Self-test** | 120 DOM assertions, run automatically on load. |

| Not open, and not pretended | Why |
|---|---|
| **Drag, resize, pan, zoom, multi-select on the board, z-order** | These are the **Canvas Core** (design freeze §11.5), which P1 extracts from the shipped `supplychain.js` engine. The tool-rail note on the page says so in plain words. |
| **`SKU_CARD`, `REGIONAL_SKU_CARD`** | Need the bounded live source read (D-5). Their tool buttons are **disabled**, not wired to a dialog. |
| **`DEAL_PLAN` as an element** | A P1 `PROPOSAL_ONLY` element (D-4). Its *effect* is visible here — a proposed deal price is a third marker on the chart and drives its own findings — but the element itself is not addable. |
| **`CHART`, `GROUP`, `CONNECTOR`** | Deferred to P2 (§2). Disabled. |
| **Persistence, CRUD, an API, a database** | P1. Reload clears everything, and that is this round's intended behaviour. |
| **Current selling price, margin** | **GAPs** (D-6, D-8). They are absent, and nothing stands in for them — not blank, not zero, not a substitute. |
| **FX conversion, a base-currency view** | Refused (D-3). No rate is applied anywhere. |

## The chart's data model

One row per **operational site SKU**. Field names are the real ones from the design freeze §4, so
the prototype shows where each value would come from; every **value** is invented.

| Field | Source it stands for | Rendered as |
|---|---|---|
| `sku`, `product_name`, `series` | `sku_details` | X-axis label, tooltip, selector row |
| `company`, `country`, `marketplace`, `marketplace_sku_status` | `marketplace_skus` | filters, tooltip, details panel |
| `currency` | `pricing_list.currency` | **which panel the SKU goes in** |
| `msrp` | `pricing_list.msrp` | top cap tick of the band |
| `regular_price` | `pricing_list.regular_price` | **the band basis (D-2)** — filled circle |
| `minimum_price` | `pricing_list.minimum_price` | bottom floor tick of the band |
| `official_deal_price` | `campaign_sku_lines.promo_price` | filled diamond — the **only** authoritative deal price |
| `official_campaign` | `campaigns.campaign_name` + window | tooltip and details panel |
| `proposed_deal_price` | board-owned `DEAL_PLAN.content_json` | **dashed hollow** diamond, labelled a proposal |
| `missing_reason` | — | `SOURCE_MISSING`: listed, **plotted nowhere** |

**The row key is `company|country|marketplace|sku`, not `sku`.** `pricing_list` has no `company`
column (§4.4), so the same master SKU appears once per site and each site row is separately
selectable — which is why `CO1100-R` can be in the USD, EUR and GBP panels at once.

### Legend

| Symbol | Meaning |
|---|---|
| ● filled circle | `regular_price` — the band basis |
| ◆ filled diamond | official deal price (`campaign_sku_lines.promo_price`) |
| ◇ dashed diamond | **proposed** deal price — board-owned, never official, never written back |
| ▌ thick vertical bar | the price band, `minimum_price` up to `msrp`, with a tick at each end |
| ┄ dashed connector + label | a **gap**, labelled with its distance *and the threshold that produced it* |
| ▨ shaded box | an **overlap**; a dashed violet box means it is proposal-driven |
| entry / core / premium | positions in the sorted list, computed here — **no tier column exists** (§3.5) |

## The arithmetic, and its two boundary rules

**Every comparison runs on integer cents.** Not a style preference — `32.99 - 24.99` is
`8.000000000000004` in IEEE-754, so a step *exactly* equal to a threshold of `8.00` would satisfy
`distance > threshold`, be reported as a gap, and then render through two decimals as
*"gap 8.00 exceeds threshold 8.00"* — a measurement that refutes itself on screen.

| Finding | Rule |
|---|---|
| **Gap** | adjacent `regular_price` distance **strictly greater** than the threshold. A step exactly equal to it is **not** a gap. |
| **Overlap** | two `[deal, regular]` intervals sharing **more than a single point**. Intervals that merely touch are **not** an overlap. |
| **Cannibalisation** | A's deal price **≤** B's `regular_price`, where B sits below A in the normal-price order. This test *is* inclusive, so a single-point touch **is** a cannibalisation while not being an overlap. |
| **Proposal-driven** | any finding caused by a `proposed_deal_price` is labelled `PROPOSAL-DRIVEN`, so a warning caused by an idea on this board is never read as a warning caused by a live campaign. |

Both boundary rules have a case sitting in the default data on purpose:
`CO1190-R → CO1195-R` is exactly `8.00` (not a gap), and `CO1160-R`'s regular `52.99` equals
`CO1180-R`'s deal `52.99` (not an overlap, but *is* a cannibalisation).

## Hard constraints, and how each is met

| Constraint | How |
|---|---|
| Local mock data only | One `MOCK` object at the top of `prototype.js`, whose `note` field declares it invented. |
| No network request | Scanned with comments **and string literals stripped first**: **0** occurrences of `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, dynamic `import(`, `KM.*`, `google.script`, `http://`, `https://`. |
| No storage | `localStorage` / `sessionStorage` / `indexedDB` / `openDatabase` are never called. State lives in one `STATE` object and is gone on reload. |
| Exactly two subresources | `prototype.css` and `prototype.js`, both local siblings. Asserted by the self-test (N3). |
| No dependency | Plain HTML + CSS + vanilla JS. The charts are hand-built inline SVG via `createElementNS`. No CDN, no library, no remote font: **0** `@import`, **0** `@font-face`, **0** `url()` in the CSS. |
| Not loaded by the app | Nothing in the app's `index.html` or under `assets/**` references `docs/prototypes/**`. |
| No production file touched | `index.html`, `assets/**` and every `.gs` are byte-identical to the branch base. |
| No table, migration or DB write | None exists to write to. |

## Automated DOM assertions

**120 assertions, run on load**, against the real DOM: they tick real checkboxes, change the real
selects, read back the rendered SVG, and **restore the starting state** when they finish. The badge
in the top banner shows `self-test 120/120`; **Show detail** lists every one, and failures also go
to the browser console. **Re-run** repeats them.

| Group | Covers |
|---|---|
| A | integer cents: exact rounding, exact differences where floats are not, blank ⇒ `null` not `0` |
| B | an empty selection says so rather than drawing an empty axis |
| C | multi-select changes the number of X-axis items, and unticking removes the right one |
| D | Select all / Clear all; the universe is 11 SKUs, 10 plottable — inside the 8–12 target |
| E | search narrows the list without changing the selection; no match says so |
| F | Series **replaces** the SKU universe and drops the previous selection |
| G | band bounds per SKU: the band spans exactly the two ticks, MSRP above minimum, regular inside |
| H | the three marker kinds, never two on one SKU; legend, Y ticks, axis title, X labels, tooltips |
| I | `SOURCE_MISSING` never becomes a point, and is listed with its reason |
| J | three currencies ⇒ three panels, own axis each, no panel mixes two, no finding crosses two |
| K | gap / overlap / cannibalisation values, the two boundary rules, tiers, and the live threshold |
| L | Company / Country / Marketplace / Series really filter; an empty universe says so |
| M | Text, Price Band and Matrix create, edit and delete; disabled tools really are disabled |
| N | no storage, no network, exactly two subresources, no margin figure, no substituted price |
| Z | the self-test restored the page it started from |

## Files

| File | Lines | Purpose |
|---|---|---|
| `index.html` | 226 | Page shell, top bar, SKU selector, chart container, board, properties, self-test panel |
| `prototype.css` | 486 | All styling, including the SVG chart. No `@import`, `@font-face` or `url()` |
| `prototype.js` | 1803 | Mock data, cents arithmetic, analysis engine, SVG chart, selector, board elements, 120 assertions |
| `README.md` | this file | What is open, what is not, the data model, the rules, and how each constraint is met |
