# CP2U-R3 — the read states, seen in a real browser

`state-transitions.json` is produced by:

```
node assets/tests/_cp2s-r2-inplace-dom-runner.js <outDir> --states
```

and read by `assets/tests/ir-read-state-transitions-browser-s8-b3-r3-cp2u-r3.test.js`.

The scenario is **opt-in**. Without `--states` the runner takes exactly the paths that produce
`docs/evidence/cp2s-r2-inplace/inplace-dom.json`, and it writes to a **different file**, so the two
experiments can never overwrite one another.

## What it shows

One expanded row, a half-typed `1234` in the Execution Plan composer, the caret in it, both scroll
containers genuinely moved — and then five arrivals through the real loader, each a real
`recommendation.workspace.get` served over the stub:

| arrival | what the server answers | what the cell must show |
|---|---|---|
| failed | `success: false`, `WORKSPACE_ERROR` | `read failed`, error class, **not** a zero; DOS `--` |
| empty | `success: true`, `lines: []` | `--`, "no destination line for any SKU in this site" |
| withheld | a line whose basis carries neither a rate nor a reason | `--`, "the basis was **withheld**" |
| zero | `avgSalesPerDay: 0` | **`0.0`** — the one case where a dash would be a lie |
| recovered | `avgSalesPerDay: 23` | `23.0`, and the tooltip **removed**, not blanked |

Every absence on this page renders as a dash, so the dash is not what is being tested: each state is
identified by the **sentence in the title attribute** and by the **class**. "Empty" and "withheld" are
asserted to carry *different* sentences, because telling those two apart is the whole point.

The in-flight cell is sampled in the same turn the request is dispatched, so `loadingMarkSeen` is evidence
that **loading and failed are two states on screen**, not one.

Finally the marketplace is switched **while a failed read is on screen**. The new site must show its own
number (`31.0`) and no row anywhere may still carry the previous site's failure.

Throughout: `renderReplenishment` is never called, the composer keeps `1234`, `document.activeElement`
stays on it, the field and the panel are the **same nodes** (marker properties a rebuilt node cannot
carry), and both scroll offsets are unchanged.

## Why this capture exists at all — the NO_INPUT finding

Every attempt to run this harness during CP2U-R2 died at the expand step with `NO_INPUT`: two expanded
panels, neither containing a field. The cause was found by instrumenting the harness rather than by
reading the page.

**`requestAnimationFrame` fired ZERO times for an entire session** under `--virtual-time-budget`. Both
reveal gates reached a terminal state and scheduled their paint through `_irRevealFrame_`, which is rAF —
and the gate sets its `revealed` flag when the paint is *scheduled*, which is why the observation log said
"revealed: true" about a panel that was never painted. Wrapping `onReveal` separated the two. With no
paint, the Execution Plan kept its skeleton, the skeleton has no `shipping-methods-` host, so
`initializeShippingAllocation` returned immediately, no composer was rendered, and there was no input to
type in. **The page was correct throughout; it was waiting for a frame the browser never produced.**

Removing `--virtual-time-budget` produces 103–175 frames per run. That flag was also what ended the
process, so the browser is now closed when the measurement arrives and the long-poll is released
explicitly — a run takes ~6 s instead of ~125 s.

No sleep was lengthened, no budget was raised, and nothing is retried to obtain a pass.

## Reproducibility

Eight consecutive runs on the final harness, each in its own fresh `--user-data-dir`: **4/4** of the
in-place scenario (`7.0 -> 11.0`, DOS `155.6 -> 99`) and **4/4** of the states scenario (new site `31.0`,
no row carrying the old failure). This capture is the fourth states run, not a selected success.

## What this capture does NOT establish

- **Caret preservation.** The only editable field in the open panel is `<input type="number">`, which
  exposes no `selectionStart` in Chrome. Recorded as `NOT_MEASURABLE_NO_TEXT_FIELD`, never as a pass.
- **Window scrolling.** The window itself does not scroll in this layout; the two container scrollers do,
  and those are the ones proven to have moved before the arrival.
- **Anything about production timing.** This is a fixture over a local stub. It says what the page does
  when an answer arrives, not how long a real answer takes.
