# CP2X-R4-R1 — scope validation, in-flight recovery, generation isolation

**What is here.** One file: `counter-example-before.json`. The *current* capture lives at
`docs/evidence/cp2x-r4-revisit/revisit.json` — the R1 scenarios are appended phases of that same
`--revisit` run, and keeping a second copy of it here would mean two files that must be re-taken
together and eventually will not be.

**What `counter-example-before.json` is.** The **same harness, at the same SHA**, run against the
**CP2X-R4 candidate** — `assets/js/pages/inventory-replenishment.js` as it stood at `5454da83`. It is
kept because a test that has only ever seen the fixed code cannot say whether it would have caught
anything. Sections C, D, E, F and G of
`assets/tests/ir-scope-validation-and-restore-recovery-browser-s8-b3-r3-cp2x-r4-r1.test.js` assert
against **both** files: what the page does now, and what it did then, with the number it actually showed.

The suite checks that the two captures pin a **different** page source and the **same** runner
(`A6`, `A7`). If someone re-takes the before-capture against the fixed page it stops being a
counter-example, and that assertion is what says so.

## How each scenario was staged, and why it had to be staged that way

**A `<select>` cannot hold a value it was never offered.** Assigning an unknown `marketplace_id` leaves
the element at `''`, so the stale-id case cannot be produced by assignment — the first version of these
scenarios tried exactly that and measured nothing. It is staged the way it actually occurs: the operator
picks a site **while it is live**, the registry retires or drops it, and the page re-reads the authority
**without rebuilding the select**. The fixture gained a seventh, complete site — JP/Yahoo, avg `37.0` —
and a `status` field it had never carried, plus a `/__site-status?id=&status=` control that changes the
registry between reads.

**The authority is torn down, not faked.** For the UNVERIFIED scenarios the harness nulls `_irReadModel`,
resets `_irRegistry` to `IDLE` and empties the legacy getter, leaving the selects exactly as they are.
That is the real shape of every cold open: a remembered pair in the DOM and nothing loaded yet to check
it against.

**The read is genuinely in flight.** `/__delay?ms=4000` holds the recommendation answer; the page is
unmounted inside that window through `KM.lifecycle.switchTo`. Both sides are recorded: the page's own
`_irRecoState.status === 'LOADING'` with the cell showing `…`, and the **server's** `respondedAt - t`
for that request, so "it had not been answered" is not a claim the page makes about itself. The hold is
cleared **after leaving and before returning**, because a recovery read that inherited the hold would
measure the fixture rather than the page.

**Generation isolation needed a second mount that revalidates nothing.** The transport **coalesces
identical in-flight reads**, so two mounts waiting on one answer agree about it and contamination is
invisible — the first version of this scenario proved only that. The one that works forgets the
remembered scope between the mounts, so the second takes `REGISTRY_ONLY`, which performs no revalidation
and whose record has nothing to say about one. The dead attempt's answer then lands on it.

**Repaints are counted, not inferred.** `renderReplenishment` is a global binding, so the harness wraps
it and counts calls. Without that, "nothing was repainted while the page was away" is not observable at
all: the restore on return repaints regardless, and the rows look identical either way.

## What the before-capture shows, phase by phase

| phase | CP2X-R4 candidate | after |
|---|---|---|
| `R1A1-retired-id-refused` | no refusal; `applied → jp\|MP-FIXTURE-JP-YAH` | `MARKETPLACE_INACTIVE`; applied unmoved; cells still `23.0 / 300` |
| `R1A2-removed-id-refused` | no refusal; `applied → jp\|MP-FIXTURE-JP-RAK`; table `EMPTY`, 0 rows | `MARKETPLACE_NOT_IN_REGISTRY`; applied unmoved |
| `R1A3-unverified-illegal-pair` | no refusal; `applied → us\|MP-FIXTURE-JP-RAK` | `MARKETPLACE_COUNTRY_MISMATCH`; applied unmoved; **zero** inventory reads |
| `R1A4-unverified-legal-pair` | applied `eu\|MP-FIXTURE-EU-WMT`, `17.0 / 50` | **unchanged** — the fix was not bought by refusing more |
| `R1B1-cold-inflight-leave-return` | `DISABLED`, `avg '--'`, `dos '--'`, 1 reco request | `READY`, `31.0 / 100`, `REREAD_ISSUED`, 2 reco requests, **no Search pressed** |
| `R1B2-warm-cache-zero-reads` | `31.0` | `31.0`, `ALREADY_SETTLED`, **0** reco requests |
| `R1B4-late-failure-after-recovery` | `avg '--'` — nothing for the late failure to arrive after | recovery `17.0`, and the late failure does not replace it |
| `R1C1-remount-generation-isolation` | `REGISTRY_ONLY` + `revalidated: true`; 1 repaint by the dead attempt | `revalidated: false`; `stray_callbacks: 1`; **0** repaints |
| `R1C2-late-answer-while-unmounted` | 1 repaint of an unmounted page; dead round recorded as revalidated | **0** repaints; `MOUNT_SUPERSEDED`; record generation behind the current one |

`R1A1`/`R1A2` are carried by **what was published**, not by what was spent: a Search over an
already-loaded, scope-independent read model costs **no request at all**, so "nothing was spent" is true
of the defect as well as of the fix. The harm was that `applied` moved to a site the authority had just
refused.

## What these captures do not claim

- The fixture is a **local stub**. These are request counts and cell values, **not** production timings.
- No production recalculation job was started; no job is involved in any phase.
- The country axis is the fixture registry (US / EU / JP plus a retirable JP/Yahoo). Production offers
  its own set.
- `_irAdaptScopeRegistry_` hard-codes `status: 'active'`, so while the **registry** is the only authority
  in hand a retired record cannot be seen as retired. Unchanged by this round, and stated in the suite.
