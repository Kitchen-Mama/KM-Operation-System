# APPS-SCRIPT-RUNTIME-SLIM-R1 — production load-surface audit

Read-only, spec-first. No runtime file changed, nothing synced, deployed, deleted or written.

- Frontend `74aca0b` · backend release `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R14`
- Audit tool: `assets/tools/apps-script-audit/gs-load-surface-audit.js`
- Suite: `assets/tests/apps-script-load-surface-slim-r1.test.js`

---

## The finding that changes the round

**The two files this round was convened to consider are not in the production project.** They are in the
repository directory; the deployment does not contain them.

```
TEMP_migrate_request_order_draft_v2.gs        418,557 B   NOT DEPLOYED
TEMP_demo_shipping_shipment_map_seed_v2.gs    300,182 B   NOT DEPLOYED
```

Five further files are in the same position. Together:

```
repository directory   83 files   4,933,803 B   (4.71 MB)
NOT deployed            7 files     808,195 B   (16.4% of the directory)
PRODUCTION PROJECT     76 files   4,125,608 B   (3.93 MB)
```

The premise that ~718 KB / 14.6% of the production project could be reclaimed is therefore **false**.
Those bytes are not being compiled on production requests. The remaining retirement surface is
**10,031 B — 0.24% of the deployed project.**

### How presence was established, and why it can be believed

The repository directory is not the deployment, and only 27 of the 83 files have a manifest row, so
for the other 56 "it is deployed" would have been an assumption. Each file was therefore asked about
directly: one top-level symbol unique to that file, probed through `system.health`'s
`probe_symbols`, which evaluates `typeof NAME !== 'undefined'` — a presence test that cannot invoke
what it names. Symbols declared in more than one file were not used, since they identify neither.

- **83 / 83 files probeable.** Positive controls (`doGet`, `doPost`) present; **negative control**
  symbols absent. A probe that answered one way to everything would prove nothing, so this is the
  precondition for reading any of its answers.
- **Corroboration.** Each of the seven "absent" files was re-probed with up to five further symbols of
  its own — 31 more symbols, all absent — and five "present" files were re-probed with a second symbol
  each, all present. Contradictions: 0.
- **Second, independent authority.** The live manifest reports
  `TEMP_migrate_shipping_allocation_ai_lifecycle.gs` in `absent_optional_modules`. The probe agrees.
  Two mechanisms, one answer.
- **One weaker case, stated as weaker.** `TEMP_draft_migration_diagnostic.gs` declares exactly **one**
  top-level symbol, so its evidence is that single probe. It is not corroborated to the same standard
  as the other six.

### What this audit cannot see

- **Files deployed that are not in the repository.** The probe can only ask about names it knows. No
  required manifest row is absent or stale and `missing_actions` is empty, so nothing *required* is
  missing — but an extra file pasted into the project by hand would not appear here.
- **Whether any scheduled trigger is installed.** See `SCHEDULED_TRIGGER_EVIDENCE` below.
- **The live value of a config constant.** `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` is read from the
  committed source of the deployed owner, not from the running project.

---

## §0 Identity and safety gate — PASS (17/17)

```
main = origin/main = feature = origin/feature = 74aca0b   ·   0 merge commits   ·   both worktrees clean
build_id R14 · mixed_deployment false · absent/stale/missing_actions all []
58_ and 63_ present and matching at R14 · 14_ R13 · 13_ R12 · 90_ hash 830563ef… unchanged
fc_regular_forecast 496 · fc_target_rules 2 · Special Event 1 / 4 / 4
9 retired Target Rule symbols absent; positive controls present, negative controls absent
DB_WRITES = 0
```

---

## §1 Inventory

Per-file records — bytes, top-level symbols, routed actions, reachability, inbound code and string
references, outbound dependencies, manifest row, build stamp, manual run entrypoints, mutation
capability and classification — are produced by the tool and are reproducible:

```
node assets/tools/apps-script-audit/gs-load-surface-audit.js HEAD --json out.json
```

### Deployed project by classification

| class | files | bytes | share |
|---|---:|---:|---:|
| A REQUIRED_RUNTIME | 71 | 2,898,839 | 70.3% |
| B GENERATED_RUNTIME | 1 | 1,208,080 | 29.3% |
| C MANUAL_OPERATOR_TOOL_ACTIVE | 1 | 4,230 | 0.1% |
| H AMBIGUOUS | 2 | 5,801 | 0.1% |
| H AMBIGUOUS (trigger owner) | 1 | 8,658 | 0.2% |
| **deployed total** | **76** | **4,125,608** | |

Classes D (future migration) and F (demo/seed) have **zero deployed bytes** — every file in those
classes is repository-only.

### Ten largest deployed files

```
1,208,080 B  29.3%  90_generated_supply_planning_bundle.gs     GENERATED, required
  240,759 B   5.8%  61_api_v1_weekly_ai_plan.gs                routed ×1
  239,834 B   5.8%  16_shipping_allocation_handlers.gs         routed ×6
  163,823 B   4.0%  13_procurement_handlers.gs                 routed ×9
  105,588 B   2.6%  63_api_v1_system_health.gs                 routed ×3
  101,059 B   2.4%  39_document_runtime_service.gs             routed ×5
  100,305 B   2.4%  11_shipping_plan_handlers.gs               routed ×6
   97,899 B   2.4%  66_api_v1_request_order_send.gs            routed ×4
   84,724 B   2.1%  12_shipment_handlers.gs                    routed ×4
   83,832 B   2.0%  42_api_v1_recommendation_workspace.gs      routed ×1
```

The single largest deployed file is the generated bundle, at 29.3%. It is required runtime and is not
a retirement candidate.

---

## §2 Entry-point and dependency graph

- **One web entry point:** `01_router.gs` (`doGet` and `doPost`). No other file defines either.
- **137 distinct routed actions**, each resolving to a `handleX_` owner.
- **74 of 83** directory files are reachable from the entry point through the global symbol graph.

### The blind spot this audit was rebuilt around

Apps Script binds a time-driven trigger **by name**:

```js
ScriptApp.newTrigger('runDailyInventoryGapMaterialization')
```

and `45_api_v1_automation_schedule.gs` lists both handlers as plain strings in its schedule table
(`handler: 'runDailyInventoryGapMaterialization'`). The first version of this analysis stripped string
literals before looking for identifiers and reported `44_gap_materialization_scheduler.gs` as having
**zero inbound references** — exactly the evidence someone would cite to delete a file a nightly
trigger calls.

Precision matters as much as recall here, and the two are easy to confuse. `46_api_v1_gap_materialization_job.gs`
names the same two handlers in a **line comment** and depends on neither. A scan that simply grepped for
the name would invent that edge and report a file as load-bearing when it is not — which is how dead
code stays deployed forever. The tool counts the first and not the second, and the suite asserts both
halves.

Code references and string references are now tracked separately, because they fail differently: a
code dependency breaks at compile time, a string dependency fails silently at 3am. Mutants M1 and M2
in the suite re-introduce each error and must be caught.

### The seven proofs, for the only files where removal is even discussable

Applied to `26_`, `27_`, `28_` (the three deployed-but-unreached files):

| # | requirement | evidence |
|---|---|---|
| 1 | no routed action calls it | `routedActions = []`; `handleRecommendationSourcePreview_` exists in `27_` but appears **0 times** in the router |
| 2 | no required runtime file reads its globals | every declared symbol: 0 references outside its own file, by code or string |
| 3 | no manifest/stamp requirement expects it | absent from all 27 manifest rows |
| 4 | removing it cannot cause a top-level ReferenceError | follows from (2) |
| 5 | no active scheduled trigger depends on it | no `newTrigger` names any of their functions — **but see `SCHEDULED_TRIGGER_EVIDENCE`** |
| 6 | no production migration is mid-flight | none of the three is a migration |
| 7 | the source remains recoverable | committed at `74aca0b`; the repository is never modified by a production deletion |

---

## §3 Request Order Draft V2 — special audit

**Not retired, and no production removal proposed.** The helper is already absent from production, so
there is nothing to remove.

| question | answer | evidence |
|---|---|---|
| is the helper deployed? | **No** | probe: 6 distinct symbols, all absent |
| `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` | **`true`** | `00_config.gs:37`, the deployed config owner |
| does any runtime file depend on its globals? | **No** | 0 inbound code refs, 0 inbound string refs |
| is it needed for a future authorised migration? | **Unproven either way** | see below |
| does a recovery procedure reference it? | **Not in source** | no runtime file names any of its symbols |

The cutover flag being `true` says the flat model is live. It does **not** prove the migration
completed cleanly, that no legacy tab is still required, or that no recovery path would want this
helper again — none of which can be read from source. Classification therefore stays:

**`D. FUTURE_MIGRATION_REQUIRED`** — with the distinction the round asked for made explicit:

```
retain source in the repository            YES — permanently. Do not delete.
retain the file in the production project  ALREADY NOT RETAINED. No action available.
re-add during an authorised window         The only way it should ever return.
```

Re-add procedure, should a future migration need it: paste the file from
`assets/specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs` at the reviewed commit, save,
create a deployment version, run the named `TEMP_R4_*` dry-run before any execute, then remove the file
and create a further version. Presence before and after is verifiable by the same typeof probe.

---

## §4 Shipping demo seed — special audit

Classified **independently** of §3.

| question | answer |
|---|---|
| deployed? | **No** — probe: 5 distinct symbols, all absent |
| manual entrypoints | `TEMP_DEMO4A_*` seed/clear/diagnose functions, repository-only |
| does any routed runtime consume its declarations? | **No** — 0 inbound references of either kind |
| could a rerun create duplicates? | **Cannot be excluded**, and does not need to be while the file is not deployed |
| needed outside an explicit demo/seed operation? | **No** |
| scheduled trigger reference? | none in source; see `SCHEDULED_TRIGGER_EVIDENCE` |
| source recoverable without keeping it compiled? | **Yes** — committed at `74aca0b` |

**`F. DEMO_OR_SEED_NOT_PRODUCTION_RUNTIME`.** No removal authorised or required.

---

## §5 Every TEMP / demo / diagnostic file

**No `TEMP_*` file is deployed.** All seven live in the repository only.

| file | bytes | class | deployed |
|---|---:|---|---|
| TEMP_migrate_request_order_draft_v2.gs | 418,557 | D | no |
| TEMP_demo_shipping_shipment_map_seed_v2.gs | 300,182 | F | no |
| TEMP_migrate_shipping_allocation_ai_lifecycle.gs | 36,728 | D | no — also `absent_optional_modules` |
| TEMP_order_planning_draft_readback_diagnose.gs | 17,404 | C | no |
| TEMP_document_diagnostics.gs | 15,423 | C | no |
| TEMP_request_order_send_diagnostics.gs | 12,609 | C | no |
| TEMP_draft_migration_diagnostic.gs | 7,292 | D | no (single-symbol evidence) |
| **total** | **808,195** | | **0 B deployed** |

Operator diagnostics under `assets/tools/apps-script-diagnostics/` are pasted by hand for a single
session and are outside the project directory entirely.

### Duplicate source / bundle copies

`90_generated_supply_planning_bundle.gs` (1.21 MB) is generated from the browser core modules. It
shares **no top-level symbol** with `26_` / `27_` / `28_`, so those three are not superseded copies of
bundled code — they are thin Apps Script boundaries that *call into* the bundle namespaces. The bundle
is the owner of the algorithms; the wrappers are the owner of `SpreadsheetApp` access. Neither is
redundant with the other.

---

## §6 Retirement batches — proposal only, none performed

### Batch A — zero-risk candidates

**Empty.** Every file that would have qualified is already out of the project.

```
ZERO_RISK_RETIREMENT_CANDIDATES = 0
ZERO_RISK_RETIREMENT_BYTES      = 0
```

### Batch B — future migration / operator tools

**Empty.** All class D and F files are repository-only; there is nothing deployed to remove.

### Batch C — ambiguous, remain deployed

| file | bytes | why ambiguous | evidence still needed |
|---|---:|---|---|
| `44_gap_materialization_scheduler.gs` | 8,658 | owns two trigger handlers named in `ScriptApp.newTrigger`; reachable only via a string edge from `45_` | the operator's **installed trigger list** |
| `26_recommendation_source_reader.gs` | 2,768 | header states it is an intentional forward placement for "the future orchestrator integration in Round 1S-P2" | whether 1S-P2 is still planned |
| `27_recommendation_production_source.gs` | 3,033 | declares `handleRecommendationSourcePreview_`, a handler prepared but **not routed** | whether the preview route is still intended |
| `28_recommendation_verification_diagnostics.gs` | 4,230 | the tool an operator runs **after deploying the bundle** ("Run this FIRST after deploying the bundle") | whether the bundle-deploy runbook still calls it |

All four stay deployed. `26_`–`28_` total 10,031 B = 0.24% of the project; removing them could not be
measured and would delete a documented forward placement and a live operator tool to save nothing.

**No batch is proposed for execution.** For each, the per-file fields the round asked for (delete
action, deployment version, symbol-absence verification, `system.health` expectation, rollback) are
moot while the answer is "do not remove", and would be filled in only if evidence changed the class.

---

## §7 Measurement plan — designed, and currently unrunnable

For a future authorised retirement, PRE and POST on the same `/exec`, same sampling code:

| probe | n | why |
|---|---:|---|
| no-action request | ≥ 20 | the floor; the only figure a smaller project should move |
| `getClientCapabilities` | ≥ 20 | floor + trivial handler |
| bootstrap slice | ≥ 20 | 4 sheets, facet derivation |
| regular slice | ≥ 20 | 1 sheet, largest payload |
| events slice | ≥ 20 | 1 sheet, small payload |

Report for each: median, p95, range; handler self-time (`meta.serverDurationMs`); dispatch/non-handler
time; redirect delivery hop timed separately; cold/warm label; unrecovered timeout count; and total
deployed `.gs` bytes and file count before and after.

Rules: **one batch at a time**; attribute nothing unless the POST distribution materially changes;
and a removal that produces no measurable improvement is reported as correct cleanup, never as the
latency fix.

**This plan cannot be run in this round, because no batch exists to run it on.** Baseline already
captured for whenever one does: floor median 4,223 ms / p95 4,967 ms / range 3,249–4,967 (n=8, 1,601 B);
handler medians bootstrap 2,861 ms, regular 1,100 ms, events 927 ms (n=20 each).

---

## §8 Long-term production project policy

Proposed, not implemented.

The production project should normally contain only routed runtime owners, required shared libraries,
the generated runtime bundle, and the health/safety owners. Migration, demo and diagnostic code should
be versioned in git, sealed and tested, introduced only for an authorised maintenance window, and
removed from production compilation after acceptance.

**The project is already operating this way.** Zero `TEMP_*` files are deployed and classes D and F
have zero deployed bytes. This audit's contribution is to make that an *asserted* property rather than
an accident: the presence probe and this suite can be re-run each release.

Recommended rule: **a file may enter the production project only if it is routed, referenced by a
routed owner, the generated bundle, or a health/manifest owner — or is inside a named maintenance
window with a recorded removal step.**

### Implications of a separate admin/migration project — recorded, not recommended yet

- **Credentials and binding.** A second project needs its own authorisation and its own binding to the
  Operation System Database spreadsheet. Two bindings mean two things that can point at the wrong
  spreadsheet; `29_production_safety_adapter.gs`'s target assertion would have to exist in both.
- **Permissions.** Migration code is exactly the code that writes. Splitting it out is a chance to give
  the runtime project narrower scopes — the strongest argument for the split.
- **Deployment identity.** `SYS_DEPLOYMENT_RELEASE_` and the manifest describe one project. A second
  project needs either its own release line or an explicit statement that it is unversioned.
- **Rollback.** Today a bad release is one deployment-version repoint. With two projects a migration
  window spans both, and rollback has to name which.
- **Cost/benefit today.** The measured benefit is **zero bytes**, because nothing is deployed that
  would move. The split should be justified by *permission narrowing*, not by load surface.

---

## §9 Builder first-use observation — recorded, not actioned

Operator observed: **New FC Update → choose Regular Forecast or Special Events → Next** waits on first
use; subsequent uses are fast.

Current classification: **`EXPECTED_ONE-TIME_LAZY_PREREQUISITE_LOAD`, not yet proven to be a defect.**
No Builder runtime was examined or changed in this round.

Acceptance requirements added to **FC-SUMMARY-R2B-A3-R1**:

1. Measure the exact requests triggered by card selection and by **Next**, separately.
2. Identify the SKU / pricing / campaign prerequisite owners.
3. Selected-flow-only prefetch may start when the user selects the card.
4. Prefetch must **not** start at FC Summary page boot.
5. **Next** must reuse the same single-flight promise, not start a second read.
6. Subsequent opens reuse valid in-memory prerequisites.
7. Regular and Special Event prerequisites must not eagerly load each other.
8. The loading UI must state what is being prepared.
9. A failed prerequisite read preserves the user's inputs and supports one bounded Retry.
10. No write occurs during prefetch.
11. No broad FULL workspace request.
12. No new global eager boot dependency.

---

## §10 App-shell backlog — recorded for S8

```
cold app shell to readyState complete   ~32.8 s, 115 requests
warm                                     ~0.5 s
scope                                    every page; not caused by FC-SUMMARY-R3-R1
likely shape                             frontend route/asset manifest + selected-route lazy module loading
```

`app.js`, the index script topology and global assets were not modified in this round.

---

## Verdicts

```
PRODUCTION_GS_FILE_COUNT            76        (repository directory holds 83)
PRODUCTION_GS_TOTAL_BYTES           4,125,608 (3.93 MB; the directory is 4,933,803 / 4.71 MB)
REQUIRED_RUNTIME_BYTES              2,898,839 (70.3%)  + GENERATED 1,208,080 (29.3%) = 99.6%
MANUAL_TOOL_BYTES                   4,230     (0.1%, deployed)   ·  45,436 repository-only
FUTURE_MIGRATION_BYTES              0 deployed                    ·  462,577 repository-only
ZERO_RISK_RETIREMENT_CANDIDATES     0
ZERO_RISK_RETIREMENT_BYTES          0
AMBIGUOUS_CANDIDATES                4  (44_, 26_, 27_, 28_ — 18,689 B, 0.45%)
REQUEST_ORDER_V2_HELPER_CLASSIFICATION   D. FUTURE_MIGRATION_REQUIRED — already absent from production
SHIPPING_DEMO_HELPER_CLASSIFICATION      F. DEMO_OR_SEED_NOT_PRODUCTION_RUNTIME — already absent
SCHEDULED_TRIGGER_EVIDENCE          NOT OBTAINABLE FROM SOURCE — OPERATOR EVIDENCE REQUIRED.
                                    Source shows two trigger handlers and an installer/uninstaller in
                                    44_gap_materialization_scheduler.gs. Whether either trigger is
                                    currently INSTALLED can only be read from the project's trigger
                                    list. Until that is supplied, 44_ stays AMBIGUOUS.
PROJECT_SPLIT_RECOMMENDATION        NOT NOW. Zero measurable load-surface benefit, because nothing
                                    that would move is deployed. Revisit only to narrow write scopes.
ESTIMATED_REDUCTION_BY_BATCH        A: 0 B · B: 0 B · C: 0 B (remains deployed) — total 0 B, 0.00%
RETIREMENT_AUTHORIZED = NO
DB_WRITES = 0
APPS_SCRIPT_SYNC_REQUIRED = NO
FRONTEND_DEPLOY_REQUIRED = NO
```

## Smallest safe next retirement batch

**There is none worth proposing, and proposing one anyway would be the wrong answer.** The largest
available batch is 10,031 B — 0.24% of a project whose floor is 4.2 s. It cannot produce a measurable
change, and each of the three files has a stated reason to exist.

If the user wants the project minimal regardless of measurable effect, the smallest *defensible* batch
is a single file:

```
28_recommendation_verification_diagnostics.gs        4,230 B   (0.10%)
  why it is safe      unrouted; 0 inbound references of either kind; no sheet write, no Drive, no
                      mail; not in the manifest; source retained in git
  evidence still needed  confirmation that the bundle-deploy runbook no longer calls
                         verifyRecommendationRuntimeNamespaces() after a 90_ deployment
  production action   delete the file in the Apps Script editor, save, create a new deployment version
  verification        typeof probe for rvdBundle_ and verifyRecommendationRuntimeNamespaces → absent;
                      system.health unchanged: R14, mixed_deployment false, absent/stale/missing empty
  rollback            re-paste from assets/specs/active/apps-script/ at this commit, save, new version
  DB/write risk       none — the file performs no write
  expected latency    NONE. 0.10% of the project. Report as cleanup, never as a latency fix.
```

**Recommendation: do not run even that one until its runbook question is answered.** The load surface
is not where the 4.2 s floor lives, and this audit's most useful result is that it has ruled the
hypothesis out rather than spent a maintenance window confirming it.

Stop for user authorisation.
