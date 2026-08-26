# F1-7N-FB-4B — production data-integrity closure

**Status:** implementation record. Local commit only; not pushed, not deployed. **No live cleanup, no DB write, no
Drive write, no status transition, no email, no Demo mutation.**
**Date:** 2026-08-26. **PRE HEAD** `7484961` = `origin/main`, clean.

---

## §B — Execution Plan: three physical rows under one primary key

### B.1 The exact call path

| step | first Save | Add Route | retry after failure |
| --- | --- | --- | --- |
| page collects routes | `data-line-id` absent → `_newDraftLineId()` mints `SADL-<random>` | second row gets its own random id | both rows keep the ids from before |
| completeness gate | `_isRouteComplete` | same | same |
| route-context gate | 1 context → proceed | **>1 context → blocked client-side** (`MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1`) | same |
| header | `upsertShippingAllocationDraft` → `sadUpsertDraftHeaderCore_` | same header | same |
| lines | `upsertShippingAllocationDraftLines` → `sadUpsertLinesKeyedCore_` | same | same |

### B.2 Why the already-persisted first route was appended again

A closed loop between two individually-defensible pieces:

1. The page mints a **client-side** line id (`_newDraftLineId()` → `'SADL-' + Math.random()…`).
2. For a K2 draft the writer **deliberately discards** that id and mints the canonical `SADL-K2-<hash>` (R6F2G:
   an arbitrary caller id must never name a K2 line).
3. **The response never returned the id it actually persisted, and the page never adopted one.**
4. The next save therefore sent the same client id again. `procurementFindRow_` did not find it (the row carries
   the K2 id), the code fell into the INSERT branch, minted the **same canonical id** — and appended, because
   **nothing checked whether that id already existed.**

Every save of that logical line appended one more physical row. Three saves at 11:18:11 / 11:19:53 / 11:20:07 →
three rows, all `planned_qty` 800. The evidence is fully explained; nothing here is intermittent.

### B.3 / B.4 Canonical identity, resolved from the frozen K2 contract — not assumed

| grain | identity | source |
| --- | --- | --- |
| header | the 10-dimension K2 group key → `SADH-K2-<FNV1a>` | frozen K2 contract, `16_` |
| route | **a header dimension, not a row** — source/destination/method/last-mile/group_no | same |
| line | `sku \| site_sku \| window_code` **within the draft** → `SADL-K2-<FNV1a>` | `sadK2LineNaturalKey_` |
| same SKU across two routes | **two different headers** when the route group differs; **the same line** when it does not | *"Different source warehouse / destination / shipping method / last-mile / recommendation_group_no ⇒ a SEPARATE Header… A Header must never contain lines with incompatible route grouping values."* |

So a second route for one SKU is never a second line under one header. That is why the batch pre-flight refuses it
by name instead of letting one quantity silently overwrite the other.

### B.5–B.8 What changed

- **Identity resolution ladder** (both the keyed and the atomic core): explicit id *(identity-checked)* →
  **canonical id** → natural key → insert. An explicit id naming a row with a different
  `(sku, site_sku, window_code)` is `LINE_IDENTITY_CONFLICT`, zero writes.
- **Pre-insert assertion**: `LINE_PRIMARY_KEY_ALREADY_EXISTS` — nothing may append onto an existing PK.
- **Batch pre-flight** before any write: two incoming lines resolving to one canonical identity →
  `DUPLICATE_LINE_IDENTITY_IN_BATCH`, **both quantities named**, zero writes.
- **Read-after-write** (`sadVerifyDraftLines_`): every expected line exactly once, exact quantity, PK uniqueness,
  no unauthorised line. Failure → `LINE_OUTPUT_VERIFICATION_FAILED`, nothing rolled back, rows reported.
- **The response now returns `persisted_lines`**, and the page **adopts** them into both the draft model and the
  DOM attribute — closing the loop that produced the duplicates.
- The multi-route refusal is now a **structured envelope** with a reason code, not a bare `SAVE_FAILED`.

### B.9–B.12 Duplicate repair — **PROPOSED, NOT EXECUTED**

`system.executionPlanDuplicateLineDiagnostic` / `TEMP_EXECUTION_PLAN_DUPLICATE_DIAGNOSE` (read-only) reports each
duplicate group by **sheet row number** and **business-content checksum**, classifies
`BYTE_IDENTICAL_BUSINESS_CONTENT` vs `CONTENT_CONFLICT` (audit timestamps excluded — three rows written at three
times are still identical business content), names the **proposed survivor** (lowest sheet row = first written),
and lists the FK effects.

**Expected classification of the live rows:** all three carry `planned_qty` 800 with the same identity, so the
group is **BYTE_IDENTICAL_BUSINESS_CONTENT** — mechanically repairable, keeping the 11:18:11 row.

**FK effects:** none. `shipping_allocation_drafts` is referenced *by* the line, never the reverse; the Submit
authority re-reads lines by `allocation_draft_id` and stores no line id in `shipping_plan_lines`. Quantity effect:
none for identical groups.

`TEMP_EXECUTION_PLAN_DUPLICATE_CLEANUP` exists but is **DRY RUN by default** and requires all three gates:
mode exactly `COMMIT`, a **live-recomputed** confirmation checksum, and a byte-identical classification. It writes
a **rollback journal before the first delete**, deletes highest-row-first, and re-validates afterwards.
**It was not run.**

---

## §C — ETA date-only projection

**FB-4A fixed half the path, and the live evidence proved it.** FB-4A normalized the *projected* `eta` field in
`57_`. But nothing on the client reads that field: `operation-system-db-api.js` builds its shipment view-model with
`normalizeShipmentRecord(s.raw)` — from the **raw row passthrough**. A Sheets date cell is a `Date`, and
`JSON.stringify(Date)` calls `toISOString()`, so `raw.eta` left the server as `2026-08-30T16:00:00.000Z`: Asia/Taipei
midnight on the 31st serialized as the previous day in UTC. Hence *"saved and verified: 2026-08-31"*, a blank date
input (the page's `^\d{4}-\d{2}-\d{2}$` test fails on an ISO timestamp) and a card reading the UTC string.
**The write was correct throughout.**

**Fix:** normalization moved to the **serialization boundary** (`shipWsNormalizeRawRow_`), applied to the raw row:
date-only columns → `yyyy-MM-dd`; any other `Date` → `yyyy-MM-dd HH:mm:ss` (a timestamp keeps its time rather than
being flattened); non-Date cells byte-identical. Timezone is `Session.getScriptTimeZone()` — the single authority
`02_ formatValue_`, `11_`, `12_` and `13_` share. **No ISO/UTC/`Z` string can leave the module for a shipments row.**

`§C.7` unchanged and re-asserted: no shipment event, no position change, no status change.

---

## §D — Purchase Order template

**Read-only analysis only; the hard gate and zero-write semantics are untouched and no fallback template was
introduced.** Selection dimensions (`DGS_SCOPE_DIMS_`): `series, sku, supplier_id, factory_id, carrier_id, country,
marketplace, language`, plus `related_entity_type`/`document_type` = `purchase_order`, `status='active'`,
`is_active`, and the effective window. A **blank** template dimension is a wildcard; a **populated** one must match
exactly.

`dgsSelectPoTemplate_` answers `PO_DOCUMENT_TEMPLATE_UNRESOLVED` with a count of zero — true and useless, because it
cannot distinguish *no row exists* from *a row exists but its factory_id differs* from *a row matches but its window
closed*. `dgsExplainPoTemplateCandidates_` now evaluates **every gate independently for every row** and returns the
exact rejection per candidate, the candidate count, the PO-shaped row count, a `CONFIGURATION_REQUIRED` vs
`RUNTIME_DEFECT` verdict, and — when unresolved — the **exact `document_templates` row a fix would need**, flagged
as a proposal. **No row was written.**

Which of the four §D.3 causes applies to the tested PO is **not asserted here** — it needs the diagnostic run
against live data.

---

## §E — Recommendation vs Order Qty authority

### The authority matrix

| authority | kind | binding? |
| --- | --- | --- |
| raw gap | calculation | no |
| recommendation | calculation | no |
| cartonized recommendation (*Suggested*) | calculation | no |
| **persisted `order_qty`** | **persisted** | **YES — the send authority** |
| UI displayed Order Qty | display | no — must equal the persisted value whenever a draft exists |
| Send intent | asserted | no |
| Send persisted read-back | persisted | yes |

### Why the UI showed 400 while the DB held 360, with no user edit

`_roRowOrderQtyDisplay_` and `_roSendOrderQty_` both ended with the same fallback: when the persisted tier row did
not resolve, they returned `_roEffectiveOrderQty` — an **ephemeral recomputation** from the live recommendation. The
page therefore displayed a number it had never persisted **and asserted it to the server**, which compared it with
the real 360 and refused with `QUANTITY_DRIFT`. The barrier did its job; the number should never have existed.

**Fix (both functions, same ladder):** local edit → persisted `order_qty` (a persisted **0** returns 0, §E.6) → if
the tier row exists but is blank, **`null`** → if the SKU has a canonical draft at all, **`null`** → only a genuinely
manual SKU falls back to the ephemeral value. Display and Send now read the **same** authority, so §E.4 holds by
construction: a freshly rendered AI-Plan row cannot assert a quantity that differs from its own DB output.
**The Send barrier was not weakened** — §E.7 is intact; it simply stops being fed a fabricated number.

`KMRECAUDIT.authorityMatrix` (§E.8) puts all seven authorities side by side and names each divergence
(`DISPLAY_DIVERGES_FROM_PERSISTED`, `INTENT_DIVERGES_FROM_PERSISTED`, `READBACK_DIVERGES_FROM_PERSISTED`) plus the
§E.3 refresh contract. Run against the live CO1150-N numbers it returns `AUTHORITY_CONFLICT` with the refresh
contract **VIOLATED**.

---

## §F — Gap ceiling / cartonization: **STOP. This is a frozen-spec conflict, not a defect.**

**Owner function:** `KMCALC.calculateSuggestedOrderQty` (`assets/js/core/supply-planning-calculations.js`):

```js
return Math.ceil(need / upc) * upc;      //  ceil(5276 / 40) * 40 = 5280
```

**The owner's assertion contradicts a frozen specification**, and the specification is explicit and repeated:

| section | text |
| --- | --- |
| header, *Canonical Owner For* | **“Shipping carton = FLOOR; Ordering carton = CEILING”** |
| §14 | `Suggested Order Qty = CEILING(Net Order Need ÷ Units Per Carton) × Units Per Carton` — example 300 → **320** |
| §31 (CANONICAL v4.1) | *Calculated Gap → Shipment FLOOR → Residual Production → **Order CEILING*** |
| §2C.1 note | *“Shipping-from-available rounds **down**; order-to-cover-need rounds **up**.”* |
| §33 golden matrix, row 24 | `Order CEILING \| CEILING(need ÷ UPC) × UPC \| **covers full need**` |

The two rules are deliberately different: **shipping** rounds down because you can only ship whole cartons of what
you actually have, so it can never exceed the gap — **the owner's assertion already holds there**. **Ordering**
rounds up because a partial carton cannot be produced, and flooring would leave a permanent shortfall.

**Impacts of each alternative for the live case (gap 5,276, UPC 40):**

| option | qty | cartons | effect |
| --- | --- | --- | --- |
| current CEILING | **5,280** | 132 | +4 over gap; need fully covered |
| FLOOR | 5,240 | 131 | −36 under gap; a permanent shortfall that no later run recovers |
| CEILING capped at gap | 5,240 | 131 | identical to FLOOR whenever the gap is not a carton multiple; also breaks the whole-carton invariant if capped literally at 5,276 |

**Nothing was changed.** `calculateSuggestedOrderQty` still uses CEILING, the shipping FLOOR is untouched, and a
test asserts both. §F.6 diagnostics (`KMRECAUDIT.cartonAudit`) report `raw_gap`, `allocatable_supply`,
`pre_carton_qty`, `units_per_carton`, `rounding_mode`, `final_recommended_qty` and `excess_over_gap`, plus both
alternatives — so the decision can be taken on numbers.

**This needs an explicit owner decision:** either the ORDER path keeps CEILING (§14/§31 stand as written), or the
spec is amended — which would change carton counts, shortage coverage and downstream PO totals for every SKU whose
gap is not a carton multiple.

---

## Not done, and said plainly

- **No live cleanup, no DB write, no Drive write, no status transition, no email, no Demo mutation, no migration,
  no deletion, no push, no deploy.**
- **The duplicate rows were not deleted** — they are classified and a gated tool exists, unrun.
- **The §F rule was not changed** — it is a STOP, reported above.
- **Which §D cause applies to the tested PO is not asserted** — the enhanced diagnostic must be run live.
- **No live evidence of any kind was produced**; every conclusion here is from source and from the reported rows.
