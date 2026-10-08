# S8-SITE-INVENTORY-RENDER-INTEGRITY-R1 — READ-ONLY AUDIT + PRE-IMPLEMENTATION REPORT

```
READ-ONLY SO FAR. RUNTIME_MODIFIED = NO · DB = NO · API = NO · DEPLOYED = NO
Reported before editing, per §F. Four root causes located; two Decision Gate items open.
```

---

## A — ROOT_CAUSE_RENDER_INTEGRITY  (CONFIRMED — a real defect, not a validator false positive)

`data-leaf-span` carries **two incompatible meanings**, and the fulfillment-aware column feature broke the
coincidence that had kept them equal.

```
MEANING 1 (markup comment, inventory-replenishment.html:422)
  "data-leaf-span = how many level-2 leaf columns each group spans (its colspan).
   It MUST equal the group's CSS width / 120px"                      -> a VISUAL colspan

MEANING 2 (the contract comment above _irHeaderLeafSpan_, IR:1753)
  "The leaf-column contract is DERIVED, never pinned: S(data-leaf-span) across the level-1 group
   header row IS how many body cells one row must carry."            -> a STRUCTURAL cell count
```

The two agree only while no column is hidden.

**What the feature does.** `F1-7N-UX-SITE-INVENTORY-FULFILLMENT-AWARE-COLUMNS-R1` hides platform Current Stock
for `self_fulfilled` by **CSS**:

```
css:600-603   #replen-detail-table.ir-hide-current-stock .km-table__header-cell--current-stock,
              #replen-detail-table.ir-hide-current-stock .replen-cell--current-stock { display: none; }
```

The header leaf and the body cell are both **still in the DOM**; only their paint is suppressed. But the same
feature also rewrites the structural attribute:

```
IR:1742   if (invGroup) invGroup.setAttribute('data-leaf-span', String(m.inventoryLeafSpan));   // 3 -> 2
```

**What the validator measures.** `_irVerifyRenderedRows_` counts **DOM** cells against the **declared** span:

```
IR:   if (leafSpan && rows[i].querySelectorAll('.scroll-cell').length !== leafSpan) badCells++;
```

`_irScrollRowHtml_` **always emits 14** `.scroll-cell` divs — the `replen-cell--current-stock` div is emitted
unconditionally and hidden by CSS. So:

```
platform_fulfilled   Sdata-leaf-span = 1+1+1+3+3+2+2+1 = 14   cells 14   -> OK
self_fulfilled       Sdata-leaf-span = 1+1+1+2+3+2+2+1 = 13   cells 14   -> EVERY ROW FAILS
```

**This reproduces the Production report exactly**: US/Shopify 101/101 rendered and 101 failing "13-column"
validation; US/Target 19/19 and 19 failing. Both are `self_fulfilled`; Amazon is `platform_fulfilled` and is
clean. Row *rendering* is correct and alignment is preserved — the CSS hides the matching header leaf and body
cell together. **The table is right; the contract attribute is lying.**

### Minimal repair (NOT implemented)

Restore `data-leaf-span` to its single documented meaning — *how many body cells a row must carry* — by
**not mutating it**. Nothing depends on it for layout: the hidden-state width is set explicitly
(`width: 240px` under `.ir-hide-current-stock`), so the "width / 120px" identity is simply no longer true
while a column is hidden, and the markup comment must say so.

```
remove   IR:1742  invGroup.setAttribute('data-leaf-span', ...)
keep     _irInventoryColumnModel's inventoryLeafSpan (it still describes the VISIBLE span; tests read it)
amend    the markup comment at inventory-replenishment.html:422 — the width identity holds only when no
         column is hidden; the leaf span is the BODY CELL count
```

Rejected alternative: make the omission structural (row builder emits 13 cells). It is a larger change, it
abandons "the codebase's own column-omission idiom" the feature comment cites, and it would require the fixed
column, the level-2 header and every width rule to vary in lockstep. **The guard is not disabled and no
exception is hardcoded** — it keeps comparing DOM cells to a declared count; the declared count stops lying.

### Existing coverage to re-run
`live-inventory-render-ai-action-and-deployment-identity-f1-7n-fb-4e-r4b-r3` (asserts `headerLeafSpan 14`,
`cellCounts {'14': N}`), `site-inventory-fulfillment-aware-columns-f1-7n-r1`, `replen-header-toggle`
(**already failing at baseline** — it expects a 9-leaf table and the markup has 14; pre-existing, unrelated,
and must not be "fixed" by this round).

---

## B — FULFILLMENT_COLUMN_CONTRACT  (already implemented; one gap, no decision needed)

```
self_fulfilled    hideCurrentStock = true,  leaves 3rd Party Stock -> On the Way        IR:1719-1724
platform_fulfilled / hybrid / unknown      full 3-column Inventory group (fail-safe)
```

Resolved from the canonical `marketplaces.fulfillment_model` via `_irScopeFulfillmentModel()` ->
`_replenDarFulfillmentOf(...)`, keyed by `marketplaceId`. **No marketplace is named in the code** — Shopify,
Target and Walmart appear nowhere in the model. Hybrid keeping both columns matches
`INVENTORY_TABLE_MAPPING_SPEC.md` §16 Rule 4 ("Display Platform Inventory and 3rd Party Inventory — both
sections remain visible"), so **no Decision Gate is required for hybrid**.

The only gap is §B.5 — "integrity validation must support the actual marketplace-specific schema" — which is
exactly the §A repair.

---

## C — ROOT_CAUSE_MARKETPLACE_SELECTOR  (CONFIRMED — stale client cache, not a backend defect)

**The backend is correct and fully data-driven.** `handleInventoryScopeRegistryGet_` ->`scopeRegBuild_`
(`64_api_v1_scope_registry.gs:149/`) reads `marketplaces`, keeps `status` blank-or-`active`, requires
`marketplace_id` + `country`, dedups by `marketplace_id`, sorts deterministically. Nothing is hardcoded.
`MKT-KM-US-TARGET_PLUS` (KM / US / Target Plus / active) satisfies every filter and **would be returned**.

**The client caches the registry for six hours.**

```
assets/js/core/scope-registry.js:109   var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
                              :104     "TTL  a bounded age, so an entry cannot outlive a change that did
                                        NOT move the version."
                              :233-235 clearPersisted is exposed "so a scope change or a WRITE THAT
                                        INVALIDATES CONFIGURATION can drop the stored snapshot explicitly
                                        (§E.7) rather than waiting for the TTL."
```

**The create path never calls it.** `saveMarketplace()` (IR:8546) succeeds and then does:

```
IR:8587   if (typeof populateReplenFiltersFromRegistry === 'function') populateReplenFiltersFromRegistry();
```

`populateReplenFiltersFromRegistry` -> `refreshReplenCountryOptions()` + `refreshReplenMarketplaceOptions()`,
which **repaint from the already-cached model**. No fetch, no cache clear. So the dropdown is rebuilt from a
snapshot that predates the write, and the new marketplace stays invisible for up to six hours — or until the
operator hits the scope-registry **Retry** button, which does force a reload (`_irReloadScopeRegistry_()`).

This is the task's own candidate "**Missing frontend refresh after creation**", and the facility to fix it
already exists and is documented for precisely this case.

### Minimal repair (NOT implemented)
After a successful `upsertMarketplace`, force the registry to re-read before repainting:

```
IR:8587   -> clear the persisted snapshot and reload, THEN populate
             (window.KM.scopeRegistry.reload() — which is cacheClear() + ensureLoaded({force:true}) —
              then populateReplenFiltersFromRegistry())
```

One write path, one call site: `operation-system-db-api.js:3298` records `upsertMarketplace` as **"the only
marketplace writer"**. Satisfies §C.1-C.6 without touching the backend and without creating any record.

> **Secondary finding, recorded not repaired.** `assets/html/pages/inventory-replenishment.html:32-39` ships a
> hardcoded `<option>` list (Amazon / KM Walmart / Target / Shopify / Wayfair / Newegg) whose values are
> marketplace **names**, while the file's own comment eight lines above states "the Marketplace dropdown
> below, whose option value = marketplace_id". These are replaced by `refreshReplenMarketplaceOptions()` on
> every successful registry load, so they are a *fallback*, not the live list — but if the registry ever fails
> they are what the operator sees, and selecting one yields a name where the page expects an id. Out of scope
> here; raised as its own item.

---

## D — ALLOCATION_PRIORITY_DEFAULT  (root cause confirmed; backend change required)

**Today a marketplace created through the UI gets a BLANK priority.**

```
03_master_data_handlers.gs:599
  var allocationPriority = (body.allocation_priority !== undefined && body.allocation_priority !== '')
                            ? body.allocation_priority : '';
                        :648  (CREATE branch)  if (col(...) !== -1 && allocationPriority !== '') newRow[...] = ...
                        :628  (UPDATE branch)  if (allocationPriority !== '' && col(...) !== -1) setValue(...)
```

and `saveMarketplace()` never sends `allocation_priority` (the modal has no such control — which satisfies
§D.4 already). Downstream, blank reads as the lowest priority:

```
43_api_v1_gap_materialization.gs:423   if (ap !== null) priorityByMkt[key] = ap;   // missing -> default 0
inventory-replenishment.js _allocateShared   Math.max(s.allocationPriority, 1)     // blank -> 0 -> clamped 1
```

### Minimal repair (NOT implemented) — and one correctness trap

Apply `100` **only on the CREATE branch**. Defaulting the variable at :599 would make the **UPDATE** branch at
:628 write 100 over an existing value whenever a payload omits the field — which violates §D.6 ("Do not
overwrite existing non-null priorities") and would be a silent production data change on every subsequent
edit. The default must be introduced where the new row is composed (:648), not where the variable is read.

```
numeric type   the engines call gapNum_() / Math.max() -> a NUMBER 100, never the string "100"   (§D.8)
backfill       NONE. Existing blanks are left blank (§D.7)                                        (§D.7)
entry points   one — upsertMarketplace is the only marketplace writer                             (§D.9)
schema         no change; the column exists and is guarded by col('allocation_priority') !== -1
```

---

## E — EXECUTION GOVERNANCE (§F pre-edit report)

```
ALLOWED FILES (if authorized)
  assets/js/pages/inventory-replenishment.js      §A leaf-span, §C registry reload, §A' stale notice
  assets/html/pages/inventory-replenishment.html  §A comment correction only
  assets/specs/active/apps-script/03_master_data_handlers.gs   §D create-branch default      <- BACKEND
  assets/tests/**                                 new + restated suites
  index.html · assets/js/app.js · assets/tests/_release-order.js   cache token
  docs/planning/**                                record

DO-NOT-TOUCH
  the allocation engine (_allocateShared, sitePlanningAllocation, eligible3plWarehouses)  — §B.7
  the F1A scope guard · the F1B preload/commit semantics · the R3 notice position
  60_/63_/01_router/the generated bundle · any DB row · Submit Plan · gap recalculation

DB TOUCH PREFLIGHT        0 rows read-modified-written. §D changes the DEFAULT APPLIED AT CREATE only; no
                          backfill, no schema change, no migration. Existing rows are untouched.
BACKEND / API IMPACT      §D edits ONE Apps Script file. No action added, no request field added, no response
                          field changed, no contract version moved. §A, §B, §C are frontend-only.
CACHE / DEPLOYMENT        application cache token rotates (page JS changes). IR-CSS does NOT rotate unless a
                          stylesheet byte moves — on the current plan none does.
                          APPS_SCRIPT_SYNC_REQUIRED = 03_master_data_handlers.gs, with a NEW DEPLOYMENT
                          VERSION, if §D is authorized. USER-owned.
```

---

## F — DECISION GATE (2 items open)

**GATE 1 — §A.A "clear or neutralize the old table presentation until the next confirmed Search".**
This **conflicts with a frozen contract**. `F1-7N-FB-2A §B` states: *"A selector change marks the displayed
result STALE and requires Search again. It never loads and never repaints the table … **The last CONFIRMED
result stays on screen.**"* The addendum's preference is the opposite behaviour, and it is qualified ("if that
matches the existing canonical search-state contract") — it does not. Options:

* **A1 — remove only the banner.** `_irRenderStaleNotice_` stops emitting; `_irSearch.stale`,
  `_irFiltersDiffer_`, the `seq`/epoch guards and the stale-response rejection all stay. The last confirmed
  result stays on screen, exactly as the frozen contract says. **No contract change. Recommended.**
* **A2 — also blank the table on a selector change.** Satisfies the stated preference but reverses FB-2A's
  frozen UX contract and removes the operator's reference data while they re-pick a scope.

Note: with the banner gone, the only remaining cue that results are stale is the operator's own memory of
having moved a dropdown. A1 accepts that; it is the operator's call.

**GATE 2 — §D is a backend change.** `03_master_data_handlers.gs` is Apps Script. Authorizing §D means an
operator-owned file sync **and a new deployment version**. Nothing in §D can take effect from a frontend
release.

Not a gate: **hybrid** (§B.3) is unambiguous — §16 Rule 4 settles it.

---

## G — PROPOSED ATOMICITY

Four independent repairs; I recommend them as **three** commits, not one:

```
1  §A leaf-span contract + §B.5 validator alignment        frontend, token rotation
2  §C registry reload after the only marketplace write     frontend, same release as 1
3  §D allocation_priority create default = 100             BACKEND, separate, operator sync + deploy
   §A.A banner removal rides with 1 once GATE 1 is answered
```

**STOPPED. No file edited. Awaiting GATE 1 and GATE 2.**
