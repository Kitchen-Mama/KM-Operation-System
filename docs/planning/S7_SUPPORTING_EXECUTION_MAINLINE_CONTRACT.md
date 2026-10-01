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
