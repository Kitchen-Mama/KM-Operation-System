# Execution Plan multi-route persistence — F1-7N-FB-4B-ADDENDUM

**Baseline:** FB-4B commit `83fc33f`. No amend, no live cleanup, no Demo-seed change.

---

## 1. The functional gap

`+ Add Route` has always let one SKU carry several Execution Plan routes, but the persistence path refused any SKU
holding more than one distinct route context:

```
MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1 — N distinct From/To/Method routes in one Draft. NOT SAVED TO DB.
```

That refusal reasoned **correctly** from the frozen K2 contract — a Header **is** one shipment group, so two routes
can never be two lines under one header — and then drew the **wrong conclusion**. Two routes are **two headers**.

**The server already implemented this.** `sadResolveActiveDraftK2OrK3_` resolves a route-complete header by the
10-dimension K2 group key: the same route REUSEs its header, a different route CREATEs its own `SADH-K2-`.
Nothing on the server had to change for multi-route to work. The client simply never grouped — it built **one**
header from `route0 = complete[0]` and sent every route of the SKU as lines beneath it, which collided on line
identity and had to be refused.

### The call path that produced the refusal

| Step | Location | Behaviour before |
|---|---|---|
| collect | `_saveAllocationDraftFromDom` | rows carried no header binding |
| flush | `_flushDraftDbPersist` | `distinctRouteContexts(complete).length > 1` → **refuse, zero write** |
| header | `_flushDraftDbPersist` | `route0 = complete[0]` → **one** header for the whole SKU |
| state | `replenAllocationDraft.allocationDraftId` | a **single scalar** — no room for a second header |
| adopt | `_irAdoptPersistedLineIds_(sku, lines)` | matched on `sku\|site_sku\|window_code` only — **identical for every route** |
| hydrate | `_hydrateAllocationDraftFromDb` | sorted by `updated_at`, took `[0]` — **one** header |
| readback | `handleGetShippingAllocationDraftWorkspace_` | >1 active header in the K3 scope → **`BLOCKED_CONFLICT`** |
| submit | `_replenActiveAllocationDraftIds` | read the single scalar |

---

## 2. Canonical header identity (§C audit)

The ten frozen `SAD_K2_GROUP_DIMENSIONS_`, in order:

`planning_cycle · company · country · marketplace · source_page · recommended_source_warehouse_id ·
recommended_destination_warehouse_id · recommended_shipping_method · recommended_last_mile_delivery ·
recommendation_group_no`

`IRDraft.K2_GROUP_DIMENSIONS` is the client mirror, and a test asserts the two arrays are **identical**, so they
cannot silently drift. `IRDraft.canonicalRouteGroupKey` is asserted equal to the server's `sadK2GroupKey_` for both
routes under test.

### Schema gap — reported, guarded, not papered over

`destination_marketplace` is an **accepted payload field but NOT a stored column** of the 30-column header. A
marketplace-logical destination therefore persists `recommended_destination_warehouse_id = ''`.

This is **bounded**, not fatal: the destination picker offers exactly **one** Amazon logical destination per
marketplace, and `company/country/marketplace` are themselves grouping dimensions — so within one station a blank
destination is unambiguous. Rather than rely on that argument, the pre-flight **detects the collapse structurally**:
two routes the UI treats as different that resolve to one canonical group key are refused with
`ROUTE_IDENTITY_NOT_PERSISTABLE` and **zero writes**. A blank column is never allowed to stand in for a permanent
identity.

`recommendation_group_no` is a grouping dimension the Execution Plan does not author (Phase-1 freeze **D-C2-1**). It
is carried explicitly as `''` so the computed key is the full ten dimensions.

**No header is re-keyed and no line FK is orphaned.** Route identity is resolved by group key; a route that moves to
a different group gets a **new** header and its old line is **soft-cancelled**, never re-keyed.

---

## 3. Route A / Route B — expected DB shape

Applied station: `Kitchen Mama / US / Amazon`, SKU `CO1100-R`.

| | Route A | Route B |
|---|---|---|
| From | CN侑鑫 | CN侑鑫 |
| To | Amazon (**marketplace-logical** → blank warehouse id) | AMZLG&S INC (**real 3PL** warehouse id) |
| Method | 美森海卡 | 美森海卡 |
| Qty | 800 | 400 |
| Header | `SADH-K2-<hash A>` | `SADH-K2-<hash B>` — **different** |
| Line | one `SADL-K2-` under A | one `SADL-K2-` under B |

Page total **1200**. Re-saving A updates only A; re-saving B updates only B. Both survive refresh; Submit sends
**both** ids. The two destinations differ in a **stored** dimension (`''` vs a real warehouse id), so this case is
grouping-sound and is proved end-to-end in the test suite.

---

## 4. The transaction (§D)

1. **Resolve the whole batch first.** `IRDraft.preflightRouteGroups(scope, sku, routes)` partitions into canonical
   groups and returns typed conflicts.
2. **Pre-flight failures are a proven zero-write** — the function returns before any request is issued, and queued
   soft-cancels are **put back** rather than dispatched, because a cancel is itself a write.
3. **Each group resolves/creates its own header**, then upserts its own line under it. Groups are written **in
   sequence**, never concurrently, so two headers of one station cannot race the server's group resolution.
4. **No `allocation_draft_id` is sent** for a route-complete save. The server's group authority is idempotent by
   construction; pinning the write to a stored id would rewrite whichever header the row last touched when its
   route changed.
5. **Adoption is scoped to one header.** Route A and Route B share the same line identity (route is a *header*
   dimension), so an unscoped adoption would hand Route B's id to Route A.
6. **Per-route reporting** — `persisted` / `not_persisted` / `indeterminate`. A timeout or transport failure is
   **indeterminate**, never reported as "not persisted"; the guidance is to reload rather than re-enter by hand,
   and a repeat of the same route updates the same row.
7. **Read-after-write** — the writer's own `sadVerifyDraftLines_` (identity, exact quantity, PK uniqueness, no
   unauthorized line) per header, plus a pre-submit **route-count** and **total-quantity** check so a wholly
   missing route is caught, not just a wrong one.

### Typed refusals

| Code | Meaning | Writes |
|---|---|---|
| `ROUTE_IDENTITY_NOT_PERSISTABLE` | two routes differ only in an unstored dimension | zero |
| `ROUTE_QUANTITY_CONFLICT` | one route identity, contradictory quantities | zero |
| `ROUTE_GROUP_PARTIAL_FAILURE` | some headers written, some not — reported per route | partial, named |

Identical duplicates within one group are **not** a conflict — they are the same line stated twice and collapse to
one, which is what makes a replayed request idempotent.

---

## 5. Multi-group readback

`handleGetShippingAllocationDraftWorkspace_` previously declared `BLOCKED_CONFLICT` whenever the K3 scope held more
than one active header — so the read path called the correct multi-route state a conflict and returned
`draft: null, lines: []`.

**The conflict test is now the group key, not the count.** Two headers claiming the **same** canonical group key are
still a conflict; distinct group keys are distinct shipment groups and are returned together.

- Two legacy K3 rows both carry blank route dims → same group key → **still `BLOCKED_CONFLICT`** (legacy behaviour
  preserved exactly, not loosened).
- One active header → `ACTIVE_DRAFT_FOUND` + `draft` + `lines`, **byte-identical back-compat**.
- Several → `ACTIVE_DRAFT_GROUP_FOUND`, `draft: null` (naming one header as "the" draft would misreport a two-route
  plan as a one-route plan), plus `drafts[]`, `draft_count`, and all `lines`.

---

## 6. The three existing duplicate rows (§E)

**No cleanup was run.** The gated tool in `68_` is untouched: `DRY_RUN` by default, a live-recomputed confirmation
checksum, a byte-identical classification, a rollback journal before the first delete.

While those rows remain:

- the **writer cannot append a fourth** — proved against a reconstruction of the three-row state;
- the **read path renders one physical row per primary key**, so three 800-unit rows never display as 2400;
- the **UI discloses** the corruption in a banner naming each identity and its physical row count;
- **Submit fails closed** for the affected SKU, both from the hydrated state and from the readback.

---

## 7. Files changed

| File | Change | Sync |
|---|---|---|
| `16_shipping_allocation_handlers.gs` | multi-shipment-group readback + duplicate-PK disclosure | **Apps Script** |
| `assets/js/utils/inventory-compat.js` | canonical grouping authority; Save validator accepts groups | frontend |
| `assets/js/pages/inventory-replenishment.js` | group-wise persistence, scoped adoption, multi-header hydrate, lifecycle, Submit gates | frontend |
| `assets/js/api/operation-system-db-api.js` | new canonical reason codes preserved | frontend |
| 5 existing suites | strengthened to the new contract (none weakened) | — |
| `…-f1-7n-fb-4b-addendum.test.js` | **NEW** — 124 assertions | — |

`APPS_SCRIPT_SYNC_REQUIRED`: `16_shipping_allocation_handlers.gs` → then publish a **new deployment version**.
`FRONTEND_DEPLOY_REQUIRED`: `inventory-compat.js`, `inventory-replenishment.js`, `operation-system-db-api.js`.
`BUNDLE_REBUILD_REQUIRED`: **NO**.

---

## 8. Tests

New suite **124 / 0**. The §F.1–§F.8 claims run **end to end**: the real client grouping drives the real shipped
server cores (`sadUpsertDraftHeaderCore_`, `sadUpsertLinesKeyedCore_`) against an in-memory sheet, and assertions are
made on the resulting rows. Only the spreadsheet is simulated.

Full sweep **355 suites → the same 4 pre-existing failures → 0 new**
(`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`,
`supply-planning-route-inventory`).
