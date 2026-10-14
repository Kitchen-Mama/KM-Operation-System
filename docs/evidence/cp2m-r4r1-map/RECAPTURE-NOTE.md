# Why `after.json` was re-captured at CP2M-R4-R2, and what the three runs showed

`map-canvas-lifecycle-s8-b3-r3-cp2m-r4-r1.test.js` pins the SHA of every source its after-capture was taken
against, so that the capture can never drift into describing some other build. CP2M-R4-R2 changed
`assets/js/pages/global-logistics-map.js` (the mount continuation), which correctly invalidated that pin. The
capture was therefore re-taken against the current source, with the **same runner and the same 1500 ms read
delay** as before — nothing about the experiment was changed.

## All three runs are kept, because the first one failed in a way worth recording

| run | globe creates / destroys | WebGL context lost | samples with the host detached | file |
|---|---|---|---|---|
| 1 | 1 / **1** | **1** | 0 | `after-run1.json` |
| 2 | 1 / 0 | 0 | 0 | `after-run2.json` |
| 3 | 1 / 0 | 0 | 0 | `after-run3.json` — installed as `after.json` |

**Run 1 lost its WebGL context one sample after the globe was created**, at the very start of the first load,
and the page then showed its truthful "WebGL is unavailable or was lost" state for the rest of the run.

## This is an environment failure, and it is reported rather than discarded

- It happened at sample 15 of 124, during the FIRST load — before any code path this round changed.
- Runs 2 and 3 used the **same source** and did not reproduce it.
- Run 1 was launched immediately after three back-to-back headless Chrome instances from the mount runner;
  the software rasteriser (`--use-gl=swiftshader`) is the plausible casualty of that.

**Run 3 is installed as `after.json` because it is the LAST run, not because it is the best one.** Run 2 is
equivalent and would have served identically. Picking a passing run out of several and saying nothing is the
thing this round was told not to do, so the failing run is kept in the directory beside the others and the
rate — 1 of 3 — is stated here and in the round report.

**What it does NOT mean:** a 1-in-3 context loss in headless swiftshader is not a measurement of production,
where the GPU is real. It is not evidence of a defect in the page, and it is not evidence that there is none.
It is an open observation about the capture environment.
