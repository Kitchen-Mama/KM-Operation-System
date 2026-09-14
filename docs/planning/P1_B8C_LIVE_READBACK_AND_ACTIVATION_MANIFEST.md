# P1-B8C — Live readback status, replay acceptance, and the P1-B8D activation manifest

> ```
> STATUS                       = NOT EXECUTED. This document is a plan, not an act.
> LIVE_WORKSPACE_CAPTURE       = STOP_EXISTING_READBACK_INSUFFICIENT
> PRODUCT_STRATEGY_ENABLED_    = false
> NAVIGATION_RENDERED          = 0
> FRONTEND_DEPLOYED            = no
> APPS_SCRIPT_SYNCED           = no
> SECURITY_TRACK               = DEFERRED_TO_P2_A
> ```

---

## §1  STOP_EXISTING_READBACK_INSUFFICIENT — what could not be captured, and why

P1-B8C §3 asks for a read-only capture of the production Product Strategy workspace response, taken
through the existing readback. **It cannot be taken.** The reason is structural rather than
incidental, and it is two facts that compose.

### 1.1 The wire cannot produce one

`PRODUCT_STRATEGY_ENABLED_` is `false`, and §2 forbids changing it. So the deployed endpoint refuses
before it opens anything. That is not inferred — it is the live body read by HTTPS on 2026-09-12 and
frozen in `assets/tests/_p1b7f-exec-capture-r10.js`:

```
meta.refusalCode  = FEATURE_DISABLED
meta.dbOpened     = false
meta.tablesRead   = 0
data.site_count   = 0
health.product_strategy_enabled = false
health.db_writes  = 0     health.drive_writes = 0     health.read_only = true
```

**A refusal is the only thing the wire can return, and that is the gate working.** It is also the
reason no HTTP path in this round can produce rows.

### 1.2 The editor path reaches the builder and throws the rows away

`RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()` is the right instrument and it does the right thing:
it calls the endpoint with the real `io` and asserts the refusal, then reads the four tables itself
read-only and hands them to `ppwWorkspaceBuild_` — **the shipped builder**, so its eligibility
classification is computed by the code that will serve the page.

But `p1b3SitePass_` then iterates `data.normalizedRows`, tallies them into class counts, and
**returns none of them**. It publishes counts, class tallies, option values, currency facets and
finding codes. It publishes no `regular_price`, no `minimum_price`, no `msrp`, no `product_image`, no
per-row identity and no per-row data-quality state.

That is deliberate and its own header says so:

> *"NO SENSITIVE DATA. It reports counts, distinct KEY values … and header NAMES. It never reports a
> price, a cost, a margin, a URL, a customer, or a spreadsheet id."*

**That rule was right for the question P1-B3 asked** — is there enough in the SSOT to draw a board —
and it is the wrong shape for the question P1-B8C asks, which is *what exactly would be drawn*. A
renderer cannot draw a price axis from a count.

### 1.3 The minimum augmentation — IMPLEMENTED AT P1-B8C-R1

*At P1-B8C this section read "proposed, NOT implemented". The USER authorised it on 2026-09-12 and
it was built in that round, unchanged in scope: **one function in the existing file, nothing else —
no action, no router entry, no parameter, no flag path.** The table below is the contract the code
now keeps, and `assets/tests/product-strategy-row-shape-sample-p1-b8c-r1.test.js` holds it. The two
places where the proposal and the code differ are marked inline; the document was corrected to the
code rather than left to disagree quietly.*

**Add one function to the existing file. Change nothing else. Add no action, no router entry, no
parameter, no flag path.**

```
FUNCTION   RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE()
FILE       assets/tools/apps-script-diagnostics/
           TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs
RUN FROM   the Apps Script editor, by the USER. Admin only, no parameters.
```

It reuses `p1b3ReadTable_` and `ppwWorkspaceBuild_` exactly as `p1b3SitePass_` does, and differs in
one respect: for each site it emits **a bounded sample of `normalizedRows`, reduced field by field**.

*(The proposal wrote `p1b3ReadTables_`, plural. No such helper exists and never did — the file has
`p1b3ReadTable_`, singular, called once per table, which is what the code reuses.)*

| keep | reduce | drop entirely |
|---|---|---|
| `identity`, `marketplace_sku_id`, `master_sku`, `site_sku` | `product_image` → `product_image_present` + `product_image_is_absolute_url` | `regional` — dropped WHOLE, keeping `regional_present` and `regional_language` |
| `category`, `series`, `variant_group`, `variant_name`, `product_name` | `campaigns[]` → `{status, line_status, start_date, end_date, promo_price, regular_price_snapshot, price_units, discount_percent}` | `regional.product_url`, `regional.regional_detail_id`, `regional.marketplace_product_id` |
| `company`, `country`, `marketplace`, `currency` | `provenance` → the named strings only; they name tables, not ids | `campaign_id`, `campaign_sku_line_id`, `campaign_name` |
| `regular_price`, `minimum_price`, `msrp` | row `findings[]` → `{code, detail}`; **`evidence` dropped**, because that is where the row's own values live | any spreadsheet id, script id, deployment id, endpoint, email, actor |
| `marketplace_sku_status`, `lifecycle`, `analysable` | | |
| `missing_reasons[]`, `findings[]`, `source_status[]` | | |

**Two corrections to the proposal, both made in the direction of the code.**

**The image is two booleans, not an object.** The proposal wrote
`{available:boolean, source:string, url:null}`. `72_` line 648 sends a **URL string or null**, and
`km-product-pricing-adapter.js`'s `imageStateOf` picks between its three states from exactly three
inputs: is the value blank, is it an absolute `http(s)` URL, and is `MASTER_SKU_RECORD_MISSING` among
the missing reasons. The third already travels in `missing_reasons`, so
`product_image_present` + `product_image_is_absolute_url` complete the set — **the renderer's state is
derivable without the URL and without the diagnostic re-implementing a client function.** An invented
object would have been a third vocabulary for a field that already has two.

**`promo_price`, not `official_deal_price`.** The proposal used the readable name. §4 forbids a second
vocabulary, and the builder's field is `promo_price`; the suite asserts the rename did not happen.

**The reduction is an ALLOWLIST.** Every field is written out by name, so a new column appearing in
`sku_details` tomorrow reaches `normalizedRows` and does **not** reach the report. A denylist would
have published it and waited for somebody to notice.

**The envelope is copied and SCANNED rather than allowlisted**, and the difference is deliberate: the
accessor validates `sourceState`, `counts`, `membership`, `filtersApplied`, `filterOptions`,
`pagination` and `schema` **by name and by shape**, so a reduced envelope would test a contract the
accessor does not accept. What protects it is the fail-closed scan below, which walks the finished
report rather than trusting the reducer.

Plus, per site, the envelope fields the accessor validates: `sourceState`, `counts`,
`filterOptions`, `pagination`, `membership`, `schema`, `analysis_permitted`, `refusals`, `findings`.

**Bound and safety, both stated as code rather than intention:**

- `P1B8C_ROW_SAMPLE_MAX_ = 60` rows **in the whole report**, across every site together, and the cap
  is reported as a cap with `row_sample_cap_scope = GLOBAL_REPORT` beside it.

  *P1-B8C-R1 shipped this as a cap **per site**, which on the production universe of ten sites is a
  six-hundred-row export wearing a sixty-row budget's name. The authorisation was minimum disclosure,
  and **a bound that multiplies by a number nobody bounded is not a bound.** P1-B8C-R1A made it one
  global budget, spent once by one selector over the pooled universe of every site — not a per-site
  cap that happens to add up, and not a truncation applied to a finished report, which would discard
  whichever states the last sites happened to hold. The arithmetic is asserted in full:
  `sampled_rows_total <= 60`, `sum(site rows) === sampled_rows_total`,
  `omitted_rows === universe_total_rows - sampled_rows_total`, and
  `capped === (universe_total_rows > sampled_rows_total)`.*
- **Selection is deterministic, global and coverage-first, never the first sixty.** Rows are ordered
  by **canonical identity** — `company||country||marketplace||marketplace_sku_id` — never by physical
  row number, so sorting, inserting into or re-exporting the sheet cannot move the sample. Four
  passes, over the pooled universe of every site:

  1. **Site representation.** While the budget allows, every non-empty site claims one row, sites in
     canonical order. *Without this pass the first site eats the budget.* On ten equal sites that is
     invisible — rank sampling alone gives each about six seats — which is why the suite tests it on a
     **skewed** universe of one site with 900 rows and nine with 5: there, rank sampling alone puts
     almost every seat in the big site and the nine small ones disappear from the report entirely. The
     seat a site claims is its own row whose rarest GLOBAL trait is rarest, so representation and
     coverage pull the same way.
  2. **Rare traits, counted across the whole universe**, rarest first — because with a bound the
     common traits would otherwise crowd out the one inactive row or the one row with no MSRP, and
     those are the entire reason a shape sample is being taken.
  3. **Global rank** across the whole pooled universe.
  4. **Canonical fill**, reachable only once the three above are complete.

  An empty site consumes no budget: it contributes nothing to the pool, so it cannot claim a seat.
- **A state production does not hold is a coverage gap, named in the output**
  (`STATE_ABSENT_FROM_PRODUCTION` in `coverage_gaps`), never manufactured. `evidence_gaps` keeps only
  what the SOURCE could not answer — an unreadable table, a site count past the bound — and
  `coverage_gaps` keeps everything the BUDGET could not reach. **If sixty rows cannot cover every
  trait, the uncovered ones are listed and the cap is not raised.** The output says so in as many words and points
  at the deterministic fixture as the labelled alternative.
- **The redaction scan is fail-closed and runs on the finished report**, walking keys against
  `P1B8C_FORBIDDEN_KEYS_` and primitive values against `P1B8C_SECRET_SHAPES_` (absolute URL, `AKfyc…`
  exec id, email, Google file id, mixed-case opaque token). A violation **discards the whole report** —
  not trims it — and the refusal carries the path and the rule and never the value.
- It is `SpreadsheetApp.openById` + `getValues` only. No `setValue`, no `appendRow`, no writer, no
  `getOperationDb`, no `UrlFetch`, no `LockService`, no `PropertiesService`, no trigger.
- It does **not** read or set `PRODUCT_STRATEGY_ENABLED_`. The flag gate lives in the handler; this
  calls the pure builder, which is the same thing `p1b3SitePass_` already does today.
- `rows_modified` is measured before and after the same way P1-B3 measures it.

**What the round found while building it.** Three defects, each of a kind that reading could not have
reached:

1. **The scan refused the report's own vocabulary.** `OPAQUE_TOKEN` was `/[A-Za-z0-9_-]{40,}/`, which
   matched the verdict name `RETURN_EVERY_CHUNK_TO_THE_P1_B8C_R2_ROUND` and the kebab-case name of the
   suite that proves the counters. Fail-closed is a safety property only while the thing it closes on
   is real. The rule now also requires the run to be **mixed case**, which is what an OAuth token, a
   Drive id or a base64 blob is and what SCREAMING_SNAKE and kebab-lowercase are not.
2. **`error.token` collided with the forbidden key `token`.** The census's idiom for a *safety* token
   is `error.token`; `token` is forbidden because that is what a credential is called. So **every
   failure path reported itself as a redaction failure** and threw the real error away with the
   report — the one path that exists to explain a failure was the one path guaranteed to be refused.
   The field is now `error.safety_token`; `token` stays forbidden.
3. **The spread pass was the first sixty rows.** It computed `stride = floor(n / remaining)`, which is
   `1` whenever the universe is under twice the cap, so the walk took indices `0..59` and stopped. It
   looked correct because the order is an id sort rather than the sheet's. Ranking by
   `floor(k * n / remaining)` spans the range at any ratio; the suite now asserts the sample is **not**
   the head and **does** contain the last row of the universe.

**And two more that P1-B8C-R1A's own assertions were wrong about before the code was.**

4. **The reordered-source test passes for two reasons, and only one of them was mine.**
   `ppwWorkspaceBuild_` sorts its in-scope ids ascending (72_ line 463) *before* normalising, so rows
   reach the pool in identity order whatever the sheet did. A mutant that injected the pool position
   into the canonical id therefore **survived** the end-to-end reorder test — that test cannot see the
   selector's own sort at all. The sort is now proved where it lives: the same pool is handed to the
   selector scrambled and sorted, and must select the same sixty rows.
5. **Site representation looked load-bearing on a universe that did not need it.** Ten equal sites get
   about six seats each from rank sampling alone, so deleting pass 1 changed nothing and that mutant
   survived too. **A mutant that survives is telling you the assertion is passing for a reason other
   than the one it claims.** The skewed universe in the paragraph above is the shape where the pass is
   actually the thing keeping nine sites in the report.

**Why prices are safe to emit here and were not before.** The rule this relaxes is P1-B3's, and its
reason was that a census is pasted into a report. This output is pasted into ONE repository file that
is already read-only test evidence, its consumer is a renderer that exists to display these very
numbers on screen to the same operators, and every identifier that could reach outside the company —
url, id, endpoint, email — is still dropped. **What is being relaxed is "no prices in a census", not
"no identifiers anywhere".** If the USER prefers not to relax even that, the alternative is to run
the acceptance on the deterministic capture permanently and accept the evidence gap; the manifest
below does not depend on which is chosen.

### 1.5 P1-B8C-R2 — the capture was taken, and it replayed

**The USER ran `RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE()` against production on 2026-09-12 and
returned all thirty-five chunks.** This section records what came back and what it proved.

```
sample     P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE     build P1-B8C-R1A
verdict    SAMPLE_TAKEN                             capture_kind LIVE_READBACK · is_live true
chunks     35 / 35                                  fingerprint FPe02df215 · length 240,126
universe   495 rows across 10 sites                 sampled 60 · omitted 435 · capped true
passes     site_representation 10 · rare_trait 20 · global_rank 30 · canonical_fill 0
safety     read_only true · every write counter 0 · flag_read false · redaction.passed true
gaps       evidence_gaps [] · coverage_gaps [STATE_ABSENT_FROM_PRODUCTION status=non_active]
```

| site | universe rows | sampled | state |
|---|---:|---:|---|
| KM / US / Shopify | 101 | 27 | READY |
| KM / US / Target | 19 | 2 | READY |
| KM / US / Walmart | 64 | 5 | READY |
| ResTW / AU / Amazon | 35 | 3 | READY |
| ResTW / CA / Amazon | 51 | 4 | READY |
| ResTW / EU / Amazon | 39 | 3 | READY |
| ResTW / JP / Amazon | 26 | 3 | READY |
| ResTW / UK / Amazon | 42 | 3 | READY |
| ResUS / US / Amazon | 100 | 7 | READY |
| ResUS / US / Walmart | 18 | 3 | READY |
| **total** | **495** | **60** | |

**The export is not the report, and the difference was measured rather than waved at.** The Apps
Script log prints `<time>\t<level>\t<text>`; the text export rewrote every LF as CRLF — 7,621 of
them, not one bare LF left. Stripping both layers gave **240,124** characters, two short, and
chunks 26 and 32 came back 6,999 against an emitter that slices at exactly 7,000.

**The missing character in each is the slice's own trailing newline.** The exporter writes one
newline before the next timestamp line, and where the slice already ended with one the two became
one. It is recoverable without guessing: the next chunk begins with indentation, and
`JSON.stringify(_, null, 2)` only ever produces indentation immediately after a newline.
**The hypothesis was tested, not asserted** — restoring newlines gives 240,126 and `FPe02df215`;
restoring *spaces* gives `FP8d4dca95`, which is how we know which it was. No header was edited.
`EXPORT_NEWLINE_NORMALIZATION` is **ruled out**, not carried as a gap.

**What was committed, and what was not.** The raw 240,126-character log carries every production
price and product name and is **not in the repository** — `.gitignore` keeps it out. What is
committed is `assets/tests/_p1b8c-r2-live-derived.js` (the sixty rows, reduced field by field,
rehydrated to the wire shape, `SOURCE_KIND = LIVE_DERIVED_REDACTED`) and
`assets/tests/_p1b8c-r2-chunk-manifest.js` (metadata only: 35 headers, each chunk's length and
digest, so completeness stays re-checkable without the payload).

**Two substitutions, named in the capture itself.** `product_image` — the live value is an address
and the diagnostic removed it; the two booleans it published decide the renderer's image state and
those are live. `regional.*` — the join is live, every field on it is a locator and is null.

**AND THE ONE THING PRODUCTION ITSELF CANNOT SHOW.** All 495 live rows are `Active`. The
excluded-by-status path therefore cannot be demonstrated from live data at all; it is covered by the
deterministic fixture and reported in its own column as **DETERMINISTIC GAP COVERAGE**, never merged
into the live one.

**The live finding worth carrying forward: no product photograph is drawable from production data.**
`imageStateOf` returns `VERIFIED_DB_MAPPING` only for an absolute `http(s)` URL, and only that state
draws a picture. Measured over all sixty rows, **not one reaches it**: the rows with an image land in
`UNVERIFIED_SOURCE_REFERENCE` and the rest in `IMAGE_SOURCE_MISSING`. That is a property of
`sku_details.image_url` in production, not of this capture — the deterministic fixture would never
have shown it, which is the entire reason a replay round exists.

---

### 1.4 What this round did instead

Built the machine that consumes the capture, and proved it end to end on data that says what it is.
`assets/tests/_p1b8c-capture.js` is **`CAPTURE_KIND = 'DETERMINISTIC'`** and is not live evidence.
When the augmented readback runs, its de-identified output replaces `SITES` / `workspaceEnvelope` and
`CAPTURE_KIND` becomes `'LIVE_READBACK'`. **Nothing else changes** — not the replay harness, not the
suite, not the browser acceptance page.

---

## §2  The replay chain that was proved

```
capture envelope
  -> KM.api.transport.post            <- THE ONLY SUBSTITUTION §5 PERMITS
  -> km-product-pricing-workspace.js   the formal accessor + its response validator
  -> km-product-pricing-adapter.js     the canonical row builder
  -> km-product-strategy-live-adapter  the state machine and the UI matrix
  -> psb-selectors.js                  the analysis engine
  -> psb-views.js / psb-board-ui.js    the six views and the renderer
  -> assets/html/pages/product-strategy-board.html
  -> assets/css/product-strategy-board.css
```

The seam is the socket and not the adapter **on purpose**. P1-B7E's live defect lived in the
accessor's response validator — the deployed envelope said `productPricing.workspace.get` for a
siteUniverse response, was refused as `RESPONSE_ACTION_MISMATCH`, and every suite stayed green
because every suite handed the *adapter* rows it had built itself. A harness that starts below the
validator cannot find the one class of defect a replay round exists for. §D of the suite re-runs that
exact defect through this harness and confirms it is still refused.

---

## §3  THE P1-B8D ACTIVATION MANIFEST

**NOT EXECUTED.** Every step below is for the USER, in order, after explicit authorisation.

### A1 — Which repository commits must be pushed first

| | |
|---|---|
| branch | `feature/product-strategy-board-p0` |
| commits | everything from `c139943` (main) to this branch's HEAD |
| command | `git push origin feature/product-strategy-board-p0` |

Push is USER-owned. Nothing in the activation reads the repository at runtime — the push matters
because the frontend files in A2 are deployed **from** it, and a deployment from an unpushed tree is
a deployment nobody can reproduce.

### A2 — Which frontend files must be deployed

`FRONTEND_DEPLOY_REQUIRED = YES`. The whole `assets/` tree plus `index.html`, as one release. The
files this branch changed, and which therefore must all land together:

```
index.html
assets/js/app.js
assets/js/pages/product-strategy-board.js
assets/js/product-strategy/psb-views.js          (new at P1-B8B)
assets/js/product-strategy/psb-board-ui.js
assets/js/product-strategy/km-product-strategy-live-adapter.js
assets/js/product-strategy/km-product-strategy-site-universe.js
assets/js/api/km-product-pricing-workspace.js
assets/js/api/km-product-pricing-adapter.js
assets/html/pages/product-strategy-board.html
assets/css/product-strategy-board.css
```

**Partial deployment is the failure mode to avoid.** `psb-board-ui.js` throws by name if
`psb-views.js` has not loaded; the accessor's four new states need the two adapters that carry them.

### A3 — Does Apps Script need synchronising?

`APPS_SCRIPT_SYNC_REQUIRED = NO` **for the frontend work**, and **YES for the flag**, which is A5.
No `.gs` file in `assets/specs/active/apps-script/` changed in P1-B8A, P1-B8B or P1-B8C. The only
Apps Script edit activation needs is the one-line flag change; if the USER also wants the row-shape
sample from §1.3, that adds one file to the same paste.

### A4 — Does it need a new Apps Script version?

**Yes, one.** An Apps Script Web App serves the deployed *version*, not the saved editor content, so
saving `00_config.gs` with the flag true changes nothing a browser can see. The sequence is: paste →
save → **Deploy → Manage deployments → Edit → New version** → Deploy. The deployment id and URL do
not change.

### A5 — The one place the flag becomes true

```
FILE   assets/specs/active/apps-script/00_config.gs
LINE   var PRODUCT_STRATEGY_ENABLED_ = false;
BECOMES var PRODUCT_STRATEGY_ENABLED_ = true;
```

**There is exactly one.** The suite asserts the declaration count is 1, so "the other place" cannot
quietly exist. This is the server gate; it is the one that matters, and it is the last thing to turn
on and the first thing to turn off.

### A6 — The one place navigation becomes enabled

Navigation is **declared but not rendered** — `index.html` has no Product Strategy menu item at all,
by design, because a greyed-out item can be un-greyed by deleting a class. Enabling it is therefore
an *addition*, in one place:

```
FILE   assets/js/app.js
FROM   KM_STAGED_SECTIONS_['product-strategy'].enabled = false
TO     KM_STAGED_SECTIONS_['product-strategy'].enabled = true
PLUS   render the declared menu into index.html's sidebar, immediately above
       <div class="menu-parent" data-menu-id="carrier">  (the Pricing Center parent)
       using KM.nav.buildStagedMenu('product-strategy') as the shape of record
PLUS   add 'product-strategy': 'product-strategy-board-section' to the TWO section maps
       in showSection()
```

The suite asserts `enabled: false` occurs exactly once, so there is one switch and not two.

### A7 — The order of operations

**Server first, client second, navigation last.** Each step is reversible on its own, and each is
invisible to an operator until the next one happens.

| # | step | owner | who can see it |
|---|---|---|---|
| 1 | Push the branch (A1) | USER | nobody |
| 2 | Paste `00_config.gs` with the flag **true**, save, **new version**, deploy | USER | nobody — the frontend has no menu item |
| 3 | Verify the endpoint now answers (A8.1) | USER | nobody |
| 4 | Deploy the frontend files (A2) with bumped cache-busters (A14) | USER | nobody — still no menu item |
| 5 | Verify the page renders by direct call (A8.2) | USER | nobody |
| 6 | Set `enabled: true` and add the sidebar markup (A6); redeploy the frontend | USER | **everyone** |
| 7 | Verify (A8.3 – A8.6) | USER | everyone |

**Step 2 before step 4 is not a preference.** A frontend that expects rows against a server that
still refuses shows `FEATURE_DISABLED`, which is correct and harmless. The reverse — a server
answering into a frontend that has not been deployed — cannot be verified at all. This is the same
"Apps Script first, frontend second" rule P1-B6 established and P1-B7F proved by execution.

**Activation depends on none of:** Google Cloud, OAuth, an authentication gateway, Secret Manager, a
query-string bypass, a temporary public endpoint, or any client-asserted identity. It uses the
Operation System's existing configuration exactly as every other page does. The security track is
`DEFERRED_TO_P2_A`.

### A8 — How each step is verified

| | check | expected |
|---|---|---|
| A8.1 | In the Apps Script editor, run the system health action | `product_strategy_enabled: true`, `db_writes: 0` |
| A8.2 | Browser console, before the menu exists: `KM.pages.productStrategyBoard.mount({})` | a site menu renders; the state host is empty |
| A8.3 | The sidebar shows `Product Strategy` **immediately above** `Pricing Center` | one parent, six children |
| A8.4 | Click each of the six children | each renders its own view; the crumb names it |
| A8.5 | Open two other pages (Site Inventory, Carrier Rate Card) | borders, cards and panels unchanged — see A15 |
| A8.6 | Network panel, one full session | exactly two action names, both ending `.get` |

### A9 — Rollback order

**Exactly the reverse of A7, and the first step alone is enough.**

| # | step | effect |
|---|---|---|
| 1 | `enabled: false` in `app.js` + remove the sidebar markup; redeploy frontend | the page is unreachable again |
| 2 | Flag `false` in `00_config.gs`, save, **new version**, deploy | the server refuses again |
| 3 | `git revert` the activation commit | the tree matches the deployment |

Steps 1 and 2 are independent: either one alone makes the feature unreachable, which is why there are
two gates. Step 3 is bookkeeping and can follow at leisure — **but the tree must not be left
disagreeing with the deployment overnight.**

### A10 — The fastest way back off

**Flag to `false`, save, new version, deploy — Apps Script only, under a minute, no frontend
deployment.** The page then answers `FEATURE_DISABLED` at zero requests, with the sidebar item still
present and inert. Use this first in any incident and do the tidy-up afterwards; do not start with the
frontend, because a frontend deployment is slower and the server gate is the one that actually
refuses.

### A11 — How to prove database writes are still zero

Three independent readings, and they must agree:

1. **The deployment's own counters** — the health action reports `db_writes`, `drive_writes`,
   `status_transitions`, `emails`, `demo_mutations`. All must be `0`, and `read_only: true`.
2. **The action list** — the two Product Strategy actions are `productPricing.workspace.get` and
   `productPricing.siteUniverse.get`. Neither has a writer branch; `72_` opens the spreadsheet
   read-only and never calls `getOperationDb`.
3. **The repository call graph** — `product-strategy-production-readback-p1-b3.test.js` §A proves by
   call graph, on stripped source, that no writer is reachable.

**A counter that looks measured and is not is the thing this project keeps finding at the bottom of a
false green** — so treat (1) as measured, (2) and (3) as declarations backed by tests, and require
all three.

### A12 — How to prove only the two reads are open

```
grep -rn "'productPricing\." assets/js/api/
```

Exactly two matches, both `.get`. The suite asserts this and asserts that no write-shaped name
(`upsert`, `submit`, `create`, `delete`, `write`, `save`) exists under the `productPricing.` prefix.
On the server, `01_router.gs`'s action table is the second reading: the two names must be the only
`productPricing.*` entries, and both must be registered as reads.

### A13 — How to keep the demonstration fixture out of production

Four checks, all already asserted:

1. `index.html` and the page partial load nothing from `assets/tests/` or `docs/prototypes/` — checked
   on **load paths** (`src=` / `href=`), not on prose, because both documents contain comments naming
   those directories in order to say they are not used.
2. No production module names `_p1b8c-capture`, `P1B8C_CAPTURE`, `preview-fixture` or `PSB_PREVIEW`.
3. `KM.pages.productStrategyBoard.CONTRACT.fixture_fallback === false` and
   `loads_prototype_assets === false`.
4. There is no failure path that reaches a fixture: every refusal state renders into
   `#psb-state-host` and `#view` stays empty. §I of the suite drives an invalid contract version and
   asserts exactly that.

### A14 — How to confirm the cache-buster

Every `assets/` URL in `index.html` carries `?v=`. The Product Strategy files are currently
`?v=productstrategy-p1b8b-20260912` (11 of them). **Bump them all, together, in the activation
commit** — a CSS or JS fix a browser still has the old copy of is not deployed yet.

To confirm after deploying: open the page with devtools **Network → Disable cache off**, and check
that `psb-views.js`, `psb-board-ui.js` and `product-strategy-board.css` all carry the new `?v=` and
return `200` rather than `304`.

### A15 — How to confirm no other page was restyled

**This is the check P1-B8A exists because of.** The board stylesheet is loaded by `index.html` on
every page and loads last of twenty-four, so a single bare-class rule in it restyles the whole
application, with no error and no failing test.

1. **Automated, before deploying:** `product-strategy-scope-correction-p1-b8a.test.js` §B asserts
   every selector is scoped to `.psb-page` or is one of the two `body` modes, and
   `product-strategy-replay-acceptance-p1-b8c.test.js` §J re-measures it.
2. **By eye, after deploying:** open Site Inventory, Order Planning, Carrier Rate Card and Shipment
   Overview. Those pages use `.card`, `.panel`, `.col` and `.grid`, which are the class names the leak
   was in. Borders, radii, shadows and spacing must be unchanged.
3. **The failure signature to look for** is not an error — it is a border, a radius or a font weight
   that is subtly different from the screenshot you took before deploying. Take those screenshots
   first.

---

## §4  What activation does NOT unblock

- **The anonymous Web App posture.** The deployment is `ANYONE_ANONYMOUS` and all 138 actions sit
  behind that. That is `DEFERRED_TO_P2_A`, it is unchanged by this page, and it is not made worse by
  it — the two new actions are reads behind a server flag.
- **390×844.** `.sidebar` is a fixed 240px with no breakpoint anywhere in `assets/css`, so every page
  in the application gets 86px of content on a phone. Not a Product Strategy defect, not a Product
  Strategy fix, and recorded as a shell-wide task for the end of the first phase.
- **Sub-tab URL routing.** The shell has no router at all. The six views have canonical route
  identity; binding it to the address bar means giving the whole application a router and changing
  Back and reload on every page.

## §5  THE IMAGE GATE IS CLOSED (P1-B8C-R3-R2)

**The production census settled it.** `RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS()` read the whole
`sku_details.image_url` column — no sampling, no cap — and returned `CENSUS_TAKEN`,
`FPa6684fce`, 2,425 characters, one chunk, `writes 0`, `rows_modified 0`.

| | rows |
|---|---|
| total | **192** |
| blank | **14** |
| present | **178** |
| **repo-relative asset path** | **178** |
| absolute https / http | **0 / 0** |
| root-relative · filename-only | 0 · 0 |
| Windows path · traversal · rejected scheme | 0 · 0 · 0 |
| Drive/file id · extension missing · unknown | 0 · 0 · 0 |
| **unique external hosts** | **[ ] — none** |

**Compatibility, from the census's own numbers:** `old_displayed 178` → `new_displayed 178`,
`new_rejected 0`, `depends_on_allowlist 0`, `old_rejected_new_displayed 0`, `both_fallback 14`,
`allowlist_decision_required false`. **The shared policy is 100% compatible with the production
universe.**

**Decisions, recorded as policy:**

1. `APPROVED_EXTERNAL_HOSTS` **stays empty** — and now because 192 rows say so, not because nobody
   looked.
2. No guessed host. No wildcard. No suffix matching.
3. **A repo-relative path is the only image reference production uses in Phase 1.**
4. The 14 blanks keep their existing fallback.
5. CSP, CDN, external image hosting and wider security hardening are **deferred to Phase 2**.

**All four consumers now share one resolver.** `campaign-risk.js` was the last one outside it; it
put `r.image` into an `<img src>` with no judgement at all. It now calls the same
`resolveSkuImageUrl` the other three reach, fails closed when the policy is absent, and keeps its
original `onerror` and placeholder. `sku-handbook.js` also stopped rendering `<img src="">` for a
REFUSED reference — an empty `src` resolves to the page's own URL, which is a broken image drawn
exactly where a placeholder belongs.

**IMAGE GATE: CLOSED.** No further image architecture is in scope. **P1-B8D is the only next step.**

---

# §5  P1-B8D — THE ACTIVATION, AND THE RUNBOOK THE USER RUNS

**Release `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R11`.** Prepared as a local commit. Nothing synced, no
version cut, no deployment updated, nothing pushed.

## 5.1  The two authorities, and the third that was not created

| Authority | File | Before | After |
|---|---|---|---|
| Server | `00_config.gs` `PRODUCT_STRATEGY_ENABLED_` | `false` | **`true`** |
| Navigation | `app.js` `KM_STAGED_SECTIONS_['product-strategy'].enabled` | `false` | **`true`** |

No query parameter, no `localStorage` key, no DOM class, no TEMP function, no route that skips a
gate. The suite asserts the **absence** of each of those, which is a stronger claim than the two
values and survives the next flip in either direction.

**The menu is built from the registry.** §A14's instruction in `app.js` said to *"add the sidebar item
to index.html"* — and doing that would have created a second definition of the six labels
`psb-views.js` owns, a second definition of the placement `insertBefore` owns, and a menu that
`enabled: false` could no longer switch off. Instead `mountStagedMenus()` is the one caller of
`buildStagedMenu`, it refuses any section whose `enabled` is not exactly `true`, and it inserts before
the `carrier` anchor. **`index.html` still contains no Product Strategy markup** — the four P1-B8B
assertions that say so were written when the feature was OFF and are still true with it ON.

## 5.2  Apps Script sync list — two files, in this order

1. **`00_config.gs`** — the flag, and `CONFIG_BUILD_VERSION_ → R11`.
2. **`63_api_v1_system_health.gs`** — `SYS_DEPLOYMENT_RELEASE_ → R11`, `SYS_BUILD_VERSION_ → R11`, and
   the manifest rows for `00_config.gs` and for itself.

**Config first**, because `63_` declares what it *expects* `00_config` to carry: pasting `63_` first
leaves a window where the deployment reports a mismatch against a file that has not arrived.

**And nothing else, which is the other half of a sync list.** `72_` did not change — no action, no
response shape, no gate position — so `PPW_BUILD_VERSION_` is still R10 and **72_ must not be
re-pasted**; re-pasting an unchanged file is how an unrelated edit reaches production by accident.
`01_router.gs` did not change, and the **action contract version is deliberately not bumped**: a flag
is not a contract. `appsscript.json` unchanged, no OAuth scope added.

## 5.3  Frontend deploy — `index.html` plus 34 assets on `activation-p1b8d-20260912`

Two token series became one. The eleven Product Strategy references carried
`productstrategy-p1b8b-20260912`, set at `fb31e2c` and **published** — while three files under it
changed bytes afterwards without it moving (`km-product-pricing-adapter.js` and `psb-board-ui.js` at
P1-B8C-R3, `psb-data-contract.js` with them). The stale-reference guard could not see it: it reports a
reference left behind on a token it *knows*, and that token was never in `ROUND_TOKENS`. A returning
browser held the pre-R3 `psb-board-ui.js` — the copy with no `<img>` `onerror` fallback — and would
have carried it through activation. `staleAppTokenRefs` is now `[]` and those eleven are inside the
guard permanently.

## 5.4  Deployment order — the USER runs these, in this sequence

1. Review the local commit; `git push origin feature/product-strategy-board-p0`.
2. Open the Apps Script project. Paste **`00_config.gs`**, save.
3. Paste **`63_api_v1_system_health.gs`**, save.
4. **Create a new version.** Do not create a new deployment.
5. **Update the existing Web App deployment** to that version.
6. Verify before touching the frontend: `system.health` must report
   `product_strategy_enabled: true`, `build_id: …-R11`, `config_build: …-R11`, `mixed_deployment:
   false`.
7. Deploy the frontend: `index.html` and every asset it references.
8. Hard-reload with cache disabled and confirm the 34 assets return `200`, not `304`.

**Steps 2–5 and 7 are user-owned and manual.** No `clasp`, no automated deploy.

## 5.5  Smoke matrix — after step 7, by eye

| # | Check |
|---|---|
| 1 | Product Strategy appears in the sidebar, **above Pricing Center** |
| 2 | All six sub-tabs open: Executive Overview · Category Analysis · Deal Risk · Data Quality · Strategy Workspace · Advanced Details |
| 3 | Company → Country → Marketplace narrows in that order; the workspace read fires only on a complete scope |
| 4 | Advanced Filters collapsed by default; Price Scenario does not take the analysis view |
| 5 | Chart Y axis complete; X axis complete at ordinary density; dense data scrolls **inside the chart**, never the page |
| 6 | Product photographs load; no broken image; a missing one says so in words |
| 7 | The price-status chip is on the context row on every view |
| 8 | Other pages — Site Inventory, Order Planning, Carrier Rate Card, Shipment Overview — unchanged in border, radius, shadow and spacing |

## 5.6  Rollback

**Server first, and it needs no frontend deploy:** `PRODUCT_STRATEGY_ENABLED_ = false` → save → new
version → update the existing deployment → confirm `product_strategy_enabled: false` and that a
`productPricing` read answers `FEATURE_DISABLED` with `dbOpened: false`, `tablesRead: 0`. The
navigation half (`enabled: false` + a frontend deploy) can follow later.

§F of the activation suite **executes** that: it rebuilds the sandbox from the real `00_config.gs` with
the constant set back to false, calls both handlers through the real resolver, and measures that the
spreadsheet was opened **zero** times. The gate sits before `io.openTarget()` in both handlers, which
is what makes it a stop rather than a slower read.

**Never**: delete a deployment, create a second one, roll back the whole Operation System, `git reset`
or rewrite history, or make rollback depend on a database mutation. The feature has never written
anything.

## 5.7  What activation still does not unblock

- **The anonymous Web App posture.** Deferred to **P2-A**, unchanged by this page — and one feature
  more exposed than yesterday, because the flag had been standing in for a lock. Recorded in
  `identity-boundary-baseline-sec-a0`, not smoothed over.
- **390×844.** The fixed 240px sidebar is a shell-wide blocker for **Phase 1 closing QA**. Product
  Strategy adds no page-level overflow at that width; its chart scrolls inside its own container.
- **Sub-tab URL routing.** The shell has no router. The six views have canonical routes and no address.
- **CSP, CDN, external image hosts, asset base.** Phase 2.

**ACTIVATION PACKAGE READY — NOT SYNCED — NO VERSION — NO DEPLOYMENT — NOT PUSHED.**


---

# §6  P1-B8D-R4 — THE ACTIVATION AUTHORITY LIST, CORRECTED

P1-B8D §5.1 said there were two authorities and that there was no third. That was true of everything
it could see, and it was wrong about the page. There was a third gate — the accessor's client
capability mirror — and it differed from the other two in the way that mattered: **it had no
producer**. `setCapability` was exported, documented as the only way to raise it, and called by
nothing in `assets/js` or `index.html`. A browser held `false` from load to unload.

The activation therefore shipped, deployed, attested R11 on the wire — and the live page answered
`FEATURE_DISABLED` at zero requests on all six sub-tabs.

## 6.1  The list, as it now stands

| # | Authority | Where | What it decides |
|---|---|---|---|
| 1 | **Server** | `00_config.gs` `PRODUCT_STRATEGY_ENABLED_` | whether the data may be read at all — the last gate, before `io.openTarget()` |
| 2 | **Navigation** | `app.js` `KM_STAGED_SECTIONS_['product-strategy'].enabled` | whether the menu appears |

**There is still no third.** The client capability is a **derived cache of authority 1**, read from
`system.health` — a deployed, read-only action already on the transport's metadata allowlist, already
publishing `product_strategy_enabled` from 63_. It decides nothing: it exists so that a switched-off
feature costs zero business reads instead of one round trip to be told what could have been asked once.

Adding `product_strategy_enabled` to `getClientCapabilities` would also have worked and was rejected
for one reason: it needs an Apps Script change, and this round was not authorised to make one. If a
later round moves the mirror onto that transport, it replaces this derive — it does not join it.

## 6.2  What must never happen again

- No client file may **declare** the capability. It may **ask**.
- No harness may **supply** it. `_p1b8c-replay.js` now serves the health question and lets the shipped
  accessor derive the answer; `capabilityOff` models a server that says no.
- A suite that raises the mirror itself cannot fail for the reason production fails. That is how a
  whole corpus stayed green over a page that refused itself.

## 6.3  Runbook — activation

1. `PRODUCT_STRATEGY_ENABLED_ = true` in `00_config.gs` → save → new version → update the existing
   Web App deployment.
2. Verify on the wire: `system.health` reports `product_strategy_enabled: true`.
3. Deploy the frontend. **The client derives the rest.** There is no third switch to flip.

## 6.4  Runbook — rollback

1. `PRODUCT_STRATEGY_ENABLED_ = false` → save → new version → update the existing deployment.
2. The next page life derives `false` and sends **zero** pricing reads. A page already open reaches a
   handler that refuses before it opens a spreadsheet.
3. **No frontend deploy is required to roll back.** The navigation half (`enabled: false` plus a
   deploy) can follow later if the menu should also disappear.


---

# §7  P1-B8D-R5 — CHOOSING A SITE

§6 corrected the authority list and was right about authority. It said nothing about reachability,
and the next live acceptance failed on exactly that: the capability derived correctly, the universe
read correctly, ten READY sites came back — and the page asked the operator to choose one while
offering nothing to choose with.

## 7.1  The two ladders, which are not the same ladder

| | Owner | Source of its options | Runs when |
|---|---|---|---|
| **Site chooser** | `product-strategy-board.js` → `#psb-site-host` | `productPricing.siteUniverse.get` | as soon as the universe is OK |
| **Scope bar** | `psb-board-ui.js renderScope()` → `#scope` | the **loaded rows** of one site | only after `workspace.get` succeeds |

Only the first can change which site you are looking at. Before this round only the second existed,
so the control that lets you choose a site appeared once you had already chosen one.

**`#psb-site-host` belongs to the page controller.** The board redraws `#scope` on every mount; a
chooser living there would be erased by the answer to its own question.

## 7.2  The rules the chooser keeps

- Options come from the universe response and from nothing else. No default, no `localStorage`, no
  query string.
- **The page never picks.** The placeholder stays selected until a person acts — the same position
  the shell's shared scope modal takes ("never auto-confirm All/unselected").
- A tier with exactly one value resolves itself and renders as read-only context. One option is a
  fact, not a choice.
- Changing a tier **drops every tier below it** and lets `narrow()` re-resolve them.
- A complete scope reads the workspace **once**. Re-picking the same site reads **nothing** while
  that site's answer is here or coming — a held-down control is not a queue of requests.
- A stale answer is dropped, never rendered.
- An unreadable universe offers **no controls at all**.

## 7.3  Runbook — unchanged, with one more step to look for

1. `PRODUCT_STRATEGY_ENABLED_ = true` → save → new version → update the existing deployment.
2. `system.health` reports `product_strategy_enabled: true`.
3. Deploy the frontend.
4. Open the board. It shows **Company / Country / Marketplace** and asks you to choose. That is the
   correct resting state — not an error. Pick a company; the ladder converges; the workspace loads.

## 7.4  Rollback — unchanged

`PRODUCT_STRATEGY_ENABLED_ = false` → save → new version → update the existing deployment. The next
page life derives `false` and sends zero pricing reads. **No frontend deploy is required to roll
back.**


---

# §8  P1-B8D-R6 — THE VISUAL CONTRACT

§7 made the board reachable. This section records what it is allowed to look like, so the next round
does not re-derive it.

## 8.1  Ownership

| Concern | Owner | This page may |
|---|---|---|
| filter label + control spec | `--filter-*` tokens + `.km-filter-bar .filter-group` | **use**, never restate |
| button spec | `.btn` + `--btn-*` | **use**, never restate |
| tab rail structure, scroll, focus, keyboard | `.km-tab-rail` | **use**; one documented active-fill modifier |
| card frame values | `.km-category-card` | reuse the values |
| breakpoint tiers | `--km-bp-*` | reuse the tiers |
| the state box | **nobody** — there is no shared component | own it, scoped |

## 8.2  Rules that must keep holding

- Every selector in `product-strategy-board.css` begins at `.psb-page` (the only exceptions are the
  pre-existing `body.presenting` / `body.is-fullscreen` state hooks).
- No shared class is redefined at the top level. A shared class may be adjusted **inside**
  `.psb-page` and nowhere else.
- No bare `select` / `button` / `.card` / `.btn` / `h1` / `.nav-text` selector.
- No `!important` added without a line saying why.
- Severity is never carried by colour alone — the state box differs in border width, border style
  and glyph as well.
- Disabled is never carried by colour alone — the border style and the cursor change too.
- The site chooser is a control, so it is absent from print and from presentation.

## 8.3  The thirteen states, all photographed

`awaiting-site · loading-universe · loading-workspace · ready · empty · error · feature-disabled ·
not-authorized · offline · timeout · response-not-readable · presentation · print/PDF`

Two of these could not previously be reached by the runner and one was lying:

- **offline** is now simulated as a browser fact (`navigator.onLine === false`), because that is the
  only input that makes the accessor choose `BROWSER_OFFLINE`. Faking the refusal code would have
  photographed a state the classifier never picked.
- **loading-universe / loading-workspace** hold the read open. A loading state only exists while the
  answer is outstanding; it cannot be reached by answering.
- **empty** used to pass a site that is **not in the universe**, and since R5 enforces membership
  that is REFUSED — so the grid's "empty" cell was photographing *"Choose a site to analyse."* under
  the name EMPTY. It is now a real site whose server answers with no rows.


---

# §9  P1-B8D-R7 — THE INTERACTION CONTRACT

§8 recorded what the page may look like. This section records what it must DO while a person is
using it, so the next round does not re-derive it.

## 9.1  Ownership, settled

| Concern | Owner | Everyone else |
|---|---|---|
| which site is loaded | the page controller, from `siteUniverse.get` | may read it; may not set it |
| the three site controls | the page controller | the board renders none (`siteOwnedByPage`) |
| Category / Series | the board, from the rows it has loaded | re-derived on every new adapter |
| the long explanation | one `i` button in the page header | the state box says what to do, once |
| the `?` popovers | built but not rendered (`inlineHelpIcons: false`) | the text stays in the file |
| the price on the X axis | not rendered (`axisPriceRow: false`) | tooltip and aria-label still carry it |

## 9.2  Rules that must keep holding

- A repaint of the chooser **restores** the canonical scope into the controls that exist. A tier is
  rebuilt only when its option list or its shape changes.
- When a control is replaced, the focus is placed on the next tier that can be acted on. When it is
  not replaced, nothing touches the focus.
- **The board is on screen only while the current scope is complete and its read succeeded.** Every
  other state clears `#nav`, `#crumbs`, `#banner`, `#scope` and `#view`.
- **Clearing the board is never clearing the selection.** Loading, failing and refusing all keep
  every value a person confirmed.
- An outstanding read whose scope has been withdrawn is invalidated, not awaited.
- Re-picking the site already loaded costs no request. Re-picking after a failure must.
- A new adapter re-derives Category, Series, currency and the scenario series against the new rows.
- The drawer closes to `hidden`, returns focus to its opener, and neither applies nor clears the
  scenario. It is absent from presentation and fullscreen.

## 9.3  What a browser must measure, because markup cannot say it

`focus after a pick` · `node identity across a repaint` · `whether a chart is still on screen under a
notice` · `elementFromPoint over a closed drawer` · `one control height and one label gap across two
renderers` · `the order the seven controls read in`.

---

# §10  P1-B8D-R8 — THE LIFECYCLE CONTRACT

§9 recorded what the page must do while somebody is using it. This section records what it must do
when they **stop** — because that is where every one of this round's six reports actually lived.

## 10.1  Ownership, settled

| Concern | Owner | Everyone else |
|---|---|---|
| when the board paints | `psb-board-ui`'s own `MOUNTED` flag | a host may ask it to stop; nobody else may gate a paint |
| the size observer on `#view` | `psb-board-ui`, one at a time | connected at `boot()`, disconnected at `unmount()` |
| the three body state classes | `psb-board-ui` | stripped on unmount; re-derived on the next mount |
| whether a visit is restored | the page controller, via the parked controller | the renderer is handed an adapter and does not know it is a restore |
| the canonical site identity | the page controller | passed to the board at mount as `siteIdentity` |
| the chart toolbar | the host, via `chartToolbar` | the prototype still renders every control |
| the sentences under a filter control | the host, via `inlineFilterNotes` | the counts are still computed either way |
| a genuinely empty answer | the page's state host, from `BOARD.notices()` | never a paragraph hanging off a control |

## 10.2  Rules that must keep holding

- **A renderer that can be mounted can be unmounted, and clearing its output is not unmounting it.**
  `PSB_BOARD.unmount()` sets `MOUNTED = false`, disconnects the observer, closes every popover and
  fullscreen, strips the body state classes, and empties the five hosts.
- **Nothing paints while the board is not mounted.** `render()`, `renderData()` and the resize
  callback all check — the callback twice, once when it is scheduled and once on the frame it runs,
  because the defect this round fixed was a callback scheduled while the board was up and delivered
  after it came down.
- **One observer per board, not one per mount.** `boot()` runs again on every site change;
  `observeContainer()` disconnects its own before observing.
- **The board comes down before the next site's read goes out**, in the same synchronous turn, and
  stays down for the whole of it. A failed read shows that site's error over nothing, and must not
  put the previous site's board back.
- **Leaving the page and coming back is ONE consistent page.** Preserve-consistently: the same site,
  the same view, the same category, the same simulation, and **zero new requests**. A controller is
  parked only when it is complete, mounted and holding its adapter; anything less is dropped, so a
  restore is all or nothing.
- **A simulation belongs to a site.** Changing company, country or marketplace clears every
  unpersisted override, the undo stack, the form and the chip. A view, a category, a series and a
  leave-and-return of the same site all keep it. Nothing is written anywhere in either case.
- **A control that is removed is not rendered**, never hidden. No empty container, no tab stop.
- **A genuinely empty answer is still explained**, in the state host, beside a board that is still
  correct — and never dressed up as a normal ready page.

## 10.3  What a browser must measure, because markup cannot say it

`what is PAINTED at a control's own centre` (the close button was present, correct and behind the
shell header) · `#view one animation frame after a teardown` · `#view while a read is outstanding` ·
`the tab order, not the visible control count` · `a live handler firing after an unmount` · `the
override count across a site change, a view change and a category change`.

## 10.4  Two things this harness cannot see, and how they were reached anyway

- **`--hide-scrollbars`.** The acceptance browser never grows or loses a scrollbar, so the width
  change that a real teardown produces on a real screen does not happen here. The sequences change
  the viewport deliberately instead, and say so in the trace.
- **Animation frames under a virtual-time budget.** The size observer answers on `rAF`, and headless
  Chrome delivers those erratically — the trace that FOUND this defect saw it three runs in six. The
  suite therefore drives the same defect through a deterministic route: `#btnPresent` lives in the
  partial, survives the unmount, and its handler calls `render()`. Same property, every run.

---

# 11 · P1-B8D-R9 — THE THREE CORRECTIONS AFTER LIVE ACCEPTANCE

## 11.1  The chart toolbar contract, as corrected

R8 removed the whole row. **R9 removes one button.** The renderer now carries two independent
arguments rather than one, and the production host sets only the narrower of them:

| argument | default | Product Strategy | what it decides |
|---|---|---|---|
| `chartToolbar` | rendered | *(not set — takes the default)* | whether the row exists at all |
| `chartFullscreen` | rendered | **`false`** | whether the row includes Fullscreen |

**Production therefore shows:** View (Auto Fit · Comfortable) · Detail (Clean · Detail) · Layers ·
Size (Fit / 100% / 125% / 150%, Comfortable only) · Reset view. **Six controls in four groups.**

**Fullscreen is not built**, rather than hidden — no node, no box, nothing in the tab order, and
nothing matching `fullscreen` by id, by accessible name or by visible text. `toggleFullscreen`, the
Escape-leaves-fullscreen listener and the row builder are all retained, and the prototype still
renders every one of them.

**The host does not declare the default.** `chartToolbar` is absent from the mount call rather than
set to `true`: a host that states the default is a host asserting something it does not decide.

## 11.2  The simulation semantic

`base.css` owns the palette. The page takes `--km-ui-utility` (`#8e76a8`) and derives three values
from it rather than inventing a sixth purple:

| token | value | used for | contrast |
|---|---|---|---|
| `--scn-key` | `var(--km-ui-utility, #8e76a8)` | the left border, the tag fill | — |
| `--scn-ink` | `#4b3a61` | the sentence | 10.1:1 on paper, 9.3:1 on the tint |
| `--scn-mark` | `#7a5f96` | chart strokes | 5.4:1 on paper |
| `--scn-tint` | `#f7f4fb` | the fill | — |

**Every scenario surface answers in this one vocabulary**: the banner, the chip, the panel frame, the
panel badge, the chart ghost, the scenario link and the "Applied:" line.

**Colour is never the only carrier.** The banner leads with a `SCENARIO` tag word; the panel keeps a
dashed frame; the chart keeps a dashed stroke; the chip keeps its text. On paper the tag inverts to
solid black and the sentence is kept whole.

**And the shape is deliberately not a refusal's.** `.psb-state--stop` is `6px double` in the accent
red; the scenario is `4px solid` in the brand purple. Both are measured, as computed style, in the
same browser run.

**The statement now names both ways a simulation ends** — a reload **or** a site switch. R8 made the
site switch clear it; the sentence had not caught up.

## 11.3  The image reference contract, extended

```
    sku_details.image_url
      -> KM_IMAGE_REFERENCE_POLICY.classify()
           scheme / traversal / local-path / extension rules   (unchanged)
           -> KM_REPO_ASSET_MANIFEST                            (NEW)
                covers(path)?  no  -> pass through, unjudged
                has(path)?     yes -> SAME_ORIGIN_ASSET
                caseVariantOf? yes -> REJECTED REPO_ASSET_CASE_MISMATCH  note: REPO_HAS: <exact path>
                otherwise          -> REJECTED REPO_ASSET_NOT_FOUND
      -> four consumers, none with a rule of its own
```

- **Absence is only claimed where somebody looked.** The manifest publishes its roots; a reference
  outside them is classified exactly as it was before this round.
- **A case mismatch is reported and NOT followed.** Rewriting it would put a photograph on the screen
  for a row that is wrong — the defect would leave the page and stay in the database.
- **The manifest is generated**, by `tools/assets/build-repo-asset-manifest.js`, and a suite re-reads
  the directory and fails if the committed file has drifted.
- **The chart marker has an error path at last**, with its own sentence: *"The record names a product
  photograph that did not load."* — which is a different fact from *"No product photograph is on
  record"* and sends an operator somewhere different.

# 12 · P1-B8D-R10 — THE READ ROUTE, THE ERROR VOCABULARY, AND THE BOUNDED RECOVERY

## 12.1  What the operator reported, and what it turned out to be

Two different errors on one live page, in an incognito window, on GitHub Pages:

1. `RESPONSE_NOT_READABLE` — "API 預期 JSON，卻收到 web page", over a console 404 on
   `script.googleusercontent.com/macros/echo…`
2. `SOURCE_NOT_CONNECTED` — "No server answered", with the chooser already holding ResUS / US / Amazon

They are one defect seen at two moments. **Neither is a Google Login problem**; Google Login is not
implemented, and nothing in this round implements it.

## 12.2  The transport contract this page now sits behind

| Property | Value | Who enforces it |
|---|---|---|
| read verb | `GET`, body in `km_body` | `km-transport.js` `readQuery()` |
| auto-retry, reads | **at most 1**, and only for a redirect-target 404, a method downgrade, or a network failure with no response | `isAutoRetryable()` + `maxRetries` |
| auto-retry, writes | **0**, unconditionally | `isAutoRetryable()` returns false for `kind: 'write'` |
| where a recovery starts | the stable `/exec`, rebuilt from `endpoint()` | `urlFor()`; a `googleusercontent` target is never stored and never re-requested |
| the recovery's identity | a **new** request id (`<rid>-R2`), validated against itself | `ridForAttempt()` |
| cache | `cache: 'no-store'` on every attempt | `attempt()` |

A sign-in page, a 404 from `/exec` itself, a business refusal, a superseded request, a timeout and an
action mismatch are **never** retried. Asking a second time cannot create a session, move an address,
or change a refusal — it can only delay telling the operator what is actually wrong.

## 12.3  The error vocabulary, as activated

Two states join the page's vocabulary, and both exist because the honest name for a failure was
already being replaced by a less honest one:

| State | When | What the operator is told |
|---|---|---|
| `HTTP_NOT_FOUND` | a 404 from the endpoint or from a redirect target | the address answered and holds nothing to read |
| `ACTION_MISMATCH` | an envelope whose action or request id is not the one that was sent | the answer belonged to a different request |

**Both had to be added in three places at once**, and that is the activation risk worth naming. The
accessor produces the state; `km-product-strategy-site-universe.js` and
`km-product-strategy-live-adapter.js` carry the words for it. Both maps resolve an unknown state as
`UX[state] || UX.SOURCE_NOT_CONNECTED` — so a state added to the accessor and forgotten in a map does
not throw, does not warn, and renders as **"No server answered"**: the exact sentence this round
exists to stop being said about a server that answered. The three files carry one cache token for
that reason.

## 12.4  What this round did NOT change

* no `.gs` file, no server behaviour, no deployment, no new action
* no write of any kind, and no write-shaped action added
* no feature flag moved; `product_strategy_enabled` was already true live
* no Google Login, no S2 runtime
* no other page's business logic

# 13 · P1-B8D-R10A — THE CAPABILITY READ JOINS THE TRANSPORT

## 13.1  Correction to §12

§12 was written as though all three Product Strategy reads had moved to `KM.transport.request` at
R10. **Two had.** `system.health` was migrated at R10A; `a5bdfc2` is a partial migration and must not
be deployed as though it were the whole one.

## 13.2  The activation risk this round carries

Two shipped modules move together on one cache token, and neither half is useful alone:

* `km-product-pricing-workspace.js` — routes `system.health` through the shared transport, and
  publishes `capabilityFailure()`: `null` when a server answered, a state name when the read could
  not be completed.
* `pages/product-strategy-board.js` — shows that state instead of asserting FEATURE_DISABLED.

A browser holding the **new controller against the old accessor** calls `capabilityFailure()` on a
module that does not have it and falls back to the old sentence. A browser holding the **new accessor
against the old controller** classifies the failure correctly and then renders it as "not enabled
yet" — the exact conflation this round removes. Hence one token.

## 13.3  What FEATURE_DISABLED means from here

| Situation | State shown | Requests issued |
|---|---|---|
| server answers `product_strategy_enabled: true` | none — the board loads | universe, then workspace |
| server answers `false` (or any non-`true` value) | `FEATURE_DISABLED` | **zero** business reads |
| capability read 404s once, then answers | none — the board loads | capability ×2 (one bounded recovery), then the rest |
| capability read returns a sign-in page | `NOT_AUTHORIZED` | capability ×1 — never retried |
| capability read returns an unreadable body | `RESPONSE_NOT_READABLE` | capability ×1 — never retried |
| browser is offline | `BROWSER_OFFLINE` | up to 2 ATTEMPTED, **0 reached a server** |

## 13.4  Live reliability

**No live soak has been run against the deployed bytes of this round, and none may be recorded as
passed.** The R10 live measurement (39/40 and 40/40 across two AFTER samples) was taken against
`a5bdfc2`'s predecessor state and does not speak for R10A. The recommended post-deployment gate is in
the release ledger; it is a proposal, not a result.

# 14 · P1-B8D-R10B/R10C — THE STATE BEFORE THE DATA

## 14.1  What R10B measured on the deployed bytes of `7bd5af2`

Real Chrome, real GitHub Pages, the real shared transport, 60 serial reads plus a user-performed
Apps Script execution-log correlation.

* **61 expected `/exec` visits, 61 observed `doGet` executions, difference 0.** All Completed; no
  failed and no timed-out execution. **A handler timeout is therefore disproved**, not merely
  unobserved.
* `server_ms` p50 5 102 ms across all three reads. The non-handler remainder is ~4 742 ms and is
  **constant** across actions that differ by a factor of four in handler cost. What that remainder is
  made of, this evidence cannot say, and it is not attributed further.
* `system.health` is the most expensive of the three (`server_ms` p50 6 271 ms) and returns no rows.
  Its cost is a 17-table schema census of the shipping slice. Design proposal:
  `docs/planning/PRODUCT_STRATEGY_CAPABILITY_READ_COST_DESIGN.md` — **design only, not implemented**.
* One echo → stable → echo redirect bounce was captured, 58.7 s end to end against a 60 s client
  budget. It remains the strongest candidate for the surfaced timeouts and is **not** proven to be
  their cause: the failures that were surfaced have no matching per-attempt server correlation.

## 14.2  The defect R10B proved, and R10C corrected

```
Uncaught TypeError: Cannot read properties of null (reading 'rows')
  at buildModel      psb-board-ui.js:207
  at categoryValues  psb-board-ui.js:232
  at firstCategory   psb-board-ui.js:241
  at selectView      psb-board-ui.js:2461
```

`CANON` is null until the first successful load. Production ships no preview fixture, so the board
does not auto-mount: the scripts load, **the view rail is live**, and CANON stays null until the page
controller mounts with data. When the data refuses, the refusal is drawn and the rail stays live. One
click on any view other than the one showing dereferenced null. Five throws were measured, one per
view; the sixth was clean only because `overview` was already the current route.

**The differential that settles it:** in a run where the board had loaded, the same six clicks threw
nothing.

## 14.3  The three states, and why the guard answers `null`

| state | meaning | answer |
|---|---|---|
| `NOT_LOADED` | `CANON === null` — nothing has been read; a refusal or a loading state is on screen | `null` |
| `LOADED_EMPTY` | a read succeeded and the site genuinely has nothing | `[]`, and `notices()` says `NO_CATEGORIES_ON_SITE` |
| `LOADED_WITH_DATA` | the ordinary case | the categories |

Returning `[]` for NOT_LOADED would have been the smaller edit and a false statement — it says the
site was read and found empty. The renderer's own comment already forbids the neighbouring
conflation; this is the same rule one step earlier.

**No empty fixture, no swallowed exception, no `CANON || {rows:[]}`.** A refusal stays on screen and
stays classified; no business read is dispatched from the NOT_LOADED path.
