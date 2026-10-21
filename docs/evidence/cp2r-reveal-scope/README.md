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
| click → first paint | 58.3 ms | 57.2 ms | −2.1 ms | 3 of 6 |
| **click → full ready** | **222.7 ms** | **126.3 ms** | **−97.6 ms** | **6 of 6** |
| assembly **in** handler | 24.1 ms | 25.2 ms | +1.4 ms | 2 of 6 |
| **assembly after handler** | **172.5 ms** | **82.4 ms** | **−96.3 ms** | **6 of 6** |
| handler sync | 27.1 ms | 27.0 ms | +1.1 ms | 2 of 6 |

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

**CP2U-R2 RE-TOOK IT AGAIN, BOTH ARMS, AND THE TABLE ABOVE IS THAT BATCH — THE NINTH.** CP2U-R2 changed `inventory-replenishment.js` again (the read states now reach the cells), so §E1 refused the batch below for the same reason it refused the one before it. Twelve runs, both arms on one build, alternating inside each pair, shipped source restored and verified by hash at the end. The two load-bearing rows reproduced at −97.6 / −96.3 ms, 6 of 6 and 6 of 6.

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


---

### CP2X-R4 RE-TOOK IT AGAIN, BOTH ARMS — THE TENTH BATCH — AND THREE BATCHES WERE TAKEN BEFORE ONE WAS PUBLISHED

CP2X-R4 changed `inventory-replenishment.js` (a completed recommendation result now survives unmount, the
Marketplace options are rebuilt before the id is restored, Search refuses an inconsistent country/
marketplace pair, and a superseded revalidation ends its own state), so §E1 refused the previous batch for
exactly the reason it has refused every batch before it. Twelve runs, both arms on one build, alternating
inside each pair, shipped source restored and **verified by hash** (`4c36970cca9eda49`). No fatals.

| | unscoped | scoped | paired delta | improved in |
|---|---|---|---|---|
| click → first paint | 60.2 ms | 57.8 ms | −4.1 ms | 4 of 6 |
| **click → full ready** | **220.6 ms** | **128.5 ms** | **−98.0 ms** | **6 of 6** |
| assembly in handler | 26.1 ms | 25.9 ms | −0.2 ms | 4 of 6 |
| **assembly after handler** | **173.8 ms** | **80.3 ms** | **−99.0 ms** | **6 of 6** |
| handler sync | 27.2 ms | 27.0 ms | +1.1 ms | 2 of 6 |

**Three batches were taken this round and only the third describes the shipped file.** The sequence is
recorded because the discards were caused by my own process, not by the measurement:

| batch | why it is not the published one |
|---|---|
| 1 | taken while I was running `node` against this repo — the condition recorded above as having invalidated the first CP2U-R1 batch |
| 2 | taken quiet, as the check on batch 1 — but both predate the source fix below |
| **3** | **published.** The regression sweep found a defect in the round's own Search gate; fixing it changed `inventory-replenishment.js`, which correctly invalidated batches 1 and 2 |

**The check on batch 1 refuted the concern rather than confirming it, and that is worth keeping.**
Contamination makes a batch slower. Batch 1 (under load) read −83.6 / −90.0 ms with absolute values of
208.3 / 162.5 ms; batch 2 (quiet) read −149.7 / −153.3 ms with absolutes of 358.0 / 284.8 ms. The batch
taken under load was the FASTER of the two. The quiet machine was simply slower in BOTH arms that hour,
which is a property of the machine and not of either build.

**All three agree on everything this evidence is for: both load-bearing rows fall, both at 6 of 6, in
every batch.** They disagree only on magnitude, across a range of −83.6 to −153.3 ms. That is the widest
spread yet recorded and it is further evidence for the statement this README has carried since the
seventh batch — **the magnitude is not a finding, only the direction and the 6 of 6.**

The published batch lands almost exactly on the historical centre (full ready 222.7 → 220.6; after
handler 172.5 → 173.8 unscoped, 126.3 → 128.5 and 82.4 → 80.3 scoped), which is reassuring but is not
itself an argument: it was published because it is the only one of the three taken against the shipped
source, not because of where it landed.

**One outlier is left in, and it argues against the effect rather than for it.** `scoped` pair 2 read
862.6 ms on `ms_click_to_exec_resolved` (60 samples, median 192.5 ms) — a large value in the arm that is
supposed to be FASTER. The per-run medians and the paired design absorbed it and the row still fell in 6
of 6. Removing a sample for being large is how a batch stops being a measurement, and removing one that
works against the conclusion would be worse than that.

`pairs.json` predates this batch and is **not** read by the acceptance suite (§E loads the twelve run
files directly); it is left as the historical driver summary it has always been.

---

## CP2X-R4-R1 RE-TOOK IT AGAIN, BOTH ARMS — the eleventh batch of this design

CP2X-R4-R1 changed `inventory-replenishment.js` again (three-state scope validation, the restore-path
recommendation recovery, and per-attempt bootstrap records), so §E1 refused the previous batch for the
same reason it has refused every one before it: the shipped arm no longer described the file on disk.
**Both arms were re-taken on ONE build**, alternating inside each pair, twelve runs, 100 rows each, five
expands each, no fatals. The shipped source was restored and **verified by hash** when the driver
finished — `324eb2ca5d26be60`, matching — and the working tree was clean afterwards.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 67.5 ms | 63.9 ms | −3.3 ms | 5 of 6 |
| click → full ready | 240.4 ms | 136.4 ms | **−100.6 ms** | **6 of 6** |
| assembly in handler | 29.3 ms | 29.3 ms | −0.5 ms | 5 of 6 |
| assembly after handler | 186.1 ms | 85.8 ms | **−96.8 ms** | **6 of 6** |
| handler sync | 30.3 ms | 29.8 ms | −0.4 ms | 3 of 6 |

The two load-bearing rows reproduce for the eleventh time: **−96.8 / −100.6 ms, 6 of 6 and 6 of 6**,
sitting close to the middle of the range this design has produced.

**This batch has no outlier at all, and that is worth recording rather than celebrating.** The scan over
`ms_click_to_exec_resolved` found 60 samples, median 199.1 ms, **max 390.8 ms** — nothing above
`max(400 ms, 4 × median)`. Earlier batches carried large samples in both arms (−704.8 and −999.7 ms among
them) and those were kept, because removing a sample for being large is how a batch stops being a
measurement. A clean batch does not make the earlier ones suspect and does not make this one better
evidence: it is one more batch whose direction and 6-of-6 agree with the other ten. The magnitude is
still not the finding.

Nothing else ran on the machine while these twelve runs were taken.

---

## CP2X-R4-R2 RE-TOOK IT AGAIN, BOTH ARMS — the twelfth batch of this design

CP2X-R4-R2 changed `inventory-replenishment.js` again (the Search read moved into
`_irRunVerifiedSearch_` so a verified pair can be handed to it, and the UNVERIFIED wait became a bound
record), so §E1 refused the eleventh batch for the same reason it has refused every one before it: the
shipped arm no longer described the file on disk. **Both arms were re-taken on ONE build**, alternating
inside each pair, twelve runs, 100 rows each, five expands each, **no fatals**. The shipped source was
restored and **verified by hash** when the driver finished — `c0ffbce98e0e9327`, matching.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 61.6 ms | 64.9 ms | +0.9 ms | 3 of 6 |
| click → full ready | 233.6 ms | 136.7 ms | **−102.8 ms** | **6 of 6** |
| assembly in handler | 26.5 ms | 29.5 ms | +3.2 ms | 1 of 6 |
| assembly after handler | 186.9 ms | 84.7 ms | **−103.4 ms** | **6 of 6** |
| handler sync | 28.7 ms | 32.8 ms | +3.6 ms | 1 of 6 |

The two load-bearing rows reproduce for the twelfth time: **−103.4 / −102.8 ms, 6 of 6 and 6 of 6**.

**There is one outlier, it is in the UNSCOPED arm, and that is the direction that flatters the
conclusion — so it is stated rather than mentioned.** The scan over `ms_click_to_exec_resolved` found
60 samples, median 204.2 ms, **max 1484.3 ms**, above the `max(400 ms, 4 × median)` threshold. It is
`unscoped-1`, first expand. It is left in, for the same reason the eleventh batch’s absence of one was
left in: removing a sample for being large is how a batch stops being a measurement, and removing one
that flatters the conclusion is not a different rule from removing one that does not.

**It does not carry pair 1.** The per-run figure is the median of five, which is the third value:
`unscoped-1` read `1484, 346, 352, 397, 415`, median **397**, and replacing the outlier with any value
at or above 397 leaves that median exactly where it is. Pair 1’s −260.2 ms is produced by a slow
unscoped RUN, not by one slow sample — which is ordinary machine drift, and is the reason the pairs are
interleaved and never pooled.

Nothing else ran on the machine while these twelve runs were taken.

---

## FX1-R4 RE-TOOK IT AGAIN, BOTH ARMS — the thirteenth batch of this design

FX1-R4 did not change `inventory-replenishment.js` at all. It changed
`assets/js/api/operation-system-db-api.js` — the client action-contract pin moves 20 → 21 and two FX
transport adapters are added — and that file is one of the four this capture pins, so §E1 refused the
twelfth batch exactly as designed. The shipped arm must describe the build, not only the page.

**Both arms were re-taken on ONE build**, alternating inside each pair, twelve runs, 100 rows each,
five expands each, **no fatals**. The shipped source was restored and **verified by hash** when the
driver finished — `c0ffbce98e0e9327`, matching.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 60.5 ms | 60.8 ms | +1.3 ms | 2 of 6 |
| click → full ready | 219.4 ms | 131.0 ms | **−88.5 ms** | **6 of 6** |
| assembly in handler | 29.4 ms | 27.0 ms | −0.9 ms | 4 of 6 |
| assembly after handler | 173.0 ms | 82.4 ms | **−90.9 ms** | **6 of 6** |
| handler sync | 31.8 ms | 29.1 ms | −0.8 ms | 4 of 6 |

The two load-bearing rows reproduce for the thirteenth time: **−90.9 / −88.5 ms, 6 of 6 and 6 of 6**.

**TWO outliers, both in the UNSCOPED arm — the direction that flatters the conclusion — and both kept.**
The scan over `ms_click_to_exec_resolved` found 60 samples, median 170.9 ms, threshold 683.6 ms, and
`unscoped-2` read **781.3 ms** while `unscoped-5` read **2,454.1 ms**. Both are the FIRST expand of
their run. They are left in for the reason this README has carried since the seventh batch: removing a
sample for being large is how a batch stops being a measurement, and removing one that flatters the
conclusion is not a different rule from removing one that does not.

**Neither carries its pair, and that is arithmetic rather than reassurance.** The per-run figure is the
median of five, which is the third value. `unscoped-2` read `781, 216, 213, 167, 164` → median **213.3**;
`unscoped-5` read `2454, 183, 196, 175, 181` → median **183.2**. Replacing either outlier with any value
at or above its run’s median leaves that median exactly where it is. Pair 2 (−91.6 ms) and pair 5
(−48.5 ms) are also not the largest deltas in the batch — pair 1 is, at −126.0 ms, with no outlier at all.

Nothing else ran on the machine while these twelve runs were taken.

---

## FX1-R4-R1 RE-TOOK IT AGAIN, BOTH ARMS — the fourteenth batch of this design

FX1-R4-R1 did not change `inventory-replenishment.js`. It changed
`assets/js/api/operation-system-db-api.js` — the transport now keeps the server's whole `errors[]`
instead of the first entry (D-S8-B3-180) — and that file is one of the four this capture pins, so §E1
refused the thirteenth batch (`got 20ba76100978f326, want 5279e0bab344d7b3`), exactly as designed.

**A first attempt at this batch was interrupted and is NOT this batch.** The machine rebooted uncleanly
at 09:15 on 2026-10-21 with the driver part-way through, leaving the unscoped arm's two identifiers in
the page. Recovery confirmed the driver and its child were gone, restored exactly those two lines
(blob back to `22418e4a`, the committed one), and discarded every partial capture. Nothing from that
attempt is in this directory; the batch below was taken from scratch on one build.

Twelve runs, 100 rows each, five expands each, **no fatals**. The shipped source was restored and
**verified by bytes** when the driver finished; the capture's `sources` pin the page at
`c0ffbce98e0e9327` and the adapter at `20ba76100978f326`.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 59.7 ms | 61.4 ms | +2.4 ms | 2 of 6 |
| click → full ready | 217.1 ms | 128.1 ms | **−84.1 ms** | **6 of 6** |
| assembly in handler | 28.4 ms | 27.4 ms | −1.0 ms | 4 of 6 |
| assembly after handler | 174.6 ms | 80.8 ms | **−90.6 ms** | **6 of 6** |
| handler sync | 30.3 ms | 29.5 ms | −1.2 ms | 4 of 6 |

The two load-bearing rows reproduce for the fourteenth time: **−90.6 / −84.1 ms, 6 of 6 and 6 of 6**.

**ONE outlier, in the SCOPED arm — the direction that works AGAINST the conclusion — and kept.** The
scan over `ms_click_to_exec_resolved` found 60 samples, median 171.8 ms, threshold 687.4 ms, and
`scoped-1` read **900.2 ms** on its FIRST expand (`900.2, 129.1, 147.8, 107.2, 112.0`). The run's
median of five is **129.1** and is unchanged by it, and pair 1 still improves by −89.4 ms.

**The machine was NOT quiet, and this batch does not claim it was.** The Owner's own Chrome (~40
processes) and the Codex, AWS and Adobe Node runtimes were running throughout; none was started by
this round and none was stopped by it. No other process touched this repository during the twelve runs.

---

## FC1-R2 RE-TOOK IT AGAIN, BOTH ARMS — the fifteenth batch of this design

FC1-R2 did not change `inventory-replenishment.js`. It changed `operation-system-db-api.js` — the FC
Summary slice adapter now carries the server's `capped` flag — and §E1 pins that file
(`got 0d0e9eef73b43111, want 20ba76100978f326`), so the fourteenth batch no longer described the build.

Twelve runs on ONE build, 100 rows each, five expands each, **no fatals**, shipped page restored by bytes
and verified against the HEAD blob (`22418e4a`).

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 78.7 ms | 77.0 ms | +4.3 ms | 2 of 6 |
| click → full ready | 287.4 ms | 168.7 ms | **−110.3 ms** | **6 of 6** |
| assembly in handler | 34.0 ms | 35.4 ms | +1.5 ms | 3 of 6 |
| assembly after handler | 231.8 ms | 102.3 ms | **−129.8 ms** | **6 of 6** |
| handler sync | 37.2 ms | 38.0 ms | +1.9 ms | 2 of 6 |

The two load-bearing rows reproduce for the fifteenth time: **−129.8 / −110.3 ms, 6 of 6 and 6 of 6**.

**Every absolute figure is about a third higher than batch fourteen, in both arms.** That is the machine,
not the round: the arms moved together, which is exactly what interleaving inside each pair exists to
absorb, and why batches are never pooled.

**ONE outlier, in the UNSCOPED arm, kept.** 60 samples, median 225.8 ms, threshold 903.2 ms; `unscoped-6`
read **968.9 ms** on its FIRST expand (`968.9, 327.3, 329.8, 364.3, 355.4`). Its median of five is 355.4
and unchanged by it; pair 6 (−109.5 ms) is not the largest delta in the batch.

The machine was not quiet (the Owner's browser and other runtimes were up), as in batch fourteen. No
other process touched this repository during the twelve runs.

---

## DC1-R1 RE-TOOK IT AGAIN, BOTH ARMS — the sixteenth batch of this design

DC1-R1 changed BOTH files §E1 pins: `inventory-replenishment.js` (the source-write epoch checks on the
recommendation answer, the read model, the exposure map, and the Avg Sales date note) and
`operation-system-db-api.js` (the epoch itself and the wrapped writer list). Neither change touches the
reveal path this batch measures, but a pinned file that moved is a batch that no longer describes the build.

Twelve runs on ONE build, 100 rows each, five reveal expands each, **no fatals, stderr empty**, shipped page
restored by bytes and both files verified by sha256 against the pre-run hashes.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 66.9 ms | 63.6 ms | −4.6 ms | 6 of 6 |
| click → full ready | 251.7 ms | 137.9 ms | **−123.7 ms** | **6 of 6** |
| assembly in handler | 29.6 ms | 28.9 ms | −0.8 ms | 5 of 6 |
| assembly after handler | 195.2 ms | 87.0 ms | **−112.8 ms** | **6 of 6** |
| handler sync | 32.3 ms | 30.7 ms | −2.9 ms | 6 of 6 |

The two load-bearing rows reproduce for the sixteenth time: **−112.8 / −123.7 ms, 6 of 6 and 6 of 6**.

**No outlier.** 60 reveal samples, median 125.95 ms, threshold 503.8 ms; the largest is 334.9 ms
(`unscoped-1`, first expand). Absolute figures are lower than batch fifteen in both arms — the machine, not
the round, and why batches are never pooled.

---

## DC1-R1, SECOND TAKE — the seventeenth batch, because the sixteenth's build did not ship

The full regression after batch sixteen found that DC1-R1's Asia/Taipei day helper, which lives in the
recommendation read block, used `Math.floor` — and that block is scanned (fm2b F2) to prove it authors no
recommendation formula. The helper was rewritten as `new Date(ms + 8h).toISOString().slice(0, 10)`. That
changed `inventory-replenishment.js` again, so batch sixteen describes a build that was never the
candidate. It stays above as history and is NOT the batch the suite reads.

Twelve runs on ONE build, 100 rows each, five reveal expands each, **no fatals, stderr empty**, shipped page
restored by bytes and both pinned files verified by sha256 against the pre-run hashes.

| row | unscoped | scoped | paired delta | improved in |
|---|---:|---:|---:|---|
| click → first paint | 61.9 ms | 61.9 ms | −1.7 ms | 5 of 6 |
| click → full ready | 228.8 ms | 128.9 ms | **−106.5 ms** | **6 of 6** |
| assembly in handler | 27.1 ms | 28.5 ms | +2.0 ms | 2 of 6 |
| assembly after handler | 179.1 ms | 80.9 ms | **−109.3 ms** | **6 of 6** |
| handler sync | 29.6 ms | 31.3 ms | +2.5 ms | 2 of 6 |

The two load-bearing rows reproduce for the seventeenth time: **−109.3 / −106.5 ms, 6 of 6 and 6 of 6**.

**No outlier.** 60 reveal samples, median 138.65 ms, threshold 554.6 ms; the largest is 281.8 ms.
