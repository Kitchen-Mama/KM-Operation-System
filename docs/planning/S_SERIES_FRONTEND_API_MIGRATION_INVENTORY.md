# S-Series Frontend Data-Access Inventory — how every production page reaches data

> **Round:** P1-B8D-R8 §9. **READ-ONLY CENSUS. No page runtime outside Product Strategy was modified.**
> **Repo:** `Operation System` · **Branch:** `feature/product-strategy-board-p0` · **PRE HEAD:** `d7a6061`.
> **Scope:** the scripts `index.html` actually loads, in load order — **LOADED_SCRIPTS: 82**
> (78 when this census was taken at R8; the one that moved it is named in §1). That number is
> re-counted from `index.html` by `product-strategy-corrections-p1-b8d-r9.test.js` §F, so it cannot
> drift from the file it describes. A file nothing loads is not a
> production data path, and counting one would inflate this inventory with code that cannot run.
> **Method:** every source read with comments stripped before anything was counted, then each module
> read by hand where the signal was ambiguous. Evidence is a file and a line, never an impression.

This is the **frontend** counterpart to `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`, which is
action-centric and reaches down into the router and the handlers. This one asks a different
question and only the frontend half of it: **for each production module, where does its data come
from, and what would it take to move it onto the standard API?**

---

## 0. The one rule this round adds to the S mainline

> **Every new or modified production data feature defines its API contract first and wires the
> runtime second. No new browser path may read a database, a Sheet or a fixture directly.**

It is a rule about *new* work. Nothing below is being migrated by this round; the point of a census
is to know the size of the thing before promising a date for it.

### What is NOT a bypass, and must not be counted as one

`window.KM.DB.*` is a **browser-side wrapper over the same Apps Script Web App the standard API
uses**. It posts `{action, ...payload}` to `OP_DB_API_BASE_URL`
(`assets/js/api/operation-system-db-api.js:6`) and reads `{success, data}` back. A page calling
`KM.DB.getSkuDetails()` is calling an API — one with a second transport, not no transport.

Separately, the Apps Script server's own internal DB helpers (`02_core_sheet_db.gs` and friends) are
**server-side** and are not a browser data path at all. §9 is explicit that they must not be counted
as a browser bypass, and they are not counted here: this census reads `assets/js` only.

---

## 1. Classification, and the count

| Class | Modules | What it means here |
|---|---|---|
| `STANDARD_API` | **5** | Goes through `KM.transport.post` / `KM.apiFoundation` / `KM.dataAccess` with a named action |
| `LEGACY_API_WRAPPER` | **19** | Goes through `KM.DB.*` — the same endpoint and the same action vocabulary, its own fetch |
| `DIRECT_EXTERNAL_FETCH` | **1** | A raw `fetch` that is not a data read (the partial loader; see §4) |
| `PRODUCTION_FIXTURE_OR_STATIC_DATA` | **5** | Static reference data compiled into the bundle |
| `DOM_OR_LOCALSTORAGE_AS_DATA_SOURCE` | **8** | Browser storage holding domain data rather than a UI preference |
| `NO_DATA_ACCESS` | **42** | Renderers, utilities, layout, i18n (40 at R8, +1 at R9, +1 at FC-SHARE-DUAL-MODEL-R1 — see below) |

Totals exceed 78 because a module can be in two classes: `inventory-replenishment.js` is a
`LEGACY_API_WRAPPER` **and** keeps allocation drafts in `sessionStorage`.

### The one count that moved, and the diff that moved it (P1-B8D-R9)

**79 scripts are loaded now, not 78, and this is the line that says so.** §7 of the R9 correction is
explicit that a changed number must be explained by the round's actual diff and never adjusted
quietly, so:

| | |
|---|---|
| Added | `assets/js/utils/km-repo-asset-manifest.js` |
| Class | `NO_DATA_ACCESS` |
| Why | It is a **generated directory listing** — the repo-relative path of every file under `assets/img`, produced by `tools/assets/build-repo-asset-manifest.js`. It performs no I/O of any kind: no `fetch`, no transport, no storage, no DOM. It is read only by `km-image-reference-policy.js`. |
| Why it is not `PRODUCTION_FIXTURE_OR_STATIC_DATA` | That class is for **domain data** compiled into the bundle — map topology, place names — data a page renders. This is a statement about the REPOSITORY, not about the business: it answers “is this file in the deployment”, which is the same class of fact as a build stamp. Counting it as a fixture would imply there is an API that ought to serve it, and there is not. |

**No module was reclassified.** `STANDARD_API`, `LEGACY_API_WRAPPER`, `DIRECT_EXTERNAL_FETCH`,
`PRODUCTION_FIXTURE_OR_STATIC_DATA` and `DOM_OR_LOCALSTORAGE_AS_DATA_SOURCE` are the same five
numbers R8 measured. R9 changed one page's runtime (Product Strategy) and one shared utility
(`km-image-reference-policy.js`, still `NO_DATA_ACCESS` — it classifies a string and fetches
nothing), and added the file above.

### The count that moved again, and the diff that moved it (FC-SHARE-DUAL-MODEL-R1)

**81 scripts are loaded now, not 80.** Same rule, same accounting:

| | |
|---|---|
| Added | `assets/js/core/supply-planning-forecast-share.js` (KMFCS) |
| Class | `NO_DATA_ACCESS` |
| Why | It is a **pure normalizer**: rows in, shares out. No `fetch`, no transport, no storage, no DOM, no clock, no RNG. It is the ONE owner of forecast-share arithmetic, replacing a page-local formula in `fc-summary.js` that had no spec owner and no test. |
| Why it is not `PRODUCTION_FIXTURE_OR_STATIC_DATA` | It carries no data at all. It is arithmetic over rows its caller already holds — the FC Summary read model — so there is nothing here an API could serve. |
| Why it is not `STANDARD_API` | It reaches no endpoint. The read that feeds it is the FC Summary workspace read, which is already classified under `fc-summary.js` and did not change. |

**No module was reclassified and no data path moved.** `STANDARD_API` is still 5 and
`LEGACY_API_WRAPPER` still 19 — this round added no request, removed none, and changed no
transport. `fc-summary.js` stays exactly where it was; it now calls a pure module instead of
computing a share itself.

`product-strategy-corrections-p1-b8d-r9.test.js` §F asserts this document still names
`km-repo-asset-manifest.js` and still reports 5 / 19, so a future edit cannot move a total without
the explanation going with it.

**Zero `google.script.run`. Zero `XMLHttpRequest` calls. Zero direct `docs.google.com` /
`sheets.googleapis.com` reads.** Every backend byte in this application arrives over one HTTPS
endpoint, and that is worth saying plainly before the list of what is wrong with how it gets there.

(The single `XMLHttpRequest` occurrence in the tree is a **string inside `psb-board-ui.js`'s own
self-test**, which asserts the absence of that token from its render path. A census that counted it
would be reporting a test for a defect as the defect.)

---

## 2. `STANDARD_API` — the five that are already where everything should be

> **CORRECTED AT P1-B8D-R10.** Every row of the Transport column below used to read
> `KM.transport.post`. **There is no such function.** `KM.transport` exposes `request()`; the `post`
> shim is a PRIVATE member of `km-api-foundation.js`, and the foundation's own comment calls it "a
> fallback and not the path". One wrong namespace, repeated on four rows, is why this census read as
> "everything is already where it should be" while Product Strategy was the one read in the
> application still going out as a POST that an Apps Script 302 strips the body from.
>
> A census is only worth what its column headings mean. This one said the right thing about the wrong
> name, and the page it was describing failed live for precisely the difference.

| Module | Data source | R/W | Transport | Actions |
|---|---|---|---|---|
| `api/km-transport.js` | Apps Script Web App | R | itself (it IS the transport) | `system.health`, `methodRegistry.get`, `inventoryScope.registry.get` |
| `api/km-api-foundation.js` | Apps Script Web App | R | `KM.transport.request({kind:'read'})`, with a private `post` shim retained as a fallback | 9 `*.workspace.get` |
| `api/km-data-access.js` | via foundation | R | `KM.transport.request({kind:'read'})` | 6 `*.workspace.get` |
| `api/km-product-pricing-workspace.js` | Apps Script Web App | R | `KM.transport.request({kind:'read'})` for **both** business reads | `productPricing.siteUniverse.get`, `productPricing.workspace.get` |
| `pages/product-strategy-board.js` | via the accessor above | R | as the accessor above | the same two, and nothing else |

> **P1-B8D-R10D — THE THIRD READ IS NOT MIGRATED. IT IS GONE.** R10A moved `system.health` onto the
> shared transport; R10D removes it from this page entirely. The capability is a **shared bootstrap
> concern**: it arrives on `getClientCapabilities`, which the application already reads once per page
> life, and is pushed into the accessor's mirror by that same bootstrap
> (`operation-system-db-api.js` `_kmApplyClientCapabilities_`). It is **not** counted as a Product
> Strategy-owned business read, and this page dispatches nothing for it.
>
> **Product Strategy-owned business reads = 2.** `productPricing.siteUniverse.get` and
> `productPricing.workspace.get`. The `system.health` action still exists, is still routed on both
> verbs, and still serves its other callers; what changed is that Product Strategy is not one of them.

**Product Strategy is the only PAGE in this column**, and §9's proof for it is in §3 below.

**Only `km-product-pricing-workspace.js` changed in CODE at R10.** The other three rows are the same
modules they always were; what changed is that this document now names what they actually call.

> **AND R10 FINISHED TWO OF THREE.** `a5bdfc2` migrated `productPricing.siteUniverse.get` and
> `productPricing.workspace.get`. It did **not** migrate `system.health`, and this row was written as
> though it had — the same failure mode as the `KM.transport.post` error it was correcting, one round
> later: a census describing an intention rather than a measurement.
>
> **R10A completed the third.** The claim is now enforced rather than asserted:
> `product-strategy-capability-route-p1-b8d-r10a.test.js` §A counts the callers of the private POST
> shim in the shipped accessor and requires **zero**, on decommented source. A census that can only
> be kept true by hand is a census that will drift again.

---

## 3. Product Strategy — the call graph, proven

**BEFORE R10** — what the page actually did, measured in real Chrome with `window.fetch` wrapped
before any application file was allowed to load:

```
    the browser
      -> KM.pages.productStrategyBoard         assets/js/pages/product-strategy-board.js
      -> KM.productPricingWorkspace            assets/js/api/km-product-pricing-workspace.js
      -> KM.api.transport.post(dto)            assets/js/api/km-api-foundation.js   <-- PRIVATE SHIM
      -> POST /exec  -> 302 -> GET echo        the body is dropped by the redirect, per the Fetch
                                               specification; the echo target 404s some of the time
```

That path had no endpoint classifier, no HTML fingerprint, no redirect-target classification and
**no retry** — none of which is a property of the accessor, all of which live in the transport it
was not using.

**AFTER R10** — the same boundary every other workspace read in the application has used since
F1-7N-FB-4E-R4A1:

```
    the browser
      -> KM.pages.productStrategyBoard         assets/js/pages/product-strategy-board.js
      -> KM.productPricingWorkspace            assets/js/api/km-product-pricing-workspace.js
      -> KM.transport.request({kind:'read'})   assets/js/api/km-transport.js
      -> GET /exec?...&km_body=...             a GET has no body for a 302 to drop; one bounded
                                               recovery, rebuilt from the stable /exec, on a
                                               redirect-target 404 and on nothing else
```

| §9 requirement | Evidence | Result |
|---|---|---|
| Reads only `system.health`, `productPricing.siteUniverse.get`, `productPricing.workspace.get` | the browser's own wire log across every acceptance run | **3 actions, no others** |
| All through `KM.api` / `km-transport` | **R10:** the accessor's read path is `KM.transport.request({kind:'read'})`, asserted at runtime by `readsThroughSharedTransport()` and on the wire by the R10 suite §D. Before R10 this row said "`KM.transport.post`" and was **true of no code** — the call was `KM.api.transport.post`, which is a different object. | **yes, and now by the right name** |
| No direct Sheet read | no `docs.google.com` / `sheets.googleapis` anywhere in the chain | **yes** |
| No direct DB read | no `KM.DB` reference in any of the 8 Product Strategy modules | **yes** |
| Production reads no fixture or capture | `index.html` loads no fixture; `PSB_PREVIEW` is undefined in production, so the auto-boot condition is false and `mount()` without an adapter throws rather than inventing one | **yes** |
| Write-shaped actions = 0 | the replay transport *raises* on any non-read action rather than returning; every run is green | **0** |
| `localStorage` only as a UI preference | the board's own self-test asserts the ABSENCE of `fetch(`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, `WebSocket` and `KM.DB` from its render path | **not used at all** |

Product Strategy stores **nothing** in the browser — not even a preference. `writes_browser_storage:
false` has been in its contract since P1-B7 and is asserted every round.

---

## 4. `LEGACY_API_WRAPPER` — nineteen pages on `KM.DB.*`

Every one posts to the same endpoint with an action. The migration is a **transport** change and a
**shape** change, not a new backend.

| Page | Reads | Writes | Target API action | Risk | S round | Blocks first go-live? |
|---|---|---|---|---|---|---|
| `inventory-replenishment.js` | 88 `KM.DB` calls + 9 standard actions | yes (drafts, allocations, AI plan) | `inventoryReplenishment.workspace.get` (exists) + the draft writes | **HIGH** — the largest page, mixed transports already | S2 | no |
| `fc-summary.js` | 103 | yes (target rules, forecast import) | `fcSummary.workspace.get` (exists) | **HIGH** — heaviest reader | S3 | no |
| `request-order.js` | 55 | yes | `requestOrder.workspace.get` (exists) | HIGH | S3 | no |
| `shipping-plan.js` | 45 | yes | `weeklyShipping.workspace.get` (exists) | **HIGH** — also 17 `sessionStorage` uses | S2 | no |
| `factory-stock.js` | 33 | yes (inventory adjust, import commit) | none yet — **needs a contract** | HIGH | S4 | no |
| `shipping-history.js` | 30 | yes (dispatch, confirm) | `shipment.workspace.get` (exists) | MED | S3 | no |
| `overseas-stock.js` | 27 | yes | `overseasStock.workspace.get` (exists) | MED | S3 | no |
| `global-logistics-map.js` | 26 | yes (ETA, receipt) | `shipment.workspace.get` + `shipment.eta.update` (exist) | MED | S3 | no |
| `request-order-draft.js` | 26 | yes | `requestOrder.workspace.get` (exists) | MED | S3 | no |
| `sku-details.js` | 25 | yes | `skuDetails.workspace.get` (exists) | MED | S2 | no |
| `sku-regional-details.js` | 20 | yes | `skuDetails.workspace.get` (exists) | MED | S2 | no |
| `purchase-order-overview.js` | 20 | yes | `purchaseOrder.workspace.get` (exists) | MED | S3 | no |
| `carrier-rate-card.js` | 19 | yes (template import) | none yet — **needs a contract** | MED | S4 | no |
| `purchase-order-list.js` | 15 | no | `purchaseOrder.workspace.get` (exists) | LOW | S3 | no |
| `overseas-ops-preview.js` | 11 | no | `overseasStock.workspace.get` (exists) | LOW | S4 | no |
| `sku-handbook.js` | 11 | no | none yet — **needs a contract** | LOW | S4 | no |
| `campaign-risk.js` | 6 (`campaigns`, `campaign_sku_lines`, `marketplace_skus`, `sku_details`, `marketplaces`) | promotion records go to `localStorage` — see §6 | scoped reads are fine; the promotion WRITE has no action | **HIGH** (see §6) | S2 | **see §6** |
| `automation-schedule.js` | 6 | yes | `automationSchedule.get/.update` (exist) | LOW | S4 | no |
| `app.js` (shell) | 3 | no | boot readiness only | LOW | S4 | no |

### 4a. The generic table readers — the one that is not an action

Two entry points are not domain actions at all:

- `GET ?action=getOperationDb` — reads **all 44 tabs** (`operation-system-db-api.js:54`)
- `GET ?action=getTable&table=<name>` — reads one table **by name** (`:120`)

Thirteen pages reach them through `KM.DB.loadOperationDb()` / `KM.DB.loadScopedTables()`. This is
the closest thing in the application to a browser reading the database, and it is the single most
valuable thing on this list to retire: a whole-database read is both the largest performance cost
and the reason a page's data shape is the sheet's shape.

**Disposition: `MERGE_INTO_WORKSPACE_API`**, which is what `API_MIGRATION_MASTER_PLAN.md` already
says. This census does not reopen it; it counts the callers.

---

## 5. `DIRECT_EXTERNAL_FETCH` — one, and it is not a data read

| Module | What it fetches |
|---|---|
| `core/partial-loader.js` | `assets/html/pages/*.html` — this application's own markup, same origin |

Classified separately so the count of "raw fetch in the frontend" is **1 and explainable** rather
than 0 and quietly wrong. There is no external data fetch in this application.

---

## 6. `DOM_OR_LOCALSTORAGE_AS_DATA_SOURCE` — eight, and they are not all equal

Storage that holds **domain data**. A remembered column width is not on this list; a promotion
record is.

| Module | Key | What it holds | Risk |
|---|---|---|---|
| `pages/campaign-risk.js` | `km_campaign_promotion_records_v3` | **operator-entered promotion records**, every one stamped `source: 'overlay'` | **HIGHEST — a browser-local SSOT.** The page's *campaigns* come from the server (`loadScopedTables(['campaigns','campaign_sku_lines',…])`, `:654`); these promotion records do not. They exist on one machine in one browser profile and go with the cache. The page is honest about it — the records are labelled `overlay`, the default is empty and nothing is seeded (`:104-111`) — which makes this a known gap rather than a hidden one. |
| `utils/sku-overrides.js` | `km_sku_data_overrides_v1`, `km_sku_image_overrides_v1`, `km_sku_lifecycle_overrides_v1` | SKU field, image and lifecycle overrides applied over server rows | **HIGH.** An override changes what other pages display, and only for the person who made it. |
| `utils/data.js` | `weeklyShippingPlans`, `personalTodos` | shipping plans | **HIGH** for the plans; `personalTodos` is genuinely personal and low. |
| `pages/supplychain.js` | `supplychain-canvas` | a hand-drawn diagram: geometry, colour, free text | **NONE — ruled S2-R4C.** Not business authority and never was. See the ruling below. |
| `pages/sku-details.js` | `KM_SKU_DETAILS_ADD_DRAFT_V1` | an unsubmitted add-SKU draft | LOW — a draft is the right thing to keep locally |
| `pages/inventory-replenishment.js` | `REPLEN_ALLOC_DRAFT_KEY`, `_IR_RECO_CACHE_KEY`, `allShippingPlans` | allocation drafts, a recommendation cache, and a **cross-page handoff** | MED–HIGH: the handoff is two pages agreeing on a key rather than on a contract |
| `pages/shipping-plan.js` | `allShippingPlans`, `shippingHistory` | the other end of the same handoff | MED–HIGH |
| `pages/shipping-history.js` | `shippingHistory` | the other end again | MED |

**The one that could block a first go-live is `campaign-risk`.** Every other entry here is a cache,
a draft or a handoff with a server-side source of truth behind it. The promotion records have **no
server side**: there is no promotion write action in the router, so what an operator types on one
machine is readable on exactly that machine. The page does not pretend otherwise — every record
carries `source: 'overlay'` and the list starts empty rather than seeded — but a shared operations
tool whose records are not shared is a gap, not a design.

Whether it BLOCKS depends on whether Campaign Risk is in the first release. If it is, it needs a
table and a write contract before it ships. That is a release-scope decision, not an engineering
finding, and this document does not take it.

> **ANSWERED — 2026-09-18, S2-R1-R1.** Both halves were settled by ruling, and the first half was
> wrong: **no table is needed.** A promotion record maps onto the `campaigns` + `campaign_sku_lines`
> pair that already exists, written through the already-routed `upsertCampaign` /
> `upsertCampaignSkuLines` — `CANONICAL_OWNERSHIP_MODEL = A`, and `campaign_promotion_records` must
> not be created. The release-scope decision is `INITIAL_RELEASE_SCOPE = B_READ_ONLY`: Campaign Risk
> ships reading server campaigns and lines, promotion entry stays browser-local and is labelled as
> such, and **server promotion writes stay disabled** behind an open authorization gate and an
> unrepaired downstream planning-qualification defect. Contract:
> [`CAMPAIGN_PROMOTION_RECORD_CONTRACT.md`](CAMPAIGN_PROMOTION_RECORD_CONTRACT.md) — design
> authority, not deployed state.

> **PARTLY ANSWERED — 2026-09-22, S2-R3.** The `inventory-replenishment` row's **cross-page handoff** half is
> closed and was closed before this round: Submit fails closed without the canonical API, and the
> `allShippingPlans` write is dev-host-only. Its **`REPLEN_ALLOC_DRAFT_KEY`** half was the live one — not
> because the key is authoritative by design (the frozen contract has always called it an unsaved buffer), but
> because a readback that did not answer was indistinguishable from one that answered “no active draft”, so
> the buffer became authoritative **on failure** without anyone choosing that. `DB_UNKNOWN` +
> `LOCAL_UNVERIFIED` + `EXECUTION_PLAN_DB_STATE_UNKNOWN` now separate the two. `_IR_RECO_CACHE_KEY` is
> untouched and remains a session cache with a server behind it.
>
> The `supplychain-canvas` row is **unchanged and still open.** *(Answered below, S2-R4C.)*

> **ANSWERED — 2026-09-24, S2-R4C.** The row was open because an inventory cannot tell a drawing from
> a record by looking at a storage key, and `supplychain-canvas` holds "canvas layout + content" —
> which sounds like content. It is not. **`SUPPLYCHAIN_CANVAS_MODEL = PRESENTATION ARTEFACT`**: the
> Supply Chain Canvas is a free-form diagram someone draws by hand, and it owns no business truth at
> all. There is nothing here to retire.
>
> The evidence is one-sided in a way that made this the shortest ruling in the series. The module
> contains no `KM.DB`, no `KM.api`, no `getWorkspace`, no `getTable`, no `google.script` and no
> `fetch` — the only request it ever issues is the one that fetches its own markup, once. Its stored
> document holds four keys (`items`, `arrows`, `nextId`, `nextArrowId`), and an item is
> `{id, type, shapeType, x, y, width, height, text, bgColor, borderColor}` — geometry, colour and free
> text. No quantity, status, SKU, warehouse, company, allocation or lifecycle field exists in it. And
> `SupplyChainCanvas_Spec.md` §2.2 put "與 SKU / 補貨數據的自動關聯" and ERP / WMS / marketplace
> integration **out of scope** in v1.0, so the spec and the implementation have agreed all along.
>
> So the categories this series has been using do not apply the way they did to the rows above it:
>
> | | |
> |---|---|
> | `CANONICAL_READ_OWNER` | **none — no canonical read exists.** The Canvas projects nothing. |
> | `CANONICAL_WRITE_OWNER` | **none — `SUPPLYCHAIN_CANVAS_BUSINESS_WRITES = 0`.** |
> | `CANVAS_UI_STATE_OWNER` | `localStorage['supplychain-canvas']`, written only by `CanvasController`. |
> | `BROWSER_AUTHORITY_POLICY` | the key is `PRESENTATION_ONLY`. It cannot outrank canonical truth because it never carries any, and **no other module in the application reads it**. |
> | `FAIL_CLOSED_POLICY` | vacuous for business data and now enforced for the document itself: an unreadable canvas is an ABSENT one, never an error that takes the page down. |
> | `UI_STATE_POLICY` | geometry, colour, free text, and the canvas viewport. Nothing else. |
> | `DEMO_POLICY` | there is no demo dataset in the module, so there is no demo fallback to make unreachable. |
>
> **THE RULING IS FORWARD-LOOKING, AND THAT IS THE ONLY PART WITH TEETH.** Today's code cannot go
> wrong; the next round can. If the Canvas ever shows a real quantity, status, shipment, inventory
> level, allocation or SKU lifecycle, that value must be **read from its canonical owner on each
> render and never written into this document** — the moment a business number is persisted here it
> becomes a second answer that one browser can see, which is exactly what S2-R4A retired from SKU
> Details. `assets/tests/s2-r4c-supplychain-canvas-ownership.test.js` §C runs the real item and arrow
> constructors and fails if the stored field vocabulary ever grows a business name.
>
> **TWO DEFECTS WERE FIXED, AND BOTH ARE LIFECYCLE RATHER THAN OWNERSHIP.**
>
> `setupOpacitySlider` and `setupArrowWidthSlider` each added **two anonymous `document` listeners**,
> from a path that runs for every item on every render — so a ten-item canvas added forty per render,
> nothing held a reference to them, the unmount hook could not remove them, and they went on handling
> every mouse move in the application after the user navigated away. Phase 2B-4 had already decided
> that this controller's document listeners are owned, bound remove-before-add and released on
> unmount; these four never joined that contract. They are now one shared drag target driven by the
> three listeners that already existed. **`LISTENER_DRIFT = 0`**, measured across four mounts.
>
> `loadFromStorage` called `JSON.parse` with nothing around it, one line after `init()` had set
> `_initialized = true`. One truncated value threw, the toolbar wiring **below** the call never ran,
> and every later mount took the `_initialized` early exit — a canvas whose buttons did nothing, in a
> state a reload could not clear because the reload re-read the same value. An unreadable view-state
> store is an absent preference, which is how every other view-state store in this repository already
> treats it. The unreadable value is **quarantined to `supplychain-canvas.unreadable.v1` rather than
> discarded**, and an existing quarantine is never overwritten: starting from an empty canvas means
> the next edit would otherwise overwrite the only copy of a document someone may have spent an
> afternoon on.
>
> **What was deliberately NOT done.** The canvas document still lives in one browser, unshared and
> unbacked-up, and this round does not change that — a diagram is not business truth, so localStorage
> is an acceptable owner for it, and giving it a table would be a cost with no reader. That is a
> ruling, not an oversight: if the Canvas is ever meant to be a shared artefact, it needs a document
> model and a write contract, and that is a scope decision this document does not take.

> **ANSWERED — 2026-09-23, S2-R4B.** The `shippingHistory` rows are **closed**, and the answer was
> already written down: `SHIPMENT_CENTER_SPEC.md` calls Shipment Overview a **status-filtered view over
> `shipments` / `shipment_lines`**, says a future On-The-Way / world map "must read from the same shipment
> data source, not create a parallel DB", and **no `shipping_history` or `shipment_history` table exists
> anywhere** — not in Apps Script, not in the schema map, not in any spec. So the model is PROJECTION,
> and there was never an entity to migrate.
>
> The canonical read was already built, already scoped and already fail-closed (`_shRefresh_` →
> `getWorkspace('shipment')` → `adaptShipmentWorkspace`; on failure `_shRenderError_` nulls the read
> model and shows a typed banner rather than falling back to anything). **What was still wrong was an
> asymmetry:** the RENDER of the legacy shadow was gated on `_shUseDb()`, but its LOAD was not. Every
> Shipment Overview entry in production pulled a sessionStorage array — or the 90-line
> `shippingHistoryMockData` fixture — into `historyState.data` and held it as business state, with one
> boolean between a demo dataset and the operator's history screen. `loadHistoryData` now returns an
> empty set in canonical mode without reading the store at all; demo mode is unchanged.
>
> Worth recording because it decides how much this mattered: the only writer of that key,
> `markAsDone` in `shipping-plan.js`, computes `totalCost` from a **hardcoded `unitCost = 2.5`** and a
> carton count read out of `replenishmentMockData`. Those rows were never real, and the legacy renderer
> that hosts its Done button returns early whenever the DB or the Weekly Workspace is on — so the writer
> is demo-only too. **`SHIPPING_HISTORY_WRITES = 0`, no API was added, and no table is needed.**
>
> Proof: `assets/tests/s2-r4b-shipping-history-and-fc-warm-race.test.js` (sections A–D).

> **ANSWERED — 2026-09-23, S2-R4A.** The `sku-overrides` and `utils/data.js` rows are **closed**, and the
> census that closed them found the situation milder than the table implies: **every writer was already
> dead.** `setSkuImageOverride` has no caller in the reachable history of any page, and
> `saveSkuDataOverrides` has none anywhere, so neither key could still be filled by the product. What they
> could still do was OUTRANK the server — `getNormalizedSkuImage` consulted the browser value FIRST, and
> `getAllSkuDataWithOverrides` INJECTED whole SKU rows the server never returned. Both are retired;
> `sku_details.image_url` (read) + `upsertSkuDetail` (write) is the owner, and the row set itself decides
> which SKUs exist. **No table, no schema change and no new action were needed.** The keys are IGNORED
> rather than deleted — an imported-SKU row may be the only copy of something a person typed — and
> nothing is migrated into the database automatically.
>
> `weeklyShippingPlans` was the same shape and simpler: all four `DataRepo` methods had **zero callers**,
> and the only `updateShippingPlanStatus` any page reaches is the canonical `KM.DB` one. Removed, with no
> replacement storage and no change to the canonical Weekly Shipping Plan API. `personalTodos` stays — it
> is a genuine personal preference, which this round does not touch.
>
> Proof: `assets/tests/s2-r4a-browser-business-authority-retirement.test.js`.
>
> **ONE THING ON THE SAME PATH WAS DELIBERATELY NOT FIXED.** `getAllSkuDataWithOverrides` still falls back
> to the demo arrays in `utils/data.js` when the base set is empty. That is a static fixture rather than
> browser storage, so it is outside S2-C's five categories, and the canonical SKU Details page already
> guards it (F1-7N-FB-4D §D3 returns before rendering when the read model is missing). `sku-handbook.js`
> does not guard it. Recorded here rather than repaired inside an authority-retirement round.

Preferences, for completeness and so they are never mistaken for the list above: `utils/i18n.js`
(language), `utils/resizable-columns.js` (widths), `core/state.js` (`km_state_*` view state),
`global-logistics-map.js` (`km.map.labelMode.v1`), `sku-details.js` (`SKU_COLPREF_KEY_`).

---

## 7. `PRODUCTION_FIXTURE_OR_STATIC_DATA` — five, and all five are correct

`data/world-countries-110m.js`, `data/world-land-110m.js`, `data/geo-names-zh-hant.js`,
`data/geo-display-aliases-zh-tw.js`, `data/geo-admin1-display-names-zh-tw.js`.

Map topology and place-name tables. Reference data that does not change with the business, compiled
into the bundle on purpose. **No migration proposed** — putting a world map behind an API call would
be a cost with no reader benefit.

**There is no business-data fixture in the production bundle.** The preview fixture that exists in
the repository (`docs/prototypes/…`) is not referenced by `index.html`, and Product Strategy's §3
row is the strictest statement of that: its renderer throws rather than fall back to one.

---

## 7b. S3-R1 — three production stability debts, and what they turned out to be

> **ANSWERED — 2026-09-24, S3-R1.** A batch round against three open runtime debts. Two were real and
> one was already closed; the two real ones were not what their labels said.
>
> ### FACTORY_INVENTORY_LOADING_STABILITY — two defects, each hiding the other
>
> **A failed read retried itself, without bound.** Measured from the shipped source against a backend
> that always rejects: **one page entry issued 41 requests** and was still going when the harness cut it
> off. The mechanism was two lines that are each defensible alone — the guard
> `if (… && !_factoryDbLoadTried)`, and a rejection handler that cleared that flag and then called the
> function whose guard reads it. F1-7N-FB-4E §D9 cleared the flag so a *later mount* could really retry,
> which was right, and then made the later mount immediate.
>
> **The Inventory table never consulted the load state.** The same round built `_fsStateHtml_` so that
> LOADING, a typed transport failure and an unconfigured API would be three different screens, wired it
> into `renderFactoryMovementTable` and into the whole of `overseas-stock.js`, and did not wire it into
> `renderFactoryStockTable` — the primary table. So all three, plus a genuinely empty result, printed
> "尚未連接資料來源": the typed error was unreachable, its Retry button was never drawn, and the request
> storm was invisible behind a screen asserting the one thing that was not true.
>
> The existing guard could not see it. F4 in `shared-api-transport-reliability` counted occurrences of
> the **literal** phrase, and the copy in `renderFactoryStockTable` was written `\u5c1a\u672a…` — the same
> eight characters on screen, different bytes in the file. It now decodes escapes before counting.
>
> **The same retry loop was in `overseas-stock.js`**, byte for byte, because both pages were repaired
> from one template. The strengthened F6 found it the moment it stopped matching anywhere in the file.
> Fixed identically; the two must not drift.
>
> | | |
> |---|---|
> | `FACTORY_INV_READ_OWNER` | ONE bounded `loadScopedTables` of four named tables. No `getOperationDb`, no `getTable` fallback; the broad reload survives only behind the `KM_SCOPED_PAGE_READS = false` kill switch. |
> | `FACTORY_INV_LOADING_OWNER` | `_fsLoad.status` — and it is now the ONLY gate on starting a read. |
> | lifecycle rule | a failure is **terminal for that entry**. It is left by an explicit Retry or by a **fresh route entry** (`_fsRearmOnEntry_`), never by the re-render the failure itself produced. |
> | stale-response rule | monotonic `_fsReadGen_`, captured at dispatch and compared at the commit. No timing assumption, no delay, no backoff, no cap. |
> | request budget | first entry 1 · re-entry 0 · three entries during one flight 1 · one Retry exactly 1 · a failing backend **1, not 41**. |
>
> ### SKU_DETAILS_TRANSPORT_REDIRECT_ERROR — CLOSED, no production file changed
>
> Not reproducible, and two earlier rounds are why. `F1-7N-FB-4E-R4A1` made the redirect cases separately
> typed at the transport (`REQUEST_METHOD_DOWNGRADED` for a POST that arrived at doGet; a redirect-target
> 404 ordered before the generic 404). `F1-7N-FB-4D §D3` removed anywhere for SKU Details to fall back
> **to**: the workspace read is fail-closed, a missing read model returns before rendering, and the read
> and the render are separate outcomes. The stale-response protection the incident needed was already
> there — `_skReadSeq`, captured at dispatch and compared before the commit, with a `__superseded` marker
> so the caller stands down instead of rendering a null model.
> Canonical transport: `KM.api.getWorkspace('skuDetails')` → `skuDetails.workspace.get`, one dispatcher,
> three callers. Closure evidence: `assets/tests/s3-r1b-sku-details-transport-redirect-closure.test.js`.
>
> ### FC_POSTWRITE_LIVE_SAVED_STALE_ROOT_CAUSE — the readback could join an answer older than the write
>
> R4B's work was sound and is untouched. One layer below it, `_fcSliceFetch_` opens with
> `if (rec.flight) return rec.flight;` — correct for a read, wrong for a post-write readback, because the
> flight it joins may have been **dispatched before the write**. That joined promise RESOLVES, so nothing
> fails: the readback commits a pre-write answer, sets the view to CURRENT and clears the banner. The
> operator is told the view is current while looking at a table missing what they just saved. It needs a
> slow backend and a save issued while the tab's own first read is in the air — the shape of a live
> demonstration, and the shape no unit test had.
>
> Separately, `FC_SUMMARY_READ_SUPERSEDED` is a rejection, and the post-write catch treated every
> rejection as a refresh failure — so a readback merely *replaced* by a newer read raised "Saved
> successfully, but the view could not refresh" and invited a Retry that was not needed.
>
> **The rule lives at the write, not in the fetcher.** "May I join?" is a question about what the caller
> knows, and only the post-write path knows its answer is stale. `_fcSliceFetch_` stays unconditionally
> single-flight for reads — which is why every existing assertion about its latch still passes unmodified.
> Per-slice `rec.gen` stops the released flight from landing, and from clearing its successor's handle.
>
> ### §3 — the loading-state census, reported and NOT fixed
>
> Twelve pages use the shared `KM.loadState` contract. Counting `beginLoad` against settle calls:
>
> | | |
> |---|---|
> | **P0, zero settles** | `factory-stock.js`, `overseas-stock.js` — each calls `beginLoad` once and never settles that binding. Not a visible hang: the subsequent render replaces the region's markup wholesale, and after S3-R1 the state machine owns what is drawn. But the `KM.loadState` object is abandoned rather than settled, which is a second owner of the same region. |
> | **P1** | `inventory-replenishment.js` — three `beginLoad` sites against two settles. Operational, worth a closer look than a count can give. |
> | **P2** | the other nine each pair `beginLoad` with at least two settle calls. |
>
> **A count is not a proof** — it cannot tell which branch settles — so this is a list of where to look,
> not a list of defects. The reusable pattern S3-R1 established, for that rollout: one state enum owns
> "may a read start", a failure is terminal until an explicit action or a fresh route entry, and the
> commit is gated by a monotonic request id rather than by timing.

## 8. The proposed S sequence

| Round | Work | Why here |
|---|---|---|
| **S2** | `campaign-risk` needs a contract and a table before its records can be trusted; `sku-details` / `sku-regional-details` onto `skuDetails.workspace.get`; the `sessionStorage` handoff between Shipping Plan and Inventory Replenishment replaced with a named contract | the three real correctness risks, not the three biggest files |
| **S3** | the eight pages whose target workspace action **already exists** — mechanical, and each one is independently verifiable | highest ratio of migration to design |
| **S4** | `factory-stock`, `carrier-rate-card`, `sku-handbook` — need contracts written first | design work, so it follows the mechanical work rather than blocking it |
| **S5** | retire `getOperationDb` / `getTable` once no caller needs them | it can only be last: it is defined by the absence of the callers above |

**Nothing on this list blocks the first go-live except the Campaign Risk question in §6**, and that
one is a scope decision rather than an engineering finding.

---

## 9. What each round actually changed

Nothing in this document, except Product Strategy's own row, describes code these rounds touched.
Both R8 and R9 forbid modifying other pages' runtime and none was modified. This is a census and
a plan.

**P1-B8D-R9** added `km-repo-asset-manifest.js` (`NO_DATA_ACCESS`, §1) and gave
`km-image-reference-policy.js` two new refusal reasons. Neither is a data path and neither changes
any page's transport. The image remediation that follows from them is **read-only in P1** and is
carried into S2 by [`IMAGE_REFERENCE_REMEDIATION_REPORT.md`](IMAGE_REFERENCE_REMEDIATION_REPORT.md)
and [`P1_TO_S2_HANDOFF.md`](P1_TO_S2_HANDOFF.md) §6.
