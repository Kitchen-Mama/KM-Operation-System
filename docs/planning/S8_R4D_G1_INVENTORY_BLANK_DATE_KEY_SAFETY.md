# S8-R4D-G1 — AMAZON INVENTORY SNAPSHOT BLANK-DATE KEY SAFETY
## READ-ONLY. The source measurement is BLOCKED on an operator run. The contract audit is complete, and it alone already stops the relaxation.

```
S8_R4D_G1_INVENTORY_BLANK_DATE_KEY_SAFETY = BLOCKED
RUNTIME_MODIFIED = NO · DEPLOYED = NO · SCHEMA_CHANGES = 0
PRODUCTION_ROWS_WRITTEN 0 · ROWS_DELETED 0 · PROPERTY_WRITE_COUNT 0 · DRIVE_WRITE_COUNT 0 · TRIGGER_WRITE_COUNT 0
```

Two things are blocked and they are blocked for different reasons, which matters because only one of
them is waiting on the operator:

```
§1 / §3 / §5 counts    BLOCKED ON A MEASUREMENT — the source is a Google Sheet this environment cannot
                       reach. A read-only probe is built, ZERO-WRITE proven, awaiting paste + run.
§2 decision gate       BLOCKED ON THE ABOVE, and additionally CLOSED NEGATIVE by §4 below.
```

---

## §1 — the grouping, proven rather than assumed

```
MARKETPLACE_IS_SOURCED = NO — it is config-fixed, and the runtime proves it
```

`fixedValues: { marketplace: 'Amazon' }` ([06_:53](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L53))
and `marketplace` appears in **neither** `fieldMap` nor `optionalFieldMap` for this table.
[07_:230-236](../../assets/specs/active/apps-script/07_amazon_import_runner.gs#L230) applies `fixedValues`
first and then maps only the headers `fieldMap` names, so a source column literally called `Marketplace`
is **ignored**. `dest.marketplace` is the string `Amazon` for every row.

**Therefore marketplace cannot vary within the source**, and the effective grouping is:

```
EFFECTIVE_SOURCE_GROUPING = country + sku
```

The probe does not take that on trust either: it derives the grouping from the shipped config at run
time and **reports which key fields came from `fixedValues` and which from the source**, so the
assumption is a returned measurement rather than a sentence in this document.

```
SOURCE_ROW_COUNT                   = PENDING OPERATOR RUN
LOGICAL_IDENTITY_COUNT             = PENDING
IDENTITIES_WITH_0_DATE_VALUES      = PENDING
IDENTITIES_WITH_1_DISTINCT_DATE    = PENDING
IDENTITIES_WITH_GT1_DISTINCT_DATES = PENDING
MAX_DISTINCT_DATES_PER_IDENTITY    = PENDING
```

## §3 — blank-date rows

```
BLANK_DATE_ROW_COUNT                 = PENDING OPERATOR RUN
BLANK_DATE_ROWS_WITH_VALID_COUNTRY   = PENDING
BLANK_DATE_ROWS_WITH_VALID_SKU       = PENDING
BLANK_DATE_ROWS_OTHERWISE_IMPORTABLE = PENDING
```

`OTHERWISE_IMPORTABLE` is computed with the **shipped** `amazonIsBlank_` against the **shipped** natural
key, so it is the importer's own test, not a restatement of it.

## §4 — snapshot_date semantics, and the answer that stops this round

```
INTENDED MEANING   source-provided snapshot freshness metadata
NOT                historical append identity · transaction identity · upsert identity
```

The *intended* meaning is confirmed by the write mode: `amazon_inventory_snapshot` has **no `writeMode`**,
so it takes `amazonWriteSnapshot_` — a full rewrite that clears every data row and writes the batch
([09_:22](../../assets/specs/active/apps-script/09_amazon_import_writer_logger.gs#L22)). Only
`amazon_daily_sales_snapshot` carries `writeMode: 'rolling_upsert'`
([06_:183](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L183)). **So `snapshot_date` is
genuinely not an upsert key, and it retains no history.**

**But the readers do not treat it as metadata.**

```
SNAPSHOT_DATE_DOWNSTREAM_DEPENDENCY_COUNT = 6 runtime readers (+1 importer-internal)
```

| # | reader | what it uses the date for |
|---|---|---|
| 1 | [inventory-replenishment.js:339](../../assets/js/pages/inventory-replenishment.js#L339) `latestSnapshot` | **latest-row choice** → Site Inventory Current Stock (and the health card) |
| 2 | [shipping-plan.js:576](../../assets/js/pages/shipping-plan.js#L576) `_spLatestMap`, fed at [:741](../../assets/js/pages/shipping-plan.js#L741) | **latest-row choice**, per `country\|marketplace\|sku` and a sku-only fallback |
| 3 | [request-order.js:423](../../assets/js/pages/request-order.js#L423) `siteStock` | **latest-row choice** → site stock on the order page |
| 4 | [13_procurement_handlers.gs:480](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L480) | **latest-row choice** per `(sku,country,marketplace)`, server-side |
| 5 | [54_api_v1_raw_inventory_owner.gs:77](../../assets/specs/active/apps-script/54_api_v1_raw_inventory_owner.gs#L77) | **latest-row choice**, lexicographic, ties keep the first |
| 6 | [supply-planning-source-projection.js:221](../../assets/js/core/supply-planning-source-projection.js#L221) | **freshness display** — `asOfByType.amazonInventorySnapshot`, which feeds the overall as-of at [:400](../../assets/js/core/supply-planning-source-projection.js#L400) |
| + | [10_amazon_import_helpers.gs:12](../../assets/specs/active/apps-script/10_amazon_import_helpers.gs#L12) `amazonKeyOf_` | **in-batch dedup** — the natural key IS the dedup key |

By the categories asked for:

```
selection (filtering BY date)   NO
ordering                        YES — lexicographic, in all five selectors
latest-row choice               YES — five independent runtimes
dedup                           YES — the importer's own in-batch dedup
current-stock construction      YES — readers 1-5 all terminate in a stock number
freshness display               YES — reader 6
```

**§4's stop condition is met.** Five independent runtimes choose a row by this field, and a sixth
displays it as freshness. The field is not inert metadata in practice, whatever it is in intent.

One nuance, stated because it bounds the risk rather than dissolving it: every one of the five
comparisons is lexicographic with a blank string, so **a blank-date row can never displace a dated one**
(`'' > '2026-10-06'` is false). The exposure is narrower than "the readers break" and sharper than
"nothing changes": relaxing the key would, for the first time, admit rows whose date is blank into five
selection functions whose input domain has never contained one. Where an identity has **only** blank
rows, the chosen row becomes arbitrary — first-seen in readers 1 and 5, last-seen in 2, 3 and 4, and the
two groups would disagree with each other. That is the same question §1 measures, arriving from the
other side.

## §2 — decision gate

```
NATURAL_KEY_RELAXATION_COLLISION_RISK = UNMEASURED
NATURAL_KEY_RELAXATION_SAFE           = NO
PROPOSED_SAFE_KEY                     = none proposed in this round
STOP_REASON                           = TWO, and either alone is sufficient:
  (a) §1 is unmeasured. The collision count is the gate and no number exists yet.
  (b) §4 found six material downstream dependencies on snapshot_date, which §4 names as a stop
      condition in its own right.
```

The gate's PASS branch is therefore not reachable this round even if the probe returns zero collisions:
a zero would clear (a) and leave (b) standing. **(b) is an operator architecture decision**, because the
alternative design — table-specific blank-date tolerance that keeps `snapshot_date` in the key and
exempts only this table from the blank check — changes the generic importer rather than one config line,
and that is a larger blast radius than the key change it replaces.

## §5 — amazon_inventory_health_snapshot

```
HEALTH_SNAPSHOT_SAME_BLANK_DATE_BEHAVIOR         = YES
HEALTH_SNAPSHOT_BLANK_DATE_ROW_COUNT             = PENDING OPERATOR RUN (the probe measures both)
HEALTH_SNAPSHOT_KEY_RELAXATION_DECISION_REQUIRED = YES — and it is NOT inherited
```

Identical by construction, verified field by field: same `naturalKey`
`['snapshot_date','country','marketplace','sku']` ([06_:122](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L122)),
same `dateFields: ['snapshot_date']`, same `fixedValues: { marketplace: 'Amazon' }`, and **no `writeMode`**
— so the same full rewrite and the same generic skip. A blank source Date drops the row here too.

**It does not inherit the business rule.** The operator approved the clarification for
`amazon_inventory_snapshot` only, and the two tables are not the same business object: one is current
stock, the other is stock *by age bucket*, where the as-of date carries more meaning. It is listed as a
decision, not applied as a consequence. Its only reader among the six above is reader 1
(`latestSnapshot(healthSnaps, scope)`), which is a narrower surface than the inventory table's five.

## §6 — EU shared inventory, carried CLOSED

```
EU_INVENTORY_RULE_STATUS = CLOSED_CORRECT
EU_INVENTORY_SINGLE_POOL_RULE_IMPLEMENTED = YES     EU_INVENTORY_DOUBLE_COUNT_RISK = NO
EU_INVENTORY_MATCH_SET = { EU }                     EU_SALES_MATCH_SET = { IT, DE, ES, FR }
```

Unmodified. The fixture stands in
[amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js](../../assets/tests/amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js):
EU=100 · FR=100 · DE=100 · ES=100 · IT=100 → **EU Current Stock = 100**, not 400, not 500.

## §7 — the probe

```
FILE   assets/tools/apps-script-diagnostics/TEMP_S8_R4D_G1_INVENTORY_BLANK_DATE_KEY_SAFETY.gs
GATE   assets/tests/inventory-blank-date-key-safety-probe-s8-r4d-g1.test.js   37 assertions, ALL PASS
ZERO_WRITE = PROVEN against the canonical write-primitive list, the same one every other
             Production-reaching probe in this repo is held to — copied, not re-chosen
```

It is **executed** in the gate against a fake `SpreadsheetApp`, not merely read: a probe whose counting
has never been run is a probe whose counting has never been checked. The fixture proves it counts a
two-date identity as a collision, does not count a repeated date as a second distinct value, excludes
entirely blank padded rows, and resolves the grouping to `country + sku` with `marketplace` reported as
config-fixed.

Three properties worth naming because they are easy to get wrong:

- **It measures with the shipped predicates.** `amazonIsBlank_`, `amazonNormalizeDate_` and
  `IMPORT_CONFIGS` are called, never copied. With them absent it **refuses** and returns no numbers —
  the gate executes that refusal. A local copy would measure this file's opinion of the importer, which
  is the error the D2 benchmark made.
- **No spreadsheet id is literal in it.** The source is read out of the shipped config, so if the config
  moves the probe follows it rather than silently measuring a stale sheet.
- **It does not dump the source.** Counts, header *names*, and at most ten colliding identities with
  their dates. No quantity, no price, no row contents — asserted, not promised.

### To run it

```
1. Paste TEMP_S8_R4D_G1_INVENTORY_BLANK_DATE_KEY_SAFETY.gs into the Production Apps Script project.
2. Run  s8r4dG1Report()  from the editor.
3. Copy the logged JSON back here.
4. DELETE the file from the project.
```

---

```
NEXT_STEP_PROPOSAL
  1  operator pastes and runs the probe; paste the JSON back (this is the only blocked step)
  2  G1 closes §1/§3/§5 with real numbers and states the collision risk
  3  EVEN IF collisions = 0, the key change is NOT proposed: §4's six dependencies make this an
     operator architecture decision between
       (A) relax the key to country+marketplace+sku, accepting blank dates into five selectors, or
       (B) keep the key and add table-specific blank-date tolerance to the importer, accepting a
           change to the generic row gate instead
     Each is a different blast radius. Neither is a config tweak, and this round does not pick one.
STOP — no importer implementation.
```
