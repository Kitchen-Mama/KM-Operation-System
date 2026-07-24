# Kitchen Mama Operation System — Supply Chain Control Tower Spec

**Status:** Draft v1.0 / Initial Direction Approved / **Not Finalized**
**Last Updated:** 2026-07-23
**Implementation Gate:** Build only after the 90-Day replenishment, risk, order, allocation, shipment, ETA, receipt, and inventory closed loop is finalized and verified.
**Authority Position:** The Control Tower is a read/action orchestration layer. It does not own or duplicate transaction truth.

> **RECORDING NOTE (2026-07-23):** This document is recorded to preserve the intended architecture per §1. It is **NOT approved for implementation.** A dependency audit on 2026-07-23 found the upstream closed loop is **not finalized/verified** (recommendation engine inactive; allocation handlers are non-reserving planning scratchpads; overseas inbound-receipt / outbound ship-confirm / route / ETA projection unbuilt; Request Order Suggest Order & Risk are placeholders). Build gate **NOT met** — see `project-current-state.md` (2026-07-23 Control Tower entry) for the dependency matrix. Do not implement until the owner confirms the closed loop.

---

## 1. Executive Decision

The Supply Chain Control Tower will be the Phase-1 operational overview for exception management across:

Demand / Forecast → Replenishment Risk → Order Recommendation → PO / Production → Allocation / Reservation → Shipment / Route / ETA → Inbound / Receipt → Inventory Safety

Version 1 is recorded now to preserve the intended architecture, but it must not be treated as finalized until all upstream calculations and lifecycle mappings have reached a verified closed loop.

The Control Tower must:
- surface actionable exceptions, not merely summarize page counts;
- link every risk to its source record and next valid action;
- distinguish projected, committed, shipped, delivered, and received supply;
- never calculate a parallel inventory, ETA, risk, or order truth;
- preserve company, country, marketplace, factory, warehouse, shipment, and SKU scope;
- support a future API-based backend without coupling UI to Google Sheet columns or Apps Script internals.

## 2. Non-Authority Rule

| Domain | Authority |
|---|---|
| Demand / forecast / event demand | Planning input and calculation authorities |
| Replenishment recommendation | Recommendation runtime snapshot |
| Order recommendation / approval | Request Order authority |
| PO / production progress | Purchase Order authority |
| Factory inventory | `factory_stock` + `factory_stock_movements` |
| Overseas inventory | `overseas_inventory_snapshot` + `overseas_inventory_movements` |
| Allocation / reservation | Canonical allocation and reservation records |
| Shipment lifecycle | `shipments` + `shipment_lines` |
| Route plan | current `shipment_routes` version + `shipment_route_nodes` |
| Actual logistics history | append-only `shipment_events` |
| Warehouse receipt | Inbound receipt authority |
| Control Tower | read models, exception projections, action routing only |

The Control Tower may cache a read model for performance, but the cache is disposable and rebuildable. It may not become a new source of truth.

## 3. Version-1 User Outcomes

The page must let an operator answer:
- What is at risk now and within 90 days?
- Which risk is caused by missing demand data, insufficient inventory, late production, late shipment, missing allocation, or delayed receipt?
- What has already been approved or committed?
- Which action is required, who owns it, and by when?
- Which shipment is currently moving, where is it, and what is its current ETA?
- Which exception changed since the last review?
- Can the operator navigate directly to the authoritative module and record?

## 4. Page Structure

### 4.1 Scope Bar
Company · Country · Marketplace · Factory · Warehouse / logistics region · Risk horizon (0–18 / 19–30 / 31–45 / 46–90 days) · Date range · SKU / Series / Category · Owner · Severity · Last refreshed time.

Filters apply to every KPI, queue, chart, shipment, and exception on the page. Hidden cross-company aggregation is prohibited.

### 4.2 Executive KPI Strip
Critical supply risks · Stockouts within 18 days · Uncovered order requirements · Late PO / production lines · Shipments at risk · ETA delays · Awaiting receipt · Inventory discrepancies · Missing-data blockers.

Every KPI is clickable and applies the corresponding queue filter. Counts must be computed from the same scoped read model used by the rows.

### 4.3 Action Queue (primary workspace)

| Field | Rule |
|---|---|
| `exception_id` | Stable projection identity |
| `exception_type` | Canonical exception family |
| `severity` | critical / high / medium / low / info |
| `status` | open / acknowledged / in_progress / resolved / dismissed |
| `source_module` | Authoritative origin |
| `source_entity_type` | Recommendation, PO line, Shipment, Receipt, etc. |
| `source_entity_id` | Direct traceability |
| `company` | Required where applicable |
| `sku` | Nullable for shipment-level issues |
| `warehouse_id` | Nullable |
| `shipment_id` | Nullable |
| `required_action` | Human-readable next action |
| `action_due_at` | Derived or assigned deadline |
| `owner_user_id` | Phase-2 identity-ready; nullable in Phase 1A |
| `first_detected_at` | When exception first became true |
| `last_detected_at` | Latest projection time |
| `resolved_at` | Resolution timestamp |
| `reason_codes` | Explainable contributing factors |

Version 1 may derive this queue at runtime. A future persisted `supply_chain_exceptions` table is permitted only when acknowledgment, assignment, SLA, and resolution history require persistence. It must reference the source authority rather than copy transaction truth.

### 4.4 Supply Risk Board
Group by risk horizon and show: SKU / Site / Company; projected stockout date; required arrival date; latest dispatch date; exact gap; recommended quantity; committed incoming; uncovered requirement; risk reason; calculation snapshot timestamp; link to Recommendation / Request Order.

No risk may be marked safe when required inventory, ETA, forecast, or allocation data is missing.

### 4.5 Order and Production Board
Recommendations awaiting review · Approved requirement without PO · PO overdue to start · PO completion behind plan · Completed stock awaiting allocation · PO supply allocated more than once · Quantity variance / cancellation impact.

### 4.6 Shipment and ETA Board
Awaiting shipment confirmation · Reserved but not shipped · In transit · Delayed against current ETA · Route exception · Delivered but not received · Partially received · Receipt variance.

The embedded map may reuse the 3D Global Shipment Map component, but the full map page remains a separate operational module.

### 4.7 Data Health Board
Missing master data · Missing carton / lead-time / warehouse mapping · Route template unresolved · Location unresolved or unverified · Missing ETA · Stale carrier event · Invalid inventory relationship · API / import failures.

Data health issues must never silently convert to zero or Safe.

## 5. Exception Model

### 5.1 Initial Exception Families
`SUPPLY_STOCKOUT_RISK`, `SUPPLY_UNCOVERED_REQUIREMENT`, `ORDER_APPROVAL_OVERDUE`, `PO_NOT_CREATED`, `PO_PRODUCTION_DELAY`, `PO_COMPLETED_UNALLOCATED`, `ALLOCATION_CONFLICT`, `RESERVATION_MISMATCH`, `SHIPMENT_DISPATCH_DELAY`, `SHIPMENT_ETA_DELAY`, `SHIPMENT_ROUTE_EXCEPTION`, `SHIPMENT_STALE_TRACKING`, `DELIVERED_NOT_RECEIVED`, `RECEIPT_VARIANCE`, `INVENTORY_NEGATIVE_AVAILABLE`, `INVENTORY_MOVEMENT_MISMATCH`, `MISSING_CALCULATION_INPUT`, `MISSING_ROUTE_OR_LOCATION`, `API_OR_IMPORT_FAILURE`.

Final thresholds and event-to-exception rules remain **blocked** by the upstream closed-loop finalization.

### 5.2 Deduplication
Deterministic key: `exception_type + source_entity_type + source_entity_id + scope discriminator + active calculation / route version`. Repeated refreshes update the projection; they must not generate duplicate alerts. A materially new recommendation version or route version may create a new exception identity while retaining lineage.

### 5.3 Resolution
Exceptions resolve from authoritative state changes. Clicking "Resolve" must not falsify the underlying transaction. Manual dismissal, if allowed, requires reason, actor, timestamp, and expiry/recheck policy.

## 6. Read-Model Contract

Recommended endpoint: `GET /api/control-tower/overview`

Request scope: `company, country, marketplace, factory_id, warehouse_id, risk_horizon, date_from, date_to, severity, owner, sku`

Response sections: `meta`, `kpis`, `action_queue`, `supply_risks`, `order_production_risks`, `shipment_eta_risks`, `inventory_risks`, `data_health`, `map_summary`.

Requirements: one coherent `as_of` timestamp; source calculation / route versions exposed; server-side scope enforcement; no N+1 request per SKU or Shipment; loading, empty, partial-data, stale-data, and error states are distinct; stale response protection when filters change quickly.

## 7. Permissions and Actions
Phase 1A may route users to authoritative pages without implementing final RBAC. Phase 2 must enforce: view scope by company / warehouse / module; acknowledge / assign / dismiss exception; approve recommendation; create or update order; confirm shipment; add manual logistics event; receive inventory; export evidence.

The Control Tower never bypasses an authoritative module's validation or approval state.

## 8. Refresh and Notification
Version 1: manual refresh; page-load refresh; optional periodic read refresh; show `as_of` and source freshness; do not create duplicate notifications.
Future: event-driven projection; SLA escalation; email / Slack / Teams; role-aware subscriptions.
Notifications are downstream of exception truth and are not part of the initial build gate.

## 9. Build Gate and Acceptance

Implementation may begin only after these are finalized and verified:
1. 90-Day replenishment formula and risk windows.
2. Qualified Incoming and ETA treatment.
3. Residual Uncovered Requirement.
4. Order recommendation, MOQ / carton / lead-time rules.
5. PO completion / remaining / unreceived formulas.
6. Allocation and anti-double-count rules.
7. Shipment reservation and deduction.
8. Route / event / ETA projection.
9. Delivered versus Received.
10. Inbound / Outbound and movement mapping.
11. Recalculation triggers after delay, receipt, cancellation, or variance.

Version-1 acceptance: every displayed number traces to an authority record; no parallel calculation truth; every actionable exception has a valid destination action; company / marketplace / warehouse scope cannot leak; missing data cannot appear Safe; refresh is idempotent; resolved transaction state removes the exception on reprojection.

## 10. Deferred Decisions
Final KPI definitions and thresholds; exact exception persistence schema; SLA and owner assignment; event-driven versus scheduled projection; notification channels; Control Tower layout finalization; AI prioritization or recommendation. These are intentionally not finalized in v1.

## 11. Implementation Instruction — Execute Only After Build Gate

Implement this spec only after the owner confirms that the 90-Day replenishment, risk, order, allocation, shipment, ETA, receipt, and inventory closed loop is finalized.

Before coding: (1) read the current authoritative planning specs and project-current-state; (2) inspect existing code and API adapters; (3) produce a dependency matrix proving the upstream authorities are implemented; (4) stop and report any unresolved calculation, lifecycle, or authority conflict.

Implementation rules: build as a scoped read/action orchestration layer; do not duplicate inventory, risk, ETA, order, or shipment truth; use one coherent server-side read model with an `as_of` timestamp; route actions to authoritative modules and handlers; implement distinct loading, empty, missing-data, stale, and error states; preserve company, marketplace, warehouse, SKU, Shipment, and source-version scope; no mock success, localStorage truth, hard-coded KPI counts, or frontend-only mutation; do not create a persisted exception table unless acknowledgment / assignment history is approved (submit schema for review before migration).
