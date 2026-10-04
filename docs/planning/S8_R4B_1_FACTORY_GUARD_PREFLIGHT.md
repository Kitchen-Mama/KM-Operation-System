# S8-R4B-1 — FACTORY GUARD READ-TRANSPORT REPAIR: DB TOUCH PREFLIGHT + BOUNDARY FREEZE

**PREFLIGHT ONLY.** Nothing implemented, nothing deployed, no Production data touched, no Site Inventory
Search, no transport-bounce repair.

```
FEATURE_HEAD = ac4dd7e   ORIGIN_FEATURE = ac4dd7e   (contains fccf7fa and ac4dd7e)
MAIN_HEAD    = 26e5f10   ORIGIN_MAIN    = 26e5f10
S8_R4B_1_PREFLIGHT_READY = YES
```

---

## 1. The exact call path, traced from source

```
UI_SURFACE        Weekly Shipping Plan — the non-blocking factory-availability indicator on a DRAFT card
INTERACTION       automatic on draft-card render: shipping-plan.js:1153  `if (pid) spFactoryGuardRefresh(pid);`
                  (NOT an operator click — it fires whenever a draft card is drawn)
FRONTEND_CALLER   spFactoryGuardRefresh(planId)            shipping-plan.js:1528
                  -> window.KM.DB.factoryStockGuardGet({ shipping_plan_id: planId })   :1536
HELPER            window.KM.DB.factoryStockGuardGet        operation-system-db-api.js:5344
TRANSPORT_OWNER   _kmWeeklyCommand_                        — the WRITE command dispatcher
REQUEST_METHOD    POST
REQUEST_ID_CLASS  WRITE — _kmNextWriteRequestId_, plus _kmMutationShape_ reporting
ROUTER_ACTION     'factoryStockGuard.get' in the POST if-chain   01_router.gs:1160
HANDLER           handleFactoryStockGuardGet_(body)             71_api_v1_factory_stock_guard.gs
TABLES_READ       7 (see §3)
TABLES_WRITTEN    0
```

**A branch distinction that matters, and that the earlier preflight got loose.** The shipped caller always
passes `shipping_plan_id`, so it takes the **plan branch** — `fsgEvaluatePlanOverage_` →
`fsgReadInventoryFacts_(ss, { selfPlanId: planId })`. The no-plan branch is reachable only by a diagnostic
caller. Both branches use the same reader, so the table set is the same seven; but the plan branch also
returns `guard_available`, which is the field the UI tests (`d.guard_available !== true`), and the no-plan
branch does **not** return it. Any regression that calls the action without a plan id is exercising a
different response shape from the one the product consumes.

## 2. Zero-write, re-proven transitively

Not a file-level grep and not the earlier prose. The whole reachable call graph was walked across every
`.gs` file, comments and string literals stripped, following every `fn_()` and `KMFSG.x()` call to depth 12:

```
REACHABLE FUNCTIONS RESOLVED = 12

handleFactoryStockGuardGet_            [71_]
  fsgStr_                              [71_]
  fsgEvaluatePlanOverage_              [71_]
    fsgReadInventoryFacts_             [71_]
      fsgGuardAvailable_               [71_]
      gapReadObjects_                  [43_api_v1_gap_materialization.gs]
        gapStr_                        [43_]
      gapTruthy_                       [43_]
      fsgNum_                          [71_]
      gapCanonCountry_                 [43_]
  jsonResponse_                        [02_core_sheet_db.gs]
  fsgLifecycleMatrix_                  [71_]
```

```
WRITE_PRIMITIVE_COUNT    = 0      (setValue/setValues/appendRow/insert*/delete*/clear* — none reachable)
PROPERTY_WRITE_COUNT     = 0
DRIVE_WRITE_COUNT        = 0      (DriveApp / MailApp / GmailApp / UrlFetchApp — none reachable)
TRIGGER_WRITE_COUNT      = 0
BUSINESS_MUTATION_COUNT  = 0
LOCK_USE_COUNT           = 0      LockService is never reached
CACHE_USE_COUNT          = 0      CacheService is never reached
```

The five names that did not resolve as `.gs` functions are `KMFSG` exports — `normalizeBalances`,
`draftExposure`, `planExposure`, `availableToAllocate`, `evaluateOverage`. Their authored module
(`assets/js/core/supply-planning-factory-stock-guard.js`, 836 lines) was checked directly and contains
**no** write, I/O or DOM primitive of any kind: no `SpreadsheetApp`, no `fetch`, no `localStorage`, no
`document.`. It is arithmetic.

**The override-audit path is not reachable.** Four functions touch `factory_stock_override_audit`
(`fsgGatePlanTransition_`, `fsgRequireOverrideAuditSheet_`, `fsgLastConfirmedOverride_`,
`fsgValidateOverrideAuditSchema_`). **None appears in the reachable set from this entry point.** That table
is therefore not in §3 at all — it belongs to the write gate, which this action is not.

```
FACTORY_GUARD_READ_ONLY_PROVEN = YES
```

## 3. DB TOUCH PREFLIGHT

Derived from the execution path (`read()` call sites in `fsgReadInventoryFacts_`), not from file mentions.

```
RUNTIME_OWNER        = handleFactoryStockGuardGet_ -> fsgEvaluatePlanOverage_ -> fsgReadInventoryFacts_,
                       reading through gapReadObjects_ (43_). Never the harness.
ACCESS               = READ on every table. INSERT / UPDATE / DELETE = none, on every table.
DIRECT_CELL_WRITE    = NO
EXPECTED_SCOPE       = whole-sheet read, once per invocation — unchanged by this repair, which alters only
                       how the request arrives, never what the handler does
RECOVERY/CLEANUP     = not applicable; a read creates nothing to undo
TEST_LINEAGE         = R3B read-path fatigue (2 failures in 9 attempts) -> R4A (not reachable under the
                       read-only click filter) -> R4B-3 diagnostic -> this round
```

| # | TABLE | REGISTRY CLASSIFICATION | ACCESS | PURPOSE ON THIS PATH | APPROVAL |
|---|---|---|---|---|---|
| 1 | `warehouses` | PROTECTED_MASTER | READ | resolve factory pools | YES |
| 2 | `factory_stock` | REBUILDABLE_OPERATIONAL_STATE | READ | available balances | YES — **read only; Rule 10, no mutation inherited** |
| 3 | `shipping_allocation_drafts` | TEST_OWNED_TRANSACTION | READ | draft exposure headers | YES |
| 4 | `shipping_allocation_draft_lines` | TEST_OWNED_TRANSACTION | READ | draft exposure lines | YES |
| 5 | `shipping_plans` | TEST_OWNED_TRANSACTION | READ | plan exposure headers | YES |
| 6 | `shipping_plan_lines` | TEST_OWNED_TRANSACTION | READ | plan exposure lines, incl. `selfPlanId` | YES |
| 7 | `marketplaces` | PROTECTED_MASTER | READ | destination attribution (wrapped in its own try/catch; a failure degrades to `[]`) | YES |

```
READ_TABLE_COUNT   = 7
WRITE_TABLE_COUNT  = 0
DELETE_TABLE_COUNT = 0
EXPECTED_MAX_ROW_COUNT = whole table per read; no cap is applied on this path (gapReadObjects_ returns all
                         rows). Unchanged by the repair — flagged as a fact, not introduced by it.
```

**No UNAUTHORIZED_UNKNOWN table appears on this path.** All seven are registered in
`s8-data-classification.js`; classifications above were read from it rather than recalled. The targeted
regression in §8 reads exactly these seven and no others — an eighth at runtime is a STOP under Rule 3.

## 4. Minimal repair boundary

```
MINIMAL_RUNTIME_FILE_SET
  assets/specs/active/apps-script/01_router.gs
      add 'factoryStockGuard.get': handleFactoryStockGuardGet_ to rtrGetReadHandlers_()
      KEEP the POST branch at :1160 — see §6 for why removing it is the wrong trade
  assets/js/api/operation-system-db-api.js
      add 'factoryStockGuard.get': 1 to _KM_GET_READ_ACTIONS_
      re-point window.KM.DB.factoryStockGuardGet from _kmWeeklyCommand_ to _kmGapRead_

TEST_FILE_SET
  assets/tools/s8-fatigue/s8-r3b-read-allowlist.js        (spec verb + envelope — harness fixture)
  assets/tests/s8-r3b-read-path-fatigue-safety.test.js    (§5)

FILES_NOT_TO_TOUCH
  71_api_v1_factory_stock_guard.gs    the handler is correct and read-only; the defect is entirely in how
                                      it is reached. Changing it would be repairing the wrong layer.
  assets/js/core/supply-planning-factory-stock-guard.js   pure, unaffected
  shipping-plan.js                    beyond nothing — the call site does not change at all
  43_, 02_, 63_                       readers and registries are already correct
```

### The payload-shape trap

The one-line change is **not** the obvious one-liner, and getting it wrong fails silently rather than loudly.

`_kmGapRead_` builds `dto = Object.assign({ action: action }, payload || {})`. Most callers pass
`{ payload: {...} }` because **their** handlers read `body.payload.x`. **This handler reads
`body.shipping_plan_id` at the top level** (`71_`, `fsgStr_(body.shipping_plan_id)`), matching what
`_kmWeeklyCommand_` sends today (`Object.assign({ action: command }, payload || {})` — flat).

```js
// CORRECT — flat, matching the handler and the current wire shape
window.KM.DB.factoryStockGuardGet = function (payload) {
  return _kmGapRead_('factoryStockGuard.get', payload || {});
};

// WRONG — and it FAILS SILENTLY
window.KM.DB.factoryStockGuardGet = function (payload) {
  return _kmGapRead_('factoryStockGuard.get', { payload: payload || {} });
};
```

The wrong form sends `shipping_plan_id` nowhere the handler looks, so `planId` is empty, the handler takes
the **no-plan branch**, and the response is whole-factory pool data with **no `guard_available` field**.
The UI's `d.guard_available !== true` test then prints "could not be read" — a plausible-looking failure
that is actually a wrong request. Precedent for the flat form already exists:
`_kmGapRead_('system.health', {...})` and `_kmGapRead_('system.requestOrderSendDiagnosticStatus', payload || {})`.

The router side needs no adaptation: `rtrEmitHandlerResult_(_rtrRead[action](_parsed.body))` passes the
parsed `km_body` straight through — *"Same handler, same body, one verb that survives the hop."*

## 5. Tests that pin the current behaviour

```
STALE_TEST_COUNT = 5   (all in assets/tests/s8-r3b-read-path-fatigue-safety.test.js)
```

| # | Line | Assertion today | Must become |
|---|---|---|---|
| 1 | :118 | `A5 factoryStockGuard.get is the ONE approved read that travels on POST` | it travels on GET like every other approved read, and the one-POST-read exception no longer exists |
| 2 | :306 | `E27 the guard command carries action only` — `Object.keys(guardDto) === ['action']` | the flat GET read shape, `{action, requestId}` (plus `shipping_plan_id` when scoped) |
| 3 | :308 | `E28 …_kmWeeklyCommand_('factoryStockGuard.get'` is the path db-api uses | `_kmGapRead_('factoryStockGuard.get'` |
| 4 | :546 | MUTANT `envelope: 'command' → 'foundation'` | re-anchor to the new envelope |
| 5 | :547 | MUTANT `the guard is re-declared a GET`, anchored on `verb: 'POST'` | invert — mutate GET → POST |

**Items 4 and 5 are the dangerous ones, and the danger is silent.** `loadMutated` throws when its anchor is
absent, and `mut()` is `catch (e) { caught = true; }` — so **a mutant whose anchor the repair deletes
reports "MUTANT CAUGHT" while testing nothing at all.** The suite would stay green at 283/27 and two
mutants would have quietly stopped existing. Re-aiming them is not tidying; it is the difference between
coverage and the appearance of coverage.

One assertion is **not** stale and self-corrects: the A4 loop at :114-116 branches on `spec.verb`, so
changing the spec flips it from "is dispatched from the POST chain" to "is on the router GET read table"
automatically — which is exactly what the repair makes true.

**Not stale, and a reason to keep the POST route.**
`shared-factory-stock-guard-and-overage-approval-…test.js:720` asserts the router still contains
`if (action === 'factoryStockGuard.get')`. Keeping the POST branch keeps that assertion honest and makes
the change additive. The references in `api-transport-…:278`, `atomic-release-cache-identity-…:222` and
`weekly-ai-plan-…:530` are comments, and `shared-…:818` / `:883` assert the action name and the 63_
registration, neither of which moves.

## 6. Contract impact

| | |
|---|---|
| ACTION_NAME_CHANGE | **NO** |
| PAYLOAD_CHANGE | **NO** — the wire body is `{action, shipping_plan_id}` before and after; it moves from a POST body to `km_body`, gaining only `requestId` |
| RESPONSE_CHANGE | **NO** — same handler, same `jsonResponse_` |
| BUSINESS_LOGIC_CHANGE | **NO** |
| DB_QUERY_CHANGE | **NO** — the same seven tables, in the same order |
| CACHE_SEMANTICS_CHANGE | **NO** — neither path caches; `cache: 'no-store'` on both |
| AUTHENTICATION_CHANGE | **NO** — same deployment, same origin |
| ROUTER_CONTRACT_VERSION_CHANGE | **NO.** Repository precedent is explicit that a version is not bumped merely because a file changed. This adds a route for an existing action and removes none. |
| BACKEND_RELEASE_CHANGE | **YES, mechanically** — `01_router.gs` changes, so `RTR_BUILD_VERSION_` must advance under the module-stamp rule, and the E4 stamp gate ties that stamp to the file's last change. `FSG_BUILD_VERSION_` must **not** move: `71_` is untouched. The release must land as **one commit**. |
| FRONTEND_RELEASE_REQUIRED | **YES** — `operation-system-db-api.js` changes, so the frontend must ship together with the router. **Order matters: the router must be deployed first.** A frontend that sends GET to a router without the GET route gets `POST_ONLY_ACTION_ON_GET`. |
| API_CONTRACT_CHANGE | **additive only** — the action gains a GET route and keeps its POST route |

## 7. Timeout / unknown-outcome semantics

```
CURRENT_ERROR_SEMANTICS   _kmTimeoutError_(action, 'write', ms) ->
                            code    REQUEST_TIMEOUT_WRITE_INDETERMINATE
                            message "No answer arrived within Ns. The write may or may not have been
                                     committed — verify before retrying."
                            details zero_write: false · indeterminate: true · retryable: false
                          For an action with no write primitive anywhere in its call graph, all three
                          fields are false statements: it IS zero-write, it is NOT indeterminate, and it
                          IS safe to retry.

TARGET_READ_ERROR_SEMANTICS  _kmTimeoutError_(action, 'read', ms) ->
                            code    REQUEST_TIMEOUT
                            message "No answer arrived within Ns."
                            details zero_write: true · retryable: true
```

**No new vocabulary is needed or proposed.** `_kmGapRead_` hard-codes `'read'` at every point that classifies
an outcome — `_kmFetchBounded_(url, init, 'read')`, `_kmTimeoutError_(action, 'read', …)`,
`_kmClassifyAnswer_(action, 'read', …)` and `_kmReportSample_(action, 'read', …)`. Moving the action onto
that path gives it the correct semantics for free. It also inherits the canonical classification of a
redirect/HTML failure (`REDIRECT_TARGET_NOT_FOUND`, `TRANSPORT_NON_JSON_RESPONSE`, `HTTP_TRANSPORT_ERROR`,
each with `zero_write: true` for a read) and the bounded one-attempt recovery from the stable `/exec`.

The client bound also changes, as a consequence rather than a goal: `KM_WRITE_TIMEOUT_MS_` 90 s →
`KM_READ_TIMEOUT_MS_` 45 s. For an indicator that blocks nothing this is a better bound, but it is a
behaviour change and is named here rather than discovered later.

## 8. Targeted regression plan — acceptance, designed before coding

Static, from source — no Production traffic:

1. `factoryStockGuard.get` is in `rtrGetReadHandlers_()` **and** still in the POST chain
2. `factoryStockGuard.get` is in `_KM_GET_READ_ACTIONS_`
3. `KM.DB.factoryStockGuardGet` routes through `_kmGapRead_`, and **flat** — `{ payload:` must not appear
   in its call (§4's trap, asserted directly)
4. no write-shaped identity: `_kmNextWriteRequestId_` / `_kmMutationShape_` unreachable from this action
5. no `REQUEST_TIMEOUT_WRITE_INDETERMINATE` reachable for it
6. `71_` is byte-identical — the handler did not move

Live, read-only, against Production:

7. **repeated-read sample, n = 20**, alternating a real `shipping_plan_id` with a cold reload, recording
   HTTP method, exec-hop count (now available from R4B-3's capture), `success`, `zero_write`,
   `guard_available`, and the pool rows
8. **same business data**: the response for a given plan id must match the current POST path's response
   field for field. Captured **before** the repair on the same plan id, compared after. This is the one
   check that proves the repair changed transport and nothing else.
9. Weekly Shipping Plan renders the indicator with real numbers, not "could not be read"
10. Factory Inventory is untouched — R4A established it never calls this action, so its request profile
    must be identical

**On the prior 2-in-9 failure rate.** n = 20 with zero failures is *consistent with* the defect being
fixed; it is **not statistical proof**. At the observed ~22 % rate, 20 clean reads is roughly a 1-in-170
coincidence — worth reporting as evidence, not as certainty. The mechanism matters more than the count: the
failure mode was a POST body dropped across the `/exec` 302, and a GET has no body to drop. **I will report
the number and the mechanism, and will not claim proof from the sample.**

## 9. R4C carry-forward

Not executed now. For the post-repair browser regression:

- **Weekly Shipping Plan**, cold mount and warm re-entry
- a draft card rendered so `spFactoryGuardRefresh` fires — the trigger is **render**, not a click, so the
  R4A read-only click filter is not involved and the surface needs no new interaction authorization
- per-request trace: method = GET, action = `factoryStockGuard.get`, `EXEC_HOP_COUNT_PER_LOGICAL_READ`
- the visible indicator resolves to pool numbers, and never to "could not be read"
- 8 repeat cycles, plus route away and return
- **no Production write**, and no Save/Submit/Confirm/Adjust/Dispatch at any point

---

```
PRODUCTION_DB_WRITE_REQUIRED      = NO
PRODUCTION_DATA_MUTATION_REQUIRED = NO
SCHEMA_CHANGE_REQUIRED            = NO
OPERATOR_APPROVAL_REQUIRED        = YES
NEXT_STEP = WAIT_FOR_OPERATOR_APPROVAL_TO_IMPLEMENT_R4B_1
```
