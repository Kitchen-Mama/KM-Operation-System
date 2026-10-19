# CP2X-R4 — leaving Site Inventory and coming back, on a real country axis

`node assets/tests/_cp2s-r2-inplace-dom-runner.js <outDir> --revisit`
Acceptance: `assets/tests/ir-revisit-restore-browser-s8-b3-r3-cp2x-r4.test.js`

Real Chrome, the real router, an isolated fixture. No production job is started and nothing is written.

## The two things that made every earlier leave/return capture unable to see this

**1. The lifecycle ids were wrong.** `KM.lifecycle.register` is keyed on the **section id** —
`ops-section`, `home-section`. There is no page called `inventory-replenishment` and none called `home`.
`switchTo` with an unregistered name still **unmounts** whatever was mounted and then **mounts nothing**.

The CP2X-R2 harness used those names, so its `leave-return` phase unmounted Site Inventory and never
brought it back — and every assertion after it read module-global diagnostics that outlive the page. The
phase reported healthy reuse numbers for a page that was not on screen. It was not wrong about what it
measured; it was measuring something else. This capture uses the registered ids and records the
lifecycle's own view at every step, so the same mistake cannot pass silently again.

**2. The fixture offered one country.** Which is why every earlier cross-site capture took the
*marketplace* axis and said so. A country-restore scenario could not be driven at all.

## The sites, and why they all differ

| site | marketplace_id | Avg | Days of Supply | Suggested Qty |
|---|---|---:|---:|---:|
| US / Amazon | `MP-FIXTURE-US-AMZ` | 7.0 | — | 81 |
| US / Walmart | `MP-FIXTURE-US-WMT` | 31.0 | — | 581 |
| **EU / Amazon** | `MP-FIXTURE-EU-AMZ` | **13.0** | **130** | **1381** |
| **EU / Walmart** | `MP-FIXTURE-EU-WMT` | **17.0** | **50** | **1781** |
| **JP / Amazon** | `MP-FIXTURE-JP-AMZ` | **23.0** | **300** | **2381** |
| JP / Rakuten | `MP-FIXTURE-JP-RAK` | 29.0 | — | 2981 |

Every column distinguishes the site. If the sites answered alike, *"the right site was restored"* and
*"a site was restored"* would be the same observation — and the restore can be wrong in precisely the way
that matters, by showing **yesterday's country**, while every count-based assertion still passes.

Days of Supply needed per-site **stock** for the same reason: the single-country fixture had stock only
for US/Amazon, so every other site computed DoS from zero — and `0` is what a broken restore shows too. A
value that cannot tell success from failure is not an acceptance criterion.

## What the capture drives

| phase | what it is |
|---|---|
| `eu-searched` | a successful EU Search — the result everything else must come back to |
| `A1-jp-country-only-then-leave` | JP chosen as **country only**, then leave and return |
| `A2-search-without-touching-country` | press Search on the restored selectors, untouched |
| `A3-marketplace-only-then-search` | change **only** the marketplace, then Search |
| `A4-full-jp-never-searched` | a **complete** JP selection that was never searched |
| `A5-jp-explicit-search` | JP chosen explicitly **and** searched |
| `B-illegal-pair-refused` | country EU + a JP marketplace_id, then Search |
| `C1-leave-return` | the ordinary leave and return |
| `C2-repeated-search` | three Search clicks |
| `C3-leave-while-in-flight` | leave while a read is held, return before and after it lands |
| `C4-rapid-switching` | four rapid round trips |
| `C5-late-answer-after-switch` | EU dispatched and held, operator returns to JP, EU answers late |

## What it establishes

- **The restore is complete, not partial.** A1 returns on EU *and its marketplace*, with Avg 13.0,
  DoS 130 and Suggested 1381 — the same numbers it left.
- **A draft is not an application.** A1 and A4 both move the selectors to JP, and `applied` never moves.
  A4's draft is *complete* (country **and** marketplace) and is still discarded.
- **No first option is ever auto-applied.** A1's mid-state records marketplace `""` with JP's options
  loaded, and the return does not invent one.
- **An inconsistent pair never reaches the server.** B: zero workspace, gap and recommendation requests,
  `applied` unmoved, the table still showing the site it was honestly given, and the illegal id dropped
  from the select rather than silently used.
- **A valid cache costs nothing and needs no second Search.** C1 and C4 issue zero new recommendation and
  gap requests *and* show the right numbers without a Search.
- **The Execution Plan survives a programmatic restore** (C1–C4), and a **real** country change still
  discards it (A1) — the guard is intact, not disabled.
- **Late answers do not paint.** C5's EU answer arrives with nobody waiting and the JP numbers stay.

## What it does NOT claim

**These are request counts and cell values, not production timings.** The fixture is a local stub; its
server answers instantly and nothing here measures how long anything takes in production.

**No production recalculation job is involved in any phase.** The country axis is the *fixture* registry
(US/EU/JP); production offers its own set, and the pair list must be read from the database rather than
from this table.
