# F1-5B-SHIP-R3A — FIFO Allocation Schema + Canonical Draft Allocation Foundation

**Outcome: IMPLEMENTED (draft-allocation foundation).** All four R2 HALT authorities are USER-frozen and proven compatible with the existing architecture; no HALT condition re-triggered. Backend-only. `shipped_qty` NOT executed (R3B). Requires a **USER-authorized migration before the table is live** (§25). Baseline: [F1_5B_SHIP_R2_FIFO_ALLOCATION_AUDIT.md](F1_5B_SHIP_R2_FIFO_ALLOCATION_AUDIT.md).

## What was built
- **`assets/specs/active/apps-script/32_shipment_line_allocation_handlers.gs`** (new) — the canonical PO-consumption lineage owner:
  - `SHIPMENT_LINE_ALLOCATIONS_HEADERS_` (minimal schema, §9).
  - Pure, deterministic, Node-testable allocator (`__SLA_PURE_START__`…`END`): FIFO comparator, eligibility, reservation-aware availability, single-line + multi-line planners.
  - `handleGenerateShipmentLineAllocations_` — ScriptLock, reads canonical sheets, resolves company/factory, fail-closed, persists **DRAFT** allocations only (reconciliation replace); never mutates `shipped_qty`.
- **`01_router.gs`** — one new action `generateShipmentLineAllocations` (single canonical owner).
- **`assets/tests/shipment-fifo-allocation-f1-5b-ship-r3a.test.js`** — 41 assertions (§24 A–R) + handler source guards.

## Frozen authorities (as implemented)
- **FIFO** = `order_date ASC → po_no ASC → purchase_order_line_id ASC`; blank `order_date` NEVER eligible (no `created_at` fallback); only issued/executable PO statuses.
- **Matching** = `sku + company + factory`, all **independent**. Factory is **shared across companies** — a KM shipment on Factory A consumes only KM POs on Factory A; ResTW/ResUS the same factory independently (tests G, R). Company is `shipments.company` (never inferred); factory is `warehouses[source_warehouse_id].factory_id` via the existing `procurementResolveFactoryId_` (never inferred from company).
- **Capacity** = `max(0, completed_qty − shipped_qty)`; **draft availability** additionally subtracts OTHER shipment lines' active reservations; the current line releases its own draft before recompute (never double-counts).
- **Conservation** — `Σ allocated_qty = shipment_qty` on success; otherwise `PO_CAPACITY_INSUFFICIENT`, **no partial persistence**.

---

## §10/§25 — USER migration + deployment order

The `shipment_line_allocations` sheet does not exist in production and **cannot be auto-created** (runtime is validate-only; the handler fails closed with `SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING`). Create it once via the existing authorized migration owner (`prodMigrateCreateSheet_`).

**Exact USER steps (in order):**
1. **Back up** the production spreadsheet (note its name/URL).
2. In the production Apps Script editor, paste the self-contained migration below (headers inlined so it does not depend on syncing 32_ first).
3. **Run** `r3aCreateShipmentLineAllocationsTable('<your backup name/URL>')`. Expect `CREATED shipment_line_allocations…`.
4. **Verify** the tab exists with exactly the 19 headers logged; verify no other sheet changed.
5. **Delete** the temporary migration function from the editor.
6. **Apps Script sync** the runtime: `32_shipment_line_allocation_handlers.gs` (new) + `01_router.gs` (one added action).
7. No frontend deploy, no bundle rebuild this round.

```javascript
// F1-5B-SHIP-R3A one-shot migration — reuses prodMigrateCreateSheet_ + KMSAFE. Additive NEW sheet only; no row
// writes, no historical backfill, no PO attribution guessing. Delete after running.
function r3aCreateShipmentLineAllocationsTable(backupReference) {
  var backup = String(backupReference || '').trim();
  if (!backup) { Logger.log('ABORT: pass a real backupReference (your pre-migration spreadsheet copy).'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('shipment_line_allocations')) { Logger.log('ALREADY_EXISTS — no change made.'); return; }
  var headers = [
    'shipment_line_allocation_id','shipment_id','shipment_line_id','purchase_order_id','purchase_order_line_id',
    'sku','company','factory_id','allocated_qty','allocation_status','fifo_rank',
    'created_by','created_at','updated_by','updated_at','executed_at','reversed_by','reversed_at','reversal_reason'];
  var S = prodSafetyBundle_();
  var dto = {
    migrationId: 'R3A-CREATE-SHIPMENT-LINE-ALLOCATIONS',
    expectedSpreadsheetId: ss.getId(),
    expectedSheetName: 'shipment_line_allocations',
    expectedOldHeaderHash: S.headerHash([]),
    expectedNewHeaderHash: S.headerHash(headers),
    backupReference: backup, execute: true,
    actor: (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'ship-admin'
  };
  prodMigrateCreateSheet_(ss, 'shipment_line_allocations', headers, dto);
  Logger.log('CREATED shipment_line_allocations (' + headers.length + '): ' + headers.join(', '));
}
```

Runtime fails closed (`SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING`) until the table exists, so syncing the code before or after the migration is safe — but the recommended order is migrate → verify → sync.

---

## §27 Completion report
1. PRE HEAD — chat · 2. POST HEAD — chat.
3. **R2 HALT authorities resolved?** YES (all four USER-frozen; §3 FIFO, §4 matching, §2 capacity, §9 schema).
4. Migration owner = `prodMigrateCreateSheet_` + `KMSAFE.validateMigrationAuthorization`.
5. New table = `shipment_line_allocations`.
6. Headers = the 19 in `SHIPMENT_LINE_ALLOCATIONS_HEADERS_`.
7. PK = `shipment_line_allocation_id`.
8. FKs = `shipment_line_id`→shipment_lines, `purchase_order_line_id`→purchase_order_lines (+ denormalized `shipment_id`/`purchase_order_id`).
9. Lifecycle = `draft | executed | reversed` (R3A writes only `draft`).
10. Physical shipment qty owner = `shipment_lines.shipment_qty` (unchanged).
11. PO allocation authority = `shipment_line_allocations` (canonical consumption lineage).
12–14. `ordered_qty` = contractual ceiling · `completed_qty` = produced/shippable · `shipped_qty` = dispatched (unchanged; NOT written in R3A).
15. Capacity = `max(0, completed_qty − shipped_qty)`.
16. Draft-reservation availability = `max(0, completed − shipped − Σ other-line active reservations)`.
17. FIFO key = `order_date`. 18. Tie-breakers = `po_no`, then `purchase_order_line_id`.
19. Eligible PO statuses = `issued, confirmed, in_production, ready_to_ship, completed`. 20. Eligible line statuses = header status governs (pre-issue excluded); blank `order_date` excluded.
21. Shipment company authority = `shipments.company` (persisted; never inferred). 22. PO company authority = `purchase_order_lines.company` (header fallback).
23. Shipment factory resolver = `slaResolveShipmentFactory_` → `procurementResolveFactoryId_(source_warehouse_id)` (fail-closed if unresolved). 24. PO factory resolver = `purchase_orders.factory_id` (set by `procurementResolveFactoryId_` at PO create — reused, not duplicated).
25. **Factory shared across companies** = proven (tests G, R: KM/ResTW/ResUS POs on the same Factory A allocate independently).
26. **No factory→company inference** = proven (eligibility checks sku/company/factory independently; guard test §0B).
27. Legal matching scope = `sku + company + factory`.
28. Reservation owner = `shipment_line_allocations` draft rows (availability computed from them).
29. Current-line recompute = release self drafts → recompute → atomic replace (reconciliation, not delta; test L).
30. Multiple-draft = other drafts reserve capacity; over-reservation impossible (test K).
31. Insufficient-capacity = `PO_CAPACITY_INSUFFICIENT` fail-closed with diagnostics, no partial persist (test D).
32. Conservation = `Σ allocation = shipment_qty` (test N).
33. `shipment_lines.purchase_order_line_id` after R3A = **unchanged/untouched**; NOT the canonical authority (canonical = allocations). Left as an optional primary-source ref for a future single-PO convenience.
34. Shipping Plan role = logistics intent (no PO key forced) — unchanged.
35. **shipped_qty changed? NO.** 36. **factory_stock changed? NO.** 37. **AI Plan changed? NO.** 38. **Request Order changed? NO.** 39. **RO→PO changed? NO.**
40. Files changed = `32_shipment_line_allocation_handlers.gs` (new), `01_router.gs` (+1 action), `shipment-fifo-allocation-f1-5b-ship-r3a.test.js` (new).
41. Tests = 1 new (41 assertions). 42. Focused = 41/41. 43. Full regression = **195 pass / 4 known baseline**.
44. **Apps Script sync = YES** (`32_`, `01_router.gs`). 45. Frontend deploy = NO. 46. Bundle rebuild = NO (no `assets/js/core/*`).
47. DB/schema impact = **one new sheet** `shipment_line_allocations` (USER-authorized migration; additive; no row backfill). 48. API contract = additive (`generateShipmentLineAllocations` action). 49. Formula impact = NONE. 50. Inventory impact = NONE. 51. Shipment impact = additive draft lineage only (shipment_lines untouched). 52. PO impact = NONE (read-only).
53. USER migration steps = §10 above. 54. Deployment order = migrate → verify → sync → (no frontend).
55. Commit = chat.
56. USER live verification = after migration + sync, POST `generateShipmentLineAllocations {shipment_id}` → draft `shipment_line_allocations` rows whose `Σ allocated_qty = shipment_qty` per line, FIFO order by `order_date/po_no/line-id`, only same sku+company+factory POs consumed; insufficient capacity → `PO_CAPACITY_INSUFFICIENT`; `purchase_order_lines.shipped_qty` unchanged.
57. Remaining gaps = R3B dispatch execution (draft→executed + `shipped_qty` reconcile at Confirm & Dispatch) · `DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP` (deferred) · frontend trigger from Shipment Draft (not wired this round — foundation is callable via the router action).
58. Next authorized slice = **F1-5B-SHIP-R3B** (Confirm & Dispatch → PO allocation execution).

## §28 FINAL GATE
shipment_lines = sole physical truth ✓ · shipment_line_allocations = canonical PO-consumption lineage ✓ · 1 line → N PO lines ✓ · factory shared across KM/ResTW/ResUS ✓ · factory ⇏ company & company ⇏ factory ✓ · matching = sku+company+factory ✓ · FIFO order_date→po_no→line-id ✓ · no created_at fallback ✓ · pre-issue excluded ✓ · capacity = completed−shipped ✓ · draft availability subtracts other reservations ✓ · no self double-reserve ✓ · multi-draft over-reservation impossible ✓ · Σ allocation = shipment_qty ✓ · insufficient fails closed, no partial ✓ · purchase_order_line_id not the multi-PO authority ✓ · Shipping Plan unchanged ✓ · **shipped_qty NOT executed ✓ · factory stock unchanged ✓ · AI Plan / Request Order / RO→PO unchanged ✓** · no second engine ✓ · no unrelated refactor ✓.

**STOP after R3A.** R3B (dispatch execution), reversal policy, Export Center, and AI Plan E2E are NOT started.
