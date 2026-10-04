# S8-R4B-2C — EXPOSURE SITE-SCOPE CONTRACT: BACKEND PREFLIGHT

**Spec, mapping and DB touch preflight only. No runtime implemented, no token rotated, no deploy, nothing run
against Production.**

```
S8_R4B_2C_SITE_SCOPE_PREFLIGHT = PASS
R4C_PUBLICATION_ALLOWED = NO          CURRENT_TOKEN_ROTATION_DEFERRED = YES
```

---

## 1. The mismatch, proved from shipped source

```
CLIENT_CACHE_KEY_SCOPE  = company | country | marketplace_id
                          inventory-replenishment.js, _irExposureScopeKey_
SERVER_DATA_QUERY_SCOPE_PRE = ALL ROWS of the six requested tables
```

Proof, not inference:

- `60_api_v1_inventory_replenishment_workspace.gs` reads exactly three payload fields —
  `payload.only` (:141, :252), `payload.include` (:235, :347), `payload.recentWindow` (:239, :246). There is
  **no** company / country / marketplace / site / sku parameter anywhere in the handler.
- `sirWsRowsToObjects_` (:288) is `sheet.getDataRange().getValues()` — the **whole sheet**, header row
  onwards, with only blank-row suppression.
- `buildInventoryReplenishmentRequestDTO` (`km-api-foundation.js:1303`) **whitelists** the payload: it copies
  `include`, `recentWindow` and `only` and **nothing else**. A scope field added to a call site today would be
  silently dropped before the request was built.

So a per-Site cache key currently sits in front of an all-Site read. The frozen operator requirement —
*second-layer exposure data must load only for the current active Site* — is **not met**, and this is the
reason `R4C_PUBLICATION_ALLOWED = NO`.

---

## 2. The six tables — relationship census

Derived from the shipped normalizers (`operation-system-db-api.js`) and the shipped attribution rule
(`_irBuildShipmentRemainingByReceiver`, `inventory-replenishment.js:80`). Not from naming.

### `shipments`

```
PRIMARY ID = shipment_id
DIRECT SITE / MARKETPLACE FIELD = marketplace   — present, BUT "actual, or MULTI when the plan combined
                                                  marketplaces" (normalizer comment, :1192)
DIRECT COMPANY FIELD = company (:1190)          COUNTRY = country (:1191)
PARENT FK = shipping_plan_id (:1180)
CANONICAL PATH TO SITE = own header, except MULTI headers whose true receivers live on the lines
CANONICAL PATH TO COMPANY = own header
FILTERABLE WITHOUT NEW COLUMN = YES, with a retention rule (below)
AMBIGUITY RISK = HIGH — a naive `marketplace === 'Amazon'` filter DROPS merged MULTI headers whose lines
                 legitimately belong to this site
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### `shipment_lines`

```
PRIMARY ID = shipment_line_id
DIRECT SITE / MARKETPLACE FIELD = NONE      DIRECT COMPANY FIELD = NONE      COUNTRY = NONE
  (measured: the normalizer body contains no r.company / r.country / r.marketplace)
PARENT FK = shipment_id  AND  shipping_plan_line_id (:1269-1271, + shipping_plan_line_id)
CANONICAL PATH TO SITE = shipping_plan_line_id -> shipping_plan_lines -> shipping_plans (FROZEN lineage),
                         falling back to the shipment HEADER only when the lineage is BLANK
CANONICAL PATH TO COMPANY = same path
FILTERABLE WITHOUT NEW COLUMN = YES, but ONLY after joining three other tables
AMBIGUITY RISK = HIGH — see the fail-closed rule below
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### `shipping_plans`

```
PRIMARY ID = shipping_plan_id
DIRECT SITE / MARKETPLACE FIELD = marketplace (:987)   COMPANY = company (:985)   COUNTRY = country (:986)
PARENT FK = parent_shipping_plan_id (self, versioning)
CANONICAL PATH TO SITE / COMPANY = own row
FILTERABLE WITHOUT NEW COLUMN = YES — this is the authority the whole shipment family resolves through
AMBIGUITY RISK = LOW, with the MULTI note: a MULTI plan is NOT a specific receiver and is excluded by
                 _irIsSpecificReceiver, which is the shipped rule
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### `shipping_plan_lines`

```
PRIMARY ID = shipping_plan_line_id
DIRECT SITE / MARKETPLACE FIELD = marketplace (:1053) — "each line keeps its REAL marketplace ... never MULTI"
DIRECT COMPANY FIELD = NONE      COUNTRY = NONE
PARENT FK = shipping_plan_id (:1049)
CANONICAL PATH TO SITE = the PARENT PLAN's marketplace, NOT the line's own
CANONICAL PATH TO COMPANY = parent plan
FILTERABLE WITHOUT NEW COLUMN = YES (via parent)
AMBIGUITY RISK = MEDIUM — the line carries its own marketplace, and the shipped client DELIBERATELY DOES NOT
                 USE IT. See the warning below; this is the single easiest way to get a wrong answer here.
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### `shipping_allocation_drafts`

```
PRIMARY ID = allocation_draft_id
DIRECT SITE / MARKETPLACE FIELD = marketplace (:2125)  COMPANY = company (:2123)  COUNTRY = country (:2124)
PARENT FK = none
CANONICAL PATH TO SITE / COMPANY = own row
FILTERABLE WITHOUT NEW COLUMN = YES — and the shipped hydrate already filters on exactly this triple,
                 lowercased, fail-closed on a blank in ANY of the three (R6-R1)
AMBIGUITY RISK = LOW
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### `shipping_allocation_draft_lines`

```
PRIMARY ID = allocation_draft_line_id
DIRECT SITE / MARKETPLACE FIELD = NONE (sku + site_sku only)   COMPANY = NONE   COUNTRY = NONE
PARENT FK = allocation_draft_id (:2151)
CANONICAL PATH TO SITE / COMPANY = parent draft
FILTERABLE WITHOUT NEW COLUMN = YES (via parent)
AMBIGUITY RISK = LOW
FULL-TABLE READ CURRENTLY REQUIRED = YES
```

### The retention rule, and why a row filter is the wrong shape

The client's attribution rule (`inventory-replenishment.js:80-112`) is not "match the header". It is:

```
if shipment_line.shipping_plan_line_id is PRESENT:
      receiver = parent PLAN of that plan line        (company, country, marketplace FROM THE PLAN)
      if that receiver is not SPECIFIC (blank, or multi/merged/mixed/combined) -> DROP THE LINE  (fail closed)
else: receiver = the shipment HEADER's own company/country/marketplace
```

Two consequences a server-side filter must honour or it will under-count silently:

1. **A MULTI shipment header must be RETAINED when any of its lines resolves to this site.** Filtering
   `shipments` on `marketplace` alone deletes exactly the merged shipments the lineage machinery exists to
   attribute. The Shipping Shipment card would quietly lose incoming quantity, and nothing on screen would
   say so.
2. **`shipping_plan_lines.marketplace` must NOT be used as the scope field.** It is the line's REAL
   marketplace and the shipped client ignores it, taking the PARENT PLAN's instead. Scoping on the line's own
   value would include lines the client then drops, or exclude lines it keeps — in both directions the
   server's answer and the screen's answer would disagree.

The correct server shape is therefore a **reachability closure**, not six independent row filters:

```
P   = shipping_plans         where (company, country, marketplace) == scope        [specific only]
PL  = shipping_plan_lines    where shipping_plan_id in P
SL  = shipment_lines         where shipping_plan_line_id in PL
                             OR (shipping_plan_line_id is BLANK and parent shipment header == scope)
S   = shipments              where shipment_id in SL.shipment_id                   [retains MULTI headers]
D   = shipping_allocation_drafts       where (company, country, marketplace) == scope
DL  = shipping_allocation_draft_lines  where allocation_draft_id in D
```

This reproduces the client's rule exactly, including its fail-closed branch. It must be derived from that
rule and pinned against it, or the two drift and the numbers change without anyone intending it.

---

## 3. Scope identity

```
MINIMUM_EXPOSURE_SCOPE_FIELDS = company + country + marketplace      (three fields, names not ids)
```

Why this and not `marketplace_id`: **`marketplace_id` does not appear in any of the six tables.** They all
store the `company` / `country` / `marketplace` triple. Sending `marketplace_id` would force the server to
resolve it through the `marketplaces` master — a **seventh physical table read** — to learn a triple the
client already holds. `_replenSelectedScope()` resolves all three from the master client-side today.

`sku` is deliberately excluded: this stays ONE request for the Site's exposure dataset, never per-SKU.

**Cache key and request identity are allowed to differ, and should.** The client keeps
`company|country|marketplace_id` as its map key — `marketplace_id` is the stable, collision-proof identity for
a map — while the request carries the triple the stored rows actually contain. Nothing requires them to be
the same string, and conflating them would force the seventh table read for no gain.

This triple is the system's canonical station identity: it is what `_irReceiverKey` builds, what the
allocation-draft hydrate filters on, and what R6-R1 repaired when `company` turned out to be the one axis
separating KM/US/Amazon from ResUS/US/Amazon.

---

## 4. No schema change

```
NEW_TABLE_REQUIRED    = NO      NEW_COLUMNS_REQUIRED = NO
SCHEMA_CHANGE_REQUIRED = NO     BACKFILL_REQUIRED    = NO
```

Every one of the six reaches the triple either directly (3 tables) or through an FK that already exists and
is already populated and already relied upon in production rendering (3 tables). Nothing is denormalized and
no site column is invented.

---

## 5. Proposed request contract

```
PROPOSED_SCOPE_REQUEST_SHAPE

  {
    only: [ the six exposure tables ],
    recentWindow: true,
    siteScope: { company: "ResUS", country: "US", marketplace: "Amazon" }
  }
```

A **nested, named** object rather than three loose top-level keys, for three reasons: it is a single
presence test (`payload.siteScope` supplied or not), it cannot collide with a future unrelated top-level
field, and it mirrors `payload.include`'s existing shape — the repository's established way of expressing an
opt-in request modifier on this action.

**`buildInventoryReplenishmentRequestDTO` must whitelist it.** The DTO builder copies only `include`,
`recentWindow` and `only`; a `siteScope` added at a call site without that change is dropped before the
request is built and the whole round would silently do nothing. This is a frontend file in the change set,
not an afterthought.

The server echoes what it actually did, in the existing `requestEcho` convention:

```
meta.siteScopeRequested = { company, country, marketplace } | null
meta.siteScopeApplied   = [ the table names actually scoped ]
```

so the client can VERIFY scoping happened rather than assume it. A mixed deployment is then visible instead
of silent.

---

## 6. Handler behaviour and legacy safety

```
SCOPE_APPLICATION_CONDITION
  payload.siteScope is present AND complete (all three non-blank)
  AND the table being read is a member of the declared scopable set (the six)
  -> apply the closure of §2
  otherwise -> return the whole table, byte-for-byte as today

LEGACY_CALLER_BEHAVIOR_CHANGED = NO
```

Generic `only` semantics are **not** touched. Scoping is gated on a field no existing caller sends, and it is
confined to a named table set, so a caller that asks for `only: ['marketplaces']` with a `siteScope` gets its
whole table — because `marketplaces` is not in the scopable set — rather than a silently half-scoped answer.

An incomplete `siteScope` (any of the three blank) is **refused as a named error**, not treated as absent.
Silently widening to all-Site on a malformed scope is the failure mode this whole round exists to remove, and
it is the same fail-closed rule R6-R1 applied to the hydrate.

Both mixed-deployment directions are safe, and the client's existing filtering is what makes them safe:

- **New frontend, old `60_`** — the old handler ignores the unknown `siteScope`, returns whole tables, and the
  client filters as it does today. Correct, just not yet narrower. `meta.siteScopeApplied` is absent, which is
  how the client can tell.
- **Old frontend, new `60_`** — no `siteScope` is sent, so nothing is scoped. Unchanged.

**The client-side scoping must therefore NOT be removed when the server gains this.** It stops being the only
defence and becomes the second one, and it is the only thing that keeps the first case correct.

---

## 7. Caller census

```
UNRELATED_CALLER_BEHAVIOR_DRIFT_COUNT = 0
```

| caller | current payload | uses `only` | expects | would scope logic change it |
|---|---|---|---|---|
| `inventory-replenishment.js:10321` — first-layer primary read | `{recentWindow:true, only:[13]}` | YES | global (client scopes) | **NO** — sends no `siteScope` |
| `inventory-replenishment.js:9140` — exposure read | `{recentWindow:true, only:[6]}` | YES | per-Site (the gap this round closes) | **YES, intentionally** — this is the one caller that gains `siteScope` |
| `method-registry.js:370` — carrier catalogue | `{include:{carrierPlanning:true}, recentWindow:true, only:['carrier_lead_times','carrier_rate_cards']}` | YES | global reference data | **NO** — sends no `siteScope`, and neither table is in the scopable set |

`km-data-access.js:151` and `operation-system-db-api.js:5009` are a route declaration and a diagnostic census
entry respectively; neither dispatches. No other shipped caller exists.

---

## 8. Filter execution strategy — and the cost that does not move

```
SERVER_TABLE_READ_COUNT = 6        BROWSER_REQUEST_COUNT = 1
```

| table | strategy | why |
|---|---|---|
| `shipping_plans` | **B** — after canonical read | triple is on the row |
| `shipping_allocation_drafts` | **B** | triple is on the row |
| `shipments` | **B**, with retention | header match OR referenced by a retained line |
| `shipping_plan_lines` | **C** — after joining the parent | company/country live on the plan |
| `shipment_lines` | **C** — after joining three parents | lineage -> plan line -> plan, else header |
| `shipping_allocation_draft_lines` | **C** | parent draft |

**ROW_SCOPE_CAN_AVOID_WHOLE_SHEET_READ = NO.** Stated plainly because it is the thing most likely to be
assumed otherwise: `readTable` is `sheet.getDataRange().getValues()`. Apps Script opens the sheet and reads
every row into memory before a single predicate can run. There is no indexed or ranged read here, and the
closure in §2 requires four of the six tables to be fully in memory anyway before any shipment line can be
classified.

```
ROW-SCOPE BENEFIT   payload correctness · cross-Site isolation · smaller response · less client normalization
SHEET-TOUCH COST    UNCHANGED — six sheets opened and fully read, exactly as today
```

---

## 9. Performance reality check

```
A. avoid touching sheets?        NO
B. reduce rows / payload?        YES
C. reduce normalization only?    YES (a small part of B)
D. materially reduce handler time?  NO

EXPECTED_LATENCY_BENEFIT = LOW
```

R4B-2 measured the six exposure sheets at **58 rows in total across every site in the system**, while a
6-row sheet cost 1,238 ms and the per-sheet floor sat at 0.8–1.3 s. Filtering 58 rows to perhaps 20 removes
nothing from a cost that is paid per sheet opened. A handler-time claim here would be an invented one.

**The reason for this change is correctness with the operator's scope contract. It is not a performance
change, and it should not be approved as one.**

---

## 10. DB touch preflight — scoped exposure read

Common to every row: `ACCESS = READ` · `DIRECT_CELL_WRITE = NO` · `TEST_LINEAGE = N/A` ·
`RECOVERY = NONE — READ ONLY` · `RUNTIME_OWNER = 60_api_v1_inventory_replenishment_workspace.gs (read)`

```
READ_TABLE_COUNT = 6     WRITE_TABLE_COUNT = 0     DELETE_TABLE_COUNT = 0
NO SEVENTH PHYSICAL TABLE IS REQUIRED — this is the direct consequence of scoping on the
company/country/marketplace triple instead of marketplace_id (§3).
```

| table | classification | purpose under scoping | expected scope | max rows (R4B-2, whole table) | approval |
|---|---|---|---|---|---|
| `shipments` | TEST_OWNED_TRANSACTION | status + ETA for retained lines; MULTI headers retained by reachability | read whole, return scoped closure | 4 | NO |
| `shipment_lines` | TEST_OWNED_TRANSACTION | remaining = qty − received, per retained line | read whole, return scoped closure | 10 | NO |
| `shipping_plans` | TEST_OWNED_TRANSACTION | **the site authority** the whole family resolves through | read whole, return triple-matched | 6 | NO |
| `shipping_plan_lines` | TEST_OWNED_TRANSACTION | frozen receiver lineage | read whole, return parent-matched | 12 | NO |
| `shipping_allocation_drafts` | TEST_OWNED_TRANSACTION | Recommendation snapshot + routes | read whole, return triple-matched | 12 | NO |
| `shipping_allocation_draft_lines` | TEST_OWNED_TRANSACTION | per-window rows | read whole, return parent-matched | 14 | NO |

The per-site returned row counts are not knowable from here — they are a slice nobody has measured, and
measuring them is a Production read.

---

## 11. Zero-write contract

```
WRITE_TABLE_COUNT = 0     DELETE_TABLE_COUNT = 0
PRODUCTION_DB_WRITE_REQUIRED = NO      PRODUCTION_DATA_MUTATION_REQUIRED = NO
SCHEMA_CHANGE_REQUIRED = NO
PROPERTY_WRITE_COUNT = 0   DRIVE_WRITE_COUNT = 0   TRIGGER_WRITE_COUNT = 0   DIRECT_CELL_WRITE_COUNT = 0
```

The proposal adds a read predicate to a read handler. No write primitive enters the design.

---

## 12. Release impact

```
NEW_ACTION_REQUIRED                   = NO   — a payload extension of an existing action
ROUTER_CHANGE_REQUIRED                = NO   — no route added or removed
ACTION_CONTRACT_VERSION_CHANGE_REQUIRED = NO
```

The rule is stated in `63_api_v1_system_health.gs:37`: *"SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ MUST be bumped
whenever a router ACTION is added or removed."* A payload field is neither. This is the same reasoning R41
applied when the router's GET read table changed and the contract stayed at 18.

```
BACKEND_FILE_SET  = assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs
                    (+ SIR_BUILD_VERSION_ moves in the same commit, per that file's own rule;
                     + SYS_DEPLOYMENT_RELEASE_ / the 63_ manifest row, because this IS a sync-visible
                       backend change and therefore needs its own release cut)

FRONTEND_FILE_SET = assets/js/api/km-api-foundation.js      (DTO whitelist — without this, nothing ships)
                    assets/js/pages/inventory-replenishment.js  (send siteScope; keep client filtering)

BACKEND_RELEASE_REQUIRED      = YES    APPS_SCRIPT_SYNC_REQUIRED = YES
FRONTEND_PUBLICATION_REQUIRED = YES
```

**This reverses R4B-2A's `BACKEND_RELEASE_REQUIRED = NO`, and the reversal is the point of this round.** That
finding was correct for the architecture as frozen then — lazy-once with a per-Site *cache*. The operator has
since required per-Site *data*, which the deployed handler cannot express.

---

## 13. Frontend contract after the fix

```
PER_SITE_FIRST_EXPOSURE_REQUEST_MAX = 1     PER_SKU_EXPAND_REQUEST_AFTER_READY = 0
20_SKU_ADDITIONAL_REQUEST_COUNT     = 0     CROSS_SITE_PREFETCH_COUNT = 0
```

The lazy-once state machine is **unchanged**. The only difference is what the one request carries and what
comes back. `_irEnsureExposureLoaded_` gains `siteScope` in its payload, built from the same applied scope
that already produces the cache key; the states, the single-flight join, the per-entry invalidation and the
four false-empty repairs are all untouched.

```
SITE_A_RESPONSE_HASH != SITE_B_RESPONSE_HASH whenever their canonical exposure truth differs
```

Today those hashes are **identical by construction**, which is the defect. Afterwards they differ because the
rows differ. Where both sites genuinely hold no exposure rows the responses may legitimately coincide as two
empty sets, and that is not a failure.

---

## 14. R4C revised acceptance plan

R4C now has to prove **data** scope, not just request counts:

```
FIRST LAYER         13 tables · 0 exposure tables

SITE A exposure     1 request · 6 tables · meta.siteScopeApplied lists all six ·
                    EVERY returned row resolves to Site A under the §2 closure
SITE B exposure     1 request · 6 tables · EVERY returned row resolves to Site B
RETURN A            0 requests        RETURN B            0 requests

UNVISITED SITE C    0 exposure requests, AND zero Site C rows reachable in the A or B response —
                    which is the assertion that actually distinguishes this round from R4B-2B

PAYLOAD             SITE_A_EXPOSURE_PAYLOAD_BYTES and SITE_B_EXPOSURE_PAYLOAD_BYTES captured SEPARATELY.
                    Do NOT assume they are equal. If they ARE equal, that is a finding to investigate,
                    not a convenience — it is what all-Site responses looked like.

MERGED SHIPMENTS    a MULTI header whose lines resolve to Site A must still appear in Site A's response.
                    This is the retention rule of §2 and the likeliest silent under-count.

UNCHANGED           every R4B-2B criterion: single-flight = 1 · 2nd/10th/20th expand = 0 ·
                    route-return = 0 · Refresh invalidates one site only · FALSE_EMPTY_COUNT = 0
```

---

## 15. What this preflight did not do, and what is still open

```
RUNTIME_IMPLEMENTED = NO   BACKEND_MODIFIED = NO   TOKENS_ROTATED = NO
MAIN_PUSHED = NO   DEPLOYED = NO   R4C_EXECUTED = NO   PRODUCTION_SCOPE_TEST = NO
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGES = 0
```

```
ARCHITECTURE_DECISIONS_REMAINING
  1. Approve the siteScope contract of §5/§6 — the one decision this preflight is waiting on.
  2. The per-Site cache key stays as it is. Scoping the DATA removes the redundancy the R4C preflight
     found; it does not require touching the key.
  3. Hard-reload persistence — still NOT in this round.      Server cache — still NOT in this round.
  4. Write-driven invalidation — still recorded debt; explicit Refresh remains the operator path.
  5. The 13-table first layer is NOT scoped by this round and is not reduced. Whether it is fast enough
     remains an R4C question.
  6. Token rotation stays DEFERRED. This round will move frontend bytes again, and a token may not be
     spent before the final bytes are frozen.
```
