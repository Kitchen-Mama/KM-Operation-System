# PRICING-R4 — Manual template smoke, and how to undo it

**Status:** prepared, NOT executed. Nothing in this file has been run against production.
**Owner:** operator. Every step here is a person clicking in SKU Regional Details.
**Prerequisites:** `PRICING_R2_DB_SCHEMA = SEALED`, `PRICING_R2_BASE_LAYER = SEALED`, `PRICING_R3_FX_EXECUTION = COMPLETE`. All three flag columns and `change_type` exist, or `pricing.update` refuses the whole batch with `MISSING_REQUIRED_HEADER` and writes nothing.

## What this proves, and what it costs

Four rows, one variable each. It exercises every path the manual price workflow has: a manual set on each of the three fields independently, and a hand-back to the system. It writes four cells and four audit entries.

**Read this before picking rows.** The price you set is live. There is no staging copy of `pricing_list`.

## The one thing that is not reversible

`pricing.update` writes an ownership flag as `TRUE` or `FALSE`. There is no third word — `pricingWriteFlag_` has exactly two, and no branch writes an empty one. So:

| | reversible through the tool? |
|---|---|
| the price value | **yes** — set it back with another MANUAL line, exactly |
| the ownership flag, once set | **no** — it can move TRUE ↔ FALSE, never back to blank |

A row you smoke-test ends up **classified**. That is correct behaviour, not a defect: R2 exists to stop anything classifying a price book by accident, so the only way to return a flag to "nobody has said" is for a person to clear that one cell in `pricing_list` by hand.

**So: pick rows you are willing to leave classified.** If you want the blank restored afterwards, note the cell address before you start and clear it manually at the end.

## Before you touch anything

1. SKU Regional Details → **Download current pricing**. Save `current-regional-pricing.csv` somewhere you will still have it tomorrow. **This file is your rollback data.** It carries the effective price, the owner and the auto value for every row.
2. From that file, pick your four rows and write down, for each: `marketplace_sku_id`, the field you will change, its current value, and its current owner (expect `NOT_SET` everywhere — all 495 rows are blank today).

### Picking row D — the one that costs nothing

Row D is the AUTO restore, and it is the only step that can move a price you did not choose: **USE AUTO overwrites the effective value with `auto_*`**. On most rows those two numbers differ, so restoring would change what a customer sees.

Pick a row where they already agree. In `current-regional-pricing.csv`, find a row where

```
minimum_price == auto_minimum_price
```

(or the same for regular / msrp). On such a row USE AUTO moves the **ownership only** — the price cell is rewritten with the number already in it. The audit entry will show `old_value` and `new_value` identical, which is the correct record of an ownership-only change.

If no row satisfies this, say so and stop. Do not run row D against a row whose effective and auto values differ without deciding, separately, that you want that price to change.

## The file

Download **Price update template**, open it, and edit only these four rows. Leave every other row exactly as downloaded — every mode ships as `NO_CHANGE`, and a row left alone asks for nothing.

| row | `marketplace_sku_id` | edit | leave alone |
|---|---|---|---|
| A | *(your pick)* | `regular_price_mode` = `MANUAL`, `regular_price` = *(current + 1.00)* | both other mode columns stay `NO_CHANGE` |
| B | *(your pick)* | `minimum_price_mode` = `MANUAL`, `minimum_price` = *(current + 1.00)* | |
| C | *(your pick)* | `msrp_mode` = `MANUAL`, `msrp` = *(current + 1.00)* | |
| D | *(the row where effective == auto)* | `minimum_price_mode` = `AUTO`, value cell left **empty** | |

Notes that matter:

- **Do not fill a value beside `AUTO`.** It would be dropped anyway — at the file boundary and again at the writer — but leaving it empty is what the file should say.
- **Do not edit `master_sku`, `site_sku`, `company`, `country` or `marketplace`.** They are there so you can see which row you are on. None of them is used to find the row, and none of them reaches the server.
- **Do not edit `currency`.** A currency that disagrees with the row is refused as `CURRENCY_MISMATCH`, and the whole file is refused with it.
- Delete the unedited rows if you prefer a short file. Keeping them is also fine — they ask for nothing.

If you want three rows rather than four, drop row C. The spec lists four cases; this runbook covers all four.

## Running it

1. SKU Regional Details → **Import price template** → choose the file → **Preview**.
2. The preview must say **4 row(s) would change**. If it says anything else, stop and send me the screen — the file is not asking for what you think it is.
3. A rejected file writes nothing and offers nothing: if the preview shows errors, fix the file and preview again. There is no partial import.
4. **Confirm & Write.**
5. Expect the toast: **4 price row(s) written · 4 audit entries.**

## Checking it landed

Re-download **current pricing** and compare against the copy you saved.

```
EXPECTED, and nothing else:
  row A  regular_price  = your new value     regular_price_owner  = MANUAL
  row B  minimum_price  = your new value     minimum_price_owner  = MANUAL
  row C  msrp           = your new value     msrp_owner           = MANUAL
  row D  minimum_price  UNCHANGED            minimum_price_owner  = AUTO

  every other field of those four rows   unchanged, owner still NOT_SET
  every other row in the file            unchanged
  every auto_*, fx_rate, fx_rate_date    unchanged, on every row
```

That last line is the one worth checking properly. A manual import must not touch the base layer or the system reference; if any `auto_*` or `fx_rate` value moved, stop and report it before doing anything else.

In `pricing_change_log`, expect exactly four new entries and no others:

| `field_name` | `change_type` | |
|---|---|---|
| `regular_price` | `MANUAL_SET` | row A |
| `minimum_price` | `MANUAL_SET` | row B |
| `msrp` | `MANUAL_SET` | row C |
| `minimum_price` | `RETURN_TO_AUTO` | row D — `old_value` and `new_value` will be **identical**, and that is right |

## Rolling back

Same tool, one more file. Download a fresh template and set:

| row | edit |
|---|---|
| A | `regular_price_mode` = `MANUAL`, `regular_price` = *(the ORIGINAL value from your saved CSV)* |
| B | `minimum_price_mode` = `MANUAL`, `minimum_price` = *(original)* |
| C | `msrp_mode` = `MANUAL`, `msrp` = *(original)* |
| D | nothing — see below |

Preview, confirm. Three rows written, three audit entries, all `MANUAL_SET`.

**After the rollback, rows A/B/C hold their original prices and their flags read `TRUE`.** The price is back. The ownership is not, and cannot be through this tool.

**Row D has no rollback through the tool at all.** Its price never moved; its flag now reads `FALSE`. Setting it back to MANUAL would write `TRUE`, which is further from where it started, not closer.

To restore the original blanks, open `pricing_list` and clear these four cells by hand:

```
row A   regular_price_is_manual
row B   minimum_price_is_manual
row C   msrp_is_manual
row D   minimum_price_is_manual
```

Clearing a flag cell is not a price change and writes no audit entry — which is also why nothing but a person can do it.

## Send back

```
MANUAL_TEMPLATE_SMOKE_EXECUTED  = YES / NO
ROWS_CHOSEN                     = A / B / C / D marketplace_sku_id + field + original value
PREVIEW_ROWS_WOULD_CHANGE       =
WRITTEN                         =
LOGGED                          =
AUTO_OR_BASE_CELL_MOVED         = NONE / <which>
ROLLBACK_EXECUTED               = YES / NO
FLAGS_MANUALLY_CLEARED          = YES / NO / LEFT CLASSIFIED ON PURPOSE
```

Paste the four `pricing_change_log` rows verbatim.
