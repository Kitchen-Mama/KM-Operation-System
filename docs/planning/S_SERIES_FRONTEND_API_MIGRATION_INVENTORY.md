# S-Series Frontend Data-Access Inventory — how every production page reaches data

> **Round:** P1-B8D-R8 §9. **READ-ONLY CENSUS. No page runtime outside Product Strategy was modified.**
> **Repo:** `Operation System` · **Branch:** `feature/product-strategy-board-p0` · **PRE HEAD:** `d7a6061`.
> **Scope:** the scripts `index.html` actually loads, in load order — **LOADED_SCRIPTS: 79**
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
| `NO_DATA_ACCESS` | **41** | Renderers, utilities, layout, i18n (40 at R8, +1 at R9 — see below) |

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
| `pages/supplychain.js` | `supplychain-canvas` | canvas layout + content | MED |
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
