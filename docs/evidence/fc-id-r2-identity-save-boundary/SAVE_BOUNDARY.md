# FC-ID-R2 — the canonical identity save boundary

**Base** `dc26616` · `PRODUCTION_ROWS_WRITTEN = 0` · `PRODUCTION_BACKFILL_ROWS = 0` · `DB_MIGRATION_REQUIRED = NO`

Suite: `assets/tests/fc-id-r2-canonical-identity-save-boundary.test.js` — 70 passed / 0 failed, 8/8 mutants.
Closes the defect FC-ID-R1 found and FC-ID-R1B re-diagnosed. Neither earlier round changed behaviour; this
one does, on both sides of the wire.

---

## What R1 and R1B left standing

```
R1   proved the MECHANISM: the picker is registry ∪ fc_regular_forecast; the resolver is registry-only.
R1B  disproved R1's INCIDENT CAUSE: MKT-RESTW-CA-AMAZON exists. The missing registry is the RUNTIME one.
R2   stops acting on it.
```

Both rounds ended at a boundary that still wrote a blank canonical identity. That boundary now refuses.

---

## The finding that made the server half necessary

It is not a scenario. It is in the writer, `14_ fcSpecialEventUpsert_`, UPDATE branch:

```js
headers.forEach(function (h) {
  if (h === 'event_fc_id' || h === 'created_by' || h === 'created_at') return;
  if (body.hasOwnProperty(h)) setCell(targetRow, h, body[h]);
});
```

`hasOwnProperty` makes **absent** and **blank** two different instructions:

```
marketplace_id ABSENT  ->  the stored value is left alone
marketplace_id BLANK   ->  hasOwnProperty is TRUE, so the stored canonical id is ERASED
```

The Builder always includes the field (`marketplace_id: marketplaceId`, twice — the campaign header and every
event row). R1B proved that value is `''` whenever the runtime registry is unhydrated. So:

> **An operator editing an existing CA event's quantity, on a page whose registry read failed, silently
> replaces a correct `MKT-RESTW-CA-AMAZON` with `''`.**

`marketplace_id` is also part of this table's **fallback row key** (`campaign_id + marketplace_id + sku +
event_month + year`) and of `FC_SE_FINGERPRINT_FIELDS_`, so the erasure changes both the row's identity and
its version. That is §7's forbidden case — *valid stored id → blank id because reference hydration failed* —
and it was reachable, not hypothetical.

```
VALID_ID_CAN_BE_ERASED_BY_RUNTIME_FAILURE = NO   (after this round; it was YES before it)
```

---

## §2 / §3 — one owner, and a result that is no longer a string

```
IDENTITY_RESOLVER_OWNER        _evtMarketplaceIdentity_        (fc-summary.js)
IDENTITY_RESOLVER_CALLER_COUNT 1                               saveEventUpdate()
CREATE_CALLER                  saveEventUpdate()  — create and edit are the SAME function
EDIT_CALLER                    saveEventUpdate()
OTHER_CALLERS                  none
IDENTITY_LOOKUP_STATES         READY_UNIQUE | UNREAD | READ_FAILED | NO_MATCH | AMBIGUOUS
NEW_STATE_MACHINE_CREATED      NO
```

The classification is **derived** from the read-model vocabulary that already exists — `_fcHas_`,
`_fcSliceRec_`, `FC_FRESH_` — and nothing is stored, so it cannot drift from the model it describes.
`_fcRegistrySourceReady_` is the third sibling of `_fcRegularSourceReady_` and `_fcEventSourceReady_`, asking
the same question of the store that is authoritative in the current mode. `marketplaces` rides the
**bootstrap** slice, which is why it is a separate predicate rather than a shared one taking a key.

`_evtResolveMarketplaceId` survives as the **string face** of the same mapping and delegates to it. There is
one filter, in one function. Keeping it matters: FC-ID-R1 and R1B prove the mechanism through that name, and
the mechanism is unchanged — R2 hardened the save, not the lookup.

### Two things are deliberately stricter than before

**1. All three dimensions must be present and must match.** The old filter skipped any dimension the site did
not carry (`!site.company || …`), so a site with no company would adopt the first row of *any* company. The
save path refuses a blank company for its own reasons, so this closes a hole rather than changing a behaviour
anything depended on.

**2. `[0]` is gone.** Uniqueness of `(company, country, marketplace)` is **not enforced anywhere in the
schema**, which is exactly why taking the first row is a guess. Two matches is an answerable question with no
single answer, and the boundary now says so.

A single match whose own `marketplaceId` is blank is **not** a resolution: the row exists, the identity does
not. It reports `NO_MATCH`.

---

## §4 / §11 — where the refusal sits, and why that position is the whole of the write truth

The gate is above `_fcWriteBegin_` and above every `DB.` call, asserted by source position:

```
_evtMarketplaceIdentity_(site)     <  _fcWriteBegin_('eventBuilder')  <  DB.upsertCampaign / …
```

So a refusal opens no logical write, enters no write state, dispatches no request and touches no form field:

```
IDENTITY_REFUSAL_WRITE_REQUEST_COUNT = 0     write truth = CONFIRMED_NOT_STARTED
FALSE_WRITE_FAILURE_COUNT = 0                FALSE_WRITE_SUCCESS_COUNT = 0
AUTOREPLAY_ON_UNKNOWN = NO                   BLANK_MARKETPLACE_ID_WRITE_COUNT = 0
```

It is the same refusal grammar as the unreadable-duplicates refusal twenty lines above it — one grammar on
this boundary, not two.

### The four messages say four different things

| state | what the operator is told |
|---|---|
| `UNREAD` / `READ_FAILED` | the reference data has not loaded; use **Retry**, then Save again |
| `AMBIGUOUS` | the registry holds *n* rows for this site; correct the duplicates — this will not guess |
| `NO_MATCH`, registry **empty** | the registry loaded with **no rows at all** — a loading problem, not a problem with this event |
| `NO_MATCH`, registry populated | no canonical identity for *company / country / marketplace*; check the master data |

The last split matters. R1B proved the reachable incident is a registry that landed **empty**; telling the
operator "no canonical identity for ResTW / CA / Amazon" in that state would send them to edit master data
that is perfectly correct.

---

## §5 — retry repairs the reference data, and does not replay the save

```
FORM_STATE_SURVIVES_IDENTITY_RETRY = YES
RETRY_REFERENCE_REQUEST_COUNT      = 1   (the EXISTING _fcRetryFailedSlices_ single-flight)
SAVE_AUTOREPLAY_COUNT              = 0
```

**No retry mechanism was added, and that is the design.** The gate `alert`s and `return`s. The form is
untouched because nothing in the gate writes a value; the operator uses the Retry the banner already owns, and
presses Save again themselves. A boundary that repaired its own precondition and continued would be
submitting a form nobody re-approved — the mutant `J6` plants exactly that and is caught.

### One honest limit on the state set

`UNREAD` is defended against but is **not reachable at this boundary in Workspace mode**: `_fcModelUsable_`
requires the bootstrap slice, so a page whose bootstrap never landed cannot draw the builder at all. The live
states at save time are `READ_FAILED` (a refused bootstrap, which *is* in the Retry set) and `NO_MATCH` over
an empty or incomplete registry — which is R1B's scenario 2b, the variant that fits a working page. The
`UNREAD` branch exists because the classifier must be total, not because it is the incident.

---

## §6 — the server validates, and refuses to derive

```
SERVER_VALIDATES_MARKETPLACE_ID = YES
SERVER_DERIVES_MARKETPLACE_ID   = NO
CREATE_BLANK_ID_WRITE           = REFUSED
EDIT_BLANK_ID_WRITE             = REFUSED
```

`fcSeValidateMarketplaceIdentity_` runs in the two entry points, beside every other pre-write check, so the
core upsert keeps one job and no second place decides what an identity is.

```
ABSENT     -> ALLOWED. Nothing to verify and nothing written to that column.
BLANK      -> BLANK_MARKETPLACE_ID_REFUSED
NON-BLANK  -> must name a real registry row (MARKETPLACE_ID_NOT_CANONICAL)
              whose company/country/marketplace agree (MARKETPLACE_IDENTITY_MISMATCH)
UNVERIFIABLE (registry unreadable) -> MARKETPLACE_REGISTRY_UNREADABLE
```

**The validation mirrors the writer's own `hasOwnProperty` contract rather than inventing a second one**, and
that is what makes it compatible. `fcBuildEventWriteRows` — the Special-Event **inline quantity edit** —
sends `event_fc_id`, `campaign_id`, `campaign_sku_line_id`, `event_name`, `sku`, `fc_qty`,
`expected_row_version` and **no identity columns at all**. Refusing an absent id would have broken that live
caller to fix a different one. It is untouched, and it costs zero extra reads.

**It does not derive, deliberately.** Going from the triple to an id is the one repair that looks helpful and
is a guess, because uniqueness is not DB-enforced. The registry is read **by the claimed id only** — a
direction that can verify and cannot derive. Mutant `J8` plants the derivation and is caught.

**Cost:** the registry is read at most **once per request**, lazily, and only when some row actually claims a
non-blank id.

### The one behaviour I want you to look at before deploying

`MARKETPLACE_REGISTRY_UNREADABLE` is **fail-closed**: if the `marketplaces` sheet is missing or has no
`marketplace_id` column, a save that claims an id is refused rather than trusted. That is consistent with the
round's thesis — the server does not accept what it cannot verify — but it converts a missing reference sheet
into a write outage for this path. The blast radius is bounded to callers that supply an id (the Builder), and
the inline edit is unaffected. If you would rather it fail open, that is a one-line change and your call.

---

## §12 — data repair boundary

No production row was read, written or backfilled.

```
PRODUCTION_BACKFILL_ROWS = 0
BACKFILL_RULE (documented only, unchanged from R1B)
  a blank marketplace_id row may be repaired ONLY when (company, country, marketplace) maps to
  EXACTLY ONE canonical registry row.
    zero matches      -> NO CANDIDATE
    two or more       -> NO CANDIDATE, never a guess
  For ResTW + CA + Amazon the known canonical result is MKT-RESTW-CA-AMAZON.
No broad "Amazon blank id" replacement is implemented or implied.
```

`campaigns.marketplace_id` carries the same blank from the same save and belongs in the same census.

---

## §13 — the cold path is not touched

```
NEW_FULL_TABLE_READS_ADDED                = 0
NEW_SAVE_TIME_REFERENCE_READS_ADDED       = 0
NEW_NETWORK_ROUND_ADDED_TO_HEALTHY_SAVE   = 0
```

Identity reads through `_fcGetMarketplaces()` — the page's existing accessor over rows the bootstrap slice
already brought — and issues nothing. The server's registry read happens on a **write**, not on a form
interaction, and never on the inline-edit path. FC-1 / FC-2 / FC-3 / FC-4 are untouched and remain
FC-SUMMARY-STABILITY-R2's work.

---

## Release

14_'s served bytes changed, so the repository's stamp rules apply — this is bookkeeping the rules require,
not a release cut from assumption.

```
FCW_BUILD_VERSION_   R18 -> R29   (14_ joins the CURRENT unshipped release)
63_ manifest row     expected updated to match
stamp suite          14_ moves from RELEASE_UNMOVED to RELEASE_OWNERS, with its reason
```

It joins R29 rather than minting R30 **because R26 onward have accumulated unshipped**, and cutting a fresh id
would march `01_`, `47_`, `63_`, `73_` and `90_` to a release none of them changed in — the "unrelated release
identities" §15 forbids rotating.

```
FRONTEND_DEPLOY_REQUIRED = YES
FRONTEND_DEPLOY_SET      = assets/js/pages/fc-summary.js

APPS_SCRIPT_SYNC_REQUIRED = YES
APPS_SCRIPT_SYNC_SET      = 14_fc_write_handlers.gs, 63_api_v1_system_health.gs
  (the full declared copy set for the R29 release remains 01_, 14_, 47_, 63_, 73_, 90_ — the gate's I1
   list — of which THIS round changes the two above)

BACKEND_RELEASE          = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R29   (unchanged — joined, not rotated)
APPLICATION_TOKEN        = s5r4-actionreason-20260928           (unchanged)
TOKEN_ROTATION_REQUIRED  = YES, AT DEPLOY — and not performed here
```

**Worth your attention at deploy time.** `index.html` cache-busts `fc-summary.js` with the application token,
and **two unshipped rounds have now changed that file under the same unrotated token** — FC-SUMMARY-STABILITY-R1
and this one. A deploy that does not rotate it leaves returning browsers on the cached copy, so both repairs
would appear to have shipped and neither would be running. Rotation is a release-wide act covering every
application asset, which is why it is named here rather than done in a round whose deployment is on HOLD.

```
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD   S6_BEHAVIOR_CHANGED = NO
```

---

## Tests

```
FOCUSED    fc-id-r2-canonical-identity-save-boundary    70 passed / 0 failed
MUTATION   8 caught / 8 planted
           J1 readiness guard deleted · J2 `[0]` ambiguity selection restored · J3 gate allows blank
           J4 company dropped · J5 country dropped · J6 Retry replays Save
           J7 server accepts blank again · J8 server derives from the triple
DEPENDENT  fc-id-r1 27/0 · fc-id-r1b 40/0 · release-stamp 91/0 · special-event-prefetch 134/0
           window-identity · initial-read-recovery · stability-r1 · refusal-classification
           · retry-canonical-hydration · campaign-reuse · base-event-window  — all exit 0
```

### Six suites needed maintenance, and each one is worth naming

Nothing below weakened an assertion; each followed an invariant to where it now lives.

- **Four harnesses** lift `_evtResolveMarketplaceId` and had to declare the dependency it gained. They lift
  functions explicitly by design, so this is the mechanism working.
- **`fc-id-r1` E2/E3** mutated the old filter text. Re-anchored — and **E3 is now killed on the
  classification rather than on the id**, because dropping `country` makes the lookup AMBIGUOUS, so the real
  code and the mutant both return `''`. A string comparison could no longer tell them apart. That is the
  collapse this round removed, demonstrated inside the suite that first documented it.
- **`fc-id-r1` D2 and `fc-id-r1b` G1** asserted *"14_ never opens the marketplaces registry"*. That was a
  sound **proxy** for "the server does not derive" only while no read existed. R2 gives 14_ a read for the
  opposite purpose, so the proxy had to be replaced by the invariant it stood for — otherwise it would fail on
  a change that strengthens the very property it was defending.
- **`fc-special-event-identity-and-builder-prefetch`** assembles the real server from named pieces; it gained
  the validator and a `marketplaces` fixture, so its existing cases now exercise the healthy identity path for
  real.
- **`fc-target-rule-release-stamp`** B2-0 pinned 14_ to R18. It now follows the file between the two lists
  instead of pinning it to one, and asserts that the change the stamp claims is genuinely in the file.

### Two assertions I got wrong on the first run

Both were mine. `G11` banned `[0]` in the validator — but `p[0]` is tuple indexing in the dimension loop, so
the check now targets the shape derivation actually takes (`)[0]`, a triple key) rather than two characters it
happens to share. `H1` claimed the gate precedes the create/edit branch — there is an **earlier**
`_evtEditingActive_()` driving the window preflight, so the claim was stronger than the code supports. It now
asserts what must hold: the gate precedes both payloads that carry the id, and those two are the only ones.

## Sweep

```
FULL_SWEEP_RESULT = <filled after sweep>
CANONICAL_FAILURE_SET_CHANGED = <filled after sweep>
CANONICAL_DIGEST = <filled after sweep>
DIRTY = <filled after sweep>
```
