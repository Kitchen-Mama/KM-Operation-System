# CAMPAIGN PROMOTION RECORD CONTRACT — the canonical home for a promotion a person types

**S2-R1-R1 · 2026-09-18 · DESIGN AUTHORITY, NOT DEPLOYED STATE.**

Nothing in this document is running. No table was created, no action was registered, no row was
written, no file was deployed and no Apps Script project was synced. It describes what a future
implementation **must** do, and — just as importantly — what it may not do until three named gates
are closed.

> **The ruling this document implements (2026-09-18).**
> `CANONICAL_OWNERSHIP_MODEL = A`. A Campaign Risk promotion record is **not** a separate canonical
> entity. It is one `campaigns` header plus one or more `campaign_sku_lines` rows. A
> `campaign_promotion_records` table must not be created, and no second authority for promotion
> facts may exist.
> `INITIAL_RELEASE_SCOPE = B_READ_ONLY`. Campaign Risk ships reading server campaigns and lines;
> promotion entry stays browser-local and must be labelled as such; server writes stay disabled;
> existing browser rows are preserved; no migration happens.

```contract
CANONICAL_OWNERSHIP_MODEL                    = A
NEW_TABLE_REQUIRED                           = NO
NEW_ACTION_REQUIRED                          = NO
SEPARATE_PROMOTION_TABLE_PERMITTED           = NO
EXISTING_TABLE_EXTENSION_REQUIRED            = YES
SCHEMA_IMPLEMENTED                           = NO
TABLE_CREATED                                = NO
ACTIONS_REGISTERED                           = 0
DB_READS                                     = 0
DB_WRITES                                    = 0
AUTHORIZATION_BEFORE_DB_OPEN                 = REQUIRED
PROMOTION_WRITE_CONTRACT_READY               = YES
PROMOTION_WRITE_LOCAL_IMPLEMENTATION_ALLOWED = NO
PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED    = NO
PROMOTION_WRITE_AUTHORIZATION_GATE           = OPEN
DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED     = YES
EXISTING_BROWSER_DATA_POLICY                 = PRESERVE_AND_EXPORT_FIRST
SILENT_DATA_LOSS_ALLOWED                     = NO
EXPORT_BEFORE_MIGRATION                      = REQUIRED
SERVER_READBACK_BEFORE_LOCAL_RETIREMENT      = REQUIRED
RESET_FUNCTION_ACCEPTABLE_FOR_CUTOVER        = NO
MIGRATION_IMPLEMENTED                        = NO
INITIAL_RELEASE_SCOPE                        = B_READ_ONLY
CAMPAIGN_RISK_FIRST_RELEASE_INCLUDED         = YES_READ_ONLY
PROMOTION_SERVER_WRITE_ENABLED               = NO
LOCAL_OVERLAY_PRESENTED_AS                   = LOCAL_ONLY_NOT_SHARED
FULL_MULTI_USER_PROMOTION_CLOSURE            = DEFERRED_UNTIL_GATES
DERIVED_VALUES_TRUSTED_FROM_CLIENT           = NO
CLIENT_MINTED_IDENTITY_IS_CANONICAL          = NO
```

---

## 1 · What exists today, and where each field already belongs

The browser holds these records under `km_campaign_promotion_records_v3`, read and written in
exactly one place — [`campaign-risk.js:88-111`](../../assets/js/pages/campaign-risk.js). No other
module in the repository touches that key.

**Every field already has a canonical column.** `CAMPAIGN_SKU_LINES_HEADERS_`
(`assets/specs/active/apps-script/20_campaign_write_handlers.gs:41`) carries `lps` and
`special_condition` — columns that exist for no other purpose than this concept. That is the
strongest single piece of evidence for Model A, and it is why a second table would be a second
authority rather than a new capability.

### 1.1 Field mapping

| Browser field | Canonical table | Canonical column | Authority | Transformation | Validation |
|---|---|---|---|---|---|
| `promotionId` | campaign_sku_lines | (none — provenance only) | client | retained as `source_ref` provenance during migration; **never** becomes an id | must not be accepted as `campaign_sku_line_id` |
| `campaignName` | campaigns | `campaign_name` | operator | trim | non-empty (the existing writer already refuses a blank) |
| `company` | campaigns | `company` | site scope | upper-case compare | required; `''` must be resolved before write, never guessed |
| `country` | campaigns | `country` | site scope | trim | required |
| `marketplace` | campaigns | `marketplace` | site scope | trim | required; `marketplace_id` resolved server-side |
| `promotionType` | campaigns | `promotion_type` | operator | `PED` → `Prime Exclusive Discount` (the page already does this) | member of the known set |
| `eventFlag` | campaigns | `event_flag` (+ `major_event_flag`) | operator | annual events (`Prime Day`, `BFCM`, `Fall Prime`) also set `major_event_flag` | non-empty; default `Normal` |
| `startDate` | campaigns | `start_date` | operator | date-only `YYYY-MM-DD`, **marketplace-local calendar day, no timezone conversion** | parseable; `start <= end` |
| `endDate` | campaigns | `end_date` | operator | as above | parseable |
| `duration` | campaigns | `duration` | **server-recomputed** | inclusive day count | client value is ignored, never trusted |
| `sku` | campaign_sku_lines | `sku` | operator | trim | must exist in `sku_details` |
| `marketplaceSkuId` | campaign_sku_lines | `marketplace_sku_id` | canonical | resolved from `marketplace_skus` | **required** — see §2.3; a line without it cannot be scoped |
| `promoPrice` | campaign_sku_lines | `promo_price` | operator | numeric | `> 0`, `<= regular_price` |
| `regularPrice` | campaign_sku_lines | `regular_price` | operator | numeric | `> 0` |
| *(absent)* | campaign_sku_lines | `price_units` | canonical | currency snapshot of the `pricing_list` row that supplied the prices | **required** — the browser record has no currency at all |
| `discountPercent` | campaign_sku_lines | `discount_percent` | **server-recomputed** | `(1 − promo/regular)` | client value is ignored, never trusted |
| `lps` | campaign_sku_lines | `lps` | derived-then-frozen | boolean | — |
| `specialCondition` | campaign_sku_lines | `special_condition` | derived | `'LowPriceStrategy'` when `lps` | consistent with `lps` |
| `source` (always `'overlay'`) | campaigns + campaign_sku_lines | `source` | provenance | becomes `campaign_risk_operator`, or `migration:browser_overlay` for a migrated row | never `fc_summary_builder` for a Campaign Risk write |
| *(absent)* | both | `status` / `line_status` | lifecycle | see §3 | **explicit; blank is not a lifecycle** |
| `createdAt` | both | `created_at` | **server clock** | — | client timestamp is provenance only |
| `updatedAt` (always `''`) | both | `updated_at` | **server clock** | — | must actually be written |
| *(absent)* | both | `created_by` / `updated_by` | **server identity** | — | **never from the payload** — see §5 |

No row in this table names a third table. That is the whole of Model A.

### 1.2 Campaign header grouping — when one header, when two

A header is **not** grouped by `campaignName`: it is free text, defaulted from a generated
`SKU-BD-YYYYMMDD` string, and two operators can type the same words for different promotions.

```grouping
HEADER_IDENTITY_KEY = company | country | marketplace | promotion_type | event_flag | start_date | end_date
HEADER_GROUPED_BY_NAME_ALONE = NO
```

- **Several promotion records share one `campaign_id`** when every field of `HEADER_IDENTITY_KEY`
  matches. That is the normal case for the page's batch Add: one dialog, one date window, one type,
  many SKUs — one header, many lines.
- **A separate header is required** when any of those differ. A different date window, a different
  promotion type or a different event flag is a different campaign, whatever it is called.
- `campaign_name` is carried as a **display label** on the header; when records merge into one
  header and disagree on the name, the operator is asked, and the write refuses rather than picking.

The existing writer already resolves identity by `campaign_id` if supplied, else by the business key
`company | country | marketplace | campaign_name | year` (`20_:52`). **That business key is weaker
than `HEADER_IDENTITY_KEY`** — it can merge two different date windows that share a name and a year.
A future implementation must pass an explicit `campaign_id` resolved from `HEADER_IDENTITY_KEY`
rather than relying on the writer's fallback. This is recorded here, not fixed here.

### 1.3 Identity minting

```identity
CAMPAIGN_ID_FORMAT           = CMP-<10 uppercase hex>   (server-minted, 20_:existing)
CAMPAIGN_SKU_LINE_ID_FORMAT  = CSL-<10 uppercase hex>   (server-minted, 20_:existing)
CLIENT_MINTED_IDENTITY       = REJECTED
```

The browser's `promo_<epoch-ms>_<random 0-999>` is not server-safe: it collides across operators,
encodes a client clock, and has no uniqueness guarantee. It is **retained only as migration
provenance** — written into the line's `source` field as `migration:browser_overlay:<promotionId>`
so a migrated row can be traced back to the machine it came from, and dropped entirely for records
created after cutover.

---

## 2 · Downstream qualification — the reason a promotion is not just a row

`campaigns` and `campaign_sku_lines` are not private to Campaign Risk. They are read by the
supply-planning contamination authority, which **removes campaign selling days from the normal
run-rate that produces Avg Sales/day** — which feeds replenishment need, Request Order quantities
and the whole procurement trunk. Writing a promotion is therefore writing a demand-signal fact.

### 2.1 Consumer census (read-only, 2026-09-18)

| Consumer | Reads | Lifecycle filter today | Draft included? | Cancelled excluded? | Test excluded? | Treats every row as authoritative? |
|---|---|---|---|---|---|---|
| `90_generated_supply_planning_bundle.gs:431,484` — §22 contamination-day authority | `campaigns.status/start_date/end_date` joined to `campaign_sku_lines.marketplace_sku_id` | `_eventActive(status)`: excluded only when `cancelled` / `canceled` / `invalid`; **`null` returns `true`** | **YES** | yes | **NO** | **yes** |
| `42_api_v1_recommendation_workspace.gs:157-176` | both tables, lines grouped by `campaign_id` | scope-touch only; passes `status` through unfiltered; **no `line_status` filter at all** | **YES** | delegated to `_eventActive` | **NO** | passes every row |
| `assets/js/core/supply-planning-production-source.js:63-68` | declares both tables as canonical reads | none (it is the reader, not the judge) | n/a | n/a | n/a | n/a |
| `58_api_v1_fc_summary_workspace.gs:18` | notes both as not-yet-migrated | none | n/a | n/a | n/a | n/a |
| `fc-summary.js:2661 _evtPopulateBaseCampaigns` | `campaigns` + `fc_special_events` | scope, **and requires a linked event with `fcQty > 0`** | only via an event | no | no | — |
| `72_api_v1_product_pricing_workspace.gs:520+` / `psb-data-contract.js:60-66` | both tables, scoped by company+country+marketplace | **reports `status` and `line_status` as facts; decides nothing** | reports | reports | reports | **no — this one is honest** |

Two consumers turn a row into a planning fact, and both of them would admit a draft, a blank status
and a test row today.

### 2.2 The canonical eligibility rule

```eligibility
PLANNING_ELIGIBILITY_RULE = A campaign influences planning ONLY IF, all four holding:
  (1) campaigns.status is EXPLICITLY one of the eligible states below — blank is NOT a lifecycle;
  (2) the campaign_sku_line's line_status is `active`;
  (3) neither row's `source` marks it local-only, test or unmigrated;
  (4) company, country and marketplace are all present on the header and match the scope —
      an unverifiable scope column is INELIGIBLE, never assumed.

local_only            = INELIGIBLE
draft                 = INELIGIBLE
pending_confirmation  = INELIGIBLE
confirmed             = ELIGIBLE
active                = ELIGIBLE
completed             = ELIGIBLE
cancelled             = INELIGIBLE
retired               = INELIGIBLE
test                  = INELIGIBLE
blank_or_absent       = INELIGIBLE

DRAFT_AFFECTS_PLANNING                = NO
LOCAL_ONLY_AFFECTS_PLANNING           = NO
TEST_DATA_AFFECTS_PLANNING            = NO
CANCELLED_OR_RETIRED_AFFECTS_PLANNING = NO
```

**Vocabulary reuse, and the extension that is required.** `cancelled` / `canceled` / `invalid`
(header) and `cancelled` / `active` (line) are the existing, source-proven values and are reused
unchanged. `line_status` already defaults to `active` in the writer. What does **not** exist today
and is recorded as a **separate future extension**, not adopted by stealth:

- an explicit positive header status — the writer never sets one, so every campaign written today
  has a blank `status` that `_eventActive` reads as eligible;
- `retired` as a header state (retire-not-delete, §3.3);
- `local_only` and `test` as `source` provenance markers rather than statuses.

### 2.3 The repair this contract does not perform

```repair
DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED = YES
AFFECTED_CONSUMERS = 90_generated_supply_planning_bundle.gs (_eventActive, the null-is-eligible default)
                     42_api_v1_recommendation_workspace.gs (no line_status filter)
MUST_BE_FIXED_BEFORE_CANONICAL_PROMOTION_WRITE_ENABLE = YES
```

`_eventActive(null) === true` is not a defect in isolation — it was written for a world in which the
only campaign writer was the FC Summary Special Event Builder and a missing status meant "the caller
already scoped this". It becomes a defect the moment a second writer exists. The repair is its own
focused batch with its own tests, sequenced **before** any promotion write is enabled, and it is
explicitly **not** part of this round.

Until that repair lands, this stands: **enabling a promotion write would let a Campaign Risk
operator change Avg Sales/day by saving a draft.**

---

## 3 · Data contract on the existing tables

No table is created. `fcWriteEnsureColumns_` back-fills new columns additively onto an existing
sheet, so every extension below is an additive migration rather than a rebuild.

### 3.1 `campaigns`

- **Identity** `campaign_id`, server-minted `CMP-<10 hex>`. Business identity for idempotency is
  `HEADER_IDENTITY_KEY` (§1.2), which is **stricter** than the writer's current name+year fallback.
- **Scope** `company`, `country`, `marketplace` — all three required; `marketplace_id` is the
  canonical marketplace identity and `country`/`marketplace` are display snapshots.
- **Business** `campaign_name`, `promotion_type`, `event_flag`, `major_event_flag`, `year`,
  `start_date`, `end_date`, `duration` (server-recomputed).
- **Lifecycle** `status` — §2.2, explicit, never blank on a new write.
- **Audit** `created_by`, `created_at`, `updated_by`, `updated_at` — all server-stamped.
- **Aggregate performance** `total_sales_amount`, `total_sales_units`, `total_ad_cost`,
  `total_acos`, `event_reporting_fee`, `commission` — **not written by a promotion**; a
  forward-looking plan has no results yet, and leaving them untouched is the contract.

**Extension required:** an optimistic-concurrency token (`row_version`), `retired_at` / `retired_by`,
and a defaulted non-blank `status`.

### 3.2 `campaign_sku_lines`

- **Identity** `campaign_sku_line_id`, server-minted `CSL-<10 hex>`; **FK** `campaign_id`.
- **SKU identity** `marketplace_sku_id` is canonical and **required**. `sku` is the Master-SKU
  snapshot. A line carrying a Master SKU with no `marketplace_sku_id` is a hard refusal, not a
  fallback — the contamination authority already throws on exactly that case rather than guessing.
- **Prices** `promo_price`, `regular_price`, and `price_units` as the currency snapshot of the same
  `pricing_list` row. `discount_percent` is server-recomputed.
- **Marking** `lps`, `special_condition`.
- **Provenance** `source` — `campaign_risk_operator`, or `migration:browser_overlay:<promotionId>`.
- **Lifecycle** `line_status`, default `active`; `cancelled` for a withdrawn line.
- **Audit** as §3.1.
- **Duplicate rule** one line per `campaign_id + marketplace_sku_id` — the writer already resolves
  by that key.
- **Overlap rule** two eligible lines for the same `marketplace_sku_id` whose `[start, end]` windows
  intersect are a **refusal**, not a merge. The page already detects this client-side
  (`detectOverlappingPromotions`, `campaign-risk.js:777`); the server must reach the same verdict
  independently, because a client check is a convenience, never a gate.

**Extension required:** `row_version`, and a `source` vocabulary that the eligibility rule can read.

```extensions
EXISTING_TABLE_EXTENSION_REQUIRED = YES
campaigns            += row_version, retired_at, retired_by, non-blank status default
campaign_sku_lines   += row_version
both                 += a `source` provenance vocabulary (campaign_risk_operator, migration:*, test:*)
MIGRATION_STYLE = ADDITIVE ONLY (fcWriteEnsureColumns_); no column is renamed, removed or retyped
```

### 3.3 Retire, never delete

A promotion that happened is an operational fact with a price attached. Deleting it removes the
reason a past sales window looked the way it did, and the contamination authority reads exactly
those windows. So: `line_status = 'cancelled'` for a withdrawn line, header `status = 'retired'`
for a withdrawn campaign, both with `retired_by` / `retired_at`. **Hard delete is forbidden**, and
the page's current behaviour — `deletePromotionRecordsByIds` physically dropping rows
(`campaign-risk.js:719`) — is local-only behaviour that must not be carried to the server.

---

## 4 · Using the actions that already exist

```actions
NEW_ACTION_REQUIRED           = NO
EXISTING_ACTIONS_REUSED       = upsertCampaign, upsertCampaignSkuLines
ROUTED_AT                     = assets/specs/active/apps-script/01_router.gs:888, :892
HANDLERS                      = handleUpsertCampaign_, handleUpsertCampaignSkuLines_ (20_)
ACTIONS_REGISTERED_THIS_ROUND = 0
ATOMIC_MULTI_ROW_COMMIT       = NOT_PROVIDED_BY_EXISTING_ACTIONS
```

Both names were read from the router, not from prose.

**Ordering.** Header first, then lines. A line carries `campaign_id` as a required field, and the
line writer refuses a blank one, so the order is forced by the contract rather than by convention.

**Atomicity — and the honest limitation.** `handleUpsertCampaignSkuLines_` loops over `body.lines`
and **returns on the first failure with the earlier lines already committed**, reporting
`success: false` with no manifest of what was written. Neither handler takes a ScriptLock. So the
existing pair cannot provide an atomic multi-row commit, and this contract does not pretend
otherwise. The **smallest future orchestration requirement**, to be decided at implementation time
and not implemented or registered here, is one of:

1. a client protocol — header write, then **one line per call**, each idempotent by
   `campaign_id + marketplace_sku_id`, with a readback of the scoped campaign after the batch and a
   reconciliation pass for anything missing; or
2. a single future orchestrating action that owns the lock, the journal and the all-or-nothing
   boundary, in the shape `requestOrder.send.orchestrate` already uses.

Option 1 needs no new action and is therefore the default under Model A; option 2 needs its own
ruling, because a new action is a contract change.

**Idempotent retry.** A repeat with the same `campaign_id` and the same
`campaign_id + marketplace_sku_id` updates in place rather than duplicating — the existing writers
already behave this way, which is what makes option 1 viable.

**Version conflict.** With `row_version` in place, a write carrying a stale token is refused
(`CAMPAIGN_VERSION_CONFLICT`) and nothing is written; the operator re-reads and re-applies. Until
that column exists, **last write wins silently**, which is recorded here as a reason the write stays
disabled rather than as an accepted behaviour.

**Partial failure.** Per-line outcomes are reported individually. There is no aggregate "success"
over a partial batch. Lines that did not commit stay local and stay labelled local.

**Unknown write outcome.** A write whose result never arrived is `ACK_UNKNOWN`: it is held out of
the write scope, the local record is **kept**, and the next read reconciles by business identity
before anything is retried. It is never retried blind and never assumed failed.

**Readback proof.** No local record may be retired on the strength of a write response. The scoped
read must return the row, matched by `campaign_id + marketplace_sku_id`, before the local copy is
released.

**Action integrity.** Every response is validated the way P1-B8D-R10E-F4 validates the capability
read: a served `meta.action` naming a different action is a typed, **non-retryable, zero-write**
refusal, not a success.

### 4.1 Refusal vocabulary

```refusals
CAMPAIGN_SCOPE_INCOMPLETE          company, country or marketplace missing or unverifiable
CAMPAIGN_SCOPE_MISMATCH            the row's scope is not the caller's scope
MARKETPLACE_SKU_UNRESOLVED         a line has a Master SKU but no marketplace_sku_id
SKU_NOT_FOUND                      the SKU is not in sku_details
PROMOTION_DATE_RANGE_INVALID       unparseable, or end before start
PROMOTION_PRICE_INVALID            non-numeric, non-positive, or promo above regular
PROMOTION_CURRENCY_UNRESOLVED      no price_units snapshot available
PROMOTION_DUPLICATE_IDENTITY       an eligible line already exists for this campaign + marketplace_sku_id
PROMOTION_WINDOW_OVERLAP           an eligible line for this marketplace_sku_id overlaps the window
CAMPAIGN_VERSION_CONFLICT          the row changed since it was read
CAMPAIGN_NOT_WRITABLE              lifecycle forbids the edit (retired, completed)
NOT_AUTHORIZED                     no server-verified identity, or no permission for this scope
FEATURE_DISABLED                   promotion writes are switched off in the deployment that answered
```

Every one of these is zero-write. `NOT_AUTHORIZED` and `FEATURE_DISABLED` are **not retryable**;
`PROMOTION_DUPLICATE_IDENTITY` and `PROMOTION_WINDOW_OVERLAP` name the existing row rather than
merging.

---

## 5 · Authorization — the gate that is open, and what closes it

```authorization
PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED = NO
PROMOTION_WRITE_AUTHORIZATION_GATE        = OPEN
AUTHORIZATION_BEFORE_DB_OPEN              = REQUIRED
```

**That `upsertCampaign` and `upsertCampaignSkuLines` are deployed does not mean Campaign Risk is
authorized to call them.** Deployment is reachability. Authorization is a different question, and
today nothing answers it: the deployment posture is `ANYONE_ANONYMOUS`, RBAC is deferred to P2-A,
and both handlers open `SpreadsheetApp.getActiveSpreadsheet()` immediately after shape validation
with no caller check of any kind.

Worse for attribution: `actor` is taken from the request as
`body.updated_by || body.actor || 'fc-summary'` (`20_:104, :140`) and stamped into `created_by` /
`updated_by`. **The audit trail is currently whatever the caller says it is.**

A future server write must resolve identity and permission **before** any DB open or mutation, and
must never accept as authority: a frontend role, a hidden or disabled button, `localStorage` or
`sessionStorage`, a query parameter, an identity field in the request payload, or a
browser-provided `created_by` / `updated_by`.

**Evidence that closes the gate — all of it, not some of it:**

1. a server-verified caller identity the browser cannot assert (a validated Google identity token
   checked inside the handler);
2. that identity resolved against a server-side user/role store;
3. a permission check for the specific company + country + marketplace scope being written;
4. `created_by` / `updated_by` written from the **resolved** identity, never from the payload;
5. a refusal path proven by test: an unauthenticated and an unauthorized call each refuse
   **before** the spreadsheet is opened, with `DB writes = 0`;
6. the §2.3 downstream qualification repair already landed, so a newly written row cannot move
   Avg Sales/day before anyone has approved it.

Points 1–4 are P2-A's scope. Point 6 is a focused batch of its own.

---

## 6 · Existing browser records

```browserdata
EXISTING_BROWSER_DATA_POLICY            = PRESERVE_AND_EXPORT_FIRST
SILENT_DATA_LOSS_ALLOWED                = NO
EXPORT_BEFORE_MIGRATION                 = REQUIRED
SERVER_READBACK_BEFORE_LOCAL_RETIREMENT = REQUIRED
RESET_FUNCTION_ACCEPTABLE_FOR_CUTOVER   = NO
MIGRATION_IMPLEMENTED                   = NO
MIGRATION_REQUIRED                      = YES (conditional on the gates above)
```

- **Silent deletion is forbidden.** In every path, including a failed or partial migration.
- **An export must exist first.** There is none today in any form — the page's "Exports" block
  exports window functions, not data, and a console `debugPromotionRecords()` is not an export. The
  export must be recoverable without the page, and taken **before** the first write.
- **Local records stay until per-record canonical server readback succeeds.** Not until the write
  returns; until the row is read back by `campaign_id + marketplace_sku_id`.
- **Scope must be resolved and validated per record.** `company` may legitimately be `''` on an
  older overlay row. It is resolved with the operator, never guessed.
- **Duplicates are refused or explicitly reconciled**, never silently merged.
- **Test rows may be identified** by their source-proven signatures — `promotionId` beginning
  `test_high_` or `test_annual_`, `campaignName` beginning `TEST-` (`campaign-risk.js:1301, :1329`)
  — but identification is not permission: retirement still requires operator notice and a
  recoverable export, and a rollback that restores them from that export.
- **`resetCampaignPromotionMockData()` must not be used as a migration mechanism.** It removes the
  key with no confirmation and no copy (`campaign-risk.js:1294`). It is a debug helper, and using it
  to "clean up after migration" would be exactly the silent loss this contract forbids.

### 6.1 The question only an operator can answer

> **Do any operators currently have real promotion records in the browser used for Campaign Risk?**

Nobody can answer it from this repository — the data exists only on those machines. It **blocks
future migration and cutover**. It does **not** block completion of this contract, and it does not
block S2-R2.

---

## 7 · Initial release scope

```release
INITIAL_RELEASE_SCOPE                = B_READ_ONLY
CAMPAIGN_RISK_FIRST_RELEASE_INCLUDED = YES_READ_ONLY
PROMOTION_SERVER_WRITE_ENABLED       = NO
LOCAL_OVERLAY_PRESENTED_AS           = LOCAL_ONLY_NOT_SHARED
FULL_MULTI_USER_PROMOTION_CLOSURE    = DEFERRED_UNTIL_GATES
```

Campaign Risk ships. It may display canonical server campaigns and campaign SKU lines. Promotion
entry remains browser-local; when runtime work is later authorized, those rows must be **visibly
labelled local-only / not shared**, and must never be counted, totalled or presented as server
truth beside rows that are. No server write is enabled. No ownership migration occurs.

**This is a truthful holding posture, not multi-user closure.** Under it, two operators still see
different promotion histories, and the records are still one cleared cache away from gone. What it
buys is that the page says so.

No UI change is made in this round.

---

## 8 · What is NOT true of this document

- It is **not** a deployed state. `SCHEMA_IMPLEMENTED = NO`, `TABLE_CREATED = NO`,
  `ACTIONS_REGISTERED = 0`, `DB_READS = 0`, `DB_WRITES = 0`.
- It does **not** authorize a write, locally or in production.
- It does **not** perform or authorize a migration.
- It does **not** repair the downstream qualification defect it names in §2.3.
- It does **not** change `campaign-risk.js`, any `.gs` file, the router, the schema, the cache token
  or any deployed byte.
