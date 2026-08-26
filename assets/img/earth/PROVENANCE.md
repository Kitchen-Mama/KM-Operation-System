# Earth albedo textures — provenance, licence and deterministic re-acquisition

**Task:** MAP-VISUAL-REAL-EARTH-TEXTURE-2, amended by **TEXTURE-3-R2 §L** and **TEXTURE-3-R3 §B** · **Recorded:** 2026-08-26
**Consumed by:** `assets/js/lib/km-globe.js` (`EARTH_ASSETS_`, `loadEarthImage`)
**Re-acquisition:** `node tools/geo/build-earth-tiers.js` (runtime tiers) · `node tools/geo/fetch-earth-textures.js` (retained R2 baseline)
**Verification:** `node tools/geo/verify-earth-tiers.js --browser` · `node tools/geo/verify-earth-material.js`

---

## 1. Why these files exist

The globe's Earth surface was previously **rasterized at runtime from a 110m land/ocean outline**
(`assets/js/data/world-land-110m.js`) by `buildEarthCanvas()`. That outline carries no per-pixel geography, so
everything inside a coastline was manufactured: a latitude colour ramp, thirteen hand-placed radial patches and
two octaves of value noise. Raising that raster from 2048 to 4096 reproduced the *same picture with more texels*,
because the limit was never resolution — it was **information**.

These files are that missing information: real, geographically correct equirectangular Earth albedo carrying
MODIS-derived land cover (forest, grassland, desert, snow and ice), real ocean colour and, at the high tier, real
bathymetry.

`buildEarthCanvas()` is retained and still used — as the synchronous bootstrap on the first frame and as the
offline fallback if these assets cannot be loaded. It is no longer the primary surface.

## 2. Assets — TEXTURE-3-R3 §B: three tiers, ONE source

**What changed and why.** TEXTURE-3-R2 fixed *which month* the surface shows (July 2004, not December) but left
the resolution where it was — 5400 × 2700 before and after — so R2 reported §A4 sharpness as **not done**. R3
closes it from the same NASA image record at its **published full resolution**, and derives all three runtime
tiers from that one file.

| field | `earth-albedo-8192.jpg` | `earth-albedo-4096.jpg` | `earth-albedo-2048.jpg` |
| --- | --- | --- | --- |
| Role | HIGH tier — capability- and budget-gated | MID tier | BASE tier — floor for every device |
| Dimensions | 8192 × 4096 | 4096 × 2048 | 2048 × 1024 |
| Projection | equirectangular (plate carrée), lon −180…+180, lat +90…−90, north at top | same | same |
| Format | baseline JPEG (SOF0), 3 components YCbCr 4:2:0, non-progressive | same | same |
| Byte size | 4,217,345 | 1,386,011 | 453,127 |
| Bytes / pixel | 0.1257 | 0.1652 | 0.2161 |
| SHA-256 | `e7ca8837c1ec906479f55463955dbf68434a134146958aed646a06ae45a95779` | `366b86ec02abac1169583b64630304d94a6d782bdc44e65f4990e18a547bd28d` | `02037552b15ec5488e655467d5419a2b31f29777f9ccebca0cf49a27139637d9` |
| Derived from | the pinned 21600 × 10800 source, area-average | the 8192 tier, exact 2× box halve | the 4096 tier, exact 2× box halve |
| Encoder / quality | `tools/geo/jpeg-image.js`, Annex K tables, q88 | same, q90 | same, q92 |
| GPU estimate (RGBA8 + mips) | 171.0 MB | 42.8 MB | 10.7 MB |
| Filtering | `LINEAR_MIPMAP_LINEAR` / `LINEAR`, max anisotropy, sRGB decode once | same | same |

**The one source all three come from:**

| field | value |
| --- | --- |
| Upstream file | `world.topo.bathy.200407.3x21600x10800.jpg` |
| Image record | **73751** — the *same* record R2 selected July 2004 from |
| Upstream URL | `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg` |
| Dimensions | 21600 × 10800 (233 megapixels — **16× the texels** of the 5400 × 2700 file) |
| Byte size | 27,201,049 |
| SHA-256 | `d225f1f35a6448a4d1d8f6de6e48f3433e470085b70a35800e64f384f269a7b0` |
| Product | Blue Marble Next Generation, **July 2004**, w/ Topography and Bathymetry |
| Publisher | NASA Earth Observatory / NASA Goddard Space Flight Center |
| Vendored? | **No.** It is a build input, cached outside the repository and re-verified by digest on every run — the same rule the Natural Earth GeoJSON inputs follow. |

**This is not a different picture chosen for sharpness.** It is the same month, the same product, the same
publisher, the same licence and the same projection as the asset R2 accepted — at the resolution NASA publishes
it. That is why §A's freeze on the July decision is *preserved* by this change rather than reopened, and why
R2's Canada gate passes on all three tiers with band luminances within **0.8** of the accepted asset's.

**Deriving every tier from one decode is the §B10 guarantee, not a nicety.** Before R3, BASE was a *different
product entirely* — the 2002 Blue Marble `land_ocean_ice_2048.jpg` (image record 57730, sha256 `d4dc80a6…`,
266,599 B, now **retired**) — while HIGH was BMNG. Changing tier therefore changed the season, the bathymetry
and the sea ice: a tier switch was a visible change of planet. Three sample rates of one decode cannot disagree
about geography.

**`earth-albedo-5400.jpg` is retained and is no longer a runtime tier.** It is the frozen acceptance baseline
that TEXTURE-3-R2's Canada gate measures byte-for-byte (sha256 `4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba`,
2,308,798 B, upstream `world.topo.bathy.200407.3x5400x2700.jpg`, same record 73751). Keeping it costs **2.2 MB of
repository weight and zero bytes at runtime**, and it buys an accepted gate that still measures the exact bytes it
accepted. Retiring it is a one-line decision for the reviewer; it is not one to take silently, so it is stated
here instead.

## 2b. Determinism of the derivation (§B3)

```sh
node tools/geo/build-earth-tiers.js --force        # rebuild all three tiers from the pinned source
node tools/geo/verify-earth-tiers.js --browser     # verify digests, dimensions, detail and Canada on every tier
```

Every step is fixed-function: a source verified by SHA-256 *before use*, an area-average resample whose weights
derive only from the integer dimensions, exact 2× box halving for the lower tiers, and a baseline JPEG encoder
with standard Annex K tables at a pinned quality. No library version, no GPU, no clock and no randomness enters
the pixels, so two runs on two machines produce byte-identical files — which is what makes the pinned output
digests above mean anything.

**Area-average rather than Lanczos**, deliberately. The reduction is 2.637× per axis. Area-average over exactly
the source footprint of each output texel is a correct anti-aliasing filter that invents no detail and cannot
ring; Lanczos would read marginally crisper by adding overshoot at coastlines — that is, by drawing a bright rim
that is not in the source. This task is specifically about not fabricating surface detail.

**The encoder and decoder are ours, so they are checked against someone else's.** `tools/geo/jpeg-image.js`
writes these files and reads them back, and a round trip through one author's encoder and that same author's
decoder proves nothing — a shared misreading of the spec would pass it while every browser refused the file. So
`verify-earth-tiers.js --browser` asks **Chrome's** JPEG decoder to decode all three tiers and compares its
pixels with ours: agreement is 1.39 / 1.74 / 2.20 mean absolute units out of 255 (HIGH / MID / BASE), and Chrome
reports the dimensions 8192 × 4096, 4096 × 2048 and 2048 × 1024. Separately, our full decoder agrees with the
independently written DC-only decoder in `tools/geo/jpeg-dc-probe.js` to a mean of 1.655/255 on the 5400 asset.

## 3. Two measured findings that shaped these choices

Neither was assumed. `tools/geo/jpeg-dc-probe.js` decodes each asset's DC coefficients (an exact 1/8-scale image),
so both were checked against real pixels.

**(a) The first base candidate had a completely flat ocean.** `land_shallow_topo_2048.jpg` (image record 57752)
was the initial pick — it carries shaded topography, which is attractive. But all five open-ocean probes returned
the *identical* colour `#0b0932`: a single flat fill with no depth or latitude variation, which fails the ocean
requirement outright. `land_ocean_ice_2048.jpg` was measured against it and:

| | `land_shallow_topo` | `land_ocean_ice` (chosen) |
| --- | --- | --- |
| distinct open-ocean colours (5 probes) | **1** | **5** |
| ocean luminance σ | 12.15 | **21.99** |
| ocean mean \|gradient\| | 10.65 | **18.85** |
| Rockies luminance σ | 28.48 | 28.28 |
| Andes luminance σ | 33.21 | 35.73 |
| Himalaya luminance σ | 29.10 | 28.80 |

Mountain relief is **unchanged** (within noise) while ocean variation roughly doubles, for +27,923 bytes. The
swap costs nothing that matters and fixes something that does.

**(b) ~~The high asset is December, and the base asset is not.~~ — CORRECTED BY TEXTURE-3-R2 §L1. This finding
was WRONG, and it is left visible rather than deleted because the error is the entire cause of the Canada
defect.**

TEXTURE-2 recorded: *"NASA publishes the 5400 × 2700 topography + bathymetry image for December 2004 only —
months 200401/04/06/07/08/09 all return HTTP 404 at that size."* That is false. Each Blue Marble Next
Generation month has its **own image record**; the probe had asked record **73909** — December's record — for
every month, so every other month 404'd for the obvious reason. Re-probed with HEAD requests:

| month | image record | size | status |
| --- | --- | --- | --- |
| 200407 (July) | **73751** | 2,308,798 B | **HTTP 200** |
| 200408 (August) | 73776 | 2,308,163 B | HTTP 200 |
| 200412 (December) | 73909 | 2,566,770 B | HTTP 200 |

**Why it mattered.** December is a winter composite, and it produced the reported "Canada is an almost
continuous white snow-covered mass". Measured over the December asset with `jpeg-dc-probe.js`:

| region | December | July (now vendored) |
| --- | --- | --- |
| Prairies AB/SK/MB south | `rgb(193,192,187)` L192 — **snow** | `rgb(62,69,34)` L65 |
| Saskatoon | `rgb(212,213,212)` L213 — **snow** | `rgb(60,68,33)` L64 |
| Boreal 55–58 °N | `rgb(152,161,163)` L159 — **snow** | `rgb(26,38,12)` L33 |
| Far-north tundra 64–67 °N | `rgb(233,240,242)` L238 — **snow** | `rgb(74,69,49)` L69 |
| Arctic 76–80 °N | L176 | L152 |
| **Arctic minus southern prairie** | **−13** (the south was BRIGHTER than the ice) | **+85** |
| 49th parallel step at −110…−107 °E | **72** | **7** |

Two consequences that are worth naming separately. First, southern Canada was not merely white — it was
*brighter than Arctic sea ice in the same image*, so §L6's "populated southern Canadian regions must be
visually distinguishable from Arctic ice" was violated in the inverted direction. Second, in December the snow
line runs close to the 49th parallel, so the surface showed a **colour discontinuity that followed a political
border** — §L4's prohibition — without any per-country colouring existing anywhere in the code.

**Why July and not August.** Decided by measurement, not preference. Across southern Canada the two are
indistinguishable (prairie L60/L64/L50 vs L59/L64/L53). They differ on the axis §L2 protects: July retains
**more** legitimate high-elevation snow (St Elias / Mt Logan L175 vs L170; the Rockies box L52 vs L45). §L2 is
explicit that the correction "must not remove legitimate mountain snow, glaciers or Arctic ice", so the month
that keeps more of it wins. July is also 635 B larger and 257,972 B **smaller than the December asset it
replaces**.

**What was verified as retained** (July, same probe): Greenland interior L253, north Ellesmere L242, St Elias
glaciers L175, Devon Ice Cap L171, and the Arctic Archipelago still ice-dominant. The correction did not erase
ice; it corrected the season.

**One honest resolution limit.** The DC probe yields an exact 1/8-scale image, so one sample is ~59 km across.
Glacier retention is therefore verified at the St Elias / Logan scale, which is resolvable, and **not** at the
Columbia Icefield scale (~325 km²), which is smaller than one sample. The 3° Rockies box reads L52 in July
against L135 in December; what that shows is that the *range* is no longer uniformly pale, not that a specific
icefield is present at full resolution.

So the ladder gives every device exactly **one** visible material transition: a capable device goes
bootstrap → high and never requests the base asset; a low-capability device goes bootstrap → base and never
requests the 2.3 MB asset. The base asset is also the reported fallback if the high tier fails. That transition
is now **green → green** (base boreal `rgb(45,56,15)`, July boreal `rgb(26,38,12)` — same class) rather than
green → white, so it is close to invisible instead of merely non-jarring.

## 4. Licence and attribution — verified, not assumed

Verified against NASA's own current policy page (<https://www.nasa.gov/nasa-brand-center/images-and-media/>),
quoted verbatim:

> *"NASA content — images, audio, video, and media files used in the rendition of 3-dimensional models, such as
> **texture maps** and polygon data in any format — generally are not subject to copyright in the United States.
> You may use this material for educational or informational purposes, including photo collections, textbooks,
> public exhibits, computer graphical simulations and Internet Web pages. … NASA content used in a factual manner
> that does not imply endorsement may be used without needing explicit permission. **NASA should be acknowledged
> as the source of the material.**"*

Three points checked rather than presumed:

1. The policy names **texture maps** explicitly — this is exactly the use here.
2. The same policy warns that NASA occasionally hosts **third-party copyrighted** material, which *"will be
   marked identified as copyright protected with the name of the copyright holder"*. Neither Blue Marble product
   carries such a marking; both are NASA Earth Observatory products produced from NASA MODIS data.
3. The use is factual (a logistics map surface) and **implies no NASA endorsement**. The NASA insignia, logotype
   and identifiers are *not* in the public domain and are **not** used.

**Attribution is therefore required by the guideline** (unlike Natural Earth, where it is optional). It is carried
in this file and in `EARTH_ASSETS_[*].product` in `km-globe.js`, which is surfaced at runtime through
`KM_MAP_GLOBE_DIAGNOSTICS().material.source_asset`.

Credit line: **Earth imagery courtesy NASA Earth Observatory / NASA Goddard Space Flight Center (Blue Marble).**

## 4b. §L4 surface continuity — structural, not composited

Canada, the United States and Alaska are **one image**. No compositing, no mosaicking, no per-region source and
no feathering are involved, so there is no projection mismatch, no resampling boundary, no colour-matching step
and no seam to verify — the questions §L4 asks about a multi-source composite do not arise. The single
equirectangular asset is sampled by one shader with one UV mapping, which is what makes "no rectangular
texture-patch edge" and "no different sharpness between Canada and adjacent regions" true by construction.

The one thing that *could* have produced a political-border discontinuity was the seasonal snow line, and it
did (see the 49th-parallel step in the table above). The measured step is now 21 / 7 / 3 luminance at
−120…−117, −110…−107 and −100…−97 °E, against 72 / 22 / 6 before. The regression guard bounds it at ≤ 25.

## 5. Re-acquisition

```sh
node tools/geo/fetch-earth-textures.js            # verify what is vendored; download only what is missing
node tools/geo/fetch-earth-textures.js --force    # re-download and re-verify the retained R2 baseline
```

The script is **checksum-first and fail-closed**: a file is written only if its byte length, SHA-256 *and*
JPEG-header dimensions all match the pins above, so a moved, re-encoded or substituted upstream file is a hard
error rather than a silent content change. It is a build/maintenance tool — never loaded by the page.

Unlike the vector assets in `tools/geo/PROVENANCE.md`, the raw inputs here **are** vendored: they *are* the
runtime asset, with no derivation step. That is deliberate — this toolchain has no image codec, so any
re-encoding would happen off-repository and could not be verified by checksum.

## 6. What was deliberately NOT vendored

| candidate | why not |
| --- | --- |
| ~~`world.topo.bathy.200412.3x21600x10800.jpg` (21600 × 10800, 29,868,040 B)~~ | ~~The only upstream source with enough information to justify an 8192 × 4096 tier. Unusable here: ~30 MB is an unacceptable page and repository weight, downscaling it needs a build-time image codec this toolchain does not have (no ImageMagick, no `sharp`, no PIL), and client-side resampling would need a ~933 MB intermediate.~~ **`REAL_EARTH_8K_SOURCE_ASSET_REQUIRED` — CLOSED by TEXTURE-3-R3 §B. See the correction below.** |
| `gebco_08_rev_elev_21600x10800.png` (18,414,843 B) | A true elevation model, which would replace the albedo-luminance relief proxy with real terrain normals. Same two blockers: size, and no codec to resample it. Recorded as `REAL_EARTH_DEM_ASSET_REQUIRED`. |
| Natural Earth raster (`NE2_50M_SR_W` 88,903,451 B, `HYP_50M_SR_W` 102,197,904 B) | Public domain and excellent, but distributed only as zipped GeoTIFF. No TIFF decoder is available here, and these are cartographic renderings rather than satellite imagery. |
| A separate cloud layer | Optional in the requirement, and omitted on purpose: clouds must never obscure routes, markers, borders or labels, and the previous surface's procedural clouds were part of the haze being removed. |
| Any tile server or CDN image | Forbidden: the page must have **no runtime third-party network dependency**. |

### 6a. Correction — `REAL_EARTH_8K_SOURCE_ASSET_REQUIRED` was blocked by a conflated premise, not by a real limit

The struck-through row above is left visible because the reasoning in it is instructive about how a blocker gets
recorded. Of its three stated reasons, **one was true and two conflated a build input with a shipped asset**:

| stated reason | verdict |
| --- | --- |
| "~30 MB is an unacceptable page and repository weight" | **False as applied.** The 21600 × 10800 file is never vendored and never reaches the page — it is a build input, cached outside the repository. What ships is the 8192 tier at **4,217,345 B**. The comparison was between a build input and a page asset. |
| "downscaling it needs a build-time image codec this toolchain does not have" | **True at the time.** R3 wrote one: `tools/geo/jpeg-image.js`, a dependency-free baseline JPEG decoder and encoder, cross-checked against Chrome's decoder and against the pre-existing DC-only probe. |
| "client-side resampling would need a ~933 MB intermediate" | **True and irrelevant.** Nothing is resampled client-side. The build-time decoder streams one MCU row at a time and finalises output rows as it passes them, so a 233-megapixel source is resampled in roughly the size of its **output**, not its input — about 100 MB, measured at 13.4 s. |

It also, like the December-vs-July error R2 found, **named the December record** (`200412`) when the accepted
imagery is July. The July file at the same size is `world.topo.bathy.200407.3x21600x10800.jpg` under record
**73751**, 27,201,049 B, HTTP 200 — 2.7 MB *smaller* than the December one the row rejected on size.

`REAL_EARTH_DEM_ASSET_REQUIRED` **remains open.** The codec written here reads JPEG only, and
`gebco_08_rev_elev_21600x10800.png` is a PNG — decodable in principle (Node has `zlib`, so the deflate half is
free) but it is a genuine elevation model rather than an albedo, and wiring real terrain normals in place of the
albedo-luminance relief proxy is a shading change, not a texture change. Out of scope for §B, still recorded.

## 7. §L7 asset and performance controls, and the guard that enforces them

| control | value |
| --- | --- |
| Source | NASA Earth Observatory / NASA Goddard Space Flight Center — Blue Marble Next Generation |
| Licence | NASA content, texture maps named explicitly; attribution required (§4 above, quoted verbatim) |
| Acquisition / version date | July 2004 composite; image record 73751 |
| Original checksum | `d225f1f35a6448a4d1d8f6de6e48f3433e470085b70a35800e64f384f269a7b0` (21600 × 10800 source, upstream as served) |
| Processed checksums | `e7ca8837…` (8192), `366b86ec…` (4096), `02037552…` (2048) — see §2 |
| Deterministic command | `node tools/geo/build-earth-tiers.js --force` (source verified before use, fail-closed) |
| Output dimensions | 8192 × 4096 / 4096 × 2048 / 2048 × 1024 |
| Byte size | 4,217,345 / 1,386,011 / 453,127 |
| GPU memory estimate | 171.0 MB (HIGH) / 42.8 MB (MID) / 10.7 MB (BASE), RGBA8 + full mip chain |
| **Stated texture-memory budget (§B6)** | **192 MB** — `GPU_TEXTURE_BUDGET_BYTES_` in `km-globe.js`. The ladder descends when it does not fit, and the tests shrink it to prove that. |
| HIGH tier release conditions (§B7/§B8/§B11) | `MAX_TEXTURE_SIZE ≥ 8192` **and** (`deviceMemory ≥ 8 GB`, or ≥ 8 cores when `deviceMemory` is unreported) **and** within budget. Capability alone does not earn it — that is §B11 enforced separately from §B8. |
| Mipmap / filtering | `LINEAR_MIPMAP_LINEAR` minification, `LINEAR` magnification, max hardware anisotropy, sRGB decoded exactly once |

**The guard.** `assets/tests/globe-canada-seasonal-surface-texture-3-r2.test.js` decodes the vendored asset and
asserts bounded regional statistics — never a filename, never a release token and never a single pixel. It is
deliberately two-sided, because a guard that only checks "Canada is green" would pass a country-shaped overlay,
which §L3 forbids: eleven southern and boreal Canadian regions must not be snow-classified, **and** Greenland,
north Ellesmere and the St Elias glaciers must remain bright; the Arctic must exceed the southern prairie by
≥ 40 luminance; the four Canadian bands must span ≥ 80; the 49th-parallel step must stay ≤ 25; and the Amazon,
Sahara and open ocean must be unchanged in class.

It also asserts its own discriminating power: the recorded December measurements are checked against the same
thresholds and **must fail them**. A guard that cannot fail on the known-bad input is not a guard.
