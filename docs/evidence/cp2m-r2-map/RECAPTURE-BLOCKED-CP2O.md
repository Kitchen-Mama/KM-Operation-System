# The desktop pixel capture cannot currently be re-taken — and why that is a FINDING, not just a blocked chore

**Status at S8-B3-R3-CP2O:** `map-canvas-acceptance-s8-b3-r3-cp2m-r2` fails **2 of 74** assertions. Both are
the `A2` SHA pins on `index.html` and `assets/js/app.js`, which CP2O correctly invalidated by rotating the
application cache token to `r54-settlement-20261014`. The pin is doing its job: a capture must not drift into
describing a build it was not taken against.

The designed remedy is to re-take the capture. **It cannot currently succeed on this machine**, so the
last-good committed capture is retained, the pin is **NOT** loosened, and no run was repeated until a green
one appeared.

## What the failing capture actually says

Four attempts, all identical. Desktop fails, mobile passes, on byte-identical map sources.

| field | desktop (1280×800) | mobile (390×844) |
|---|---|---|
| `sectionPresent` / `sectionActive` | true / true | true / true |
| `webglSupported` | **true** | true |
| `canvasAppeared` | **true** | true |
| `canvasWaitMs` | **430** | 516 |
| `reportAttempts` | **41** | 1 |
| `canvasCount` at report time | **0** | 2 |
| `canvasCssBox` | **null** | 313 × 606 |

**The canvas appeared at 430 ms and was gone by the time the measurement ran**, and stayed gone across 41
attempts. `NO_CANVAS_BOX` is raised because `canvasCssBox` is null — not because WebGL was unavailable.

## Two explanations tested and rejected

**"This round caused it."** Tested, not assumed. A control run with `assets/js/app.js` and `index.html`
reverted to `HEAD` — the previous token, everything else identical — reproduces `NO_CANVAS_BOX` exactly. The
map sources (`global-logistics-map.js`, `km-globe.js`, `global-logistics-map.css`) are byte-identical to
`65eb95b5`, and the two page files CP2O does change (`inventory-replenishment.js`, `site-priority.js`) are
route assets that the map route never loads.

**"WebGL is unavailable for the larger scene."** This was my first explanation and it is **wrong**. The
CP2M-R4-R1 lifecycle runner, at **1280×900**, re-captured successfully in the same session: host attached,
`globeCreates 1`, `globeDestroys 0`, `contextLost 0`, **0 samples with the host detached**. The capture also
reports `webglSupported: true` on the very desktop run that fails.

A third guess was also wrong and is recorded because it changed what was done: 36 `chrome.exe` processes were
running and assumed to be orphans from this round's 303-suite run. All 35 were the **user's own
non-headless browser**, so nothing was terminated.

## What this leaves, stated honestly

A canvas that **appears and then disappears** at 1280×800 on the pixel-capture path, reproducing 4 of 4,
**not attributable to CP2O**, and not covered by the existing fixes:

- **CP2M-R4-R1** removed a `detachGlobe()` that ran before the `state.loading` early-return.
- **CP2M-R4-R2** stopped a superseded mount continuation from booting, rendering and building a globe.

Neither describes a canvas vanishing *after* a successful first paint on a page nobody navigated away from.
Whether this is a third path, a regression that predates CP2O, or a property of this machine under the
current load is **UNVERIFIED** — four runs is enough to call it reproducing here and not enough to attribute
it.

## To re-take the capture

```
node assets/tests/_cp2m-r2-map-runner.js "<repo>/docs/evidence/cp2m-r2-map"
node assets/tests/map-canvas-acceptance-s8-b3-r3-cp2m-r2.test.js
```

If the desktop scene reports `canvasAppeared: true` with `canvasCount: 0`, the condition above is still
present and the capture must **not** be committed — it would replace two honest pin failures with twenty
assertions describing a broken run.
