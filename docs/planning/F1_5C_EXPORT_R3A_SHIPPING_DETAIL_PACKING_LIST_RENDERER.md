# F1-5C-EXPORT-R3A — Final-Output Snapshot → Shipping Detail / Packing List Renderer Foundation

**Outcome: IMPLEMENTED (renderer foundation) + PARTIAL HALT (persisted document layer).** Builds the first
document-output layer as a **presentation-only** renderer over the frozen R2B snapshot, for Shipping Detail
(SHIPDETAIL) and Packing List (PL). It reads ONLY `shipment_final_output_snapshots` / `_lines` / `_line_pos` — never
live masters, never recomputing a business fact. **HALTs** on the persisted document layer (`document_templates` /
`document_template_fields` / `generated_documents` are all spec-only). Baseline: R2B `72ac18b`. Owner:
[`35_shipment_document_renderer.gs`](../../assets/specs/active/apps-script/35_shipment_document_renderer.gs).

## §2 Audit — existing document architecture
- **A. Runtime tables:** NONE. `document_templates`, `document_template_fields`, `generated_documents` have **zero** runtime hits in `.gs`/`.js` (only spec docs + `presentation/js/i18n.js`). Confirmed at HEAD.
- **B. Template management UI/runtime:** NONE (spec-only; planned "Master Data Center → Template Management").
- **C. Renderer:** NONE existed. R3A adds the first.
- **D. Document lifecycle vocabulary (frozen in spec):** `generated_documents` = append-only output log; a generated document is an "immutable snapshot at generation time" (DOC-GEN §P.7).
- **E. Placeholder mapping architecture (frozen in spec):** `document_template_fields` owns placeholder→source mapping; placeholder stored WITHOUT braces; template_id = `TPL-{DOC}-{SCOPE}-V{VERSION}`, template_key = `{DOC}_{SCOPE}` (language folds into SCOPE — the canonical DOC-GEN §C.1 form; the R3A prompt's `-{LANG}-` variant is not the frozen convention). **Not implemented** (no rows, no reader).
- **F. Shipping Detail / Packing List templates:** field vocabulary frozen in `SHIPMENT_CENTER_SPEC §20` (Header/Line/Total) + DOC-GEN §I.1.2 (allocation grain). No template FILE exists.
- **G. Intended output format:** Google-Sheet/PDF/XLSX per DOC-GEN — deferred (renderer emits a data model; file generation is R3B+).
- **H./I. generated_documents runtime owner / any code writing rendered docs:** NONE.

## Verdict
The renderer's authority — the frozen R2B snapshot — **is proven**, so the presentation-only renderer foundation is
built. The persisted document layer's authority is **absent** (spec-only), so it is **HALTed**, not invented.

## §14 HALT — reported gaps (NOT built in R3A; smallest additive proposals for R3B)
1. **`GENERATED_DOCUMENT_RUNTIME_SCHEMA_GAP`** — no `generated_documents` table/owner. *Smallest proposal (R3B):* one additive sheet `generated_documents` (DOC-GEN §134-158 grain: `document_id` PK, `template_id`/`template_key`/`template_version`, `related_entity_type`+`related_entity_id`=shipment, `snapshot_id`+`snapshot_version` (lineage), `document_type`, `status`, `file_id`/`file_url`, `regenerated_from_document_id`, audit) via `prodMigrateCreateSheet_` (USER migration).
2. **`DOCUMENT_TEMPLATE_RUNTIME_SCHEMA_GAP`** — no `document_templates` registry. *Smallest proposal:* additive `document_templates` (DOC-GEN §68-99) seeded `TPL-SHIPDETAIL-STANDARD-V1` / `TPL-PL-STANDARD-V1`.
3. **`DOCUMENT_TEMPLATE_FIELD_MAPPING_GAP`** — no `document_template_fields` mapping, so R3A cannot drive placeholder→field mapping (§8). The renderer therefore emits a **canonical data-model** keyed by field names (not placeholders); mapping those to a template's `{{PLACEHOLDER}}`s is R3B once `document_template_fields` is live.

These three are ONE decision (the persisted document engine). R3A does not approximate them.

## §16 Completion report
1. PRE HEAD = `72ac18b`. 2. POST HEAD = this commit.
3. **Existing document architecture** = spec-only (see §2). 4. **Runtime tables found** = none of the doc-layer tables. 5. **Template owner** = none (spec `document_templates`). 6. **Template-field owner** = none (spec `document_template_fields`). 7. **Generated-document owner** = none (spec `generated_documents`).
8. **Renderer owner** = `35_shipment_document_renderer.gs` (`docRenderShippingDetail_` / `docRenderPackingList_`, pure). 9. **Shipping Detail template authority** = SHIPMENT_CENTER_SPEC §20 + DOC-GEN §I.1 (field vocabulary; adopted as the data model). 10. **Packing List template authority** = same §20 (physical/logistics subset).
11. **Final-output read owner** = the R2B snapshot tables, read by `docReadSnapshot_` (thin; snapshot-only). 12. **Proof renderer uses snapshot only** = no master resolver / no live table referenced (guard N); input is the persisted snapshot DTO (guard M: deterministic pure fn).
13. **Shipping Detail field lineage** = table below. 14. **Packing List field lineage** = table below.
15. **Multi-PO handling** = per-line `po_allocations[]` from `shipment_final_output_line_pos` (never collapsed; header `po_numbers` = distinct list). 16. **GS1 handling** = `gs1_code`/`gs1_type` from snapshot line (frozen). 17. **units_per_carton handling** = separate snapshot field (NOT GS1). 18. **shipper handling** = frozen snapshot header (`shipper_*`). 19. **consignee handling** = frozen snapshot header (`consignee_*`). 20. **factory handling** = frozen snapshot header (`factory_id`/`factory_name`); never determines company.
21. **Idempotency owner** = the render API is a pure read/transform (same snapshot → same model); PERSISTED-document idempotency belongs to the HALTed `generated_documents` layer (deferred). 22. **Generated-document lifecycle** = not created in R3A (HALTed). 23. **Readiness behavior** = SD gated on `shipping_detail`, PL on `packing_list`; blocked → fail closed with exact reason. 24. **Blocked-document behavior** = `{ ok:false, blocked:true, reason }`; a blank required frozen field → `FINAL_OUTPUT_REQUIRED_FIELD_GAP` + field name. 25. **Legal-importer behavior** = untouched; `customs` stays BLOCKED (`LEGAL_IMPORTER_AUTHORITY_GAP`) and **does not** block SD/PL.
26. **Files changed** = `35_shipment_document_renderer.gs` (NEW), `01_router.gs` (+1 action), `shipment-document-renderer-f1-5c-export-r3a.test.js` (NEW), this doc.
27. **Tests** = 1 new (37 assertions, A–X). 28. **Focused results** = R3A 37/37. 29. **Full regression** = **202 pass / 4 known baseline**.
30. **Apps Script sync** = YES (`35_` + `01_router.gs`). 31. **Frontend deploy** = NO. 32. **Bundle rebuild** = NO.
33. **DB/schema impact** = NONE (renderer reads existing R2B tables; no new table). 34. **API impact** = 1 new action `renderShipmentDocument`. 35. **Formula impact** = NONE. 36. **Inventory impact** = NONE. 37. **PO impact** = NONE. 38. **Shipment impact** = NONE (reads only).
39. **Commit hash** = chat.
40. **USER live verification** = after R2B tables + a finalized snapshot: POST `renderShipmentDocument {shipment_id, document_type:'SHIPDETAIL'}` → model with header/lines/po_allocations; `{document_type:'PL'}` → packing model; edit a master (company address / GS1 / HS) then re-render → **unchanged** (reads frozen snapshot); a shipment with `customs` BLOCKED still renders SD/PL.
41. **Remaining gaps** = the 3 persisted-layer gaps above (R3B); CI/Booking/Customs renderers (deferred); frontend Shipping-Detail view + Export Center UI (deferred); file (PDF/XLSX) generation (deferred).
42. **Next authorized slice** = **F1-5C-EXPORT-R3B** — close the persisted document layer (additive `document_templates` + `document_template_fields` + `generated_documents`, USER migration), map the R3A model → template placeholders via `document_template_fields`, persist/version generated documents idempotently (by shipment + document_type + template_version + snapshot_version), and expose them to a bounded Export Center. Then CI/Booking/Customs where readiness holds, then full E2E.

## §13 Shipping Detail — field lineage
| OUTPUT FIELD | SNAPSHOT FIELD | ORIGINAL AUTHORITY | REQ/OPT | FORMAT | READY |
|---|---|---|---|---|---|
| shipment_no / dispatch_date / etd / eta | header.shipment_no / dispatch_date / etd / eta | shipments | REQ / OPT | date passthrough | READY |
| company / country / marketplace | header.company / country / marketplace | shipments | REQ | upper | READY |
| shipper {legal_name,address,country,tax_id} | header.shipper_* | company_legal_entities (R2A) | REQ | address join | READY |
| seller_of_record.legal_name | header.seller_of_record_legal_name | company_legal_entities (R2A) | REQ | — | READY |
| consignee {name,address,country} | header.consignee_* | logistics_locations (R2A) | REQ | address join | READY |
| carrier_name / shipping_method | header.carrier_name / shipping_method | carriers / shipments | OPT | — | READY |
| factory {id,name} | header.factory_id / factory_name | warehouses (procurementResolveFactoryId_) | OPT | — | READY |
| po_numbers[] | distinct line_pos.po_no | shipment_final_output_line_pos | OPT | distinct list | READY |
| totals {qty,cartons,gross,net,cbm} | header.shipment_total_* | shipment_lines (frozen) | REQ | number | READY |
| line.sku / site_sku | line.sku / site_sku | sku / marketplace_skus (R2B) | REQ / OPT | — | READY |
| line.product_name_en / _cn | line.product_name_en / _cn | sku_details | OPT | — | READY |
| line.shipment_qty | line.shipment_qty | **shipment_lines.shipment_qty** | REQ | integer | READY |
| line.units_per_carton / carton_qty / carton_no_* | line.units_per_carton / shipment_carton_qty / carton_no_start/end | shipment_lines / sku_details | OPT | integer | READY |
| line.gs1_code / gs1_type | line.gs1_code / gs1_type | sku_details.gs1_code/type | OPT | — | READY |
| line.country_of_origin / hs_code | line.country_of_origin / hs_code | tax_referral_rates | OPT | — | READY |
| line.declared_currency / unit / total | line.declared_currency / declared_unit_value / declared_total_value | tax_referral_rates (total = unit×qty) | OPT | 2dp | READY |
| line.gross/net_weight / cbm / carton_dims | line.gross_weight / net_weight / cbm / carton_length/width/height | shipment_lines / sku_details | OPT | number | READY |
| line.po_allocations[] {po_no,allocated_qty,pol} | line_pos rows for the line | shipment_final_output_line_pos | REQ (multi-PO) | list | READY |

## §14 Packing List — field lineage (physical/logistics subset)
| OUTPUT FIELD | SNAPSHOT FIELD | AUTHORITY | REQ/OPT | READY |
|---|---|---|---|---|
| shipment_no / dispatch_date | header.shipment_no / dispatch_date | shipments | REQ/OPT | READY |
| shipper / consignee blocks | header.shipper_* / consignee_* | R2A | REQ | READY |
| carrier_name / shipping_method | header.carrier_name / shipping_method | carriers / shipments | OPT | READY |
| totals {qty,cartons,gross,net,cbm} | header.shipment_total_* | shipment_lines (frozen) | REQ | READY |
| line.sku / product_name_en | line.sku / product_name_en | sku_details | REQ/OPT | READY |
| line.shipment_qty | line.shipment_qty | **shipment_lines.shipment_qty** | REQ | READY |
| line.units_per_carton / carton_qty / carton_no_* | line.units_per_carton / shipment_carton_qty / carton_no_start/end | shipment_lines | OPT | READY |
| line.gross/net_weight / cbm / carton_dims | line.gross_weight / net_weight / cbm / carton_length/width/height | shipment_lines / sku_details | OPT | READY |
| line.po_allocations[] | line_pos rows | shipment_final_output_line_pos | OPT | READY |
| (declared value / HS / GS1) | — | — | EXCLUDED (commercial; not on Packing List) | — |

## §17 FINAL GATE
one final-output authority ✓ · one document engine (first renderer; no second) ✓ · renderer reads frozen snapshot only ✓ ·
no live master re-resolution ✓ · physical qty = snapshot shipment_qty ✓ · multi-PO lineage preserved ✓ · GS1 authority
preserved (≠ units_per_carton) ✓ · shipper/consignee frozen ✓ · factory ⇎ company ✓ · readiness fails closed ✓ ·
customs gap does not block SD/PL ✓ · document generation idempotent (pure read; persisted layer deferred, not faked) ✓ ·
no second template engine ✓ · no frontend business authority ✓ · upstream AI Plan→RO→PO→Shipment unchanged ✓.

**STOP after R3A.** CI / Booking / Customs renderers, the persisted `generated_documents`/template layer, file
generation, and the full Export Center UI are NOT started — R3B is defined, not begun.
