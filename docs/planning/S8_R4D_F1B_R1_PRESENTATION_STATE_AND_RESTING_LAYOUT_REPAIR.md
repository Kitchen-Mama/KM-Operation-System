# S8-R4D-F1B-R1 — SITE INVENTORY PRESENTATION STATE + RESTING LAYOUT REPAIR

Implements the preflight recorded in `S8_R4D_F1B_PRESENTATION_STATE_AND_RESTING_LAYOUT_PREFLIGHT.md`
under the operator-frozen decisions: `OPTION_C`, `D-R`, `D-S`, `D-F`.

```
PRE_HEAD   cc31c28
BACKEND / API / DB / APPS-SCRIPT TOUCH COUNT = 0 / 0 / 0 / 0
```

---

## §1 — WHAT CHANGED

### A. Presentation state — `assets/js/pages/inventory-replenishment.js`

One branch of `_irBootstrapScope_` changed. The preload is untouched; the commit is removed.

| | before | after |
|---|---|---|
| remembered scope → first-layer read | yes, 1 request | **yes, 1 request — unchanged** |
| mount assigns `_irSearch.applied` | **yes**, via `_irApplySearch_(remembered, mySeq)` | **no** |
| status during the preload | `LOADING` (painted "Searching…") | `PRE_SEARCH` (D-S) |
| selectors restored from memory | yes | **yes — unchanged** |
| first Search when the preload landed | — | commits from memory, **0 requests** |
| first Search while the preload is open | — | **coalesces**, no second dispatch |
| no remembered scope | registry only, 0 reads | **unchanged** (D-F) |
| same-session re-entry after a Search | RESTORED, 0 reads, paints | **unchanged** (D-R) |
| read FAILURE branch | ERROR + selectors shown + Retry, applies nothing | **byte-identical** |

**Why the separation is free, and it is a property of the request rather than a convenience.** The
first-layer payload carries no scope:

```
IR:10396   var _wsPayload = { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() };
```

`buildInventoryReplenishmentRequestDTO` adds `payload.siteScope` only when a caller passes one, and the only
caller that does is the lazy exposure read (IR:9182). The server returns the table set; the **client** scopes
it at render time from `applied`. So a preloaded model is not "the remembered site's data" that would have to
be discarded if the operator picks another site — it is the data for whichever site they confirm.

Two state fields were added to the existing bootstrap diagnostic, so the new lifecycle is observable rather
than inferred from the screen: `preloaded` and `committed`.

### B. Resting layout — `inventory-replenishment.js` + `inventory-replenishment.css`

| change | file | why |
|---|---|---|
| `#replenSearchState` moved **inside** `#replen-detail-table` as its first child | IR `_irStateHost_` | it was the only dynamic occupant of the category→table gap |
| `#replen-render-integrity` likewise | IR `_irRenderIntegrityNotice_` | same class of defect, same gap |
| `_irRenderStaleNotice_` stops assigning `host.innerHTML` wholesale | IR | it was deleting the other three producers' banners |
| `_irStateHostSync_` added — occupancy decides visibility, in one place | IR | four writers had been guessing from `host.innerHTML` |
| `scrollbar-gutter: stable` | CSS `.replen-category-rail` | category overflow changed the rail's height by the 6px scrollbar |
| `var(--space-lg)` → `var(--space-lg, 1.5rem)` | CSS `.replen-control-panel` | the two gap declarations now match character for character |

**No margin value changed. No height, min-height or fixed-height workaround was introduced.** The two gaps
were already 24px each; the repair removes what was sitting in one of them.

---

## §2 — THE WARNING-ERASURE DEFECT, WHICH WAS NOT A SPACING PROBLEM

Four producers write into `#replenSearchState`. Three remove their own node and
`insertAdjacentHTML('afterbegin', …)`. The fourth — the stale notice — assigned `host.innerHTML` wholesale and
cleared it to `''` when not stale.

So **changing Country could silently delete an "Unsaved — database update failed." warning** naming
Execution-Plan routes that were never persisted, together with the duplicate-rows banner and the
database-unverified disclosure. The notice that fires most often was destroying the three that matter most.

It now removes only its own node and appends at the **end**. The position is the semantic priority: data-loss
warnings prepend and stay above an informational "your filters moved" note. Proven by execution, not by
reading the source — §L of the suite places an unsaved-write warning, renders the stale notice over it, and
asserts both survive in that order.

This shared the element with the spacing defect, which is why it is repaired here and not deferred.

---

## §3 — WHAT WAS DELIBERATELY NOT CHANGED

* **The bootstrap's read-FAILURE branch.** It has never applied a scope and still does not
  (`first-load-timeout-…-e3-r4.js` D1e). What a *failed* read says to the operator is a separate decision
  from when a *successful* one is shown; folding them together would have been the scope expansion §2 of the
  task says to stop for. One consequence is recorded as debt in §8.
* **`_irResultMatchesAppliedScope_` / `_irAppliedScopeKey_`** — the F1A guard, untouched and re-proven.
* **Sticky and scrolled-state behaviour** — no `position`, `top`, `z-index` or offset-variable writer moved.
* **Every write constructor** — Submit Plan, Request Order, Shipment writes, gap calculation, FC writes.
* **Backend, API contract, DB.** Zero files.

---

## §4 — TWO SHIPPED ASSERTIONS RESTATED (a visible contract change, not a test fix)

Two suites required `_irApplySearch_(` to appear **inside** `_irBootstrapScope_`:

```
read-stability-images-and-invariants-f1-7n-fb-4e-r3.js:211
  'G4 and applied only through the single assignment point'
two-vertical-flow-closure-f1-7n-fb-3.js:259
  'C7. and it applies through the SAME single assignment point a manual Search uses — never its own'
```

The property they protect was never "the bootstrap applies correctly" — it was **"no second code path can make
data appear."** F1B satisfies that by not applying at all, which is strictly stronger. Both are restated with
attribution rather than deleted, and the file-wide count (`_irSearch.applied = {` exactly once) is kept.

**One of the two was passing vacuously and had to be repaired as well.** FB-4E-R3's probe reads **raw** source,
and the shipped comment explaining the removal names `_irApplySearch_` — so the old assertion passed on prose
while the code said the opposite. It now strips line comments before asking. A vacuous pass is worth more
finding than the assertion it hides.

---

## §5 — VERIFICATION

New suite: `assets/tests/presentation-state-and-resting-layout-s8-r4d-f1b.test.js` — **109 assertions, 0
failures, 7 mutants, 0 survived.** The page module is executed in a VM against a controllable workspace read;
nothing in §A–§J asserts that a line of source exists.

```
A  fresh session, no remembered scope      REGISTRY_ONLY · 0 reads · applied null · PRE_SEARCH
B  hard refresh with a remembered scope    COALESCED · 1 read · model in hand · applied NULL · PRE_SEARCH
                                           · no READY paint · no LOADING paint · selectors restored
                                           · load region driven 0 times
C  preload landed, then Search             0 further reads · applied committed · READY · painted once
D  Search while the preload is open        nothing committed while open · LOADING for the explicit Search
                                           · commits when it lands · never more than preload + Search
E  the coalesce, on the SHIPPED transport  identical payloads → identical key · different payload → different
                                           key · TWO calls dispatched ONE · second got the first's promise
F  same-session re-entry (D-R)             RESTORED · 0 blocking reads · first paint READY · quiet revalidate
G  Country changed without Search          applied unchanged · stale marked · 0 reads · only Search moves it
H  US → CA → DE → JP by Search             applied and the scope KEY follow each one · last one remembered
I  F1A intact                              previous-scope stamp refused · unstamped refused · null refused
                                           · applied key EMPTY during preload · Suggested Qty PENDING
J  failure branch untouched                commits nothing · ERROR · scope still shown · still remembered
K  banner host                             child of the table card · absent from the page-level gap · first
                                           child · hidden when empty · idempotent
L  four producers, one host                unsaved warning SURVIVES a Country change · priority order
                                           · clearing stale keeps the warning · hides only when empty
                                           · no duplicate stacking
M  resting geometry                        both gaps declared identically · token not literal · gutter stable
N  sticky                                  all three sticky declarations and both offset writers unchanged
X  mutants                                 X1 auto-commit restored · X2 LOADING during preload · X3 host back
                                           in the gap · X4 wholesale innerHTML write · X5 tautological scope
                                           stamp · X6 gutter removed · X7 gap declarations diverge
```

### Regression

```
BASELINE (cc31c28, canonical 618-suite serial sweep)   6 failing suites
  gap-job-done-notice-f1-small-r1
  order-planning-monthly-projection-consumer-f1-4b-fm3d
  positive-residual-and-submit-readiness-census-…-r6-r7-r5-r1
  replen-header-toggle
  s2-r4b-shipping-history-and-fc-warm-race
  supply-planning-route-inventory
```

The earlier rounds' "215/216" was a **filtered subset**, not the canonical sweep; this is the first full-sweep
baseline recorded for this branch and it is measured on a committed tree, not a dirty one.

---

## §8 — DEBT RECORDED, NOT REPAIRED

1. **A failed background preload still says "Search failed — no results were loaded" before the operator has
   searched.** The branch is correct in substance (it commits nothing, shows the validated scope and offers a
   Retry) but its wording now describes a search that did not happen. Changing it is a copy/UX decision, not
   this round's.
2. The three remaining producers still decide visibility from `host.innerHTML` rather than through
   `_irStateHostSync_`. They are correct today; routing all four through one owner is a follow-up.
3. `scrollbar-gutter` is declarative — where an engine does not honour it for this axis the 6px remains. No
   fixed height was added as a fallback, by instruction.
4. `INITIAL_COLD_BOOT_LATENCY_DEBT`, `SHOWSECTION_UI_DEBT`, `ASSET_503_DELIVERY_DEBT` — all still OPEN.
