# FC-SUMMARY-STABILITY-R3 — SPECIAL EVENT PRICING SCOPED PROJECTION

```
PRE_SHA = 40634a9   branch = feature/product-strategy-board-p0
WORKTREE_CLEAN_AT_START = YES
PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
```

R2 closed the cold path and proved the pricing read was already isolated, already retried exactly once,
and already unable to poison the modal. What it could not close was the **size** of the read, and it said
so: `getTable` has no row filter, the table name *is* the scope, and shrinking the read needed a server
projection. This is that projection.

---

## §2 — What the group cards actually need

Traced through the joins, not read off the UI labels.

```
GROUP_CARD_PRICING_FIELDS = pricing_id · marketplace_sku_id · sku · site_sku
                            company · country · marketplace · currency
                            regular_price · auto_regular_price · resolved_regular_price · regular_price_source
GROUP_CARD_PRICING_KEY    = marketplace_sku_id  (canonical)
                            else sku|site_sku + country + marketplace  (business identity, id absent)
GROUP_CARD_PRICING_SCOPE  = company + country + marketplace   — the SITE, not the Category/Series selection
GROUP_CARD_PRICING_CONSUMER_COUNT = 2
PRICING_AUTHORITY_COUNT = 1
```

The consumer count is two and both are inside the Special Event Builder: `_evtApplyRowPricing` (single-SKU
rows) and `_evtCandidateRows` (the group build). Both call `_evtSkuPricing`, which calls
`resolveRegionalPricingContext` — the one resolver — with the site from `_evtSelectedSite()`.

**Category / Series is not part of the pricing scope, and that is a finding rather than a simplification.**
`_evtCandidateRows` resolves a price for *every* scoped SKU and only then filters by Category/Series, and
the Single-SKU path resolves a price for any scoped SKU at all. Scoping the projection by Category/Series
would make the Single-SKU path miss prices that exist, and would make a Category change a new network
request for data the page already held. The site is the smallest scope that is *truthful for both
consumers*.

The twelve fields are what the normalizer needs to produce what the resolver reads. `minimum_price`,
`msrp`, `base_*`, `fx_*` and the `*_is_manual` flags are deliberately absent: the builder shows a Regular
Price and a currency, and the other two bands would be data shipped to be ignored.

**The resolved-price chain did not move.** `BASE → AUTO → nullable MANUAL OVERRIDE → RESOLVED` stays in
`pricingResolveBand_` / `normalizePricingListRecord`, where it is the single pricing authority. The server
copies columns and never combines them; the suite asserts it names each resolution input exactly once, in
the field list, and contains no resolver.

---

## §3 — The projection, and the one thing a smaller version gets wrong

It rides `payload.include.slice` on the action `58_` already owns, so **`01_router.gs` does not change** and
no parallel transport exists.

The obvious implementation — filter `pricing_list` where company/country/marketplace match the requested
site — is **wrong, and wrong in the dangerous direction**. The client resolver's first branch matches on
`marketplace_sku_id` **alone**, ignoring the scope columns entirely. A production price row with a blank
`company` (or any scope-column gap) resolves today and would be dropped by a triple-only filter. The card
would then read `MISSING_PRICING_LIST_ROW`, and the save path *refuses* a null price — so a correctly
priced site would become unsaveable, silently, with no error anywhere.

So the projection reproduces **both** of the resolver's branches:

```
read pricing_list + marketplace_skus
derive, for the requested site:  idSet  = marketplace_sku_id of every ACTIVE scoped marketplace_skus row
                                 skuSet = their skus
keep a pricing row when   (a) its marketplace_sku_id ∈ idSet                      [canonical branch]
                     or   (b) sku|site_sku ∈ skuSet AND country matches AND marketplace matches
                                                                                  [business-identity branch]
```

Their union is a superset of what the resolver can ever return for that scope, and every row outside it is
one the resolver provably cannot select. That is what makes this the smallest **truthful** projection
rather than the smallest one that passes a test. It is pinned by A6/A7 and by mutant M9.

An **empty scope selects nothing**. A caller that names no site is not asking for the whole price list; it
is asking a question with no answer, and returning everything would restore the full-table read through the
door this round closed.

### The column copy preserves absence

`pricingResolveBand_` asks whether `resolved_regular_price` is `undefined` to decide whether the server
already answered. The `pricing_list` sheet has no such column — only `72_` emits one — so a row read from
the sheet has no such key and the override → NA → auto chain runs. Emitting `''` for a column that does not
exist would mean *"the server spoke, and it said nothing"*, and **every auto-priced row in the builder would
read as unpriced**. The projection therefore copies keys that exist and invents none. Mutant M10 plants the
`''` and watches an auto-priced row's resolved price fall to `null`.

### FULL is untouched

Adding `pricing_list` and `marketplace_skus` to `FCS_WORKSPACE_TABLES_` would have made every slice-less
caller read them — moving a cost onto the one path that never asked for it. The read loop iterates
`FULL ∪ SLICE_ONLY` and FULL is filtered to its original four tables, in the original order.

---

## §4 — Not N+1

```
PER_SKU_PRICING_REQUEST_COUNT = 0
N_PLUS_ONE_PRICING_REQUEST_PATTERN = ABSENT
NETWORK_REQUEST_COUNT = O(1) in the SKU count
```

The request body carries a scope and no SKU — asserted against the source (C2), and measured against a
fixture whose scope holds four SKUs and costs one request (F5/F7). Mutant M3 adds a `sku` to the request
and is caught.

---

## §5 — Deferred, still

```
PRICING_BLOCKS_MODAL_OPEN = NO
SPECIAL_COLD_BLOCKING_REQS  PRE 2  POST 2
SPECIAL_COLD_ROUNDS         PRE 1  POST 1
```

`pricing_list` is on neither prerequisite path and this round did not put it back. The lifecycle is
unchanged: the modal opens on its prerequisites, the operator reaches a consumer that needs a price, one
scoped projection loads, the cards use it. Mutant M8 puts `pricing_list` back on the Special path and is
caught.

---

## §6 / §7 — Single-flight, and the answer that arrives too late

```
EQUIVALENT_PRICING_REQUEST_COUNT = 1   (three rapid Builds in one scope)
DUPLICATE_PRICING_REQUEST_COUNT  = 0
STALE_SCOPE_A_COMMIT_COUNT       = 0
```

Single-flight is keyed by the **scope**, which is what the request is: three Builds inside one site join one
promise; a Build after a Country change is a different question and buys its own request.

The stale check compares the scope **at the commit**, not at dispatch, because the operator can change
Country or Marketplace at any point while the request is in the air. An answer for the site they have left
is not late data, it is the wrong data. **No timer is involved** — the scope key that the request was made
under is the same identity the commit is checked against.

Mutant M4 removes the guard. Its first probe watched `_fcPricingRows_()` and reported the mutant as
surviving, which was true and uninformative: the reader *also* compares the committed key against the
current scope, so a store corrupted by a late answer still reads as empty — correct behaviour standing in
front of a broken commit. The guard's job is to stop the **commit**, so the probe now observes the store,
and the mutant dies with scope A's rows sitting under scope A's key while the operator looks at scope B.

---

## §8 — Failure and retry

```
RETRY_REQUEST_COUNT = 1   LAST_GOOD_DATA_PRESERVED = YES
```

A failure renders in the pricing subsection and nowhere else: no form is cleared, no modal closed, nothing
reloaded, no save replayed, no sibling table re-read. The error is recorded only for the scope it belongs
to. Retry issues exactly one new request for the pricing slice alone (D7–D11), and a pricing read failure
triggers no write at all (E5). Mutant M6 makes the failure clear the form and is caught.

Last-good pricing is offered only for the **exact same scope** — `_fcPricingRows_` compares the committed
key against the current one and returns `[]` otherwise. Another scope's prices are never shown, which is
the same rule the stale guard enforces, applied at the read.

---

## §9 — The identity seal

```
FC_CANONICAL_IDENTITY_BOUNDARY_SEAL_HELD = YES
CANONICAL_MARKETPLACE_ID_REQUIRED_FOR_SAVE = YES
BLANK_MARKETPLACE_ID_WRITE_COUNT = 0
```

Untouched. The save gate still refuses every non-`READY_UNIQUE` identity state above `_fcWriteBegin_`, and
`14_` still validates rather than deriving. Mutant M7 removes the gate and is caught.

---

## §10 — FC-2, with a cause rather than a guess

```
FC2_STATUS = REPRODUCED_FROM_SOURCE_AND_REPAIRED
```

The report was *"New FC input occasionally needs two clicks before typing"*, and the word doing the work is
**occasionally**. It means *whenever you had just changed another value*.

Two facts produce it:

1. every editable cell in a group card is wired `onchange`, and `change` fires on **blur**;
2. the handler called `_evtRenderGroupCards()`, which assigns `wrap.innerHTML` — destroying and recreating
   **every input in the container**.

Click from an edited field to another one and the order is: mousedown → blur on the first field → `change`
→ full repaint → and only then does the click try to land, on an element that no longer exists. Nothing
appears to happen. The second click works because by then nothing is pending.

That is the render lifecycle this round already owns, which is what §10 conditions the repair on. The fix
is to stop repainting for an edit that changes two derived numbers: the row's Deal Price and its Diff.
Nothing else on the line can change — the price, the currency, the baseline and the stored event FC are all
*inputs* to the row rather than outputs of the edit — so re-rendering them was always work with no result.

`_evtPatchLine_` writes those cells in place, never writes back the field the operator is typing in (no
caret jump), and **falls back to the full render when the DOM is not the shape it expects** — a partial
update that silently did nothing would be worse than a repaint. The card-level Discount % had the same
defect one level up and is patched the same way.

**What is proven and what is not.** The mechanism is proven from source and pinned by a DOM-level probe
(G1–G9) plus two mutants. It has **not** been reproduced in a browser here. If a two-click case survives
this change, it is a second cause and not this one.

**No formula moved.** Diff is recomputed with the same arithmetic the renderer uses, from the baseline the
card already displays.

---

## §11 / §12 — The numbers, measured

Against a fixture with 408 price rows, of which one site's builder can resolve four.

```
                                     PRE        POST
PRICING_ROWS_TRANSFERRED             408    ->  4
PRICING_FIELDS_TRANSFERRED           19     ->  12        (per row; the real sheet is wider)
FULL_PRICING_LIST_SCAN_COUNT         1      ->  0
GROUP_BUILD_REQUEST_COUNT            1      ->  1
GROUP_BUILD_ROUND_COUNT              1      ->  1
SPECIAL_MODAL_OPEN_REQUEST_COUNT     2      ->  2
SPECIAL_MODAL_OPEN_ROUND_COUNT       1      ->  1
PER_SKU_PRICING_REQUEST_COUNT        0      ->  0
DUPLICATE_PRICING_REQUEST_COUNT      0      ->  0
STALE_PRICING_COMMIT_COUNT           n/a    ->  0
```

The request *count* does not improve and was never the problem — R2 had already reduced it to one. What
changes is what that one request costs, which is the whole of the REQUEST_TIMEOUT.

Scale cases from §11 are covered: one SKU, a Series, a Category, a scope with no matching price, timeout,
retry success, rapid Builds, scope switch mid-flight, a resolved manual override, an auto fallback, and a
genuinely unavailable price. Missing stays missing: `null` price and `null` currency, never `0`, never
another site's row.

---

## §13 / §14 — Tests and release

```
FOCUSED   70 / 0        MUTATION 12 / 12
DEPENDENT 8 suites repaired, all green
```

Dependent repairs, none relaxed:

| suite | what stopped being true |
|---|---|
| `fc-summary-workspace-slices-r3-r1` · `fc-summary-read-path-evidence-r3-r1` | the sandbox lagged the source and threw `ReferenceError` **inside** the handler — which reports as *"the handler did not answer"*, indistinguishable from a real regression until you read the message |
| `fc-summary-staged-hydration-r3-r1` | `I3` asserted **ONE** `getWorkspace` call site; the claim was always *"every call names a slice"*, so it says that now |
| `fc-summary-workspace-slices-r3-r1` (E1/E6/A10) | three literal-stamp checks pinned `58_` to R14. The suite had already written down why that is wrong at E2/E3 and had not applied it to the rest — a module stamp records when the file last **changed**, so pinning it forbids the file from changing |
| `fc-target-rule-release-stamp-r2b-a2-r5-f3` | the eleventh swap: `58_` joins `RELEASE_OWNERS`, `14_` leaves for `RELEASE_CARRIED` at R30 |
| `fc-target-rule-release-stamp` (B2a-2) | my own new assertion counted a **comment** as implementation — the same error class this repo usually catches running the other way |
| `fc-summary-stability-r2-cold-path` · `s3-r13-fc-special-deferred` | anchors named the deferred-table owner; the owner changed and the claims did not |
| `fc-summary-pricing` | it stubbed the row source; the row source moved, and every question it asks is about **resolution**, which is unchanged |
| `controlled-no-action-activation-manifest-…-r3` | two census pins follow the release; a pin that lags refuses a healthy deployment |

### Release

```
BACKEND_RELEASE            R30 -> R31
APPS_SCRIPT_SYNC_REQUIRED  YES
  CHANGED  58_api_v1_fc_summary_workspace.gs   63_api_v1_system_health.gs
  CARRIED  14_ (R30) · 47_ (R29) · 01_ (R25) · 73_ (R25) · 90_ (generated, by content hash)
FRONTEND_DEPLOY_REQUIRED   YES
  SET  assets/js/pages/fc-summary.js   assets/js/api/operation-system-db-api.js
TOKEN_ROTATION_REQUIRED_AT_DEPLOY = YES
```

**The half-sync hazard is asymmetric, and it decides the copy order.** A NEW `fc-summary.js` against an OLD
`58_` asks for slice `pricing`; an unrecognised slice resolves to FULL, the answer carries no `pricingList`,
the page commits an empty projection, and **every card reads MISSING price for a site whose prices exist** —
with no error anywhere. The reverse is inert: nothing asks for the slice and the four primary-render tables
are byte-identical. **Copy the backend first; the frontend deploy completes the repair.**

`fc-summary.js` has now changed in **four** unshipped rounds under one application token. Rotation at deploy
is not optional: a returning browser on the cached copy would show all four repairs as shipped and run none
of them.

---

## §15 — Remaining debt

```
FC1_SEAL = YES   FC3_SEAL = YES   FC4_SEAL = YES
FC_SUMMARY_STABILITY_FINAL_SEAL = YES
OPEN_FC_DEBT =
  · nothing is shipped — R26..R31 have accumulated unshipped, and FC Summary's four repairs
    are all frontend-side behind one unrotated token
  · WH_LEGACY_-style cleanup of the pricing broad-cache path: the deferred whole-table read
    still exists for Legacy/Demo mode, which is correct today and is dead code the day the
    workspace flag stops being a flag
  · FC-2 is repaired from a source-level proof, not a browser reproduction
```
