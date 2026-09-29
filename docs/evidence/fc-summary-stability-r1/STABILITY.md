# FC-SUMMARY-STABILITY-R1 — prerequisite lifecycle · false empty · cold path

**Base** `9a42bb1` · `PRODUCTION_ROWS_WRITTEN = 0` · `S6_BEHAVIOR_CHANGED = NO` · frontend only

Suite: `assets/tests/fc-summary-stability-r1-false-empty.test.js` — 34 passed / 0 failed, 4/4 mutants.

```
PRE_SHA = 9a42bb1   branch = feature/product-strategy-board-p0
origin/main = origin/feature = 2b82288   WORKTREE_CLEAN_AT_START = YES
FORECAST_FORMULA_CHANGED = NO · GAP_FORMULA_CHANGED = NO · DB_MIGRATION_REQUIRED = NO
```

---

## Scope, stated honestly before anything else

Five bugs were reported (FC-1…FC-5), then hard-refresh evidence arrived mid-round showing the failure is a
**cold-path** problem, not stale-session poisoning. That materially changed the diagnosis and expanded §3N–§3S.

**I repaired one bug and root-caused the rest.** FC-5 is fixed, tested and landed. FC-1/FC-3/FC-4 share a
single root cause that I can locate precisely but **cannot responsibly repair without measurement I have no
access to** — the fix is a request-shape decision, and §1 explicitly forbids reaching for the timeout knob
without proving the budget is genuinely too short. FC-2 was not reproduced.

Claiming otherwise would be the more comfortable report and the less useful one.

```
REPAIRED     FC-5 (false empty)
ROOT-CAUSED, NOT REPAIRED   FC-1 · FC-3 · FC-4 (one shared owner)
NOT REPRODUCED              FC-2 (double click)
```

---

## Two shared root causes, not one

```
SHARED_ROOT_CAUSE_COUNT = 2

OWNER 1 — "unread collapses to empty at the consumer"        FC-5  +  the FC-ID incident
OWNER 2 — "the cold reference read exceeds the client budget" FC-1 + FC-3 + FC-4
```

### Owner 1 — the model knows, the consumer never asks

The slice model distinguishes UNREAD from EMPTY. `_fcHas_(key)` is that distinction, and
`_fcRegularSourceReady_` has asked it since R2B — **from exactly one call site, which is not the table.**

```
_fcGetRegularForecast()  →  [] when the slice has not landed
renderFcRegularTable()   →  paginatedData.length === 0  →  "No data found"
updatePaginationInfo()   →  "Showing 0-0 of 0 rows / Page 0 / 0"
```

Both are claims that an authoritative read returned zero rows, made before any read returned anything.

`_evtResolveMarketplaceId` is the identical shape one layer over: it filters `_fcGetMarketplaces()` without
ever asking `_fcHas_('marketplaces')`, so an unhydrated registry resolves to a blank `marketplace_id`.

```
FC5_FALSE_EMPTY_ROOT_CAUSE = the render reads through an accessor that has already discarded the
                             unread/empty distinction the model carries
FC5_SHARES_LIFECYCLE_OWNER_WITH_FC1_FC3_FC4 = NO — it shares one with FC-ID
REGULAR_UNINITIALIZED_EQUALS_EMPTY_PRE = YES    SPECIAL_UNINITIALIZED_EQUALS_EMPTY_PRE = YES
```

**The repair, at that one boundary.** `_fcTableGate_(tab)` is **derived, never stored**, from the EXISTING
per-slice `FC_FRESH_` record plus the EXISTING readiness predicates — §3H says reuse the canonical vocabulary
and this does; no competing state machine was added. `_fcEventSourceReady_` was added as the missing symmetric
half of `_fcRegularSourceReady_`.

```
INITIAL_PENDING_STATE_POST        Loading…            (both tabs)
AUTHORITATIVE_EMPTY_STATE_POST    No data found       (unchanged — a true zero still says so)
FILTERED_EMPTY_STATE_POST         No data found       (unchanged; filters run over a loaded model)
FAILED_NO_MODEL_STATE_POST        "could not be loaded" + the banner's Retry
REFRESH_FAILED_LAST_GOOD_STATE_POST   rows stay on screen; the banner owns the failure, not the table
LOADING_SHOWS_0_OF_0_AS_FINAL_RESULT = NO    LOADING_SHOWS_PAGE_0_OF_0_AS_FINAL_RESULT = NO
INITIAL / REFRESH / TIMEOUT / TAB_SWITCH_FALSE_EMPTY_COUNT = 0    LAST_GOOD_DATA_PRESERVED = YES
```

The assertion that stops the fix over-reaching: **a true empty still renders "No data found"**, and a mutant
that makes readiness always-false is caught.

### Owner 2 — the cold Special Event entry is four requests in two rounds

Counted from code, not estimated:

```
KM_SCOPED_READ_CONCURRENCY_ = 2 lanes      KM_READ_TIMEOUT_MS_ = 45 000 ms per read

SPECIAL cold first entry (Next):
  _fcLoadPrerequisites_('event') → refreshCacheTables(['sku_details','marketplace_skus','campaigns'])
        → 3 separate getTable requests through a 2-lane pool     → 2 ROUNDS
  _fcEnsureEventSource_('event') → 1 getWorkspace (events slice) → parallel
  _fcEnsureBaseFcSource_          → regular slice landed at mount → 0
  SPECIAL_FIRST_ENTRY_REQUEST_COUNT = 4    SPECIAL_FIRST_ENTRY_ROUND_COUNT = 2
  SPECIAL_FIRST_ENTRY_BLOCKING_REQUEST_COUNT = 4   (all four are awaited by Next)

REGULAR cold first entry:
  refreshCacheTables(['sku_details','marketplace_skus']) → 2 requests, 2 lanes → 1 ROUND
  REGULAR_FIRST_ENTRY_REQUESTS = 2    REGULAR_FIRST_ENTRY_ROUNDS = 1

SPECIAL_ONLY_DEPENDENCIES = campaigns (prerequisite) · fc_special_events (events slice)
                            + campaign_sku_lines and pricing_list, already DEFERRED
```

`Promise.all` means **any one** of the four rejecting produces "Prerequisite data could not be loaded", which is
why the operator saw `sku_details` named. And all four are awaited by Next, so a single slow table blocks a
modal that does not need it yet.

```
FC1_TIMEOUT_ROOT_CAUSE = B + H — an extra sequential round on the Special path, and a dependency that
                         blocks modal OPEN while being needed only at a later interaction
FC3_POST_REFRESH_ROOT_CAUSE = the same reads, repeated. Not corrupted state: `_fcPostWriteWarm_` already
                         releases in-flight entries and latches NOTHING on failure, and the R2-STABILITY
                         comment names this exact "REQUEST_TIMEOUT / getTable / campaign_sku_lines"
                         signature as the thing it was written to reduce.
FC4_GROUP_CARD_TIMEOUT_ROOT_CAUSE = the same owner at the deferred boundary: pricing_list is a full getTable
FC4_SHARES_ROOT_CAUSE_WITH_FC1_FC3 = YES
FIRST_ENTRY_TIMEOUT_ROOT_CAUSE = B (rounds) + C (one expensive table) + H (unnecessary blocking)
CONFIDENCE = MEDIUM — the request SHAPE is proven from code; which table exceeds the budget, and by how
             much, requires a measurement I cannot take from here
HARD_REFRESH_ELIMINATES_FAILURE = NO — consistent with a cold-path cost, and it rules out stale state
FAILED_STATE_SURVIVES_HARD_REFRESH = NO (all page state is module-scope; a reload clears it)
```

**Why I did not repair it.** Two fixes are visible and both are the right shape, and neither is safe to land
blind:

1. **Defer `campaigns`.** The mechanism already exists — `_FC_DEFERRED_TABLES_ = { lines: 'campaign_sku_lines',
   pricing: 'pricing_list' }` — and `campaigns` is read by the existing-event picker, not by the modal's first
   useful UI. Moving it there removes the second round from the cold Special entry. It needs the
   deferred-consumer path traced for every `campaigns` reader first; I ran out of round to do that safely.
2. **Share the mount read.** `_kmReadTablesBounded_` supports `{ share: true }` single-flight and
   `loadScopedTables` uses it; `_kmRefreshCacheTables_` does **not**, deliberately — it serves both the mount
   read and the post-write refresh, and a post-write read that attached to a pre-write flight would return
   stale rows. Enabling sharing therefore requires splitting those two callers, which is a transport change.

Raising `KM_READ_TIMEOUT_MS_` is explicitly **not** proposed: §1 forbids it without evidence the budget is too
short, and I have none.

---

## FC-2 — not reproduced, and I will not guess

```
FIRST_CLICK_ACCEPTS_FOCUS = NOT REPRODUCED
NODE_REPLACED_DURING_CLICK / FOCUS_STOLEN / RERENDER_DURING_POINTER_SEQUENCE = NOT MEASURED
FC2_DOUBLE_CLICK_ROOT_CAUSE = NOT_PROVEN
```

§2 asks for a pointer-event sequence over the real render lifecycle. That needs a DOM with real focus
semantics and event ordering; the shim this round uses drives `innerHTML` and cannot decide a focus race. §10
forbids `setTimeout`/focus hacks, and picking a cause from the A–I list without instrumenting would be exactly
the guess that produces one.

---

## FC-ID connection

```
CA_MASTER_ROW_EXISTS = YES
FC_ID_SHARED_LIFECYCLE_DEFECT = YES — same owner as FC-5 (unread collapsed to empty at the consumer)
BLANK_MARKETPLACE_ID_SAVE_REACHABLE_POST = YES — unchanged by this round
SERVER_IDENTITY_VALIDATION_REQUIRED_NEXT = YES
```

FC-5's repair does **not** close FC-ID: they share a root cause but not a call site. Fixing the save boundary
means refusing a save whose canonical identity is unresolved, which removes a capability that currently
succeeds — a product decision, which §13 of the FC-ID task excluded and which this round does not smuggle in.

```
NEXT_FC_TASK = FC-ID-R2 — canonical identity save-boundary hardening
```

---

## Write truth — unchanged, and verified unchanged

```
WRITE_SUCCESS_REFRESH_FAILURE_DISTINGUISHED = YES   (FC_MSG_.SAVED_STALE is a distinct message)
FALSE_WRITE_FAILURE_COUNT = 0   FALSE_WRITE_SUCCESS_COUNT = 0   AUTOREPLAY_ON_UNKNOWN = NO
```

Nothing in this round touches the save path, the write states or the readback. The FC-5 gate runs in the table
render and the pagination row only.

---

## Release

```
FRONTEND_DEPLOY_REQUIRED = YES    FRONTEND_DEPLOY_SET = assets/js/pages/fc-summary.js (1 file)
APPS_SCRIPT_SYNC_REQUIRED = NO — no .gs byte changed    BACKEND_RELEASE unchanged
APPLICATION_TOKEN — rotation governed by the served-byte rule; this changes a served asset, so the token
  must rotate in whichever round actually deploys. NOT rotated here: this round does not deploy, and S5/S6
  are both on HOLD, so rotating now would burn a token against an undeployed tree.
```

---

## Results

```
FOCUSED   fc-summary-stability-r1-false-empty   34 passed / 0 failed   4/4 mutants
FILES_CHANGED  assets/js/pages/fc-summary.js (+78)   1 new test
FC_SUMMARY_STABILITY_REPAIR_SEAL = PARTIAL — FC-5 sealed; FC-1/3/4 root-caused; FC-2 unproven
OPEN_FC_DEBT
  FC-1/FC-3/FC-4  one owner: cold reference-read cost. Two candidate repairs named above, neither landed.
  FC-2            not reproduced; needs real DOM focus instrumentation
  FC-ID           save-boundary identity refusal — FC-ID-R2
```
