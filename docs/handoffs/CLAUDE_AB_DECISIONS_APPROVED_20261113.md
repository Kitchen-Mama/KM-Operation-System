# A/B Formula Decisions Approved by Owner

Date: 2026-11-13 (Asia/Taipei).

Owner approved D5 earlier and approved the remaining seven recommendations in the latest message. These rules supersede conflicting recommendations in AB_DECISION_TABLE.md. They authorize local implementation planning and testing, not automatic cloud transactions, schema changes, trigger installation, Production deployment or GitHub push.

## Approved Rules

| Decision | Binding rule |
| --- | --- |
| D1 | Factory available supply is current stock minus reserved stock. Count a reserved physical batch once through its lineage. A valid unconfirmed shipment is separately labelled planned supply, never shipped/in-transit supply. Do not count an unreserved draft as if it owned stock; prevent multiple drafts claiming the same source supply. |
| D2 | Include shipped supply in the period it actually becomes available according to ETA. Do not omit later arrivals or make them available before ETA. Receipt replaces the same shipment supply through lineage, never adds a second copy. |
| D3 | Round cumulative net shortages to full cartons, then derive nonnegative incremental quantities after prior recommendations. Allocate each supply batch once. For shortages 250/250/250 and carton size 24: cumulative 264/504/768; increments 264/240/264. The earlier 288/240/240 example is incorrect. |
| D4 | Submitted RO/draft PO offsets demand only when quantity, ownership, expected completion date, status and supply identity are valid. Otherwise warn, without assuming certain supply. RO conversion to PO replaces the same supply rather than counting both. Use completion for factory readiness, and route-adjusted arrival for destination availability. |
| D5 | Regular Forecast excludes Special Event. Add event demand exactly once in both Sales Driven and Forecast Driven, replenishment, procurement and AI planning. Do not rewrite existing Forecast data. |
| D6 | Net valid existing commitments, including manual/AI drafts and submitted Plans, once along their lineage. When regenerating AI drafts, exclude the old AI rows being replaced from the netting inputs for that replacement operation; otherwise recommendations can oscillate to zero. Submitted or converted commitments must not be silently replaced. No multi-source over-allocation. |
| D7 | Inventory and Order Planning use the same business calculation date D. Order Planning waits for that day's Inventory calculation to succeed; no silent fallback to yesterday. Preserve and display the sales source's latest complete date separately; missing later days are not zero sales. |
| D8 | Destination availability for ongoing PO supply is completion date plus applicable route lead time from existing master data. Missing route/date/lead time is explicitly unknown with a warning, not zero days or an invented default. |

## Implementation and Review

1. Record the precise files, interfaces, date boundaries, units, rounding and supply lineage touched before broadening implementation.
2. Preserve raw failed runs and negative controls. Give hand-calculated examples for every rule, including tier boundaries, cross-month events, partial completion, partial receipt and cross-company/site ownership.
3. Demonstrate conservation: one physical supply batch cannot simultaneously remain available at factory and also be counted as an independently owned planned/shipped/received batch. Subtracting reservation from factory availability and representing the same batch in planned supply is a reclassification, not an extra physical quantity.
4. Batch or cache reads only within a proven safe scope. Invalidate after writes; compare functional output and read/write/lock effects before claiming performance equivalence.
5. Sandbox end-to-end tests and any schema/scope/trigger changes still require a precise approval request. No automatic Production data repair.

## Current Coordination

- Codex alone is handling the Administration-only release requested by Owner. Claude continues local fixes; do not deploy, push or mutate the Admin release base concurrently.
- At document creation the Admin release is NOT complete. Production baseline is 319, IU4N1; Sandbox baseline is 32. Sandbox 01_ save/readback is in progress. Await the final release report for actual new versions and hashes before rebasing joint candidates.
- Site Inventory route add/edit/delete/recovery remains highest-priority repair owned by Claude. Codex has not modified inventory-replenishment.js.
- Four Production shipment tests remain paused; no new Plans/dispatches/documents were produced in that attempt.
- N1 local fix in 31_ and necessary callers is already approved: require genuine dispatch evidence and valid status/version before receipt; preserve successful receipt replay.

## Reporting

For each work item distinguish analysis, local implementation, independent review, Sandbox verification and Production release. State exact remaining decisions and owner actions. Approved business semantics are not proof that the current implementation already follows them.
