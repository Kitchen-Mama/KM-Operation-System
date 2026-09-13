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
