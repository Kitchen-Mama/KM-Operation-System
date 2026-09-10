# Product Strategy Command Center — non-runtime preview prototype

> **Preview data — not connected to Operation System Database.**
> Every **price**, promotion, campaign date and finding in this prototype is **invented**. Nothing
> here has been read from `pricing_list`, `campaigns` or `campaign_sku_lines`, and **no gap, overlap
> or cannibalisation shown on this page is a conclusion about Kitchen Mama's products.**
>
> The **identities are real**: the SKU codes, the three categories, and seven product photographs
> whose `sku → image_url` mapping the operator read off the live database, SKU by SKU. **A real
> photograph does not make a price real.** The two are kept apart on every row
> (`identity_source` / `price_source`) and in the banner on every screen.

- **Design authority:** [`docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md`](../../planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md)
  — §23 source audit, §24 data contract, §25 variant grouping, §26 images, §27 adapter seam,
  §28 P1-B1 handoff, §29 the image-identity correction, **§30 the command center**.
- **How to open:** double-click `index.html`. No server, no build step, no install; `file://` is
  enough. The acceptance walk-through is the next section.
- **Rounds:** `P0-R1` information architecture · `P0-R2` interactive price band · `P0-R3` data
  contract, adapter seam, executive report · `P0-R3-R1` image-identity correction (all seven
  photographs removed) · **`P0-R3-R2`** category command center, verified images restored on real
  evidence, five-unit axis, image price markers.

## Manual acceptance — open it and check these

Every figure below was measured by executing the page.

### 1 · Open it

```
C:\Users\viczh\Desktop\KM\品牌資源\Vibe Coding\Operation System\wt-product-strategy-board-p0\docs\prototypes\product-strategy-board\index.html
```

Double-click, or paste the path into the address bar. **Chrome or Edge, window ≥ 1440 × 900.** After
any edit force a fresh load with **`Ctrl` + `F5`** (`Cmd` + `Shift` + `R` on a Mac) — there is no
build step and therefore no cache-busting.

### 2 · The shell

| # | Look for | Expected |
|---|---|---|
| 2.1 | The dark notice bar, above everything, not dismissible | *Preview data — not connected to Operation System Database* |
| 2.2 | Left **sidebar**, expanded, six destinations | Executive Overview · Category Analysis · Deal Risk · Data Quality · Strategy Workspace · Advanced Details |
| 2.3 | Exactly one destination highlighted | **Executive Overview** on load |
| 2.4 | The chevron button at the top of the sidebar | collapses it to a **64 px icon rail**; hovering an icon shows its name; pressing it again restores the full sidebar |
| 2.5 | Presentation and Print | at the **bottom of the sidebar**, not loose at the top of the page |
| 2.6 | Self-test badge, top right | **self-test 222/222**, green |
| 2.7 | Reload the page after collapsing the rail | it comes back **expanded** — the state is a variable, never storage |

### 3 · Executive Overview (the default)

Cards and a table. **No price axis at all** — that is the point: two categories may not share one.

| Category | Models | Variants | Currencies | Everyday range | Opp | Watch | Risk | Data |
|---|---|---|---|---|---|---|---|---|
| Electric Can Opener | 12 | 32 | 3 (USD, EUR, GBP) | 21.99–74.99 USD · 22.99–32.19 EUR · 21.49 GBP | 3 | 1 | 4 | 5 |
| Manual Can Opener | 2 | 5 | 1 (USD) | 19.99–22.99 USD | 0 | 0 | 0 | 1 |
| Silicone Spatula | 4 | 17 | 1 (USD) | 14.99–34.99 USD | 1 | 0 | 2 | 1 |

Three ranges on one row and **no total** across them — that is the refusal doing its job.

Check: three cards, each with a **representative photograph** or the words IMAGE SOURCE MISSING;
each showing its own price range **per currency with no conversion**; each with an **Open Category
Analysis** button. The narrowing filters (Company / Country / Marketplace / Currency / Series) are
**greyed out** while the scope is All categories.

### 4 · Category Analysis — Electric Can Opener, US

Click the category, then set **Country = US**.

| # | Look for | Expected |
|---|---|---|
| 4.1 | Summary strip | 7 cells — products **7** · variants **20** · range **21.99 – 74.99 USD** · opportunities **3** · watch **1** · risks **3** · data to fix **4** |
| 4.2 | Chart panels | **1** (USD only) |
| 4.3 | Columns on the axis | **7** |
| 4.4 | **Y-axis ticks** | **15.00 20.00 25.00 30.00 35.00 40.00 45.00 50.00 55.00 60.00 65.00 70.00 75.00 80.00 85.00** — fifteen ticks, every one exactly 5.00 apart |
| 4.5 | Everyday-price markers | **4 product photographs** and **3 neutral fallback plates** carrying a model code |
| 4.6 | The photographs | CO1100-R · CO1150-R · CO2600-B · CO5600-RB. **No CO2600-R and no CO5600-R** — different SKUs, different products |
| 4.7 | Deal markers | red diamonds (live) and dashed outlines (proposed), **never a photograph** |
| 4.8 | Hover any column | tooltip with list / everyday / promotion / floor to two decimals, the variant list, and either the verified photograph SKU or IMAGE SOURCE MISSING |
| 4.9 | Product comparison table | **8 rows**, this category only, with image · model · representative SKU · variants · series · floor · everyday · list · official deal · proposed · status · data quality |
| 4.10 | Insight drawer | **collapsed**. Open it: **11 findings** — gap 3 · overlap 1 · cannibalisation 3 · no price 1 · image 1 · dateless deal 1 · no grouping 1 |
| 4.11 | Every finding | tagged **DEMONSTRATION INSIGHT** |
| 4.12 | Executive recommendation | below the drawer, and it ends by saying nothing here is a conclusion about real products |

Switch **Country = All**: three panels appear (USD, EUR, GBP), **three separate axes**, and no
figure is ever converted between them.

### 5 · The other categories

| Category (all countries) | Panels | Columns | Photographs | Fallbacks | Ticks | Table rows | Findings |
|---|---|---|---|---|---|---|---|
| Electric Can Opener | 3 | 11 | 7 | 4 | 25 | 12 | 13 |
| Manual Can Opener | 1 | 2 | 1 | 1 | 4 | 2 | 1 |
| Silicone Spatula | 1 | 4 | 2 | 2 | 8 | 4 | 4 |

Switching category must leave **nothing** behind: the chart, the table, the summary and the drawer
are all rebuilt from the same scoped row set.

### 6 · Deal Risk and Data Quality

Both list findings **grouped by category**, never pooled. With no category chosen they walk all
three; with one chosen they show only it. With **Electric Can Opener / US** selected, Deal Risk
shows **3** items and Data Quality **4**.

### 7 · Strategy Workspace

Picker lists the current category's products; search narrows it; three tools (Add text, Add price
band, Add matrix) create editable, removable elements; **six** further tools are visibly disabled.

### 8 · 16:9 presentation and Print → PDF

**Presentation** turns the page into a dark 16:9 stage, collapses the sidebar to the rail, hides the
self-test and Advanced details, and **keeps the notice**. Press it again to return — there is no
`Esc` shortcut.

**Print / PDF** → Save as PDF, A4 or Letter, background graphics on. The notice prints on the first
page in black; the insight drawer prints **expanded**; the sidebar, self-test and Advanced details
do not print; no card, panel or table row is split across a page break.

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell only: notice, sidebar frame, main region. Four local subresources. |
| `prototype.css` | All styling. No `@import`, `@font-face` or `url()`. |
| `data-contract.js` | **The contract.** Source tables, join path, the contract fields, API ownership, the category authority, the scope ladder, the image policy with its evidence classes and the seven verified mappings, the five refusal states, and the **disabled** Operation DB adapter. Reads nothing. |
| `preview-fixture.js` | **The invented prices**, in contract shape, on real identities, plus `PreviewProductStrategyDataAdapter`. |
| `prototype.js` | **The renderer.** Given an adapter; never given the fixture. |
| `images/` | The seven verified photographs, byte-identical copies of `assets/img/products/`. |

**The renderer never touches the fixture.** `boot()` picks an adapter, once, in one line.

## Category is the first scope

`sku_details.category` is a real column (`sku-details.js:2369`), so this is a scope the database can
enforce rather than a label the page invents.

```
category → company → country → marketplace → currency → series
```

- **Two categories never share a price axis.** A price ladder is an argument about products a buyer
  would consider instead of one another; an electric can opener is not an alternative to a spatula.
  Putting them on one axis does not make a wider ladder, it makes a meaningless one — every gap,
  overlap and cannibalisation it produced would be measured between things that do not compete.
- **No finding is ever computed across two categories.** The analysis runs inside one panel, and
  every panel is inside one category.
- **The cross-category view is cards and a table.** Counts and per-currency ranges, never a pooled
  ladder.
- **The narrowing filters are disabled until a category is chosen**, because narrowing a mixture is
  not a scope, it is a sieve.
- **P1-B1 must bound `filters.category` server-side.** Mixing categories in the client and then
  analysing the mixture is worse than returning nothing.

## The five-unit axis

```
axis_min = floor(min displayed price / 5) * 5
axis_max = ceil (max displayed price / 5) * 5
ticks    = axis_min, +5, +5, … , axis_max
```

Every gridline is a tick and every tick is labelled; there is no "nice number" search and no
magnitude rounding, so a label like 20 / 40 / 60 can only appear as part of the 5-unit sequence.
When a category's range is tall the **pixel** distance between ticks compresses (clamped to a 480 px
plot) — the **scale** never does, and the axis stays linear. Tooltips show two decimals. USD, EUR
and GBP keep separate panels and separate axes; nothing is ever converted.

Electric Can Opener / US: data span 17.99 – 84.99 → axis **15.00 – 85.00**, fifteen ticks.

## Product images — the evidence, one SKU at a time

P0-R3-R1 removed all seven photographs because nothing in the **repository** bound any file to any
SKU. P0-R3-R2 restores seven on a different basis: the repository was never the only possible
witness. **The operator can read the database.**

**Evidence class E — `OPERATOR_ASSERTED_DB_RECORD` + `EXACT_REPO_FILE_EXISTS`.** The operator
reports, SKU by SKU, the `image_url` the live `sku_details` row carries; the named file is then
checked to exist at that exact path, with exact case and extension. Neither half is sufficient
alone, and **the mapping is per-SKU**.

| SKU | `image_url` on the `sku_details` row | Repo file | Object hash (copy is identical) |
|---|---|---|---|
| `CO1100-R` | `assets/img/products/CO1100-R.jpg` | exists | `8659b25aebdc0d20d92c849a19f09d315ed9d069` |
| `CO1150-R` | `assets/img/products/CO1150-R.jpg` | exists | `22742b8f4d70c872fc165703d195da7dc0512d32` |
| `CO2600-B` | `assets/img/products/CO2600-B.jpg` | exists | `35b1146e435166037c93c083f313f6e6fa96e949` |
| `CO5600-RB` | `assets/img/products/CO5600-RB.jpg` | exists | `2785d6bdcab7e00a912f74383b696982911db6d2` |
| `SP3120-R` | `assets/img/products/SP3120-R.jpg` | exists | `1d47cc50d303407c9cbc1703deae5e52471492d0` |
| `SP3410-R` | `assets/img/products/SP3410-R.jpg` | exists | `b4fc87a1431edfbe833995f36cab530b424aee3e` |
| `MO5600-R` | `assets/img/products/MO5600-R.jpg` | exists | `3c280fa42a3e828682763e12a0a5b35434cc1679` |

**Seven, and not an eighth.** `CO2600-R.jpg` and `CO5600-R.jpg` both exist in the repo and **neither
is used**, because the operator named `CO2600-B` and `CO5600-RB`. That substitution is the exact
mistake the table exists to prevent, and it is asserted twice.

Still refused: composing a path from a SKU plus a directory plus an extension · extending one
mapping to a sibling SKU · a similar-looking photograph of a different SKU · a placeholder dressed
as a product photo · downloading anything. The renderer enforces the first of these structurally —
it passes the row's value to the image element verbatim and **composes no path at all**, which the
scan checks by reading the renderer's own source.

## The everyday price is a photograph

| | |
|---|---|
| Verified image | a 36 px rounded white plate, thin border, soft shadow, `xMidYMid meet` so nothing is cropped |
| **Position** | the plate is drawn at `cy − 18`, so its **centre** is the price; a 2 px anchor dot is drawn **at** `cy` and carries `data-price-c`. Enlarging the plate on hover cannot move the datum |
| No verified image | the same plate, neutral, carrying the model code. Never a broken image, never another SKU's photograph, never a shape that could pass for a product |
| Deals | live promotions stay red diamonds, proposals stay dashed outlines. **A photograph marks the everyday price and nothing else** |
| Representative image | comes from the node's **own members**. A price-split sibling shares a `variant_group` and is a different node, so it does **not** inherit the photograph |

## Automated DOM assertions

**222, run on load** against the real page: they click the real navigation, collapse the real
sidebar, switch the real categories, read back the rendered SVG and **restore the state they found**.
The badge turns red on the first failure and names it.

| Group | Covers |
|---|---|
| A | integer cents, including the float difference that motivates them |
| B | the contract: `category` is a field and the first scope, `image_identity_status` travels with the row, the ladder is declared in order, every preview row conforms |
| C | the adapter seam; the Operation DB adapter defined, disabled, zero rows, zero requests |
| D | the permanent notice, and the three phrases the page must never say |
| E | variant grouping: merge, split on price, refuse without authority — and the price-split sibling not inheriting the photograph |
| F | one panel per currency, one axis each, no conversion |
| G | **the five-unit axis**: step, multiples, floor/ceil against the data, first and last tick, one gridline per tick, and a tall range compressing pixels rather than the scale |
| H | **the image markers**: local siblings only, centre = coordinate in both axes, the anchor carrying the everyday price, the neutral fallback, deals keeping their own shapes, no path composed |
| I | gap / overlap / cannibalisation and all three boundary rules |
| J | data quality: no price, dateless promotion, no grouping, photographs once per reason |
| K | every finding tagged DEMONSTRATION INSIGHT; live and proposed never conflated |
| L | **the sidebar**: expanded by default, one active item, collapse and restore, tooltips on the rail, no storage, no emoji, inline SVG only |
| M | **category isolation**: no axis on the overview, one card and one row per category, filters closed at All categories, table/chart/findings scoped, nothing stale after a switch, one row set behind summary + chart + table, and no cross-category finding |
| N | the product comparison table: every column, every image slot, this category only |
| O | no network, no storage, four subresources, no margin figure |
| P | print affordance and presentation mode |
| Q | **the verified mappings**: seven and no eighth, the two near misses refused, every image on the page traceable to a named mapping whose SKU is a member of that grouping |
| R | the P0-R3 / R3-R1 guarantees re-asserted against the new markup: contract shape, GAPs, refusal states, no schema name on the executive surface, Advanced details, workspace tools, the `.bel-note` class collision, the notice surviving every view |
| Z | the page is restored |
