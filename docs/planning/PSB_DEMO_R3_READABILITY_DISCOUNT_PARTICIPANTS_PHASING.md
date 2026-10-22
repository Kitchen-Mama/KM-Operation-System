# PSB-DEMO-R3 — chart readability, activity discount, activity participants, no Phasing Out

**Written for: the Owner and the reviewer of the next release.**

**Scope.**
- Product Strategy only: `psb-selectors.js`, `psb-chart-layout.js`, `psb-board-ui.js` and
  `product-strategy-board.css`.
- The application cache token moves from r63 to r64.
- No `.gs` file, no Script Property, no production data, no FC / IR / campaign record touched.
- Everything the board simulates stays in memory.

**Evidence:** `docs/evidence/psb-demo-r3/`. Production's own responses of 2026-10-22, read read-only by
the guarded driver, are in `production-read/`. They are what the browser runs replay.

## C — the CA / CO1150 activity representative (root cause first)

**What production returned.** ResTW / CA / Amazon, `productPricing.workspace.get` (`production-read/workspace-ResTW-CA-Amazon.json`):

| site SKU | marketplace_sku_id | everyday | Fall Prime 2026 / BFCM 2026 line | photograph on the row |
|---|---|---:|---|---|
| CO1150-BM | MPSKU-CA-AMA-CO1150-BM-d831f1 | 47.99 | **none** | CO1150-BM.jpg |
| CO1150-EM | MPSKU-CA-AMA-CO1150-EM-158f73 | 47.99 | **none** | CO1150-EM.jpg |
| CO1150-OM | MPSKU-CA-AMA-CO1150-OM-1193d6 | 47.99 | **none** | CO1150-OM.jpg |
| CO1150-XR | MPSKU-CA-AMA-CO1150-XR-5d1bd1 | 47.99 | 38.39 CAD, snapshot 47.99 | CO1150-XR.jpg |
| CO1150-ZW | MPSKU-CA-AMA-CO1150-ZW-7aba21 | 47.99 | 38.39 CAD, snapshot 47.99 | CO1150-ZW.jpg |

(MB, N and R are a separate 44.99 node; all three are in both activities at 35.99.)

**The trace.**
1. `marketplace_sku_id` → campaign line. 72_ attaches each line to its own row, and the five rows above
   are correct.
2. ingest. `_image` is set per row from its own verified mapping.
3. `groupNodes`. The five 47.99 rows share `variant_group` and price signature, so they form **one
   node**. Its `representative_sku` and `image` are the **first member with a photograph: CO1150-BM**.
   That is right for the everyday price, where all five share 47.99.
4. `campaignPriceFor`. This correctly computed PRICED_PARTIAL, 38.39, 2 of 5. But it returned no
   participant list.
5. The UI drew the activity marker beside the node's **everyday** plate. The tooltip head, the table's
   name, the representative SKU and the photograph all came from the node, so everything said
   "Burgundy Mist / CO1150-BM", a colour with no line in the activity.

**Root cause.** The activity view reused the everyday group's representative. Nothing on the activity
path knew which members were actually priced in it.

**Fix (selectors and UI only; the everyday grouping is untouched).**
- `campaignPriceFor` now returns three things:
  - `participants`: the members whose own line is PRICED;
  - `representative`: the first participant with a verified photograph, or **null**;
  - `representative_state`: `PARTICIPANT_PHOTOGRAPH`, `NO_PARTICIPANT_PHOTOGRAPH` or `NO_PARTICIPANT`.
- In the activity view, the plate, the tooltip head, the table's photograph, name and representative
  SKU all come from that representative. With none, the plate is neutral; nothing is borrowed from a
  non-participant.
- The tooltip lists `In this activity: CO1150-XR, CO1150-ZW` and
  `Not priced in this activity: CO1150-BM, CO1150-EM, CO1150-OM`.
- The table cell lists `CO1150-XR, CO1150-ZW (2 of 5)`.
- A node with no participant keeps its everyday photograph, and the tooltip says it is *not a
  participant in this activity*.
- The partial, conflict, duplicate-line and currency-mismatch guards are unchanged and asserted.

**Before / after.**
- Before: `before-1440-activity-tooltip-CO1150.png` shows "Burgendy Mist … Photograph: CO1150-BM".
- After: `after-1440-activity-tooltip-CO1150.png` shows the XR photograph, both participants and
  20% off.

## B — the activity discount

- **Formula:** `pct = (1 − shown deal price / regular_price_snapshot) × 100`, one decimal.
- **Inputs:** integer cents.
- **Basis:** each participant's **own** line snapshot, which is the same site, currency, activity and
  SKU, because the line carries all four.
- **Never used as the basis:**
  - MSRP;
  - the everyday price;
  - another colour's price;
  - the line's `discount_percent`.

`S.campaignDiscountFor(act, shownC)` is the one derivation. It is read by:
- the chart label (`38.39 *` over `20% off`);
- the drag readout, and the label inside the dragged handle, which is rewritten on every move;
- the tooltip line (`Discount 20% off (original 47.99 CAD, the activity line's own snapshot)`);
- the table: the recorded column, plus a percentage under the simulated price.

Simulation moves only the shown price; the basis never moves.

| case | result |
|---|---|
| original 50, deal 40 | 20% off |
| simulated 35 | 30% off |
| simulated 55 | 10% above original |
| production 38.39 / 47.99 | 20% off |
| production, typed 35.99 | 25% off |
| production, keyboard 34.99 | 27.1% off |
| a participant has no snapshot, or it is 0 | — (BASIS_MISSING) |
| two colours, one deal price, originals 50 and 45 | — (BASIS_DIFFERS), per-colour values in the tooltip |
| partial activity | only the participants' bases count |

The percentage is display only. Nothing writes it.

## D — Phasing Out excluded

**Authorities (verified, not assumed).**
- `marketplace_skus.marketplace_sku_status` = `phasing_out`, from `VALID_MARKETPLACE_SKU_STATUSES_`.
- `sku_details.lifecycle` = `Phasing Out`, from `VALID_LIFECYCLES_`: Upcoming SKU, Running in the
  Market, Phasing Out, Closure, Other.

**Production marks Phasing Out only on the master lifecycle.** Every site status is `active`, and the
server's membership says `lifecycle_participates: false`, so the board was showing them. Measured:

| site | rows | Phasing Out |
|---|---:|---|
| ResTW CA Amazon | 52 | CO2100-P, CO2100-R1, CO2100-T |
| ResUS US Amazon | 100 | CO2100-P, CO2100-R1, CO2100-T |
| ResUS US Walmart | 18 | GM1100-P, GM1100-R, GM1100-T (all of Grinders) |

**Exclusion point.** `getEligibleProductUniverse` excludes a row marked by either authority, with
reason `EXCLUDED_PHASING_OUT` and the authority named. This happens before grouping, so everything
downstream is consistent:
- the chart, the table, the KPIs and the findings;
- the activity catalogue and the photograph choice;
- the listing counts: ResUS Amazon 100 → 97, Walmart 18 → 15, CA 52 → 49.

The match is exact after trim. A blank or unrecognised lifecycle is **kept** and listed in a new
Data Quality row, `lifecycle_missing_or_unrecognised`. Data Quality also states how many Phasing Out
SKUs were excluded on the site.

**Production effect.**
- **CO2100 (34.99):** was 6 colours represented by the Phasing Out CO2100-P, and only "3 of 6" in
  BFCM. Now it is 3 selling colours, represented by CO2102-P, and complete in BFCM. CO2100-P and
  CO2102-P share one image file; the representative SKU is what changes.
- **ResUS Walmart:** GM1100, and with it the whole Grinders category, is gone.

**Controls (R3 suite).**
- all members excluded → no node;
- mixed group → only the selling members remain, and a selling member supplies the photograph;
- the only participant of an activity is Phasing Out → the activity leaves the menu;
- a selling SKU with zero stock is kept (the board reads no stock field);
- a blank lifecycle and a lowercase `phasing out` are kept and reported.

Nothing is deleted, no status changes, and FC, IR and campaign records are untouched.

## A — XY axis readability

**Measured before.** The stylesheet declared `font-size` on `.xlabel` / `.xsub` / `.ytick`. A CSS rule
outranks an SVG attribute, so the engine's per-density sizes **never reached the screen**. Every chart
was:
- product labels 12.5px;
- Y axis numbers 11.5px in `#78818f`, about 3.9:1 on white;
- activity labels 11px.

**After.**
- **The type.** The engine prints the axis at 14–15px, product labels at 14–16px and activity
  prices at 13–14.5px.
- **The space.** The lane rows, the column minimums and the left margin grow with the type:
  - the margin is computed from the longest tick actually printed (82px for 40.00, 91px for 100.00);
  - the label budget is measured at the printed size.
- **CSS.** The size is set inline from the engine, and the stylesheet declares none. Axis numbers and
  sub-labels move to `--ink-2`.
- **Density.** Dense charts thin their labels (one in two or three) rather than truncating or
  overlapping. The existing density ladder and the "12 products, no sideways scroll at 768px" rule
  still hold.
- **Clipping.** A label that would leave the drawing flips to the left of its marker; that was the
  "44.79 → 44.7" clip from the R55 acceptance. The competitor header does the same.

No new mode, page or setting.

## Verification

**Real Chrome, production responses (`_psb-demo-r3-runner.js`): after 104 / 104.** It covers 1920,
1440 and 820, each in the everyday and the activity view:
- the Y axis and the labels are ≥ 14px measured on screen (computed size × SVG scale);
- no two labels overlap;
- no label leaves its drawing;
- a 40px drag commits the price under the pointer;
- CA CO1150: participants XR + ZW, XR photograph, `38.39 *` / `20% off`;
- the discount through drag (during and after), typed price, keyboard, Undo and Reset;
- D on ResUS Amazon and Walmart, including Data Quality;
- a layout-only synthetic pass with **two currency panels and long names** at all three widths;
- only reads go out.

**The same runner on the pre-round UI (`before`, loaded from git at 70778e82) passes 41 / 104**: it fails the 63 checks this round adds (see `before/r3.json`).

**Node, `product-strategy-readability-discount-participants-phasing-psb-demo-r3.test.js`: 23
assertions, 15 of 15 mutants caught.**
- It includes the counter-examples at `70778e82`:
  - the activity node offered only CO1150-BM;
  - there was no discount;
  - production Phasing Out SKUs were on the board;
  - the type was 10.5–12.5px and overridden by the stylesheet.

**Existing suites.** Eight PSB suites failed on the first run after the change. Each was resolved for a stated reason, and none by loosening a check.
- `p1-b2` B15 asserted the opposite of the Owner’s decision. It now asserts that phasing_out is excluded by name. The preview fixture’s no-price row is no longer `phasing_out`, so it still demonstrates the missing price (J1, D15).
- `p1-b2a` C6–C8 read a `font-size` from the stylesheet, which this round removes on purpose. They now measure the drawn size, at 14px or more, and assert that the stylesheet declares none. N12’s mutant follows the margin into `padL`. H30b asserts that labels are thinned and never overlap.
- `p1-b2b` E13: the 44-product crowd is thinned to one label in three, and nothing is cut. E12 (no label wider than its room) is unchanged.
- `p1-b2c` E1 / M10 and `p1-b8b` I4.6b are **unchanged**. The engine was adjusted instead: column minimums 78 / 60 / 44 / 26, and a margin computed per axis. The existing density ladder and "12 products at 768px, no sideways scroll" still hold.
- PSB-DEMO R1 / R2 pin their browser evidence to the source. It was **re-taken**, not re-pinned.

**The same runner, all PSB suites, all token suites.**
- All 34 Product Strategy suites pass after the re-take, with no FAIL line in any log.
- All 130 suites that read the release token pass.
- R1 re-take: 48 / 48. R2 re-take: 52 / 52, with PREFIX and M1–M6 each caught.

## Release (frontend only; nothing for Apps Script)

- **Changed:**
  - `assets/js/product-strategy/psb-selectors.js`
  - `assets/js/product-strategy/psb-chart-layout.js`
  - `assets/js/product-strategy/psb-board-ui.js`
  - `assets/css/product-strategy-board.css`
- **Token r63 → r64 (`r64-psbdemor3-20261022`):**
  - `index.html`, 56 references;
  - `assets/js/app.js`, 13 references;
  - `assets/tests/_release-order.js`, appended.
  - r63 is spent: `origin/main` is `8da211de`, and r63 commit `7ea0a07a` is its ancestor.
- **APPS_SCRIPT_SYNC_REQUIRED:** none. **BUNDLE_REBUILD_REQUIRED:** no. No Property, schema or deployment change.
- **Test-only:**
  - `docs/prototypes/product-strategy-board/preview-fixture.js`: one row’s status;
  - three PSB suites (`p1-b2`, `p1-b2a`, `p1-b2b`);
  - the new R3 suite, runner, capture and production data.
