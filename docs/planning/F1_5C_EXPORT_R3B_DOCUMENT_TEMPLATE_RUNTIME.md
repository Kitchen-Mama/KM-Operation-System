# F1-5C-EXPORT-R3B — Document Template / Field Mapping / Generated Document Runtime Foundation

**Outcome: IMPLEMENTED.** Closes the three R3A HALT gaps by implementing the FROZEN
`document_templates` / `document_template_fields` / `generated_documents` runtime, a deterministic template resolver,
a snapshot-only placeholder mapper, and an idempotent generated-document lifecycle. No renderer rewrite, no second
engine, no Export Center UI, no binary file generation (deferred to R3C). Baseline: R2B `72ac18b`, R3A `8a44d5b`.
Owner: [`36_document_template_handlers.gs`](../../assets/specs/active/apps-script/36_document_template_handlers.gs).

## §1 Audit — frozen document specs
`DOCUMENT_GENERATION_SYSTEM_SPEC.md` is the authority. All three tables are **spec-only** at HEAD (0 runtime hits).
Exact frozen schemas adopted verbatim: `document_templates` §C (30 cols), `document_template_fields` §E (23 cols),
`generated_documents` §D (30 cols). Template convention `template_id = TPL-{DOC}-{SCOPE}-V{VERSION}`,
`template_key = {DOC}_{SCOPE}` (language folds into `{SCOPE}` — the canonical §C.1 form; the task's `-{LANG}-` variant
is not the frozen convention). Placeholders `{{UPPERCASE_SNAKE}}` stored **without braces**; mapping owned by
`document_template_fields` (`data_scope` header/line/allocation/total/system/static; `data_source_table`/`_field`/`_path`;
`collection_key`; `field_type` scalar/collection/collection_item/…). Template asset owner **EXISTS**
(`template_file_type` + `template_file_id` + `template_drive_url`) → **no `DOCUMENT_TEMPLATE_ASSET_AUTHORITY_GAP`**.

## Spec-silence resolutions (minimal, non-contradicting — no HALT triggered)
- **Template resolution tie-break** (spec silent): exact-match on `document_type` + active (`status=active` + `is_active` + effective window) + scope; **fail closed on >1** (`DOCUMENT_TEMPLATE_AMBIGUOUS`) — never latest/first (no invented tie-break).
- **`generated_documents` has no `snapshot_id` column** (frozen): snapshot lineage = `related_entity_id` (shipment_id) → the deterministic R2B snapshot `SFO-<shipment_id>` (one active per shipment). No off-spec column added.
- **Idempotency** (spec append-only, no dedupe rule): minimal safe rule — reuse the active generated row for (`related_entity_id`, `document_type`, `template_id`, `template_version`) unless `regenerate:true` (which appends and links via `regenerated_from_document_id`). Retry/two-tab/lost-response converge; deliberate regeneration versions.
- **Language** (scope-only, no selector): treated as a scope filter (unscoped template matches any). Multi-language selection deferred (documented `LANGUAGE_SELECTION_GAP`, not blocking SD/PL).

## §27 Completion report
1. PRE HEAD = `8a44d5b`. 2. POST HEAD = this commit.
3. **Doc spec authority audited** = `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §C/§E/§D/§F/§P (spec-only). 4. **document_templates runtime verdict** = implement frozen schema (new table). 5. **document_templates schema** = the 30 frozen cols (`template_id` … `updated_at`). 6. **document_template_fields runtime verdict** = implement frozen schema. 7. **document_template_fields schema** = the 23 frozen cols (`field_id` … `updated_at`). 8. **generated_documents runtime verdict** = implement frozen schema. 9. **generated_documents schema** = the 30 frozen cols (`document_id` … `updated_at`).
10. **Migration required?** = YES (3 additive tables; USER-run). 11. **Migration owner** = `prodMigrateCreateSheet_` + `KMSAFE.validateMigrationAuthorization` (twins never invoked from `36_`). 12. **Template asset storage authority** = `document_templates.template_file_id` (+ `template_file_type` enum google_doc/google_sheet/xlsx/html/pdf + `template_drive_url`); external Drive file referenced by id (not stored in DB).
13. **Template naming rule** = `TPL-{DOC}-{SCOPE}-V{VERSION}` (`template_id` PK). 14. **template_key rule** = `{DOC}_{SCOPE}` (language in SCOPE). 15. **Template version rule** = `template_version` integer mirroring `V{n}`; copied onto each generated record. 16. **Template scope rule** = `series/sku/supplier_id/factory_id/carrier_id/country/marketplace/language` (blank = unscoped; non-blank must equal request); **no `company` scope column**. 17. **Language rule** = scope filter; unscoped matches any (default). Multi-language selector deferred.
18. **Template resolver owner** = `dtResolveTemplate_` (pure; 0→`DOCUMENT_TEMPLATE_NOT_CONFIGURED`, >1→`DOCUMENT_TEMPLATE_AMBIGUOUS`). 19. **Placeholder mapping owner** = `dtMapPlaceholders_` (pure; scalar + line/allocation collections; reads only the render model). 20. **Required field behavior** = required + unresolved → `DOCUMENT_REQUIRED_FIELD_MISSING` with {document_type, template_id, placeholder, source_field/path}; no fabricated N/A. 21. **Optional field behavior** = blank allowed; `default_value` (present-but-empty) / `fallback_rule` (missing) honored per the field row.
22. **Generated-document owner** = `handleShipmentDocumentGenerate_` (+ get/list) writing `generated_documents`. 23. **Generated-document identity/idempotency** = reuse active row by (related_entity_id, document_type, template_id, template_version); `regenerate:true` appends a linked version. 24. **Generated-document lifecycle** = `status` ∈ frozen enum (`generated`/`regenerated`/…); R3B writes `generated` (mapping produced) / `regenerated`; file fields blank (R3C). 25. **Template version lineage** = `template_version` copied at generation (immutable even if template later changes). 26. **Snapshot lineage** = `related_entity_id` → shipment → deterministic `SFO-<shipment_id>` snapshot (immutable).
27. **Shipping Detail persisted runtime** = `shipmentDocument.generate {document_type:'SHIPDETAIL'}` → `shipment_detail` template → mapped → generated record. 28. **Packing List persisted runtime** = same with `PL` → `packing_list`. 29. **CI readiness** = eligible ONLY where a `commercial_invoice` template + all required fields exist; renderer/CI family not implemented in R3B (deferred). 30. **Booking readiness** = requires carrier-scoped `carrier_booking_form` templates (deferred; scope model supports it). 31. **Customs readiness** = `LEGAL_IMPORTER_AUTHORITY_GAP` (deferred). 32. **Legal importer behavior** = unchanged; never fabricated; does NOT block SD/PL (the document runtime never consults it for SHIPDETAIL/PL).
33. **Renderer owner** = R3A `35_` (unchanged; reused). 34. **Proof renderer unchanged as factual authority** = `36_` calls `docRenderShippingDetail_`/`docRenderPackingList_`/`docReadSnapshot_`; defines no render logic (guard Y). 35. **Proof no live master re-resolution** = `36_` references no master/PO/shipment table and no factual resolver (guards N/O). 36. **Physical qty proof** = mapped `QTY` = model `shipment_qty` = snapshot `shipment_qty` (guard G). 37. **Multi-PO proof** = `PO_ALLOCATIONS` allocation collection preserves every PO (guard H). 38. **GS1 proof** = `GS1_CODE` from model; `UPC` field = `units_per_carton` (distinct) (guards I/J). 39. **Factory/company independence** = mapper reads frozen model values only; no inference (structural).
40. **APIs added** = `documentTemplate.list`, `documentTemplate.getFields`, `shipmentDocument.generate`, `shipmentDocument.get`, `shipmentDocument.list`. 41. **Files changed** = `36_document_template_handlers.gs` (NEW), `01_router.gs` (+5 actions), `document-template-runtime-f1-5c-export-r3b.test.js` (NEW), `final-output-seam-audit-f1-5c-export-r1.test.js` (§K re-pointed to file-renderer primitives), this doc.
42. **Tests** = 1 new (63 assertions A–Z). 43. **Focused results** = R3B 63/63; R1 23/23; production-safety 85/85. 44. **Full regression** = **203 pass / 4 known baseline**.
45. **Apps Script sync** = YES (`36_` + `01_router.gs`). 46. **Frontend deploy** = NO. 47. **Bundle rebuild** = NO.
48. **DB/schema impact** = 3 new tables (USER migration); no existing table changed. 49. **USER migration steps** = sync `36_` + `01_router.gs` → run `r3bCreateDocumentTables('<backup>')` once → seed `document_templates` (SHIPDETAIL/PL, `template_file_id` blank until real Drive file) + `document_template_fields` (mapping skeleton below) → delete the temp fn. 50. **Template seed requirements** = below (deterministic skeletons; no fabricated file ids).
51. **Formula impact** = NONE. 52. **Inventory impact** = NONE. 53. **PO impact** = NONE. 54. **Shipment impact** = NONE (reads only).
55. **Commit hash** = chat. 56. **USER live verification** = after migration + seed + a finalized snapshot: `shipmentDocument.generate {shipment_id, document_type:'SHIPDETAIL'}` → `{document_id, placeholder_values, status:'generated'}`; re-run → `{reused:true, same document_id}`; `{document_type:'PL'}` → PL; `shipmentDocument.list {shipment_id}` → records; edit a master then regenerate → placeholder values unchanged (frozen snapshot). 57. **Remaining gaps** = binary file/PDF generation + template file assets (R3C); CI/Booking/Customs renderers; Export Center UI; `LANGUAGE_SELECTION_GAP` (multi-language); `LEGAL_IMPORTER_AUTHORITY_GAP` (customs). 58. **Next authorized slice** = **F1-5C-EXPORT-R3C** — actual file generation/download (SHIPDETAIL/PL from `template_file_id`), generated-document file storage, CI where READY, carrier-specific Booking, Export Center UI orchestration over these owners. Then `F1-PHASE1-E2E-FINAL` (NOT authorized in R3B/R3C).

## USER migration (run once, then delete — NOT committed)
```javascript
function r3bCreateDocumentTables(backupReference) {
  if (!backupReference) throw new Error('backupReference required.');
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var plan = [
    { name: 'document_templates', headers: DOCUMENT_TEMPLATES_HEADERS_ },
    { name: 'document_template_fields', headers: DOCUMENT_TEMPLATE_FIELDS_HEADERS_ },
    { name: 'generated_documents', headers: GENERATED_DOCUMENTS_HEADERS_ }
  ];
  var made = [];
  plan.forEach(function (p) {
    if (ss.getSheetByName(p.name)) { made.push(p.name + ' (exists — skipped)'); return; }
    prodMigrateCreateSheet_(ss, p.name, p.headers, {
      migrationId: 'F1-5C-EXPORT-R3B-' + p.name + '-create', expectedSpreadsheetId: prodExpectedDbId_(),
      expectedSheetName: p.name, expectedOldHeaderHash: KMSAFE.headerHash([]), expectedNewHeaderHash: KMSAFE.headerHash(p.headers),
      backupReference: String(backupReference), execute: true, actor: Session.getActiveUser().getEmail()
    });
    made.push(p.name + ' (' + p.headers.length + ' cols)');
  });
  return made.join('; ');
}
```

## Template seed skeleton (deterministic; `template_file_id` left blank for the USER)
**document_templates** (2 rows):
- `TPL-SHIPDETAIL-STANDARD-V1` · `SHIPDETAIL_STANDARD` · document_type `shipment_detail` · status `active` · is_active TRUE · template_version 1 · scope all blank · `template_file_type`/`template_file_id`/`template_drive_url` blank (fill when the real template file exists).
- `TPL-PL-STANDARD-V1` · `PL_STANDARD` · document_type `packing_list` · status `active` · is_active TRUE · template_version 1 · scope blank · file refs blank.

**document_template_fields** (SHIPDETAIL_STANDARD — representative canonical mapping; placeholder → render-model source):
| placeholder | field_type | data_scope | data_source_path / _field | collection_key | required |
|---|---|---|---|---|---|
| SHIPMENT_NO | scalar | header | header.shipment_no | | TRUE |
| DISPATCH_DATE | scalar | header | header.dispatch_date | | |
| SHIPPER_NAME | scalar | header | header.shipper.legal_name | | TRUE |
| SHIPPER_ADDRESS | scalar | header | header.shipper.address.line1 | | |
| CONSIGNEE_NAME | scalar | header | header.consignee.name | | TRUE |
| CONSIGNEE_ADDRESS | scalar | header | header.consignee.address.line1 | | |
| CARRIER | scalar | header | header.carrier_name | | |
| TOTAL_QTY | scalar | total | header.totals.qty | | |
| LINE_ITEMS | collection | line | | LI | |
| SKU | collection_item | line | sku | LI | TRUE |
| PRODUCT_NAME | collection_item | line | product_name_en | LI | |
| QTY | collection_item | line | shipment_qty | LI | TRUE |
| UPC | collection_item | line | units_per_carton | LI | |
| GS1_CODE | collection_item | line | gs1_code | LI | |
| HS_CODE | collection_item | line | hs_code | LI | |
| COO | collection_item | line | country_of_origin | LI | |
| DECLARED_VALUE | collection_item | line | declared_total_value | LI | |
| PO_ALLOCATIONS | collection | allocation | | PA | |
| PO_NO | collection_item | allocation | po_no | PA | |
| ALLOC_QTY | collection_item | allocation | allocated_qty | PA | |

**PL_STANDARD** — the physical/logistics subset (SHIPMENT_NO, shipper/consignee, TOTAL_*, LINE_ITEMS{SKU,PRODUCT_NAME,QTY,carton_qty,gross/net_weight,cbm}, PO_ALLOCATIONS); no declared value / HS / GS1.

## §28 FINAL GATE
one document-template authority ✓ · one field-mapping authority ✓ · one generated-document authority ✓ · R3A renderer
remains the factual presentation owner ✓ · R2B snapshot remains the factual data owner ✓ · mapping contains no
business recompute ✓ · document runtime queries no live masters ✓ · physical qty preserved ✓ · multi-PO preserved ✓ ·
GS1 preserved ✓ · factory ⇎ company ✓ · generated docs link to immutable snapshot ✓ · link to exact template version ✓ ·
generation retry/two-tab/lost-response safe ✓ · SHIPDETAIL + PL work through the runtime ✓ · customs gap does not
block SD/PL ✓ · no second template engine ✓ · no second renderer ✓ · no upstream execution changes ✓ · no unrelated
refactor ✓.

**STOP after R3B.** Actual file generation/download, CI/Booking/Customs families, generated-document file storage,
and the Export Center UI are NOT started — R3C is defined, not begun. `F1-PHASE1-E2E-FINAL` is NOT authorized.
