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
| `after-r4/` | R4: the approved TW/CN display decision, division-level zh-TW names, the bounded label pass, and a deterministic flicker probe per view. **21 views.** |
| `after-r5/` | R5: the **main-integration** run. Canada re-verified after merging `main` into the branch, plus the four §E views no earlier round contained. **13 views.** |

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

## §F (R4) — the twenty-one views, the nine checks, and what looking at them found

R4 adds two views to R3's nineteen: `tw-cn` and `tw-cn-wide`. §A is a decision about what two specific labels
say, and a decision about text is not verified by an assertion on a string — the question is whether 台灣 and
中國 read correctly at the zoom where both are on screen together.

Every row was **looked at**. `—` means the check does not apply to that view (there is no ADM1 layer to rank
below LOD 2, because §E fades it out entirely).

Check 9 is not a judgement: `flicker` in `captures.json` records a **deterministic camera sequence** per view —
six redraws of a stationary camera, then a 0.48-wide zoom out and back — and reports whether the drawn label set
changed while the camera was still, and how many LOD transitions the sweep produced.

| # | view | sharp | season | coast align | no 2nd shell | no dup border | nat/ADM1 rank | zh-TW labels | collision/LOD | no flicker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `na-globe` | pass | **pass** | pass | pass | pass | — | pass | pass | **pass** |
| 2 | `canada-regional` | pass | **pass** | pass | pass | pass | — | pass | pass | **pass** |
| 3 | `us-ca-border` | pass | pass | pass | pass | pass | **pass** | pass | pass | **pass** |
| 4 | `us-mx-border` | pass | — | pass | pass | pass | **pass** | pass | pass | **pass** |
| 5 | `jp-kr-cn` | pass | — | pass | pass | pass | pass | pass | pass | **pass** |
| 6 | `europe-dense` | pass | — | pass | pass | pass | **pass** | pass (gap) | pass | **pass** |
| 7 | `antimeridian` | pass | — | pass | pass | pass | — | pass | pass | **pass** |
| 8 | `route-na` | pass | pass | pass | pass | pass | — | pass | pass | **pass** |
| 9 | `globe-limb` | pass | pass | **pass** | **pass** | pass | — | pass | pass | **pass** |
| 10 | `arctic-greenland` | pass | **pass** | pass | pass | pass | — | pass | pass | **pass** |
| 11 | `us-adm1-dense` | pass | pass | pass | pass | pass | **pass** | **pass** | pass | **pass** |
| 12 | `south-america` | pass | — | pass | pass | pass | — | pass | pass | **pass** |
| 13 | `africa` | pass | — | pass | pass | pass | — | pass | pass | **pass** |
| 14 | `oceania` | pass | — | pass | pass | pass | — | pass | pass | **pass** |
| **R4-1** | **`tw-cn`** | pass | — | pass | pass | pass | **pass** | **pass** (gap) | pass | **pass** |
| **R4-2** | **`tw-cn-wide`** | pass | — | pass | pass | pass | — | **pass** | pass | **pass** |
| L5-2 | `canada-bc` | pass | **pass** | pass | pass | pass | pass | pass | pass | **pass** |
| L5-3 | `canada-prairies` | pass | **pass** | pass | pass | pass | pass | pass | pass | **pass** |
| L5-4 | `canada-greatlakes` | pass | **pass** | pass | pass | pass | pass | pass | pass | **pass** |
| L5-5 | `canada-rockies` | pass | **pass** | pass | pass | pass | pass | pass | pass | **pass** |
| L5-6 | `canada-boreal` | pass | **pass** | pass | pass | pass | pass | pass | pass | **pass** |

**Flicker: 21 of 21 stationary-camera probes are byte-identical across six redraws**, and no sweep produced more
than **2** LOD transitions — one out and one back, which is what a hysteresis band of 0.08 should give across a
sweep that crosses one threshold. A third transition would be the oscillation §C forbids.

### What the R4 views showed that the R3 set could not

- **`us-adm1-dense` is no longer qualified.** R3's one qualified cell was this view labelling `Indiana` in
  Latin. It now reads **印第安納州**, and every visible US state is Traditional Chinese. `Maine` — the other US
  gap — is **緬因州**. Both came from the QID-joined fill level.
- **`tw-cn` shows the §A decision working.** 中國 and 台灣 are the labels; 北韓, 南韓, 日本, 越南, 泰國, 緬甸 and
  菲律賓 are all the reviewed zh-TW forms; China's provinces render as 內蒙古自治區, 新疆維吾爾自治區,
  廣西壯族自治區 and so on. The formal names are not gone — `KM.geoNames.countryDetail('TW')` still returns
  中華民國（TW）— they are simply not what the map paints.
- **`europe-dense` still carries English division names**, and that is reported rather than described as a pass:
  `Komi`, `Karelia`, `Udmurt`, `Kalmyk`, `Ingush` and `Altay`. Six of R3's nine named Russian republics were
  resolved this round (`Bashkortostan` → 巴什科爾托斯坦共和國, `Mordovia` → 莫爾多維亞共和國, `Adygey` →
  阿迪格共和國, plus Tatarstan, Chechnya and Crimea); the remaining six have **no verified Traditional name in
  any pinned authority**, and inventing one is what §B.5 forbids. `tw-cn` shows the same gap once, as
  `Meghalaya`.

### A DEFECT THE CAPTURES FOUND, WHICH NO ASSERTION WOULD HAVE

The first `tw-cn` capture painted **利比亞 (Libya) over the Tibetan Plateau**. The projection was not wrong:
Libya's anchor was at `facing` **0.043** — 87.5° off the view axis — and near the limb an enormous span of
longitude compresses into a few pixels, so a geometrically correct label reads as a label on the wrong continent.

R3 gave division labels a facing threshold (0.55) and deliberately left countries on the bare rear-hemisphere
test (`mv.z > 0.02`, i.e. 88.9°), on the reasoning that naming the country at the edge of the disc is useful
context. That reasoning holds — right up to the point where the label is compressed into meaninglessness.
`COUNTRY_LABEL_MIN_FACING_` is now **0.08** (85.4°), a deliberately small tightening: in that view it removes
Libya (0.043), Tanzania (0.047), France (0.044) and Mozambique (0.028), and keeps Turkey (0.345), Egypt (0.200)
and Italy (0.112). Four to nine labels per view, all of them at the extreme limb.


## R5 §E — Canada re-verified AFTER the integration, and the four views that did not exist

R5 merged `main` (7a0bff6) into this branch. The Canada correction itself was not touched — no earth asset
changed a byte — so the question §E asks is not "is the texture right" but "did integrating a fortnight of
application work move anything that Canada depends on". Thirteen views were captured to answer it, eleven of
them the set §E names.

FOUR OF THOSE VIEWS DID NOT EXIST, and their absence was itself a gap worth recording. R2/R3/R4 had no
Alaska–Yukon camera, only one hard-coded shipment route, and no capture of the map's OWN opening view — so the
surface an operator actually meets first had never been in an acceptance set at all.

| §E view | captured as | finding |
| --- | --- | --- |
| Canada overview | `canada-regional` | vegetated across the whole mainland; no white mass |
| Canada–US border | `us-ca-border` | **the decisive one.** Surface tone is continuous across the 49th parallel; the national line is a single edge, drawn heavier than the provincial lines beside it |
| Western Canada / prairies | `canada-prairies`, `canada-bc` | prairie soil and cropland; Coast Range and Rockies snow retained |
| Eastern Canada | `canada-greatlakes` | Great Lakes, S Ontario and Quebec continuous with the northern US |
| Canadian Arctic | `canada-boreal`, `arctic-greenland` | boreal → tundra → ice reads as a gradient, not a step |
| Alaska–Yukon | `alaska-yukon` **(new)** | no discontinuity along the 141st meridian; St Elias glaciers intact |
| Greenland–Baffin | `arctic-greenland` | Greenland and Ellesmere fully ice; **the ice was not erased, the season was corrected** |
| North America overview | `na-globe` | the view the original complaint was about |
| Pacific route | `route-pacific` **(new)** | Aleutians and BC under the track, both correct |
| Atlantic route | `route-atlantic` **(new)** | Newfoundland and the Gulf of St Lawrence align with the July coast |
| default On-the-Way Map | `map-default` **(new)** | the engine's own `overview()`, not an approximation of it |

MEASURED ON ALL FOUR PUBLISHED TIERS, not only the one this desktop earned
(`node tools/geo/verify-earth-tiers.js`, 22/22):

| tier | prairie | boreal | tundra | arctic | arctic − prairie | 49th-parallel max step |
| --- | --- | --- | --- | --- | --- | --- |
| 5400 (frozen baseline, not served) | L68 | L35 | L88 | L152 | **+85** | 21 |
| 8192 HIGH | L68 | L35 | L89 | L153 | **+85** | 20 |
| 4096 MID | L68 | L35 | L89 | L153 | **+85** | 21 |
| 2048 BASE | L68 | L35 | L88 | L153 | **+85** | 22 |
| *December 2004, for contrast* | *L192* | *L159* | *L238* | *L176* | ***−13*** | *72* |

All four tiers agree within **0.8 luminance**, and tier-to-tier geography agrees at meanAbsDiff 1.85 / 2.08
against a bound of 3 — with a control proving that a one-degree misregistration would be REJECTED at 8.4 / 8.1.
That control is why "the coastlines align" is a measurement here rather than an impression.

### Two things seen in these captures that R5 did NOT change

Both were checked against the pre-merge branch and are identical there, so neither is an integration effect.
They are recorded rather than fixed, because R5's scope is Canada and the integration.

- **`Seven seas (open ocean)` renders in English** on the default view. The resolver's own comment says an
  unnameable ocean should be HIDDEN rather than labelled with a value that reads like a continent; it currently
  returns the English string at `ENGLISH_CANONICAL`. Byte-identical behaviour at `5fc0249`.
- **Route arcs are not visible** in any route capture. Markers draw correctly and the arcs are submitted, but no
  line appears between them — including in `route-na`, whose code path R5 did not touch. Captured both ways to
  be sure the R5 route parameterisation was not the cause; it is not.

### Committed from `after-r5/`

Nine of the thirteen PNGs were removed after inspection, on this file's existing standard. Regenerate any of
them with `node tools/geo/capture-views.js --tag after-r5 --only <id>`.

| | |
| --- | --- |
| `captures.json` | **all 13 views**, every per-view field, including the new `camera.mode` that records whether a view used `focus()` or the engine's `overview()` |
| `us-ca-border.png` | the 49th parallel — the single view that would show the December defect if it had returned |
| `arctic-greenland.png` | the two-sided proof: mainland vegetated AND Greenland/Ellesmere still ice |
| `alaska-yukon.png` | the new §E view — the 141st meridian, and Alaska not inheriting a discontinuity |
| `na-globe.png` | the overview the original report was written against |

## What is committed here, and why not all of it

The 21 views come to **28 MB of PNG** for one run. `assets/img/earth/PROVENANCE.md` §6 declines a 29.9 MB
upstream image on the grounds that "~30 MB is an unacceptable page and repository weight", and it would be
inconsistent to commit 28 MB of screenshots. Screenshots of a photographic globe also compress poorly.

Committed from `after-r4/`:

| | |
| --- | --- |
| `captures.json` | **all 21 views** — every per-view fact the report states, plus the R4 `flicker` probe and the §C label funnel (`considered` / `after_facing` / `on_screen` / `measured` / `drawn`) per class |
| `tw-cn.png` | §A — 中國 and 台灣 as the map labels, with the formal names still reachable through `countryDetail` |
| `us-adm1-dense.png` | §B — R3's one qualified cell closed: `Indiana` is now 印第安納州 |
| `europe-dense.png` | §B the six divisions that still fall back, §E the border hierarchy, §C density at LOD 2 |
| `globe-limb.png` | §C borders adhering to the surface at the limb, and the country facing threshold in effect |

Kept from `after-r3/`:

| | |
| --- | --- |
| `captures.json` | **all 19 views** — every per-view fact the report states: imagery source and tier, mipmaps/anisotropy, GPU estimate, camera, the canonical-topology counts per class, endpoint connectivity, the anti-meridian census, label counts per class, and the measured zh-TW font probe |
| `globe-limb.png` | §C — borders adhere to the surface at the limb |
| `us-adm1-dense.png` | §E — the national/ADM1 weight hierarchy at full ADM1 strength |
| `europe-dense.png` | §E dense borders, §F the live display aliases (捷克, 克羅埃西亞, 巴勒斯坦), §G label ranking |
| `na-globe.png` | §G the continent layer, §A Canada |

The other 17 are **deterministically regenerable in one command**. They are evidence, not artefacts anything
depends on.


## Regenerating

```sh
node tools/geo/capture-views.js --tag after-r4          # all 21 views
node tools/geo/capture-views.js --only tw-cn            # one view
node tools/geo/measure-perf.js                          # §C/§I performance (separate tool — see below)
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
