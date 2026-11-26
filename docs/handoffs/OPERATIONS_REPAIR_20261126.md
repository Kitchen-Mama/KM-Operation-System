# Operations Repair / 2026-11-26

## Deployment

Base: a753b9ab0a25e851102b7360b87a8a312db17846. The user supplied an authenticated live deployment-contract response: stable /exec, no missing actions, no stale or absent required modules, uniform deployment. Live Send owner is R64. Do not replace it with the older local 66_ source.

The subsequent live read returned requestOrder workspace success, purchase_setup_version=1, and successful NEW_RECEIPT po_factory_stock template retrieval with quantity, ordered_qty and unproduced_qty. These prove version/capability readiness, not a completed live business transaction.

The GitHub Pages frontend is published separately from Apps Script. Replace ALL FOUR files from this package in the existing GAS project, then update the EXISTING production Web App deployment to a new version, retaining its /exec URL:

1. 01_router.gs
2. 02_core_sheet_db.gs
3. 17b_carrier_rate_card_maintenance.gs
4. 63_api_v1_system_health.gs

No schema migration, new Sheets columns, config/auth replacement, business-data backfill, or generated core bundle update is needed. 02_ and 17b_ are both mandatory: the former emits the exact row fingerprint; the latter validates it. Updated router/health pins reject partial installation. The new frontend explicitly accepts the verified prior policy for existing actions while this deployment is pending. Carrier Save Prices refuses locally until the new fingerprint is available; it never force-overwrites rates.

After deployment refresh the browser, run the existing read-only deployment probe again, and confirm no missing/stale modules. Refresh the rate dialog before editing.

## Changes And Definitions

- Carrier maintenance: preserve the raw Sheets row as an opaque SHA-256 edit version. Display-date normalization can no longer manufacture EDIT_CONFLICT. A real concurrent change to any rate field still refuses the entire price batch before writing. No automatic retry of an uncertain write.
- Edit Draft SKUs: mixed-carton member options include the site's active unique SKU catalogue, not just existing card rows. New cartons default to Add extra quantities. A40+B40 plus an extra mixed A5+C3 saves A45+B40+C3, retaining the two ordinary cartons and adding one mixed carton. Uncheck the extra option to pack part of existing quantities instead. Existing saved groups already belong to saved quantities and are not added again.
- DB handoff: same source/site, factory availability, version guards, journal, repricing and reservation ownership remain enforced. Foreign-site/inactive/ambiguous SKUs are not admitted merely because they are in a mixed carton.
- Factory shipment detail: every SKU portion remains visible, mixed members stay together, the physical carton belongs to the group once, not once per SKU. Ordinary remainder and multiple cartons can repeat a SKU in distinct packing blocks.
- Customs/forwarder models: same-Series members can use a representative SKU with total pieces and actual summed declared amount. Different Series remain separate rows with the same carton sequence and one physical-carton total. Incompatible HS/origin/currency facts are also kept separate; they must not be hidden under one customs representative. Outer-box specifications come from the representative SKU.
- Per-piece cost is display-only at one decimal, including separate original-currency amounts. Stored costs and total-price precision are unchanged.
- Special Event uses its original standard modal, existing-event picker, group cards and calculations: Growth, Adjust percent, Adjust fixed amount, Manual. Promotion Type is required for new campaigns; existing saved identities are preserved. Add Promotion remains independently Manual / Apply previous campaign, with global discount/growth and per-SKU edits.
- Both creation surfaces use the canonical campaign -> campaign_sku_lines -> linked fc_special_events save service. Normal creates period FC as well. Site Inventory consumes the linked period FC once, not a second campaign forecast copy. Same SKU/date overlap is refused.
- Both modals are centered with the full application CSS. Standard Special Event hidden rows remain hidden. Discount controls are aligned. Desktop/mobile browser tests cover the actual page scripts and styles, not only isolated markup.

## Zero-Stock Pending Production Import

Use PO Factory Stock / NEW_RECEIPT, with a NEW PO number and the correct factory warehouse/company/SKU. For a wholly unproduced order of 1000 units:

| Field | Value |
|---|---:|
| quantity | 0 |
| ordered_qty | 1000 |
| unproduced_qty | 1000 |

Supply transaction_id, currency, order_date and other template-required fields. Leave generated purchase_order_line_id and row_version blank for new lines. Do not reuse an existing line ID to fabricate a new order. Import preview must state zero stock receipt and 1000 pending production. Commit creates an issued, receivable PO, not an unapproved Draft; it does not add factory stock or fake a receipt. Later actual receipt increases completed and physical stock once. The import does not recreate Request Order approval or generate a new Draft PO document: use the normal order chain when those steps are required.

If unproduced_qty is LESS than ordered_qty while quantity=0, the difference represents historical consumed production. For a brand-new fully pending order, keep ordered_qty=unproduced_qty; do not enter a smaller number accidentally.

## Previously Imported Overseas Incoming

Do NOT manually add wh_on_the_way_qty to compensate for a linked Shipment. The deployed 70_/88_ warehouse workspace derives incoming from the canonical Shipment's remaining quantity and destination warehouse. It does not backfill that snapshot cell. A zero stored snapshot value alone does not prove the UI incoming is absent.

For an imported, genuinely in-transit Shipment with zero displayed incoming, inspect destination warehouse/company binding, SKU, incoming status and remaining/received quantities. Repair the authoritative import/route/receipt mapping through the existing supported flow; do not reimport a second shipment or add a free-standing snapshot counter. The recognized incoming statuses include shipped, in_transit, arrived, delivered and partial_received/partially_received. Draft/ready_to_ship is not dispatched incoming. Canonical receipt reduces remaining incoming; a manually entered snapshot amount has no guaranteed linkage or automatic deduction.

Factory In Production derives ordered minus completed for eligible issued/open POs. Pending Shipout is stock reserved for draft/ready_to_ship Shipments, displayed separately and not deducted twice from Current Stock.

## Verification

All checks below ran locally against actual implementation functions with bounded in-memory Sheets/Drive boundaries, or headless Chrome. No live PO, Shipment, receipt, stock adjustment, campaign, or rate was created/changed by this verification.

- Order chain, setup, documents, rollback and PO Factory Stock pending-production: 146 tests passed.
- Carrier maintenance: 18 checks, including actual generic reader with native Sheets Date cells, stale full-row fingerprint, and zero-write refusals.
- Policy/current hash, prior-policy compatibility, core/writer health pins, cost formatting and extra quantity reconciliation: 25 tests passed.
- Campaign core/service: 22 tests, including Normal, overlap refusal, three-table rollback, receipt replay and actual Site Inventory daily projection consumption.
- Mixed packing core: 23 tests; command: 11; additional-site-SKU handoff/document models: 4.
- Browser: mixed packing 42 assertions; standard Special Event/restored calculations, Promotion separation and lost-save-ack reconciliation 55 assertions; Promotion builder 24 assertions.
- Original forecast regression suites: 105, 56, 113 and 98 assertions passed, with their mutation checks.
- Published generated core bundle executable AST and runtime identity match all 64 source modules; no bundle rewrite.

## Live Acceptance Still Required

1. After the four-file GAS deployment, refresh rates, edit ONE intended price, save once, reload and confirm the value. Another user changing the same rate must still produce a true conflict.
2. Use a small real PO or approved test order: request -> approval -> quote -> PO -> document -> partial/full receipt. Alternatively verify the import example through Preview before intentionally committing it. Live business writes were not performed here.
3. In a Draft card add a site SKU absent from the card as extra mixed packing. Verify total SKU quantities, physical boxes, pricing, submission, approval and Shipment reservation before dispatch.
4. Generate the actual configured factory/customs/forwarder files and inspect their final PDFs/workbooks. Tests cover real document models and the render boundary, not the live Drive template export. Do not claim final production PDF acceptance until this step is completed.
5. Create non-overlapping Normal promotions from both surfaces; confirm Campaign and period FC, refresh Site Inventory and inspect its event demand. Existing-event edits should preserve their IDs/versions.

Automated verification reduces risk; it is not a guarantee of zero defects or a substitute for the controlled live acceptance above.
