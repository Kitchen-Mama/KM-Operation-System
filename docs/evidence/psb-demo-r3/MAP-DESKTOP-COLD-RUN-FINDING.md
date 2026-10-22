# Map canvas acceptance — the desktop cold run loses its globe (found by the PSB-DEMO-R3 sweep; NOT fixed)

**What happened.** The full sweep at `ef735466` reported `map-canvas-acceptance-s8-b3-r3-cp2m-r2` NOT CLEAN.
Its capture (`docs/evidence/cp2m-r2-map/map.json`, taken at `331acdb6`) pins `index.html` and `app.js`, and
the r64 token rotation moved both. So the capture had to be re-taken, as the other twelve were.

**The re-take does not pass.** It was tried three times with the same runner and parameters, serially, and
every attempt is kept here:

| attempt | sources | desktop a | desktop b | desktop c (drag) | mobile a/b/c |
|---|---|---|---|---|---|
| 1 (`map-retake-attempt-1`) | HEAD `ef735466` | canvas appeared, then 0 canvases after 41 report attempts | OK | OK | OK |
| 2 (`map-retake-attempt-2`) | HEAD `ef735466` | same | OK | OK | OK |
| 3 (`map-retake-attempt-3`) | `index.html` + `app.js` staged from `70778e82` (token r63), restored after and verified identical to `ef735466` | same | OK | OK | OK |

**What this does and does not show.**
- It is **not** the token rotation: attempt 3 runs the pre-rotation `index.html` and `app.js` and fails
  identically.
- It is **not** this round's PSB code. The four changed PSB files are route-owned, so the map route never
  loads them, and every CSS rule this round touched is scoped to `.psb-page`.
- It **is** reproducible: 3 of 3. And it is always the **first** Chrome of the run (desktop a), while the
  identical desktop b and every mobile run pass.
- The runner's own header already records that "the globe can vanish between the wait and the report ... on
  the desktop scene only - the renderer tears down and rebuilds". The 40-frame re-check that absorbed it at
  `331acdb6` (desktop a then: 1655 ms wait, settled on the first report) no longer sees the rebuild arrive.
- **Not determined:**
  - whether a commit between `331acdb6` and `70778e82` changed the globe's cold-start teardown
    (DC1-R1 `006bfd74` and FC1-R2 `5b69b189` touched shared transport/page code);
  - or whether this machine's first cold launch is simply slower now.

  The capture was not re-taken after `331acdb6` until this round, so nothing measured it in between.

**What was done.**
- The old `map.json` is left as it was. It is **not** re-pinned and **not** replaced by a failing capture,
  so the suite stays NOT CLEAN on its source pin, and the reason is here.
- No map, globe or transport code was changed: it is outside PSB-DEMO-R3.

This needs its own round.
