# F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1 — Final Output snapshot schema normalization / lean audit

**Outcome: AUDIT-FIRST → NARROW SAFE LEAN APPLIED + two removal subsets HALTed/declined with proof.** Baseline HEAD
`296b2c2`. The Final Output snapshot now persists **6 fewer columns** — the 5 header derived totals + the line
`declared_total_value` — all **pure arithmetic/aggregates** the renderer recomputes from frozen facts. Every other
proposed removal is **kept**, because the audit proved the referenced authorities cannot deterministically reconstruct
the frozen fact (masters are mutable-in-place; the renderer is snapshot-only by invariant). Owners: `34_` (aggregator),
`35_` (renderer). `36_`/`37_` unchanged (they consume the render model, which is unchanged in shape).

## §1 Authorities audited (every reader/writer mapped before any deletion)
| File | Role | Reads the removed fields? |
|---|---|---|
| `34_shipment_final_output_handlers.gs` | aggregator + persister + read owner | WROTE totals (sfoBuildHeader_) + declared_total_value (sfoBuildLine_) — **now removed** |
| `35_shipment_document_renderer.gs` | SD/PL renderer (the ONLY factual presentation owner) | READ `h.shipment_total_*` + `l.declared_total_value` — **now derives both from frozen lines** |
| `36_document_template_handlers.gs` | template resolve + placeholder map | Reads ONLY the render MODEL (`header.totals`, line `declared_total_value`) — **model shape unchanged → untouched** |
| `37_shipment_document_file_renderer.gs` | file fill | Reads mapped placeholder values only — **untouched** |
| `33_party_authority_handlers.gs` | party resolver | Resolves `company_legal_entities` by **`company` key** + `logistics_locations` by **`warehouse_id`** — both **mutable-in-place** |
| `19_tax_handlers.gs` | customs authority | `tax_referral_rates`: PK `tax_rate_id`, append-only versions BUT **correction mode mutates values in place** |
| frontend (`shipping-history.js`, `operation-system-db-api.js`) | document UI | `generateShipmentDocument` sends only `{shipment_id, document_type}` — **reads NONE of these fields** |
| tests R2B/R3A/R3B/R3C | contracts | R2B asserted the removed columns — **updated**; R3A/R3B/R3C output numerically identical — **pass unchanged** |

## §8 Field classification matrix (complete)
Legend: 1 EXECUTION_FACT_KEEP · 2 HISTORICAL_FACT_KEEP · 3 IMMUTABLE_FK_KEEP · 4 DERIVABLE_REMOVE · 5 MASTER_DISPLAY_REMOVE · 6 REDUNDANT_FK_KEEP¹ · 8 BLOCKED_REQUIRES_HISTORICAL_VALUE

**Header (`shipment_final_output_snapshots`)**
| Field(s) | Class | Verdict |
|---|---|---|
| snapshot_id, shipment_id, snapshot_version, status, superseded_*, finalized_by/at, created_at, updated_at | 1 | KEEP (execution/lineage) |
| shipment_no, reference_id, company, country, marketplace, status_at_finalization, source/destination_warehouse_id, destination_type, warehouse_code, ship_from, ship_to, carrier_id, shipping_method, etd, eta, dispatch_date, booking_no, container_no, invoice_no, currency | 1 | KEEP (shipment execution facts) |
| **shipper_legal_entity_id, seller_of_record_legal_entity_id, consignee_location_id, factory_id, carrier_id** | 3 | KEEP (stable FK the USER keeps) |
| shipper_company, shipper_legal_name, shipper_display_name, shipper_country, shipper_address_*, shipper_city/state/postal, shipper_tax_or_business_id, seller_of_record_legal_name, consignee_warehouse_id, consignee_name, consignee_address_*, consignee_city/state/postal/country, factory_name, carrier_name | **8** | **KEEP — HALT removal.** `company_legal_entities` is resolved by `company` (not PK), is mutated in place (`updated_at`/`updated_by`, one active row per company); `logistics_locations` has no frozen header contract and is resolved by `warehouse_id`. Re-resolving the FK returns *current* mutated values → historical reproduction would break (34_'s whole reason for freezing). Renderer is snapshot-only by invariant. |
| shipping_detail_ready … customs_ready, readiness_detail | 1 | KEEP (finalization-time readiness fact) |
| **shipment_total_qty, shipment_total_cartons, shipment_total_gross_weight, shipment_total_net_weight, shipment_total_cbm** | **4** | **REMOVED** — Σ over frozen lines; renderer computes (`docTotals_`). |

**Line (`shipment_final_output_lines`)**
| Field(s) | Class | Verdict |
|---|---|---|
| snapshot_line_id, snapshot_id, shipment_id, shipment_line_id, created_at | 1/6¹ | KEEP (grain identity + read/cleanup keys) |
| sku, shipment_qty, shipment_carton_qty, carton_no_start/end, units_per_carton, gross_weight, net_weight, cbm, note | 1 | KEEP (physical execution facts) |
| site_sku, product_name_en, product_name_cn, carton_length/width/height, gs1_code, gs1_type, material, product_use | 2 | KEEP — frozen from **mutable** `sku_details`/regional master; the as-shipped value is the only historically exact source (customs/CI deferred, §12). |
| country_of_origin, hs_code, declared_currency, declared_unit_value | 2 | KEEP (§5) — `tax_referral_rates` has **no fully immutable identity** (correction mode mutates values in place; the aggregator never froze `tax_rate_id`), so the resolved values must stay frozen. |
| **declared_total_value** | **4** | **REMOVED** — `declared_unit_value × shipment_qty`, both frozen; renderer derives it (SD). |

**Line-PO (`shipment_final_output_line_pos`)**
| Field(s) | Class | Verdict |
|---|---|---|
| snapshot_line_po_id, shipment_line_allocation_id, purchase_order_line_id, allocated_qty, created_at | 1 | KEEP (execution lineage grain) |
| snapshot_id | 6¹ | KEEP — the **active read join key** (`docReadSnapshot_` filters line_pos by snapshot_id). |
| shipment_id, shipment_line_id | 6¹ | KEEP — `shipment_id` is the finalize **orphan-cleanup delete key** (`sfoDeleteRowsFor_`); `shipment_line_id` is the **line↔allocation join** in `docLinePos_`. |
| purchase_order_id | 6¹ | KEEP — lineage FK surfaced in the render model. |
| **po_no** | 2 | KEEP — a **printed historical commercial fact**; reconstructing it needs a live `purchase_orders` join (renderer is snapshot-only). |

¹ **§6 re-parent DECLINED.** The USER's lean line_pos target (add `snapshot_line_id`, drop snapshot_id/shipment_id/shipment_line_id/purchase_order_id/po_no) is **not applied**: those columns are active read/cleanup/join keys (§11-C integrity/lineage) and `po_no` is a historical commercial fact. Removing them would re-key the ONE aggregator + ONE renderer for no proportional leanness — audit-first conservatism keeps them.

## §14 Completion report
1. **PRE HEAD** `296b2c2`. 2. **POST HEAD** this commit. 3. **Row counts before migration** = agent has **no production access**; `extraColumnsPolicy: 'ALLOW'` makes this **migration-optional** (see §21). 4. **Matrix** = §8. 5. **Header kept** = all header fields EXCEPT the 5 totals. 6. **Header removed** = `shipment_total_qty`, `shipment_total_cartons`, `shipment_total_gross_weight`, `shipment_total_net_weight`, `shipment_total_cbm`. 7. **Line kept** = all line fields EXCEPT declared_total_value. 8. **Line removed** = `declared_total_value`. 9. **line_pos kept** = ALL 10 columns. 10. **line_pos removed** = NONE. 11. **Shipper reconstruction authority** = `shipment.company → company_legal_entities` — **mutable-in-place → NOT deterministic → values stay frozen (HALT)**. 12. **Consignee authority** = `destination_warehouse_id → logistics_locations` — **mutable-in-place → values stay frozen (HALT)**. 13. **Factory authority** = `procurementResolveFactoryId_(source_warehouse_id)` (never company); `factory_id` FK + frozen `factory_name` both kept. 14. **Carrier authority** = `carrier_id → carriers`; FK + frozen `carrier_name` kept (carrier ≠ shipper — separate domains). 15. **Customs verdict** = KEEP `hs_code`/`declared_currency`/`declared_unit_value`/`country_of_origin` frozen; REMOVE `declared_total_value` (derived). 16. **tax_referral_rates stable-version verdict** = versioned by `tax_rate_id` (append-only new-version rows) BUT **correction mode mutates values in place** and the aggregator never captured the id → **NO fully immutable identity** → cannot replace frozen customs values with an FK; adding `tax_rate_id` would be a new duplicate column (§4 forbids) that still isn't deterministic. 17. **Derived-totals verdict** = REMOVE (renderer computes Σ from frozen lines). 18. **Renderer impact** = `35_` gains `docTotals_`; `docHeaderBlock_(h, lines, poLineage)`; SD `declared_total_value = unit × qty`; **render model shape unchanged**. 19. **document_template_fields impact** = NONE (placeholders map from the unchanged render model; header.totals + line declared_total_value still present as derived values). 20. **generated_documents impact** = NONE. 21. **Migration required?** = **NO forced/destructive migration.** `prodRequireSheet_` uses `extraColumnsPolicy:'ALLOW'` and all reads/writes are by actual-header-name, so the live sheets' now-unused columns become dormant extras — reads/writes stay valid. The USER MAY optionally drop the 6 dead columns later. 22. **USER DB action** = optional cleanup only (§22 below). 23. **Files changed** = `34_`, `35_`, R2B test, new lean test, this doc. 24. **Tests** = new lean guard **61/61**; R2B **76/76**; R3A **37/37**; R3B **63/63**; R3C **35/35**; full regression **215 files, only the 4 known baseline failures (none new)**. 25. **Apps Script sync** = **YES — `34_` + `35_`**. 26. **New deployment required?** = **no new /exec version by this change alone** (no `01_router` action added/changed) — fold into the pending cumulative deployment. 27. **Frontend impact** = NONE. 28. **DB/schema impact** = 2 tables lose 6 derived columns from the contract; non-destructive (§21). 29. **Commit hash** = chat. 30. **Remaining gaps** = customs `tax_rate_id` FK capture is deferred (would need an immutable tax identity — a future customs/CI round); §6 line_pos re-parent intentionally not done.

## §11 Kitchen Mama permanent DB principle (frozen this round)
> **Persist a value only when at least one holds:**
> A. it owns independent business meaning at this table grain (an execution fact);
> B. it must remain historically reproducible AND no immutable/versioned relationship can reconstruct it;
> C. it is required for integrity / idempotency / lineage.
>
> Do **not** persist a value solely for UI convenience. Do **not** duplicate parent/grandparent IDs without a
> demonstrated integrity/read/cleanup need. Do **not** persist a simple arithmetic result (Σ, ×) unless the result is
> itself a business authority — recompute it in the renderer from the frozen facts.
>
> Corollary proven here: a frozen master VALUE stays under (B) whenever its authority is **mutable-in-place or
> resolved by a non-PK key** (e.g. `company_legal_entities`, `logistics_locations`, corrected `tax_referral_rates`) —
> re-resolving the FK would return *today's* value and silently rewrite history. The document renderer therefore
> never re-reads a mutable operational quantity; it may only recompute pure derivations from the frozen snapshot.

## §22 USER DB action (optional, non-blocking)
No action required for correctness. If the USER wants the physical sheets to match the leaner contract exactly, run an
authorized one-off migration to DELETE these now-dormant columns from the live sheets (they are ignored either way):
`shipment_final_output_snapshots`: shipment_total_qty, shipment_total_cartons, shipment_total_gross_weight,
shipment_total_net_weight, shipment_total_cbm · `shipment_final_output_lines`: declared_total_value.

## FINAL GATE — PASS
Materially leaner (−6 persisted columns; the two forbidden persisted-arithmetic groups eliminated) **while preserving**:
physical shipment truth ✓ · historical integrity where actually required (party/customs/master values HALTed from
removal) ✓ · multi-PO lineage (line_pos intact, never collapsed) ✓ · document reproducibility (renderer still
snapshot-only; model shape unchanged) ✓ · document generation (R3B/R3C green) ✓ · idempotency (deterministic
`SFO-<shipment_id>`, cleanup keys intact) ✓ · single factual authority (renderer derives; no second aggregator) ✓.

**STOP after F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1.**
