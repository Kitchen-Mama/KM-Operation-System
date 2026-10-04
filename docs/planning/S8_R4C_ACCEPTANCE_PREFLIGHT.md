# S8-R4C — LAZY-ONCE PERFORMANCE + REGRESSION ACCEPTANCE: PREFLIGHT

**Preflight and release planning only. No token rotated, no runtime changed, nothing executed against
Production, no deploy.**

```
S8_R4C_PREFLIGHT_READY = YES      R4C_EXECUTION_SAFE = YES
FEATURE_HEAD = 4bf7e71   ORIGIN_FEATURE = 4bf7e71   MAIN_HEAD = 8856aeb   ORIGIN_MAIN = 8856aeb
WORKTREE_CLEAN = YES
```

---

## 1. A finding that changes how §11 must be read

**The exposure request carries no scope, and it cannot.** `60_api_v1_inventory_replenishment_workspace.gs`
reads exactly three payload fields — `only`, `include`, `recentWindow`. There is no company, country,
marketplace or sku parameter anywhere in the handler. `company/country/marketplace/sku` appear once, as
`keyCols` inside the `recentWindow` per-key projection for the two sales snapshots, which is a time
projection and not a caller scope.

So the exposure request for Site A and Site B is **byte-identical**, and returns **identical bytes**: whole
tables, scoped by the client after they arrive.

Three consequences R4C must carry:

1. `SITE_B_FIRST_EXPOSURE_REQUEST_COUNT = 1` **will** be observed, and it is the correct result under the
   frozen contract — but that request is **redundant**. It fetches rows the Site A entry already holds.
2. §11's "prove Site A and Site B cache entries are distinct" will pass — the entries *are* distinct. It
   proves the map is per-site. It does **not** prove the second request was necessary, and the acceptance
   report must not be read that way.
3. The repository has already reasoned about exactly this for the primary read. `_irCriticalReadKey_` carries
   the argument verbatim: *"THE KEY IS THE PAYLOAD, NOT THE SCOPE — because the payload is where the scope
   would have to be, and it is not there... Keying on the selected scope would therefore invent a distinction
   the request does not have."*

**Nothing is being changed.** The per-site map is what the operator addendum authoritatively required, it
satisfies the frozen `1, 1, 0, 0` sequence, and it is forward-compatible: if `60_` ever gains a scope
parameter the key is already correct. But the operator should know that a payload-keyed entry would make
US → CA → US → CA cost **1, 0, 0, 0** instead of 1, 1, 0, 0, and that this is a decision available *after*
R4C measures the real cost of that second request.

```
OPEN_DECISION (not taken, not pre-empted): PER_SITE_KEY vs PAYLOAD_KEY for the exposure entry.
  Evidence R4C will produce: EXPOSURE_FIRST_LOAD_WALL_MS for Site B — the measured price of the redundancy.
```

---

## 2. DB touch preflight — 19 tables, READ only

Common to every row below:
`ACCESS = READ` · `DIRECT_CELL_WRITE = NO` · `TEST_LINEAGE = N/A` · `RECOVERY = NONE — READ ONLY` ·
`RUNTIME_OWNER = 60_api_v1_inventory_replenishment_workspace.gs (read)` ·
`EXPECTED_SCOPE = WHOLE TABLE — the handler has no scope parameter (§1); the client scopes the result.`

```
READ_TABLE_COUNT = 19 unique    WRITE_TABLE_COUNT = 0    DELETE_TABLE_COUNT = 0
```

### FIRST LAYER — 13 tables, one request

| # | table | classification | purpose | max rows (R4B-2 measured) | approval req. |
|---|---|---|---|---|---|
| 1 | `marketplaces` | PROTECTED_MASTER | scope identity; company/country/marketplace resolution | 15 | NO |
| 2 | `marketplace_skus` | PROTECTED_MASTER | the row set itself | 495 | NO |
| 3 | `sku_details` | PROTECTED_MASTER | lifecycle, series, category, unitsPerCarton | 192 | NO |
| 4 | `warehouses` | PROTECTED_MASTER | 3PL pool identity | 361 | NO |
| 5 | `amazon_inventory_snapshot` | PROTECTED_MASTER | `currentInventory` | 259 | NO |
| 6 | `amazon_inventory_health_snapshot` | **UNAUTHORIZED_UNKNOWN** | Long-Term Storage over90/over180 | 345 | **standing bounded READ approval; no permanent registration** |
| 7 | `amazon_daily_sales_snapshot` | PROTECTED_MASTER | 7-day sales trend | 3,814 after `recentWindow` (9,779 before) | NO |
| 8 | `amazon_weekly_sales_snapshot` | PROTECTED_MASTER | avg sales/day → Days of Supply | 247 | NO |
| 9 | `fc_regular_forecast` | PROTECTED_MASTER | 60-day forecast + 3-month breakdown | 496 | NO |
| 10 | `fc_target_rules` | PROTECTED_MASTER | target days → DoS/need buckets | 0 | NO |
| 11 | `fc_special_events` | PROTECTED_MASTER | event uplift | 431 | NO |
| 12 | `overseas_inventory_snapshot` | REBUILDABLE_OPERATIONAL_STATE | 3PL physical availability | 260 | NO |
| 13 | `factory_stock` | REBUILDABLE_OPERATIONAL_STATE | CN/TW factory allocation | 112 | NO |

### EXPOSURE LAYER — 6 tables, one request per site entry

| # | table | classification | purpose | max rows | approval req. |
|---|---|---|---|---|---|
| 14 | `shipments` | TEST_OWNED_TRANSACTION | remaining incoming by ETA bucket | 4 | NO |
| 15 | `shipment_lines` | TEST_OWNED_TRANSACTION | per-line remaining = qty − received | 10 | NO |
| 16 | `shipping_plans` | TEST_OWNED_TRANSACTION | receiver lineage for merged shipments | 6 | NO |
| 17 | `shipping_plan_lines` | TEST_OWNED_TRANSACTION | the lineage rows | 12 | NO |
| 18 | `shipping_allocation_drafts` | TEST_OWNED_TRANSACTION | Recommendation snapshot + routes | 12 | NO |
| 19 | `shipping_allocation_draft_lines` | TEST_OWNED_TRANSACTION | per-window recommended rows | 14 | NO |

### The split is arithmetically confirmed, not just asserted

```
first layer  15+495+192+361+259+345+3814+247+496+0+431+260+112 = 7,027 rows
exposure      4+10+6+12+12+14                                  =    58 rows
                                                        total  = 7,085 rows
```

**7,085 is exactly the `rows_returned` R4B-2 measured on the 19-table read, in all nine successful samples.**
So the predicted first-layer payload is 7,027 rows, and any other figure in R4C is a real discrepancy rather
than a rounding question.

---

## 3. Zero-write proof

Measured over the whole lazy-exposure module — every function the two R4C request paths can reach
(`_irEnsureExposureLoaded_`, `_irBuildExposureIndexes_`, `_irOnExposureSettled_`, `_irExposureRefresh_`,
`_irInvalidateExposureForKey_`, `_irExposureGet_`, `_irExposureScopeKey_`, `_irShipCardInnerHtml_`,
`_irRepaintExposureCard_`, `_irRepaintRecoCard_`):

```
WRITE_PRIMITIVE_COUNT     = 0     (setValue, setValues, appendRow, insertSheet, deleteRow)
PROPERTY_WRITE_COUNT      = 0     (PropertiesService)
DRIVE_WRITE_COUNT         = 0     (DriveApp)
TRIGGER_WRITE_COUNT       = 0     (ScriptApp)
DIRECT_CELL_WRITE_COUNT   = 0
GAP_WRITE_REACHABLE       = NO    JOB_START_REACHABLE = NO
gapJob.status.get         = 0 occurrences — still forbidden, still absent
OUTBOUND CALLS IN THE MODULE = exactly one: getWorkspace('inventoryReplenishment', payload)

R4C_EXECUTION_SAFE = YES
```

The two payloads, in full, are the only things R4C sends:

```
first layer  { recentWindow: true, only: IR_FIRST_LAYER_TABLES_.slice() }     (13 names)
exposure     { recentWindow: true, only: IR_EXPOSURE_TABLES_.slice() }        (6 names)
```

---

## 4. Site selection

Taken from the Production scope list captured read-only in R4B-2
(`docs/planning/incident/R4B2_SITE_INVENTORY/s8-r4b2-scope.json`, 15 real marketplaces). No master data is
invented.

```
SITE_A
  COMPANY = ResUS   COUNTRY = US   MARKETPLACE_ID = MKT-RESUS-US-AMAZON   SITE = Amazon (ResUS)
  FIRST_LAYER_ROW_COUNT   = 7,027 predicted (whole-table; see §2)
  EXPOSURE_DATA_AVAILABLE = YES — this is the scope R4B-2 drove end to end, 9 successful samples
  WHY = the only scope with a measured baseline, which is what §7's comparison needs

SITE_B
  COMPANY = ResTW   COUNTRY = CA   MARKETPLACE_ID = MKT-RESTW-CA-AMAZON   SITE = Amazon (ResTW)
  FIRST_LAYER_ROW_COUNT   = NOT MEASURED — requires a Production read (see below)
  EXPOSURE_DATA_AVAILABLE = PROBABLY NO, and that is useful (see below)
  WHY = it differs on ALL THREE key fields — company, country AND marketplace_id — which is the
        strongest available proof that the cache key distinguishes sites rather than coinciding.
        It is also the pair already written into the frozen R4B-2A contract's worked example.

SITE_B_AVAILABLE_FOR_ACCEPTANCE = YES
```

**Two honest qualifications.**

*Row counts per site are not knowable from here.* The workspace read returns whole tables, so the per-site
row counts are a client-side slice that nobody has measured. Establishing them is itself a Production read,
and this preflight exists to authorize such reads rather than to perform them. **The first bounded read of
R4C execution establishes Site B's row count**, and if Site B turns out to have too few expandable rows,
R4C substitutes `MKT-KM-US-KMAMAZON` (KM | US) — which still differs on company and marketplace_id — and
says so.

*Site B almost certainly has no exposure rows, and that is a feature.* R4B-2 measured **4 shipments and 12
allocation drafts in the entire system**, across 15 marketplaces. A site with genuinely empty exposure data
is exactly what §14 needs for its second half: `LOADED_EMPTY` must render the legitimate zero, and only a
site that really has nothing can prove that. Per-site cache acceptance (§11) counts **requests**, which do
not depend on row content at all.

---

## 5. Acceptance plans

### FIRST_LAYER_ACCEPTANCE_PLAN (§7)

Fresh ephemeral Chrome profile, R4A guard armed deny-by-default, Site A, one confirmed Search.

```
REQUIRE   FIRST_LAYER_TABLE_COUNT = 13          FIRST_LAYER_EXPOSURE_TABLE_READ_COUNT = 0
CAPTURE   FIRST_LAYER_SERVER_MS · FIRST_LAYER_WALL_MS · FIRST_LAYER_PAYLOAD_BYTES · FIRST_LAYER_ROWS_RETURNED
          plus meta.onlyRequested echoed by 60_, which is how "13" is proved from the SERVER rather than
          from the request we sent

BASELINE (R4B-2, 9 successful samples, same scope, same harness)
  PRE_19_TABLE_SERVER_RANGE = 14,412 – 22,107 ms
  PRE_19_TABLE_WALL_RANGE   = 23,435 – 31,751 ms
  PRE_PAYLOAD_BYTES         = 356,970 – 356,997      PRE_ROWS = 7,085

n = 5 samples, concurrency 1, spaced. Report the range, not a single number: the baseline range is 7.7 s
wide on server time alone, so one sample cannot be compared against it honestly.
```

### EXPOSURE_ACCEPTANCE_PLAN (§8)

```
REQUIRE   EXPOSURE_REQUEST_COUNT = 1 · EXPOSURE_TABLE_COUNT = 6 ·
          FIRST_LAYER_TABLE_RE_READ_COUNT = 0 · CROSS_SITE_PREFETCH_COUNT = 0
CAPTURE   EXPOSURE_FIRST_LOAD_SERVER_MS · _WALL_MS · EXPOSURE_PAYLOAD_BYTES · EXPOSURE_ROWS_RETURNED
EXPECT    58 rows (whole-table), a payload far below the 357 KB primary read
```

### CACHE_REUSE + SINGLE_FLIGHT (§9, §10)

```
SECOND / TENTH / TWENTIETH_SKU_EXPAND_REQUEST_COUNT = 0
  If Site A has fewer than 20 expandable rows, use every available row and STATE THE ACTUAL COUNT.
CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1
  Driven on a fresh entry by issuing three expands inside the LOADING window via CDP, with the request
  ledger as the witness. Both consumers must resolve from the same in-flight promise.
```

### PER_SITE_CACHE_ACCEPTANCE_PLAN (§11)

```
Site A first exposure -> 1      switch Site B first exposure -> 1
return Site A         -> 0      return Site B               -> 0      CROSS_SITE_PREFETCH_COUNT = 0
Distinctness proved by reading the live cache map keys, not inferred from counts:
  Object.keys(_irExposureByScope) must contain BOTH triples and no third.
READ §1 BEFORE INTERPRETING THIS SECTION — the Site B "1" is a redundant request, not a saving.
```

### ROUTE_RETURN_ACCEPTANCE_PLAN (§12)

```
Site A exposure READY -> navigate to a read-only surface -> return -> expand
REQUIRE  ROUTE_RETURN_EXPOSURE_REQUEST_COUNT = 0
Destination must start no job and issue no write. Route-return still re-runs _irBootstrapScope_, so ONE
first-layer read is expected and correct; the assertion is about EXPOSURE requests only.
If the live lifecycle destroys the module cache despite the source audit, that is reported as a LIFECYCLE
DEFECT. No persistence is introduced in R4C either way.
```

### REFRESH_ACCEPTANCE_PLAN (§13)

```
Both sites READY -> explicit Refresh on Site A (the control on the Shipping Shipment card)
REQUIRE  REFRESH_SITE_A_INVALIDATED = YES · REFRESH_SITE_B_INVALIDATED = NO ·
         GLOBAL_CACHE_CLEAR_ON_REFRESH = NO
         Site A next exposure = 1 request · Site B return exposure = 0 requests · writes = 0
```

### FALSE_EMPTY_ACCEPTANCE_PLAN (§14)

Checked at `NOT_LOADED` (before the first expand completes) on all four repaired surfaces:

```
1 Shipping Shipment card     must show the pending mark, NOT "0" on any of the five ETA buckets
2 row-builder DTO            within18days..shipOverdue must be null, NOT 0
3 Recommendation Summary     must NOT say "No recommendation generated"
4 Execution Plan             must hold its skeleton, must NOT render an empty plan or any Qty 0
FALSE_EMPTY_COUNT = 0 expected.
Then at READY on a site with genuinely empty data (Site B), the legitimate zero/empty state MUST appear —
that is the other half of the proof, and without it this section only tests one direction.
```

### FAILURE STATE (§15)

```
Simulated CLIENT-SIDE ONLY, by failing the exposure GET at the CDP layer (Fetch.failRequest) on the already
armed R4A guard. A failed GET sends no body and commits nothing, so Production state is untouched.
REQUIRE  NOT_LOADED -> LOADING -> FAILED · no READY-with-empty-model · no false zeros ·
         no automatic request loop over repeated renders · exactly ONE request per explicit retry
If this cannot be driven safely on the day, mark LIVE_FAILURE_SCENARIO = NOT_RUN_SAFE and fall back to the
deterministic harness evidence already in site-inventory-lazy-once-exposure-s8-r4b-2b.test.js (C7, C10,
M7, M8, M20). No Production outage is manufactured.
```

### §16 — classification, with no invented threshold

**There is no repository or user-defined performance budget for this read.** The only objective line that
exists is `KM_READ_TIMEOUT_MS_ = 45000`, and that is a *failure* bound, not an acceptability one.

```
BLOCKING                  = the read fails, or lands close enough to 45,000 ms that the transport's own
                            recovery margin is in play. This is repo-defined.
ACCEPTABLE / IMPROVED_BUT_STILL_SLOW
                          = NOT decidable from any number this repository holds. R4C reports the measured
                            server and wall ranges and the delta against the R4B-2 baseline, and the
                            OPERATOR classifies. A threshold invented here would be a number of mine
                            dressed up as a finding.
If the operator judges it still materially too slow: ARCHITECTURE_DECISION_REQUIRED = YES, and R4C STOPS.
No further table is deferred automatically.
```

### §17 — transport observation (observe only, repair stays separate)

```
FIRST_LAYER_EXEC_HOPS · EXPOSURE_EXEC_HOPS · TRANSPORT_VISIBLE_FAILURE_COUNT
Expected 1 redirect (EXEC -> ECHO) per logical read, as R4B-2 measured on every successful sample.
R4B-2 also measured a 7–10 s flat wall-minus-server gap and a non-zero read failure rate; both are
recorded again, and neither is repaired in R4C.
```

---

## 6. Cache token release blocker — current state

```
CURRENT_APPLICATION_TOKEN = p1-cumulative-20261002
CURRENT_IR_CSS_TOKEN      = ircompactrecon-20260905

APPLICATION_TOKEN_REFERENCE_COUNT = 72     index.html 55 · assets/js/app.js 8 · _p1b8c-acceptance.html 9
IR_CSS_TOKEN_REFERENCE_COUNT      = 2 served refs   index.html:43 · _p1b8c-acceptance.html:32
                                    + 1 literal pinned in a test (see §7)
STALE_TOKEN_REFERENCE_COUNT_PRE   = 0
  staleAppTokenRefs(index) = []   staleRouteAssetTokenRefs(app.js) = []   misplacedIndexTokens = []
```

Every changed asset mapped to the family that serves it:

| changed file | family | served from | token today |
|---|---|---|---|
| `assets/js/pages/inventory-replenishment.js` | application | `app.js` `KM_ROUTE_ASSETS_` | `p1-cumulative-20261002` |
| `assets/js/utils/inventory-compat.js` | application | `index.html` | `p1-cumulative-20261002` |
| `assets/css/pages/inventory-replenishment.css` | IR CSS | `index.html` | `ircompactrecon-20260905` |

**The reuse rule is closed for both.** `origin/main` is at `8856aeb` and carries both tokens, so the bytes
they name have been served; `_release-order.js` states the rule four rounds running — a token may be reused
only while its bytes provably have not reached a browser.

---

## 7. CSS contract (§21)

```
NEW_CLASS_SET = replen-card__value--pending · replen-card__note · replen-card__row--error ·
                replen-card__row--meta · ir-exposure-retry · ir-exposure-refresh
NEW_CLASSES_PRESENT_IN_NEW_CSS   = YES (all six, measured against the working tree stylesheet)
OLD_CACHED_CSS_MISSING_CLASS_COUNT = 6   (measured against 8856aeb:assets/css/pages/inventory-replenishment.css)
```

**Correction to the R4B-2B write-up: there are SIX class names, not five.** The earlier count treated
`ir-exposure-retry` and `ir-exposure-refresh` as one item because they are a styled pair. They are two
selectors and both are absent from the cached stylesheet.

A returning browser on `ircompactrecon-20260905` therefore gets new markup against a stylesheet in which
every one of the six has **zero rules**: the pending `…` renders as unstyled body text beside real
quantities, the failure row loses its alert framing, and Retry/Refresh render as default browser buttons
inside a data card. The states would be *correct* and would look like a bug. That is why the IR CSS family
must rotate and not only the application family.

---

## 8. Token rotation plan (§19) — designed, NOT executed

Naming follows each family's existing convention — `<round>-<shortname>-<YYYYMMDD>` for the application
series, `ir<shortname>-<YYYYMMDD>` for the IR CSS series. **No fourth family is minted; map and
method-registry families are not touched.**

```
NEXT_APPLICATION_TOKEN = s8r4c-lazyexposure-<YYYYMMDD>      e.g. s8r4c-lazyexposure-20261004
NEXT_IR_CSS_TOKEN      = irlazyexposure-<YYYYMMDD>          e.g. irlazyexposure-20261004
```

The date component must be the date the rotation commit is actually made, not this preflight's date.

```
TOKEN_ROTATION_FILE_SET  (ONE commit — a release that moves a token must land as one commit)

  1 index.html                         55 application refs + 1 IR CSS ref (line 43)
  2 assets/js/app.js                    8 application refs (incl. inventory-replenishment.js)
  3 assets/tests/_p1b8c-acceptance.html 9 application refs + 1 IR CSS ref (line 32)
  4 assets/tests/_release-order.js      append s8r4c-lazyexposure-… to ROUND_TOKENS and
                                        irlazyexposure-… to IR_CSS_TOKEN_SERIES, each with the
                                        reasoning and the origin/main SHA that spends its predecessor
  5 assets/tests/production-ui-copy-release-identity-...-r6.test.js:315
                                        C8 is eq(RO.currentIrCssToken(), 'ircompactrecon-20260905', …) —
                                        a LITERAL equality that WILL FAIL on rotation. Convert to the
                                        floor form the other suites already use:
                                        ok(RO.irCssTokenAtOrAfter(RO.currentIrCssToken(), 'ircompactrecon-20260905'))
  6 assets/tests/first-load-timeout-...-r4.test.js:672
                                        K4's label says "the stylesheet ... did NOT change". The assertion
                                        still passes; the PROSE becomes false. Restate it.
  7 assets/tests/live-read-contract-...-a1.test.js:378
                                        K5, same false prose, same restatement.
```

Everything else already reads `RO.currentAppToken()` / `RO.currentIrCssToken()` dynamically and follows the
rotation on its own — including `adm1`'s reference-count baseline, which stays at 72 given a 1:1 rotation.
Items 5–7 are the only assertions the rotation disturbs, and they are the exact trap `_release-order.js`
documents: *"a round's own suite has asserted 'this file carries MY token' as an equality — and then the
next round legitimately moved the file and the assertion failed while describing a correct tree."*

---

## 9. Publication model (§20)

```
APPS_SCRIPT_SYNC_REQUIRED = NO        BACKEND_RELEASE_REQUIRED = NO
FRONTEND_PUBLICATION_REQUIRED = YES
```

**The rotation changes the SHA that R4C must be measured against.** `4bf7e71` carries the implementation but
not the tokens, so it can never be the tested publication SHA. Acceptance runs against the rotated SHA.

```
1 token rotation commit on feature (one commit, items 1–7 of §8)
2 focused + dependent suites: the 158 that read a changed file, plus every cache-identity suite
3 full fail-line-aware sweep; compare the canonical failure set
4 push feature                                     -> FINAL_TESTED_PUBLICATION_SHA
5 fast-forward main  (USER)                        -> RG-1: PUSH_OWNER = USER
6 wait for GitHub Pages propagation, then CONFIRM the served bytes carry the new tokens before measuring
7 execute Production R4C against that SHA
```

Step 6 is not a formality: measuring before propagation would measure the old bundle and report it as the
new one, which is the same class of error the rotation exists to prevent.

---

## 10. What this preflight did not do

```
TOKENS_ROTATED = NO        RUNTIME_MODIFIED = NO        MAIN_PUSHED = NO
PAGES_PUBLISHED = NO       PRODUCTION_R4C_EXECUTED = NO
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGES = 0
SITE_B_ROW_COUNT_MEASURED = NO — it is a Production read, and this preflight authorizes rather than performs
OPERATOR_APPROVAL_REQUIRED = YES
```
