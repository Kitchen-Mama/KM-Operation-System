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
| click → first paint | 61.6 ms | 60.3 ms | −1.8 ms | 4 of 6 |
| **click → full ready** | **241.5 ms** | **128.8 ms** | **−107.5 ms** | **6 of 6** |
| assembly **in** handler | 27.2 ms | 28.1 ms | −0.5 ms | 3 of 6 |
| **assembly after handler** | **184.3 ms** | **81.1 ms** | **−101.2 ms** | **6 of 6** |
| handler sync | 31.0 ms | 30.5 ms | −1.5 ms | 4 of 6 |

These are the **CP2T** captures, re-taken because CP2T changed `inventory-replenishment.js` again (the
session-cache shape). This batch carries no cold-machine outliers, so the per-pair spread is tighter than
the CP2S-R2 one while the two load-bearing medians land in the same place. The batch was re-taken, again, for the same reason the CP2R-R1 batch
was: CP2S-R2 changed `inventory-replenishment.js` (the canonical-basis picker), so the shipped arm no
longer described the file on disk and §E1 said so.

**Both arms were re-taken, not just the shipped one.** Re-taking the scoped arm against the stored
unscoped arm would have compared today's build with a batch measured on an older one — pooling across
builds, which is the one thing this design exists to prevent.

**Five batches of this design have now been taken, and the two load-bearing rows reproduced in all five,
at −102.0 / −95.4, −90.9 / −92.2, −89.2 / −87.2, −107.4 / −107.6 and −107.5 / −101.2 ms — every one of
them 6 of 6.** The CP2S-R2 batch carried two large cold-machine outliers (−704.8 and −403.5 ms) which the
per-run medians and the paired design absorbed; this one has none, and lands in the same place anyway.
That is the argument for the design: the result does not depend on the machine being quiet.

## What this does NOT claim

**First paint is not improved, and it cannot be.** First paint is the frame in which the expand panel first
has a layout box; every scoped callback runs after that frame. The +2.1 ms here is drift: across the three
batches it has read +3.8, −3.6 and +2.1 ms, improving in 2, 4 and 3 of 6. It oscillates around zero, which
is what "unchanged" looks like, and is why no improvement is claimed for it. §E4 is therefore **one-sided**: it refuses a regression and deliberately does not require an
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
