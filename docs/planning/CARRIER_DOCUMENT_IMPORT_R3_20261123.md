# Carrier Documents And Import Templates R3

Release: `r6.10.3-carrier-import-r3`. Owner-authorized GitHub push; Apps Script
deployment remains manual. No live business, registry, template or Drive writes.

## Confirmed Causes

- SINOTRANS shipment SH-D4DA9454-E: the failed class is commercial invoice, not
  packing list. The registry recorded DOCUMENT_CONFIGURATION_REQUIRED. Its 40
  actual saved fields reproduce a missing source, pricing_list.auto_regular_price.
  This legacy source now aliases the frozen effective regular_price. The existing
  current_marketplace_price provenance guard still requires AUTO or OVERRIDE;
  no live price lookup, zero substitution or declaration-price change was added.
- TOP SEALAND SH-822667AD-1: there was NO selected rate card. Its earlier explicit
  cost-pending approval stored Truck and the final snapshot faithfully froze Truck.
  Matching raw method truck in a rate-card screenshot does not mean that quote was
  selected or eligible for LBA5. New unpriced approvals and new snapshots use a
  unique active service label for the carrier, method, last mile and destination
  country independently of quote eligibility. Conflicting labels are not guessed;
  the existing generic method label is retained. Prices/card IDs are not applied.
- Merged shipments: a missing exact-site product URL now falls back deterministically
  to a valid HTTP(S) URL for the SAME SKU. Exact valid URLs win. The source site/id
  is encoded in regional_ref. Marketplace IDs retain exact-site authority and do
  not inherit this permission. No price, currency, tax or ASIN fallback was added.
- Import files: only the initial 50 blank rows had unlocked cells. The three batch
  domains and legacy factory/overseas templates now prepare at least 200 blank rows
  and set editable-column defaults, so input remains unlocked beyond that area.
  Headers, examples, IDs, versions and conditionally editable system columns remain
  locked; the existing row-specific exception is retained. Dropdowns cover prepared
  rows. Beyond those rows the server still validates values; no million-cell
  validation range or million-row materialization is added.
- Shipment document retry was additionally trapped behind a disabled Sandbox-only
  experiment. The shipment-only retry now requires a dispatched status and an
  existing final frozen snapshot, reuses successful documents and generates only
  missing/failed classes. It does not call dispatch, deduction, receipt or snapshot
  revision. PO retry permissions are not expanded. Configuration failures expose
  the manual Retry action; unresolved configuration still fails, never fabricates.
  New failed registry notes include the exact reason/missing fields.

## Manual Install

Prerequisite: DW2 release-4. Package:
`output/carrier-document-r3-20261123/release-1`.

Copy complete files from the CORRECT environment's `candidate/<environment>/apps-script`:

1. 12_shipment_handlers.gs
2. 34_shipment_final_output_handlers.gs
3. 36_document_template_handlers.gs
4. 37_shipment_document_file_renderer.gs (unchanged R2, carried cumulatively)
5. 39_document_runtime_service.gs

All five: APPS_SCRIPT_SYNC_REQUIRED. Save and update the existing Web App to a new
deployment version. Preserve its endpoint, authority, manifest, router/profile and
existing module stamps. No 00_config, 84_, 90_ or whole-directory sync. Hashes, not
unchanged health stamps, identify this hotfix. Sandbox retains its own reader.

FRONTEND_GITHUB_PAGES_REQUIRED: index.html; assets/js/app.js;
assets/js/pages/{factory-stock,overseas-stock,purchase-order-list,shipping-history}.js;
assets/js/utils/{import-batch,template-export,po-factory-import}.js.
Changed loader URLs invalidate the relevant cached scripts. Do not install the
Production site's environment config into Sandbox; this is a frontend delta only.

BUNDLE_REBUILD_REQUIRED: NO. Router/profile/manifest/schema changes: NONE.
Tests, fixtures and build tools: GIT_ONLY. This report/ledger: DOCUMENTATION_ONLY.

## Owner Acceptance

1. Refresh the published frontend after Pages completes; download NEW templates.
   Old downloaded files still contain their old protection and are not retroactive.
2. On the already shipped SINOTRANS ticket, use document Retry only. Expect the
   existing detail/PL files reused and the missing CI generated. Do NOT dispatch
   again. Check Sheet/PDF prices, address, carton range, totals and employee access.
3. On an unshipped merged ticket, run both read-only diagnostics before intentionally
   dispatching. URL may be sourced from another site of that SKU; IDs/taxes remain
   site-specific. Compare quantities before and after physical-SKU projection.
4. On a NEW TOP SEALAND snapshot without quote, confirm the service is the consistent
   carrier label (truck/parcel/UK -> the configured Chinese service). Already issued
   SH-822667AD-1 stays Truck: retry preserves history. Correcting that issued file
   needs a separately controlled document revision, NOT a second shipment/dispatch.
5. Test 200+ rows in Add/New and Update/SET modes for all three domains. This change
   removes the Excel input-area boundary, not batch safety limits: PO 1000 rows,
   inventory 2000 rows, shipment 2000 rows total across Header + Lines. Validation,
   scope, versions, idempotency and reservation guards remain authoritative.
6. Unknown outcomes: read the batch/shipment state; never replay dispatch/import.

## Verification Scope

New R3 suite: 17 cases, including the actual 40-field SINOTRANS mapping/token matrix,
physical header/repeated token fill, price-provenance negatives, same-SKU URL rules,
immutable history, service ambiguity and document-only retry refusal/delegation.
Import suite: six domain/mode combinations, 250-row XLSX write/read/parser roundtrip,
rows 53/202/203/500/5000 editable, system IDs and row exceptions preserved.
Chrome: actual PO adapter/dialog download at 1440 and 390 pixels, screenshots,
no horizontal overflow/runtime exceptions. Synthetic API/Drive only.
R2 27, R1 24, DW2 40, Submit 6, inventory warehouse safety 28 also pass.
Both environment overlays are separately syntax/hash/regression checked.

Two OLD import slice harnesses are not green and fail identically on the unmodified
HEAD baseline: factory-import-template-scope-and-done-f1-7n-r1 misses _fiiImportUi_;
overseas-inventory-scoped-import-f1-ux-r1 has one stale runOverseasImport assertion
(51 pass / 1 fail). No whole-repository green or live Apps Script acceptance claim.
Generated bundle equivalence remains unchanged (60 modules); no bundle rewrite.

## Database Cleanup: NO-GO For The Proposed Partial Delete

Read-only inspection of the actual DB found 112 factory balances, 139 factory
movements, 260 overseas balances, 11 overseas movements, 28 shipping plans,
44 plan lines, 40 shipment lines, 10 shipment-PO allocations, 8 PO headers and
48 PO lines. Six factory balances still hold 2040 reserved units in total; five
overseas balances have reservations. There are 24 request-order-line references
to PO lines, 7 PO headers linked to requests, and 40 PO-line request references.
Six import batches are COMMITTED with 232 audit-change rows. These are linked
business records, not proof that every row is disposable test data.

Deleting only shipment/stock/PO headline tables is NOT safe. It would leave orphan
allocations, stale availability/reservations, dangling request references and
idempotency receipts claiming that now-deleted data was already imported.
No data was deleted or reset in this task. Do not delete sheets or header rows.

Before any separately approved reset:

1. Freeze writes, close old browser drafts, take a FULL native DB copy and retain
   the current deployment/config plus the generated-document folders. Verify that
   the backup opens. The new invoice template link is NOT a database backup.
2. Classify test versus real rows and approve an explicit ID/table manifest. Keep
   masters/config: warehouses, locations, parties, SKU/regional/pricing/tax data,
   carriers/rates, route templates/nodes, document templates/fields, auth/policy.
   Backup/legacy request tabs are not the active reset target.
3. Clear children BEFORE parents within the approved test set: generated_documents
   references and final-output line_pos/lines before snapshot headers; shipment
   events/routes/revision rows; shipment_line_allocations and shipment_plan_links;
   shipment_lines before shipments; shipping_plan_lines before shipping_plans;
   shipping_allocation_draft_lines before their drafts. Include matching request
   PO links/line sources/draft lines and request-order lines/headers OR explicitly
   reconcile retained requests' PO references. Retaining those links blocks reset.
4. Stock ledgers/balances and PO lines/headers must be reset coherently with those
   dependencies, including factory_stock_allocation_plans, overseas allocations,
   inbound/outbound/receipt state if present. The inspected receipt/receipt-line
   and outbound-allocation tables are empty, not permission to ignore future rows.
   Never use deletion as an inventory reversal while retaining the other half.
5. Archive the approved test import_batches/import_batch_changes together with
   their effects; do not leave successful receipts pointing at deleted rows. Never
   delete an uncertain batch to make it replayable. Start fresh batch IDs for live
   imports and preserve audit history in the backup. Do not blindly clear caches,
   Script Properties or environment bindings as a substitute for reconciliation.
6. Re-import into the cleared SAME DB only after zero-orphan/zero-reservation checks.
   Establish one cut-off. Choose EITHER PO NEW_RECEIPT (adds both PO + stock) OR
   factory SET then OPENING_PO_FOR_EXISTING_STOCK coverage; do not add both stock
   paths for the same goods. Overseas opening balances use SET, not ADD replay.
   Opening shipment ADD_NEW represents goods already departed, not a new dispatch:
   server assigns COUNTED for overseas 3PL, DISPLAY_ONLY for FBA. Reconcile its
   remaining quantities/cut-off against overseas/FBA snapshots to avoid duplicate
   in-transit supply; do not Confirm these imported historical shipments again.
7. Validate every import preview and receipt/readback; reconcile stock, open PO
   coverage, in-transit supply and reservations before reopening writes. Regenerate
   planning drafts last. A new DB ID additionally requires a reviewed binding/profile
   deployment; do not simply change the production constant or copy a spreadsheet.

Conclusion: a backed-up, dependency-closed TEST reset can be planned, but the user's
stated limited deletion is not currently safe. This report is an assessment and
checklist, not an executable reset or an authorization to delete request/audit data.
