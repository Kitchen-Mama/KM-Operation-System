# S7 - PHASE-1 SUPPORTING / AUXILIARY EXECUTION MAINLINES

Companion to `S5_*` (Ordering / Supply Planning) and `S6_SHIPPING_EXECUTION_MAINLINE_CONTRACT.md`
(Shipping / Inventory Execution). S7 owns SUPPORTING and AUXILIARY capability only. It creates no third
planning authority, and Phase-2 Ordering-to-Shipping lead-time orchestration stays deferred.

---

# PART I - S7-R1: CONTRACT + COMPLETENESS AUDIT

```
PRE_SHA  d5f038a        POST_SHA  (this commit)      branch  feature/product-strategy-board-p0
MODE     audit / inventory / authority freeze only   RUNTIME FILES CHANGED  0
ENTERED UNDER  S5_READY_FOR_INTEGRATION = YES . S6_FINAL_SEAL = YES . OPEN_S6_BLOCKERS = none
```

## Sec1 - WHAT THIS ROUND DID AND DID NOT DO

It read the live tree and classified. It changed no production file, drove no handler, wrote no row and cut
no release. Everything below that can be derived from the tree IS derived from the tree, by
`assets/tests/s7-r1-supporting-flow-contract-audit.test.js`, so this document cannot drift from the code it
describes without a named test failure.

**The word DISCONNECTED is used precisely.** A supporting flow runs

    page -> KM.DB adapter method -> action -> router dispatch -> handler -> canonical owner

and it is DISCONNECTED when a link is missing while the rest of the chain exists. A chain that was never
built is UNBUILT, which is a different thing and is classified differently. Both findings below are the
first kind: the parts exist and do not meet.

## Sec2 - THE SUPPORTING-FLOW CENSUS

```
SUPPORTING_FLOW_COUNT  37      (32 in the matrix below + 5 declared-absent, listed under it)

A already complete .............. 23     E disconnected after API migration ....  2
B partially complete ............  2     F planned, not implemented ............  2
C UI-only .......................  1     G deferred beyond Phase 1 .............  3
D backend-only ..................  4
```

| # | FLOW | USER SURFACE | CANONICAL OWNER | STATUS | MAINLINE DEP | WRITE OWNER | READ OWNER | P1? | ROUND |
|---|------|--------------|-----------------|--------|--------------|-------------|------------|-----|-------|
| 1 | Carrier master | Carrier Rate Card | 17_ | A | - | 17_ | 03_ getTable | yes | - |
| 2 | Carrier rate cards | Carrier Rate Card | 17_ | A | S6 | 17_ import | 03_ / 40_ | yes | - |
| 3 | **Carrier lead times** | read-only join | 17_ seed only | **B** | S5+S6 | **none** | 03_ / 60_ | **yes** | **S7-R3** |
| 4 | Rough quote / method candidates | Weekly Plan | 17_ | A | S6 | - | 17_ | yes | - |
| 5 | Final carrier selection | Weekly Plan / Draft | operator | A | S6 | 11_ / 12_ | 40_ / 57_ | yes | - |
| 6 | Carrier recommendation | AI Plan | KMMR + 61_ | A | S5 | - | KMMR | yes | - |
| 7 | **Carrier name at render** | Draft / Overview | KM.display | **E** | S6 | - | **missing** | **yes** | **S7-R2a** |
| 8 | Shipment Overview read model | Shipment Overview | 57_ | A | S6 | none | 57_ | yes | - |
| 9 | Shipment document generation | Shipment Draft | 36_ / 37_ / 39_ | A | S6 | 39_ | 39_ | yes | - |
| 10 | **Document list / reopen / retry** | **none** | 39_ | **E** | S6 | 39_ | 39_ | **yes** | **S7-R2b** |
| 11 | Purchase Order documents | none | 39_ | D | S5 | 39_ | 39_ | decide | - |
| 12 | Final Output snapshot | - | 34_ | A | S6 | 34_ | 34_ | yes | - |
| 13 | Document templates | none | 36_ | D | - | 36_ | 36_ | no | - |
| 14 | On-the-Way map | On-the-Way Map | 57_ | A | S6 | none | 57_ | yes | - |
| 15 | Factory inventory | Factory Inventory | 21_ | A | S6 | 21_ | 71_ / getTable | yes | - |
| 16 | Overseas inventory | Overseas Inventory | 05_ | A | S6 | 05_ | 70_ | yes | - |
| 17 | Factory operation config | Factory Inventory | 62_ | A | - | 62_ | 62_ | yes | - |
| 18 | Factory stock guard | Site Inventory | 71_ | A | S5 | - | 71_ | yes | - |
| 19 | SKU Details | SKU Details | 03_ | A | - | 03_ | 59_ | yes | - |
| 20 | SKU Regional Details | SKU Regional Details | 18_ | A | - | 18_ | 59_ | yes | - |
| 21 | Site pricing | SKU Regional Details | 73_ (+04_ create) | A | - | 73_ / 04_ | 72_ | yes | - |
| 22 | Marketplace / SKU import | Site Inventory | 04_ | A | S5 | 04_ | 03_ | yes | - |
| 23 | Tax reference | SKU Details only | 19_ | B | - | 19_ | 59_ | no | POST_S7 |
| 24 | Promotion Risk Tracker | Campaign Risk | 20_ | A | - | 20_ | getTable | yes | - |
| 25 | SKU Handbook | SKU Handbook | 03_ | A | - | - | getTable | yes | - |
| 26 | Automation schedule | Automation Schedule | 45_ | A | S5 | 45_ | 45_ | yes | - |
| 27 | Amazon snapshot import | none (scheduled) | 07_-10_ | D | S5 | 07_ | 07_ | yes | - |
| 28 | Scope registry | Site Inventory | 64_ | A | S5 | - | 64_ | yes | - |
| 29 | System health / deploy contract | boot | 63_ | A | - | - | 63_ | yes | - |
| 30 | Flow diagnostics | none | 65_ / 67_ / 68_ | D | - | - | own | yes | - |
| 31 | Product Strategy Board | staged nav | 72_ | A | - | - | 72_ | yes | - |
| 32 | **Forecast Review** | Forecast | **none** | **C** | - | - | **none** | **decide** | **S7-R2c** |

The five remaining flows are DECLARED ABSENT - the navigation names each one and refuses it, which is a
different and better posture than silence:

| 33 | Container Rate Card | nav `Soon` | - | F | - | - | - | no | - |
| 34 | Warehouse Pricing | nav `Soon` | - | F | - | - | - | no | - |
| 35 | Supply Chain Canvas | Supply Chain Canvas | page-local | G | - | localStorage | none | no | - |
| 36 | Overseas Inbound | nav guard | - | G | - | - | - | Phase-2 | - |
| 37 | Overseas Outbound | nav guard | - | G | - | - | - | Phase-2 | - |

Supply Chain Canvas was adjudicated at S2-R4C: a presentation artefact that owns no business truth, issues
no request and stores geometry and free text in the browser. It is out of S7 scope rather than unfinished.

```
PHASE1_REQUIRED_SUPPORTING_FLOW_COUNT   3 confirmed  + 2 awaiting an operator decision
ALREADY_COMPLETE_COUNT  23    PARTIAL_COUNT  2    DISCONNECTED_COUNT  2    DEFERRED_COUNT  3
WRONG_PHASE_FEATURE_COUNT  0   - nothing from S8 / S9 / S10 / S11 entered this round
```

## Sec3 - FINDING 1: A LANE CAN BE PRICED THROUGH THE UI AND TIMED ONLY BY HAND

A routable lane needs BOTH halves of its authority: a rate card in `carrier_rate_cards` and a transit time
in `carrier_lead_times`. The two tables are maintained very differently.

```
carrier_rate_cards    import template . preview . confirm . a page . a routed action . an owner
carrier_lead_times    a seed function
```

`carrier_lead_times` is opened for writing in exactly one place in the whole backend:
`handleSeedSinotransCarrier_` (17_), which plants one CN-to-JP lane. There is no routed action for creating
or editing a lead time, no adapter method, and no page control. The Carrier Rate Card import does not merely
omit them - it REFUSES them, by name, as a validation error: *Lead Time / transit columns are not allowed in
a Carrier Rate Template.* That refusal is correct, because lead time is not rate-card data; it simply leaves
nowhere else to go.

Two surfaces depend on the table they cannot maintain: the Carrier Rate Card page joins it for display, and
the Execution Plan method registry builds lane options from it. A new lane is therefore half-creatable
through the application and must be finished by editing the spreadsheet directly.

```
CARRIER_SUPPORT_STATUS            CONNECTED, with one unmaintainable authority
CARRIER_OWNER_COUNT               4 server modules (17_ master/rates/quote, 11_ plan persist,
                                  12_ shipment snapshot, 61_ recommendation) + KMMR in the browser
SECOND_CARRIER_RATE_AUTHORITY_COUNT   0
```

There is exactly one freight computation, `shippingFreight_` in 17_, and its only callers are the Weekly
rough estimate (11_) and the Shipment exact quote (12_). The AI Plan declares in code that it does not price
at all - `cost_basis: NOT_EVALUATED_IN_AI_PLAN` - which is the three-layer boundary holding.

## Sec4 - FINDING 2: THE SHIPMENT SURFACES SHOW A CARRIER ID BECAUSE THE RESOLVER LOST ITS DATA

`carrier_name` is deliberately never stored on a plan, a shipment or a rate card; `carrier_id` is the
identity and the name is resolved against the `carriers` master at render. Two reads, two outcomes:

```
40_  Weekly Shipping Plan     loads the carriers master, emits carrier { id, name }      -> shows a name
57_  Shipment Draft/Overview  loads carrier_rate_cards only, emits carrierId             -> shows an id
```

The browser has a resolver built for exactly this gap - `KM.display.carrierName(carrierId)` - and it reads
through `KM.DB.getOperationDb()`. **That member does not exist.** Nothing in the browser assigns it; the API
migration removed the whole-DB getter and the resolver was left reading a name that is no longer there. Its
`typeof` guard is therefore permanently false and the function always returns the empty string.

No page calls it today, so this is a latent trap rather than a live wrong answer, and the Shipment surfaces
print `WH-TW-CN-...`-style identifiers where the Weekly Plan prints a carrier. Repairing it is a choice
between two one-line shapes - have 57_ serve the master as 40_ does, or restore the browser getter - and the
first is preferred because it keeps the resolution on the side that already owns the read.

```
CARRIER_API_DISCONNECT_COUNT   1
```

## Sec5 - FINDING 3: A DOCUMENT CAN BE GENERATED AND THEN NEVER FOUND AGAIN

> **[WITHDRAWN BY S7-R2A - see PART III Sec35. THIS FINDING IS WRONG.** Both Document Panels exist and
> share one renderer. The probe behind it searched for `KM.DB.listEntityDocuments` call sites and found
> none, which is true and proves nothing: the panels are fed by each workspace's `documents` include, not
> by `document.list`. The section is kept as written so the mistake is legible.]**

The document runtime is complete on three of its four layers and absent on the fourth.

```
handler    39_  handleEntityDocumentList_ . handleGeneratedDocumentGet_ . handleDocumentRetry_   present
router          document.list . document.get . document.retry                                    routed
adapter         KM.DB.listEntityDocuments . getGeneratedDocument . retryDocumentGeneration       exported
page                                                                                             NONE
```

The one wired half is generation: the Shipment Draft calls `generateShipmentDocument` and opens the returned
`download_url`. If the operator closes that tab, the application offers no way back to the file, no list of
what has been produced for a shipment, and no retry for a generation that failed - although the server can
answer all three questions and the adapter already knows how to ask them. The router's own comment describes
`document.list` as *the read path the Shipment and Purchase Order workspaces project into their Document
Panels*. There are no Document Panels.

Purchase Order documents are a separate matter and a different classification: 39_ serves
`related_entity_type: 'purchase_order'` and the PO surfaces have no document control of any kind - not a
broken link but an unbuilt one, which is an operator decision rather than a repair.

```
DOCUMENT_SUPPORT_SURFACE_COUNT          1 live (Shipment Draft generate)
DOCUMENT_OWNER_DRIFT_COUNT              0
DOCUMENT_DATA_SOURCE_DISCONNECT_COUNT   1       PO document family  ->  operator decision
```

## Sec6 - SHIPMENT OVERVIEW: A READ MODEL THAT ALSO CARRIES ACTIONS, AND OWNS NEITHER

A naming correction first, because the audit brief and the navigation disagree: **there is no Shipping
History entry in the sidebar.** `shipping-history.js` serves two sections - Shipment Overview
(`shippinghistory-section`) and Shipment Draft - and the surface S7 was asked to audit is Shipment Overview.

It is not read-only, and saying so plainly matters more than the label. It issues real writes: execution
snapshot edits, status advance, revert-to-draft, hide-from-draft, cancel, allocation generation and dispatch.
Every one of them is a call into a canonical S6 owner through a routed action. It opens no transport of its
own, computes no inventory balance, and duplicates no server calculation.

```
SHIPPING_HISTORY_STATUS               CONNECTED - a read model plus delegated operator actions
SHIPPING_HISTORY_WRITE_OWNER_COUNT    0    (it performs writes; it OWNS none)
SHIPPING_HISTORY_TRUTH_DRIFT_COUNT    0
```

Carried unchanged: the `s2-r4b-shipping-history-and-fc-warm-race` harness prints FAIL A3 and exits 0. It did
not block any finding in this round and is not repaired here.

## Sec7 - INVENTORY, SKU, REGIONAL AND PRICING SUPPORT

All connected. Factory and Overseas pages reach their canonical owners through the adapter, movement logs
included; `FACTORY_INVENTORY_ADJUSTMENT_STABILITY_SEAL = YES` is carried, not reimplemented, and no S6
inventory arithmetic was reopened.

```
FACTORY_SUPPORT_STATUS  CONNECTED     OVERSEAS_SUPPORT_STATUS  CONNECTED
INVENTORY_SUPPORT_DISCONNECT_COUNT  0
SKU_FUNCTIONAL_DISCONNECT_COUNT  0   REGIONAL_  0   PRICING_  0
PRICING_REFERENCE_OWNER_COUNT  1 read (72_)    SECOND_PRICING_AUTHORITY_COUNT  0
PRICING_CONSUMER_DISCONNECT_COUNT  0
```

**One caveat recorded rather than repaired.** 73_ describes itself as the ONE writer of `pricing_list`, and
that is not literally true: 04_ CREATES `pricing_list` rows when a new marketplace SKU is imported. The split
is deliberate and safe - the verbs are disjoint (04_ creates and never overwrites a price; 73_ updates), the
new row is fail-closed as `pending_fx` with blank ownership flags so FX cannot later claim what nobody owns,
and 04_ reuses 73_'s precision authority rather than carrying its own. So the AUTHORITY count is honestly 0.
The sentence in 73_'s header should say CREATE and UPDATE rather than ONE, and a later round should correct
it before somebody reads it as licence to add a third writer.

`SKU_WORKSPACE_COLD_TIMEOUT_STILL_REPRODUCES = YES`, classified `S8_PERFORMANCE_DEBT` and not touched.

## Sec8 - IMPORT / BULK SURFACES

```
IMPORT_SURFACE_COUNT  13      every one routed, every one with EXACTLY ONE handler definition

NORMAL_OPERATION_IMPORT_COUNT   8   marketplace SKUs . FC regular forecast . FC special events .
                                    overseas snapshot . carrier rate cards . factory validate .
                                    factory commit . regional sync
INITIAL_MIGRATION_IMPORT_COUNT  1   seedSinotransCarrier
DATA_REPAIR_IMPORT_COUNT        3   auditFcSpecialEventIds . backfillFcSpecialEventIds .
                                    retireShipmentLabelColumns
TEMP_OR_OBSOLETE_IMPORT_COUNT   0
SCHEDULED (no surface, by design) 1 runAmazonSnapshotImports
```

Five are operator-unreachable on purpose - a scheduled job, a one-time seed, a column retirement and two FC
id repairs. They are not missing UI. Future permission capability is recorded per row for S9, which owns
enforcement; nothing is hidden or gated in this round.

| import | future capability |
|---|---|
| marketplace SKUs / FC forecast / FC events / overseas snapshot / carrier rates / factory import / regional sync | `IMPORT_BUSINESS_DATA` - OPERATIONS and above |
| seedSinotransCarrier | `IMPORT_INITIAL_MIGRATION` - ADMIN only |
| audit / backfill FC ids, retireShipmentLabelColumns | `DATA_REPAIR` - ADMIN only |
| runAmazonSnapshotImports | `SYSTEM_SCHEDULED` - no human caller |

## Sec9 - TEMP / MIGRATION CENSUS

```
TEMP_SCRIPT_COUNT  39
   7   assets/specs/active/apps-script/     IN THE DEPLOYABLE FOLDER
  30   assets/tools/apps-script-diagnostics/
   2   assets/tools/apps-script-migrations/
```

The split is the whole point. A TEMP file under `specs/active/apps-script` is in the folder whose contents go
into the live Apps Script project, so only those seven can break a deployment by being removed - and that has
happened once already, when `TEMP_request_order_send_diagnostics.gs` still owned a REQUIRED action and
removing it took Search, the Execution Plan hydrate and every save on the page with it.

Measured now, with comments AND string literals stripped so a mention cannot pass as a use:

```
permanent code CALLING a TEMP symbol          0
top-level name collisions with production     0        (one shared global scope - a collision would
                                                        silently replace the production function)
TEMP entry points NAMED in production error messages   3
```

| file | class | note |
|---|---|---|
| TEMP_request_order_send_diagnostics.gs | D safe to retire | its required handler moved to 66_; editor wrappers only now |
| TEMP_document_diagnostics.gs | C diagnostic keep | calls 39_; read-only |
| TEMP_draft_migration_diagnostic.gs | D safe to retire | self-contained, its R3 question is answered |
| TEMP_order_planning_draft_readback_diagnose.gs | D safe to retire | header says PURPOSE COMPLETE - REMOVABLE |
| TEMP_migrate_request_order_draft_v2.gs | B one-time migration | 4767 lines; named in 61_'s disabled-path message |
| TEMP_migrate_shipping_allocation_ai_lifecycle.gs | B one-time migration | named in 69_'s remediation message |
| TEMP_demo_shipping_shipment_map_seed_v2.gs | C diagnostic keep | visual demo seed; WRITES six tables |
| 30 x tools/apps-script-diagnostics | C diagnostic keep | paste-run-remove, never deployed |
| 2 x tools/apps-script-migrations | B one-time migration | paste-run-remove, never deployed |

```
REQUIRED_FOR_FINAL_DEPLOY  0    ONE_TIME_MIGRATION_NOT_YET_EXECUTED  4    DIAGNOSTIC_KEEP  32
SAFE_TO_RETIRE_AFTER_VALIDATION  3    UNKNOWN  0
```

Nothing is deleted in R1. Two items feed the release reconciliation: retiring the three safe files leaves
three production error messages pointing at functions that no longer exist, and
`TEMP_demo_shipping_shipment_map_seed_v2.gs` is a WRITER sitting in the deployable folder, which is a posture
worth an explicit operator decision before a production deployment rather than after one.

## Sec10 - API MIGRATION CONNECTIVITY

```
router actions  141      client action literals  61 (status enums and internal persistence verbs excluded)

MISSING_ROUTER_ACTION_COUNT        0
MISSING_ADAPTER_ACTION_COUNT       0
STALE_LEGACY_DIRECT_CALL_COUNT     0   - no page names google.script.run or an Apps Script URL; the one
                                       endpoint literal is in the adapter, where it belongs
API_DISCONNECTED_SUPPORTING_FLOW_COUNT  2   - Sec4 and Sec5
```

Both disconnects are at the LAST link, between a complete adapter and a page. Neither is a missing action or
a missing handler, which is why a route-level audit had not surfaced them.

## Sec11 - WRITE-OWNER UNIQUENESS, READ-MODEL TRUTH, CROSS-MAINLINE BOUNDARY

```
SUPPORTING_WRITE_FLOW_COUNT   25        SECOND_WRITE_OWNER_COUNT  0     UNKNOWN_WRITE_OWNER_COUNT  0
SUPPORTING_CROSS_MAINLINE_WRITE_COUNT   0      SUPPORTING_PHASE2_ORCHESTRATION_COUNT  0
```

A supporting write flow is counted as a routed action whose handler lives in a supporting owner module and
reaches a write primitive, directly or through a helper beside it; section L of the suite derives the 25 and
proves the detector both finds a known writer and declines a known read-only handler, because a count of
writers produced by a detector that never fires is not a count. Every routed handler in the whole tree is
defined in exactly one module.

Carrier support opens no ordering table. Pricing opens no execution table. Inventory opens no ordering table.
The document runtime opens no execution table of its own - what it does is ask 34_ to finalize the snapshot it
renders from, through that owner, which is a call into the authority rather than a bypass of it.

```
S7_FALSE_EMPTY_COUNT        0       S7_PERMANENT_LOADING_COUNT  0
S7_FALSE_SUCCESS_COUNT      1       S7_FALSE_FAILURE_COUNT      0
```

The one false success is a residue: `carrier-rate-card.js` ends its LEGACY branch with `.catch(_crcInit)`,
which is indistinguishable from success - the same shape S4-R6 removed from the canonical branch beside it and
did not remove here. It is reachable only when the scoped-read kill switch is set, so it is S8 read-contract
debt rather than an S7 slice.

**The method behind these four counts, stated so they are not read as stronger than they are.** They come
from reading source, not from driving pages in a browser. The eligibility predicate that gates the Carrier
page's demo banner is pure configuration (`isOperationDbApiConfigured() && mode !== 'mock'`) with no in-flight
window, so it cannot produce a false empty while a read is pending - that much is provable statically. A
page-driven pass belongs to the production testing that runs alongside S8.

Classified separately on purpose: the **Forecast Review** page is in the live navigation and synthesises its
entire series with `Math.random()`. It makes no backend call of any kind. That is not a false empty or a false
success in the Sec11 sense - it is a surface presenting fabricated figures as operational data, which is why
it is raised as a decision rather than folded into a count.

## Sec12 - S8 DEBT HANDOFF

```
OPEN_S8_DEBT  7

1  s2-r4b shipping-history / FC warm-race harness prints FAIL A3 and exits 0          carried
2  CURRENT_PRE_SCHEDULE has no explicit age bound                                     carried
3  factory available / receipt remaining client-side display derivation               carried
4  SKU Details / Regional Details workspace cold timeout                              carried
5  Factory Inventory / FC page speed validation after the coherent deploy             carried
6  carrier-rate-card legacy branch .catch(_crcInit) - fail-silent residue             NEW, read-contract
7  KM.loadState adopted by 12 of 25 pages; six that read a backend do not             NEW, read-contract
```

Nothing was added that is really missing Phase-1 business functionality. The three findings above are NOT on
this list, because they are S7 work.

## Sec13 - ROADMAP RECORDED, NOT IMPLEMENTED

**S9** Google Login . User Registry . Role . Capability . Data Scope . Admin UI . import permission
enforcement. Initial roles ADMIN / COO / OPERATIONS / FACTORY_USER. The per-import capability names Sec8
records are for this round to consume; nothing is enforced now.

**S10** Factory Order Number automation . Tcode requirement generation . Tcode procurement and matching .
Tcode inventory . one product unit = one Tcode where required . explicit Tcode opt-out.

**S11** Product Strategy completion . Competitor Analysis . Control Tower . cross-site sales monitoring.

No runtime code exists for any of these and none was written here.

## Sec14 - THE RELEASE CHECKPOINT THE OPERATOR MOVED

Recorded this round, acting on none of it:

```
POST_S7_NEXT_GATE = PHASE-1 CUMULATIVE RELEASE RECONCILIATION

S7 FINAL SEAL -> cumulative release reconciliation -> remote push / release preparation
              -> coherent backend + frontend production deployment -> targeted production smoke -> S8

S8 then runs as the MAINLINE while production testing of S5 / S6 / S7 runs in PARALLEL.
```

Every defect found during that parallel period is classified before it is scheduled, as
`BLOCKING_RUNTIME_DEFECT` / `FUNCTIONAL_DEFECT` / `PERFORMANCE_DEBT` / `UI_UX_DEBT` / `DATA_ISSUE` /
`RELEASE_DEPLOYMENT_ISSUE`, so production findings cannot silently widen S8's scope. The Sec9 census is built
to feed the reconciliation gate directly.

## Sec15 - DB / SCHEMA GATE

```
NEW_TABLE_REQUIRED  NO    NEW_COLUMNS_REQUIRED  NONE    DB_MIGRATION_REQUIRED  NO
DB_CHANGE_DECISION_REQUIRED  NO
```

Every supporting flow this round found incomplete is representable in the existing schema. The lead-time gap
is a missing WRITE PATH to a table that already exists with its full header; the carrier-name gap is a read
projection; the document panel is a surface over endpoints that already answer.

## Sec16 - THE SLICE PLAN

```
S7_IMPLEMENTATION_SLICE_COUNT   3 ready + 2 gated on an operator decision
```

**S7-R2a - SHIPMENT CARRIER NAME.** Phase-1 required because the Shipment surfaces are where carrier is read
most and they print an identifier. Owner 57_. Files `57_api_v1_shipment_workspace.gs`, and in the browser
either `shipping-history.js` or the removal of the dead `KM.display.carrierName`. DB impact none. Write risk
none - read projection only. Production test not required. Depends on nothing. ACCEPTANCE: the Shipment Draft
and Overview show the carrier name for a shipment whose carrier exists, show the id unchanged when it does
not, and no second name resolver exists in the tree.

**S7-R2b - DOCUMENT PANEL.** Phase-1 required because a generated document is currently unreachable after the
tab closes. Owner 39_ (unchanged). Files: the Shipment Draft surface plus the three adapter methods that
already exist. DB impact none. Write risk LOW - `document.retry` is the only write and 39_ already owns its
idempotency. Production test required (one shipment, one retry). Depends on S7-R2a only for sharing the same
page. ACCEPTANCE: a shipment lists its generated documents with status, a completed one reopens, a failed one
retries, and a retry that succeeds does not produce a second file.

**S7-R3 - CARRIER LEAD TIME MAINTENANCE.** Phase-1 required because a lane is not routable without it and the
only way to create one today is to edit the spreadsheet. Owner 17_. Files `17_carrier_handlers.gs`, `01_router.gs`,
`63_api_v1_system_health.gs` (action contract), the adapter and `carrier-rate-card.js`. DB impact none - the
table and its header exist. Write risk MEDIUM: a new write path to a table two read surfaces already join.
Production test required. Depends on nothing. ACCEPTANCE: a lead time can be created and edited from the
Carrier Rate Card page through ONE routed action with ONE owner; the rate-card import still refuses lead-time
columns; `handleSeedSinotransCarrier_` is not the writer; and the Execution Plan method registry sees the new
row without a second derivation path.

**Gated on Sec17 D1 - FORECAST REVIEW DISPOSITION.** Wire to live data, or withdraw from the navigation.
**Gated on Sec17 D2 - PURCHASE ORDER DOCUMENT SURFACE.** Phase 1, or POST_S7.

## Sec17 - DECISIONS REQUIRED

```
S7_DECISION_REQUIRED_COUNT  3
```

**D1 - Forecast Review.** It sits in the live sidebar under Forecast Overview and generates every number it
shows with `Math.random()`. An operator cannot tell that from looking at it. Three options: wire it to the FC
owners, withdraw the navigation entry until it is wired, or label it explicitly as a prototype. This is not a
repair an agent should choose - it decides whether a page an operator may already be using is real.

**D2 - Purchase Order documents.** 39_ serves `purchase_order` documents and no PO surface offers any document
control. Phase-1 required, or POST_S7?

**D3 - the seven TEMP files in the deployable folder.** None is required by production code. Three are safe to
retire, and retiring them leaves three production error messages naming functions that no longer exist. One
(`TEMP_demo_shipping_shipment_map_seed_v2.gs`) is a WRITER of six business tables sitting in the folder that
gets copied into the live project. Decide before the cumulative release reconciliation, not during it.

## Sec18 - THE SEAL

```
S7_CONTRACT_AUDIT_COMPLETE   YES
OPEN_S7_BLOCKERS             none - the three findings are scheduled work, not blockers
S7_DECISION_REQUIRED_COUNT   3
S5_SEAL_HELD                 YES          S6_FINAL_SEAL_HELD   YES
RUNTIME_FILES_CHANGED        0            RELEASE_CUT          none
PRODUCTION_ROWS_WRITTEN      0            PRODUCTION_WRITE_AUTHORIZED  NO

NEXT_TASK = S7-R2 - OPERATOR DECISION FREEZE
```

> **[ANSWERED BY S7-R2 - see PART II.** All three decisions are frozen. One correction PART II makes to
> PART I is recorded in Sec25: Sec9's claim that retiring the three SAFE-TO-RETIRE TEMP files would strand
> three production error messages conflated two sets, and is wrong.]**

---

# PART II - S7-R2: OPERATOR DECISION FREEZE + SUPPORTING EXECUTION FREEZE

```
PRE_SHA  03f56b9        POST_SHA  (this commit)      branch  feature/product-strategy-board-p0
MODE     decision freeze / contract only             RUNTIME FILES CHANGED  0
ENTERED UNDER  S5_SEAL_HELD = YES . S6_FINAL_SEAL = YES . S7_CONTRACT_AUDIT_COMPLETE = YES
               OPEN_S7_BLOCKERS = none
```

`origin/main` advanced independently to `1a0ca13`, a branding-only commit adding
`assets/img/logo_only_red.png`. This branch carries the identical blob `6f547ec4` through
UI-BRAND-FAVICON-R1. It is NOT S5/S6/S7 runtime drift and is not treated as any.

## Sec19 - THE THREE DECISIONS, AS FROZEN

### D-S7-1 FORECAST REVIEW = **DEFERRED_UNCHANGED**

```
FORECAST_REVIEW_CHANGED_IN_S7           NO
FORECAST_REVIEW_PRODUCTION_NAV_CHANGED  NO
FORECAST_REVIEW_SOURCE_DELETED          NO
SECOND_FORECAST_AUTHORITY_CREATED       NO
FORECAST_REVIEW_S7_SCOPE                NONE - the page is out of S7 scope entirely
```

This decision was revised in flight. The first instruction was to hide the page from production
navigation; the operator then froze it UNCHANGED. The later instruction governs, and S7 now may not hide,
delete, relabel, re-wire, re-route or restyle it.

The audit finding stands and is recorded rather than acted on: **the Forecast Review page is not backed by
canonical production forecast data** - it issues no backend read of any kind and synthesises its series with
`Math.random()`. That is known and intentionally deferred. It is NOT reopened by any S7 implementation round.

The S7-R4 slice that PART I Sec16 gated on this decision is therefore **withdrawn**, and S7-R4 becomes the
TEMP deployment-surface cleanup alone.

### D-S7-2 PURCHASE ORDER DOCUMENT PANEL = **PHASE1_REQUIRED**

```
PO_DOCUMENT_PANEL_PHASE1_REQUIRED          YES
SECOND_DOCUMENT_ENGINE_CREATED             NO
DOCUMENT_PANEL_READ_OWNER                  39_ document.list / document.get / document.retry
DOCUMENT_PANEL_SECOND_READ_AUTHORITY_COUNT   0
DOCUMENT_PANEL_SECOND_WRITE_AUTHORITY_COUNT  0
```

The missing capability is operator RETRIEVAL after generation, not generation. The panel is a read and
recovery projection over the engine that already exists, and all three read actions resolve to one owner
(39_), with generation keeping its own existing owner (36_). A future round may not build a second document
index, scan Drive independently while the canonical list answers, or invent a new status model.

### D-S7-3 TEMP DEPLOYABLE POLICY = **REMOVE_NON_RUNTIME_TEMP_FROM_PRODUCTION_DEPLOY_SURFACE**

```
DEPLOYABLE_TEMP_COUNT_PRE                        7
PRODUCTION_REQUIRED_TEMP_COUNT                   0
FINAL_DEPLOY_TEMP_TARGET_COUNT                   0
NON_RUNTIME_TEMP_IN_FINAL_PRODUCTION_DEPLOY_SET  0
DEAD_TEMP_REFERENCE_ALLOWED                      NO
```

Repository retention and deployment surface are different questions, and this decision only moves the second.
Nothing is deleted in R2.

| file | class | prod runtime dep | deploy disposition | must reconcile first |
|---|---|---|---|---|
| TEMP_demo_shipping_shipment_map_seed_v2.gs | C diagnostic / demo seed | none | **REMOVE — safety** | nothing |
| TEMP_migrate_request_order_draft_v2.gs | B one-time migration | none | REMOVE, retain in repo | nothing (see Sec25) |
| TEMP_migrate_shipping_allocation_ai_lifecycle.gs | B one-time migration | none | REMOVE, retain in repo | nothing (see Sec25) |
| TEMP_document_diagnostics.gs | C diagnostic | none (it CALLS 39_) | REMOVE, retain in repo | nothing |
| TEMP_request_order_send_diagnostics.gs | D safe to retire | none | REMOVE | nothing |
| TEMP_draft_migration_diagnostic.gs | D safe to retire | none | REMOVE | nothing |
| TEMP_order_planning_draft_readback_diagnose.gs | D safe to retire | none | REMOVE | nothing |

`PRODUCTION_REQUIRED_TEMP_COUNT = 0` is measured, not assumed: no permanent file calls any TEMP top-level
symbol once comments AND string literals are stripped, and no TEMP file shadows a production name in the one
shared global scope. So the target of zero is reachable without proving an exception for anything.

**The named safety case holds.** `TEMP_demo_shipping_shipment_map_seed_v2.gs` really is a writer: it carries
`DEMO4A_WRITE_ORDER_`, an `appendRow` insert path and a `deleteRow` rollback, over six business tables -
`shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_routes`, `shipment_events`.
It is not required by production runtime and must not sit in the deployed project. It is not executed.

## Sec20 - THE THREE READY SLICES, RECONFIRMED FROM LIVE CODE

```
S7_READY_SLICE_COUNT  3

S7-R2A  Shipment / Shipment Overview carrier display resolution
S7-R2B  Document Panel - generated-document rediscovery
S7-R3   Carrier lead-time maintenance
```

## Sec21 - CARRIER NAME SLICE FREEZE

```
CARRIER_ID_REMAINS_CANONICAL      YES
CARRIER_NAME_DISPLAY_IS_DERIVED   YES
CARRIER_NAME_PERSISTENCE_REQUIRED NO
```

Measured rather than asserted: neither 12_ nor 11_ writes `carrier_name` anywhere, so nothing persists it
today and the slice must not start. 40_ already derives `carrier: { id, name }` at read time against the
`carriers` master - that is the existing canonical read path, and it is the shape R2A copies rather than
reinvents. No second carrier registry.

## Sec22 - DOCUMENT PANEL SLICE FREEZE

Frozen as stated in Sec19. The panel is a projection; generation stays where it is. Document families are
limited to what 39_ already serves - `shipment` and `purchase_order` - and the slice does not add one.

## Sec23 - CARRIER LEAD-TIME FREEZE, AND THE LIVE SCHEMA AUDIT IT REQUIRED

```
CARRIER_RATE_AND_LEADTIME_AUTHORITY_MERGED   NO
CARRIER_LEADTIME_MAINTENANCE_PHASE1_REQUIRED YES
NEW_TABLE_REQUIRED  NO    NEW_COLUMNS_REQUIRED  NONE
```

The live header, read from its owner (17_) rather than from a document:

```
lead_time_id . carrier_id . origin_country . destination_country . shipping_method .
last_mile_delivery . min_days . max_days . avg_days . created_at . updated_at
```

It can represent the whole contract: lane scope, method, the lead-time fields and the identity. **There is no
`status` or `is_active` column**, so the brief's "status/active semantics IF ALREADY PRESENT" resolves to
absent - the slice inherits none and must invent none. No new table and no new column.

**One constraint the audit found, and it decides what the maintenance path must refuse.** `KMRA.leadDays`
resolves a lead time on `methodKey + origin_country + destination_country + last_mile_delivery`, with a blank
axis acting as a wildcard - and then takes the **first matching row**. It does not join on `carrier_id` at
all, so a lead time behaves as a property of a LANE rather than of a carrier, despite carrying one. Two rows
on one lane tuple are therefore resolved silently to whichever comes first.

That is the same first-row pick S6-R8A spent a round freezing out of dispatch, and the sibling resolver in
the same file (`resolveWarehouse`) blocks on ambiguity rather than picking. So:

- S7-R3 must **refuse a duplicate lane tuple at the WRITE path**, because this read will not; and
- S7-R3 must **not change `leadDays`** - altering planner resolution is a separate, operator-visible decision
  and is not inside a maintenance slice.

A maintenance UI must also not imply that choosing a carrier narrows the lane, because resolution ignores it.
Pre-existing duplicates in production data, if any, remain first-row-picked; that is a production-data
question for the parallel S8 testing period, not a Phase-1 blocker.

Lead time and rate card remain distinct business authorities. Lead-time fields are NOT merged into
`carrier_rate_cards` for UI convenience - the rate-card import refuses them by name today, and that refusal
stays.

## Sec24 - FORECAST REVIEW

No S7 scope. See Sec19. The finding is recorded; the page is untouched.

## Sec25 - A CORRECTION TO PART I

PART I Sec9 said that retiring the three safe-to-retire TEMP files would leave three production error
messages naming functions that no longer exist. **That conflated two sets and is wrong.** Every symbol named
in production guidance belongs to a ONE-TIME MIGRATION file:

| symbol named in production text | home file | named by |
|---|---|---|
| TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY | TEMP_migrate_request_order_draft_v2.gs | 61_ |
| TEMP_AI_LIFECYCLE_MIGRATE_DRY_RUN | TEMP_migrate_shipping_allocation_ai_lifecycle.gs | 69_ |
| TEMP_AI_LIFECYCLE_MIGRATE_COMMIT | TEMP_migrate_shipping_allocation_ai_lifecycle.gs | 69_ |
| TEMP_AI_LIFECYCLE_SCHEMA_VALIDATE | TEMP_migrate_shipping_allocation_ai_lifecycle.gs | 69_ |

None of the three safe-to-retire files is named anywhere, so removing them strands nothing.

And the rule bites on RETIREMENT, not on the deploy surface. Those messages instruct an operator to PASTE AND
RUN a tool, which already presumes the tool is not deployed - so removing all seven from the production
deploy surface, with the repository copies retained, breaks no message at all. **This makes S7-R4 materially
cheaper than PART I implied**: it is a deployment-set decision, not a text-reconciliation exercise.

`DEAD_TEMP_REFERENCE_ALLOWED = NO` still stands for any future RETIREMENT: a TEMP helper may not be deleted
from the repository while production-facing guidance still tells an operator to invoke it. Those messages must
first be moved to a valid recovery path or a truthful escalation instruction.

## Sec26 - IMPORT / PERMISSION BOUNDARY

```
S9_PERMISSION_WORK_IMPLEMENTED_IN_S7  NO
```

S9 owns visibility and authorization for Import and admin-grade tools. S7 may classify and clean unsafe
deployment artifacts and may NOT build Google Login, a user registry, role checks, capability checks or
data-scope access control. The per-import capability names recorded in PART I Sec8 are input for S9, not a
design S7 implements.

## Sec27 - S8 DEBT, CARRIED UNCHANGED

```
OPEN_S8_DEBT_COUNT  7

1  s2-r4b shipping-history / FC warm-race harness prints FAIL A3 but exits 0
2  CURRENT_PRE_SCHEDULE has no explicit maximum age
3  Factory available / receipt remaining read-contract consolidation
4  SKU Details cold timeout
5  SKU Regional Details cold timeout / workspace performance
6  carrier-rate-card legacy .catch(_crcInit) fail-silent residue
7  KM.loadState incomplete adoption across backend-reading pages
```

Not fixed in R2. Item 5 is PART I's single SKU-workspace entry split into its two surfaces, as the brief
lists them; the count is 7 either way.

## Sec28 - LATER ROADMAP, RECORDED

**S9** Google Login . user mapping . role / capability / data scope . Admin UI . import permission
enforcement. Initial roles ADMIN / COO / OPERATIONS / FACTORY_USER.

**S10** Factory Order Number automation . Tcode requirement generation . Tcode ordering and matching . Tcode
inventory . 1 pcs = 1 Tcode where required . explicit Tcode opt-out.

**S11** Product Strategy completion . Competitor Analysis . Control Tower . cross-site sales monitoring.

**The AI source-allocation rule is preserved unchanged** from S6-R8A PART X Sec69: full-carton allocatable
from source A first, remaining demand to B, continuing in canonical source priority, with any shortage shown
truthfully as 「庫存不足 XXX」. A manual quantity above normal allocatable requires an explicit
Operation-coordination acknowledgement and is never automatic AI borrowing. Dispatch remains
DECLARED_SOURCE_ONLY regardless.

No S9 / S10 / S11 runtime exists in S7.

## Sec29 - S7 EXECUTION ORDER

```
S7-R2A   Shipment carrier name read-model completion
S7-R2B   Document Panel - generated-document rediscovery
S7-R3    Carrier lead-time maintenance
S7-R4    Production-surface safety cleanup - TEMP / migration deployment surface
         (the Forecast Review half is WITHDRAWN by D-S7-1)
S7-R5    Supporting-mainline final integration + closing seal
```

The order is not immutable if an implementation round proves a real dependency - but **no implementation
round may silently absorb another slice.** A round that finds it needs a neighbour's work stops and says so.

## Sec30 - POST-S7 RELEASE CHECKPOINT, FROZEN

```
POST_S7_NEXT_GATE = PHASE-1 CUMULATIVE RELEASE RECONCILIATION

S7 FINAL SEAL
  -> PHASE-1 CUMULATIVE RELEASE RECONCILIATION
  -> reconcile the latest origin/main branding commit
  -> determine the exact backend sync set
  -> determine the exact frontend deploy set
  -> generated bundle / hash reconciliation
  -> TEMP deployment disposition            (D-S7-3 feeds this directly)
  -> global application cache-token rotation
  -> remote push / merge preparation
  -> coherent production deployment
  -> targeted production smoke
  -> S8 begins, with production acceptance running in parallel
```

S8 does NOT follow S7 directly. None of these actions is performed in S7-R2.

One item already waiting at that gate, from UI-BRAND-FAVICON-R1: `km-repo-asset-manifest.js` changed its
bytes without changing its cache token, so a returning browser serves the cached older manifest until the
global rotation. Rotating it early was forbidden and correctly so; the rotation step above is what clears it.

## Sec31 - THE FREEZE

```
S7_DECISION_FREEZE_COMPLETE  YES
OPEN_S7_BLOCKERS             none
RUNTIME_FILES_CHANGED        0        RELEASE_CUT  none
NEW_TABLE_REQUIRED  NO   NEW_COLUMNS_REQUIRED  NONE   DB_MIGRATION_REQUIRED  NO
PRODUCTION_ROWS_WRITTEN      0        PRODUCTION_WRITE_AUTHORIZED  NO

NEXT_TASK = S7-R2A - SHIPMENT CARRIER NAME READ-MODEL COMPLETION
```

---

# PART III - S7-R2A: SHIPMENT CARRIER NAME READ-MODEL COMPLETION

```
PRE_SHA  5d4f53a        POST_SHA  (this commit)      branch  feature/product-strategy-board-p0
BACKEND_RELEASE  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R38
```

## Sec32 - WHAT WAS WRONG AND WHAT IS NOW TRUE

`carrier_id` is the identity and `carrier_name` is deliberately never stored beside it, so any surface that
wants to SHOW a carrier must resolve the id against the `carriers` master. 40_ loaded that master. 57_ - the
read behind Shipment Draft, the Confirm summary and the On-the-Way Map - did not, and the browser resolver
built for exactly this gap asked `KM.DB.getOperationDb`, a member the API migration removed and nothing ever
reassigned. Its `typeof` guard was permanently false, so it returned the empty string for every carrier that
has ever existed. No page called it, which is the only reason that stayed invisible.

```
CURRENT_CARRIER_NAME_RESOLVER   KM.display.carrierName
CURRENT_RESOLVER_DATA_OWNER     KM.DB.getOperationDb - ASSIGNED NOWHERE
CURRENT_RESOLVER_REACHABLE      NO

CARRIER_MASTER_TABLE    carriers        CARRIER_MASTER_READ_OWNER  57_ (base table) . 40_ (already)
CARRIER_ID_FIELD        carrier_id      CARRIER_NAME_FIELD         carrier_name
TARGET_READMODEL_OWNER  57_api_v1_shipment_workspace.gs
TARGET_SURFACES         Shipment Draft . Confirm summary . On-the-Way Map (card, drawer, filter)
```

57_ now declares `carriers` a BASE table with the same `requiredCols: ['carrier_id']` 40_ uses, and returns
the rows raw, so the browser normalizes them with the same `normalizeCarrierRecord` the broad path runs. No
new request exists anywhere: the master rides the slice these surfaces were already reading.

## Sec33 - THE RESOLVER IS PURE, AND THAT IS THE DESIGN DECISION

```
CARRIER_DISPLAY_RESOLVER_OWNER  KM.display.carrierDisplay  (carrierName is its projection)
CARRIER_DISPLAY_RESOLVER_COUNT  1
```

The caller hands the resolver the master its own read model holds. A resolver with a private cache can answer
from one page's stale data on another page, and can answer AT ALL when nothing has been read - the two
failures §12 forbids. Passing the data in makes *nothing was read* a distinguishable argument rather than an
indistinguishable empty result. Four states, and none of them interchangeable:

| state | when | what the operator sees |
|---|---|---|
| `NONE` | the row carries no carrier id | the existing blank convention |
| `UNREAD` | master is null/undefined | **the id**, never a claim that the carrier is missing |
| `UNKNOWN` | id present, no master row (or a row with a blank name) | **the id**, marked unresolved |
| `RESOLVED` | master row found with a name | the name |

`CARRIER_NAME_MISSING_BEHAVIOR` = show the carrier_id and say which unresolved state it is in - *carrier list
not loaded* versus *not in the carrier master*. Identity is never hidden and an unknown carrier is never
turned into "No carrier". An `[]` master is UNKNOWN (a lookup that genuinely failed); a `null` master is
UNREAD. The adapter preserves that distinction deliberately: a workspace answer from a deployment that
predates this release has no `carriers` key at all, and collapsing that to `[]` would turn a half-synced
backend into a confident claim that every carrier is unknown.

## Sec34 - WHAT EACH SURFACE DOES NOW

- **Shipment Draft** - the read-only carrier field shows the name with the id beneath it. Read-only because
  the carrier is chosen on the plan; showing the name ALONE would hide the value every join and every support
  conversation is about.
- **Confirm summary** - name and id together. It is the last screen before stock moves, so it does not choose
  between them.
- **On-the-Way Map** - the card and the drawer show the name; the drawer keeps the id beside it. **The Carrier
  filter still matches on `carrier_id`** - only its labels changed - because a filter that matched display
  text would break the moment two carriers shared a name.

```
DRAFT_CARRIER_WRITE_FIELD   carrier_id      DRAFT_CARRIER_NAME_WRITE_COUNT  0
OVERVIEW_RAW_ID_ONLY_WHEN_NAME_AVAILABLE_COUNT  0
CARRIER_SELECTION_CHANGED  NO   RATE_SELECTION_CHANGED  NO   SHIPMENT_WRITE_PAYLOAD_CHANGED  NO
SECOND_CARRIER_MASTER_CREATED  NO   SECOND_CARRIER_RATE_AUTHORITY_COUNT  0
PER_SHIPMENT_CARRIER_REQUEST_COUNT  0   DUPLICATE_CARRIER_FETCH_COUNT  0
LEGACY_WHOLE_DB_GETTER_REINTRODUCED  NO   STALE_LEGACY_DIRECT_CALL_COUNT_POST  0
CARRIER_FALSE_EMPTY_COUNT  0  CARRIER_ID_NAME_MISMATCH_COUNT  0  LAST_GOOD_CARRIER_MAP_LOSS_COUNT  0
```

The map's bounded single-shipment refresh never assigns `carriers`, so the held master survives it by
construction rather than by somebody remembering to copy it - which is what the last-good assertion pins.

## Sec35 - TWO FINDINGS THIS ROUND WITHDRAWS

### 1. The Document Panels exist. PART I Sec5 is wrong.

`shDocumentPanelHtml` is defined in `shipping-history.js`, exported on `window`, and called by BOTH that page
and `purchase-order-overview.js`. Each feeds it from its own workspace's `documents` include - 57_ for
shipments, 50_ for purchase orders - and retry is wired through `db.retryDocumentGeneration`. One renderer,
two surfaces, both live.

PART I searched for `KM.DB.listEntityDocuments` call sites, found none, and concluded the capability had no
surface. The search result was correct; the conclusion did not follow. **"This adapter method has no caller"
and "this capability has no surface" are different claims, and only the first was tested.** The panels get
their list from the workspace projection, which is the better design - one read rather than two - and
`document.list` / `document.get` remain genuinely uncalled, which is a different and much smaller fact.

**This changes S7-R2B.** D-S7-2 froze a PO Document Panel as Phase-1 required on the premise that none
existed. One does. R2B should begin by establishing what the existing panel does NOT do - if anything -
rather than by building it. That is an operator decision and this round does not take it.

### 2. The Weekly Shipping Plan also shows a raw carrier id.

PART I Sec4 said 40_ serves `carrier { id, name }` so the Weekly surface "can print a carrier". It serves it;
the page throws it away. `shipping-plan.js` reads `carrierId: (p.carrier && p.carrier.id)` and renders
`_spEsc(plan.carrierId)`.

**Left unchanged, deliberately.** §3 of this round names four surfaces and Weekly is not among them, §20
forbids broadening, and §15.H asks that Weekly be left alone - the reason given for that is false, but the
instruction is not. The fix is one line against data the page already receives. It is recorded here as the
smallest outstanding carrier-name gap, for the operator to schedule.

## Sec36 - RELEASE

```
BACKEND_RELEASE  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R38
APPS_SCRIPT_SYNC_REQUIRED  YES     APPS_SCRIPT_SYNC_SET  57_ . 63_
FRONTEND_DEPLOY_REQUIRED   YES     FRONTEND_DEPLOY_SET   operation-system-db-api.js .
                                   shipping-history.js . global-logistics-map.js . app.js
TOKEN_ROTATION_REQUIRED_AT_FINAL_DEPLOY  YES
```

**THE EIGHTEENTH SWAP.** 22_ leaves ownership at R38 and keeps the R37 it earned one release ago; 63_ is the
only stamped owner. 57_ is the file this round actually changed and it carries no stamp at all - 63_'s
manifest proves it by probing the CALLER's symbol, as it already does for 16_ and 31_ - so it becomes a
FOURTH kind of ledger member, `STAMPLESS_OWNERS`: copied, and stamped by nobody. S5-R4 set that precedent for
the generated bundle with the same argument, that putting such a file in `RELEASE_OWNERS` fixes the copy
check and breaks the stamp check. Minting a stamp for 57_ to satisfy a ledger would have overturned a
standing design decision from inside a round about a read projection.

No router action was added or removed, so the action-contract version does **not** move. 90_ is not rebuilt.

**TEXTURE-3-R11** rotates exactly one map file. `global-logistics-map.js` changed and carries the R11 marker;
`km-globe.js` and the stylesheet did not and keep the tokens they have, which is what the derived map rules
check in both directions.

**DEPLOY ORDER: 57_ BEFORE the frontend.** With an older 57_ deployed, the workspace answer has no `carriers`
key, the adapter reads that as UNREAD and every surface shows the id - the behaviour this release set out to
fix, failing quietly rather than loudly. Nothing breaks; nothing improves either.

```
NEW_TABLE_REQUIRED  NO   NEW_COLUMNS_REQUIRED  NONE   DB_MIGRATION_REQUIRED  NO   BACKFILL_REQUIRED  NO
PRODUCTION_ROWS_WRITTEN  0
S7_R2A_CARRIER_NAME_SEAL  YES      OPEN_S7_BLOCKERS  none
NEXT_TASK = S7-R2B - PURCHASE ORDER DOCUMENT PANEL (re-scope against Sec35 first)
```

---

# PART IV - S7-R2B: EXISTING DOCUMENT PANEL COMPLETENESS + GENERATED-DOCUMENT REDISCOVERY

PRE_SHA 8907f87. Verification-first round. Every count below is derived by
`assets/tests/s7-r2b-document-panel-audit.test.js`, which RUNS the shipped panel renderer and the shipped
39_ interpretation owners rather than pattern-matching them.

## Sec37 - THE PREMISE, CORRECTED AND RE-CONFIRMED

S7-R1 Sec5 concluded the Document Panels did not exist. PART III Sec35 withdrew that. This round confirms
the withdrawal from the tree: ONE renderer (`shDocumentPanelHtml`, shipping-history.js), TWO surfaces
(Shipment pages, Purchase Order Overview), ONE engine (39_), THREE router actions. Nothing here was built;
it was audited.

| Role | Owner | Responsibility |
|---|---|---|
| DOCUMENT_ENGINE_OWNER | `39_document_runtime_service.gs` | generation, retry planning, state interpretation |
| DOCUMENT_LIST_OWNER | `39_` `handleEntityDocumentList_` | read `generated_documents` for one entity |
| DOCUMENT_GET_OWNER | `39_` `handleGeneratedDocumentGet_` | one document by `document_id` |
| DOCUMENT_RETRY_OWNER | `39_` `handleDocumentRetry_` | regenerate the missing/failed classes of one entity |
| DOCUMENT_PANEL_RENDER_OWNER | `shipping-history.js` `shDocumentPanelHtml` | the one shared renderer |
| PO_DOCUMENT_PANEL_CALLER | `purchase-order-overview.js` `renderPoDocumentsBlock` | `entity_type: purchase_order` |
| SHIPMENT_DOCUMENT_PANEL_CALLER | `shipping-history.js` card renderer | `entity_type: shipment` |

`DOCUMENT_ENGINE_OWNER_COUNT = 1` - `DOCUMENT_PANEL_RENDER_OWNER_COUNT = 1` - `DOCUMENT_PANEL_SURFACE_COUNT = 2`

The surfaces are NOT the same feature set, and that is not a PO gap: the Shipment page additionally carries
a Generate widget (`_shDocActionsHtml` / `shGenerateShipmentDoc`) with its own in-memory result cache for
its immediate Download link. That cache is a second PRESENTATION path, not a second read authority - the
panel never reads it, and rediscovery never depends on it.

## Sec38 - WHAT IS COMPLETE

**Rediscovery, both surfaces.** Each workspace declares `generated_documents` as a bounded, include-gated
table and projects it through the ONE canonical DTO owner; each page asks for `include: { documents: true }`
on its main read, and the PO bounded post-write readback asks for it too, so a write never blanks the panel.
The renderer is pure: equal input gives equal output, so re-entry cannot drift. A document generated, left
behind and returned to is found again from canonical read data alone.

**Entity scope.** Both groupers drop every row whose `related_entity_type` is not theirs, and the direct
`document.list` path refuses any type other than `shipment` / `purchase_order`. `DOCUMENT_ENTITY_SCOPE_DRIFT_COUNT = 0`.

**Status truth.** A `generated` row with no `file_id` is GENERATING, not READY. One document of five
expected is PARTIAL, not READY. A superseded attempt is filtered out of the live list, so one logical
document shows one row. `DOCUMENT_FALSE_SUCCESS_COUNT = 0`, `DOCUMENT_FALSE_FAILURE_COUNT = 0`,
`RETRY_CREATES_SECOND_LOGICAL_DOCUMENT_COUNT = 0`.

**Budget and write truth.** The renderer is a pure string builder that reaches no adapter and no transport,
so `PER_DOCUMENT_RENDER_REQUEST_COUNT = 0` and `DOCUMENT_PANEL_MOUNT_WRITE_COUNT = 0` are structural rather
than counted. The list rides each page's existing workspace read: no separate document request exists to
duplicate. Retry is the single write, from a click, behind a disable guard.

**Open.** The list payload already carries `file_url` / `download_url`, so `document.get` is not required and
is not forced. `KM.DB.getGeneratedDocument` exists and has no caller - a capability without a current need,
which is exactly the distinction S7-R1 Sec5 got wrong about this subsystem.

## Sec39 - FINDING 1 (BLOCKING, both surfaces): the Retry arguments are transposed

`shRetryDocument(entityType, entityId, btnEl)` is invoked by the panel as
`shRetryDocument(entityId, generated_document_id, this)`.

So `document.retry` receives `related_entity_type` = an entity ID and `related_entity_id` = a DOCUMENT id.
The backend lowercases the type, compares it against `'purchase_order'`, never matches, and runs the
SHIPMENT generator against an id that is not a shipment. **Retry cannot work on either surface, and a PO
retry could not reach the PO generator even with the right id.**

The root cause is one parameter: `_shDocRowHtml(d, canRetry, entityId)` is never given the entity TYPE, so
the button had nothing else to pass. The DTO carries `related_entity_type` on every row, so the row can
always name its own entity once asked.

## Sec40 - FINDING 2 (FUNCTIONAL, PO only): the post-retry refresh re-reads the wrong surface

On success the handler calls `_shLoadAndRender()` unconditionally - the Shipment page's re-read. From the PO
panel that issues a shipment workspace request and leaves the panel the operator is looking at untouched: a
retry that landed looks like one that did nothing. The panel is shared, so the refresh has to be too.

## Sec41 - FINDING 3 (MINOR): two panel state inputs have no producer

`shDocPanelState` honours `checking` (UNREAD) and `pending`, and no caller ever supplies either; `pending`
is read from `documentsPending`, which no adapter or backend produces. The four-state distinction
UNREAD / READY_EMPTY / READY_WITH_DOCUMENTS / READ_FAILED is therefore only partly implemented.

`DOCUMENT_FALSE_EMPTY_COUNT = 0` all the same, and the reason matters: both pages render cards only AFTER
their canonical read resolves, so the panel is never asked to describe an unread model. READ_FAILED is owned
one level up and identically on both pages - the read model is nulled and a typed banner with Retry replaces
the list. That is an S4-R7 fail-closed decision, not a document behaviour, and this round did not touch it.

## Sec42 - FINDING 4 (BLOCKER): the boot-payload floor has 58 bytes of headroom

**This is why Findings 1 and 2 are not repaired in this round.**

`s4-r5` A1d1 requires the boot payload to stay 1.5 MB below the S4-R1 baseline. At `8907f87` the measured
margin is **58 bytes**. Both Document Panel owners - `shipping-history.js` and `purchase-order-overview.js` -
are boot-loaded `<script defer>` tags, so every byte of any edit to them is spent against that floor. The
smallest correct repair of both findings measures 2,246 bytes; stripped of every comment it is still roughly
1.1 KB over. **No bug fix of any size fits in a boot-loaded file at this margin.**

S4-R6 already replaced an exact-byte assertion here for precisely this reason - the file records that it
"FAILED THE FIRST TIME ANYBODY FIXED A BUG" - and stated the replacement's intent in as many words: "a bug
fix changes neither" the script set nor the ceiling. That promise no longer holds. The same failure mode has
returned one generation later, because the achievement being floored (1,536,058 bytes removed) now sits 58
bytes above the floor itself (1,536,000).

Note that A1d already pins the boot script SET by name and A2 already asserts that no route script has been
appended at boot. Those two carry the claim the round was written to protect; A1d1's byte floor was intended
as a ceiling only a crept-back route script could blow.

**OPERATOR DECISION REQUIRED. Two options, and this round does not choose between them:**

1. **Re-encode A1d1 so it measures what it means.** The achievement is that Inventory Replenishment (947 KB)
   and the globe (809 KB) are not at boot, which A1d/A2 already pin by name. A floor measured against total
   boot bytes caps ordinary maintenance of every boot-loaded page as a side effect.
2. **Move `shipping-history.js` and `purchase-order-overview.js` off the boot path.** They are route scripts;
   this is what the gate actually wants, and it would restore real headroom rather than redefine it. It is
   app-loading surgery and belongs to S8, not to a document round.

Either way, the repair itself is small and fully specified by Sec39/Sec40, and the audit suite is written so
that it FAILS the moment the defects are corrected - the repair round inherits a tree it must change, not a
green one.

## Sec43 - CORRECTION TO THE S7-R2A1 REPORT

That report stated the boot budget had "1,904 bytes of headroom" after the round. The measured figure is
**58 bytes**; the 1,904 came from an arithmetic slip comparing a CRLF working file against an LF-normalised
git blob. The R2A1 change itself was and remains under the floor - only the stated margin was wrong.

## Sec44 - ROUND OUTCOME

```
DOCUMENT_PANEL_EXISTS  YES          DOCUMENT_PANEL_SURFACE_COUNT  2
PO_DOCUMENT_PANEL_EXISTED_PRE  YES  SHIPMENT_DOCUMENT_PANEL_EXISTED_PRE  YES
PO_DOCUMENT_REDISCOVERY_SUPPORTED  YES   SHIPMENT_DOCUMENT_REDISCOVERY_SUPPORTED  YES
PO_DOCUMENT_RETRY_SUPPORTED  NO     SHIPMENT_DOCUMENT_RETRY_SUPPORTED  NO     (Finding 1)
PO_DOCUMENT_PANEL_PHASE1_COMPLETE_PRE  NO   POST  NO   (repair blocked by Finding 4)
SHIPMENT_DOCUMENT_PANEL_PHASE1_COMPLETE_PRE  NO   POST  NO
NEW_DOCUMENT_TYPE_COUNT  0          PRODUCTION_ROWS_WRITTEN  0
BACKEND_RELEASE  unchanged          APPS_SCRIPT_SYNC_REQUIRED  NO
FRONTEND_DEPLOY_REQUIRED  NO        (no runtime file changed)
S7_R2B_DOCUMENT_PANEL_SEAL  NO      OPEN_S7_BLOCKERS  boot-payload floor (Sec42)
```

---

# PART V - S7-R2B1: BOOT-PAYLOAD GATE CORRECTION + DOCUMENT RETRY REPAIR

PRE_SHA b64f6a2. `D_S7_BOOT_PAYLOAD_GATE = REENCODE_TO_BOOT_TOPOLOGY_INVARIANT`.

## Sec45 - WHAT A1d1 WAS DEFENDING, AND WHAT IT HAD BECOME

`A1D1_ORIGINAL_INTENT` - that the two large route payloads S4-R5 moved off the boot path (Inventory
Replenishment 947 KB, the globe family 809 KB) do not come back. S4-R6 had already replaced an exact-byte
assertion here because it "FAILED THE FIRST TIME ANYBODY FIXED A BUG", and wrote that the replacement meant
"a script that crept back would change the set and blow the ceiling; a bug fix changes neither".

Inspecting the executable assertions rather than the comments found two things.

**The floor was a budget, not an invariant.** An aggregate historical total shrinks every time anyone
maintains an approved boot owner, and runs out at a moment nobody chose. By S7-R2B it had 58 bytes left and
a two-line repair to a blocking defect could not land. It had stopped defending the architecture and was
defending its own arithmetic.

**`A1D_BOOT_SET_GUARD` was not running at all.** The branch read
`M.boot.post.local ? <set comparison> : <count comparison>`, and S4-R5 never recorded `post.local`. The live
gate was `localCount === 67`. Swapping one boot script for another passed it; adding one and removing one
passed it. The guard everyone cited - including S7-R2B's own report - was a tally.

`A2_ROUTE_APPEND_GUARD` was real but narrow: A2 reads a RECORDED headless value, and the live checks (A3,
A3b) named nine specific files. A route asset added to the registry after S4-R5 was not covered.

## Sec46 - THE RE-ENCODING

`assets/tests/_boot-topology.js` declares the 67 boot scripts **by name, in index order** and derives the
live topology. The threshold was not raised; it was replaced by the claim it stood in for, and on the
structural side the result is **strictly stronger than what it replaces**:

| | before | after |
|---|---|---|
| boot set | count only (`67 === 67`) | pinned by name |
| boot order | invisible (both sides sorted) | pinned |
| route-at-boot | 9 remembered filenames | the whole 16-file registry, live |
| byte growth in an approved owner | functional failure | measured and printed |

```
BOOT_SCRIPT_SET_UNEXPECTED_CHANGE_COUNT  0     NEW_ROUTE_SCRIPT_AT_BOOT_COUNT  0
UNDECLARED_BOOT_SCRIPT_COUNT             0     BOOT_ORDER_DRIFT_COUNT          0
BOOT_PAYLOAD_BYTES_PRE   3,952,361
BOOT_PAYLOAD_BYTES_POST  3,955,022
BOOT_PAYLOAD_DELTA         +2,661       (the retry repair, in two boot-loaded owners)
BOOT_PAYLOAD_PERFORMANCE_DEBT_OWNER  S8_BOOT_PAYLOAD_HEADROOM_AND_LOADING_ARCHITECTURE
```

Six mutants prove the corrected gate still catches what S4 cared about: a route script appended to boot, an
undeclared boot script, a removed boot script, a reordering (which the old sorted comparison could not see
at all), the whole pre-S4-R5 eager shape restored, and **a route script swapped in for an approved one with
the count unchanged - which the old gate would have passed**. A seventh case proves the opposite direction:
4 KB added to an already-approved owner changes no topology claim.

Route-script lazy loading was NOT chosen and the two panel owners were NOT moved off boot. That is S8.

## Sec47 - THE RETRY REPAIR

```
RETRY_ENTITY_TYPE_SOURCE  model.entity_type, falling back to the row DTO's related_entity_type
RETRY_ENTITY_ID_SOURCE    model.entity_id,   falling back to the row DTO's related_entity_id
RETRY_DOCUMENT_ID_SOURCE  none - document.retry is ENTITY-scoped by contract and takes no document id
SHIPMENT_DOCUMENT_REFRESH_OWNER  _shLoadAndRender (shipping-history.js)
PO_DOCUMENT_REFRESH_OWNER        _poBoundedReadback_ (purchase-order-overview.js)
```

`_shDocRowHtml` gains the entity TYPE as a fourth parameter, and the button passes `(type, id)` in the order
`shRetryDocument` declares them. Entity type is never inferred from an id format: when the caller's model
does not declare it, the row's own DTO answers, and when neither can, **no Retry button is rendered** - a
button aimed at a guess is how the defect happened.

The `|| 'shipment'` default is gone. A retry missing either half of its target is not sent.

`SH_DOC_REFRESH_` is a per-entity-type refresh registry on the ONE shared panel: the Shipment page registers
`_shLoadAndRender`, the PO page registers `_poBoundedReadback_` (which already asks `documents: true` and
degrades to a full read on a miss). `DOCUMENT_PANEL_RENDER_OWNER_COUNT` stays 1 - presentation stayed
shared, only the refresh became surface-specific. A surface with no registered refresh is told the retry
landed and the screen is stale, rather than being silently left with stale data or sent a foreign re-read.

`§11 OUTCOME_UNKNOWN`: the catch path used to reset the button to a plain `Retry`, which reads as "nothing
happened" when in fact the request had left and we cannot know whether it ran. It now says `Outcome
unknown` and never replays.

## Sec48 - TWO SELF-CORRECTIONS

**The S7-R2B report credited A1d with pinning the boot script set by name.** It does not and never did -
see Sec45. The conclusion that round drew (the floor was the blocker) was right; one of its supporting
claims was wrong, and the error flattered the existing gate.

**Two mutants in this round's own suite were silently passing.** `mut()` compares `fn() === true`, and an
async mutant returns a PROMISE, which is never `true` - so E3 and E5 reported SURVIVED regardless of what
they found. They now run through a separate async tally. A mutant harness that cannot fail is worse than no
mutant, because it reads as coverage.

## Sec49 - ROUND OUTCOME

```
PO_RETRY_ENTITY_TYPE_CORRECT  YES   PO_RETRY_ENTITY_ID_CORRECT  YES
PO_RETRY_REFRESH_OWNER_CORRECT  YES  PO_RETRY_SHIPMENT_WORKSPACE_REQUEST_COUNT  0
SHIPMENT_RETRY_ENTITY_TYPE_CORRECT / _ID_ / _REFRESH_OWNER_  YES / YES / YES
RETRY_REQUEST_COUNT_PER_CLICK  1    DOCUMENT_AUTORETRY_COUNT  0
RETRY_CREATES_SECOND_LOGICAL_DOCUMENT_COUNT  0
DOCUMENT_RETRY_FALSE_SUCCESS_COUNT  0   DOCUMENT_RETRY_AUTOREPLAY_COUNT  0
REDISCOVERY (PO / Shipment / re-entry / id preserved)  all unchanged, YES
SECOND_DOCUMENT_READ_AUTHORITY_COUNT  0   PER_DOCUMENT_RENDER_REQUEST_COUNT  0
DOCUMENT_GENERATION_AUTHORITY_CHANGED  NO   DOCUMENT_IDENTITY_CHANGED  NO
BUSINESS_DATA_WRITE_PATH_CHANGED  NO       PRODUCTION_ROWS_WRITTEN  0
NEW_TABLE / COLUMNS / MIGRATION / BACKFILL  NO / NONE / NO / NO
BACKEND_RELEASE  unchanged   APPS_SCRIPT_SYNC_REQUIRED  NO
FRONTEND_DEPLOY_SET  shipping-history.js, purchase-order-overview.js
S7_R2B_DOCUMENT_PANEL_SEAL  YES   OPEN_S7_BLOCKERS  none
```

---

# PART VI - S7-R3: CARRIER LEAD-TIME MAINTENANCE + LANE-IDENTITY SAFETY CLOSURE

PRE_SHA 6937abd.

## Sec50 - THE GAP, RE-DERIVED FROM LIVE CODE

| | |
|---|---|
| `CARRIER_LEAD_TIME_TABLE` | `carrier_lead_times` (11 columns; no status, no is_active) |
| `CARRIER_LEAD_TIME_READ_OWNER` | `KM.DB.getCarrierLeadTimes` / scoped `loadScopedTables`; 60_ include `carrierPlanning`; 61_ harvest |
| `CARRIER_LEAD_TIME_WRITE_OWNER_PRE` | **none** - `handleSeedSinotransCarrier_` only, a one-time seed |
| `CARRIER_LEAD_TIME_CONSUMERS` | `KMRA.leadDays` (route-authority) - `supply-planning-weekly-route-derivation.leadDaysFor` - `supply-planning-method-recommendation` - `carrier-rate-card.js` `_crcLeadTimeMap` - 61_ `weeklyAiPlanCarrierReadiness_` |

`LEADTIME_UI_MAINTENANCE_EXISTS_PRE = NO`, `LEADTIME_ROUTER_ACTION_EXISTS_PRE = NO`,
`LEADTIME_ADAPTER_ACTION_EXISTS_PRE = NO`. 61_ records the gap in the runtime itself: a lead time had to be
"entered directly in the `carrier_lead_times` tab, or a maintenance handler must be added first". A routable
lane needs BOTH authorities, so a lane could be priced in the application and then not be finished in it.

## Sec51 - PLANNER-EFFECTIVE LANE IDENTITY, AND WHY IT IS NOT A TUPLE

`PLANNER_EFFECTIVE_LANE_KEY = canonical method key + origin_country + destination_country + last_mile_delivery`.
`CARRIER_ID_AFFECTS_KMRA_LEADDAYS = NO` - `leadDays` never reads it, and then takes the **first** matching row.

**The guard is not tuple equality, because `axisOk` treats a BLANK axis on a stored row as a WILDCARD.** A row
with a blank origin is reachable by every origin query, so `CN | JP | air | parcel` and
`(any origin) | JP | air | parcel` have different printed keys and still collide. Two rows are refused when
their canonical method keys are equal AND, on each of origin / destination / last-mile, their values are
equal or either is blank. That is derived from `axisOk` rather than invented, and tuple equality alone would
have let the wildcard row in.

**The guard calls `KMRA.canonicalMethodKey` and `KMRA.normalizeLeadTime` rather than reimplementing them.** A
duplicate guard written in its own dialect drifts from the resolver it protects, and the drift is invisible
until two rows answer one query. With the bundle absent the write REFUSES (`KMRA_UNAVAILABLE`) instead of
falling back to a private copy of the matching rules - the same guard 61_ uses.

`DUPLICATE_EFFECTIVE_LANE_ALLOWED = NO`. `KMRA_LEADDAYS_CHANGED = NO`: the first-row pick is byte-for-byte
what it was, and is re-run against all three Sec-15 fixtures, including the duplicate one, where it still
returns the first row. This round stops NEW ambiguity; it does not rewrite history.

## Sec52 - THE WRITE OWNER

```
UI (Carrier Rate Card > Lead Time panel)
  -> KM.DB.upsertCarrierLeadTime
  -> carrierLeadTime.upsert            (01_router.gs)
  -> handleUpsertCarrierLeadTime_      (17_carrier_handlers.gs)   CARRIER_LEADTIME_WRITE_OWNER_COUNT_POST = 1
  -> carrier_lead_times
```

`LEADTIME_CREATE_SUPPORTED = YES`, `LEADTIME_UPDATE_SUPPORTED = YES`, `LEADTIME_DELETE_SUPPORTED = NO`.
Delete was audited and deliberately not added: with no status column, removing a lane silently un-routes it,
and no current workflow asks for that. An edit addresses `lead_time_id` (`LEADTIME_UPDATE_IDENTITY`) and
replaces the row in place rather than appending a twin that would need a status column to disambiguate.

`created_at` is preserved on update and only `updated_at` moves. No `created_by` / `updated_by` were invented -
the table has no such columns and S9 owns identity.

Concurrency reuses the existing `LockService.getScriptLock()` pattern (`handleUpsertFcTargetRule_`'s shape),
so `CONCURRENT_DUPLICATE_LANE_REACHABLE = NO` with no second lock architecture.

## Sec53 - CARRIER_ID, AND THE DECISION THAT IS NOT MINE

`carrier_id` stays on the table as METADATA. It is not part of the planner key, is not validated as one, and
is displayed on the panel because the business data uses it. 17_'s own carrier spec already says the system
must not "treat `carrier_lead_times.carrier_id` as a carrier selection".

`CARRIER_SPECIFIC_LEADTIME_DECISION_REQUIRED = NO` **for this round, on the evidence available.** If two
carriers genuinely need different transit times on one planner-effective lane, the current resolution rule
cannot express it and that is a product decision, not something to invent inside a maintenance slice. The
read-only census reports exactly that case as `carrier_specific_conflict_count`, so it surfaces as a
question rather than as a silently-picked row.

## Sec54 - THE READ-ONLY DUPLICATE CENSUS

`carrierLeadTime.duplicateCensus` lists every stored pair the planner could reach with one query, using the
same predicates as the guard, and reports which row the planner uses TODAY. **Zero writes, no sheet created,
no row touched** - asserted by counting appends, range writes and flushes against a fake sheet.

`EXISTING_DUPLICATE_LANE_COUNT = 0` **against repository fixtures**; the only lead-time row the repository
creates is the Sinotrans seed (CN -> JP Air/Parcel). `PRODUCTION_DUPLICATE_CENSUS_REQUIRED = YES` - the real
answer can only come from the live sheet, and §16 is explicit that duplicates found there are reconciled by
the operator, never auto-deleted or merged.

`SINOTRANS_SEED_CLASSIFICATION = ONE_TIME_SEED`. It writes `carrier_lead_times`, is idempotent, was not
removed and was not executed. Recorded for S7-R4's deploy-surface review.

## Sec55 - THE SURFACE

`LEADTIME_UI_SURFACE` = a Lead Time panel on the existing Carrier Rate Card page. `NEW_TOP_LEVEL_NAV_REQUIRED = NO`.
Colocated because an operator setting up a lane needs both; separate underneath because they are two
authorities. The panel reads the page's EXISTING scoped read model, so
`ADDITIONAL_LEADTIME_REQUEST_COUNT = 0` and `PER_ROW_LEADTIME_REQUEST_COUNT = 0`; the rows were already being
read to fill the rate table's Lead Time column.

Four states, from the existing `KM.deferredRead` contract rather than a flag invented here: LOADING,
READY_EMPTY, READY_WITH_ROWS, READ_FAILED. A failed read says so and offers Retry; it never reads as "no
lanes". `LEADTIME_FALSE_EMPTY_COUNT = 0`, `LEADTIME_FALSE_SUCCESS_COUNT = 0`,
`LEADTIME_FALSE_FAILURE_COUNT = 0` - a committed write whose refresh lags says the write is committed and the
list may be behind. `LEADTIME_UNKNOWN_AUTOREPLAY_COUNT = 0`: a transport that threw says the outcome is
unknown and is never resent, because a blind replay is how a refused duplicate becomes two rows.

## Sec56 - RELEASE: THE NINETEENTH SWAP

R39 is a WRITE round and the **first router change since R25** - a fourteen-release gap, which is exactly the
jump a per-module stamp exists to express.

```
RELEASE_OWNERS    01_router.gs (R25 -> R39)   63_api_v1_system_health.gs (R39)
STAMPLESS_OWNERS  17_carrier_handlers.gs (new)   57_api_v1_shipment_workspace.gs (carried)
RELEASE_CARRIED   unchanged; 22_ keeps R37
SYS_DEPLOYED_ACTION_CONTRACT_VERSION_  17 -> 18   KM_EXPECTED_ACTION_CONTRACT_VERSION_  17 -> 18
SYS_REQUIRED_ACTION_LIST_VERSION_      unchanged
```

`SYS_REQUIRED_ACTIONS_` lists actions a PAGE DEPENDS ON AT MOUNT. `importCarrierRateCards` - the Rate Card
page's own write action - is not in it, and `carrierLeadTime.upsert` is the same class: an operator-initiated
write on a page that mounts and reads perfectly well without it.

**Three assertions in the release ledger moved with 01_** out of `RELEASE_CARRIED` and into `RELEASE_OWNERS`
(C2, H4a, and F2's old-router fixture, now R25). Each kept its intent; only which list it reads changed.
**H2 changed from 1 to 2** and stayed EXACT: it measures the action-contract delta across the whole unshipped
span, which now contains two action-adding releases. The convention is one bump per RELEASE that changes the
action set, not one per action - 63_'s own history says so, where FB-4E-R2 moved the list version by one for
four new entries. Loosening it to `>= 1` was explicitly rejected once before in this file and is rejected again.

## Sec57 - ROUND OUTCOME

```
NEW_TABLE_REQUIRED  NO   NEW_COLUMNS_REQUIRED  NONE   DB_MIGRATION_REQUIRED  NO   BACKFILL_REQUIRED  NO
PRODUCTION_ROWS_WRITTEN  0        RATE_CARD_WRITE_FROM_LEADTIME_COUNT  0
DUPLICATE_CREATE_WRITE_COUNT  0   LEADTIME_WRITE_FROM_RATECARD_COUNT   0
DUPLICATE_UPDATE_WRITE_COUNT  0   LEADTIME_WRITE_TRUTH_OWNER  the backend receipt, read back from the sheet
BACKEND_RELEASE  F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R39
APPS_SCRIPT_SYNC_REQUIRED  YES    SET  17_ - 01_ - 63_  (+ the TEMP activation census pin)
FRONTEND_DEPLOY_REQUIRED   YES    SET  operation-system-db-api.js - carrier-rate-card.js - carrier-rate-card.html
TOKEN_ROTATION_REQUIRED_AT_FINAL_DEPLOY  YES (deferred to the cumulative release)
S7_R3_CARRIER_LEADTIME_SEAL  YES  OPEN_S7_BLOCKERS  none
```

**DEPLOY ORDER: 01_ and 17_ TOGETHER.** A router that routes `carrierLeadTime.upsert` to a handler that is
not there answers with a reference error rather than a refusal; a 17_ without the router is unreachable. The
browser pins contract v18, so a frontend that can call the action refuses a deployment that predates it
instead of sending a write nothing will route.

---

# PART VII - S7-R4: TEMP / MIGRATION PRODUCTION DEPLOY-SURFACE CLEANUP

`PRE_SHA 085c2fd` -> `POST_SHA <this round>` - `feature/product-strategy-board-p0`

## Sec58 - THE FOLDER WAS THE CLAIM

APPS-SCRIPT-RUNTIME-SLIM-R1 asked the live Apps Script project, one top-level symbol at a time, which
files it contained. Seven `TEMP_*` files answered **absent** - 808,195 bytes - with 31 corroborating
symbol probes, positive controls present, negative controls absent, and the live manifest independently
reporting the lifecycle migration in `absent_optional_modules`. Two mechanisms, one answer.

That audit was right, and it left one question open: **why would they stay out?**

`63_` answers it, in a note explaining why a sibling tool gets no manifest row:

> every manifest reader resolves `assets/specs/active/apps-script/<file>` and only that, because this
> manifest lists the files SYNCED INTO THE PROJECT AS RUNTIME ... the precedent is the folder, not being
> a migration.

So membership in that folder **is** the claim "this is production runtime". And the folder held
`TEMP_demo_shipping_shipment_map_seed_v2.gs`, whose `DEMO4A_WRITE_ORDER_` names six business tables -
`shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_routes`,
`shipment_events` - and whose `DEMO4A_CLEAR_ORDER_` names the same six in reverse. Nothing structural
kept it out of a release. Only nobody having pasted it yet.

## Sec59 - RELOCATED, ON EVIDENCE RATHER THAN ON FILENAME

```
apps-script-migrations/   TEMP_migrate_request_order_draft_v2.gs              418,557 B  writes
                          TEMP_migrate_shipping_allocation_ai_lifecycle.gs     36,728 B  writes
apps-script-diagnostics/  TEMP_order_planning_draft_readback_diagnose.gs       17,404 B  read-only
                          TEMP_document_diagnostics.gs                         15,423 B  read-only
                          TEMP_request_order_send_diagnostics.gs               12,609 B  read-only
                          TEMP_draft_migration_diagnostic.gs                    7,292 B  read-only
apps-script-seeds/        TEMP_demo_shipping_shipment_map_seed_v2.gs          300,182 B  writes + clears
```

The two existing tooling directories were already the repository's answer to this question - the
override-audit provisioning tool and the allocation two-column append migration live there, and `63_`
records that neither has a manifest row. `apps-script-seeds/` is new, because burying the one tool that
can empty six tables among ordinary migrations loses the only fact about it that matters.

`TEMP_draft_migration_diagnostic.gs` is classified **DIAGNOSTIC** although the audit tool classes it
D_FUTURE_MIGRATION from its name. Its own header says *"strictly READ-ONLY ... it NEVER creates, writes,
or repairs any Sheet"*, and it has zero recorded mutations. The file is the evidence; the name is not.

`UNKNOWN_TEMP_CLASSIFICATION_COUNT = 0`.

## Sec60 - WHAT THE LEDGER ALREADY KNEW

The release ledger partitions the Apps Script diff into COPY and DELETE and says *"an unexplained
deletion is as much of a ride-along as an unexplained edit"*. Seven files left the folder, so `I1a` fired
on the first run with all seven named. Widening it to whatever git reports would have turned a guard into
a mirror, so `PRODUCTION_DELETE_SET_CANDIDATE` declares them and `I1a` is aimed at the declaration: an
**eighth** file leaving is still a failure.

This matters beyond bookkeeping. **Removing a file from the repository does not remove it from Apps
Script.** A copy list alone would leave the old files in the project, compiled on every execution.

## Sec61 - THE ONE RUNTIME BYTE CHANGE, AND WHY IT IS NOT BOOKKEEPING

`63_`'s note ended "the lifecycle migration above has a row because it lives in that folder". After the
move that file is in `assets/tools/apps-script-migrations/` and its row stayed - so the stated rule now
predicts the opposite of what the file does.

The row was kept rather than removed. Removing it would have emptied `absent_optional_modules`, whose
count is asserted by `positive-residual-and-submit-readiness-census`, **one of the five canonical failing
suites** - changing the canonical failure set to tidy a rule is not a trade worth making. And the row is
still earning its place: the real reason was always stated four lines above it. *Absence is ACTIONABLE* -
`69_` refuses until the columns exist and this tool is the only supported way to add them, so an operator
who cannot tell "the run is blocked" from "the tool was never pasted" is stuck. `optional: true` is
exactly right for a file that is not runtime: absent is normal, present-but-stale is the fault.

The comment is corrected rather than carried. A manifest that mis-states its own admission rule is the
comment-versus-assertion drift S7-R2B1 was convened to repair, and carrying it would have been the third
time this series read a comment instead of the code.

## Sec62 - THE EDGE I INVENTED, AND THE TOOL THAT HAD ALREADY WARNED ME

The new suite's F6 asks whether any runtime file still references a symbol that left. On its first run it
reported `66_api_v1_request_order_send.gs`. The mention is a **line comment** at `66_:1453`; `66_` is the
file those wrappers call into, which is why FB-4G-A2-R4 reduced them to editor wrappers.

The load-surface audit tool records this exact error, in the opposite direction, as the reason it was
rebuilt: `46_` names two trigger handlers in a line comment and depends on neither, so *"a scan that
simply grepped for the name would invent that edge and report a file as load-bearing when it is not -
which is how dead code stays deployed forever."* I invented that edge, in a suite written beside the tool
that documents it.

Comments are stripped before the scan; string literals are kept, because a refusal message naming a tool
is a real guidance edge. The comment mention is then asserted **positively** (`F6a`/`F6b`) and a mutant
guards the distinction, so it is tested rather than merely avoided.

F6 also named only the FILE and not the SYMBOL, which cost three runs. It reports pairs now. An assertion
that announces a failure without saying what it found is a worse instrument than one that says nothing,
because it looks like an answer.

## Sec63 - GUIDANCE STAYED TRUTHFUL, AND WAS NOT TOUCHED

`61_` tells an operator to run `TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY()`; `69_` names the
three AI-lifecycle entry points; `00_config` names the activation census. All three were checked against
the relocated sources and all resolve. `PRODUCTION_GUIDANCE_DEAD_TOOL_REFERENCE_COUNT = 0`.

None of those messages was edited. They say "run it **in the Apps Script project**", which has always
meant paste-then-run: the live probe proved none of these tools was in the project before the move
either. Relocation changed where the operator finds the file, not whether the instruction was true -
and editing `61_` would have rotated a 240 KB runtime owner and its manifest row to improve a sentence
that was already correct.

## Sec64 - ROUND OUTCOME

```
TEMP_ARTIFACT_COUNT                              41   (39 tooling .gs + 1 tmp/ live-paste copy
                                                      + 1 sealed retired fixture)
UNKNOWN_TEMP_CLASSIFICATION_COUNT                 0
DEPLOYABLE_TEMP_COUNT_PRE                         7
PRODUCTION_REQUIRED_TEMP_COUNT                    0
NON_RUNTIME_TEMP_IN_FINAL_PRODUCTION_DEPLOY_SET   0
FINAL_PRODUCTION_APPS_SCRIPT_RUNTIME_FILE_COUNT  77   (+ appsscript.json)
TEMP_EXCLUSION_STRUCTURALLY_ENFORCED            YES
MISSING_ROUTER_HANDLER_COUNT                      0
ORPHAN_PRODUCTION_ACTION_COUNT                    0
DEAD_TEMP_REFERENCE_COUNT_POST                    0
PRODUCTION_ROWS_WRITTEN                           0
BACKEND_RELEASE      F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R40   (63_ only; one corrected comment)
```

**THE TWENTIETH SWAP.** `01_` leaves ownership after exactly one release and keeps R39. No action was
added, so the action contract stays at 18 and the browser's pin stays at 18.

`C2` and `H4a` both had to go back to the durable claim. R3 had narrowed `C2` to "the router declares
THIS release" while `01_` was an owner; R40 carries it, and the narrowed form demanded exactly the marched
stamp that `C2`'s own comment says it was rewritten to stop requiring - one release after it was
narrowed. Both now read the ledger, so they hold in either state and discriminate in both.
