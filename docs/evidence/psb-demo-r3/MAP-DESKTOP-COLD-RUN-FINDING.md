# Map canvas acceptance — the desktop cold run loses its globe (found by the PSB-DEMO-R3 sweep; NOT fixed)

> **CORRECTION (2026-10-22, R64 release-candidate close-out). The conclusion below is withdrawn. It was
> the wrong capture entry, not a product defect.** The original text and all three attempts are kept
> unchanged below.
>
> - **What the three attempts actually ran:** `node assets/tests/_cp2m-r2-map-runner.js <dir>`. That is
>   the OLD runner. It hard-codes `--use-gl=swiftshader --enable-unsafe-swiftshader`. The suite's own
>   header says not to use it: *"Re-capture with: node assets/tests/_cp2o-r2-map-capture.js
>   docs/evidence/cp2m-r2-map"*, after `_cp2o-r2-gl-probe.js`. The three `map.json` files carry no
>   `glEnvironment` field, which is the old runner's format.
> - **The probe** (`docs/evidence/r64-map-recapture/gl-probe/`):
>   - forced SwiftShader: **CONTEXT LOST at 2702 ms, 1 frame**. That is why the globe "appeared, then
>     0 canvases";
>   - no GL override, Chrome's real adapter (Intel Iris Xe, ANGLE / D3D11): **HELD 10068 ms, 537 frames,
>     contextLost false**;
>   - `--use-angle=d3d11`, `--use-angle=gl` and the forced-GPU configuration also HELD.
> - **The correct entry**, `_cp2o-r2-map-capture.js`, on the same sources, first and cold, with no warm-up
>   and no retry of a failed render:
>   - **desktop and mobile both captured**;
>   - context held;
>   - A vs B noise floor **0** changed pixels;
>   - real drag A vs C changed **45.2%** (desktop) and **72.9%** (mobile) of the canvas;
>   - the globe fills 99.8% of the canvas, centroid offset 0.063 / 0.046;
>   - the unchanged suite: **75 / 75**.
> - **One environment fact found on the way.** Given the RELATIVE output folder from this worktree's
>   non-ASCII path, Chrome's `--screenshot=` wrote no file. The render itself was fine: the canvas was
>   present and laid out on the first desktop run. Attempt 1 is kept as `attempt-1-relative-outdir`.
>   Attempt 2 passed an absolute ASCII folder. Its files were copied byte-for-byte into
>   `docs/evidence/cp2m-r2-map/`; `map.json` says where they were taken (`shotsDir`).
> - **So:** no product defect was shown, the map and the shared loader were not changed, and the earlier
>   sentence "it is neither the token nor PSB code" stands but proves nothing about the product.

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
