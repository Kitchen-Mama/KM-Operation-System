# P1 → S2 HANDOFF — THE FRONTEND API MIGRATION KICKOFF PACKAGE

**Written by P1-B8D-R9 (2026-09-13). Planning only. No S2 runtime exists and none may be written
under a P1 round.**

This document is the starting instruction for the S series. It does not migrate anything, define a
new action against a live server, or touch a page's runtime. Its job is to make the first S2 round
executable by somebody who was not in any of the P1 rounds.

> **The rule the S mainline now carries, adopted in P1-B8D-R8:**
> **Every new or modified production data feature defines its API contract first and wires the
> runtime second. No new browser path may read a database, a Sheet or a fixture directly.**

---

## 0 · WHERE P1 ACTUALLY ENDS

P1 is **not** closed by this document. It is closed when the USER completes live acceptance of
R9 on GitHub Pages. Until then, P1-B8D-R9 is a local commit on
`feature/product-strategy-board-p0` and nothing else.

> **SUPERSEDED BY THE OUTCOME — 2026-09-17, P1-B8D-R10E-CLOSE.** The condition above was met and then
> outrun: live acceptance did not stop at R9. R10 through R10E-F5 followed, the work was pushed, and
> the deployed bytes were sealed at `82772eb`. **P1_CLOSED = YES_WITH_DOCUMENTED_RESIDUAL_RISK** and
> **S2_RUNTIME_ALLOWED = YES_WITH_GATES**, under §9 below. The paragraph above is kept exactly as it
> was written, because it records the CONDITION, not the outcome; the measurements that answered it
> are in the `P1-B8D-R10E-CLOSE` entry of
> [`DEPLOYMENT_RELEASE_LOG.md`](DEPLOYMENT_RELEASE_LOG.md).
>
> **What closing P1 does NOT mean.** Transport reliability is still **FAIL** — a residual failure
> remains in the external Apps Script delivery path, and P1 closes with that risk documented rather
> than removed. Long soak is **deferred, not waived**. S2 is **allowed with gates**, and S2 runtime
> has still not started.

**Product Strategy, as shipped at the end of P1:**

| | |
|---|---|
| actions the browser reads | `system.health` · `productPricing.siteUniverse.get` · `productPricing.workspace.get` |
| transport | `KM.transport.post` only, through `KM.productPricingWorkspace` |
| write-shaped actions | **0** |
| production fixture reads | **0** |
| browser direct DB / Sheets | **0** |
| `localStorage` as a data source | **none** |

That is the shape every other page is being moved toward. It is the reference implementation, and
the reason S2 starts from a census rather than from a rewrite.

---

## 1 · THE INVENTORY S2 STARTS FROM

Unchanged from the P1-B8D-R8 census in
[`S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md`](S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md).
R9 added one loaded script (`km-repo-asset-manifest.js`, `NO_DATA_ACCESS`) and changed no
classification; the inventory records that line rather than silently moving a total.

| Class | Count | What it means for S2 |
|---|---|---|
| `STANDARD_API` | 5 | done — the target shape |
| `LEGACY_API_WRAPPER` | 19 | `KM.DB.*` — the same endpoint and action vocabulary through a second transport. **Not a bypass.** Mechanical to move where the action already exists. |
| `DIRECT_EXTERNAL_FETCH` | 1 | the partial loader, fetching this application's own markup. Not a data path. |
| `PRODUCTION_FIXTURE_OR_STATIC_DATA` | 5 | map topology and place names, correctly compiled in. No work. |
| `DOM_OR_LOCALSTORAGE_AS_DATA_SOURCE` | 8 | **the real risk.** Seven are caches, drafts or cross-page handoffs with a server behind them. One is not. |
| `NO_DATA_ACCESS` | 41 | renderers, utils, layout, i18n (40 + the R9 manifest) |

**`google.script.run` = 0 · `XMLHttpRequest` calls = 0 · direct Sheets reads = 0.**

**Do not re-derive these numbers by eye.** If a count changes, the change must be explained by the
diff of the round that changed it. `product-strategy-corrections-p1-b8d-r9.test.js` §F asserts this.

---

## 2 · S2-A — CAMPAIGN RISK PROMOTION RECORDS

**The sharpest finding in the whole census, and it is not about transport.**

Campaign Risk **does** have a server side for most of what it shows: `campaigns`,
`campaign_sku_lines`, `marketplace_skus`, `sku_details` and `marketplaces` all arrive through
`loadScopedTables` (`campaign-risk.js:654`). What has **no server side at all** is the
operator-entered **promotion records** — `km_campaign_promotion_records_v3` in browser storage,
every row stamped `source: 'overlay'`, empty by default.

**Why that matters.** A shared operational tool whose records are not shared is a gap, not a design.
Two operators looking at the same campaign see different promotion histories, and neither can tell.

**Whether it blocks first go-live is a RELEASE-SCOPE decision, not an engineering one** — it depends
on whether Campaign Risk is in the first published set. S2-A does not make that call; it makes the
call possible by defining what the server side would be.

### S2-A deliverable — a contract, not an implementation

Define and document, without writing runtime:

1. **Canonical schema** for a promotion record: identity, the campaign and SKU line it attaches to,
   the promotion price and currency, the effective window, the status, and the audit fields
   (`created_by`, `created_at`, `updated_by`, `updated_at`).
2. **Identity and scope.** A promotion record belongs to a company + country + marketplace + SKU +
   campaign. Decide whether the identity is server-minted or client-proposed, and say why.
3. **Read action** — the shape that returns records for a scoped read, and how it joins the existing
   `campaigns` read rather than duplicating it.
4. **Write action** — create, update, retire. Retire rather than delete unless there is a stated
   reason; an operational record that vanishes cannot be audited.
5. **The migration question, answered explicitly:** what happens to the rows currently in an
   operator's browser. They are not authoritative and were never shared, so the honest default is
   that they are **not** migrated and the operator is told so. Do not silently promote local
   overlay rows into the database.
6. **Refusal vocabulary** — what the action says when the scope is incomplete, the campaign is not
   live, or the caller may not write.

**Explicitly out of scope for S2-A:** implementing the handler, deploying anything, or touching
`campaign-risk.js`'s runtime.

> **S2-A DELIVERED — 2026-09-18, S2-R1-R1.** The contract is
> [`CAMPAIGN_PROMOTION_RECORD_CONTRACT.md`](CAMPAIGN_PROMOTION_RECORD_CONTRACT.md). One item above
> was answered differently from how it was asked: deliverable 1 assumed a canonical schema for a new
> entity, and the ruling is that **there is no new entity**. `CANONICAL_OWNERSHIP_MODEL = A` — a
> promotion record is one `campaigns` header plus one or more `campaign_sku_lines` rows, on tables
> that already carry `lps` and `special_condition` for this exact concept, through actions that are
> already routed. `NEW_TABLE_REQUIRED = NO`, `NEW_ACTION_REQUIRED = NO`.
>
> Deliverables 2–6 are answered in full, and the migration question (5) is answered as
> `PRESERVE_AND_EXPORT_FIRST` rather than "not migrated": the honest default turned out to be that
> browser rows are **preserved**, exported before anything is written, and retired only after a
> per-record server readback — never silently dropped.
>
> Two gates opened by the contract, both blocking any future write and neither part of S2-A:
> `PROMOTION_WRITE_AUTHORIZATION_GATE = OPEN` (both campaign writers open the spreadsheet with no
> caller check, and stamp `created_by` from the request payload), and
> `DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED = YES` (the supply-planning contamination authority
> treats a blank or draft campaign status as eligible, so a saved draft would move Avg Sales/day).
> First release scope is `B_READ_ONLY`.

---

## 3 · S2-B — SKU DETAILS / SKU REGIONAL DETAILS

**Mostly a consolidation, and the smaller half of S2.**

- Enumerate every `KM.DB.*` read and write these two pages make, by call site.
- Map each to the workspace action that already exists — `skuDetails.workspace.get` is the target
  for the primary read.
- **Only where no action exists does a contract have to be written first**, and it must be, before
  any wiring.
- **Image behaviour does not change.** Both pages resolve `sku_details.image_url` through
  `KM_IMAGE_REFERENCE_POLICY`, which as of P1-B8D-R9 also consults `KM_REPO_ASSET_MANIFEST`. S2-B
  must keep asking the same authority. If the resolver changes, **all four consumers** — SKU
  Details, SKU Handbook, Campaign Risk, Product Strategy — get their parity suites re-run.

**Not implemented in this round.**

---

## 4 · S2-C — SESSIONSTORAGE AND DOM AS A HANDOFF

- Find every place domain data crosses a page boundary through `sessionStorage` or the DOM. The
  known one is the Shipping Plan ↔ Inventory Replenishment handoff.
- Replace it with a **canonical API identity plus a reloadable read**: the receiving page should be
  able to render from a URL alone, with no state the sender left behind.
- **UI preference may stay in browser storage.** A remembered tab, a collapsed section, a chosen
  density — none of those is domain data. The line is whether a second operator on a second machine
  would need the same value to see the same page.

**Not implemented in this round.**

> **S2-C PARTIALLY DELIVERED — 2026-09-22, S2-R3.** The named exemplar was re-traced before anything was
> written, and it is **not where the live defect was**. The `allShippingPlans` cross-page handoff is already
> closed at both ends: Inventory Replenishment's Submit fails **closed** unless the canonical API is available
> (the sessionStorage branch is dev-host + explicit opt-in and unreachable in production), and Shipping Plan
> renders from the DB / `weeklyShipping.workspace.get` with a stale-response guard and an explicit read-error
> state, falling to the sessionStorage renderer only in Demo. No repair was needed there and none was made.
>
> What S2-R3 **did** repair is the same principle one layer in, where it was still live: the Shipping
> Allocation Working Draft. `IRDraftWorkspace.load()` classified a readback that **did not answer** as
> `SAVE_FAILED` with `source: 'LOCAL'` — the identical pair it produces for a database that answered
> `NO_ACTIVE_DRAFT` — so on any transport failure the sessionStorage recovery buffer silently became the
> authority on the station's plan, with Submit still open over it. That is precisely the line this section
> draws (“would a second operator on a second machine need the same value”), and it was being crossed
> invisibly. The repair adds the `DB_UNKNOWN` state, the `LOCAL_UNVERIFIED` source, a disclosure banner and a
> Submit refusal; the canonical owner is unchanged and no storage moved.
>
> **Still open under S2-C**, and deliberately not taken in this round: `utils/sku-overrides.js`
> (`km_sku_data_overrides_v1` and its two siblings), `utils/data.js` (`weeklyShippingPlans`),
> `pages/supplychain.js` (`supplychain-canvas`), and the `shippingHistory` pair. Each is a separate owner with
> a separate contract question, and none of them is the allocation draft.

---

## 5 · S3 – S5, UNCHANGED

| Round | Work |
|---|---|
| **S3** | the eight pages whose target workspace action already exists — mechanical, independently verifiable |
| **S4** | `factory-stock`, `carrier-rate-card`, `sku-handbook` — contracts have to be written first |
| **S5** | retire `getOperationDb` / `getTable` once no caller needs them. It can only be last. |

---

## 6 · THE READ-ONLY IMAGE REMEDIATION CARRIED INTO S2

P1-B8D-R9 made the UI safe and made the failure legible. It did **not** fix the database, because a
P1 round may not write to it. What S2 inherits is in
[`IMAGE_REFERENCE_REMEDIATION_REPORT.md`](IMAGE_REFERENCE_REMEDIATION_REPORT.md):

- the classification each `sku_details.image_url` value now receives, and where it is reported
  (`image_reference_kind`, `image_reference_reason` on every Product Strategy row);
- the two verdicts that need a directory listing — `REPO_ASSET_NOT_FOUND` and
  `REPO_ASSET_CASE_MISMATCH` — and what an operator should do about each;
- why a case mismatch is **reported and not followed**.

**The remediation itself is a data-governance task**: reading the live `image_url` column, listing
the rows whose files are absent, and deciding per row whether the asset should be added to the
repository or the row corrected. Neither half may be done from a P1 round.

---

## 7 · THE FIRST S2 ROUND — EXECUTION ORDER

Hand this to the agent that starts S2-A.

```
S2-A — CAMPAIGN RISK PROMOTION RECORD CONTRACT (CONTRACT ONLY)

BASE
  branch   a new branch off main, after P1 is archived
  base     the commit at which the USER completed P1-B8D-R9 live acceptance
  verify   worktree clean including untracked; main not modified in the round

SCOPE — WHAT THIS ROUND PRODUCES
  A written API contract for campaign promotion records, in docs/planning/, covering:
  canonical schema, identity, scope, status, audit fields, the read action, the write
  actions, the refusal vocabulary, and the explicit decision about existing browser-local
  overlay rows.

FILES
  docs/planning/  — new contract document, and updates to the API migration master plan
                    and the S-series inventory
  NO runtime file may be modified. NO .gs file may be modified.

CONTRACT-FIRST
  The contract is written and reviewed BEFORE any handler or any client call exists.
  No action may be named in a runtime file in this round.

TESTS
  A suite that asserts the contract document states each required element, and that no
  runtime file changed. Mutants: a missing audit field; an identity with no scope; a
  write action with no refusal vocabulary; a runtime file edited under cover of the round.

NO DEPLOYMENT
  APPS_SCRIPT_SYNC_REQUIRED = NO. FRONTEND_DEPLOY_REQUIRED = NO. No new deployment.

NO LIVE MUTATION
  DB / Sheets / Drive writes = 0. No read of production data is required by this round.

LOCAL COMMIT ONLY — DO NOT PUSH.
```

---

## 8 · WHAT S2 MAY NOT DO

Carried forward from every P1 round, because none of these has stopped being true:

- No automatic remote write. A local commit is the maximum default action.
- No Apps Script deployment from an agent.
- No change to an existing action's contract without a round that says so in its own title.
- No new browser path that reads a database, a Sheet or a fixture directly.
- No feature flag moved as a side effect.
- No global sidebar or navigation change inside a data-migration round.

---

## 9 · S2 ENTRY GATES — ADDED 2026-09-17 BY P1-B8D-R10E-CLOSE

S2 may begin **without another P1 transport-tuning round.** It begins under gates, not in the clear.

1. **Preserve the P1 read and lifecycle contracts.** Capability bootstrap and settlement, the
   `siteUniverse.get` → `workspace.get` order, the exact transient fallback allowlist, bounded
   single-flight retry, action-integrity fail-closed behaviour, and unmounted DOM and dispatch
   ownership are sealed on deployed bytes. An S2 round may build beside them; it may not quietly
   rewrite one.
2. **Focused regression at each S2 batch boundary.** Do not repeat the whole P1 evidence matrix unless
   a touched surface or a failed signal requires it.
3. **Transport reliability stays an OBSERVED EXTERNAL RISK.** Do not raise a timeout, add a retry, or
   introduce a proxy without a separate, measured design decision. The measured fault is delivery, not
   slowness; more attempts against a quota'd backend re-enter the same lossy hop.
4. `REQUEST_ORDER_SITE_CONFIRM_SERVER_GATE_GAP` = **OPEN.** The Site Confirm gate is enforced
   frontend-side only; no server-side write gate exists.
5. **That server-side write gate MUST be completed and verified** before any relevant Request Order
   write-flow production acceptance.
6. **Long soak is a separate observation gate** before final system-wide production acceptance. It is
   deferred, **not waived**, and it is not a prerequisite for beginning S2.
7. **Each S stage receives its own scoped acceptance.** The full two-trunk E2E and user acceptance
   remain final-system gates, not stage gates.

```
REQUEST_ORDER_SITE_CONFIRM_SERVER_GATE_GAP                        OPEN
MUST_BE_FIXED_BEFORE_RELEVANT_WRITE_FLOW_PRODUCTION_ACCEPTANCE    YES
LONG_SOAK_REQUIRED_BEFORE_FINAL_SYSTEM_ACCEPTANCE                 YES
```

---

## 10 · THE S2 EXECUTION RULE — SPEND EVIDENCE WHERE IT IS STILL VALID

P1 proved a page by measuring it repeatedly. S2 covers far more surface, so the rule is to reuse what
is still true rather than to re-measure what nothing touched.

- **Reuse P1 evidence where the deployed bytes and the affected contracts are unchanged.**
- **Run only the tests whose ownership surface intersects the current change.**
- **Escalate to the full regression matrix only when:**
  a) transport, boot, router, lifecycle, the shared API foundation or the shared DB adapter changes;
  b) a focused gate fails;
  c) the deployed bytes differ from the reviewed commit;
  d) an observed failure crosses a module boundary.
- **Never relax a sealed assertion merely to obtain green.** A contract conflict is escalated and
  ruled on; it is not resolved by editing the assertion that noticed it.
- **Separate product defects, external transport defects and instrument defects.** Three P1 rounds were
  lost to measurements of the harness being read as measurements of the product.
- **Do not rerun a natural failure merely to replace it with a passing sample.** A corrected instrument
  may be re-run; a failure may not be re-rolled.
