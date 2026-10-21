# The R1 zoom-drag failure during the PSB-DEMO-R2 re-take — diagnosed, kept, not washed

## What failed
At candidate `f9b1c21a` the PSB-DEMO-R1 runner, re-taken once, gave 47 passed and 1 failed. The failing
check was "zoomed and scrolled, two gridlines of pointer travel is two gridlines of price", with
`moved: null`: the drag committed nothing. The full output is kept here:
`r1-retake-attempt1-FAILED.demo.json`, `.stdout.txt`, `.stderr.txt` (stderr empty).

## How it was diagnosed (scratch probes, kept as `.txt`; nothing they did was written to evidence)
1. **`build-r1-probe.js.txt`** builds an instrumented copy of the full R1 flow. Run once: 48/48, and
   the zoom drag committed. Not reproduced on one try.
2. **`zoom-probe12.js.txt`, on the R2 UI**, repeats only the zoom-then-drag step, 12 times. It counted
   `#view` rebuilds and recorded per move whether the drag was alive (`D`) or gone (`-`).
   - 1 of 12 failed. Verbatim line:
     `wait=0  view rebuilds during drag (per move, D=drag alive): 12- 12- 12- 12- 12- 12- 12- 12-  total 12  sims {}`
3. **The same probe with the rebuild count taken immediately before and after the press**
   (`probe-new-ui-prepost-12runs.txt`):
   - Every run that committed shows `postPress12D`: the delayed repaint landed BEFORE the press.
   - The failing run shows `prePress0 postPress0D 12- …`: the drag started, then the repaint landed and
     ended it.
4. **`zoom-probe12-old-ui.js.txt`**, the same 12 runs on the pre-round UI (`c0f0f6fa`): 12 of 12
   committed.

## Conclusion
A zoom click schedules a size-observer repaint that can arrive one frame after the next press.

- **Since R2**, a rebuild ends an unfinished drag and commits nothing. That is the lifecycle this round
  was asked for. So a drag pressed into that frame records nothing.
- **The pre-round UI** hid the race by accident: its release handler did not check which handle the drag
  belonged to, so the pointerup on the REBUILT handle committed it.

**What changed in response.** Both runners now wait until `#view` has not rebuilt for 500 ms (cap 5 s)
before any drag whose commit they assert. A chart that never settles is a failure, not a skip. No
assertion was relaxed and no retry was added. The interrupted-drag cases in the R2 runner do not wait,
because there the rebuild ending the drag is what they test.

**For a person** the window is about one frame between a zoom click and a press. The cost of losing
that race is one uncommitted drag, which can simply be repeated.
