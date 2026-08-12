# F1-5C-EXPORT-R2B — Canonical Final-Output Aggregator + Immutable Shipment Output Snapshot

**Outcome: IMPLEMENTED (backend authority; no renderers, no Export Center).** Builds ONE canonical, immutable
final-output snapshot for a dispatched shipment, from persisted canonical truth only. This becomes the single frozen
source that R3 renderers (Shipping Detail / Packing List / Commercial Invoice / Booking / Customs / Export Center)
consume. Baseline: R1 `16051dd`, R2A `8caf16a` (+ R2A-LIVE `59b47b7`). Owner:
[`34_shipment_final_output_handlers.gs`](../../assets/specs/active/apps-script/34_shipment_final_output_handlers.gs).

## §0 Live preconditions
Runtime fails closed (no fallback) until: (a) R2A `company_legal_entities` exists + seeded (KM/ResTW/ResUS resolve —
per R2A-LIVE `COMPANY_LEGAL_ENTITY_AUTHORITY_LIVE_READY`); (b) `logistics_locations` rows exist for destination
warehouses (identity = `warehouse_id`, never `warehouse_code`); (c) the 3 new snapshot tables created (USER migration
below). Missing shipper → `SHIPPER_LEGAL_ENTITY_NOT_CONFIGURED`; missing location → `DESTINATION_LOCATION_NOT_CONFIGURED`.

## §29 Completion report
1. PRE HEAD = `59b47b7`. 2. POST HEAD = this commit.
3. **Existing output spec audited** = `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (spec-only doc layer), `SHIPMENT_CENTER_SPEC §20` (Shipment Document Dataset = runtime concept, "not a DB table in MVP"), `generated_documents`/`document_templates`/`document_template_fields` (spec-only). No persisted output-snapshot table exists.
4. **Snapshot schema verdict** = **C** (new minimal schema). Adopts §20 Header/Line/Total + §I.1.2 allocation-grain vocabulary; names do NOT collide with the frozen doc layer; column names are data-model-based (placeholders map later via `document_template_fields`, §20).
5. **Snapshot header table** = `shipment_final_output_snapshots` (1 row per shipment / active snapshot).
6. **Snapshot line table** = `shipment_final_output_lines` (1 row per `shipment_line_id`; physical grain).
7. **Allocation-lineage representation** = `shipment_final_output_line_pos` — normalized child, 1 row per executed allocation (freezes `purchase_order_line_id`, `purchase_order_id`, `po_no`, `allocated_qty`). No CSV, no JSON-pack (§3). Three tables are required because shipment_line grain ≠ PO-allocation grain (multi-PO); §21 "child if snapshotting allocation lineage is required" applies.
8. **Snapshot PK** = `snapshot_id` (`SFO-<shipment_id>`).
9. **Shipment identity key** = `shipment_id` (one active snapshot per shipment).
10. **Snapshot lifecycle/status** = `status = final` (Phase 1). `superseded` reserved for future reversal.
11. **Versioning/supersession** = `snapshot_version` (=1) + `status` + `superseded_by` + `superseded_reason` present but inert in Phase 1 — future reversal SUPERSEDES (never mutates) historical output. Not over-engineered.
12. **Creation/finalization owner** = `handleFinalizeShipmentFinalOutput_` (34_); aggregator = `sfoBuildSnapshot_`.
13. **Exact finalization boundary** = a **separate idempotent post-dispatch action** `finalizeShipmentFinalOutput`, BOUND to dispatch (refuses unless `shipments.status = in_transit`/arrived/…). **Boundary choice B.**
14. **Dispatch transaction relationship** = **NONE** — not inside the R3B ScriptLock (§28 preserved). R3B/22_ untouched. It reads the persisted post-dispatch state (executed allocations, reconciled PO, in_transit status).
15. **Failure-after-dispatch behavior** = dispatch is NEVER rolled back for a snapshot failure; on error the shipment stays truthfully dispatched and finalization retries (`FINAL_OUTPUT_FINALIZATION_FAILED`, re-runnable). (§26.)
16. **Retry/idempotency authority** = deterministic `snapshot_id = SFO-<shipment_id>` + ScriptLock + existing-active-snapshot short-circuit (`already_finalized`) + orphan delete-then-append. Retry/two-tab/lost-response converge to one snapshot (no timestamp dedupe).
17. **Final-output aggregator owner** = `sfoBuildSnapshot_(ss, shipmentId)` (one backend call; server-side batched reads; no browser fan-out).
18. **Final-output read owner** = `handleGetShipmentFinalOutput_` / `getShipmentFinalOutput` — returns header + lines + PO lineage + readiness + meta in ONE call; NEVER re-resolves masters.
19. **Physical qty authority** = `shipment_lines.shipment_qty` (only). Never PO ordered/completed/shipped, never recommended/request qty (guard Q).
20. **PO lineage authority** = executed `shipment_line_allocations` → `purchase_order_lines` → `purchase_orders` (reused via `slaLoadPoLinesJoined_`).
21. **Multi-PO representation** = one lineage row per executed allocation; both PO numbers + both allocated quantities preserved (never collapsed / no latest/first/largest) (guard B).
22. **SKU authority** = `sku_details` (key `sku`) — product name(s), GS1, dimensions, material, product_use.
23. **Site SKU authority** = `skuRegionalLookup_` (regional, higher priority) → fallback `procurementMarketplaceSkuMap_`, scoped `sku + company + country + marketplace` (guard I).
24. **GS1 authority** = `sku_details.gs1_code` + `gs1_type` (frozen; distinct from `units_per_carton`, guard §9).
25. **HS authority** = `tax_referral_rates.hscode` (frozen; latest effective by `series + duty_country + effective window`, mirroring `shippingDuty_`/`taxActiveOn_`).
26. **Country-of-origin authority** = `tax_referral_rates.country_of_origin` (frozen).
27. **Declared currency authority** = `tax_referral_rates.declared_currency` (surfaced by the R2B read — existing column `shippingDuty_` never read; NO new formula).
28. **Declared value authority** = `tax_referral_rates.declared_value` (per-unit); `declared_total_value = declared_unit_value × shipment_qty` (frozen on the line).
29. **Shipper authority** = `partyResolveShipmentShipper_` (R2A) = `shipment.company` → `company_legal_entities`.
30. **Seller authority** = `partyResolveSellerOfRecord_` (Phase 1 = shipper legal entity).
31. **Consignee authority** = `partyResolveConsignee_` (R2A) = `destination_warehouse_id` → `logistics_locations`.
32. **Legal importer verdict** = no owner → NOT fabricated; `customs` readiness = `BLOCKED / LEGAL_IMPORTER_AUTHORITY_GAP`; base snapshot still finalizes (§15).
33. **Destination authority** = `shipments.destination_warehouse_id` (legacy `warehouse_id` mirror fallback); free-text `shipments.destination` kept only as a display snapshot (`ship_to`), never identity.
34. **Factory authority** = `procurementResolveFactoryId_(ss, source_warehouse_id)` (warehouse_id → factory_id; NEVER company; guard D).
35. **Carrier authority** = `shipments.carrier_id` → `carriers.carrier_name`; method = `shipments.shipping_method`.
36. **ETD/ETA authority** = `shipments.etd`/`eta`; dispatch date = `actual_departure_date`.
37. **Document-significant frozen fields** = shipper {legal_entity_id, company, legal_name, display_name, country, address_1/2, city, state_or_region, postal_code, tax_or_business_id}; seller (= shipper); consignee {location_id, warehouse_id, name, address_1/2, city, state_or_region, postal_code, country}; factory {id, name}; per line {sku, site_sku, product_name_en/cn, gs1_code/type, country_of_origin, hs_code, declared_currency, declared_unit/total_value, dims, weights, cartons, material, product_use}; lineage {po_no, allocated_qty}; totals.
38. **Live-reference (kept as IDs, not authority)** = shipment_id, shipment_line_id, purchase_order_line_id/id, carrier_id, warehouse/location IDs, company token — retained for joins; the document-visible VALUES beside them are frozen.
39. **Receipt/received qty verdict** = **NOT** in the immutable dispatch snapshot (`shipment_received_qty` changes after dispatch; it stays operational Shipment data — §8).
40. **Document readiness model** = per-family `sfoDocumentReadiness_(header, lines)` on required field groups (not by name): shipping_detail, packing_list, commercial_invoice, booking, customs.
41. **Shipping Detail readiness** = READY when lines + shipper + consignee.
42. **Packing List readiness** = READY when lines + consignee.
43. **Commercial Invoice readiness** = READY when lines + shipper + consignee + declared value/currency on every line (legal importer NOT required by CI in Phase 1).
44. **Booking readiness** = READY when consignee + carrier + shipping method.
45. **Customs readiness** = BLOCKED (`LEGAL_IMPORTER_AUTHORITY_GAP`) in Phase 1.
46. **Immutability proof** = the read owner (`handleGetShipmentFinalOutput_`) calls NO master resolver (guard U: no partyResolve / sfoResolveCustoms_ / skuRegionalLookup_ / sfoSkuMasterMap_ / procurementResolveFactoryId_ / sfoBuildSnapshot_) — later edits to company/legal address, logistics_locations, product name, GS1, HS, declared value cannot change a returned finalized DTO (tests E/F/G/H/U, structural).
47. **Conservation proof** = `sfoConservation_` requires `Σ executed allocated_qty == shipment_qty` per line; else `FINAL_OUTPUT_PO_ALLOCATION_QTY_MISMATCH` and NOTHING is persisted (tests A/B/C).
48. **No-FIFO proof** = aggregator/lineage builder contain no `order_date`/`po_no` sort/FIFO (guard R); FIFO owner remains R3A.
49. **No AI/Gap/Forecast recompute proof** = guard S (no gap/forecast/recommendation/avg_sales in 34_).
50. **Frontend fan-out verdict** = ELIMINATED for output — one `getShipmentFinalOutput(shipment_id)` returns everything; no browser cross-table reconstruction (§24). (Frontend wiring is R3.)
51. **Files changed** = `34_shipment_final_output_handlers.gs` (NEW), `01_router.gs` (+2 actions), `shipment-final-output-f1-5c-export-r2b.test.js` (NEW), `final-output-seam-audit-f1-5c-export-r1.test.js` (R1 sentinels re-pointed for R2B), this doc.
52. **Tests** = 1 new (70 assertions, A–U coverage).
53. **Focused results** = R2B 70/70; R1 audit 23/23; production-safety 85/85.
54. **Full regression** = **201 pass / 4 known baseline**.
55. **Apps Script sync** = YES — `34_shipment_final_output_handlers.gs` + `01_router.gs`.
56. **Frontend deploy** = NO.
57. **Bundle rebuild** = NO (no `assets/js/core/*`).
58. **DB/schema impact** = 3 new tables (USER migration); no existing table changed.
59. **Migration required** = YES (create 3 sheets). USER-run one-off (below); migration twins never invoked from a handler (production-safety INIT.4 preserved).
60. **Exact USER migration steps** = sync `34_` + `01_router.gs` → run `r2bCreateFinalOutputTables('<backup>')` once → delete the temp function. (Snippet below.)
61. **API impact** = 2 new router actions (`finalizeShipmentFinalOutput`, `getShipmentFinalOutput`); no existing action changed.
62. **Formula impact** = NONE.
63. **Inventory impact** = NONE.
64. **PO impact** = NONE (reads only; `shipped_qty`/`remaining_qty` reconciliation stays R3B).
65. **Shipment impact** = NONE to the shipment lifecycle (reads only; no cell writes to `shipments`/`shipment_lines`).
66. **Commit hash** = chat.
67. **USER live verification** = after migration + a dispatched shipment with executed allocations: POST `finalizeShipmentFinalOutput {shipment_id}` → returns `snapshot_id`, `lines`, `po_allocations`, `readiness` (customs BLOCKED); re-run → `already_finalized` (same snapshot_id); GET `getShipmentFinalOutput {shipment_id}` → frozen header+lines+lineage; then edit a master (e.g. company address or GS1) and GET again → **unchanged**.
68. **Remaining gaps** = legal importer authority (deferred, fail-closed); post-dispatch reversal / supersession execution (deferred, schema-ready); document renderers + Export Center (R3); frontend wiring to call finalize post-dispatch + a Shipping Detail view (R3).
69. **Next authorized slice** = **F1-5C-EXPORT-R3** — bounded consumers of the frozen snapshot (Shipping Detail, Packing List, CI where authorities complete, Booking/Customs only where readiness satisfied, Export Center orchestration), all reading `getShipmentFinalOutput` — no return to live operational tables. Then full production E2E.

## USER migration snippet (run once in the Apps Script editor, then delete — NOT committed)
```javascript
// Creates the 3 final-output snapshot tables. Requires 34_ + 29_ + the generated bundle synced. Additive, create-only.
function r2bCreateFinalOutputTables(backupReference) {
  if (!backupReference) throw new Error('backupReference required — pass a backup link/id string.');
  var ss = SpreadsheetApp.openById(prodExpectedDbId_());
  var plan = [
    { name: 'shipment_final_output_snapshots', headers: SFO_SNAPSHOT_HEADERS_ },
    { name: 'shipment_final_output_lines',     headers: SFO_LINE_HEADERS_ },
    { name: 'shipment_final_output_line_pos',  headers: SFO_LINE_PO_HEADERS_ }
  ];
  var made = [];
  plan.forEach(function (p) {
    if (ss.getSheetByName(p.name)) { made.push(p.name + ' (already exists — skipped)'); return; }
    var auth = {
      migrationId: 'F1-5C-EXPORT-R2B-' + p.name + '-create',
      expectedSpreadsheetId: prodExpectedDbId_(),
      expectedSheetName: p.name,
      expectedOldHeaderHash: KMSAFE.headerHash([]),
      expectedNewHeaderHash: KMSAFE.headerHash(p.headers),
      backupReference: String(backupReference), execute: true, actor: Session.getActiveUser().getEmail()
    };
    prodMigrateCreateSheet_(ss, p.name, p.headers, auth);
    made.push(p.name + ' (' + p.headers.length + ' cols)');
  });
  return made.join('; ');
}
```
Also add `shipment_final_output_snapshots`, `shipment_final_output_lines`, `shipment_final_output_line_pos` to the
`getOperationDb` `validTabs` list only if you want the frontend cache to carry them; the R2B read owner
(`getShipmentFinalOutput`) does not require it.

## §30 FINAL GATE
one canonical snapshot authority ✓ · one backend aggregator ✓ · no browser reconstruction ✓ · physical qty =
shipment_lines.shipment_qty ✓ · multi-PO lineage preserved ✓ · conservation validated ✓ · shipper = company legal
entity ✓ · factory does not determine shipper ✓ · consignee = destination warehouse/location ✓ · GS1 frozen ✓ ·
HS/declaration frozen ✓ · site SKU scope deterministic ✓ · document-significant facts immutable after finalization ✓ ·
retry/two-tab/lost-response safe ✓ · no duplicate snapshot ✓ · no FIFO recompute ✓ · no recommendation recompute ✓ ·
no PO quantity recompute ✓ · no second snapshot engine ✓ · legal importer not fabricated ✓ · readiness fails per
family ✓ · upstream execution untouched ✓ · no unrelated refactor ✓.

**STOP after R2B.** No renderer, no Export Center, no reversal, no legal-importer authority. R3 is defined, not started.
