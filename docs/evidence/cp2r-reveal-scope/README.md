# CP2R — the reveal-callback render scope, measured in six interleaved pairs

`node assets/tests/_cp2r-warm-expand-runner.js <outDir> --skus 100`, driven alternately over two builds.
Acceptance: `assets/tests/ir-reveal-callback-scope-s8-b3-r3-cp2r.test.js` §E.

## What the two arms are

The arms differ by **exactly two identifiers** — whether each panel gate's `onReveal` is the raw paint or
the paint wrapped in `_irWithRenderPass_`. Nothing else in the file moves between them.

| arm | files |
|---|---|
| `unscoped-1..6.json` | `onReveal: _irRecoRevealPaint_` / `_irExecRevealPaint_` |
| `scoped-1..6.json` | `onReveal: _irRecoRevealOnce_` / `_irExecRevealOnce_` **(shipped)** |

`pairs.json` is the driver's own summary of the same twelve runs.

## Why pairs, and why they are never pooled

Unscoped and scoped alternate **inside each pair**, so the machine's drift lands on both arms of every pair
instead of on one batch. This is not a style preference: in CP2P, four pooled runs per side said a variant
was 22% faster and ten interleaved pairs showed it slower in 10 of 10. Batches are compared **within
themselves only**, never across.

## What was measured BEFORE anything was scoped

CP2P-R2 already scoped the synchronous handler. A 100-SKU expand still ran **seven** full-station
assemblies after the handler returned, ~170 ms. Seven calls is not by itself a reason to add a scope — a
render scope may only share inside **one synchronous turn**, so seven turns of one call each would be
uncapturable under the approval, and the honest answer would have been "nothing to do here".

So the runner stamps every call with its turn: a marker microtask is queued at the **first** call of a turn,
and anything still in that task reads the same number. The answer decided the round:

```
7 calls   ·   3 turns   ·   one turn assembling 5 times
```

Four of the seven are capturable **without any share outliving the callback that made it**.

## The result (six pairs, median of per-run medians)

| | unscoped | scoped | paired delta | improved in |
|---|---|---|---|---|
| click → first paint | 42.9 ms | 42.6 ms | −0.8 ms | 3 of 6 |
| **click → full ready** | **148.0 ms** | **85.0 ms** | **−63.8 ms** | **6 of 6** |
| assembly **in** handler | 20.3 ms | 20.2 ms | +0.4 ms | 3 of 6 |
| **assembly after handler** | **111.7 ms** | **48.5 ms** | **−62.8 ms** | **6 of 6** |
| handler sync | 22.2 ms | 21.9 ms | +0.4 ms | 3 of 6 |

These are the **CP2T-R2** captures. The batch is re-taken whenever `inventory-replenishment.js` changes,
because the shipped arm then no longer describes the file on disk and §E1 says so — CP2S-R2 changed the
canonical-basis picker, CP2T changed the session-cache shape, CP2T-R1 added the handler-version
compatibility check, and CP2T-R2 moved the accepted version and added the weekly-refusal wording.
**Twelve runs, no fatals, no cold-machine outliers.**

**Both arms were re-taken, not just the shipped one.** Re-taking the scoped arm against the stored
unscoped arm would have compared today's build with a batch measured on an older one — pooling across
builds, which is the one thing this design exists to prevent.

**Seven batches of this design have now been taken, and the two load-bearing rows reproduced in all seven,
at −102.0 / −95.4, −90.9 / −92.2, −89.2 / −87.2, −107.4 / −107.6, −107.5 / −101.2, −100.2 / −104.4
and −124.2 / −118.5 ms — every one of them 6 of 6.** This batch is the largest of the seven; the spread
across batches is wide enough that the MAGNITUDE is not a finding either, only the direction and the 6 of 6. The CP2S-R2 batch carried two large cold-machine outliers (−704.8 and
−403.5 ms) which the per-run medians and the paired design absorbed; the last two have none, and land in
the same place anyway. That is the argument for the design: the result does not depend on the machine
being quiet.

Note that the two rows **swap which is larger** between batches — full ready led in CP2T (−107.5 against
−101.2), after-handler leads here (−104.4 against −100.2). They measure overlapping work and their
difference is within the batch-to-batch spread, so neither ordering is a finding.


### The CP2U-R1 batch was taken TWICE, and the first one is discarded for a stated reason

The first twelve runs were taken **while I was running other node processes against this same repo** — test
suites and a byte census — during pairs 2 and 3. That batch came back with `assembly after handler` at
**6 of 6, median −60.4 ms**, arms tightly clustered at 111–116 vs 49–65 ms, and `click → full ready` at
**5 of 6**, failing §E3.

**The failing row carried three outliers and they were not arm-correlated:** 2 746 ms in one SCOPED run
against 87–90 ms in five others, and 1 385 ms and 490 ms in two UNSCOPED runs. An effect of the round under
test cannot land in both arms, and `ms_click_to_exec_resolved` is the one metric here that waits on an async
read settling — which is exactly what a machine running three other node processes delays.

**So the batch was re-taken on a quiet machine, and that is the batch above.** This is recorded rather than
quietly replaced, because "re-run until the expected answer appears" is indistinguishable from this in a diff
and is the opposite of it in method. What makes the re-run legitimate is that a **specific defect in how the
measurement was produced was identified first**, and that the row the scope actually affects reproduced
cleanly in BOTH batches — −60.4 then −62.8 ms, 6 of 6 both times. Had the second batch disagreed with the
first on that row, the finding would have been the disagreement.

The published batch still contains one large outlier, −999.7 ms in pair 2, in the IMPROVING direction. It is
left in: the per-run medians and the paired design absorb it exactly as the README records for earlier
batches, and removing a sample for being large is how a batch stops being a measurement.

**CP2U-R1 RE-TOOK THIS BATCH, BOTH ARMS, AND IT IS THE EIGHTH OF THIS DESIGN.** CP2U-R1 changed `inventory-replenishment.js` — the Avg Sales and Suggested Qty read states — so the shipped arm no longer described the file on disk and §E1 said so. **Both arms were re-taken on ONE build**, alternating inside each pair, for the reason recorded above: re-taking only the shipped arm would have compared this build against a batch measured on an older one. Twelve runs, 100 rows each, five expands each, no fatals, and the shipped source was restored and verified by hash when the driver finished. The two load-bearing rows reproduced again at **+0.0 / −60.4 ms**, **0 of 6** and **6 of 6**.

## What this does NOT claim

**First paint is still not claimed, and the reason has changed — so the honest version is written here
rather than the previous sentence repeated.** Across the batches it has read +3.8, −3.6, +2.1, −1.8,
−4.2 and −6.4 ms, improving in 2, 4, 3, 4, 4 and 5 of 6. **The last four are all negative and the
magnitude is growing, which is no longer what pure oscillation looks like**, and continuing to call it
drift would be reading the series to suit the earlier conclusion.

What has NOT changed is that no improvement is claimed, and there are two live explanations:

- **A mechanism is conceivable.** First paint is the frame in which the panel first has a layout box. The
  unscoped arm starts its extra assemblies earlier, and work that lands before that frame commits can push
  the paint later — so removing it could move first paint as a side effect, even though the scope itself
  releases after the paint.
- **A confound is equally available.** These batches also differ in machine, build and the rest of the
  file, and this design controls for drift WITHIN a pair, not for whatever changed between batches.

Nothing here distinguishes them, so nothing is concluded. §E4 stays **one-sided** — it refuses a
regression and deliberately does not require an improvement — which is exactly the assertion to keep while
the cause is undecided. §E4 is therefore **one-sided**: it refuses a regression and deliberately does not require an
improvement.

**The synchronous handler is unchanged.** CP2P-R2 owns that scope; this round did not widen it. The +0.2 ms
and −0.6 ms rows are the same drift seen from the other side.

**Nothing crosses a callback, a frame or an event.** The scope releases in a `finally` the moment the
callback returns; outside a scope nothing is stored and nothing is consulted. The next frame, the other
panel and every later continuation each assemble for themselves — which is why the "after handler" row falls
by about half rather than to zero, and why it should.

**This is a 100-SKU fixture on one machine.** It is not a production measurement.

## An earlier batch was discarded

A first set of twelve runs of this same design was thrown away before it became evidence: the runner is
derived from `_cp2p-ir-expand-runner.js` and still pinned **that** file as its instrument, so the captures
named a runner that had not produced them. The hash was correct and the attribution was false. The runner
now pins itself and the batch was re-taken.
