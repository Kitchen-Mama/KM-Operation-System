# S8-R4D-G0 — AMAZON INVENTORY SNAPSHOT DATE + EU SHARED INVENTORY
## Read-only correctness audit. One defect found, one contract already correct. Nothing repaired.

```
SCOPE            AUDIT ONLY — separate from S8-R4D-E4 normalization. Not mixed into it.
RUNTIME_CHANGES  0 · IMPORTER_CHANGES 0 · SCHEMA_CHANGES 0 · PRODUCTION_ROWS_WRITTEN 0
ADDED            assets/tests/amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js  (test only)
```

Audited by **executing the shipped decision logic**, not by reading the spec: the importer row gate and
`amazonIsBlank_`/`amazonKeyOf_` are source-sliced out of the deployed `.gs`, and `latestSnapshot`/`stockCard`
are source-sliced out of the page IIFE and run against the real `window.IRCountry`.

---

## A — AMAZON INVENTORY SNAPSHOT BLANK DATE

```
INVENTORY_BLANK_DATE_ROW_CURRENTLY_IMPORTS = NO        ← the row is DROPPED
BLANK_DATE_ROOT_CAUSE = snapshot_date is a NATURAL-KEY field, and the generic importer gate
                        skips any row with a blank natural-key value
CURRENT_RUNTIME_MATCHES_SPEC = YES
```

### Where it happens

[06_amazon_import_config.gs:76](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L76) declares
`naturalKey: ['snapshot_date', 'country', 'marketplace', 'sku']` with `fixedValues: { marketplace: 'Amazon' }`,
so the effective key is `snapshot_date | country | Amazon | sku`.
[07_amazon_import_runner.gs:306-314](../../assets/specs/active/apps-script/07_amazon_import_runner.gs#L306)
then runs the generic gate:

```js
for (var nk = 0; nk < config.naturalKey.length; nk++) {
  if (amazonIsBlank_(dest[config.naturalKey[nk]])) { keyMissing = true;
    amazonAddIssue_(ctx, 'missing_required_value', 'error', …, 'skipped_row', …); break; }
}
if (keyMissing) { ctx.rowsError++; continue; }      // the row is never written
```

**`snapshot_date` is a required NATURAL-KEY field, and only that.** It is not independently a required date:
the date loop at
[07_:265-277](../../assets/specs/active/apps-script/07_amazon_import_runner.gs#L265) carries the explicit
comment `if (amazonIsBlank_(dest[dfName])) continue; // emptiness handled by natural-key check`. So a blank
Date is **not** an `invalid_date` — it falls through and is killed by the key gate. A *malformed* date is a
separate, correct refusal and stays.

```
A1 CLASSIFICATION  required natural-key field = YES · independently required date = NO
```

### No later fix exists

`git log -S` on both the key literal and the gate string returns exactly one commit each — **b94a099**, the
original import round. Neither has been touched since. There is no second emission of
`missing_required_value` anywhere in the runtime.

### Why the proposed relaxation is safe here, and the one risk that is real

```
amazon_inventory_snapshot writeMode = (none) → amazonWriteSnapshot_ = FULL SNAPSHOT REWRITE
  09_amazon_import_writer_logger.gs:22  sh.getRange(2,1,lastRow-1,lastCol).clearContent()  then write
```

Only Daily Sales uses `writeMode: 'rolling_upsert'`
([06_:184](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L184), `retentionDays: 90`).
**For `amazon_inventory_snapshot` the natural key is never an upsert-match key** — the data region is cleared
and rewritten every run. The key therefore does exactly two things: the required-value gate, and in-batch
dedup at [07_:317-322](../../assets/specs/active/apps-script/07_amazon_import_runner.gs#L317). That makes the
operator's framing correct: **inventory identity does not need the historical date**, because no history is
retained in this table.

```
PROPOSED_KEY = country + marketplace + sku        (snapshot_date → nullable source metadata)
```

| implication | finding |
|---|---|
| upsert matching | **not affected** — this table has no upsert path |
| retention / pruning | **not affected** — `retentionDays` is `rolling_upsert` only |
| downstream readers | **not affected** — `normalizeAmazonInventorySnapshotRecord` ([operation-system-db-api.js:842](../../assets/js/api/operation-system-db-api.js#L842)) already tolerates `snapshot_date: ''` and the read filter is `.filter(r => r.sku)` — **`sku` is the only field any reader requires** |
| `latestSnapshot` tie-break | **safe but worth stating**: `ymd('') > ymd('2026-10-06')` is false, so a dated row always beats a blank one; if every row for a scope is blank, first-seen wins |
| **in-batch dedup** | **THE REAL RISK.** Two source rows for one `country+sku` on different dates currently produce two rows; under the relaxed key they collide and **only the first survives** (`duplicate_row`, `kept_first_row`) |

That last line is the only thing that must be measured before the key is changed, and it is measurable
without touching Production: **count distinct `Date` values per `Country+SKU` in the source Combined Sheet.**
If the source is a single-date current snapshot, the collision set is empty and the relaxation is inert. If the
source carries multiple dates per SKU, the relaxation silently discards rows and **must not ship** — the
correct fix would then be key-free blank tolerance for this one table, not a key change.

```
RECOMMENDED_KEY_CHANGE = CONDITIONAL — blocked on SOURCE_DISTINCT_DATES_PER_COUNTRY_SKU = 1
RELAXATION_SCOPE       = amazon_inventory_snapshot ONLY
NOT_RELAXED            = amazon_daily_sales_snapshot · amazon_weekly_sales_snapshot (BD-12 / BD-13 pin this)
UNCHANGED              = synced_at · sync_batch_id remain the authoritative freshness/audit metadata
```

`amazon_inventory_health_snapshot` carries the **same** key and the same full-rewrite mode
([06_:122](../../assets/specs/active/apps-script/06_amazon_import_config.gs#L122)) and is not named in the
addendum. It is flagged, not decided: if Available-by-age rows also arrive undated, the same defect drops them.

---

## B — AMAZON EU SHARED INVENTORY

```
EU_INVENTORY_SINGLE_POOL_RULE_IMPLEMENTED = YES
EU_INVENTORY_DOUBLE_COUNT_RISK            = NO
EU_INVENTORY_MATCH_SET = { EU }                       (exact; no member expansion)
EU_SALES_MATCH_SET     = { IT, DE, ES, FR }           (Amazon marketplace only; no legacy EU row)
```

**The desired contract is already the shipped contract, and it is defended twice over.**

**1 — the predicate.** `latestSnapshot`
([inventory-replenishment.js:337](../../assets/js/pages/inventory-replenishment.js#L337)) filters through
`_irCountryMatch` → `IRCountry.matches` → `aliasMembers`
([inventory-compat.js:48-58](../../assets/js/utils/inventory-compat.js#L48)), which reads **`SAME_MARKET_ALIAS`
only** — `{ UK: [UK,GB], GB: [UK,GB] }`. `SALES_AGG = { EU: [IT,DE,ES,FR] }`
([:40](../../assets/js/utils/inventory-compat.js#L40)) is reachable **only** through `salesSourceSet`, which
`latestSnapshot` never calls. So `aliasMembers('EU') === ['EU']` and `matches('FR','EU') === false`.

**2 — the shape.** Current Stock is not a sum. `latestSnapshot` returns **one** row (`best`), chosen by latest
`snapshotDate`, and `stockCard(inv)` reads that single object's five quantity fields. **There is no
accumulator in the Current Stock path at all**, so even a hypothetically over-broad country predicate could not
produce 400 or 500 — it would produce a *wrong pool*, never a double count. The separation is also recorded in
the source at the call site: *"NO EU aggregation here — inventory identity is per single market."*

Single consumer confirmed: `IR.latestSnapshot` / `IR.stockCard` are called from exactly one place,
[inventory-replenishment.js:12026-12028](../../assets/js/pages/inventory-replenishment.js#L12026), with
`scope.country` taken from the `marketplaces` master registry row. No server-side `60_` path builds Current
Stock; the first-layer read returns raw tables and the browser composes the DTO.

### The asymmetry, stated plainly

```
Amazon EU SALES     FR + DE + ES + IT      AGGREGATED       weeklyUnits7d · salesTrend7d
Amazon EU INVENTORY EU                     NOT AGGREGATED   latestSnapshot · stockCard
```

This is deliberate and was frozen under System Repair 1 Round 2. Sales are four distinct demand streams that
sum at the same grain; inventory is one shared physical pool that five source rows describe. Summing the
inventory rows would multiply one pool by five.

### Fixture coverage added

`assets/tests/amazon-eu-shared-inventory-and-blank-date-s8-r4d-g0.test.js` — **28 assertions, ALL PASS**,
pure Node, no DOM/network/DB. The exact fixture the addendum specified:

```
inventory rows  EU=100 FR=100 DE=100 ES=100 IT=100
EUI-1  EU Current Stock = 100        (not 400, not 500)        PASS
EUI-4  FR site reads FR only = 100                             PASS
EUI-5  EU scope with no EU row -> null, never a member substitute   PASS
EUI-6  FR scope never reads the EU pool row                    PASS
EUI-9/10  Amazon EU SALES still aggregates to IT+DE+ES+FR      PASS
BD-3   blank source Date drops an otherwise valid row TODAY    PASS   ← the defect, pinned
BD-5..7  the DESIRED key admits it and still fails closed on country/sku   PASS
BD-9   the relaxed key collides two dates — first wins         PASS   ← the risk, pinned
BD-12/13  daily + weekly keys stay date-bound                  PASS
```

`assets/tests/inventory-compat.test.js` re-run: **ALL PASS** (no regression).

---

## Follow-up tasks — returned separately, as instructed

```
G1  AMAZON_INVENTORY_BLANK_DATE_REPAIR          — BLOCKED on a source measurement, not on an opinion
      step 1 (operator, read-only): distinct Date values per Country+SKU in the source Combined Sheet
      step 2 (= 1)  → relax amazon_inventory_snapshot naturalKey to country+marketplace+sku
              (> 1)  → STOP. A key change would silently drop rows; a per-table blank-tolerance
                       gate is required instead. Operator architecture decision.
      touches 06_ only · importer release · no frontend change · no schema change
G1b DECIDE whether amazon_inventory_health_snapshot inherits the same relaxation (same key, same mode)
G2  EU INVENTORY — NO REPAIR REQUIRED. The contract is implemented and now test-pinned.
```

```
E4 SEPARATION = ENFORCED. No importer change is mixed into the normalization repair; they touch
                disjoint files (06_/07_ vs 60_) and ship as separate releases.
STATUS = AUDIT CLOSED · ONE DEFECT PROVEN · NO REPAIR AUTHORIZED · NOTHING DEPLOYED
```
