# PRODUCT IMAGE REFERENCES — READ-ONLY REMEDIATION REPORT

**P1-B8D-R9 · 2026-09-13 · READ-ONLY. Nothing in this round wrote to the database, and nothing in
this document may be applied by an agent.**

The USER's live DevTools showed repeated `GET .../assets/img/products/<sku>.jpg 404`. This is what
those are, what the round fixed in the UI, and what is left for S2 to fix in the data.

---

## 1 · THE MECHANISM, EXACTLY

`sku_details.image_url` holds **repo-relative paths** — `assets/img/products/CO1100-R.jpg`. That was
established in P1-B8C-R2 by reading sixty live rows, and it is why the shared image policy exists at
all: the board's old regex wanted an absolute URL and refused every live value, while SKU Details
rendered the same value happily.

The policy could answer **one** question about a relative reference:

> Does it NAME a file (it carries an image extension), or is it an opaque Drive id?

`assets/img/products/CO9999-X.jpg` names a file perfectly. **Whether that file is in the repository
was never asked** — it was left to the browser, which answers by making the request and receiving a
404.

### And the chart had no fallback for it

The category figure and the table figure have had an `onerror` since P1-B8C-R3. The **chart marker**
did not — because it is not an `<img>`. It is an SVG `<image>`, and the handler written for the HTML
element never covered it. A 404 there left a plate still classed `image-marker` with nothing in it:
an empty frame captioned as a photograph. On the default Category Analysis view that is the only
product image on the page, so it is also the most visible one.

---

## 2 · WHAT THE REPOSITORY ACTUALLY HOLDS

| | |
|---|---|
| files under `assets/img` | **145** |
| of which `assets/img/products/` | **138** |
| extensions present | `.jpg` × 138 — **no other extension, and no uppercase variant** |
| the seven operator-asserted mappings (`psb-data-contract.js`) | **7 / 7 present on disk** |

---

## 3 · WHAT PRODUCTION ACTUALLY HOLDS

From `_p1b8c-r2-live-derived.js` — sixty rows read out of the live Operation System Database on
2026-09-12 by `RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE()`. The image **addresses** were removed by
the diagnostic before the log left the Apps Script editor, correctly, because an address is a
locator; the SKUs, the statuses and the image-presence booleans are live.

| | |
|---|---|
| rows in the sample / in the universe | 60 / **495** |
| sites examined | 10 |
| `marketplace_sku_status` | **`Active` × 60 — every single row** |
| `lifecycle` | `Running in the Market` × 56 · `Phasing Out` × 4 |
| rows carrying an `image_url` | 58 · rows with none: 2 |
| the capture's own coverage note | `STATE_ABSENT_FROM_PRODUCTION` — *"Every one of the 495 live rows is `Active`"* |

### This refutes the hypothesis in the report, and that matters

The report suggested the 404s were **已停售 SKU** — discontinued listings. **The live data does not
support that.** Every row in the sample is `Active`, and the capture records that all 495 rows in
the universe are `Active`. There are four `Phasing Out` rows by *lifecycle*, but they are Active
listings and belong on the board.

**So no SKU should be excluded on these grounds, and none was.** §5 is explicit — *"不把停售 SKU
隨意改成 active"* — and the converse holds just as strongly: nothing may be dropped from a price
board for lacking a photograph. `INACTIVE_SKU_SHOULD_BE_EXCLUDED` is, on this evidence, an **empty
category**.

---

## 4 · THE CROSS-REFERENCE

For each distinct live SKU, does the repository contain a file named for it?

| | |
|---|---|
| distinct live SKUs in the sample | **51** |
| repository has `<SKU>.jpg` | **45** |
| repository has no such file | **6** |

The six, all `Active`:

| SKU | `marketplace_sku_status` | classification |
|---|---|---|
| `CO1101-R` | Active | `ACTIVE_SKU_MISSING_IMAGE` |
| `CO1205-B` | Active | `ACTIVE_SKU_MISSING_IMAGE` |
| `CO1205-R` | Active | `ACTIVE_SKU_MISSING_IMAGE` |
| `CO2100-P` | Active | `ACTIVE_SKU_MISSING_IMAGE` |
| `CO2100-R1` | Active | `ACTIVE_SKU_MISSING_IMAGE` |
| `GM1100-P` | Active | `ACTIVE_SKU_MISSING_IMAGE` |

**WHAT THIS IS AND IS NOT.** It is **not** a claim that the database points at those paths — P0-R3-R1
retracted exactly that inference and it stays retracted: *a filename that matches a SKU proves the
file's name and nothing about the bytes.* What it measures is how much of the live SKU set the
repository **could possibly serve**, and the answer is 45 of 51. Roughly **one SKU in eight** has no
asset under any name derived from it, which is consistent in magnitude with *"多筆"* in the report.

**The exact live list requires reading the live `image_url` column**, which is a database read this
round may not perform. That read is S2 work — §7 below.

---

## 5 · CLASSIFICATION, AGAINST THE SIX CATEGORIES ASKED FOR

| # | Category | Found | Where it is now visible |
|---|---|---|---|
| 1 | `STALE_IMAGE_REFERENCE` | **likely, unconfirmed** — indistinguishable from #2 without the live column | `image_reference_reason: REPO_ASSET_NOT_FOUND` |
| 2 | `MISSING_REPO_ASSET` | **yes** — 6 of 51 sampled SKUs have no asset | same as above; the two are told apart only by whether the asset *should* exist |
| 3 | `INACTIVE_SKU_SHOULD_BE_EXCLUDED` | **none** — all 495 live rows are `Active` | — |
| 4 | `ACTIVE_SKU_MISSING_IMAGE` | **yes** — the six in §4 | fallback plate with the SKU code, and `IMAGE_SOURCE_MISSING` in Data Quality |
| 5 | `CASE_OR_EXTENSION_MISMATCH` | **none observed; now detectable** — the repo is uniformly lowercase `.jpg`, so a row spelling `.JPG` or `co1101-r` would land here | `image_reference_reason: REPO_ASSET_CASE_MISMATCH`, with `note: REPO_HAS: <exact path>` |
| 6 | `OTHER` | **one shape**, not observed live: a root-absolute `/assets/img/...`, which on a project Pages site resolves against the domain root rather than the application. Not covered by the manifest, so it is passed through unjudged. | `SAME_ORIGIN_ASSET`, and it would still 404 |

### Per-404 fields the requirement asks for, and where each is now answerable

| Field | Where |
|---|---|
| requested relative path | `image_reference` input, preserved verbatim on the row |
| consumer / page | the four consumers in §6 |
| canonical SKU | `master_sku` on the row |
| `sku_details.status` | `marketplace_sku_status` on the row |
| marketplace listing status | same |
| membership / status gate result | `analysable`, `missing_reasons`, `source_status` |
| DB `image_url` non-empty | `image_source` — `null` or `sku_details.image_url (master row)` |
| repo file exists | **new** — `KM_REPO_ASSET_MANIFEST.has()` |
| resolver classification | **new reasons** — `image_reference_kind` + `image_reference_reason` |
| UI fell back | `data-role="fallback-marker"`, `data-image-failed`, `.tfig-miss` |
| should appear on this site/category | `analysable` + the category filter — **unchanged; no row was dropped for lacking an image** |

---

## 6 · WHAT R9 CHANGED, AND WHAT IT DELIBERATELY DID NOT

### Changed

1. **`km-repo-asset-manifest.js`** — generated from the directory by
   `tools/assets/build-repo-asset-manifest.js`. It publishes the roots it enumerated, so absence is
   only ever claimed where somebody looked.
2. **`km-image-reference-policy.js`** — for a relative reference **under a covered root**, a path
   with no file behind it is now `REPO_ASSET_NOT_FOUND` and one differing only in case is
   `REPO_ASSET_CASE_MISMATCH`. Both carry `url: ''`, so **no request is issued.**
3. **The chart marker** — an `error` handler at last, flipping the plate to `fallback-marker`,
   stamping `data-image-failed`, and printing the SKU code with its own sentence: *"The record names
   a product photograph that did not load."*

**One policy, four consumers, so all four are fixed at once**: Product Strategy
(`km-product-pricing-adapter.js`), SKU Details and SKU Handbook (`sku-overrides.js`), Campaign Risk
(`_crImageSrc` → `resolveSkuImageUrl`). None has a rule of its own, which is what makes parity
possible rather than coincidental.

### Deliberately not done

- **No database write.** Not one row was changed.
- **No fabricated image.** No placeholder file was added, no path was composed from a SKU.
- **No SKU reclassified.** No `Phasing Out` row was marked inactive; no inactive row was marked
  active.
- **No price data deleted.** A listing with no photograph keeps every price it had. The image is a
  decoration on a price board, never a gate on it.
- **The shared policy was not loosened.** `javascript:`, local file paths, path traversal, opaque
  ids and unapproved hosts are refused exactly as before; the round **added** a rule and relaxed
  none.
- **A case mismatch is reported and NOT followed.** Rewriting `co1101-r.jpg` to `CO1101-R.jpg` would
  put a photograph on the screen for a row that is wrong — the defect would leave the page and stay
  in the database. The note names the exact path an operator should write instead.

### The honest limit

> **404s are not claimed to be zero in production.** They are zero for every reference under
> `assets/img`, because those are now refused before the request. A reference outside that root, or
> a file removed from the deployment after the manifest was built, still reaches the browser — which
> is why the marker's error handler exists and stays. The measured claim is the acceptance run's:
> **image resource failures 0, other resource failures 0, broken `<img>` 0, failed chart markers 0.**
> Live confirmation is the USER's acceptance step.

---

## 7 · WHAT S2 INHERITS

**S2 data-governance task — `sku_details.image_url` reconciliation.** Read-only first, then a
decided write:

1. Read the live `image_url` column for all 495 rows (a diagnostic read, as P1-B8C-R2 did).
2. Classify each against `KM_REPO_ASSET_MANIFEST`: present · absent · case variant · outside roots ·
   empty.
3. For each absent one, decide **per row** — and this is a judgement about the product, not a
   rule that can be automated:
   - the photograph exists and should be **added to the repository**; or
   - the row points at the wrong path and the **row** should be corrected; or
   - the SKU genuinely has no photograph and the row's `image_url` should be **emptied**, which is
     the honest value and renders the same fallback with no request at all.
4. Any write goes through a defined action. **No direct sheet edit, and no agent-applied bulk
   update.**

Six SKUs are named in §4 as a starting point. They are a **sample, not the list**.
