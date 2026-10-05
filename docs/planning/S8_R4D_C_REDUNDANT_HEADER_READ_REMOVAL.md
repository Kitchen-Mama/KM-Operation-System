# S8-R4D-C — THE FIRST-LAYER READ STOPS FETCHING EACH HEADER TWICE
## B3 implementation + R43 release cut · backend only · NOT DEPLOYED

```
S8_R4D_C_REDUNDANT_READ_REMOVAL = PASS
TOTAL_GETVALUES_COUNT_PRE  = 30        TOTAL_GETVALUES_COUNT_POST = 13
SERVICE_CALL_REDUCTION_PERCENT = 57    SEMANTIC_RESULT_DIFF_COUNT = 0
```

---

## 1. What was wrong

`io.readTable` asked `prodRequireSheet_` to validate the header — that reads row 1. For the four tables
carrying `requiredCols` it then asked `prodRequireColumns_`, which reads row 1 **again**. Only then did
`sirWsRowsToObjects_` call `getDataRange().getValues()` — whose `data[0]` **is** that header row, already
fetched, twice.

```
13 prodRequireSheet_ header reads
 4 prodRequireColumns_ header reads      (marketplaces, marketplace_skus, sku_details, warehouses)
13 getDataRange() full-sheet reads
--
30 range reads for 13 tables      ->      13
```

## 2. What changed, and what deliberately did not

The header now comes from the one full-sheet read and is handed to the **same validators**.
`classifySchemaMismatch` has always taken a header *array* and never touched a Sheet; the `requiredCols`
check is the identical set comparison `prodRequireColumns_` performs. **What is removed is the fetching, not
the checking.**

**29_ is not touched.** `prodRequireSheet_` has callers in more than twenty files and every one reads
differently. This handler owns its own `io`, so the fix lives entirely inside it and no other caller can
observe it.

```
SHARED_HELPER_CHANGED = NO        UNRELATED_CALLER_BEHAVIOR_DRIFT_COUNT = 0
```

**`getLastRow` / `getLastColumn` are kept.** They are metadata accessors, not range reads, and
`HEADER_MISSING` is still decided on sheet *geometry* exactly as `prodRequireSheet_` decided it. An empty
sheet answers `[['']]`, not `[]`, so deriving the fault from `data[0]` alone would silently reclassify
HEADER_MISSING as HEADER_BLANK. Mutant M5 exists precisely because that is the subtle way to get this wrong:
removing the geometry check still *refuses* — it just names a different fault.

## 3. The counts are measured, not asserted

`first-layer-redundant-header-read-s8-r4d-c.test.js` runs **both** the shipped `readTable` and the one at
`f6b4164` against a Spreadsheet stub that counts every service call, over the same thirteen fixtures.

```
PRE  (f6b4164)   getValues 30   = 17 header-only + 13 full-sheet
POST (HEAD)      getValues 13   = 0 header-only + 13 full-sheet
                 getSheetByName 22 -> 13      getLastColumn 17 -> 13
```

Running both over the same fixtures is also what makes response equality a measurement: the same thirteen
tables go in, and the rows that come out are identical object-for-object, including the all-blank-row drop.

```
SEMANTIC_RESULT_DIFF_COUNT = 0     table presence · header set · row count · canonical row identities
```

Every fail-closed state is compared **token for token against the pre tree**, so "preserved" means the same
answer rather than merely a non-empty one:

```
ABSENT_TABLE_SEMANTICS_PRESERVED     = YES   (SCHEMA_NOT_PROVISIONED required · [] optional)
EMPTY_TABLE_SEMANTICS_PRESERVED      = YES   (fc_target_rules is header-only in Production today)
SCHEMA_MISMATCH_SEMANTICS_PRESERVED  = YES   (HEADER_BLANK · HEADER_DUPLICATE · MISSING_REQUIRED_HEADER)
```

ABSENT and EMPTY are asserted to be **different** states, so the three cannot have collapsed into one.

```
TARGETED_TESTS  65 passed / 0 failed
MUTATION_TESTS  12 mutants / 0 survived / vacuity clean
```

## 4. Out of scope, on purpose

```
DAILY_SALES_PROJECTION_APPLIED = NO
```

R4D-A's column projection is **not** in this release. B3 must measure the effect of call count **alone**; a
payload change in the same release would make the result unattributable. The suite asserts all 36 daily-sales
fields still return, in order, and a mutant mixes the projection in to prove the check bites.

Advanced Sheets Service / `batchGet` (B1) is not enabled: no manifest change, no OAuth scope change.

## 5. What the sweep found

610 suites, 0 timeouts. Three gates went red after the cut.

* **`s7-r4` H2c** read `runtimeGsBetween(R41_POST_SHA, 'HEAD')` — **pinned at one end**, so a true statement
  about what R42 changed had become a claim about every release since. Cutting R43 falsified it. The interval
  is now closed at `f6b4164`; H2c1/H2c2 assert R42's stamps against R42's **own tree** via `git show`; and the
  head half is its own claim (H2e/H2e1/H2e2/H2e3). This is the **third** instance of this fault pattern in
  three rounds, and the second one I introduced myself.
* **The activation census pins** follow the release by contract (BP3). `TEMP_E3_CENSUS_BUILD_` and
  `R6R7_ACTIVATION_BUILD_` move to R43. That gate working as designed, not drift.
* **`product-strategy-visual` B5.3/B6 did NOT come from this round.** Those assertions diff CSS from a fixed
  `c9429e6` to HEAD, and that diff is **byte-identical at `41970d7` and at HEAD** — so the failure predated
  the commit and my R4C baseline had missed it. `layout.css` (HEADER-BASELINE-R2's single `display:block`) and
  `inventory-replenishment.css` (R4B-2B's four exposure states) are now registered with real reasons, each
  checked for what the gate actually protects: zero `.psb-page` selectors, IR rules all scoped to
  `#ops-section`.

```
FULL_SWEEP = 610 suites · 5 failing · 19 FAIL lines
CANONICAL_FAILURE_SET_CHANGED = NO   (line-for-line identical to the R4C baseline)
```

The canonical five remain: `gap-job-done-notice`, `order-planning-monthly-projection-consumer`,
`positive-residual-and-submit-readiness-census`, `replen-header-toggle`, `supply-planning-route-inventory`.

## 6. Release and boundaries

```
R43_RELEASE_ID        F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R43
R43_RELEASE_OWNER_SET 60_api_v1_inventory_replenishment_workspace.gs, 63_api_v1_system_health.gs
01_router.gs          UNCHANGED at R41 — no action, no route, no request field moved
ACTION_CONTRACT_VERSION          18   unchanged
REQUIRED_ACTION_LIST_VERSION     14   unchanged
GENERATED_BUNDLE_CHANGE_REQUIRED NO   no assets/js/core module changed
APPSSCRIPT_MANIFEST_CHANGE       NO   no advanced service, no OAuth scope
FRONTEND_RUNTIME_CHANGED         NO   CACHE_TOKEN_ROTATION_REQUIRED = NO   PUBLICATION_REQUIRED = NO
DEPLOYMENT STATUS                NOT SYNCED, NOT DEPLOYED
```

```
FIRST_LAYER_TABLE_COUNT = 13     EXPOSURE_TABLE_COUNT = 6     lazy-once and siteScope untouched
READ_TABLE_COUNT = 13   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0   NEW_TABLE_REQUIRED = NO
WRITE / PROPERTY / DRIVE / TRIGGER / DIRECT_CELL_WRITE_COUNT = 0
GAP_WRITE_REACHABLE = NO    JOB_START_REACHABLE = NO
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
amazon_inventory_health_snapshot — UNAUTHORIZED_UNKNOWN, READ ONLY, PERMANENT_REGISTRY_CHANGE = NO
MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN (submit, request-order handoff, PO flow, weekly shipping plan,
  shipment draft/dispatch, gap calculation/materialization, business decision source — all unchanged)
```

## 7. What this does NOT prove

**Nothing here says the read is faster.** The call count fell 30 → 13 in a counter, not in Production. The
round-trip hypothesis — that cost scales with service calls rather than data — remains the hypothesis B1's
value rests on, and R4D-C2 is the measurement that tests it.

```
If TOTAL_GETVALUES 30 -> 13 and Production server time does NOT move materially:
    ROUND_TRIP_HYPOTHESIS = WEAKENED / DISPROVEN, and B1 must NOT proceed on the strength of it.
```

No percent is required in advance. R4D-C2 reports raw numbers: SERVER_MS, WALL_MS, per-table timing, payload
bytes, rows returned, transport hops — against the R4C baseline of 18,328–22,569 ms (mean 20,499) and
6,168,676 bytes. **No payload reduction is expected**: the response shape is unchanged.
