# F1-7A-SYSTEM-API-TRANSPORT-AND-LOADING-AUDIT-R1 — Whole-system map (AUDIT ONLY)

**Outcome: AUDIT ONLY — no runtime/business change.** Baseline HEAD `2f43ed9`. This is the authoritative system-wide map
of API coverage, full-DB loading, browser-side assembly, and the modularization migration sequence. It is precise
enough that subsequent implementation prompts need no further broad repo scan. Corroborated by the pre-existing
`docs/planning/API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`.

## §0 Frozen business baseline (unchanged)
All Phase-1 factual authorities are preserved verbatim (Forecast, Inventory Gap, Order Planning Gap, Recommendation, AI
Plan draft persistence, Request Order, RO→PO, PO qty, FIFO allocation, shipment physical qty, PO shipped/remaining,
Factory Stock, Receipt, On-the-Way, Final Output, Document generation, Automation scheduler). **API migration is a
TRANSPORT / READ-MODEL / LOADING change only — never a business-logic rewrite.**

## §13 E2E acceptance status
**`F1-PHASE1-LIVE-ACCEPTANCE-R2 = PAUSED_BY_USER_FOR_API_MIGRATION`** (NOT failed). Its `LIVE_RECORD_LEDGER`,
`LIVE_QUANTITY_LEDGER`, and pre-flight checklist remain valid and resume after this migration's final gate.

---

## §1 — Frontend page inventory (23 modules)
Data-layer fact: the real broad loader is **`loadOperationDb`** (`operation-system-db-api.js:2093`) → one GET
`?action=getOperationDb` fetching the **entire ~48-table DB** into the global singleton **`window._opDbCache`**
(`:2021`, no TTL). ~50 `KM.DB.getX()` getters are **synchronous reads of that cache** — so any page calling a getter is
a broad-DB consumer. (`getOperationDb()`/`getOperationDbMaterialized()` do not exist as JS accessors — only the backend
action string.)

| Page (JS) | Status | Forces full-DB before paint? | Tables actually consumed | Browser business math → class |
|---|---|---|---|---|
| inventory-replenishment.js | ACTIVE | **YES** (`:3615`) | ~16 (mkt_skus, sku_details, 4 amazon snaps, fc_regular/target/special, overseas_snap, warehouses, factory_stock, shipments, shipment_lines, shipping_plans/lines) + scoped gap + reco workspace | incoming-remaining `MAX(0,qty−received)` + ETA receiver attribution → **BUSINESS_AUTHORITY_RISK** |
| request-order.js | ACTIVE | **YES** (`:401`) | ~11 (mkt_skus, sku_details, fc_regular/special, amazon_snap, overseas_snap, warehouses, factory_stock, purchase_orders/lines, supplier_price_list) + scoped `getOrderPlanningGap` + reco workspace + `_opMatCache` | PO-remaining fallback `ordered−MAX(shipped,completed)` + stock aggregations → **BUSINESS_AUTHORITY_RISK**; Suggest-Order total = materialized DISPLAY_ONLY |
| fc-summary.js | ACTIVE | **YES** (`:3535`) | fc_regular/special/target, sku_details, marketplaces, mkt_skus, campaigns | Event-Assist derives forecast qty client-side then persists → **BUSINESS_AUTHORITY_RISK** |
| request-order-draft.js | ACTIVE | **YES** (`:57`) | request_orders/lines/line_sources, warehouses, sku_details, supplier_price_list | rollups → DISPLAY_ONLY (mutations delegate to backend) |
| overseas-stock.js | ACTIVE | **YES** (`:30`) | overseas_snap, overseas_movements, warehouses, sku_details | LOW/OVER/DAMAGED badge → DISPLAY_ONLY |
| purchase-order-overview.js | ACTIVE | **YES** (`:201`) | purchase_orders/lines, warehouses, sku_details | aggregate + Unreceived=ordered−completed → READ_MODEL_ASSEMBLY |
| purchase-order-list.js | ACTIVE | **YES** (`:68`) | purchase_orders/lines, sku_details, warehouses | `remaining=completed−shipped` fallback → **BUSINESS_AUTHORITY_RISK (LEGACY_PARALLEL)** |
| shipping-plan.js | ACTIVE | **YES** (`:1059`) | shipping_plans/lines (+ enrichment: shipments, amazon_inv_snap, amazon_weekly_sales, marketplaces) | `_spLineDisplay` stock/avg-sales/days-of-supply fallback → **BUSINESS_AUTHORITY_RISK (LEGACY_PARALLEL)**; unused `weeklyShipping` workspace (flag OFF) |
| shipping-history.js (Overview+Draft) | ACTIVE | **YES** (`:776/831`) | shipments, shipment_lines, carrier_rate_cards, warehouses | totals + CBM(=Σ carton_cbm, not ×cartons); snapshot read-only; FIFO/alloc delegated → **DISPLAY_ONLY (thin)** |
| global-logistics-map.js | ACTIVE | **YES** (`:122`) | **8**: shipments, shipment_lines, shipment_routes, shipment_events, warehouses, logistics_locations, route_templates, route_template_nodes | view-model mirrors; `derivedReceiptStatus`/remaining → READ_MODEL_ASSEMBLY (LEGACY_PARALLEL watch) |
| factory-stock.js | ACTIVE | **YES** (`:18`) | factory_stock, factory_stock_movements, sku_details, warehouses | `available=MAX(current−reserved,0)` → DISPLAY_ONLY |
| carrier-rate-card.js | ACTIVE | **YES** (`:239`) | carrier_rate_cards, carriers, carrier_lead_times | facets + lead-time join → FILTER/DISPLAY_ONLY |
| sku-regional-details.js | ACTIVE | **YES** (`:590`) | sku_regional_details, sku_details, mkt_skus, tax_referral_rates, tax_rate_components | tax resolution read-only → READ_MODEL_ASSEMBLY |
| campaign-risk.js | ACTIVE | **YES** (`:594`) | sku_details, mkt_skus, campaigns, campaign_sku_lines, marketplaces | `calculateSkuRisk` (90d + promo days → High/Watch) → **BUSINESS_AUTHORITY_RISK** |
| sku-details.js | ACTIVE | NO (render-from-cache; manual reload `:1980`) | sku_details, tax_referral_rates, tax_rate_components | unit conversion → DISPLAY_ONLY |
| sku-handbook.js | ACTIVE (read-only) | NO (render-from-cache) | sku_details + knowledge merge | static knowledge dict merge → DISPLAY_ONLY |
| automation-schedule.js | ACTIVE | **NO — scoped admin API only** (`get/updateAutomationSchedule`) | none (server registry) | none → **already the target model** |
| forecast.js | DEMO-ONLY | NO (KM.DemoData, no live DB) | none live | chart agg → DISPLAY_ONLY |
| overseas-inbound.js / overseas-outbound.js / overseas-ops-preview.js | PREVIEW (in-memory; nothing posted) | YES (engine `:534`) | shipments, shipment_lines, warehouses, overseas_snap | movementImpact projection → DISPLAY_ONLY (nothing posted) |
| home.js | DEMO/DEAD (DataRepo path overridden) | NO | none | goal % → DISPLAY_ONLY |
| supplychain.js | ACTIVE tool (localStorage only; no DB; no pages CSS) | NO | none | geometry → DISPLAY_ONLY |
| app.js | GLOBAL PRIME | **YES — `:381/382` eager full-DB load on DOMContentLoaded** | none (its own view needs 0 tables) | n/a |

---

## §2 — API surface (97 router actions; owner = `01_router.gs` GET `:18-37`, POST `:43-474`)
By category: **A GENERIC_DB 2 · B DOMAIN_READ 9 · C DOMAIN_WRITE 53 · D JOB 11 · E DOCUMENT 8 · F ADMIN 7 · G IMPORT 7.**

**Scoped reads that exist (B, the good model):** `recommendation.workspace.get` (canonical, active) · `weeklyShipping.workspace.get` (**implemented but flag-gated OFF → inert**) · `inventoryReplenishmentGap.get` · `orderPlanningGap.get` · `getShippingMethodCandidates` · `getWeeklyPlanRateCandidates` · `getShippingAllocationDraftWorkspace` · `requestOrderDraft.getActive` · `getRecommendationDraftToken`. **Only ~5 domains have a real scoped read; everything else is served by the whole-DB cache.**

**JOB (D):** gap recalc/start/status/cancel (inventory + order-planning), requestOrderDraft job start/continue/status/cancel — all used.

**14 actions EXIST but are UNCONSUMED by the frontend:**
- Document chain (7): `finalizeShipmentFinalOutput`, `getShipmentFinalOutput`, `renderShipmentDocument`, `documentTemplate.list`, `documentTemplate.getFields`, `shipmentDocument.get`, `shipmentDocument.list` — the finalize→render→document read chain is built server-side with **zero browser wiring** (only `shipmentDocument.generate` is wired, via shipping-history).
- Backend-only writes (2): `generateRecommendationDraftLocked`, `requestOrderDraft.generateFromGap`.
- Admin one-offs (5): `runAmazonSnapshotImports` (scheduled trigger), `auditFcSpecialEventIds`, `backfillFcSpecialEventIds`, `retireShipmentLabelColumns`, `seedSinotransCarrier`.

**MISSING scoped read APIs (domains served ONLY by whole-DB cache):** per-shipment detail (`shipment.get(id)`), per-PO detail (`purchaseOrder.get(id)`), per-request-order detail, scoped SKU-Details / Marketplace-SKUs collection, scoped FC-Summary / Campaigns collection, paginated/date-scoped inventory movement reads (overseas/amazon/factory), scoped carriers/rate-cards. **The `skuDetails`/`fcSummary`/`purchaseOrder`/`shipment` workspaces are REGISTERED in `km-api-foundation.js` but NOT IMPLEMENTED** — the natural migration slots.

---

## §3 — Broad-DB consumers (getOperationDb / loadOperationDb audit)
**17 broad-load call sites; REQUIRED_SYSTEM_SNAPSHOT = 0.** None genuinely needs the full 48-table snapshot; each consumes 2–16 tables and is replaceable.
- **LEGACY_PAGE_BOOTSTRAP:** `app.js:381` eager global prime (its own Home view needs 0 tables).
- **CAN_REPLACE_WITH_PAGE_API:** all 16 page bootstraps (factory-stock, carrier-rate-card, campaign-risk, global-logistics-map, purchase-order-overview/list, overseas-ops-preview [+inbound/outbound], overseas-stock, fc-summary, sku-regional-details, shipping-history, inventory-replenishment [partly migrated], request-order-draft, shipping-plan, request-order).
- **CAN_REPLACE_WITH_DETAIL_API:** sku-details edit panel (list vs detail split).
- **Migration exemplars already in-tree:** `_opMatCache` + `getOrderPlanningGap` (request-order.js:2165) and `utils/inventory-compat.js:356` `deps.readback` (scoped `getShippingAllocationDraftWorkspace`).

## §4 — Loading bottlenecks
| Bottleneck | Where | Class |
|---|---|---|
| Global full-DB prime on load | `app.js:382` | FULL_DB_BOOTSTRAP |
| Per-page `if(!_opDbCache) loadOperationDb({force:true})` gate before first paint | all 16 DB pages | FULL_DB_BOOTSTRAP + OVERFETCH |
| **Post-write `await loadOperationDb({force:true})` in ~40 writers** | `operation-system-db-api.js:2428-3698` | **WRITE_FORCES_FULL_RELOAD (HIGH)** |
| Cross-domain browser joins/enrichment | inventory-replenishment, request-order, shipping-plan, global-logistics-map | BROWSER_JOIN |
| Single global cache, no scope key | `_opDbCache` | GLOBAL_CACHE_INVALIDATION |

**Top first-paint blockers:** (1) `app.js:382` global prime; (2) per-page full-DB bootstrap gates; (3) post-write full-DB refetch (the documented "card disappears after Save, returns after refresh" lineage).

## §5 — Business-logic location (authority-drift risks)
**Must NOT survive as execution authorities during migration** (each is a client-side re-derivation of a canonical fact — read-model mirrors are acceptable only if the backend stays the sole writer):
| Page | Client derivation | Class |
|---|---|---|
| campaign-risk.js | `calculateSkuRisk` High/Watch classification | BUSINESS_AUTHORITY_RISK |
| fc-summary.js | Event-Assist forecast qty then **persisted** | BUSINESS_AUTHORITY_RISK (writes canonical) |
| request-order.js | PO-remaining fallback + site/3P/factory stock agg | BUSINESS_AUTHORITY_RISK / LEGACY_PARALLEL |
| purchase-order-list.js | `remaining=completed−shipped` fallback | BUSINESS_AUTHORITY_RISK / LEGACY_PARALLEL |
| shipping-plan.js | `_spLineDisplay` stock/avg-sales/days-of-supply | BUSINESS_AUTHORITY_RISK / LEGACY_PARALLEL |
| inventory-replenishment.js | incoming-remaining + ETA receiver attribution | BUSINESS_AUTHORITY_RISK |
| global-logistics-map.js | `derivedReceiptStatus`/remaining mirrors | READ_MODEL_ASSEMBLY (LEGACY_PARALLEL watch) |

*Note (§0 preservation):* fc-summary's Event-Assist is the only one that **writes** a browser-derived canonical value; the rest are display fallbacks. Migration must route these through canonical backend read-models, not delete business meaning.

## §9 — Caches
| Cache | Owner | Grain | Invalidation | Risk |
|---|---|---|---|---|
| `_opDbCache` | db-api:2021 | global, ~48 tables, no TTL | only `force:true` (bootstrap + every writer) | **HIGH — WRITE_FORCES_FULL_RELOAD** |
| `_opMatCache` | request-order.js:2165 | per-scope `{company,country,marketplace}` gap | scope change / post-recalc | LOW (target model) |
| gap/job scoped reads | `_kmGapRead_` | per-scope/runId pass-through | server-materialized | LOW |
| `getShippingAllocationDraftWorkspace` | foundation | per-scope readback | targeted post-write | LOW |

---

## §10 — Table / API coverage matrix (Phase-1 production tables)
Legend: RA=scoped Read API exists · WA=Write API exists · BROAD=served by whole-DB cache only.
| Table | Canonical owner (.gs) | RA | WA | Frontend consumers | Target API | Priority | Retire full-DB when |
|---|---|---|---|---|---|---|---|
| sku_details | 03 | BROAD | ✓ | sku-details, most pages | `skuDetails.workspace` (registered) | HIGH | all consumers on scoped read |
| marketplace_skus | 04/18 | BROAD | ✓ | request-order, inv-repl, campaign-risk | skuDetails/mktSkus workspace | HIGH | ″ |
| marketplaces / pricing_list | 04 | BROAD | ✓ | fc-summary, shipping-plan | fcSummary workspace | MED | ″ |
| fc_regular_forecast / fc_special_events / fc_target_rules | 04/14 | BROAD | ✓ | fc-summary, request-order, inv-repl | `fcSummary.workspace` (registered) | HIGH | ″ |
| campaigns / campaign_sku_lines | 20 | BROAD | ✓ | campaign-risk, fc-summary | campaign scoped read | MED | ″ |
| amazon_*_snapshot (4) | import | BROAD | import | inv-repl, request-order, shipping-plan | inventory workspace | MED | ″ |
| overseas_inventory_snapshot / movements | 05 | BROAD | ✓ | overseas-stock, inv-repl, overseas-preview | scoped snapshot+movement read | MED | ″ |
| factory_stock / factory_stock_movements | 21 | getTable reload | ✓ | factory-stock, request-order, inv-repl | scoped factory read | MED | ″ |
| warehouses | 03 | BROAD | — | nearly all pages | reference cache (small; may stay bundled) | LOW | keep as light ref |
| logistics_locations | 33 | BROAD | — | global-logistics-map | logistics workspace | MED | ″ |
| request_orders / _lines / _line_sources | 13 | BROAD | ✓ | request-order-draft | `requestOrder` detail+collection | HIGH | ″ |
| request_order_allocation_drafts / _lines | 15 | scoped(active drafts) | ✓ | request-order | already scoped-ish | LOW | ″ |
| purchase_orders / purchase_order_lines | 13 | BROAD | ✓ | PO-overview, PO-list, request-order | `purchaseOrder.workspace` (registered) | HIGH | ″ |
| supplier_price_list | 13 | BROAD | — | request-order(-draft) | with PO/RO workspace | LOW | ″ |
| shipping_plans / shipping_plan_lines | 11 | `weeklyShipping.workspace` (OFF) | ✓ | shipping-plan, inv-repl | **activate weeklyShipping workspace** | HIGH | flag ON + verified |
| shipments / shipment_lines | 12 | BROAD | ✓ | shipping-history, global-map, overseas-preview, inv-repl | `shipment.workspace` (registered) + `shipment.get(id)` | HIGH | ″ |
| shipment_line_allocations | 15/16 | scoped(draft workspace) | ✓ | (backend/confirm) | keep scoped | LOW | ″ |
| shipment_routes / _events / route_templates / _nodes | 31/32 | BROAD | ✓ | global-logistics-map | logistics/shipment workspace | MED | ″ |
| carrier_rate_cards / carriers / carrier_lead_times | 17 | BROAD (+candidates scoped) | import | carrier-rate-card, shipping-history | scoped carrier read | LOW | ″ |
| sku_regional_details / tax_referral_rates / tax_rate_components | 18/19 | BROAD | ✓ | sku-details, sku-regional | skuDetails workspace | MED | ″ |
| shipment_final_output_snapshots / _lines / _line_pos | 34 | `getShipmentFinalOutput` (**unconsumed**) | finalize (**unconsumed**) | none (R3 chain unwired) | wire finalize/get to shipping-history | MED (post-migration) | after doc UI wired |
| document_templates / document_template_fields / generated_documents | 36 | list/getFields (**unconsumed**) | generate (wired) | shipping-history (generate only) | wire list/get for lifecycle UI | LOW | ″ |
| automation config | 45 | `automationSchedule.get` ✓ | ✓ | automation-schedule | **already scoped — done** | DONE | — |

---

## §16 target API architecture (reuse existing `KM.api` workspace registry — no second framework)
Per page: **shell → immediate render** · **summary/collection scoped read** (workspace resolver) · **detail read on selection** · **history lazy** · **write → invalidate only the affected scope**, never the whole DB. Small pages may use one endpoint. The `KM.api.getWorkspace(name, scope)` mechanism + `_opMatCache` scoped-cache pattern already exist; generalize them.

## §8 target loading contract (one shared pattern)
States: `PAGE_BOOT` (shell paints immediately) · `SUMMARY_LOADING` · `MAIN_LOADING` · `DETAIL_LOADING` · `WRITE_PENDING` · `EMPTY` · `ERROR` · `STALE/REFRESHING`. Rules: shell renders before data; one slow domain never blanks the page; existing data stays visible during scoped refresh; detail never blocks the main list. Reuse ONE loading/error helper — do not spawn per-page spinner systems.

See `docs/planning/API_MIGRATION_MASTER_PLAN.md` for the batch sequence, per-batch frozen-behavior contracts, and version discipline.

**STOP after F1-7A-SYSTEM-API-TRANSPORT-AND-LOADING-AUDIT-R1. No implementation begins automatically.**
