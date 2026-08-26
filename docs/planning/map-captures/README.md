# Map acceptance captures — TEXTURE-3 §H (was §I in R2) and §L5

Produced by `node tools/geo/capture-views.js --tag <label>`, which drives the **real** WebGL globe in headless
Chrome and writes one PNG plus a `captures.json` sidecar per run.

Performance is **not** measured here — see "Why performance lives in a different tool" below.

## Runs

| tag | what it is |
| --- | --- |
| `before/` | R2, the **December 2004** 5400×2700 surface, old border layers. Kept as the seasonal before/after. |
| `after/` | R2, the **July 2004** 5400×2700 surface. |
| `after-r3/` | R3: **8192×4096** July surface, canonical shared-edge topology, three-class border hierarchy, continent labels, zh-TW display aliases. **19 views.** |

## §H — the fourteen required views, and the per-view review

§H names fourteen views and eight checks each. R2 captured eight acceptance views plus a Canada set, which left
the globe limb, the dense-ADM1 US view and three whole continents unlooked-at. Those five were added.

Every row below was **looked at**, not inferred from the sidecar. `—` means the check does not apply to that view
(for example there is no ADM1 layer to rank at LOD 0/1, because §E fades it out entirely).

| # | view | sharp | Canada season | no dup border | no floating shell | surface align | nat/ADM1 rank | zh-TW readable | collision/clip |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `na-globe` | pass | **pass** | pass | pass | pass | — | pass | pass |
| 2 | `canada-regional` | pass | **pass** | pass | pass | pass | — | pass | pass |
| 3 | `us-ca-border` | pass | pass | pass | pass | pass | **pass** | pass | pass |
| 4 | `us-mx-border` | pass | — | pass | pass | pass | **pass** | pass | pass |
| 5 | `jp-kr-cn` | pass | — | pass | pass | pass | pass | pass | pass |
| 6 | `europe-dense` | pass | — | pass | pass | pass | **pass** | pass | pass |
| 7 | `antimeridian` | pass | — | pass | pass | pass | — | pass | pass |
| 8 | `route-na` | pass | pass | pass | pass | pass | — | pass | pass |
| 9 | `globe-limb` | pass | pass | pass | **pass** | **pass** | pass | pass | pass |
| 10 | `arctic-greenland` | pass | **pass** | pass | pass | pass | — | pass | pass |
| 11 | `us-adm1-dense` | pass | pass | pass | pass | pass | **pass** | pass (1 gap) | pass |
| 12 | `south-america` | pass | — | pass | pass | pass | — | pass | pass |
| 13 | `africa` | pass | — | pass | pass | pass | — | pass | pass |
| 14 | `oceania` | pass | — | pass | pass | pass | — | pass | pass |
| L5-2 | `canada-bc` | pass | **pass** | pass | pass | pass | pass | pass | pass |
| L5-3 | `canada-prairies` | pass | **pass** | pass | pass | pass | pass | pass | pass |
| L5-4 | `canada-greatlakes` | pass | **pass** | pass | pass | pass | pass | pass | pass |
| L5-5 | `canada-rockies` | pass | **pass** | pass | pass | pass | pass | pass | pass |
| L5-6 | `canada-boreal` | pass | **pass** | pass | pass | pass | pass | pass | pass |

**The one qualified cell.** `us-adm1-dense` labels 47 of 48 visible US states in Traditional Chinese and one —
**Indiana** — in Latin, because Natural Earth's `name_zht` is empty for it. It is one instance of a known,
measured gap: **356 of 3,835 divisions** have no verified zh-Hant name. §F's display-alias work in this round
covered **countries**; the division-level alias asset is **not built**, and the same gap is visible in
`europe-dense` as the Russian republics (`Komi`, `Karelia`, `Udmurt`, `Bashkortostan`, `Mordovia`, `Kalmyk`,
`Adygey`, `Ingush`, `Altay`). Recorded rather than described as a pass.

**What two of these views are specifically evidence FOR.**

- `globe-limb` is §C's acceptance view. The first attempt at it **showed no limb at all**, and the reason is
  geometric rather than a matter of framing: at camera distance *d* the globe's angular radius is asin(1/*d*),
  and the projection is a 45° vertical fov, so a half-fov of 22.5°. At *d* = 1.45 the globe subtends 43.6° and
  **overfills the frame** — the disc edge is off-screen in every direction. The limb only enters frame beyond
  *d* = 1 / sin 22.5° = **2.613**, so the view sits just outside that at 2.8. It shows borders adhering to the
  surface right to the disc edge, which is what the old 0.0035 radial offset (22 km of altitude at Earth scale)
  could not do — its displacement from the ground is *d*·tan(*t*) and diverges as *t* approaches 90°.
- `us-adm1-dense` is §E's, at LOD 3 where the ADM1 layer is at **full** strength rather than fading in. The
  international boundary is visibly heavier than the state boundaries; at LOD 0/1 the ADM1 layer is absent
  entirely, which is why the rank column reads `—` for those rows.

## What is committed here, and why not all of it

The 19 views come to **25 MB of PNG** for one run. `assets/img/earth/PROVENANCE.md` §6 declines a 29.9 MB
upstream image on the grounds that "~30 MB is an unacceptable page and repository weight", and it would be
inconsistent to commit 25 MB of screenshots. Screenshots of a photographic globe also compress poorly.

Committed from `after-r3/`:

| | |
| --- | --- |
| `captures.json` | **all 19 views** — every per-view fact the report states: imagery source and tier, mipmaps/anisotropy, GPU estimate, camera, the canonical-topology counts per class, endpoint connectivity, the anti-meridian census, label counts per class, and the measured zh-TW font probe |
| `globe-limb.png` | §C — borders adhere to the surface at the limb |
| `us-adm1-dense.png` | §E — the national/ADM1 weight hierarchy at full ADM1 strength |
| `europe-dense.png` | §E dense borders, §F the live display aliases (捷克, 克羅埃西亞, 巴勒斯坦), §G label ranking |
| `na-globe.png` | §G the continent layer, §A Canada |

The other 15 are **deterministically regenerable in one command**. They are evidence, not artefacts anything
depends on.

## Regenerating

```sh
node tools/geo/capture-views.js --tag after-r3          # all 19 views
node tools/geo/capture-views.js --only globe-limb       # one view
node tools/geo/measure-perf.js                          # §I performance (separate tool — see below)
```

Determinism is pinned in the harness rather than hoped for: `reducedMotion: true` makes the camera placement
instant instead of an eased tween, `--virtual-time-budget` drains timers and rAF before the capture,
`--use-angle=swiftshader` uses the same software rasteriser on every machine rather than the local GPU, and the
window size and device scale factor are fixed. Two runs of the same commit produce the same pixels.

## Why performance lives in a different tool

`--virtual-time-budget` is what makes these captures a usable gate, and it makes **wall-clock timing
impossible**: Chrome advances a virtual clock in discrete steps, so inside a synchronous measurement loop time
does not advance at all and `performance.now()` returns the same value every iteration.

That is not a hypothesis. The first attempt at §I measured frame time inside this harness and reported **0.00 ms
for the 141,608-vertex LOD-3 globe against 0.18 ms for the 22,452-vertex LOD-0 globe** — the heavier scene
apparently faster, and most views exactly zero. Two independent faults produced that: virtual time, and timing
GL **submission** rather than GL **completion** (WebGL calls only enqueue; the driver finishes later).

So §I is measured by `tools/geo/measure-perf.js`, which runs Chrome with **no** virtual-time budget and calls
`gl.finish()` per sample to drain the pipeline. It is not deterministic and it is not a gate — the two kinds of
artefact must not be conflated.

## Honest limits of this evidence

- The rasteriser is **SwiftShader**, not a real GPU — the unmasked renderer string is recorded in every sidecar
  (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`). Geometry, texture
  sampling, mipmapping and the shader maths are the shipped ones; what these cannot measure is real-hardware
  frame timing. Every performance number in the report is a software-rasteriser number and says so.
- The capture host is Windows 11, so `Microsoft JhengHei` is present and the Traditional Chinese labels render
  for real — `captures.json` records the **measured** font probe per view rather than assuming it.
- These are captures of the **globe engine mounted directly**, not of the full Shipment Runtime page. The
  camera, the asset ladder, the topology, the border classes and the label layers are the real ones; the
  surrounding page chrome, the shipment data and the control panel are not in frame.
