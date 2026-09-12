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

- `P1B8C_ROW_SAMPLE_MAX_ = 60` rows per site, and the cap is reported as a cap.
- **Selection is deterministic and coverage-first, never the first sixty.** Rows are ordered by
  `marketplace_sku_id` ascending — the row's own identity, so sorting the sheet cannot move the
  sample. Pass 1 gives every distinct trait a representative row, **rarest trait first**, because with
  a cap the common traits would otherwise crowd out the one inactive row or the one row with no MSRP,
  and those are the entire reason a shape sample is being taken. Pass 2 fills the remaining slots at
  even *rank* across the whole universe. Pass 3 sweeps in order and is reachable only once coverage
  and spread are complete.
- **A state production does not hold is an evidence gap, named in the output**
  (`STATE_ABSENT_FROM_PRODUCTION`), never manufactured. The output says so in as many words and points
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

**Why prices are safe to emit here and were not before.** The rule this relaxes is P1-B3's, and its
reason was that a census is pasted into a report. This output is pasted into ONE repository file that
is already read-only test evidence, its consumer is a renderer that exists to display these very
numbers on screen to the same operators, and every identifier that could reach outside the company —
url, id, endpoint, email — is still dropped. **What is being relaxed is "no prices in a census", not
"no identifiers anywhere".** If the USER prefers not to relax even that, the alternative is to run
the acceptance on the deterministic capture permanently and accept the evidence gap; the manifest
below does not depend on which is chosen.

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
