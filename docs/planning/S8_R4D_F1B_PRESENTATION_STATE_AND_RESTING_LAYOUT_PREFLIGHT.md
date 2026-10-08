# S8-R4D-F1B — SITE INVENTORY PRESENTATION STATE + RESTING LAYOUT PREFLIGHT

MODE: READ-ONLY SOURCE AUDIT / PRODUCT-STATE PREFLIGHT.
`RUNTIME_MODIFIED = NO` · `DEPLOYED = NO` · nothing in `assets/js`, `assets/css`, `assets/html`,
`apps-script/` or the database was touched by this round.

---

## §0 — F1A CLOSED FROM OPERATOR LIVE EVIDENCE

The operator verified the published module by two independent routes (a `performance` resource entry and
`document.scripts`) and then performed live cross-site testing.

```
LIVE_BYTE_IDENTITY            = PASS   inventory-replenishment.js?v=s8r4df1a-scopeguard-20261008
AVG_SALES_CROSS_SCOPE_STALE   = FIXED
S8_R4D_F1A_PRODUCTION         = PASS
F1A_PRODUCTION_SEAL           = YES
AVG_SALES_STALE_SCOPE         = CLOSED
```

Frozen. Not reopened in this round. Suggested Qty remains lazy by decision (F1A §7,
`SUGGESTED_QTY_LAZY = YES`). On-the-Way remains F2 scope.

---

## §1 — THE RESTING-LAYOUT REQUIREMENT, RESTATED AGAINST THE DOM

The three blocks, in `assets/html/pages/inventory-replenishment.html`:

```
#opsSection.page-inventory                        (no CSS rule of its own → display:block)
  h2                                              "Site Inventory Monitor"
  .replen-control-panel                   :7      BLOCK 1   sticky, top:0, z 131
  .fc-modal  × 5                          :114+   display:none; position:fixed  → ZERO flow contribution
  .replen-category-shell#replenCategoryPanel :408 BLOCK 2   sticky, top:--km-sticky-top-base, z 125
    .replen-category-rail#replenCategoryTabs :409
  .dual-layer-table#replen-detail-table    :413   BLOCK 3
```

Declared vertical geometry, `assets/css/pages/inventory-replenishment.css`:

| gap | owner | declaration | computed |
|---|---|---|---|
| BLOCK 1 → BLOCK 2 | `.replen-control-panel` | `:19  margin-bottom: var(--space-lg)` | 24px |
| BLOCK 2 → BLOCK 3 | `.replen-category-shell` | `:1719 margin-bottom: var(--space-lg, 1.5rem)` | 24px |
| BLOCK 3 top | `.dual-layer-table` | `:461  margin-top: 0` | 0 |

`--space-lg: 1.5rem` is defined once, at `assets/css/base.css:90` (`:root`). Both blocks resolve to the
same 24px. The five `.fc-modal` nodes that sit between BLOCK 1 and BLOCK 2 in source order are
`display:none; position:fixed` (`assets/css/pages/fc-overview.css:1093`) and contribute nothing.

**So the two gaps are declared EQUAL and, with nothing else in them, they ARE equal.** The defect is
therefore not a wrong margin value, and changing a margin value would not fix it.

---

## §2 — SPACING ROOT-CAUSE AUDIT

### WHY_CATEGORY_TO_TABLE_GAP_CHANGES

A fourth flow participant lives in that gap and in no other.

`_irStateHost_` (IR:9873) creates `<div id="replenSearchState">` and inserts it **as a sibling
immediately before `#replen-detail-table`** (IR:9884) — i.e. between BLOCK 2 and BLOCK 3. It has no
stylesheet rule at all; it is `display:none` while empty and `display:''` while populated.

Four independent producers write into that one host, each emitting an inline-styled banner carrying its
own `margin: 0 0 8px`:

| producer | line | write strategy | trigger |
|---|---|---|---|
| `_irRenderStaleNotice_` | IR:9887 | `host.innerHTML = …` (**wholesale**) | a Country/Marketplace selector change |
| `_irRenderUnsavedBanner_` | IR:3505 | `insertAdjacentHTML('afterbegin')` | a failed Execution-Plan write |
| `_irRenderDuplicateBanner_` | IR:3561 | `insertAdjacentHTML('afterbegin')` | duplicate stored plan rows |
| `_irRenderDbUnknownBanner_` | IR:3590 | `insertAdjacentHTML('afterbegin')` | an unverified draft state |

The first of those is the one the operator described. `_irMarkSearchStale_` runs on every
Country/Marketplace change; when the pending selectors differ from `applied` it populates the host, and
the 2→3 gap becomes `24px (shell margin) + banner height + 8px (banner margin-bottom)`. Pressing Search
clears it and the gap returns to 24px. **The gap changes on exactly the event §1 names first.**

A fifth, rarer occupant of the same gap: `_irRenderIntegrityNotice_` (IR:1872) inserts
`#replen-render-integrity` before the same table (IR:1882) with `margin:8px 0`.

Margin arithmetic, stated rather than guessed: `#replenSearchState` has no padding and no border, so a
banner's `margin-bottom: 8px` collapses **through** the host and meets `.dual-layer-table`'s
`margin-top: 0`, yielding 8px. The shell's 24px collapses against the host's 0 margin-top, yielding 24px.
Total occupied gap = 24 + bannerHeight + 8.

### WHY_SCOPE_TO_CATEGORY_GAP_CHANGES

**It does not.** Nothing is ever inserted between BLOCK 1 and BLOCK 2; the only occupants of that
position are the five permanently `display:none` modals. That gap has one owner and one value, 24px,
under every state audited.

What does change on a site switch is the **height of the blocks themselves**, which reads to the eye as
a spacing change:

* `.replen-category-rail` is `overflow-x: auto` (css:1736) with `::-webkit-scrollbar { height: 6px }`
  (css:1745). A site whose category count overflows the rail width gains a horizontal scrollbar inside
  the rail; a site whose categories fit does not. BLOCK 2's height therefore changes with the category
  count — which is also §1's third stability condition. `scrollbar-width: thin` is declared, but no
  gutter is reserved, so the space is taken only when the scrollbar exists.
* `.replen-control-panel` is `flex-wrap: wrap`; its height changes with viewport width, and
  `_showDemoBadge` (IR:12300) appends a badge into it.
* `_ensureAllocDraftPanel` (IR:6344) inserts `#alloc-draft-persistence-panel` as `#opsSection`'s
  **firstChild** (IR:6362) — above the `h2`, so it shifts all three blocks down together without
  altering either gap.

### The specific questions, answered

```
Does category content height or a horizontal scrollbar alter the apparent gap?
    The scrollbar alters BLOCK 2's HEIGHT (6px), never the gap. Category COUNT does not wrap
    (flex-wrap: nowrap, css:1730), so it cannot change the rail's line count.

Does a parent container own spacing inconsistently through child margins?
    YES — #opsSection is a plain block with no spacing of its own; both gaps are owned by the
    bottom margin of the block ABOVE them, and the banner host between them owns none at all
    while occupying the gap. Three different owners for one rhythm.

Is margin collapse involved?
    Yes, and it is working correctly: adjacent-sibling collapse yields max(24,0)=24 in both gaps,
    and a banner's 8px collapses through the host. Collapse is not the defect.

Is a sticky placeholder involved before scroll?
    NO. assets/js/core/sticky-header.js (85 lines) creates no element: bindToolbar only writes
    --km-sticky-top-base (sticky-header.js:37). _bindReplenStickyHeader (IR:14327) only writes
    --km-replen-cat-rail-h (IR:14343). Both blocks use position:sticky, which reserves its normal
    flow box at rest. No spacer, no placeholder, no transform.

Is there duplicated spacing ownership?
    YES — CSS owns two margins, JS owns four inline banner margins and one inline `margin:8px 0`.
```

### Verdict

```
RESTING_LAYOUT_ROOT_CAUSE = the BLOCK 2 → BLOCK 3 gap is shared with a DYNAMIC, JS-owned banner host
  (#replenSearchState, _irStateHost_ IR:9884) that is a flow sibling in that gap only. Its most frequent
  writer, _irRenderStaleNotice_, fires on the Country/Marketplace change itself, so the gap grows by
  (banner height + 8px) at the exact moment the operator switches site and shrinks again on Search. The
  BLOCK 1 → BLOCK 2 gap has no such occupant, so the two gaps diverge. Secondary: .replen-category-rail
  reserves no scrollbar gutter, so BLOCK 2's own height changes by the 6px scrollbar whenever the new
  site's category count overflows the rail.

ROOT_CAUSE_CONFIDENCE =
  HIGH   for the banner host — source-proven: the exact node, its exact DOM position, its exact trigger
         and its exact declared margins are all read from the shipped source and cited above.
  MEDIUM for the scrollbar contribution — the declarations are source-proven (overflow-x:auto, 6px) but
         the realised pixel delta per site has NOT been measured live and is not invented here.
```

### CSS_ARCHITECTURE_DEBT

1. **Vertical rhythm has no single owner.** Two CSS margins, four JS inline banner margins, one JS
   inline notice margin, and a container (`#opsSection`) that declares no spacing at all.
2. **Four writers, one host, incompatible strategies.** `_irRenderStaleNotice_` assigns
   `host.innerHTML` wholesale (and `host.innerHTML = ''` when not stale), which **destroys** any
   unsaved / duplicate / DB-unknown banner the other three placed there. That is a correctness defect
   in the same element, not only a spacing one: a Country change can silently erase an
   "Unsaved — database update failed" warning. Recorded here; **not** repaired in F1B.
3. **Banner geometry is an inline `style="…"` string in JS**, invisible to the stylesheet and
   unoverridable by any later CSS round.
4. **The two gap declarations are not written the same way**: `var(--space-lg)` (css:19) versus
   `var(--space-lg, 1.5rem)` (css:1719). Identical today; silently divergent the day the token is
   renamed, because the first becomes invalid-at-computed-value-time (margin 0) and the second falls
   back to 24px.
5. `--km-sticky-header-total` is re-derived page-locally (css:1934) because the `:root` value was wrong
   for this page — the sticky framework's totals are not owned in one place.

### MINIMAL_SAFE_FIX (described; NOT implemented)

Three changes, none of which touches sticky behaviour, the scrolled state, the search state machine, or
any request:

1. **Take the dynamic occupant out of the gap.** Move `#replenSearchState` and
   `#replen-render-integrity` from "sibling before `#replen-detail-table`" to **first child of
   `#replen-detail-table`**. Both gaps then have exactly one owner each and no dynamic occupant, so
   they are equal by construction under every §1 condition. Cost: two `insertBefore` call sites
   (IR:9884, IR:1882) and the banners' own `margin` strings.
2. **Reserve the rail's scrollbar gutter** so category overflow cannot change BLOCK 2's height:
   `scrollbar-gutter: stable` on `.replen-category-rail`, with a `min-height` floor for the WebKit
   `::-webkit-scrollbar` path.
3. **Make the two gap declarations identical** — give css:19 the same fallback css:1719 has.

Deliberately NOT proposed: changing either margin's value (they are already equal); reserving a fixed
banner height (it would trade one unstable gap for permanent dead space); converting `#opsSection` to a
flex column with `gap` (an occupied banner host would then collect a gap on BOTH sides and the problem
would get worse).

---

## §3/§4 — PRELOAD VERSUS VISUAL COMMIT: THE STATE-MACHINE AUDIT

### What the four conceptual states map to today

| concept | today's authority | notes |
|---|---|---|
| `SELECTED_SCOPE` | the DOM, read by `_irPendingFilters_` (IR:9805) | live, uncommitted |
| `APPLIED/VISIBLE_SCOPE` | `_irSearch.applied` (IR:9795), read by `_irRenderScope_` (IR:9813) | assigned in **exactly one** place, `_irApplySearch_` (IR:10613) |
| `LOADING_SCOPE` | **does not exist** | `_irSearch.status` is a status and `_irSearch.seq` a sequence; neither is a scope |
| `PRELOADED_SCOPE` | **does not exist, and does not need to** | see below |

The reason the last two are absent is the single most important fact in this audit, and it is
source-proven rather than inferred:

```
IR:10396   var _wsPayload = { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() };
```

**The first-layer request carries no scope.** `buildInventoryReplenishmentRequestDTO`
(`assets/js/api/km-api-foundation.js:1303`) adds `payload.siteScope` only when a caller passes one, and
the only caller that does is the lazy exposure read (IR:9182). The page's own arbiter comment states the
consequence outright (IR:10322): *"this read carries no scope, so its answer is not about the old scope
at all — the same bytes serve whatever the operator has selected by the time they arrive."*

The server returns the first-layer table set; the **client** scopes it at render time from
`_irSearch.applied`. A retained model is therefore not "the previous scope's data".

### The commit is already a separate statement from the preload

In `_irBootstrapScope_` (IR:9616), the COALESCED branch does two distinct things ~20 lines apart:

```
IR:9691   var wsP = Promise.resolve(_irWorkspaceRefresh_({ carrier:true, quiet:true,
                      owner:'COALESCED_BOOTSTRAP', … }))        ← THE PRELOAD
IR:9739   _irApplySearch_(remembered, mySeq);                    ← THE VISUAL COMMIT
```

Nothing between them couples the two beyond registry validation. The preload survives the removal of the
commit untouched.

### The reuse path already ships

`searchReplenishment` (IR:10524) already short-circuits on a retained model:

```
IR:10547   if (_irReadModel) { _irApplySearch_(pending, mySeq); return; }
```

A Search against an already-loaded model issues **zero** first-layer requests and commits client-side.
Because the model is scope-independent this holds for **any** scope, not only the preloaded one.

### A Search pressed while the preload is still in flight

Both the preload and the Search read pass `quiet: true`, so `_irReadIsCritical_` (IR:10296) is false for
both and the boot arbiter does not dedupe them. The dedupe happens one layer lower:
`km-api-foundation.js:871–876` computes `canonicalScope({ v: dto.apiVersion, p: dto.payload })` for every
read that supplies no abort signal — which this one does not — and hands it to
`scopedSingleFlight` (`km-transport.js:633`), which returns the in-flight promise and counts
`_metrics.coalesced` instead of dispatching. Preload and Search build **byte-identical** payloads, so the
second one coalesces onto the first.

(This is the same mechanism that made the E5 probe's `wall_ms = 6194` untrustworthy. It is cited here as
a known, already-characterised behaviour, not as a new discovery.)

### Answers

```
CAN_BACKEND_PRELOAD_BE_SEPARATED_FROM_VISUAL_COMMIT = YES
    The preload and the commit are already two statements (IR:9691, IR:9739) and the read carries no
    scope, so the preload has nothing to commit.

CAN_PRELOADED_RESULT_BE_REUSED_ON_SEARCH = YES
    Unconditionally, for any scope — not CONDITIONAL — because the first-layer payload is identical for
    every scope (IR:10396) and the scoping happens at render time from `applied`. The reuse branch
    already exists and already ships (IR:10547).

DUPLICATE_REQUEST_AVOIDABLE = YES
    Preload lands before Search → IR:10547 short-circuits, zero requests.
    Preload still in flight at Search → transport-level coalescing (km-transport.js:633).
    Neither case needs a new mechanism.

DOES_THIS_REQUIRE_BACKEND_CHANGE      = NO
DOES_THIS_REQUIRE_API_CONTRACT_CHANGE = NO
DOES_THIS_REQUIRE_DB_CHANGE           = NO
```

---

## §5 — THE F1A GUARD UNDER THE PROPOSED SEPARATION

The F1A invariant is frozen and every option below preserves it:

> A scope-dependent async result may only be consumed for a visible result whose applied scope matches
> the result's scope stamp.

Under Option C the guard is not merely preserved, it is **less exercised**:

* The only entry point to the scope-dependent chain is `_irRecoTrigger()` (IR:13206), called from
  `_irApplySearch_` and from nowhere else. With no commit during preload, **no scope-dependent async
  request runs before Search at all**, so no result can exist to be mis-stamped.
* Before the first commit, `_irSearch.applied` is `null` and `_irAppliedScopeKey_()` returns `''`.
  `_irResultMatchesAppliedScope_` (IR:9849) requires a **string** stamp and refuses `null`, so an
  unstamped result stays refused. `_irRecoBlank` stamps `appliedScopeKey: null` and therefore renders
  PENDING, not zero — the F1A §7 contract.
* `_irResultMatchesAppliedScope_` and `_irAppliedScopeKey_` are not touched by any option here.

```
AVG_SALES_STALE_SCOPE_POST        = 0   (preserved)
SUGGESTED_QTY_STALE_SCOPE_POST    = 0   (preserved)
LATE_RESPONSE_WRONG_SCOPE_COMMIT  = 0   (preserved)
F1A_SCOPE_GUARD_PRESERVED         = YES
```

**One branch needs an explicit operator decision in the implementation round.** `_irBootstrapScope_`'s
RESTORED branch (IR:9634–9666) paints *without* going through `_irApplySearch_`: it sets
`_irSearch.status = 'READY'` and calls `renderReplenishment()` directly. It is reachable only when
`_irRestorableResult_` (IR:9567) finds `_irSameScope_(_irSearch.applied, remembered)` already true —
i.e. same-session re-entry after the operator *has* pressed Search, with a completed result less than
`_IR_RESULT_TTL_MS` (10 min) old. That is arguably an already-committed result returning to view rather
than an uncommitted one appearing. F1B must say which it is; it is listed in §9 as decision D-R.

---

## §6 — THE CANDIDATE STATE MODEL

```
RESTORED          selectors restored from remembered scope
PRELOADING        the scope-free first-layer read may run
READY_TO_SEARCH   selectors usable; main table NOT visually committed
SEARCH_APPLIED    the operator pressed Search
RESULT_VISIBLE    only an explicitly applied scope owns the main table
```

Introducible **frontend-only**. Mapping onto what exists:

| candidate state | existing carrier | change needed |
|---|---|---|
| RESTORED | `_irSetSelectors_` (IR:9607) | none |
| PRELOADING | `_irSearch.status` + `_irBootstrap.mode` | the status must stop being `LOADING` for a read nobody is watching, or the gate paints "Searching…" over a table the operator did not ask for |
| READY_TO_SEARCH | `_irSearch.status = 'PRE_SEARCH'` | the existing PRE_SEARCH branch of `_irRenderSearchGate_` (IR:9927) already renders exactly the right sentence; a dedicated fifth state is optional, not required |
| SEARCH_APPLIED | `_irApplySearch_` | none |
| RESULT_VISIBLE | `_irSearch.applied` | none — it is already the sole authority |

The three §6 prohibitions are all satisfiable without new machinery:

* *Do NOT discard useful preload data* — `_irReadModel` is retained by the preload regardless of whether
  a commit follows; nothing discards it.
* *Do NOT issue a second identical first-layer request after Search* — IR:10547 plus transport
  coalescing, as proven in §4.
* *Do NOT allow preload completion itself to change the visible applied scope* — satisfied by
  construction once the `_irApplySearch_` call at IR:9739 is removed from the bootstrap, because that is
  the only place `applied` is ever assigned.

---

## §7 — SEPARATELY RECORDED, NOT REPAIRED HERE

```
INITIAL_COLD_BOOT_LATENCY_DEBT = OPEN
    Operator observation: ~10–15 s on initial application cold load. NOT measured by this round and NOT
    attributed. The only first-layer figure this project has measured remains the frozen E5 canonical
    baseline: serverDurationMs 6197 for 13 tables, 7299 rows. No other latency number is asserted.
SHOWSECTION_UI_DEBT      = OPEN
ASSET_503_DELIVERY_DEBT  = OPEN
```

---

## §8 — F1B VERSUS F2 ORDERING

F2 (On-the-Way first-layer aggregate) changes **what the first-layer read contains** — it adds Shipment
tables to `IR_FIRST_LAYER_TABLES_` and replaces the hard-coded `onTheWay: 0` (IR:12168) with a real
projection. F1B changes **when the result is committed to the screen**. They touch different things, but
they interact in one direction that matters:

* F2 makes the first-layer read **heavier**. Under today's auto-commit that extra cost lands on a table
  the operator is watching, during the mount they did not ask for.
* Under Option C the same extra cost lands on a preload nobody is watching, and Search still commits
  from memory at IR:10547.

So the ordering is not neutral: **F1B first** converts F2's added read cost from visible waiting into
invisible preloading. The reverse order ships a measurable regression and then removes it.

Second reason: both rounds work in the neighbourhood of `_irApplySearch_` / the first-layer read
composition. Doing the lifecycle change first means F2 lands against a settled lifecycle rather than
re-deciding one.

```
F1B_BEFORE_F2_RECOMMENDED = YES
```

The **layout half** of F1B (§1/§2) is fully independent of F2 and of the state machine, and could ship
in its own round in either order.

---

## §9 — DECISION GATE

### OPTION A — keep auto-load + auto-show (today)

| axis | assessment |
|---|---|
| startup network cost | registry + 1 first-layer read (COALESCED branch, IR:9691) |
| time-to-visible-after-Search | zero — already visible |
| state complexity | lowest; 2 authorities, 1 assignment point |
| duplicate-request risk | none |
| stale-result risk | the RESTORED branch may paint a result up to 10 min old before revalidation; derived fields are covered by the F1A guard |
| operator clarity | **this is the rejected property** — a committed table appears for a scope the operator never confirmed this session |
| F1A compatibility | yes (shipped) |
| F2 compatibility | yes, but F2's additional tables land on an auto-shown first paint |

### OPTION B — no preload; Search triggers the first-layer read

| axis | assessment |
|---|---|
| startup network cost | registry only — one request fewer than A |
| time-to-visible-after-Search | a full first-layer read every time. Frozen measurement: `serverDurationMs 6197` |
| state complexity | lowest of the three — delete the COALESCED branch entirely |
| duplicate-request risk | none |
| stale-result risk | none; nothing is retained before Search |
| operator clarity | highest — nothing exists before it is asked for |
| F1A compatibility | yes |
| F2 compatibility | **worst** — F2's extra tables are added to the read the operator now waits for synchronously, every Search |

### OPTION C — preload the data, require explicit Search for the visual commit

| axis | assessment |
|---|---|
| startup network cost | identical to A — same request, same payload, same timing. No increase |
| time-to-visible-after-Search | preload landed → **zero requests**, client-side commit (IR:10547). Preload in flight → coalesces onto it (km-transport.js:633); no second dispatch |
| state complexity | one branch changed (remove the commit at IR:9739), one decision on the RESTORED branch, optionally one new status label. Modest |
| duplicate-request risk | none — proven in §4, by two independent existing mechanisms |
| stale-result risk | **lower than A** — nothing scope-dependent runs and nothing is visible before an explicit commit |
| operator clarity | meets the stated requirement: the table is committed only by an explicit Search |
| F1A compatibility | preserved, and less exercised (§5) |
| F2 compatibility | **best** — the heavier read is absorbed before the operator asks for it |

### RECOMMENDED_OPTION = C

It is the only option that satisfies the operator's requirement without paying for it. B buys the same
clarity and charges the full first-layer read for it on every Search, and charges more once F2 lands. C
costs nothing at startup relative to today, needs no backend, API or DB change, and both of the
mechanisms that make it free are already shipped and already proven.

### Decisions the implementation round must take

```
D-R  the RESTORED branch (IR:9634) — does a same-session re-entry with an ALREADY-APPLIED scope
     repaint without a Search, or does it also become READY_TO_SEARCH?
     Recommendation: REPAINT. `applied` was set by a real Search in this session and is unchanged;
     requiring a second Search for a scope the operator already confirmed would be clarity theatre.
     This must be an explicit operator decision, not a silent choice.

D-S  does PRELOADING get its own status label, or does it reuse PRE_SEARCH?
     Recommendation: reuse PRE_SEARCH. Its existing gate sentence (IR:9927) is already correct, and a
     fifth state would need its own render branch for no new truth.

D-F  does the preload still run when there is NO remembered scope?
     Recommendation: NO — unchanged from today (REGISTRY_ONLY, IR:9620). There is nothing to preload
     for and nothing to overlap.
```

---

## §10 — REQUIRED REPORT

```
S8_R4D_F1B_PREFLIGHT = PASS

F1A_PRODUCTION_SEAL = YES
LIVE_BYTE_IDENTITY  = PASS

RESTING_LAYOUT_ROOT_CAUSE = a dynamic JS-owned banner host (#replenSearchState, IR:9884) is a flow
  sibling in the BLOCK 2 → BLOCK 3 gap and in no other; its most frequent writer fires on the
  Country/Marketplace change itself. Secondary: .replen-category-rail reserves no scrollbar gutter, so
  BLOCK 2's height changes with the new site's category count. The two margins are already equal (24px).
CSS_ARCHITECTURE_DEBT   = 5 items, §2
MINIMAL_SAFE_LAYOUT_FIX = 3 changes, §2 — relocate the banner host into the table card; reserve the rail
  scrollbar gutter; align the two gap declarations. No margin VALUE changes.

CURRENT_AUTO_LOAD_SOURCE     = _irBootstrapScope_ COALESCED branch, IR:9691 (_irWorkspaceRefresh_)
CURRENT_VISUAL_COMMIT_SOURCE = _irApplySearch_, IR:10613 — the sole assignment of _irSearch.applied;
                               called from the bootstrap at IR:9739

CAN_PRELOAD_BE_SEPARATED_FROM_VISUAL_COMMIT = YES
CAN_PRELOADED_RESULT_BE_REUSED              = YES (unconditionally — the first-layer payload is
                                              scope-free, IR:10396)
DUPLICATE_REQUEST_AVOIDABLE                 = YES (IR:10547 + km-transport.js:633)

BACKEND_CHANGE_REQUIRED = NO
API_CHANGE_REQUIRED     = NO
DB_CHANGE_REQUIRED      = NO

OPTION_A = keep auto-load + auto-show — zero time-to-visible, but commits a scope the operator never
           confirmed; this is the rejected behaviour
OPTION_B = no preload — maximal clarity, pays a full first-layer read on every Search and gets worse
           when F2 lands
OPTION_C = preload + explicit visual commit — same startup cost as A, zero-request commit on Search,
           lower stale risk than A, best fit with F2

RECOMMENDED_OPTION = C

F1A_SCOPE_GUARD_PRESERVED = YES

F1B_BEFORE_F2_RECOMMENDED = YES

INITIAL_COLD_BOOT_LATENCY_DEBT = OPEN
SHOWSECTION_UI_DEBT            = OPEN
ASSET_503_DELIVERY_DEBT        = OPEN

RUNTIME_MODIFIED = NO
DEPLOYED         = NO
```

### NEXT_STEP_PROPOSAL

Stopped at the Decision Gate. On approval of Option C and of D-R / D-S / D-F, F1B implements in one
round, frontend-only, as two independent halves that can also be split:

1. **Lifecycle** — remove the `_irApplySearch_` call from the bootstrap's COALESCED branch, keep the
   preload, settle the RESTORED branch per D-R. Deterministic source tests: preload populates
   `_irReadModel` without assigning `applied`; Search after a landed preload issues zero reads; Search
   during an in-flight preload coalesces rather than dispatching; no scope-dependent request exists
   before the first commit; the F1A guard assertions re-run unchanged.
2. **Layout** — the three §2 changes, with a fixture asserting both gaps compute equal across the five
   §1 conditions.

A cache-token rotation will be required for either half, on the published-token protocol.
