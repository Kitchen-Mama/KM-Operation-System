# FACTORY-INVENTORY-ADJUSTMENT-STABILITY-R1

```
PRE_SHA = 278f254   POST_SHA = ffadabc   branch = feature/product-strategy-board-p0
WORKTREE_CLEAN_AT_START = YES   WORKTREE_CLEAN_AT_END = YES
PRODUCTION_ROWS_WRITTEN = 0   DB_MIGRATION_REQUIRED = NO
```

Three operator incidents. Two of them turned out to be the same defect wearing different clothes, and
the third — the one reported as cosmetic — was hiding a duplicate-write path.

---

## §1 — Owners

```
PAGE_OWNER               assets/js/pages/factory-stock.js
MODAL_OWNER              assets/html/pages/factory-stock.html  (#factory-adjust-modal)
ADJUSTMENT_FORM_OWNER    factory-stock.js  onFactoryAdjustRecordChange / onFactoryAdjustQtyInput
SUBMIT_OWNER             factory-stock.js  confirmFactoryInventoryAdjustment()
TRANSPORT_OWNER          operation-system-db-api.js  KM.DB.adjustFactoryInventory
                         -> _kmCanonicalWrite_ -> km-transport.js request({ kind: 'write' })
BACKEND_ACTION           adjustFactoryInventory
ROUTER_OWNER             01_router.gs  (doPost registry, line 1096)
BACKEND_WRITE_OWNER      21_factory_inventory_handlers.gs  handleAdjustFactoryInventory_
MOVEMENT_WRITE_OWNER     the same handler, same script lock, same rollback
WRITE_RECEIPT_OWNER      the handler's response { movement_id, reference_id, before/after_available }
SUCCESS_RENDER_OWNER     confirmFactoryInventoryAdjustment -> #factory-adjust-result
DONE_HANDLER_OWNER       #factory-adjust-done-btn -> closeFactoryInventoryAdjustModal()   (NEW)
CLOSE_OWNER              closeFactoryInventoryAdjustModal()
```

Data sources, all already loaded by the page: factory stock records from `_getDbFactoryStockData()`
(factory_stock ⋈ warehouses ⋈ sku_details), warehouse/factory identity from `warehouses.warehouse_id` /
`warehouse_name`, and the canonical record identity is `warehouse_id + sku`.

---

## §2 — INCIDENT A: the false failure

```
FALSE_FAILURE_ROOT_CAUSE = A   (write committed; the response-delivery leg failed)
CONFIDENCE = HIGH
```

`KM.DB.adjustFactoryInventory` was the last writer in the file still using a raw `fetch()` with its
action **only in the POST body**. An Apps Script `/exec` POST is always answered with a 302 to
`script.googleusercontent.com`, and per the Fetch spec a 302 following a POST is re-issued as a **GET with
the body dropped**. `doPost` has already run by then — the adjustment is committed — and only the
*delivery of its answer* is still at risk. Two things can go wrong there, and the operator reported both:

| WHAT HAPPENED | WHAT THE OPERATOR SAW | SOURCE OF THE STRING |
|---|---|---|
| the redirect chain resolves back to `/exec`, reaching `doGet` with nothing | *"Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get"* | `01_router.gs` doGet terminal |
| the single-use echo target had expired and answered 404 HTML | *"Error: API returned 404"* | `if (!resp.ok) throw new Error('API returned ' + resp.status)` |

Both strings are reproduced from the tree, not guessed. The second is this accessor's own line.

**This is not a new class of fault.** `FC-SUMMARY-R2B-A3-R2` removed exactly this defect from the campaign
write chain and left the analysis in the file. The factory adjustment simply never adopted the fix.

```
WRITE_COMMITTED_BUT_UI_REPORTED_FAILURE_REPRODUCED = YES   (suite section I, executed)
```

### §6 — the router message, audited

```
REQUESTED_ACTION = adjustFactoryInventory
REGISTERED_ACTION = adjustFactoryInventory        PRESENT in the doPost registry (01_router.gs:1096)
ACTION_CONTRACT_VERSION = unchanged — no deployment mismatch, no stale release, no missing action
```

The four actions named in the message are **doGet's** list. They are what a GET can serve; the adjustment
is served by doPost. The message is a GET-handler answer to a request that arrived as a GET because a
redirect dropped its body — it was never a statement about whether `adjustFactoryInventory` exists. The
round deliberately did not "fix" this by matching on the string (§6), and no release is required to make
the action available, because it already is.

---

## §3/§4 — Write truth

```
WRITE_IDENTITY = the ABSOLUTE TARGET STATE — (warehouse_id, sku) -> new_available
AUTHORITATIVE_VERIFICATION_OWNER = factory-stock.js _factoryAdjustReadbackAvailable()
                                   -> KM.DB.loadScopedTables(['factory_stock'])   (scoped mode)
                                   -> KM.DB.refreshFactoryStockTables()           (legacy mode)
RECEIPT_READ_COUNT = 1   (only on an ambiguous outcome; 0 on a clean commit)
```

The four outcome classes are the **shared** ones already used by the pricing write (S3-R10). No fifth
vocabulary was introduced.

**Why this adjustment can be verified without a new column, a new action or a second writer:** it is an
*absolute set*. The client sends `new_available`, never a delta. So "did it commit?" is answered by
reading the row and comparing available to the target — **the target state is its own receipt**. A delta
write could not be settled this way; this one can.

```
success                     -> CONFIRMED_COMMITTED      (no readback needed)
transport BACKEND_BUSINESS_REJECTION
                            -> CONFIRMED_REJECTED       (the SERVER answered; 21_ validates every field
                                                         before the first cell is touched)
no transport record at all  -> CONFIRMED_NOT_STARTED    (never dispatched — a structural fact)
any DELIVERY fault          -> READ THE ROW:
      available === target  -> CONFIRMED_COMMITTED
      available === before  -> CONFIRMED_NOT_STARTED
      anything else / unreadable
                            -> OUTCOME_UNKNOWN
```

**What is deliberately NOT used as evidence: the HTTP status, and the router's own `zero_write`.** A doGet
answer saying `zero_write: true` is telling the truth about the GET leg it handled, while `doPost` ran —
and committed — before the redirect that produced that GET existed. Believing it is precisely how a
committed adjustment was reported as a failure.

```
FALSE_NOT_WRITTEN_CLAIM_COUNT = 0      FALSE_REJECTED_CLAIM_COUNT = 0
AUTOREPLAY_ON_UNKNOWN = NO
AUTOMATIC_DUPLICATE_WRITE_COUNT = 0    DUPLICATE_MOVEMENT_FROM_ONE_USER_SUBMIT_COUNT = 0
```

### One honest caveat about the retry

`_kmCanonicalWrite_` makes at most one further **attempt** when the transport proves a method downgrade.
For this action that is harmless rather than merely unlikely, and the reason is in the backend: 21_
refuses a no-op (*"New Available equals Current Available"*). A re-send of the same absolute target after a
commit is therefore **refused**, so it cannot mint a second movement. The round did **not** add
`adjustFactoryInventory` to the lost-delivery replay allowlist — a dead echo target is indeterminate, and
`AUTOREPLAY_ON_UNKNOWN = NO` is the rule.

### §5 — the 13,000 → 0 case, driven

The operator's exact scenario runs in the suite: available 13,000, target 0, server commits, transport
404. The settlement reads the row, sees 0, and shows **success**. One write request. No replay. Had the
row still read 13,000 the same code says *"the adjustment was NOT applied. Nothing was written"* — and
that claim is made only because the readback proved it.

---

## §7/§8 — INCIDENT B: Done was not a button

`Done` was the **Confirm button with its `textContent` rewritten**. Its `onclick` was still
`confirmFactoryInventoryAdjustment()`. The submit path disabled it before the request and never re-enabled
it on success, so clicking it did nothing — which is the incident as reported.

**The part that was not reported is worse.** The Reason textarea's `oninput` runs
`_factoryAdjustUpdateValidity()`, which recomputed validity against `_factoryAdjustSelected` — the
**stale pre-write record**, still holding 13,000. So after a successful adjustment to 0, typing one
character in Reason made `nv.value !== rec.availableStock` true again and **re-enabled the button now
labelled "Done"**. Clicking it submitted a second −13,000. Only 21_'s no-op guard stopped it from becoming
a second movement, and the operator would have seen an error land on top of their success.

Both are closed:

```
DONE_SEMANTICS = ACKNOWLEDGE_AND_CLOSE
DONE_CLICK_WRITE_REQUEST_COUNT = 0    DONE_CLICK_MOVEMENT_CREATE_COUNT = 0    DONE_CLICK_CLOSE_COUNT = 1
SUCCESS_AND_ERROR_VISIBLE_SIMULTANEOUSLY = NO
FULL_PAGE_RELOAD_ON_DONE = NO         UNRELATED_DATA_REFETCH_ON_DONE = NO
```

Done is now its own element wired to `closeFactoryInventoryAdjustModal()`; on commit Confirm is hidden and
the form frozen; and `_factoryAdjustCommitted` latches so validity can never re-arm the submit path. The
latch is one-way and only reopening clears it.

```
CANCEL_SEMANTICS_CHANGED = NO
```
Cancel still closes and discards before a write, and is never a rollback after one.

---

## §10–§14 — INCIDENT C: Factory → SKU

```
FACTORY_SELECTOR_IDENTITY = warehouse_id          (option VALUE; the factory name is display text only)
FACTORY_SELECTOR_SOURCE = the already-loaded factory_stock model (_getDbFactoryStockData)
FACTORY_SELECTOR_NEW_REQUEST_COUNT = 0
SKU_SELECTOR_SCOPE = warehouse_id
CROSS_FACTORY_SKU_VISIBLE_COUNT = 0               (computed from the rendered option values)
FACTORY_CHANGE_CLEARS_SKU = YES
FACTORY_SELECTION_REQUEST_COUNT = 0               SKU_SELECTION_REQUEST_COUNT = 0
```

`factory_stock` **is** the Factory Inventory domain, so every warehouse appearing in it is an eligible
factory stock warehouse — there was nothing to filter out and, more usefully, nothing to fetch.

Before a Factory is chosen the SKU selector is disabled and reads **"Select a Factory first"** — an
instruction, not *"No data found"*, which would be a false claim about the database.

**Why changing Factory clears the SKU:** the fixture is the real case — `CO1100-R` exists under both
`WH-CN-YX` (13,000) and `WH-TW-KM` (55). A retained selection would look correct and adjust the wrong
record. Selecting a SKU is also guarded: if the resolved record's `warehouse_id` does not match the
selected factory, the selection is refused rather than committed against whatever the index points at.

---

## §15/§17 — unchanged, and the refresh

```
INVENTORY_ARITHMETIC_CHANGED = NO      RESERVED_MANUAL_EDIT_ADDED = NO
MOVEMENT_WRITE_SEMANTICS_CHANGED = NO
POST_WRITE_REFRESH_OWNER = _fsAfterWrite()  (existing; scoped re-read, never a whole-DB reload)
POST_WRITE_REFRESH_REQUEST_COUNT = 1        FULL_PAGE_RELOAD_AFTER_ADJUSTMENT = NO
STALE_PREWRITE_QUANTITY_AFTER_SUCCESS = NO
```

Adjustment Qty is still `New Available − Current Available`; the payload is the same six fields; the
dialog still contains no reserved control and still prints *"Reserved is never changed"*.

---

## §19/§20 — stability

```
DUPLICATE_SUBMIT_COUNT = 0        STALE_SELECTION_COMMIT_COUNT = 0
STALE_RESPONSE_COMMIT_COUNT = 0   LISTENER_DRIFT = 0
TIMER_DRIFT = 0                   DUPLICATE_HANDLER_COUNT = 0
OPEN_REQUEST_LEAK_COUNT = 0       PERMANENT_LOADING_COUNT = 0
HANDLER_FIRE_COUNT_PER_CLICK = 1
```

Handlers are inline markup attributes bound once by the document, so there is no per-render rebinding to
drift; the Escape listener is latched by `_factoryAdjustKeyBound`. Three reopens add zero listeners
(measured). Confirm is disabled while a write is unresolved and a double-click sends one request.

---

## §22 — Schema

```
NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE
SCHEMA_EXTENSION_REQUIRED = NO   DB_MIGRATION_REQUIRED = NO
```

The absolute-set property is what avoided a schema change. The pricing write needed a `write_id` column
and a `pricing.write.status` action to answer "did it commit?"; this write does not, because the row
already carries the answer.

---

## §26 — Requests

```
MODAL_OPEN_REQUEST_COUNT_PRE = 0    MODAL_OPEN_REQUEST_COUNT_POST = 0
FACTORY_SELECTION_REQUEST_COUNT = 0 SKU_SELECTION_REQUEST_COUNT = 0
ADJUSTMENT_WRITE_REQUEST_COUNT = 1
RECEIPT_VERIFICATION_REQUEST_COUNT = 0 on a clean commit; 1 on an ambiguous outcome
POST_WRITE_REFRESH_REQUEST_COUNT = 1   DONE_REQUEST_COUNT = 0
```

No N+1 selector behaviour: both selectors are built from one already-loaded model.

---

## §24/§25 — Tests

```
FOCUSED_TEST_RESULT = 95 passed, 0 failed
MUTATION_RESULT = 11/11 killed
DEPENDENT_TEST_RESULT = 179/179 pass
```

The page's real functions are extracted and **run** against a fake DOM and a stubbed transport —
selection, validity, submit, settlement, readback, Done and reopen are measured, not matched as text.

Two shipped suites pinned text this round changed, and both were updated without weakening what they
defend: `api-batch-f-writer-full-reload-retirement` required the literal `if (json && json.success)` seam
(the variable is now `res`, because the accessor no longer parses a JSON body — the success-gating is
still required), and `fc-special-event-write-route-r2b-a3-r2`'s M4 anchored on the `_kmCanonicalWrite_`
throw this round marks structurally.

`M1` was rewritten after review: the first version drove the fixture, asserted the honest outcome, then
compared a literal `true` to itself — it would have passed against the very implementation it claimed to
catch. It now builds the mutant settlement and requires the two to disagree, with `M1a` proving the
readback does not rubber-stamp the opposite case either.

---

## §27 — Release

```
BACKEND_RELEASE = unchanged — no .gs file was touched
APPS_SCRIPT_SYNC_REQUIRED = NO (for this round)
FRONTEND_DEPLOY_REQUIRED = YES
FRONTEND_DEPLOY_SET = assets/js/pages/factory-stock.js
                      assets/js/api/operation-system-db-api.js
                      assets/html/pages/factory-stock.html
TOKEN_ROTATION_REQUIRED_AT_FINAL_DEPLOY = YES   (served bytes move)
```

This round adds no backend sync of its own. It does **not** clear the cumulative unshipped backend set
carried on this branch, which remains the operator's, and which must still go **backend first**.
```
FACTORY_INVENTORY_ADJUSTMENT_STABILITY_SEAL = YES
OPEN_FACTORY_INVENTORY_DEBT = the transport's one extra attempt on a proved method downgrade is
  harmless for this action only because 21_ refuses a no-op. If a future factory write is NOT an
  absolute set, that write needs its own idempotency key before it joins this path.
NEXT_TASK = return to the S6/FC mainline
```
