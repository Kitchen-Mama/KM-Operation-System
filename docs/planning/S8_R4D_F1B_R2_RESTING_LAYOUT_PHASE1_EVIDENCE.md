# S8-R4D-F1B-R2 — RESTING LAYOUT CORRECTION · PHASE 1 EVIDENCE

```
STATUS = STOPPED AT PHASE 1, BY INSTRUCTION
RUNTIME_MODIFIED = NO · CSS_MODIFIED = NO · DEPLOYED = NO · CACHE_TOKEN_ROTATED = NO
Production target: 230525a (unchanged by this round)
```

The task says: *"If production DOM measurements cannot be performed, provide a safe operator-side DevTools
measurement script and STOP. Do not guess CSS values."* They cannot be performed from here — there is no
browser automation in this environment (no `puppeteer`, no `ws`, no CDP client), and the decisive half of the
report is **data-dependent** (US/Shopify differs from US/Amazon), so a local render could not reproduce it
even with a browser. The probe is `assets/tools/s8-r4d-f1b-r2-resting-gap-probe.js`.

What follows is everything Phase 1 CAN establish without a browser, so the measurement arrives pointed at the
right question rather than fishing.

---

## §1 — THE RENDERED NODES, AND WHAT OWNS THEIR GEOMETRY

```
#opsSection.page-inventory            no CSS rule of its own -> display:block, no padding, no gap
  #alloc-draft-persistence-panel      JS, inserted as firstChild (IR:6364) — ABOVE block 1, shifts all three
  h2                                  background:white, z-index:140
  .replen-control-panel        BLOCK 1  sticky top:0 · z 131 · bg #f8f9fa · border 1px · padding 10px 16px
                                        · margin-bottom: var(--space-lg, 1.5rem)      <- owns GAP A
  .fc-modal x5                        display:none; position:fixed -> ZERO flow contribution
  .replen-category-shell       BLOCK 2  sticky · z 125 · bg #fff · box-shadow 0 1px 3px · padding 8px 14px
                                        · margin-bottom: var(--space-lg, 1.5rem)      <- owns GAP B
    .replen-category-rail               border 1px #e5e7eb · padding 4px · overflow-x auto · nowrap
  .dual-layer-table            BLOCK 3  margin-top: 0 · bg white · border 1px · radius 8px · shadow
    #replenSearchState                  F1B: moved INSIDE here (IR:9953), display:none when empty
    #replen-render-integrity            F1B: moved INSIDE here (IR:1884)
    .table-header-bar                   sticky · z 120 · height 68px · bg #f5f5f5
                                        · box-shadow ... , 0 -100vh 0 100vh white   (the white curtain)
```

`--space-lg: 1.5rem` = 24px, defined once at `base.css:90`. **Both gap declarations are now character-identical**
(F1B made `.replen-control-panel` carry the same fallback). So the two margins are 24px each.

### Every DOM insertion in the page module, classified

| site | inserts | where | in a gap? |
|---|---|---|---|
| IR:1884 | `#replen-render-integrity` | first child of the table card | **no** (F1B moved it) |
| IR:9953 | `#replenSearchState` | first child of the table card | **no** (F1B moved it) |
| IR:6364 | `#alloc-draft-persistence-panel` | `#opsSection` firstChild | no — above block 1 |
| IR:9410 | `#replenScopeRegistryState` | inside `.replen-filters` | no — inside block 1 |
| IR:11104 | `#exec-plan-status-<sku>` | inside an expanded row's list | no — inside the table body |
| IR:3019/3020 | row elements | `#replenFixedBody` / `#replenScrollBody` | no |
| IR:12011, 12866, 14237 | notice / download / overlay | `document.body` | no |

**After F1B there is no node in either gap, and no CSS rule anywhere in the repository adds vertical geometry
between the blocks.** Every rule that touches the three selectors was enumerated across all six stylesheets;
the only vertical owners are the two 24px margins and `.dual-layer-table { margin-top: 0 }`.

---

## §2 — WHY THAT IS A FINDING RATHER THAN A CONTRADICTION

The operator measures GAP B > GAP A on a tree where the two declared gaps are provably identical. Both
statements can be true at once, and the way they can is the hypothesis the probe exists to settle:

> **GEOMETRIC equality is not PERCEIVED equality, because the two blocks do not present their edges the same
> way.**

* `.main-content` is `background: white` (`layout.css:333`). `.replen-category-shell` is `background: #fff`
  with **no border** — against a white page it has no visible edge of its own, only a downward
  `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`.
* So BLOCK 2's visible body is the **rail**, inset by the shell's `padding: 8px 14px`.
* BLOCK 1 is `#f8f9fa` **with** a 1px border — a clearly bounded card.
* BLOCK 3's visible top is the `#f5f5f5` header bar at the card's top edge.

Measured from the visible edges that leaves ~32px on both sides, which is still symmetric — so **if the
perceived gaps are genuinely unequal, something is present at runtime that is absent from source.** That is
exactly what `pageChildren` / `occupantsOfGapA` / `occupantsOfGapB` in the probe enumerate.

### Why F1B's structural fix did not satisfy the contract

F1B removed the one **dynamic** occupant of GAP B (`#replenSearchState`, which the Country change itself
populated) and made the two declarations identical. Both were real and both are now fixed — the suite proves
the host is a child of the table card and absent from the page-level gap. **Neither of them addressed a
STATIC perceived asymmetry**, because the preflight measured declarations and not pixels, and no pixel
measurement of Production existed at that time. That is the gap in the F1B evidence, stated plainly.

### The US/Shopify clue, and why it is the most valuable one

Nothing between the blocks is data-dependent. The category rail cannot wrap (`flex-wrap: nowrap`), tab count
only changes its scroll width, and the shell has no height or min-height (asserted by `category-bar-rebuild`
A15). So a **larger** lower gap specifically on US/Shopify cannot come from any owner identified above.

Candidates the probe distinguishes, in the order it will settle them:

1. **A runtime occupant of GAP B that source does not predict** — `occupantsOfGapB` names it outright.
2. **The rail's scrollbar** — `railScrollbarPx` says whether `scrollbar-gutter: stable` is honoured on this
   axis in this engine, and `railOverflows` / `railTabCount` say whether Shopify's category set overflows
   when Amazon's does not. If `railScrollbarPx` is non-zero, §B.4 of F1B did not take effect and the rail's
   height varies by that amount.
3. **A perceived-edge asymmetry** — `GEOMETRIC` equal while `PERCEIVED` is not, with the paint properties
   (`background-color`, `box-shadow`, `border-*-color`, `border-radius`) dumped for every block so the edge
   the eye uses is identifiable rather than assumed.
4. **A banner left visible inside the table card** — `banners[]` reports parent, display, height and child
   count. This would change the card's top but NOT the gap, and distinguishing those two is the point.

No CSS value is proposed here. Phase 2 begins when the measurement names the owner.

---

## §3 — THE PROBE

`assets/tools/s8-r4d-f1b-r2-resting-gap-probe.js`

**Zero-write, proven mechanically**: the file contains no assignment to `innerHTML`, `textContent`, `style`,
no `setAttribute`, no `appendChild`/`removeChild`/`insertBefore`, no `localStorage`/`sessionStorage`, no
`fetch`/`XMLHttpRequest`, no `.click()`, and no call to `searchReplenishment` or `_irApplySearch_`. The only
write is `window.__F1B_R2__`, a diagnostic handle. It triggers no read, no write and no gap recalculation,
and is safe to run on Production repeatedly.

It refuses to report when `window.scrollY !== 0`, because a sticky block measured mid-scroll is not the
resting position the contract is about.

### Operator procedure

For **US/Amazon**, then **US/Shopify**, then **EU/Amazon**:

1. Load Site Inventory, select the site, press **Search**, let the table finish.
2. Scroll to the very top.
3. Paste the whole probe file into the DevTools console, Enter.
4. `copy(__F1B_R2__.json)` and paste the blob back.

Also worth capturing once, on US/Shopify: a screenshot at the resting position with DevTools' element
overlay on `.replen-category-shell`, so the perceived edge can be checked against the measured box.

### What each answer licenses

```
occupantsOfGapB non-empty              -> a runtime node owns the gap; Phase 2 removes or relocates it
railScrollbarPx > 0                    -> scrollbar-gutter is not honoured here; the rail's height varies
GEOMETRIC equal, PERCEIVED unequal     -> the defect is which edges the blocks present, not their margins
both equal on every site               -> the remaining difference is outside these three blocks; re-aim
```

---

## §4 — SCOPE HELD

No CSS value was changed or proposed. No runtime file, stylesheet, markup, test, backend, API, DB or Apps
Script file was modified. No cache token was rotated — nothing browser-served changed, and rotating a token
for an unchanged tree would publish a cache-bust with no bytes behind it. F1A and F1B guards are untouched.
Production remains `230525a`.
