# F1-5C-EXPORT-R1 — Shipment Final-Output / Shipping-Detail / Export Canonical-Seam Audit

**Round type: AUDIT-FIRST / READ-FIRST. No output runtime built.** Baseline: R3A `bfa9bed`, R3B `cffc42a`, R3C `c7d9ea9`.

**FINAL VERDICT: C — FINAL_OUTPUT_AUTHORITY_GAP → HALT.** The upstream operational + product/customs master authorities
needed to build the final output are almost all present and canonical, BUT (1) **no final-output snapshot table or
document engine exists at all** — the entire output layer (snapshot dataset, `document_templates` /
`document_template_fields` / `generated_documents`, renderers, Export Center) is **spec-only**, so R2 cannot "extend an
existing snapshot"; it must build the output layer from scratch on top of the proven authorities; and (2) there is a
genuine **authority gap with no canonical owner**: company legal entity / shipper / consignee, plus the warehouse
recipient address block. Deciding where seller-of-record / shipper / consignee identity lives is a product/architecture
decision — per §16 I HALT rather than invent it.

Evidence base: 4 parallel read-only audits (Shipping Detail chain, Export Center + templates, master-data authorities,
shipment/allocation schema) + direct verification greps. All load-bearing claims re-verified against source.

---

## Two different things called "Shipping Detail"
1. **"SKU Shipping Details"** — a LIVE table inside the Weekly Shipping Plan card (`shipping-plan.js`
   `_spRenderDbSection`/`_spLineDisplay`). It is **DISPLAY_ONLY over a PLANNING snapshot** persisted on
   `shipping_plan_lines.snapshot_*` (current stock / avg sales / days of supply). It is **not** a commercial/export
   document and carries no UPC / HS / declared value.
2. **"Shipment Detail" document (`SHIPDETAIL`)** — a document-generation artifact fully specified in
   `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (§I.1) but **UNWIRED / SPEC-ONLY** (`:3` "No runtime, no UI, no DB migration";
   `:581` "no document field resolver … no `document_template_fields` reader … no doc endpoint in `01_router.gs`").

There is **no code path** from the live Shipping Plan UI to any downloadable document.

---

## §24 Completion report (numbered)
1. PRE HEAD = `c7d9ea9`. 2. POST HEAD = this commit.
3. **Shipping Detail page owner** = `assets/js/pages/shipping-plan.js` (the live "SKU Shipping Details" table, `_spRenderDbSection` L804 / `_spLineDisplay` L774); host `assets/html/pages/shipping-plan.html`. The commercial "Shipment Detail document" has **no page owner** (spec-only).
4. **Shipping Detail backend owner** = `11_shipping_plan_handlers.gs` (write) + `40_api_v1_weekly_workspace.gs` (read); shipments/lines are read via the generic `getOperationDb`/`getTable` (`03_master_data_handlers.gs` → `readSheetAsObjects_`), which returns **raw full-column sheet rows** (no curated shipment payload).
5. **Shipping Detail source tables** = `shipping_plans` + `shipping_plan_lines` (planning); the document seam would additionally need `shipments`, `shipment_lines`, `shipment_line_allocations`, `purchase_orders`, `purchase_order_lines`, `sku_details`, `tax_referral_rates`, `marketplace_skus`/`sku_regional_details`, `warehouses`, `carriers`.
6. **Snapshot table owner** = NONE for final output. The only persisted snapshot is `shipping_plan_lines.snapshot_*` (planning), copied verbatim onto `shipment_lines.snapshot_*`. **No `generated_documents` / document-dataset table exists.**
7. **Snapshot grain** (existing planning snapshot) = per shipping-plan line (per SKU). A final-output snapshot does not exist.
8. **Snapshot lifecycle** = planning snapshot frozen at Submit (`project-current-state.md:877`). No output-snapshot lifecycle exists.
9. **Snapshot creation trigger** = Shipping Plan Submit (planning only). No output-snapshot creation trigger exists.
10. **Snapshot finalization trigger** = NONE for final output (the natural boundary is Confirm & Dispatch / R3B, but no snapshot is written there today).
11. **Physical qty source** = `shipment_lines.shipment_qty` (CANONICAL; guard A). Not PO ordered/completed, not recommended/request qty (§7).
12. **SKU source** = `shipment_lines.sku` = Master `sku` (`sku_details` key).
13. **Marketplace SKU source** = `marketplace_skus.site_sku` (regional override `sku_regional_details`), key `sku + company + country + marketplace`. `country` alone is insufficient (US = KM **and** ResUS).
14. **UPC authority** = **`sku_details.gs1_code` + `gs1_type`** (the real barcode; single owner, guard G). ⚠ "UPC" is overloaded in code to mean `units_per_carton` — also `sku_details`, but a different field. **No barcode column on the shipment schema.**
15. **HS Code authority** = `tax_referral_rates.hscode` (NOT `sku_details`).
16. **Country-specific HS** = deterministic — resolved by `series (from sku_details) + country_of_origin + duty_country (= shipments.country) + effective date`; different destination → different row → different `hscode`.
17. **Declared currency authority** = `tax_referral_rates.declared_currency` (returned value, never a lookup key).
18. **Declared value authority** = `tax_referral_rates.declared_value` (per-unit); declared **total** is derived (`declared_value × qty`), not stored.
19. **Company legal entity authority** = **NONE / MISSING.** `company` (KM/ResTW/ResUS) is only a scope token; no `companies`/legal-name/address/tax-id master exists (verified: no `legal_name`/`legal_entity`/`seller_of_record` anywhere in backend).
20. **Shipper authority** = **NONE / MISSING** (no `shipper`/`exporter` column; origin is only a warehouse identity `source_warehouse_id`/`ship_from`).
21. **Consignee authority** = **NONE / MISSING** as a legal block (only destination warehouse identity `shipments.destination` / `destination_warehouse_id`).
22. **Destination authority** = `shipments.destination` + `destination_warehouse_id` → `warehouses`. ⚠ recipient **address** fields (`address/city/state/postal_code/contact_phone/contact_email`) are flagged "new DB dependency" in the doc-gen spec — **planned, not confirmed live** (only `warehouse_id/code/name/type/company/country/is_factory_warehouse/is_active/factory_id` are verifiably read today).
23. **Factory authority** = `warehouses` (`is_factory_warehouse`) via `procurementResolveFactoryId_(warehouse_id)`. **`shipments` has no `factory_id` column.** Shared-factory rule preserved: factory is resolved from warehouse, never inferred from company (guard F).
24. **Carrier authority** = `shipments.carrier_id` → `carriers.carrier_name`; method = `shipments.shipping_method` / `last_mile_delivery`; rate master = `carrier_rate_cards`.
25. **ETD authority** = `shipments.etd` (planned) / `actual_departure_date` (actual dispatch).
26. **ETA authority** = `shipments.eta` (planned) / `actual_arrival_date` (actual).
27. **PO lineage authority** = `shipment_line_allocations` (executed) → `purchase_order_lines` → `purchase_orders` (CANONICAL, guard B). The legacy 1:1 `shipment_lines.purchase_order_line_id` is **not** the multi-PO authority.
28. **Multi-PO representation** = one Shipment Line → N executed allocation rows → N PO lines. Output must preserve every executed allocation (or a distinct-PO roll-up derived from them) — **never collapse to a single `purchase_order_line_id`** and never pick "latest/first/largest".
29. **Allocation authority** = `shipment_line_allocations.allocation_status = executed`, `allocated_qty` (PO-consumption lineage; allocation-level `shipped_qty` is reserved/non-authoritative).
30. **Quantity conservation verdict** = HOLDS by construction: R3B enforces `Σ executed allocated_qty = shipment_qty` per line and `purchase_order_lines.shipped_qty = Σ executed allocated_qty`. Output uses `shipment_lines.shipment_qty` as physical qty; PO quantities are lineage, displayed separately.
31. **PO ordered/completed use in output** = display/lineage only — **never** as physical shipment qty (guard §7).
32. **Snapshot completeness** = **INCOMPLETE — no final-output snapshot exists.** All required data is reachable from canonical tables, but nothing materializes/freezes it for documents.
33. **Fields missing from snapshot** = ALL (no output snapshot). If/when built, the fields NOT resident on the shipment schema and needing copy-at-finalization: UPC/`gs1_*`, HS code, country of origin, declared value/currency, product name/description, unit & carton dimensions, per-unit/carton weights, units-per-carton, multi-PO lineage, marketplace site SKU.
34. **Fields with NO canonical authority** = company legal entity (name/address/tax-id) · shipper/exporter block · consignee legal block · warehouse recipient address block (planned, unconfirmed) · declared **total** value (derived, acceptable) · linear item/carton **dimensions on the shipment** (present on `sku_details`, absent on shipment — copy at finalization).
35. **Shipping Detail download owner** = NONE (no download/export/PDF button on `shipping-plan.html`).
36. **Packing List owner** = NONE (spec-only, `PL` family).
37. **Commercial Invoice owner** = NONE (spec-only, `CI`/`PLCI` family).
38. **Booking owner** = NONE (spec-only, `BOOKING` family; `CARRIER_BOOKING_MAPPING_SPEC.md`).
39. **Customs owner** = NONE (spec-only, `CUSTOMS` family).
40. **Document template owner** = NONE in runtime; designed as `document_templates` (registry) in `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (`TPL-{DOC}-{SCOPE}-{LANG}-V{n}` / `{DOC}_{SCOPE}_{LANG}`), **not instantiated** — no `TPL-` values, no `{{PLACEHOLDER}}` tokens in any `.js`/`.gs`.
41. **document_template_fields usage** = NONE in runtime (designed as the placeholder→column mapping layer; stores token without braces; **no reader exists**).
42. **Export Center current state** = **ABSENT (runtime) / SPEC-ONLY (design).** No page/route/menu/API/backend/tables.
43. **Export Center data source** = intended = committed snapshots (never live DB); actual = none (nothing runs).
44. **Frontend fan-out verdict** = RISK PRESENT. Shipments/lines/allocations/PO/master all arrive via the generic `getOperationDb` full-table load; there is no `shipment_id → one backend aggregation`. A browser-built document would fan out across tables → R2 must add ONE backend final-output aggregation, not browser loops.
45. **Historical immutability verdict** = **FINAL_OUTPUT_IMMUTABILITY_POLICY_GAP.** No snapshot exists, so a document rebuilt later would silently change if master data edits (UPC, HS code, declared value, product description, company/warehouse address) landed afterward. Affected fields: everything in item 33/34. Policy required in R2: freeze commercial facts at finalization; keep purely operational status live.
46. **Reversal interaction** = a future `DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP` (deferred) would need to mark/supersede a finalized output snapshot; it does **not** block designing the snapshot now (an immutable snapshot + supersede-on-reversal is compatible). Not solved here.
47. **Duplicate/parallel output owner audit** = NONE. Only one (spec) design exists; no competing runtime engine (guard K). Verdict D does **not** apply.
48. **No-recompute audit** = PASS. R1 added no runtime; nothing recomputes AI/Gap/Forecast/Inventory/RO/PO/FIFO/shipped/remaining/Factory Stock. Guards assert the authorities, not recomputation.
49. **Files changed** = `docs/planning/F1_5C_EXPORT_R1_FINAL_OUTPUT_SEAM_AUDIT.md` (this), `assets/tests/final-output-seam-audit-f1-5c-export-r1.test.js` (new guards). No runtime file touched.
50. **Tests/guards added** = 1 new file, 23 source-scan guards (A physical qty owner; B multi-PO lineage; §7 PO≠physical; G barcode single owner; H HS; I declared value/currency; J planning-snapshot owner; K no second engine / no export action; C HALT sentinel — no shipper/consignee/legal-entity owner; F factory-from-warehouse).
51. **Focused results** = 23/23.
52. **Full regression** = **198 pass / 4 known baseline** (baseline: `gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`).
53. **Apps Script sync** = NO.
54. **Frontend deploy** = NO.
55. **Bundle rebuild** = NO (no `assets/js/core/*`).
56. **DB/schema impact** = NONE.
57. **API impact** = NONE.
58. **Formula impact** = NONE.
59. **Inventory impact** = NONE.
60. **PO impact** = NONE.
61. **Shipment impact** = NONE.
62. **Commit hash** = see chat.
63. **USER live verification required?** = NO (audit + source-scan tests only; nothing to verify live).
64. **FINAL verdict** = **C — FINAL_OUTPUT_AUTHORITY_GAP (HALT).**
65. **Exact remaining seams** = (a) **authority gap** — company legal entity / shipper / consignee master (seller-of-record); (b) warehouse recipient **address block** (confirm live or migrate); (c) **no final-output snapshot** (materialize + freeze at dispatch); (d) **no document dataset builder / renderers / templates**; (e) **no Export Center**; (f) one **backend aggregation** to avoid browser fan-out; (g) an **immutability policy** for frozen commercial facts.
66. **Recommended F1-5C-R2 scope** = decide + create the **company/entity (shipper & seller-of-record) + consignee** authority (product decision needed FIRST — this is the HALT), and confirm the warehouse recipient address block; THEN a single bounded slice: `shipment_id → ONE backend final-output aggregation` reading only canonical truth (shipment_lines physical qty + executed shipment_line_allocations multi-PO lineage + sku_details barcode/dims/weights/name + tax_referral_rates HS/declared + marketplace site SKU + warehouses/carriers) → **materialize + freeze ONE final-output snapshot at dispatch** (immutable; supersede-on-reversal) → renderers/Export Center consume the snapshot. No new FIFO, no new PO allocator, no recompute.

---

## §16 Verdict detail — why C, not B
Verdict **B** ("extend the existing snapshot") presupposes an existing **final-output** snapshot with missing fields. There
is none — the only persisted snapshot (`shipping_plan_lines.snapshot_*`) is an **upstream planning** snapshot, not a
commercial output. The output snapshot/document/export layer is **entirely unbuilt**. Combined with a real **authority
gap** (company/shipper/consignee has no owner; recipient address unconfirmed), the honest verdict is **C**, and because
resolving it requires a product/architecture decision on seller-of-record / shipper / consignee identity, R1 **HALTS**
here per §16. (Verdict **D** does not apply — no competing runtime engine exists.)

## §25 FINAL GATE
Shipment physical-truth owner ✓ (`shipment_lines.shipment_qty`) · Shipment Line → PO multi-line lineage owner ✓
(`shipment_line_allocations` executed) · Shipping Detail canonical source ✓ (live = planning snapshot; document = spec-only)
· UPC authority known ✓ (`sku_details.gs1_code/gs1_type`; overload noted) · HS Code authority known ✓
(`tax_referral_rates.hscode`) · declared currency/value authority known ✓ (`tax_referral_rates`) · company/shipper/consignee
authority = **explicit GAP** ✓ · snapshot owner = **explicit GAP** (no output snapshot) ✓ · snapshot finalization boundary
known ✓ (would be Confirm & Dispatch) · multi-PO representation known ✓ (preserve all executed allocations) · document
template owner known ✓ (spec-only, not instantiated) · Export Center current source known ✓ (absent) · historical
immutability behavior = **explicit GAP** ✓ · no AI/Gap/Forecast recompute ✓ · no FIFO recompute ✓ · no PO quantity
recompute ✓ · no second output engine ✓ · no unrelated refactor ✓.

**STOP after F1-5C-EXPORT-R1.** No output runtime, snapshot, document engine, or Export Center built. Full production E2E
(AI Plan → … → Export) NOT started — it is gated behind the R2 authority decision + snapshot build.
