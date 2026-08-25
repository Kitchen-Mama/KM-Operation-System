# F1-7N-FB-3 — Shipping + Procurement production vertical closure (2026-08-25)

Source-traced transition matrices for both primary business verticals, plus the defect dispositions.

**Honesty boundary.** Every row below is **source-traced**, not live-executed: this task forbids running Apps
Script and reading live rows. A step marked `CONNECTED` means *its owner, tables, statuses and idempotency
identity are proven in source and reachable through the deployed router* — **not** that it has been observed
committing a row in production. Steps that genuinely cannot be settled without live data are marked
`LIVE_PROOF_REQUIRED`, and the read-only diagnostics in §D exist precisely to settle them without a write.

---

## A. Live-evidence classification

| observation | classification | disposition |
| --- | --- | --- |
| Site Inventory eventually returned rows after an excessive wait | `EVENTUAL_SUCCESS_WITH_EXCESSIVE_LOADING_TIME` | The read path is **reachable**. Eventual success is **not** evidence that the API is performant or stable, and is not used as such anywhere in this document. Loading UX and request volume repaired (§B/§C); a permanently-stuck path was separately audited and closed (§C). |
| `Loading Inventory Replenishment…` shown while Country/Marketplace were unselected (B1) | `LOCAL_ONLY_DEFECT` (frontend state coupling) | Fixed. Root cause below. |
| Selector population slow because options came from the full inventory payload (B2) | `LOCAL_ONLY_DEFECT` + API shape | Fixed by the slim registry. |
| Execution Plan write reached `upsertShippingAllocationDraft`, displayed `BUSINESS_COMMAND_ERROR`, no DB row (B3) | `SCHEMA_BLOCKED` *or* `LIVE_PROOF_REQUIRED` — **not yet distinguishable without a live read** | The reason is now named end-to-end, and a **zero-configuration** diagnostic reports the exact token. **No schema was changed.** |
| Send Request waited long, gave no terminal feedback, DB unchanged (B4) | `LOCAL_ONLY_DEFECT` (treated as a **failed transaction**, never latency or an isolated incident) | Four compounding faults found and fixed; two residuals disclosed. |

---

## B. Root cause — B1, the pre-search "Loading Inventory Replenishment…"

`_irWorkspaceRefresh_` owns the inventory table's load region (`_irRegion_().beginLoad()`), whose renderer
writes `Loading Inventory Replenishment…` into `#replenScrollBody`. FB-2A had deferred selector population to
first selector interaction but still populated it **by calling `_irWorkspaceRefresh_()`**. So touching a
dropdown put the **inventory table** into LOADING with nothing selected — a direct PRE_SEARCH violation — and
cost a 21-table read to draw two dropdowns.

Selector loading and inventory loading were, literally, the same request. They are now two actions with two
statuses, two error surfaces and two Retries; the registry loader touches neither `_irRegion_` nor the table
bodies. The superseded FB-2A loader was **deleted**, not renamed — it shared the function name and, being later
in the file, would have won by hoisting and silently restored the defect.

---

## C. Infinite-loading audit — every async operation in both verticals

The two canonical runners (`_kmGapRead_` for reads, `_kmWeeklyCommand_` for commands) had **no timeout**:
`fetch` against a deployment that never answers never settles, so the caller's `await` never returns and its
latch is never released. That is the mechanism by which a page can stay in LOADING forever.

| control | where | behaviour |
| --- | --- | --- |
| bounded timeout | `_kmFetchBounded_` at both runners | read 45s / write 90s, operator-overridable; the request is **aborted**, and the wait is bounded by a race even if `AbortController` is absent |
| read expiry | `_kmTimeoutError_(…, 'read')` | `REQUEST_TIMEOUT`, `zero_write: true`, retryable |
| **write expiry** | `_kmTimeoutError_(…, 'write')` | `REQUEST_TIMEOUT_WRITE_INDETERMINATE`, `zero_write: **false**`, `indeterminate: true`, **`retryable: false`** — the server may have committed after the client stopped listening, so it is never presented as success *or* as zero-write, and never auto-retried |
| latch release | `handleSendRequest` `finally` | clears busy, re-enables the button, ends the write batch — on success, business failure, transport failure, timeout and unexpected throw |
| stale guard | mount-epoch compare | a late result never repaints a hidden or newer page (reuses the existing `_roMountEpoch`; no parallel counter) |
| terminal states | Site Inventory: PRE_SEARCH / LOADING / READY / EMPTY / ERROR · registry: IDLE / LOADING / READY / EMPTY / ERROR · Send: IDLE / LOADING / SUCCESS / ERROR | EMPTY is reachable only from a **successful** read; an error never becomes empty or success |
| no auto-retry | both verticals | business writes are retried only by explicit user action reusing the same idempotency identity |

Instrumentation is compact and leaks nothing: `request_id`, action, phase, elapsed_ms, counts, verdict — never a
business row, an id or a configuration value.

---

## D. Read-only diagnostics

| entrypoint | input | answers |
| --- | --- | --- |
| `TEMP_SHIPPING_ALLOCATION_SCHEMA_DIAGNOSE` (65_) | **none — zero configuration** | Runs the writer's own first gate (`prodRequireSheet_`) on both draft tables and reports the exact `PRODUCTION_SAFETY:<token>`, actual vs expected column counts, missing/extra headers by name, the order-drift index, the 41_ header-drift report, PK/line-table/FK readiness, action availability, verdict, next action |
| `TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE` (63_) | a **prefilled** constant object; the editable value fields are listed explicitly and no field name has to be invented | "would *this* route save?" |
| `TEMP_REQUEST_ORDER_SEND_DIAGNOSE` (65_) | one documented `request_allocation_draft_id` (optional) | Canonical meaning of Send Request, action/handler availability, header readiness for all five written tables against their frozen authorities, source/target state, line readiness, FK readiness, lock **contract** (`NOT_PROBED_BY_DESIGN` — acquiring it would block a live write), idempotency, the expected write manifest, downstream visibility, exact blocker |
| `TEMP_TWO_VERTICAL_FLOWS_DIAGNOSE` (65_) | optional shipment / PO / draft ids | **Two independent verdicts**; each sub-diagnostic runs through a failure-isolating wrapper so one vertical cannot hide the other |
| `TEMP_INVENTORY_SCOPE_REGISTRY_CHECK` (64_) | none | registry shape, never its rows |

All of 65_ and 64_ are read-only by construction: no `appendRow`/`setValue`/`insertSheet`/`LockService`/
`DriveApp`/`MailApp`/`PropertiesService`, no `procurementEnsureSheet_`, no handler invocation, no id in any
response. Asserted by a comment-and-string-stripping scanner so the guard tests code, not prose.

---

## E. Vertical A — Shipping transition matrix

| # | UI action | frontend | API action | backend owner | source → target | tables written | idempotency | lock | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | page mount | `_irEnsureRegistryLoaded_` | `inventoryScope.registry.get` | `handleInventoryScopeRegistryGet_` (64_) | — | none | — | none | `READ_ONLY_CONNECTED` |
| 2 | Search | `searchReplenishment` → `_irWorkspaceRefresh_` | `inventoryReplenishment.workspace.get` | `handleInventoryReplenishmentWorkspaceGet_` (60_) | — | none | — | none | `READ_ONLY_CONNECTED` |
| 3 | Execution Plan save | `_flushDraftDbPersist` | `upsertShippingAllocationDraft` + `…Lines` | `handleUpsertShippingAllocationDraft_` / `…Lines_` (16_) | — → `draft` | `shipping_allocation_drafts`, `_lines` | deterministic `SADH-K2-` hash of route dims | ScriptLock 30s | `SCHEMA_BLOCKED` **or** `LIVE_PROOF_REQUIRED` — settle with §D |
| 4 | Submit Plan | `submitReplenishmentPlans` → `_replenCanonicalSubmit` | `submitAllocationDraftsToShippingPlans` | `handleSubmitAllocationDraftsToShippingPlans_` → `sadSubmitToShippingPlansCore_` → **`shippingPlanCommitFromLines_` (11_)** | draft → `submitted` | `shipping_plans`, `shipping_plan_lines` | execution key | ScriptLock, DB-only | `CONNECTED` |
| 5 | Weekly plan Draft visible | `renderShippingPlanFromDb` | `weeklyShipping.workspace.get` | `handleWeeklyShippingWorkspaceGet_` (40_) | — | none | — | none | `READ_ONLY_CONNECTED` |
| 6 | submit for approval | `updateShippingPlanStatus` | same | `handleUpdateShippingPlanStatus_` | `draft` → `pending_approval` | `shipping_plans` | benign `ALREADY_IN_TARGET_STATE` | ScriptLock | `CONNECTED` |
| 7 | approve | same | same | same | `pending_approval` → `approved` | `shipping_plans` | same | ScriptLock | `CONNECTED` |
| 8 | transfer → Shipment Draft | `createShipmentFromPlan` | same | `handleCreateShipmentFromPlan_` | approved → shipment `draft` | `shipments`, `shipment_lines` | plan FK | ScriptLock | `CONNECTED` |
| 9 | shipment draft edit | `updateShipment` | same | `handleUpdateShipment_` | `draft` | `shipments`, `shipment_lines` | row id | ScriptLock | `CONNECTED` |
| 10 | mark ready_to_ship | `updateShipment` | same | same | `draft` → `ready_to_ship` | `shipments` | row id | ScriptLock | `CONNECTED` |
| 11 | document readiness (pre-dispatch) | Document Panel | `document.diagnostic.shipment` | `handleShipmentDocumentDiagnostic_` → `dgsShipmentReadiness_` (39_) | — | none | — | **evaluated before the lock** | `READ_ONLY_CONNECTED` |
| 12 | Confirm Shipment | `confirmShipmentAndDispatch` | same | `handleConfirmShipmentAndDispatch_` (22_) | `ready_to_ship` → `shipped` | shipments + allocations + stock + routes + events | D1 gate before lock | ScriptLock; **documents rendered after `releaseLock()`** | `CONNECTED` |
| 13 | `shipped` + `shipped_at` | — | — | same, one canonical writer | — | `shipments` | — | in-lock | `CONNECTED` |
| 14 | allocation / stock finalization | — | — | 22_ | — | `shipment_line_allocations`, stock | — | in-lock | `CONNECTED` |
| 15 | route snapshot | — | — | 22_ | — | `shipment_routes` | — | in-lock | `CONNECTED` |
| 16 | event append | — | — | 22_ | — | `shipment_events` | append-only | in-lock | `CONNECTED` |
| 17 | final-output snapshot | `finalizeShipmentFinalOutput` | same | `handleFinalizeShipmentFinalOutput_` (34_) | — | `shipment_final_output_*` | snapshot id | ScriptLock | `CONNECTED` |
| 18 | document render + registry | — | — | `dgsGenerateShipmentDocuments_` (39_) → 37_ | — | `generated_documents` | attempt reservation + `DOCUMENT_SOURCE_DRIFT` | **no lock held during Drive** | `CONNECTED` |
| 19 | Shipment Overview | `shipping-history.js` | `shipment.workspace.get` (`include:{documents:true}`) | `handleShipmentWorkspaceGet_` (57_) | — | none | — | none | `READ_ONLY_CONNECTED` |
| 20 | On-the-Way Map | map page | `shipment.workspace.get` | same | — | none | — | none | `READ_ONLY_CONNECTED` |
| 21 | Current Position | derived from routes/events | same | same | — | none | — | none | `READ_ONLY_CONNECTED` |
| 22 | event-derived progression | derived | same | same | — | none | — | none | `READ_ONLY_CONNECTED` |

**Legacy exception, unchanged and disclosed:** `handleShipmentDocumentGenerate_` (36_) still holds a ScriptLock
across Drive work. It is **not used** by the staged Confirm-Shipment path and must not be invoked during the
controlled test. Its migration remains a separate cleanup.

---

## F. Vertical B — Procurement transition matrix

| # | UI action | frontend | API action | backend owner | source → target | tables written | idempotency | lock | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | materialized gap / recommendation | `_opMatCache`, KMREC | `orderPlanningGap.get`, `aiPlanFirstLayer.get` | 43_/56_ | — | none | — | none | `READ_ONLY_CONNECTED` |
| 2 | Request Order Draft (allocation) | `_roRunAiPlanJob_` / manual edits | `requestOrderDraft.job.start` / `upsertRequestOrderAllocationDraft` | 15_ | — → `draft` | `request_order_allocation_drafts` | deterministic manual id / canonical AI id | ScriptLock | `CONNECTED` |
| 3 | allocation / source lines | manual tier edits | `upsertRequestOrderAllocationDraftLines` | `handleUpsertRequestOrderAllocationDraftLines_` (15_) | `draft` | `request_order_allocation_draft_lines` | line natural key + optimistic token | ScriptLock | `CONNECTED` |
| 4 | **Send Request** | `handleSendRequest` | 3 actions, in order (below) | 15_ + 13_ | `draft` → `site_confirmed` → `submitted` | 5 tables (see §D manifest) | deterministic draft ids + Request Order **execution key** | ScriptLock per call | `CONNECTED` (UX defect fixed; residuals in §G) |
| 4a | ↳ confirm each SKU draft | — | `upsertRequestOrderAllocationDraft` | 15_ | `draft` → `site_confirmed` | allocation drafts | deterministic id; stale token → fail closed | ScriptLock | `CONNECTED` |
| 4b | ↳ create one order per series | — | `createRequestOrderDraft` | `handleCreateRequestOrderDraft_` (13_) | — → request order | `request_orders`, `request_order_lines`, `request_order_line_sources` | `roFindByExecutionKey_`; reuse, or `REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT` | ScriptLock 30s | `CONNECTED` |
| 4c | ↳ advance lifecycle **after** 4b | — | `submitRequestOrderAllocationDrafts` | 15_ | `site_confirmed` → `submitted` | allocation drafts | already-submitted is a safe no-op | ScriptLock | `CONNECTED` |
| 5 | approval / rejection | Request Order Draft page | `updateRequestOrderStatus` | `handleUpdateRequestOrderStatus_` (13_) | `draft` → approved/rejected | `request_orders` | status guard | ScriptLock | `CONNECTED` |
| 6 | convert → PO Draft | Convert to PO | `createPurchaseOrderFromRequest` | `handleCreatePurchaseOrderFromRequest_` (13_) | approved → PO `draft` | `purchase_orders`, `purchase_order_lines` | request FK | ScriptLock | `CONNECTED` |
| 7 | PO Workspace | `purchase-order-overview.js` | `purchaseOrder.workspace.get` (`include:{documents:true}`) | `handlePurchaseOrderWorkspaceGet_` (50_) | — | none | — | none | `READ_ONLY_CONNECTED` |
| 8 | PO edits / save | header + line editors | `updatePurchaseOrderHeader` / `updatePurchaseOrderLine` | 13_ | `draft` | `purchase_orders`, `_lines` | row id | ScriptLock | `CONNECTED` |
| 9 | PO document readiness | Document Panel | `document.diagnostic.purchaseOrder` | `handlePoDocumentDiagnostic_` | — | none | — | evaluated before the lock | `READ_ONLY_CONNECTED` |
| 10 | **Send PO** | `updatePurchaseOrderStatus` (`transition:'issue'`) | same | `handleUpdatePurchaseOrderStatus_` (13_) staged saga | `draft` → `issued` | `purchase_orders` + `generated_documents` | `DOCUMENT_ATTEMPT_RESERVED`; `authorizes_issue` gate | prepare/finalize in-lock, **render outside** | `CONNECTED` |
| 11 | `generated_documents` | — | — | 39_ → 37_ | — | `generated_documents` | one canonical writer | no lock during Drive | `CONNECTED` |
| 12 | issued / In Production group | PO Overview | `purchaseOrder.workspace.get` | 50_ | — | none | — | none | `READ_ONLY_CONNECTED` |
| 13 | production updates | PO Workspace | `updatePurchaseOrderStatus` | 13_ | `issued` → in-production states | `purchase_orders` | status guard | ScriptLock | `CONNECTED` |
| 14 | receive | receiving UI | `receivePurchaseOrderLines` | `handleReceivePurchaseOrderLines_` (13_) | → received | `purchase_order_lines` + inventory movement | line id | ScriptLock | `CONNECTED` |
| 15 | inventory / movement effects | — | — | 13_ | — | inventory tables | — | in-lock | `LIVE_PROOF_REQUIRED` |
| 16 | PO Overview visibility | PO Overview | `purchaseOrder.workspace.get` | 50_ | — | none | — | none | `READ_ONLY_CONNECTED` |

---

## G. Send Request — root cause and residuals

**Four compounding faults, none of them a business rule:**
1. **No latch, no loading state, no `finally`** — and the button carried **no `id`**, so there was nothing to
   disable. For the whole run the page was indistinguishable from frozen, and a second click started a second
   full run.
2. **A serial multi-write loop with no progress** — 2–3 sequential Apps Script writes **per SKU**, then one per
   series, then one lifecycle advance.
3. **A whole-DB reload per write** — every direct writer awaits `_kmWriterPostWrite_`, which falls back to
   `loadOperationDb({force:true})` whenever the scoped posture cannot be confirmed. On such a session the loop
   performed one whole-DB read after **every** write.
4. **No client timeout** — an unanswered write never settled.

**Fixed:** 1 and 2's feedback (latch, single-flight, progress, terminal states, mount guard); 3 collapsed to
**one** reconcile via a declared write batch that *delegates to the existing seam* rather than adding a second
reload path; 4 fixed at both transport choke points.

**Residuals, disclosed, not improvised:**
- The **serial per-SKU writes remain**. Collapsing them would require a new batch write endpoint — a *second
  writer* for those tables — which §H forbids without an explicit decision.
- `upsertRequestOrderAllocationDraftLines` still spends an extra round trip fetching a concurrency token when
  the caller supplies none. Removing it safely needs the token contract extended to a freshly-created draft.
- Whether fault 3 was active in the observed session **cannot be determined offline** — it depends on live
  workspace flags. The batch makes the outcome deterministic either way.

---

## H. Offline request-count acceptance

| surface | before | after |
| --- | --- | --- |
| Site Inventory mount | 1 inventory workspace read (21 tables) + 2 scope reads + a rendered table | **1 slim registry read (1 table, 6 columns)**, 0 inventory reads, table PRE_SEARCH |
| Country change | 2 scope reads + an unrequested repaint | **0** |
| Marketplace change | 2 scope reads + an unrequested repaint | **0** |
| Search | 1 inventory read | **exactly 1** |
| Search over a loaded model | 1 | **0** |
| Row expand | deduped catalog fetch | unchanged (deduped, preloaded at Search) |
| Route save | 1 idempotent write | unchanged |
| Submit | 1 idempotent write | unchanged |
| Send Request post-write reconciles | up to 1 whole-DB read **per write** | **1 per Send** |

**No live latency claim is made anywhere.** These are request/read-volume facts proven offline by executing the
shipped code against stubbed transport seams.


---

# F1-7N-FB-3A — live-evidence closure (2026-08-25)

## I. Deployment identity — why the editor and the website disagreed

Both facts the user reported are true, and together they name the cause exactly.

| fact | what it proves |
| --- | --- |
| `TEMP_INVENTORY_SCOPE_REGISTRY_CHECK` succeeded in the Apps Script editor (countries=6, marketplaces=15, rows_read=15, 1004 ms, zero writes) | the code is **saved** and the data is **readable** |
| the website got `GAP_READ_ERROR — gap read failed` for the same action | the deployed **`/exec` Web App** does not contain that action |
| `system.health` reported `build=F1-7N-FB-2` | **nothing** — see below |
| `missing_actions=[]` | **nothing** — see below |

**Root cause A — the build marker never moved.** `SYS_BUILD_VERSION_` was left at `'F1-7N-FB-2'` through all of
FB-3. The one field whose entire purpose is "prove which code answered" could not distinguish FB-2 from FB-3.
That was my defect, and it is why the evidence looked contradictory.

**Root cause B — `missing_actions` is self-referential.** It is computed from the *deployed* code's own
`SYS_REQUIRED_ACTIONS_` list. A deployment that predates an action cannot know the action exists, so it reports
"nothing missing" while genuinely missing it. An empty list is **not** a completeness proof.

**Root cause C — the client mislabelled it.** A deployment without the action falls through the router to its
terminal `{ success:false, error:'Invalid POST action. Supported: …' }`. That envelope carries no `errors[]`, so
`_kmGapRead_` hit its generic fallback and printed `GAP_READ_ERROR`. The same shape reached `_kmWeeklyCommand_`
as `BUSINESS_COMMAND_ERROR`.

**Fixes.** `build_id` / `contract_version` / `deployed_action_contract_version` /
`inventory_registry_projection_version` / `required_action_list_version` are now immutable identity fields, with
a written bump rule. Both runners classify the router's unknown-action envelope as
**`DEPLOYMENT_CONTRACT_MISMATCH`** — zero-write, **not retryable** (retrying cannot publish a deployment) — and
say "publish a new deployment version". `checkDeploymentContract()` compares the frontend's pinned minimum
against the deployment's own identity. A registry failure leaves Site Inventory in **PRE_SEARCH**, starts no
inventory read, and recovers via its own Retry with no navigation.

The 45 s read timeout was **not** raised.

## II. The origin of "234" — answered

`234` was **not** wrong data and **not** persisted drafts. It was `drafts.length`: the number of **SKU rows
carrying at least one positive tier quantity**, out of 495 AI-Plan rows on screen. My FB-3 progress line printed
that SKU-row count under the label `allocation drafts`. The user is right that
`request_order_allocation_drafts` never held 234 rows — an AI Plan row only becomes a persisted draft when a
Send writes one.

Every count is now computed once, labelled with its real unit, and **frozen**:

| unit | meaning |
| --- | --- |
| `page_rows_in_scope` | rows surviving the page filters |
| `sku_rows_with_positive_tier` | **this was the 234** |
| `tier_cells_with_positive_qty` | SKU x T1/T2/T3 cells — the Request Order **line** count |
| `distinct_skus` / `distinct_series` | their own counts |
| `canonical_persisted_drafts` | drafts that **already exist** |
| `manual_drafts_to_create` | drafts this Send would create |
| `expected_request_order_headers` | = Series groups |
| `expected_request_order_lines` | = tier cells |

A confirmation summary shows all of them plus typed exclusions (already-submitted, no positive tier qty,
removed by display filters) **before** anything is written. Progress phases now name their unit
(`Persisting allocation drafts … SKU rows`, `Creating Request Orders … Series groups`) and take their
denominators from the frozen workset. The mislabelled helper was deleted.

## III. Page-control authority audit — **with a STOP**

Source authority: `_roCountryMarketplaceScopedRows` (F1-7M-B2-HOTFIX) states the repo's own rule —
*"rows scoped to the CURRENT Country + Marketplace selection ONLY (never Category / SKU / showMode)"*.

| control | verdict by that authority | does it truncate Send today? |
| --- | --- | --- |
| Request type ALL / T1 / T2 / T3 | **BUSINESS_SEND_SCOPE** (user-frozen) | yes — correct |
| Country | **BUSINESS_SEND_SCOPE** | yes — consistent |
| Marketplace | **BUSINESS_SEND_SCOPE** | yes — consistent |
| Category tab | **DISPLAY_ONLY** | **YES — CONFLICT** |
| Risk | **DISPLAY_ONLY** | **YES — CONFLICT** |
| SKU search text | **DISPLAY_ONLY** | **YES — CONFLICT** |
| Show mode | DISPLAY_ONLY | no — proven absent from the Send path |
| Pagination (50/page) | DISPLAY_ONLY | no — Send reads the unpaged set |

**STOP — authority gap, not repaired.** `handleSendRequest` builds its workset from
`_applyRequestOrderFilters`, which filters by Category tab, Risk and SKU search. By the repo's own scope rule
those three are display-only, so a comprehensive ALL/T1/T2/T3 Send is being silently truncated by them. I did
**not** widen the workset: doing so would make a Send write **more** rows than any previous Send, which is a
business decision, not a bug fix. Instead the confirmation summary now reports
`removed_by_display_filters`, so the truncation is visible before any write.

**Decision required:** should Category tab / Risk / SKU search be excluded from the Send workset (making
ALL/T1/T2/T3 genuinely comprehensive)?

## IV. Interrupted Send Request — reconcile before retry

`TEMP_REQUEST_ORDER_SEND_RECONCILE` / `system.requestOrderSendReconcile` (read-only). A stopped saga is never
assumed to be a zero-write. It reports draft statuses, `site_confirmed`/`submitted` transitions, Request Orders
and their line/source counts, duplicate primary keys and execution keys, headers with no lines, advanced drafts
with no lines, the safe resume point, and whether a retry is safe.

Retry is unsafe **only** for a duplicated identity or a header with no lines; everything else converges, because
draft ids are deterministic (find-or-update) and Request Orders are keyed by an execution key that is reused.

## V. PO document failure — root cause was the client discarding the cause

13_ already answered a blocked document with a rich envelope (`stage`, `document_stage`, `document_generation`
with reason / missing[] / configuration_required) — and `purchase-order-overview.js` already had a branch to
render it. But `updatePurchaseOrderStatus` signals failure with `throw new Error(json.error)`, which reduced the
whole envelope to its one generic sentence. The resolve-path branch was therefore unreachable, and the page fell
to `.catch()` → **"Send PO failed: … could not be produced."** — exactly what the user saw.

The envelope is now attached to the thrown Error and rendered from the rejection path: blocking stage, reason
code, template error, unresolved required placeholders, Drive reason, whether it is a configuration problem,
whether retry can help, and a pointer to `TEMP_DOCUMENT_DIAGNOSE_PURCHASE_ORDER`. **The hard document gate is
unchanged** — the PO stays Draft, no status is written, no document row is created, no email is sent.

## VI. Not done, and why

- **§G server orchestration endpoint — NOT implemented.** It requires a new server saga that re-validates a
  frozen workset, calls the canonical cores, read-after-write verifies every header and line, and resumes by
  execution key. Building that safely is a larger change than everything else here combined, and a half-built
  orchestration endpoint is more dangerous than the current client saga, which is at least idempotent and now
  reconcilable. The serial client saga therefore remains, with its latch, phases, frozen workset, single write
  batch and reconciliation diagnostic. **Recommended next task.**
- **Full read-after-write quantity barrier (addendum §1) — PARTIAL.** Each write must return a persisted id, and
  a failed write blocks the transition. What is **not** implemented is a scoped re-read verifying that every
  persisted quantity equals the intended quantity. Doing it per draft would add N more round trips; it belongs
  in the §G orchestration endpoint, where it is one bounded verification pass.
- **§H AI Plan read timeout — diagnosed, not repaired.** The 45 s expiry is now a terminal `REQUEST_TIMEOUT`
  that cannot silently become success, and Send Request does not depend on a fresh AI Plan read (it uses the
  page model already loaded, then writes). The underlying payload size was not measured — that needs a live run
  — and no include-gated slim API was added for it.
- **Site Inventory station-scope revalidation (addendum §6) — NOT added server-side.** Submit already sends only
  persisted draft ids for the applied Country + Marketplace, but the server does not yet re-reject a mixed-site
  payload. Reported, not silently assumed.
