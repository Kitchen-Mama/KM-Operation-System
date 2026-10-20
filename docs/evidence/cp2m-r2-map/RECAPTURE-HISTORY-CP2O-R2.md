# The desktop pixel capture: blocked for three rounds, and why the blockage was mine

**Status at S8-B3-R3-CP2O-R2: RESOLVED.** `map-canvas-acceptance-s8-b3-r3-cp2m-r2` passes **75 of 75**.
The capture was re-taken on both viewports against the current candidate, and the two `A2` SHA pins that
the CP2O token rotation correctly invalidated now match the files they describe.

This file keeps the whole history, including the two rounds that reported the wrong cause, because the
mistake is more instructive than the fix.

---

## What was actually wrong

`assets/tests/_cp2m-r2-map-runner.js` launches Chrome with **`--use-gl=swiftshader`**. On this machine the
software rasteriser creates a WebGL context and then **loses it about 1.3 seconds later**. A capture needs
roughly four seconds. So the canvas was built, measured as present, and was gone before the screenshot —
`NO_CANVAS_BOX`, truthfully reported.

The machine has a working GPU. It always did. Nothing ever asked it.

```
node assets/tests/_cp2o-r2-gl-probe.js docs/evidence/cp2o-r2-gl
```

| launch configuration | verdict | renderer |
|---|---|---|
| `--use-gl=swiftshader` *(what the runner forces)* | **CONTEXT LOST at 1313 ms**, 1 frame | SwiftShader Device (Subzero) |
| no GL override | **HELD 9870 ms**, 538 frames | Intel Iris Xe, D3D11 |
| `--use-angle=d3d11` | **HELD 10756 ms**, 537 frames | Intel Iris Xe, D3D11 |
| `--use-angle=gl` | **HELD 10983 ms**, 304 frames | Intel Iris Xe, OpenGL 4.5 |
| `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` | **HELD 10143 ms**, 538 frames | Intel Iris Xe, D3D11 |

## The attribution CP2O-R1 got wrong, and how the method produced it

CP2O-R1 built a fixed 2×2 matrix — Main vs candidate × 1280×800 vs 1280×900 — and used it to rule out the
fixture, the selector, scheduling and host detach, then to confirm that the context is lost. **All of that
still stands**; `docs/evidence/cp2o-map-matrix/matrix.json` is unchanged and remains a true record.

What it then concluded does not. It said the host machine had degraded, and offered as support that the
same capture had succeeded earlier in the session, lost the context in 1 of 3 runs later, and in 4 of 4 by
that round. That is a real trend and it is still unexplained. But it was presented as *the* cause, and the
matrix could not have shown that: **every one of its four cells passed `--use-gl=swiftshader`.** The
experiment varied the branch and the viewport and held the rasteriser fixed, so it had no power to say
anything about the rasteriser. "This machine cannot hold a context" was really "this machine cannot hold a
*software* context", and the distinction is the difference between blocked and launched wrongly.

A matrix that holds the real cause constant produces a confident answer about everything else.

## What changed, and what deliberately did not

- **New:** `assets/tests/_cp2o-r2-map-capture.js` — the same capture flow, launched without the forced
  software rasteriser. It reuses the runner's `SCENES`, `wrapperFor`, `buildPage` (default measuring
  script), `fixtureShipments`, `startServer` and `runChromeAsync` **by reference**, so the two entry points
  cannot drift in anything they share. Only `main()`'s orchestration is restated, because it is not
  exported.
- **New:** `assets/tests/_cp2o-r2-gl-probe.js` — asks the host the question above before anyone captures.
- **`_cp2m-r2-map-runner.js` is byte-identical.** Its SHA is pinned inside `cp2m-r4r1-map/after.json` and
  `cp2m-r4r2-mount/after.json`, both hashed against disk by their suites. Editing one line in it would fail
  two currently clean suites until those captures were re-taken — and `map-canvas-lifecycle-…-r4-r1` also
  asserts that its "after" run spent the *same number of samples loading* as a "before" run that can never
  be re-taken, because the source it describes no longer exists. Removing one blocker is not worth staking
  two suites on a sample count matching across a different rasteriser.
- **No acceptance threshold was loosened, no SHA pin was edited, no hash was faked, no gate was cancelled,
  and no browser process was terminated.** The thresholds in the suite are exactly the ones that were
  failing an hour ago.

## The new capture

Renderer, recorded in the evidence for the first time (`map.json` → `glEnvironment`):
`ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)`, context **not**
lost.

| | desktop 1280×800 | mobile 390×844 |
|---|---|---|
| canvas box | 615 × 638 | 313 × 606 |
| canvas appeared after | 1642 ms | 664 ms |
| drawn content (D1 ≥ 0.4) | 0.831 | 0.927 |
| distinct colours (D2 ≥ 100) | 809 | 817 |
| fill ratio w/h (E1 ≥ 0.8) | 0.998 / 0.997 | 0.997 / 0.997 |
| centroid offset (E2 ≤ 0.35) | 0.063 | 0.046 |
| **noise floor (F2 ≤ 0.01)** | **0** | **0** |
| drag effect (G2 ≥ 0.05) | 0.452 | 0.729 |
| max channel delta (G2a ≥ 40) | 243 | 212 |

The noise floor is **exactly zero** on both scenes — the a/b screenshots are byte-identical (430,898 and
296,492 bytes). The determinism that makes the drag comparison meaningful is therefore stronger on the GPU
than it was on the software rasteriser, not weaker.

Two passes were made: one into a scratch directory to confirm the environment, one into this directory.
Both succeeded and agreed. Neither was repeated to obtain a better result.

## What this capture still does not claim

- It does not prove the **shipment overlay** draws. The harness answers the scoped workspace read with an
  empty envelope, so the page renders its formal empty state. Unchanged from CP2M-R2, and section H of the
  suite says so.
- It does not explain **why the software rasteriser degraded** across the session. That remains
  **UNVERIFIED** and is outside this repository. It is no longer load-bearing: the capture does not use it.
- It says nothing about **production** rendering on operator hardware. This is a headless capture on one
  machine with one GPU.

---

## FX1-R4-R1 (2026-10-20) — re-taken because the shell changed, with the tool this file already named

FX1-R4 routed the FX Rate Book Administration page, which changed `index.html` and `assets/js/app.js`.
Both are pinned by `A2`, so the capture was stale by construction and the suite was correctly red.

FX1-R4 then tried to re-take it with **`_cp2m-r2-map-runner.js`** — the tool the suite header retires in
the paragraph above this one — got `canvasCount: 0` twice, and recorded D-S8-B3-175 saying the globe
"renders no canvas on this machine". It renders. What the runner measures is its own
`--use-gl=swiftshader` flag losing the context about 1.3 s in, which is the sentence that tool was
retired over.

The evidence is unusually clean, because one desktop scene in one run contains both outcomes:

| probe | taken at | canvasCount | canvasPresent |
|---|---:|---:|---|
| `canvas` (A) | 1585 ms | 0 | false |
| `canvasB` (B) | **473 ms** | **2** | **true** — 615x638, aria "3D Earth globe…" |
| `dragReport` (C) | 1172 ms | 0 | false (`dragSkipped: NO_CANVAS`) |

### This capture

```
_cp2o-r2-gl-probe.js      angle-d3d11-gpu-forced   HELD_12833MS   contextLost false   509 frames
                          ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11, D3D11)
_cp2o-r2-map-capture.js   desktop  present true  count 2  615x638   error null
                          mobile   present true  count 2  313x606   error null
suite                     75 passed, 0 failed
```

One pass. Not repeated to obtain a better result, and nothing in the suite was changed: no pinned hash
was edited and no threshold was moved. The six PNGs and `map.json` in this directory are from this run,
and `A2` now compares the current `index.html` and `app.js` against themselves because they are the
ones that were photographed.

### What this capture still does not claim

Everything the CP2O-R2 section above disclaims still stands, unchanged — the shipment overlay is still
not proven to draw, and this is still one headless machine with one GPU rather than a statement about
operator hardware. One disclaimer is RESOLVED: "why the software rasteriser degraded" is no longer
UNVERIFIED-and-outside-this-repository. It degrades the way the header says it does, and the only thing
that was unverified was whether anybody read the header before running the other tool.
