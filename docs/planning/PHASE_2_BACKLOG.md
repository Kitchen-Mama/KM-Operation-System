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


## B2-4 · A scenario override outlives its site — CLOSED by P1-B8D-R8, with a correction

**The R7 description of this item was wrong and is corrected here.** `STATE.overrides` is NOT keyed
by SKU. It is keyed by `SEL.scenarioSiteKey(site)` → series → price field
(`psb-selectors.js:607`), so an override made on one site was never APPLIED to another; a site with
no entry under its own key has no simulation, whatever SKUs it lists.

What WAS true, and what R8 fixes, is quieter: the overrides stayed in memory across a site change,
stayed in the drawer footer count ("Active overrides: 3"), and came back in full the moment somebody
returned to the first site. In a meeting that is a number on a chart whose origin nobody in the room
can reconstruct.

R8 adopts the conservative rule the USER agreed: **when the canonical site identity — company +
country + marketplace — changes, every unpersisted override goes**, along with the undo stack, the
series, the form input and the chip, and the drawer closes. A different VIEW, a different CATEGORY, a
different SERIES and a leave-and-return of the same site all keep it. Nothing is written anywhere in
either case. It is a mount argument (`clearScenarioOnSiteChange`) defaulting OFF, so the prototype —
where the site ladder IS how you browse the fixture — is unchanged.

## B2-5 · Escape does not close the price-adjustment drawer

Deliberate and documented in `psb-board-ui.js`: the drawer is a workspace rather than a popover, and
Escape inside a form a person is filling in should not throw the form away. P1-B8D-R7 left it alone
and its §2.6 explicitly allows that. Worth revisiting alongside a shared drawer component — there is
still no `.km-drawer` in `components.css` and four pages have now written their own.

## B2-6 · A shared drawer component

Four pages have now written their own — `.glm-drawer`, `.oow-drawer`, one in sku-regional-details and
`.scn-drawer`. There is no `.km-drawer` in `components.css` and no `--drawer-*` token.

P1-B8D-R8 supplies the argument for making one. `.scn-drawer` was `position: fixed; top: 0;
z-index: 60` under a `.top-header` that is `position: fixed; top: 0; z-index: 2000` — so its entire
head row, including the close button, was painted **underneath the application's header bar**. It was
invisible for two rounds and it passed every test, because a synthetic `.click()` bypasses hit-testing
and every assertion about the control was true. R8 fixed it with `top: var(--header-height, 56px)`,
which is correct and is also the fourth place in this repository where a page works out for itself
where the shell's chrome ends. A shared drawer would own that offset once.
