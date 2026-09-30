# FC-EU-BFCM-DATA-RECONCILIATION-R1A — SELECTOR RESOLUTION + COMMERCIAL VALUE FREEZE

```
PRE_SHA = badffc8 (descendant of the required a6126e5)   branch = feature/product-strategy-board-p0
MODE = READ-ONLY / CONTRACT COMPLETION
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO
```

The operator's run of the R1 census returned `verdict = STOP, blocker = EMPTY_SELECTOR`. That is correct
fail-closed behaviour, and it was unhelpful in one specific way: the system knew a campaign was broken and
would not say which. R1A closes that, and prices the reconstruction through the authority that already owns
prices.

---

## §1 — THE SELECTOR

**It cannot be answered from this repository, and it no longer has to be.** There is no production data here
— no campaign_id, no company, no country, no year — and the operator has not supplied one. Guessing `BFCM`
and a year would be inventing a selector, which is the same class of error as inventing a row count.

So the selector is derived from **the damage**:

```
SELECTOR_STRATEGY = DERIVED_FROM_ORPHANED_EVENTS
AFFECTED_CAMPAIGN_IDS   = DERIVED_AT_RUN        AFFECTED_COMPANY  = DERIVED_AT_RUN
AFFECTED_COUNTRY        = DERIVED_AT_RUN        AFFECTED_MARKETPLACE = DERIVED_AT_RUN
AFFECTED_EVENT_FLAG     = DERIVED_AT_RUN        AFFECTED_YEAR     = DERIVED_AT_RUN
SELECTOR_UNIQUELY_IDENTIFIES_INCIDENT = DERIVED_AT_RUN
```

`TEMP_FC_RECONCILIATION_FIND_AFFECTED_CAMPAIGNS_R1A` lists every campaign currently holding an event whose
`campaign_sku_line` is missing, with the identity columns needed to recognise it, the counts needed to size
it, and the Series breakdown. It emits **no repair plan, no field matrix and no prices** (`A4`, `A5`) — it is
strictly less than a census, and the census it feeds is scoped to one `campaign_id`, which is what §1 asks
for.

It does read the whole `campaigns` table, and that is stated rather than hidden: an incident cannot be
located by looking only where it already is.

**§1 asks what value is still needed if the selector is not unique. The answer is: none.** Nothing needs to
be typed. One run of the entry function below produces every value in this section. If it reports more than
one affected campaign, the choice between them is the operator's, and pinning one is a single line in the
entry file — not in implementation code.

---

## §2 — THE ENTRY FUNCTION

```
DRY_RUN_ENTRY_FUNCTION = runFcEuBfcmReconciliationDryRun
ENTRY_FUNCTION_WRITE_COUNT = 0
```

In `assets/tools/apps-script-diagnostics/TEMP_FC_EU_BFCM_RECONCILIATION_R1A_ENTRY.gs`. It takes no
arguments, so the Apps Script editor can run it as-is, and it does exactly one thing:

```
finder -> exactly one affected campaign  -> scoped census on that campaign_id
       -> none                           -> NO_AFFECTED_CAMPAIGN
       -> more than one                  -> STOP, both ids listed   (B9-B12, M4)
```

Paste **three** files into the project: the census, this entry, and — already present in production —
`73_api_v1_pricing_write.gs`, because the prices are resolved *by* it.

Read-only is driven, not promised: every sheet the suite hands it throws on `appendRow`, `setValue`,
`setValues`, `deleteRow`, `insertRows` and `clear`. `B6` completes the whole entry path with zero attempts;
`M7` plants one `appendRow` and the run dies. `B16` confirms the file defines no executor.

---

## §3 — REGULAR PRICE AUTHORITY

```
REGULAR_PRICE_AUTHORITY    = pricingResolveEffective_        (73_api_v1_pricing_write.gs)
REGULAR_PRICE_SOURCE_TABLE = pricing_list
REGULAR_PRICE_JOIN_KEY     = marketplace_sku_id  (resolved from the event's sku + company/country/marketplace
                             via marketplace_skus, and only when that resolution is 1:1)
REGULAR_PRICE_FIELD        = the RESOLVED regular band: override `regular_price` -> NA -> `auto_regular_price`
                             -> null, plus the page's own `<= 0 is not a price` guard
SECOND_PRICING_AUTHORITY_CREATED = NO
```

This is the same owner the Special Event Builder resolves through. The chain, end to end:

```
58_ `pricing` slice  ->  normalizePricingListRecord / pricingResolveBand_  (operation-system-db-api.js)
                     ->  resolveRegionalPricingContext -> _evtSkuPricing    (fc-summary.js)
```

and the **server-side** owner of that same rule is `pricingResolveEffective_` in 73_ — which 72_ calls and
pointedly does not copy: *"THE RULE LIVES IN 73_ AND IS CALLED, NEVER COPIED... a second implementation here
would be a second answer to one question, and the two would diverge on the day somebody fixed only one."*
The census makes the same call, for the same reason (`C15`).

"No second authority" is driven rather than declared. `C1`–`C3` compute the census's answer and 73_'s answer
independently in one context and require them equal; `C12`/`C13` confirm the census holds no band logic and
no precision table of its own; and `C8`–`C11` remove 73_ from the project and show every row **refused**
rather than priced locally. A census with its own rule would still have answered.

`C16`/`C17` walk the auto band (`regular_price` blank, `auto_regular_price` set) and get `AUTO` reported;
`C18`–`C20` refuse a SKU with no price and a SKU priced at zero.

---

## §4 — THE 20% DERIVATION

```
DISCOUNT_PERCENT_AUTHORITY   = OPERATOR_FIXED_20
PROMO_PRICE_DERIVATION_OWNER = pricingRoundFx_ (73_) over regular * (1 - discount/100)
CURRENCY_ROUNDING_OWNER      = PRICING_FX_DECIMALS_ / pricingRoundFx_ (73_)
```

`pricingRoundFx_` answers **null** for a currency outside the frozen contract, so the census refuses the row
rather than rounding it by a rule nobody reviewed (`E7`, `E8`, `M2`). No universal decimal rule is invented.

The discount lives in the **entry** file, not the census (`D3`, `D4`): the census is a general instrument and
its own suite forbids a cardinality or a commercial constant being written into it. `D5` changes the frozen
value to 35 and every derived price moves with it, through the same owner.

### The finding that is not about this incident

**There are two currency-precision tables in the repository and they disagree.** `_evtDealPrecision` in
`fc-summary.js` rounded every campaign line that exists today; `PRICING_FX_DECIMALS_` in 73_ is the frozen
contract. §E drives both real sources:

| CURRENCY | `_evtDealPrecision` (builder) | `PRICING_FX_DECIMALS_` (frozen) | |
|---|---|---|---|
| USD CAD EUR GBP AUD JPY KRW | 2 / 2 / 2 / 2 / 2 / 0 / 0 | same | agree |
| **TWD** | **2** | **0** | **disagree** |
| **VND, CLP** | **0** | **not in the contract → refuse** | **disagree** |
| **any unknown currency** | **silently defaults to 2** | **refuse** | **disagree** |

**This incident is unaffected** (`E6`): an EU repair is EUR or GBP, where the two agree, and `C4` shows 100
at 20% resolving to 80.00 either way. It is recorded because a finding that is true and unwritten gets
re-discovered, and because the builder's silent default of 2 decimals for an unknown currency is a live
hazard on any future site whose currency is outside the frozen table. **It is not a blocker for R2 and no
change is proposed here.**

---

## §5 — PRICE SNAPSHOT SEMANTIC

```
CAMPAIGN_LINE_PRICE_SEMANTIC = A — HISTORICAL SNAPSHOT (captured when the line is written)
REPAIR_USES_CURRENT_CANONICAL_PRICE = YES
REPAIR_PRICE_PROVENANCE = OPERATOR_AUTHORIZED_CURRENT_SITE_REGULAR_PRICE
```

Proven three ways rather than asserted (`F1`–`F4`): 20_ documents `price_units` as *"the currency snapshot of
the SAME pricing_list row that supplied regular_price / promo_price"*; `normalizeCampaignSkuLineRecord`
returns the stored strings verbatim and consults no pricing authority on read; and
`handleUpsertCampaignSkuLines_` derives nothing — it stores the numbers the caller computed.

So the reconstructed price is **today's**, not the lost row's. The field matrix says `DERIVED` and names its
owner, and `F6` asserts it never claims to be `RECOVERED` or to be the value the lost line held. The original
`created_at` is likewise unrecoverable and is the repair time, stated rather than back-dated.

---

## §6/§7/§8 — MATRIX AND CARDINALITY

```
FIELD_RECONSTRUCTION_MATRIX = emitted per row by the census (field · source · deterministic ·
                              operator_required · default_allowed · value)
UNRESOLVED_REQUIRED_FIELD_COUNT = 0   for every row the census does not refuse   (G1)
```

| FIELD | CLASSIFICATION |
|---|---|
| `campaign_sku_line_id`, `campaign_id`, `sku` | DETERMINISTIC_FROM_EXISTING_GRAPH |
| `marketplace_sku_id` | DETERMINISTIC_FROM_EXISTING_GRAPH (1:1 only; ambiguity refuses) |
| `regular_price`, `price_units`, `promo_price` | DETERMINISTIC_FROM_CANONICAL_PRICING |
| `discount_percent` | OPERATOR_FIXED (20) |
| `special_condition`, `lps` | NOT_REQUIRED (blank) |
| `line_status`, `source` | NOT_REQUIRED (defaults `active`, `fc_reconciliation`) |
| `created_by/at`, `updated_by/at` | NOT_REQUIRED (written by the writer at execution) |

```
CURRENT_CAMPAIGN_COUNT = DERIVED_AT_RUN   CURRENT_EVENT_COUNT = DERIVED_AT_RUN
CURRENT_LINE_COUNT     = DERIVED_AT_RUN   EXPECTED_LINE_COUNT = DERIVED_AT_RUN
DERIVED_MISSING_LINE_COUNT = DERIVED_AT_RUN   ORPHAN_EVENT_COUNT = DERIVED_AT_RUN
GRAPH_CLASSIFICATION = DERIVED_AT_RUN
```

**§8 says to STOP if the derived count is not nine. This round cannot derive it at all** — it has no
production access — so it does not report nine and does not report anything else either. The operator's run
answers it. The census still cannot hold a cardinality: the R1 suite's literal census now allows exactly one
additional numeric literal, `100`, and `B1a` pins it to the single named `PERCENT_DENOMINATOR`. `G8` runs a
three-row incident through the same code and gets three.

---

## §9/§10 — GATES AND SCHEMA

```
NEW_TABLE_REQUIRED = NO   NEW_COLUMNS_REQUIRED = NONE
SCHEMA_EXTENSION_REQUIRED = NO   DB_MIGRATION_REQUIRED = NO
NEW_LINE_ID_MINT_COUNT = 0   DELETE_* = 0   PRODUCTION_ROWS_WRITTEN = 0
```

Of §9's gates, three are now structurally satisfied for any row the census does not refuse
(`UNRESOLVED_REQUIRED_FIELD_COUNT = 0`, every missing id still referenced, no conflicting line under that
id), and the rest are **DERIVED_AT_RUN**.

```
FC_EU_BFCM_R1A_READY_FOR_EXECUTION_AUTHORIZATION = NO — pending ONE operator run
```

Not because anything is unresolved in design, but because §9 requires
`SELECTOR_UNIQUELY_IDENTIFIES_INCIDENT = YES` and a known `DERIVED_MISSING_LINE_COUNT`, and both are facts
about production that this repository cannot observe. Claiming YES here would be asserting an observation
nobody made.

---

## What the operator does next

```
1. Paste into the Apps Script project bound to the production database:
     TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs
     TEMP_FC_EU_BFCM_RECONCILIATION_R1A_ENTRY.gs
   (73_api_v1_pricing_write.gs is already there.)
2. Select  runFcEuBfcmReconciliationDryRun  and Run. No arguments. No edits.
3. Return the report.
```

That single run produces every `DERIVED_AT_RUN` value above, including whether the count is nine. If it is
nine with `REFUSED_CONFLICT_COUNT = 0` and `UNKNOWN_COUNT = 0`, R2 can be authorized against a plan in which
every field is determined and every price came from the owner that already owns prices.

```
NEXT_TASK = FC-EU-BFCM-DATA-RECONCILIATION-R2 — bounded authorized repair of the missing
            campaign_sku_lines only, using the existing ids, discount 20, and canonical
            site Regular Price derived pricing, followed by authoritative graph verification.
```
