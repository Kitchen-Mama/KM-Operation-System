# FX-INIT-R1 — the draft initialisation payload for the FX rate book (for Owner review)

**Status: DRAFT.**
- Nothing was written: no Script Property, no save, no initialisation, no repricing.
- Nothing was pushed or deployed.
- The Editor tool (`docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt`) is **frozen at
  `b6ef4008`**. It still ships with empty rates and an empty confirm string.

## 0. Evidence this draft rests on

| item | value |
|---|---|
| Editor diagnostic (`TEMP_CheckFxIdentity`, Owner-run) | `active_email=vic.zhou@shopkitchenmama.com`, `active_error=null`, `editors_property_present=true`, `caller_on_editor_list=true` |
| Meaning (FX-AUTH-R2 §3, row 1) | the Editor identifies the Owner, and 75_ would authorise the Owner. Phase 1 is viable |
| Still not received | the active deployment version and its creation time. Not needed for an Editor dry run: the editor runs the saved files. The `handler` check in §3 below replaces it for this step |

## 1. Source

The pairs are the five already reviewed in FX1-R1: USD→AUD, CAD, EUR, GBP and JPY. The source is the
same one, and the latest day it has published is used.

- **Publisher:** European Central Bank, euro foreign exchange reference rates.
- **Machine file:** <https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml>
- **Human page:** <https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html>
- **Date of the rates:** **2026-10-21**. It is the latest published day. The file was retrieved on
  2026-10-22 at 00:19 UTC, and its `Last-Modified` is 2026-10-21 13:56 GMT. The 2026-10-22 rates are
  published around 16:00 CET, so they did not exist yet.
- **Saved as retrieved:**
  - `docs/evidence/fx-init-r1/ecb-eurofxref-daily-2026-10-21.xml`
  - its response headers, in `ecb-response-headers.txt`
- **Direction as published:** `1 EUR = <rate> <currency>`.

| leg | published |
|---|---:|
| EUR>USD | 1.1234 |
| EUR>AUD | 1.5971 |
| EUR>CAD | 1.5779 |
| EUR>GBP | 0.83825 |
| EUR>JPY | 177.36 |

A reference rate is a reference, not a dealable rate. It is the right basis for a maintained price book.
It is not the rate a payment processor or a marketplace settles at.

## 2. Derivation (every row is derived)

**Direction stored:** `1 USD = <rate> <quote>`, with `base_currency` USD. That is the direction 75_ resolves,
and 75_ never inverts a stored rate.

The ECB publishes nothing with USD as the base, so each row is a cross rate through EUR:

```
USD>X   = (EUR>X) / (EUR>USD)
USD>EUR = 1 / (EUR>USD)
```

The division is exact decimal arithmetic on the published strings, rounded half-up to 6 places. These
6 places are the precision of the **rate**. They have nothing to do with `PRICING_FX_DECIMALS_`, which
rounds the resulting **price** (JPY to 0 places, the rest to 2).

| pair | calculation | rate |
|---|---|---:|
| USD>AUD | 1.5971 / 1.1234 | **1.421666** |
| USD>CAD | 1.5779 / 1.1234 | **1.404575** |
| USD>EUR | 1 / 1.1234 | **0.890155** |
| USD>GBP | 0.83825 / 1.1234 | **0.746172** |
| USD>JPY | 177.36 / 1.1234 | **157.877871** |

**Cross-check only (not a source).** The US Federal Reserve H.10, released 2026-10-19
(<https://www.federalreserve.gov/releases/h10/current/default.htm>), has 2026-10-16 as its latest day,
which is older than the ECB's. On 2026-10-16, the latest day both publish, the method above agrees with
H.10 within 0.2%:

| pair | ECB-derived | H.10 |
|---|---:|---:|
| CAD | 1.416067 | 1.4157 |
| JPY | 158.020084 | 158.00 |
| AUD | 1.437039 | 1/0.6950 = 1.438849 |
| GBP | 0.749889 | 1/1.3330 = 0.750188 |
| EUR | 0.888652 | 1/1.1231 = 0.890393 |

The two fix at different times of day (ECB about 14:15 CET, H.10 at noon in New York), so they are not
expected to agree exactly.

## 3. The full payload

Files:
- `fx-rate-book-init-draft-r1.json` holds the payload, the legs and the derivation.
- `TEMP_FX_RATES.draft-r1.js.txt` holds the two constants to type into the editor copy of the tool. It
  has the same entries in the same key order.

`doc_version` is **0**. Each currency pair has exactly **one** record, at `version` **1**; no other record
is added.

| # | base_currency | quote_currency | rate | source | as_of | effective_from | effective_to | status | version |
|---|---|---|---:|---|---|---|---|---|---|
| 1 | USD | AUD | 1.421666 | `ECB eurofxref-daily 2026-10-21 (derived: 1.5971 / 1.1234)` | 2026-10-21 | 2026-10-22 | *(blank = open-ended)* | active | 1 |
| 2 | USD | CAD | 1.404575 | `ECB eurofxref-daily 2026-10-21 (derived: 1.5779 / 1.1234)` | 2026-10-21 | 2026-10-22 | *(blank)* | active | 1 |
| 3 | USD | EUR | 0.890155 | `ECB eurofxref-daily 2026-10-21 (derived: 1 / 1.1234)` | 2026-10-21 | 2026-10-22 | *(blank)* | active | 1 |
| 4 | USD | GBP | 0.746172 | `ECB eurofxref-daily 2026-10-21 (derived: 0.83825 / 1.1234)` | 2026-10-21 | 2026-10-22 | *(blank)* | active | 1 |
| 5 | USD | JPY | 157.877871 | `ECB eurofxref-daily 2026-10-21 (derived: 177.36 / 1.1234)` | 2026-10-21 | 2026-10-22 | *(blank)* | active | 1 |

**Owner decisions inside this payload:**
- **`effective_from` 2026-10-22.** It is the day after the rates' date, and the day this draft was made.
  The book is empty, so no earlier period is affected.
- **Open-ended `effective_to`.** A later update adds a new period instead of editing this one.
- **The source.** This draft continues with the ECB reference rate already reviewed in FX1-R1.

Change any of these and the payload, its digest and the confirm string all change. That needs a new
draft and a new dry run.

**The confirm string expected from the dry run.** It is computed offline, assuming the stored book is
still `doc_version 0`:

```
SAVE doc_version 0 -> 1 sha256 7308aad603bea025c24ed29915dc22eeb331bc09d6d415c5ccd17f5fc030de8b
```

The editor computes this independently. If its dry run prints anything else, the payload typed in
differs from this draft in at least one character, and the run stops there.

## 4. Offline verification (`assets/tests/fx-init-r1-draft.test.js`)

The suite runs the real 73_ + 75_ and the frozen tool in a sandbox. It passes **26 assertions with 13
mutants caught**:
- the saved ECB file is the ECB's, for 2026-10-21, and holds the five legs named in the draft;
- each rate is re-derived from those legs exactly (BigInt, half-up, 6 places), and each source and
  `as_of` names that day and those legs;
- the payload is exactly USD>AUD/CAD/EUR/GBP/JPY, once each, in the 9-field shape, at version 1, active
  and open-ended;
- the paste block evaluates to the same entries, in the same key order, as the JSON, and does not set a
  confirm string;
- the real 75_ validation accepts all five;
- the tool's **dry run** stops at `DRY_RUN_ONLY`, lists 5 ADDED entries, each with its full new entry and
  no old one, makes **0 writes**, takes **no lock**, and prints the confirm string above;
- **in memory only**, the resulting book is 2,426 bytes, under the 8,192 guard;
- the tool is unchanged since `b6ef4008` and still ships empty, and nothing new is in the Apps Script folder.

The mutants are:
- a mistyped rate;
- EUR stored inverted;
- truncation instead of half-up rounding;
- the 2026-10-16 rate reused;
- version 2;
- a sixth record;
- the wrong `as_of`;
- a closed period;
- the paste block differing from the JSON;
- the paste block setting a confirm string;
- the file's day changed;
- a blank status;
- a key reorder (it changes the digest).

The related suites were run one at a time, and all pass:

| suite | result |
|---|---|
| FX-AUTH-R2 | 16 / 16 mutants |
| FX-AUTH-R1 | 36 / 44 mutants |
| FX contract | 96 |
| FX roundtrip | 111 |

No full sweep was run.

## 5. The read-only dry run (Owner-run; nothing is saved)

This is FX-AUTH-R2 §6 steps 1–2 with this draft. **Approval A**, adding the temporary file, is needed
first.

1. In the **production Apps Script project**, add a NEW file named `TEMP_FxRateBookEditorSave`. Paste
   the whole of `docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt` from Git, as it is at
   `b6ef4008`.
2. In that editor copy only, replace the `TEMP_FX_EXPECTED_DOC_VERSION` and `TEMP_FX_RATES` lines with
   the two constants in `docs/planning/fx-init-r1/TEMP_FX_RATES.draft-r1.js.txt`.
   - **Leave `var TEMP_FX_CONFIRM = '';` exactly as it is.**
   - Save the file. **Do not** create a deployment version or a new deployment.
3. Select `TEMP_FxRateBookEditorSave` and press **Run**. If a consent screen appears, stop if it asks for
   anything beyond the project's four scopes.
4. Open the execution log and send the **whole** JSON line. Check it against this draft:

   | field | expected |
   |---|---|
   | `mode` | `DRY_RUN` |
   | `stopped` | `DRY_RUN_ONLY` |
   | `authority` | `{ ok: true, user: vic.zhou@shopkitchenmama.com }` |
   | `handler` | `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55`, the same as `fxRateBook.get` |
   | `stored_doc_version` | `0` |
   | `expected_doc_version` | `0` |
   | `valid` | `true`, with `errors: []` |
   | `payload_entries` | the five rows in §3, field by field |
   | `changes` | five `ADDED`, `old: null`, `new` = each row |
   | `confirm_for_this_payload` | the string in §3 |

5. **Stop there.** If anything differs, send the line as it is and do nothing else. Do not edit the
   rates to make it match.
6. The temporary file may stay in the project until approvals B and C, or be deleted now.
   **While it is in the project, no deployment version may be created.**

**Approval B** confirms this exact payload and its `changes`. **Approval C** is one commit with that
confirm string. Both are separate and come later; then FX-AUTH-R2 §6 steps 4–5 apply. Repricing is not
part of this plan.

---

## 6. CLOSE-OUT (2026-10-22) — saved by the Owner, read back on the Web

**Owner acceptance:** the FX initialisation and the production Web readback **passed**.
- `doc_version` is 1.
- The five rows equal the approved draft.
- The Web page stays read-only, as phase 1 intends.

The two returns the Owner provided are saved verbatim:

| file | what | sha256 |
|---|---|---|
| `docs/evidence/fx-init-r1/owner-commit-execution-log.txt` | the Editor execution log of the ONE commit run (09:37:40–09:37:43) | `71eb146d…2e22443` |
| `docs/evidence/fx-init-r1/owner-web-readback-fxRateBook-get.json` | the production Web `fxRateBook.get` afterwards | `83f120d8…81ce2d4` |

**Checked against this draft, field by field (offline; 12 of 12 match):**
- The commit log reports:
  - `handler F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55`;
  - `mode COMMIT`;
  - authority `ok`, user = the Owner;
  - stored and expected `doc_version` both 0;
  - `valid`, with no errors.
- Its `payload_entries` equal §3, entry by entry.
- Its `changes` are five `ADDED`. Each has `old: null`, and `new` equal to the same §3 row.
- Its confirm string equals the one predicted in §3, `… sha256 7308aad6…c030de8b`.
- Its `result` is `success`, `doc_version 1`, no errors, and 5 log entries.
- The Web readback reports `success`, `doc_version 1`, `rate_count 5`. Its `rates` are identical to the
  draft's: same values, same key order.
- `may_edit: false` and `authority_reason: FX_AUTHORITY_UNVERIFIABLE`, `error: null`. That is the
  expected phase-1 state (FX-AUTH-R2 §2), **not** a defect.

**What the saved evidence does not include.** The dry-run log line that approval B was given on is not
among the two returns. What the saved commit line shows is the confirm string that was run. It equals
this draft's SHA-256 at `doc_version 0`, so the payload committed is byte-for-byte this draft.

**What may now be claimed:** *the production FX rate book holds the five approved rates at doc_version 1,
readable on the Web.* **What may not:** *FX editable on the Web*. The Web still cannot identify a caller.
Nor *prices repriced*: no reconcile was run, and no `pricing_list` row was touched. Imports and SKU
creation from now on read this book.

**Still open — NOT claimed done:**
- **Removing the temporary files from the production Apps Script project** (`TEMP_FxRateBookEditorSave`,
  and `TEMP_CheckFxIdentity` if it is still there). **Waiting for the Owner's confirmation.** Until both
  are confirmed gone, no deployment version may be created (FX-AUTH-R2 §5).
- The active deployment version and its creation time were never received.
