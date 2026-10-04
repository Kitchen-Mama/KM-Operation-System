# S8-R4B-2D — THE SITE-SCOPED EXPOSURE READ + THE R42 RELEASE CUT

**Status: IMPLEMENTED · NOT SYNCED · NOT DEPLOYED · NOT PUBLISHED · TOKENS NOT ROTATED.**

R4B-2B deferred six of the nineteen Site Inventory tables to a lazy per-Site cache. R4B-2C then proved what
that cache was holding: the request filling it carried **no scope at all**, so every Site was served every
Site's exposure rows and then told to keep them under its own key. The key was per-Site. The data never was.

This round makes the second half true.

---

## 1. What the request now is

```
EXPOSURE_REQUEST = {
  only:         [ shipments, shipment_lines, shipping_plans, shipping_plan_lines,
                  shipping_allocation_drafts, shipping_allocation_draft_lines ],
  recentWindow: true,
  siteScope:    { company, country, marketplace }
}
```

Same action. Same router. No contract bump. `siteScope` is an **optional field on the payload** of
`inventoryReplenishment.workspace.get`, which has existed since the deployed SIR stamp.

### The identity is the triple, not the id

`EXPOSURE_REQUEST_SCOPE_FIELDS = company + country + marketplace` while
`CACHE_KEY_FIELDS = company + country + marketplace_id`. These differ **by design**.

None of the six exposure tables stores `marketplace_id`; all six store the triple. A server asked to scope by
id would have to open the `marketplaces` master to translate it — a **seventh sheet read**, at the 0.8–1.3 s
per-sheet floor R4B-2 measured, to learn something the browser already holds. A map key and a request identity
are allowed to differ, and conflating them buys that read for nothing.

The browser resolves the triple in `_irExposureSite_()` from the **first-layer** `marketplaces` table, which
is already in memory. `SEVENTH_TABLE_READ_COUNT = 0`.

---

## 2. The closure — and why it is not six row filters

The obvious implementation is `table.filter(row => row.triple === scope)` on all six. It is wrong in two ways
that **both lose quantity silently**, which is the failure mode this page has already paid for once.

**Trap 1 — filtering `shipments` on its own marketplace deletes exactly the merged headers.** A merged
shipment carries `marketplace = MULTI` by construction. Its lines reach their real sites through frozen
`shipping_plan_line` lineage; that machinery exists for no other reason. A header filter drops every merged
header, and the Shipping Shipment card shows less incoming inventory than exists with nothing on screen
saying so.

**Trap 2 — `shipping_plan_lines.marketplace` is not the scope field.** It is the line's *real* marketplace.
The shipped client deliberately attributes a line to its **parent plan's** triple
(`_irBuildExposureIndexes_` builds `lineReceiverById` from `planById`, never from the line). Scoping on the
line's own column would be a *second business interpretation* of shipment ownership.

So the server reproduces the shipped rule rather than reinventing it:

```
P  = shipping_plans                    own triple == scope AND a SPECIFIC receiver
PL = shipping_plan_lines               shipping_plan_id ∈ P
SL = shipment_lines                    shipping_plan_line_id ∈ PL
                                       OR lineage BLANK and parent header == scope
S  = shipments                         named by SL  (← this retains the MULTI header)
                                       ∪ headers whose own triple == scope
D  = shipping_allocation_drafts        the client's own draft scope rule, verbatim
DL = shipping_allocation_draft_lines   allocation_draft_id ∈ D
```

A **present-but-unresolvable** lineage *fails closed* — dropped, never fallen back to the header — because
that is what `_irBuildShipmentRemainingByReceiver` does. A server that disagreed with the client about which
shipment belongs to whom would be worse than one that does not scope at all.

`S` deliberately includes in-scope headers that name no kept line. Nothing consumes them today, and the union
is 58 rows system-wide; a scoped read that could return *fewer* headers than the site has is not a trade worth
making for nothing.

Draft **status is not read** by the closure. Scope is a boundary; dropping a cancelled draft server-side would
be this handler authoring business logic it is forbidden to author. The client still drops it, as it always did.

---

## 3. Fail closed, in both layers

`INCOMPLETE_SCOPE_WIDENS_TO_GLOBAL = NO`.

| layer | behaviour |
|---|---|
| `buildInventoryReplenishmentRequestDTO` | a blank or malformed scope is **forwarded**, never dropped |
| `handleInventoryReplenishmentWorkspaceGet_` | refuses **before `openTarget()`** — zero sheet reads |
| `sirWorkspaceBuild_` | throws on its own, independently of the orchestrator |

The DTO behaviour is the one worth stating plainly. Dropping a blank field there would turn a caller's bug
into an **all-site read indistinguishable from a correct one** — the single failure this round exists to make
impossible. A `typeof === 'object'` gate would have done exactly that to a string or an array, so there is no
such gate: the three fields are read off whatever arrived, blanks and all, and 60_ refuses by name:

```
INVENTORY_REPLENISHMENT_SITE_SCOPE_INCOMPLETE      details.missing names the field
INVENTORY_REPLENISHMENT_SITE_SCOPE_NOT_APPLICABLE  a scope on a non-exposure request
```

The second exists because **ignoring a scope is widening it**. `only` is a generic mechanism with three
shipped callers; redefining it for all of them to serve one page would be the silent kind of change, so a
scope that arrives on any other request is refused rather than quietly discarded.

The refusal lives in two places on purpose. No single mutation removes it.

---

## 4. The purity constraint, stated rather than hoped for

`sirWorkspaceBuild_` is documented PURE and **four suites lift it alone** — one of them
(`co1100r-live-hydration-closure`) with nothing in scope but `SIR_WORKSPACE_TABLES_`, `sirCap_` and
`SIR_WS_ROW_MAX_`. Calling a sibling helper unconditionally is the regression that once killed all four with a
ReferenceError, and `T7b` exists because of it.

So the scope helpers are reached **only when a scope was asked for**:

```js
var _scopeAsked = (payload.siteScope !== undefined && payload.siteScope !== null);
if (_scopeAsked) { … sirWsSiteScope_ … sirWsSiteScopeClosure_ … }
```

That guard is a contract, not a micro-optimisation, and `E7` in the new suite pins it by executing an
unscoped build with only the R4-era helper set in scope.

---

## 5. What this is NOT

**It is not a latency fix and must not be approved as one.**

`readTable` is `sheet.getDataRange().getValues()` — every row is read before a predicate can run — and the
closure needs four of the six tables fully in memory anyway. The six sheets hold **58 rows in total across
every site**.

```
ROW_SCOPE_CAN_AVOID_WHOLE_SHEET_READ = NO      EXPECTED_LATENCY_BENEFIT = LOW
SERVER_TABLE_READ_COUNT = 6                    BROWSER_REQUEST_COUNT = 1
```

The purposes are a correct Site data boundary, a smaller scoped response payload, future scalability, and a
per-Site cache whose contents are finally true. R4C measures the bytes and the time.

---

## 6. The client filter is retained, and is now the second boundary

`SERVER_SCOPE_DEFENSE = YES` · `CLIENT_SCOPE_DEFENSE = YES`

Nothing was removed from the client. `_shippingDraftLinesFor` still filters drafts by country/marketplace/
company, and `_irBuildShipmentRemainingByReceiver` still attributes every line through the parent plan. They
stop being the *only* defence and become the *second* one — which is also why a published frontend against a
pre-R42 backend stays correct on screen while being silently unscoped on the wire.

Both sides enforce the **same** canonical identity semantics. There is no second business rule.

---

## 7. R42

```
RELEASE            F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42
RELEASE OWNERS     60_api_v1_inventory_replenishment_workspace.gs   (first ownership since R6-R5)
                   63_api_v1_system_health.gs                       (manifest)
CARRIED            01_router.gs at R41 — no action added or removed, no route moved
NOT REBUILT        90_ — no assets/js/core module changed
ACTION CONTRACT    18, UNCHANGED.  SYS_REQUIRED_ACTION_LIST_VERSION_ 14, UNCHANGED.
```

**This reverses R4B-2A's `BACKEND_RELEASE_REQUIRED = NO`, and the earlier finding was not wrong.** It was true
of what it was asked: lazy-once needed only the `only` contract, which had shipped. The operator then required
per-Site *data*, and the deployed handler has no scope parameter at all. The premise was replaced, not the
reasoning.

R41 was not joined, for the reason R41 was itself cut rather than folded into R40: R41 is already cut, against
a tree in which 60_ had not changed. An id that names two trees cannot answer the question it exists for.

### Two gates were pinned at one end and are now pinned at both

- `s7-r4-production-deploy-surface` **H2a** read `POST_SHA..HEAD` — a claim about R41 written as a claim about
  every round that would follow it. This is the round that proves it, by changing a third runtime file. R41's
  interval now ends at R41's own release commit (`8856aeb`), and R42 has its own paragraph.
- `s8-r4b1-factory-guard-read-transport` **E2a** asserted `routerStamp === headRelease`, which is what
  *ownership* looks like and was true only while 01_ owned the newest release. A stamp equal to the head
  release while the file has not changed is the marched stamp the ledger forbids. It now pins R41 at both ends.

Two mutants were re-aimed for the same reason: **M13** dropped `01_router.gs` by name (injecting no fault once
01_ stopped being a runtime owner) and is now parameterised on the release's runtime owner; **M14**'s vacuity
guard was a proxy — "01_ is currently claimed as an owner" — that expires the moment 01_ leaves ownership, and
now asserts the fact it actually defends: the ledger places the router at R41.

---

## 8. Tests

| suite | result |
|---|---|
| `site-scoped-exposure-read-s8-r4b-2d.test.js` (new) | 93 passed · 17 mutants caught · 0 vacuous |
| `site-inventory-lazy-once-exposure-s8-r4b-2b.test.js` (re-aimed) | 142 passed · 20 mutants caught |
| `fc-target-rule-release-stamp-r2b-a2-r5-f3.test.js` | 106 passed · 16 mutants · vacuity clean |
| `s8-r4b1-factory-guard-read-transport.test.js` | 67 passed · 10 mutants |
| `live-read-contract-and-stage-accounting-…-r4-a1.test.js` | 124 passed |
| `s7-r4-production-deploy-surface.test.js` | 90 passed (H2c reads committed state) |

The new suite **executes the shipped server bytes** against a three-site fixture carrying one merged shipment
and one dangling lineage. Two assertions in `site-inventory-lazy-once-exposure` were **reversed on purpose**
and the old text is kept beside the new:

- **C2f** asserted the request carried no scope. That was true, and it was the defect.
- **E3** asserted `BACKEND_RELEASE_REQUIRED = NO`. See §7.

---

## 9. Still open

```
CACHE_TOKEN_ROTATION_REQUIRED = YES   ·   PERFORMED_IN_THIS_ROUND = NO   ·   DEPLOY_BLOCKED_UNTIL_DONE = YES
CURRENT_APPLICATION_TOKEN = p1-cumulative-20261002
CURRENT_IR_CSS_TOKEN      = ircompactrecon-20260905
```

Three frontend files change in this round and they sit under two token series. Rotation is deferred to
**S8-R4C-P1 by instruction (§22)**, because R4C publication must use the *final* runtime bytes — rotating now
would spend two tokens that cannot be reused if anything moves again.

The half-update analysis from R4B-2B still stands and is unchanged by this round: **old JS + new index** ships
the whole architecture to nobody who already uses the app while every measurement says it shipped; **new JS +
old CSS** emits six state classes with zero rules.

Also still open, recorded and not hidden:

- **Write-driven invalidation remains debt.** A write made on another page does not invalidate this page's
  exposure cache. Refresh is the operator-controlled path until a canonical write signal exists.
- **Hard-reload persistence and a server cache remain out of scope**, by instruction.
- **`PHASE1_CUMULATIVE_RELEASE_RECONCILIATION_R1.md`** pins `CURRENT_HEAD_BACKEND_RELEASE = R40`. It is a
  historical artifact pinned at `b783076`; anyone executing it after R42 must re-derive gate 1 from 63_.

---

## 10. The numbers

```
FIRST_LAYER_TABLE_COUNT = 13          EXPOSURE_READ_TABLE_COUNT = 6      SEVENTH_TABLE_READ_COUNT = 0
FIRST_EXPOSURE_REQUEST_COUNT_PER_SITE = 1                                CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1
PER_SKU_EXPAND_REQUEST_AFTER_READY = 0                                   20_SKU_ADDITIONAL_REQUEST_COUNT = 0
SITE_A_FIRST = 1  SITE_B_FIRST = 1  RETURN_A = 0  RETURN_B = 0           CROSS_SITE_PREFETCH_REQUEST_COUNT = 0
SITE_A_TO_B_ROW_LEAK_COUNT = 0        SITE_B_TO_A_ROW_LEAK_COUNT = 0     CROSS_SITE_ROW_LEAK_COUNT = 0
MULTI_HEADER_PRESERVED = YES          AMBIGUOUS_LINEAGE_FAIL_CLOSED = YES
FALSE_EMPTY_RISK_COUNT_POST = 0       QTY_ZERO_REGRESSION_REACHABLE = NO
READ_TABLE_COUNT = 6   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0    SCHEMA_CHANGE_REQUIRED = NO
EXPOSURE_DEPENDENCY_IN_WRITE_PAYLOAD_COUNT = 0                           UNRELATED_CALLER_BEHAVIOR_DRIFT_COUNT = 0
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGES = 0
APPS_SCRIPT_DEPLOYMENT_PERFORMED = NO                                    FRONTEND_PUBLICATION_PERFORMED = NO
```
