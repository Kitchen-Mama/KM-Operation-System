# R55 post-release read-only acceptance — PSB / IR / FC (record)

**Written for: the Owner, who runs every step, and the reviewer who reads the result.**

**What this is.** It records the read-only acceptance of the published version. The agent cannot
reach the production site or the deployment, so every result below comes from Owner-supplied
evidence. A row stays **PENDING** until that evidence arrives.

**Boundary.** No new feature, no repricing, no Save / Submit / Apply, and no other production write.
On any mismatch the evidence is saved and reported. Nothing is fixed in production, pushed or deployed
in response.

## 0. Baseline

| item | value | source |
|---|---|---|
| Published frontend (`origin/main`) | `8da211de` | `git ls-remote`, 2026-10-22 (read-only) |
| Expected backend | R55. Values: R55 runbook §4 (`…-R55`, contract 21, action list 18, 50 actions, `mixed_deployment=false`, empty `stale_modules` / `absent_modules` / `missing_actions`) | `R55_PRODUCTION_RELEASE_RUNBOOK.md` §4 |
| Handler seen in production | `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55` (Editor commit log, 2026-10-22) | `docs/evidence/fx-init-r1/owner-commit-execution-log.txt` |
| FX | **closed separately:** `doc_version 1`, five rates, Web read-only | `docs/planning/fx-init-r1/FX_INIT_R1_DRAFT.md` §6 |
| Still to be received | one `system.health` JSON; the active deployment version and its time | Owner |

Evidence goes in `docs/evidence/r55-readonly-acceptance/`, kept verbatim. For each step, save:
- screenshots;
- the Network action list (a HAR is acceptable);
- the Console errors;
- the `system.health` JSON.

During the whole acceptance, the Network list may show **only reads**: `*.get`, `system.health` and
`system.clientCapabilities`. **Any write action is itself a FAIL**, whatever the page shows.

## 1. Common

| # | check | expected | result |
|---|---|---|---|
| C1 | hard reload (Ctrl+Shift+R); DevTools *Preserve log* on | no `DEPLOYMENT_CONTRACT_MISMATCH` on any page | PENDING |
| C2 | one `system.health` | every R55 value in §0 | PENDING |
| C3 | the Network list for the whole session | reads only | PENDING |

## 2. PSB — Product Strategy → Category Analysis

| # | check | expected | result |
|---|---|---|---|
| P1 | the header | `database read <time> (Taipei)`; never `prepared 2026-09-10` | PENDING |
| P2 | *Activity price*: the campaign menu | lists campaigns by name, period and record status. None shows LIVE. A missing price, an unknown or mismatched currency, a duplicate row or a price conflict is shown as a mark, never as an invented price. `no campaign line with a campaign id` is a data fact: record it; it is not a defect | PENDING |
| P3 | one campaign selected | the Deal diamond, its tooltip and the table's *Activity price* column agree | PENDING |
| P4 | single-point drag | only that point moves: the minimum, MSRP and the other products stay put. A hollow mark is left at the original price, and the axes do not change during the drag. Typing an exact price and ↑/↓ nudges also work | PENDING |
| P5 | Undo → Reset this product → Reset all | each step returns to the expected state | PENDING |
| P6 | competitors | a price-only competitor draws one point; one with bounds draws a band. Edit and delete work. Competitors never appear in the table or the KPIs. In a category with two currency panels, a competitor added in one panel does not appear in the other, and that panel's axes do not move | PENDING |
| P7 | lifecycle | Esc during a drag returns the point and commits nothing. Leaving and returning mid-drag leaves dragging working. Simulations and competitors are kept per context (campaign or Everyday). Changing site clears everything | PENDING |
| P8 | refresh | back to the production prices, with no simulation and no competitor | PENDING |

## 3. IR — Site Inventory

**Precondition:** the cache is valid and there is no source write during the check. **Do not press
Submit**: Submit invalidates the cache.

| # | check | expected | result |
|---|---|---|---|
| I1 | site A loaded | record Avg Sales, Suggested and the Avg header's anchor text. An anchor date that differs from the Gap date is D-S8-B3-186, not a failure | PENDING |
| I2 | site B → back to A → leave the page → return | Avg and Suggested equal I1. Neither is stuck at PENDING or blank | PENDING |
| I3 | Network on return | record whether `recommendation.workspace.get` is re-sent. No SUPERSEDED may appear without a write; record any UNKNOWN | PENDING |

## 4. FC

| # | check | expected | result |
|---|---|---|---|
| F1 | view | loads normally | PENDING |
| F2 | Preview, then Cancel | Preview only shows a result. Cancel restores the previous state. There is no write action | PENDING |
| F3 | history | not yet connected. Every cell shows an explanatory state, never a number | PENDING |
| F4 | missing base | refused **by name**, never shown as 0 | PENDING |

## 5. Known open items (do not decide this acceptance)

- D-S8-B3-186, 187, 188;
- 189 (K5, OPEN);
- 190 (boot Escape listeners);
- 191 (duplicate chart-control ids).

Any of them may be observed. Record it against its id; none of them is a new failure.

## 6. Outcome

**PENDING — no Owner evidence for §1–§4 has been received yet.** When it arrives, each row is filled with
one of:
- **PASS**, with the evidence file;
- **FAIL**, with the evidence file and the observed value;
- **NOT RUN**, with the reason.

The outcome is stated only from those rows.
