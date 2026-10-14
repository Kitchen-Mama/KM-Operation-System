# CP2O-R2 — what the capture machine can actually do

`gl-probe.json` — `node assets/tests/_cp2o-r2-gl-probe.js docs/evidence/cp2o-r2-gl`.
One pass per launch configuration, 9 s hold, a real animation-frame loop. It answers the question four
rounds of map evidence never asked: **can this machine hold a WebGL context?** The forced
`--use-gl=swiftshader` of `_cp2m-r2-map-runner.js` loses it at 1313 ms; every real-GPU configuration holds
it for 9.8-11.0 s. Run this BEFORE any re-capture.

`capture-pass1.json` — the FIRST of two capture passes, written to a scratch directory to confirm the
environment before anything in `docs/evidence/cp2m-r2-map/` was touched. The committed capture is the
second pass. Both are kept because they are independent evidence of determinism, not a choice between
results: the two passes agree exactly on the canvas box, the distinct-colour count, the drag effect and a
noise floor of 0 on both scenes.

The failure history and the corrected attribution are in
`docs/evidence/cp2m-r2-map/RECAPTURE-HISTORY-CP2O-R2.md`. The CP2O-R1 matrix that ruled out the fixture,
the selector, scheduling and host detach is unchanged in `docs/evidence/cp2o-map-matrix/matrix.json` and
remains a true record of what SwiftShader does.
