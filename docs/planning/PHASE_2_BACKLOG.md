# Phase 2 backlog

Items deferred out of P1. Each entry records what was seen, why it was not done then, and what it would cost.


---

# Phase 2 backlog — Product Strategy

Recorded by P1-B8D-R6. **Not in scope for that round**; nothing below was changed by it.

## B2-1 · The duplicated view navigation (IA)

The left sidebar carries six Product Strategy children — Executive Overview, Category Analysis, Deal
Risk, Data Quality, Strategy Workspace, Advanced Details — and the page carries the same six as an
in-page tab rail. Both speak the same canonical routes (`product-strategy/<view>`), so they are two
controls for one decision.

**Proposal:** keep a single `Product Strategy` entry in the sidebar and let the in-page tabs own view
navigation.

Why it is not free:
- `KM_STAGED_SECTIONS_['product-strategy'].children` declares the six, and `mountStagedMenus` builds
  them; several suites assert that the declared children match `PSB_VIEWS`.
- `showProductStrategyView(route)` is the sidebar children's entry point and is also where P1-B8D-R5
  applies a route when the section is already showing. Removing the children does not remove that
  path — it removes its only caller.
- A person who is on another page and wants Deal Risk currently gets there in one click. After the
  change it is two.

## B2-2 · The 390px shell

The sidebar is a fixed 240px at every width, so a 390px viewport leaves a ~118px content column and
every page — not only this one — is unusable at phone width. This is a **shell** concern and cannot
be fixed inside a page stylesheet.

## B2-3 · The S-series brand pass

Left deliberately untouched by R6:
- Two button contracts coexist system-wide (`--btn-radius: 4px` via `.btn`, `--km-button-radius: 6px`
  via `.cr-btn`). Product Strategy uses `.btn`.
- The tab rail's active treatment: shared solid fill vs this page's underline (see the R6 ledger
  entry for the argument on both sides).
- Global typography and spacing unification.


## B2-4 · A scenario override outlives its site

Recorded by P1-B8D-R7. `STATE.overrides` is keyed by SKU. A site change re-derives Category, Series,
currency and the scenario series against the new rows, but an override on a SKU that is listed on
BOTH sites survives the switch — so a price simulated for one marketplace can still be drawn on
another, which is the exact class of confusion this feature exists to prevent.

It is not in R7's scope (§6 forbids touching price calculation) and it is not reachable in the
replayed universe, where no SKU is listed under two companies. The decision to make is whether an
override belongs to the PRODUCT or to the SITE it was simulated on; the answer changes what Undo and
Reset mean, which is why it is a Phase 2 item and not a patch.

## B2-5 · Escape does not close the price-adjustment drawer

Deliberate and documented in `psb-board-ui.js`: the drawer is a workspace rather than a popover, and
Escape inside a form a person is filling in should not throw the form away. P1-B8D-R7 left it alone
and its §2.6 explicitly allows that. Worth revisiting alongside a shared drawer component — there is
still no `.km-drawer` in `components.css` and four pages have now written their own.
