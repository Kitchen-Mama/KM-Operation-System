# FC-ID-R1 — Special Event `marketplace_id` missing: root cause

**Base** `af116ac` · diagnostic only · `PRODUCTION_ROWS_WRITTEN = 0` · `S6_BEHAVIOR_CHANGED = NO`

> **⚠ INCIDENT CONCLUSION DISPROVEN — FC-ID-R1B, superseding evidence.** Operator evidence confirms the
> canonical row EXISTS in production: `MKT-RESTW-CA-AMAZON` (ResTW · CA · Amazon · active), with
> `MKT-RESTW-UK-AMAZON` as the control. So `ROOT_CAUSE = A — marketplace master data missing` is **wrong**
> and must not be acted on: **do not add a marketplace row.**
>
> **The MECHANISM below is unaffected and was re-proved.** The picker is built from the registry ∪
> `fc_regular_forecast` while the resolver reads the registry alone, so a site the registry does not
> answer for resolves blank. What was wrong is the assumption about WHY it did not answer: I inferred the
> row was absent from the SHEET when the candidate is absence from the RUNTIME MODEL — the registry lives
> in the bootstrap slice, the forecast rows in another, and they fail independently.
>
> Corrected analysis, the four executed scenarios and the revised repair direction:
> `docs/evidence/fc-id-r1b-incident-correction/INCIDENT_CORRECTION.md`.
> Current status: `FC_ID_R1_MECHANISM_PROVEN = YES`, `FC_ID_R1_INCIDENT_ROOT_CAUSE = NOT_PROVEN`.


Suite: `assets/tests/fc-id-r1-special-event-marketplace-id.test.js` — 25 passed / 0 failed, 4/4 mutants.

```
PRE_SHA = af116ac   HEAD = af116ac   branch = feature/product-strategy-board-p0
origin/main = origin/feature = 2b82288        WORKTREE_CLEAN_AT_START = YES
```

> **Sequencing note.** The task says this is "inserted before S6-R2". S6-R2 completed at `af116ac`. Nothing here
> touches S5 or S6; the only interaction is that `NEXT_TASK` returns to S6-R3 rather than S6-R2.

---

## What I could not do, stated first

§0 asks for the CA case to be **reproduced from data**, §3 for canonical `marketplaces` **row counts**, and §10
for a **count of existing blank rows**. All three require reading the production Google Sheet, and I have no
database access from this repository — there is no connection, no credential, and none should be added.

```
CA_CASE_REPRODUCED_FROM_DATA   NO — no production read is possible from here
UK_CASE_PRESENT_AS_CONTROL     NO — same reason
CA_AMAZON_CANONICAL_ROW_COUNT  UNKNOWN — operator-readable, see the two queries below
UK_AMAZON_CANONICAL_ROW_COUNT  UNKNOWN
BLANK_MARKETPLACE_ID_ROW_COUNT UNKNOWN
AFFECTED_COUNTRIES             UNKNOWN (predicted: every country absent from `marketplaces`)
```

What I *can* do is prove the mechanism from the shipped code, and prove it **produces exactly the observed
asymmetry** — a CA/Amazon save that lands blank beside a UK/Amazon save that lands normally, with no other
difference between them. That is done below and executed by the suite against the real page functions.

**The two facts you can check in one minute**, which convert this from "proven mechanism" to "confirmed
incident":

1. In `marketplaces`, is there a row with **country = CA and marketplace = Amazon** whose **company** equals the
   company on your CA `fc_regular_forecast` rows? (Status does not matter — see §Findings note 3.)
2. In `fc_special_events`, how many rows have a blank `marketplace_id` while `country` and `marketplace` are
   populated, and which countries are they?

If (1) is "no row, or a row under a different company", the prediction is confirmed.

---

## The root cause

**The Marketplace picker is built from two sources. The id resolver reads only one of them.**

```
_fcRegularSiteOptions(country)                       ← builds the picker
    sources: marketplaces registry  ∪  fc_regular_forecast
    option value : company|country|marketplace       option label : display name, else the key

_evtResolveMarketplaceId(site)                       ← resolves the id that gets written
    sources: marketplaces registry ONLY
    filter  : company AND country AND marketplace    miss → ''
```

Any site that exists in `fc_regular_forecast` but not in `marketplaces` is therefore a **perfectly ordinary,
selectable option** — labelled "Amazon", indistinguishable from a registry-backed one — whose canonical id
resolves to the empty string. Executed on fixtures that differ *only* in registry membership:

```
CA / Amazon   picker offers 1 option "Amazon" (value ResUS|CA|Amazon)   →  resolved id = ''       ← CASE A
UK / Amazon   picker offers it too                                      →  resolved id = MKT-UK-AMZ  ← CASE B
add a CA registry row → CA resolves normally                            ← the code path is NOT CA-specific
```

The blank then travels all the way to the sheet without anything objecting:

```
CLIENT_SENDS_MARKETPLACE_ID = YES   — `marketplace_id: marketplaceId`, always present, blank or not
SERVER_DERIVES_MARKETPLACE_ID = NO  — 14_ never opens the marketplaces registry
14_ write                           — `headers.forEach(h => { if (body.hasOwnProperty(h)) … })`
                                      the property IS present, so a blank is written as a blank
BLANK_MARKETPLACE_ID_REACHABLE = YES
```

```
ROOT_CAUSE      A — marketplace master data missing (or company-mismatched) for the selected site
CONFIDENCE      HIGH on the mechanism · MEDIUM on the incident, pending the one-minute check above
FIRST_BAD_BOUNDARY  _fcRegularSiteOptions offers a site that _evtResolveMarketplaceId cannot resolve
FIRST_BOUNDARY_WHERE_CA_MARKETPLACE_ID_IS_LOST  _evtResolveMarketplaceId (fc-summary.js:3901)
IDENTITY_KEY_MISMATCH_COUNT = 1
```

**This is the "UI carries an identity, a later step re-derives it by name" mismatch §4 asks to be flagged** —
with a twist worth naming: the page *does* have a resolve-by-exact-row implementation already.
`_fcResolveImportMarketplace` (the Regular Forecast CSV import modal) resolves the **exact registry row by
option value** and explicitly refuses when the value matches zero or more than one row. The Special Event
Builder re-derives by triple instead. One page, two answers to "which marketplace is selected", and only one
of them can fail silently.

---

## Your hypothesis, tested and disproved

You said the selector visibly distinguishes "Amazon" from "KM Amazon", so not to assume duplicate labels are
the cause. That was right, and it is now proved rather than assumed:

```
"KM Amazon" and "Amazon" DO share the canonical marketplace key "Amazon"
…and they still resolve to two DIFFERENT ids, because company is part of the lookup:
    KM   | UK | Amazon  →  MKT-UK-KMAMZ
    ResUS| UK | Amazon  →  MKT-UK-AMZ
AMAZON_KM_AMAZON_COLLISION = NO
```

The option **value** is `company|country|marketplace`, which keeps them strictly separate, and a mutant that
removes the company component from either the option or the filter is caught. Duplicate-style display naming is
not the cause.

---

## Three findings worth keeping

1. **A company mismatch reaches the same blank.** If `marketplaces` has a CA/Amazon row but under a different
   company than your CA `fc_regular_forecast` rows carry, the triple still misses and the id is still blank.
   That is why the check above asks about company and not merely about existence.

2. **The failure mode is the benign one, and it was nearly the other.** A mutant that drops the *country*
   filter makes CA silently adopt the first `ResUS/Amazon` row it finds — writing a **wrong** id rather than a
   blank one. A blank is visibly missing; a wrong canonical id is not. The current code fails safe.

3. **Inactive status is not the cause.** `_fcGetMarketplaces()` applies no status filter, and neither does the
   resolver, so even an inactive CA row would resolve. Only absence or a triple mismatch produces the blank.

---

## Impact

`fc_special_events.marketplace_id` has **no backend consumer**: neither `53_api_v1_fc_summary_raw_owner.gs` nor
`58_api_v1_fc_summary_workspace.gs` references it, and no forecast, pricing or campaign calculation joins on
it. The frontend carries it into the edit model, but every lookup on the page is by company + country +
marketplace name.

```
DOWNSTREAM_CONSUMERS
  14_ fcSpecialEventFindRowByKey_   business-key FALLBACK (campaign_id + marketplace_id + sku + month + year)
  14_ FC_SE_FINGERPRINT_FIELDS_     participates in expected_row_version
  fc-summary.js edit model          carried as `marketplaceId`, not used as a lookup key
  campaigns.marketplace_id          the SAME blank is written to the campaign header by the same save
CURRENT_DATA_CORRECTNESS_RISK = P2 (metadata / future risk)
```

Two reasons it is P2 and not higher, both checked rather than assumed. The business-key fallback guards with
`if (mkid && …)`, so a blank **skips** that filter rather than matching wrongly — and the fallback only runs
when `campaign_sku_line_id` is absent, which the builder always sends. And the fingerprint is computed from the
**stored** row on both sides, so a blank does not cause spurious version conflicts.

It becomes **P1 the day any consumer joins on it**, which is precisely what the column was added for — 14_'s own
header comment calls it "the canonical marketplace identity (company-safe, since the same marketplace NAME can
belong to two companies)". Blank rows are a latent trap for the join it exists to enable.

One consequence worth stating plainly: **the affected events themselves are correct.** `company`, `country`,
`marketplace`, `sku`, `fc_qty` and the window are all populated and right. Nothing is mis-forecast.

---

## Repair proposal — not implemented, and why

```
CODE_FIX_REQUIRED = YES, but it carries a business decision → NOT implemented this round
DATA_REPAIR_REQUIRED = YES          BACKFILL_DETERMINISTIC = NO
```

**The code fix is not free of policy.** The obvious repair is for the builder to refuse a save whose site has
no canonical id, the way the import modal already refuses. But that **removes a capability you currently
have**: today CA events save (correctly, minus the id); after the fix they would not save at all until the
registry row exists. Whether that trade is right is your call, not mine, so §13's bar — "no business decision"
— is not met and nothing was changed.

Three options, smallest first:

| | change | effect |
|---|---|---|
| **A** | Add the missing `marketplaces` row(s). **No code change at all.** | New events resolve normally; existing blanks unaffected |
| **B** | Builder shows a visible warning when the id resolves blank, and saves anyway | Nothing is blocked; the operator learns at the moment it matters |
| **C** | Builder refuses, mirroring `_fcResolveImportMarketplace` | Strongest guarantee; blocks CA saves until master data is fixed |

**Recommendation: A first, then B.** A is the actual cure — the code is behaving correctly given its inputs,
and the missing registry row is the defect. B closes the silence without removing a capability. C is defensible
but should follow A, never precede it. If you choose B or C:

```
MINIMAL_CODE_FIX  in saveEventUpdate() (fc-summary.js:5030), immediately after
                  `var marketplaceId = _evtResolveMarketplaceId(site);` (fc-summary.js:5170)
                  branch on marketplaceId === '' → warn (B) or refuse with the site triple named (C)
FILES             assets/js/pages/fc-summary.js        BEHAVIOR_CHANGE  B: additive warning · C: new refusal
                  (frontend only — no .gs file, no schema, no migration)
                  ONE call site: the same variable feeds both the campaign header and every event row,
                  so a single branch covers fc_special_events and campaigns together.
```

**The data repair is not one-to-one deterministic.** A blank row can be filled only from a `marketplaces` row
for its exact triple — and the reason it is blank is that no such row existed. So:

- If A is done first and the new row's triple matches the stored `company`/`country`/`marketplace`, the
  backfill becomes deterministic **for those rows** — a single lookup, no judgement.
- If the registry row exists under a **different company**, deciding which is correct is a master-data
  judgement about who owns CA/Amazon, and no code should make it.

```
PROPOSED_DATA_REPAIR = C — operator-reviewed backfill, after the master data is settled
                       (a dry-run census listing every blank row with its resolved candidate, or NO CANDIDATE,
                        reviewed before any write). NOT performed, NOT scripted this round.
```

`campaigns.marketplace_id` carries the same blank from the same save and should be included in whatever census
you approve — it is written by the same builder, in the same transaction, from the same variable.

---

## Regression contract (§14)

Pinned by the suite, against the **real shipped functions** rather than a restatement:

```
CA / Amazon      selectable, resolves blank      ← the defect, as a mechanism assertion
CA / Amazon      resolves normally once the registry row exists   ← the cure, proved
UK / Amazon      resolves to MKT-UK-AMZ          ← the control
UK / KM Amazon   resolves to MKT-UK-KMAMZ        ← no collision with Amazon
company mismatch resolves blank                  ← the second route to the same symptom
client sends marketplace_id · server derives nothing · blank is written as blank
mutants: picker stops reading fc_regular_forecast · resolver drops company · resolver drops country ·
         option value loses its company component            4 planted / 4 caught
```

The two open findings are written as **mechanism** assertions, so whichever fix you choose will fail this suite
and force the record to be updated rather than letting a decision resolve itself quietly.

---

## Results

```
FOCUSED   fc-id-r1-special-event-marketplace-id   25 passed / 0 failed   4/4 mutants
FILES_CHANGED  1 new test   SPECS_CHANGED  1 new evidence doc
BEHAVIOR_CHANGED NO · PRODUCTION_ROWS_WRITTEN 0 · DB_MIGRATION_REQUIRED NO
APPS_SCRIPT_SYNC_REQUIRED NO · FRONTEND_DEPLOY_REQUIRED NO · S6_BEHAVIOR_CHANGED NO
FC_MARKETPLACE_ID_ROOT_CAUSE_PROVEN = YES (mechanism) / PENDING (incident — one operator check)
```

## Sweep

```
sweep 1   565 passed / 571   SIX failing suites   20 canonical lines   <- my own suite broke a gate
sweep 2   566 passed / 571   five failing suites  19 canonical lines   DIRTY 0   clean
CANONICAL_FAILURE_SET_CHANGED = NO — diff-clean against the R8 artifact
CANONICAL_DIGEST = ebcf7bc1651e792f7dbab73544cfa2593f91664a9ed399a04f9a5ba9c9bc4f92   (reproduced)
WORKTREE_CLEAN_AT_END = YES
```

**The twentieth line was mine.** `demo-mode-retired-f1-small` D8 forbids any test file from naming the retired
demo runtime, and my fixture comment spelled it — while explaining why the fixture does *not* use it. The
repair is the mention removed, not a dynamically spelled name that slips past the check: the rule exists so
that nothing references the runtime, not so that references are obfuscated. The fixture behaviour is
unchanged.

This is the second time in this repository that exact gate has fired on a suite written to drive a page's
demo-or-live switch, which is why it is recorded here rather than quietly fixed.
