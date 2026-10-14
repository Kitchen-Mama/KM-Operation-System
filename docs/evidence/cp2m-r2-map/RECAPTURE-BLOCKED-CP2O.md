# The desktop pixel capture cannot currently be re-taken — root cause located

**Status:** `map-canvas-acceptance-s8-b3-r3-cp2m-r2` fails **2 of 74** assertions. Both are the `A2` SHA pins
on `index.html` and `assets/js/app.js`, which CP2O correctly invalidated by rotating the application cache
token. The pin is doing its job. The designed remedy — re-take the capture — **cannot currently succeed on
this machine**, so the last-good committed capture is retained, the pin is **NOT** loosened, no hash was
edited to fake a re-capture, and no run was repeated until a green one appeared.

---

## CP2O-R1: the cause is located, and it is none of the three I could not previously rule out

CP2O left four explanations alive and said so. A fixed 2×2 matrix settles it — **Main (`65eb95b5`, the MAIN
checkout) vs candidate (this sandbox) × 1280×800 vs 1280×900**, one pass per cell, no repeats, every cell
recorded including the failures. Evidence: `docs/evidence/cp2o-map-matrix/matrix.json`.

| cell | WebGL | canvas boxed | globe creates / destroys | **context lost** | host detached | diag vs pixel-selector |
|---|---|---|---|---|---|---|
| main-800 | supported | 1 sample, at 1859 ms | 1 / **1** | **1** | **0** | agree |
| main-900 | supported | 1 sample, at 1705 ms | 1 / **1** | **1** | **0** | agree |
| candidate-800 | supported | 1 sample, at 1317 ms | 1 / **1** | **1** | **0** | agree |
| candidate-900 | supported | 1 sample, at 1314 ms | 1 / **1** | **1** | **0** | agree |

Renderer in every cell: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`.

### What that rules out, one explanation at a time

| candidate explanation | verdict | the measurement that decides it |
|---|---|---|
| **fixture / selector** — the canvas is there and the measuring script misses it | **RULED OUT** | the page's own `glmDiag` and the pixel runner's `querySelectorAll` selector **agree in every sample of every cell** (`samplesWhereTheTwoDisagree: 0`) |
| **scheduling** — the canvas arrives after the measurement, or is measured too early | **RULED OUT** | the canvas **was** present with a real layout box (`everBoxed: true`), then stopped being present. It was lost, not late |
| **host detach** — the host left the document, as CP2M-R4-R1 measured for refresh | **RULED OUT** | `samplesHostDetached: 0` in all four cells |
| **WebGL context** | **CONFIRMED** | `contextLost: 1`, `globeDestroys: 1`, and the page's own `globeError` reads *"WebGL is unavailable or was lost — the 3D Earth cannot render."* |

### And it is not a defect in either the application or the runner

- **Not this branch.** Main and candidate are identical on every measure. The three map sources
  (`global-logistics-map.js`, `km-globe.js`, `global-logistics-map.css`) are byte-identical between the two
  trees; only `index.html` and `app.js` differ, and only by the cache token.
- **Not the runner.** Its selector agrees with the page's own diagnostic, and `NO_CANVAS_BOX` is an accurate
  report of a canvas that genuinely is not there. No scoped runner fix is warranted, and none was made.
- **Not the page.** Losing the context is the environment's doing; the page responds by rendering its
  truthful "WebGL was lost" state with a Retry. That is correct behaviour.

### What it is

The software rasteriser on this machine cannot currently sustain a WebGL context for the duration of a
capture. It survives roughly 1.3–1.9 seconds after creation and is then lost. This degraded during the
session: the CP2M-R4-R2 round captured cleanly, a later re-capture lost the context in 1 of 3 runs, and by
CP2O-R1 it is lost in 4 of 4.

**Not investigated further, deliberately:** why the host machine's rasteriser degrades is outside this
repository, and the round's boundary forbids touching the engine, the textures, the timeouts or the read
strategy to work around it.

## Two earlier explanations of mine that were wrong, kept because they changed what was done

1. **"WebGL is unavailable for the larger scene."** Wrong. WebGL is *supported* in every cell, and the
   CP2M-R4-R1 lifecycle runner re-captured successfully at 1280×900 earlier in the same session. The context
   is created and then lost, which is a different failure from never having one.
2. **"36 `chrome.exe` processes are orphans from this round's test runs."** Wrong. All 35 were the user's own
   non-headless browser. Nothing was terminated, and nothing should be.

## To re-take the capture

On a machine that can hold a WebGL context:

```
node assets/tests/_cp2m-r2-map-runner.js "<repo>/docs/evidence/cp2m-r2-map"
node assets/tests/map-canvas-acceptance-s8-b3-r3-cp2m-r2.test.js
```

First confirm the environment can sustain a context at all:

```
node assets/tests/_cp2o-map-matrix-runner.js
```

If any cell reports `contextLost: 1` with `globeDestroys: 1`, the condition above is still present and the
capture must **not** be committed — it would replace two honest pin failures with twenty assertions
describing a broken environment.
