# FC-EU-BFCM-DATA-RECONCILIATION-R1 — EXISTING GRAPH REPAIR PLAN + DRY RUN

```
PRE_SHA = 636840e   branch = feature/product-strategy-board-p0   WORKTREE_CLEAN_AT_START = YES
PRODUCTION_WRITE_AUTHORIZED = NO   DRY_RUN_ONLY = YES   PRODUCTION_ROWS_WRITTEN = 0
FC_SPECIAL_EVENT_WRITE_CONSISTENCY_SEAL = YES   (R2, this branch)
FC_CANONICAL_IDENTITY_BOUNDARY_SEAL     = YES   (held at R2 and R3)
FC_SUMMARY_STABILITY_FINAL_SEAL         = YES   (R3; R2's NO is superseded)
```

---

## §0a — THE ONE THING THIS ROUND CANNOT DO, STATED FIRST

**§2 asks for an authoritative read of production. This repository cannot perform one.**

The canonical database is a Google Sheet behind an Apps Script deployment. Nothing in this worktree can reach
it: there are no credentials here, there is no deployment URL here, and putting one here is forbidden. So
every §2 and §3 count in this document is reported as

```
CURRENT_CAMPAIGN_COUNT = DERIVED_AT_RUN   (not a number this round is able to observe)
```

and **not** as a figure taken from the operator's prose. Carrying the operator's nine forward as a stored
number is precisely the mistake the correction warned against; the second correction would have found it in a
different place.

What this round delivers instead is the **read itself, written down and proven** — a read-only census that
produces every one of §14's values from the live graph in one run, and an acceptance test that re-runs the
same classification after a future authorized repair. The operator runs it; the numbers come back derived.

```
AUTHORITATIVE_READ_OWNER = assets/tools/apps-script-diagnostics/TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs
AUTHORITATIVE_READ_PERFORMED_THIS_ROUND = NO   (no credentials, no network, and none should exist here)
HARDCODED_INCIDENT_ROW_COUNT = NO
```

---

## §1 / §2 — THE INCIDENT, AND HOW ITS SIZE IS OBTAINED

The operator's evidence: one EU BFCM campaign present, its `fc_special_events` present, the
`campaign_sku_lines` those events reference gone — two tested Series, four rows and five.

Nine is the **current observed cardinality**, not a parameter of the repair. The census derives it:

```
expected_line_ids = distinct(events[].campaign_sku_line_id)  UNION  distinct(lines[].campaign_sku_line_id)
missing_line_ids  = expected_line_ids  MINUS  the ids campaign_sku_lines actually holds
orphan_events     = events whose reference is in missing_line_ids
```

The union matters in one direction that a simpler rule gets wrong: **a line with no special event is still a
legitimate line.** Counting only referenced ids would report it as surplus; counting only existing lines would
report the hole as zero. `C11`/`C12` drive exactly that fixture.

That the size is genuinely derived is not asserted, it is **enforced**. `B1` scans the census source and
requires that the only numeric literals anywhere in it are `0`, `1` and `2` — index arithmetic and
`JSON.stringify`'s indent. Four, five and nine cannot be written down in that file. `C8` then runs the same
code over a two-row incident and requires the answer two.

---

## §3 — GRAPH CLASSIFICATION

Every affected event lands in exactly one state, evaluated in an order that keeps each one meaningful:

| STATE | WHEN | FIXTURE |
|---|---|---|
| `MISSING_CAMPAIGN` | the campaign row is absent — a different repair, not this one | `D8`–`D10` |
| `UNKNOWN` | the event carries **no** `campaign_sku_line_id` | `D7` |
| `DUPLICATE_EVENT` | two events share `company\|country\|marketplace\|sku\|event_name\|year` | `D5` |
| `DUPLICATE_LINE` | two line rows share one `campaign_sku_line_id` | `D4` |
| `MISSING_CAMPAIGN_SKU_LINE` | the id resolves nowhere — **the incident state** | `D2` |
| `CAMPAIGN_MISMATCH` | the line exists, under another campaign | `D3` |
| `IDENTITY_MISMATCH` | the line exists but carries a different SKU | `D6` |
| `VALID_GRAPH` | everything resolves | `D1` |

`MISSING_CAMPAIGN` is checked **before** the line states on purpose: with no campaign there is nothing to
attach a line to, and reporting it as a missing line would propose a row into a void.

`UNKNOWN` deserves its own sentence, because it is the one state this procedure cannot repair at all. An event
with a blank reference names no id, and §4 forbids minting one — so there is nothing to reconstruct *under*.
If the live run reports any `UNKNOWN`, that is an operator decision, not a plan row.

---

## §4 — RECONSTRUCTION IDENTITY

```
NEW_CAMPAIGN_ID_COUNT = 0   NEW_EVENT_ID_COUNT = 0   NEW_LINE_ID_MINT_COUNT = 0
```

**The surviving events are the only remaining copy of the lost line ids.** Everything follows from that:

| DO NOT | WHY |
|---|---|
| delete the events | the ids go with them, and nothing else holds a copy |
| recreate the events | `fcSeUniquenessConflict_` refuses — one event name in one year for one SKU is one event |
| mint new line ids | the events would still point at the old ones; one hole becomes two |
| repoint the events | a versionless re-save is refused `STALE_SPECIAL_EVENT_VERSION` (R1 `K7`) |

`E4` proves the census *cannot* mint: it contains no `Utilities.getUuid`, no id-prefix construction and no
`Math.random`. `E1` proves every proposed id is one the events already name, compared against a freshly built
fixture rather than against the report itself.

---

## §5 — FIELD RECONSTRUCTION

| FIELD | SOURCE | DETERMINISTIC | OPERATOR_REQUIRED | DEFAULT_ALLOWED |
|---|---|---|---|---|
| `campaign_sku_line_id` | the event's own reference | YES | NO | NO |
| `campaign_id` | the event's `campaign_id` | YES | NO | NO |
| `sku` | the event's `sku` | YES *(when the referencing events agree)* | NO | NO |
| `marketplace_sku_id` | `marketplace_skus` by sku + company/country/marketplace | YES **only when 1:1** | when not 1:1 | NO |
| `promo_price` (deal price) | **NONE** | NO | **YES** | NO |
| `regular_price` | `pricing_list` **today** — not the snapshot | NO | **YES** | NO |
| `price_units` | `pricing_list.currency` **today** | NO | **YES** | NO |
| `discount_percent` | **NONE** | NO | **YES** | NO |
| `special_condition`, `lps` | none | NO | NO | YES (blank) |
| `line_status` | default `active` | NO | NO | YES |
| `source` | `fc_reconciliation` | NO | NO | YES |
| `created_by` / `updated_by` | the repair actor | NO | NO | YES |
| `created_at` / `updated_at` | the repair **time** | NO | NO | YES |

Three of these are worth their own line.

**`price_units` exists precisely so a snapshot is not re-guessed later.** 20_ documents it as *"the currency
snapshot of the SAME pricing_list row that supplied regular_price / promo_price"*. Re-deriving prices from
today's `pricing_list` is therefore a **decision**, not a restoration, and the census marks it
`OPERATOR_REQUIRED` even where a single pricing row matches. It offers today's value as a *candidate* and
refuses to promote it to a fact.

**`source` is deliberately not the builder's token.** A row this procedure creates was not written by the
Special Event Builder, and stamping it as though it were would put a false provenance in an audit column that
exists to be believed. `F12` pins it.

**`created_at` is the repair time, not the original.** That is unrecoverable and the document says so rather
than back-dating it, which would be the same lie in a different column.

---

## §6 — DISCOUNT %

```
DISCOUNT_RECOVERABLE = NO
```

Checked against the schema rather than asserted (`F17`, `F18`): `discount_percent`, `promo_price`,
`regular_price` and `price_units` are `campaign_sku_lines` columns and appear in **no**
`FC_SPECIAL_EVENTS_HEADERS_` entry. `F19` adds the corollary that matters for the design — R2's `graph` slice
emits ids only, so the reconciliation needs its own, wider read; it cannot be answered by re-using the save's
verifier.

The census emits `OPERATOR_REQUIRED_DISCOUNT_ROWS`, grouped `Series → SKU → campaign_sku_line_id`, every
discount **blank**. Series survives because it is an `fc_special_events` column (`H6`) — that is the one piece
of luck in this incident, and it is what makes the worksheet usable.

**The two Series are not assumed to share a discount** (`H3`): every row carries its own blank. The grouping
is a convenience for filling them in, not a claim that fewer values are needed.

---

## §7 — CONFLICT CHECK

A row is proposed only when all of these hold; otherwise `REPAIR_ROW_STATUS = REFUSED_CONFLICT` and the reason
is named:

```
CAMPAIGN_NOT_FOUND                  the campaign is not there                       (D10)
LINE_ALREADY_EXISTS                 the id is no longer missing                     (M4)
NO_EVENT_REFERENCES_THIS_LINE_ID    no authority for the id
EVENTS_DISAGREE_ON_CAMPAIGN         two events claim different parents
EVENT_CAMPAIGN_MISMATCH             the event's campaign is not the target
EVENTS_DISAGREE_ON_SKU              one id, two SKUs                                (G5, G6)
MARKETPLACE_SKU_AMBIGUOUS           marketplace_skus is not 1:1 in this scope       (F20, F21)
IDENTITY_HELD_BY_<line id>          another line already holds campaign+SKU/MSKU    (G1, G2)
```

`IDENTITY_HELD_BY_` is the one that keeps §9's promise concrete. If some other line already occupies this
campaign + SKU identity, reconstructing the missing id would create a duplicate identity — so the census
refuses and names the occupant, rather than overwriting it to make the graph fit. `G4` records that there is
no path by which it *could* overwrite: the file contains no write call at all.

---

## §8 — DRY-RUN REPAIR PLAN

Each proposed row carries `campaign_sku_line_id`, `campaign_id`, SKU, Series, the identity columns, the full
field matrix, the fields still waiting on a value, the conflicts, a reason, and its idempotency key. Status is
one of:

```
READY_FOR_REPAIR         every field determined
WAITING_OPERATOR_VALUE   a commercial field has no authoritative source  <- the expected state for this incident
REFUSED_CONFLICT         §7 refused it
UNKNOWN                  the referencing events do not agree on one SKU
```

For the incident as described, **every** row is `WAITING_OPERATOR_VALUE` and `READY_FOR_REPAIR_COUNT = 0`
(`F14`, `F15`) — because the discount cannot be derived, and this procedure will not invent it.

```
DRY_RUN_ONLY = YES   PRODUCTION_ROWS_WRITTEN = 0
```

Read-only is a property of the *run*, not a promise about it: every sheet the test hands the census throws on
`appendRow`, `setValue`, `setValues`, `deleteRow`, `insertRows` and `clear`. `A1` shows a full census
completing with zero attempts; `M6` plants one `appendRow` and the run dies. `A8` re-runs it loaded beside the
real write modules and it still writes nothing.

---

## §9 — IDEMPOTENCY

```
REPAIR_IDEMPOTENCY_KEY = campaign_sku_line_id
DUPLICATE_REPAIR_EFFECT = NO_OP — the pre-check finds the line present and skips it; no cell is touched
```

Two layers, and the order is deliberate:

1. **The plan's own pre-check.** A line that exists is not in `missing_line_ids`, so no row is proposed; asked
   for one directly, `LINE_ALREADY_EXISTS` refuses. `I1`–`I3` run the census over a fully repaired world
   (empty plan, verdict `GRAPH_ALREADY_WHOLE`); `I7`/`I8` run it over a **partial** repair and require only the
   remainder to be planned.
2. **The writer's own short-circuit**, as defence in depth. 20_'s fingerprint comparison writes nothing when
   the incoming row matches, so even a mis-issued duplicate execution touches no cell.

Layer 1 is the one that is load-bearing, because layer 2 only protects an *identical* payload — a second
execution carrying a different discount would be an update, and an update is an overwrite. The executor must
skip on presence, never rely on the writer to notice.

```
Never overwrite an existing canonical row because repair expects another value.
```

---

## §10 — POST-REPAIR ACCEPTANCE

`TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id })` re-runs the same classification and returns
`accepted = true` only when all of:

```
campaign_present                zero_missing_lines           zero_orphan_events
zero_missing_campaign           zero_campaign_mismatch       zero_duplicate_line
zero_duplicate_event            zero_identity_mismatch       zero_unknown
line_count_meets_expected       every_event_valid  (VALID_GRAPH count === event count)
```

`J1`/`J2` refuse the broken graph and name the failing check; `J3`–`J5` accept the repaired one; `J7` refuses a
campaign mismatch; `J6` confirms the acceptance test writes nothing either.

It is the same comparison the save's own graph readback performs — `every_event_valid` is R2's
`orphan_event_ids = []` stated positively — run once more with no write behind it. After the repair, a normal
FC Summary save of that campaign should verify on its own.

---

## §11 / §12 — DELETE AND SCHEMA

```
DELETE_CAMPAIGN_COUNT = 0   DELETE_EVENT_COUNT = 0   DELETE_VALID_LINE_COUNT = 0
NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE
SCHEMA_EXTENSION_REQUIRED = NO   DB_MIGRATION_REQUIRED = NO
```

The strategy is reconstruct-missing-only. `K5` pins the census's target header to 20_'s canonical
`CAMPAIGN_SKU_LINES_HEADERS_` exactly, so "no new columns" is a comparison rather than a claim; `K6`/`K7` show
drift being **reported** rather than absorbed, which is the case in which §12 says to stop.

---

## §13 — EXECUTION

Not executed. Not authorized. See `EXECUTION_RUNBOOK.md` beside this file.

```
PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO
FC_EU_BFCM_RECONCILIATION_PLAN_READY = YES
NEXT_TASK = operator supplies Discount % (and deal price / price snapshot), then
            FC-EU-BFCM-DATA-RECONCILIATION-R2 — bounded authorized repair execution + graph verification
```

---

## What this plan still does not explain

It does not say **how** the lines vanished. R1 could not prove it, R2 did not try, and this round does not
either: stage 2 places its appends correctly at every N from 1 to 200, so "the writer put them in the wrong
place" stays excluded, and what remains needs evidence the repository does not hold — the Apps Script
execution log for the save window, and whether anything else touched that sheet in the same minutes.

A repair that runs before that is understood is still the right move, because the events are the only copy of
the ids and every day of ordinary use is a day something else could overwrite them. But it is a repair, not a
fix, and the distinction belongs in the record.
