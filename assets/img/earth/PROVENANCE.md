# Earth albedo textures — provenance, licence and deterministic re-acquisition

**Task:** MAP-VISUAL-REAL-EARTH-TEXTURE-2, amended by **TEXTURE-3-R2 §L** · **Recorded:** 2026-08-26
**Consumed by:** `assets/js/lib/km-globe.js` (`EARTH_ASSETS_`, `loadEarthImage`)
**Re-acquisition:** `node tools/geo/fetch-earth-textures.js` · **Verification:** `node tools/geo/verify-earth-material.js`

---

## 1. Why these files exist

The globe's Earth surface was previously **rasterized at runtime from a 110m land/ocean outline**
(`assets/js/data/world-land-110m.js`) by `buildEarthCanvas()`. That outline carries no per-pixel geography, so
everything inside a coastline was manufactured: a latitude colour ramp, thirteen hand-placed radial patches and
two octaves of value noise. Raising that raster from 2048 to 4096 reproduced the *same picture with more texels*,
because the limit was never resolution — it was **information**.

These two files are that missing information: real, geographically correct equirectangular Earth albedo carrying
MODIS-derived land cover (forest, grassland, desert, snow and ice), real ocean colour and, at the high tier, real
bathymetry.

`buildEarthCanvas()` is retained and still used — as the synchronous bootstrap on the first frame and as the
offline fallback if these assets cannot be loaded. It is no longer the primary surface.

## 2. Assets

| field | `earth-albedo-2048.jpg` | `earth-albedo-5400.jpg` |
| --- | --- | --- |
| Role | base tier — low-capability devices, and the high-tier failure fallback | high tier — capability-gated |
| Dimensions | 2048 × 1024 | 5400 × 2700 |
| Projection | equirectangular (plate carrée), lon −180…+180, lat +90…−90, north at top | same |
| Format | baseline JPEG, 3 components (YCbCr), non-progressive | same |
| Byte size | 266,599 | 2,308,798 |
| SHA-256 | `d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e` | `4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba` |
| Product | Blue Marble (2002): land surface, ocean colour and sea ice | Blue Marble Next Generation, **July 2004**, w/ Topography and Bathymetry |
| Publisher | NASA Earth Observatory / NASA Goddard Space Flight Center | same |
| Acquisition / version | 2002 growing-season composite | **July 2004** (northern-hemisphere summer) |
| Upstream file | `land_ocean_ice_2048.jpg` (image record 57730) | `world.topo.bathy.200407.3x5400x2700.jpg` (image record **73751**) |
| Upstream URL | `https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg` | `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg` |
| Processing | none — the vendored bytes ARE the upstream bytes | none — same |
| Original = processed checksum | yes (no derivation step) | yes (no derivation step) |
| GPU estimate (RGBA8 + mips) | ~11.2 MB | ~74.6 MB at native 5400×2700; ~42.0 MB on the 4096 POT tier |
| Filtering | `LINEAR_MIPMAP_LINEAR` / `LINEAR`, max anisotropy, sRGB decode once | same |

Both were renamed on vendoring so the repository names describe the **role**, not the upstream filename. The
bytes are unmodified — the SHA-256 values are of the upstream files exactly as served.

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
node tools/geo/fetch-earth-textures.js --force    # re-download and re-verify both
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
| `world.topo.bathy.200412.3x21600x10800.jpg` (21600 × 10800, 29,868,040 B) | The only upstream source with enough information to justify an 8192 × 4096 tier. Unusable here: ~30 MB is an unacceptable page and repository weight, downscaling it needs a build-time image codec this toolchain does not have (no ImageMagick, no `sharp`, no PIL), and client-side resampling would need a ~933 MB intermediate. Recorded as `REAL_EARTH_8K_SOURCE_ASSET_REQUIRED`. |
| `gebco_08_rev_elev_21600x10800.png` (18,414,843 B) | A true elevation model, which would replace the albedo-luminance relief proxy with real terrain normals. Same two blockers: size, and no codec to resample it. Recorded as `REAL_EARTH_DEM_ASSET_REQUIRED`. |
| Natural Earth raster (`NE2_50M_SR_W` 88,903,451 B, `HYP_50M_SR_W` 102,197,904 B) | Public domain and excellent, but distributed only as zipped GeoTIFF. No TIFF decoder is available here, and these are cartographic renderings rather than satellite imagery. |
| A separate cloud layer | Optional in the requirement, and omitted on purpose: clouds must never obscure routes, markers, borders or labels, and the previous surface's procedural clouds were part of the haze being removed. |
| Any tile server or CDN image | Forbidden: the page must have **no runtime third-party network dependency**. |

## 7. §L7 asset and performance controls, and the guard that enforces them

| control | value |
| --- | --- |
| Source | NASA Earth Observatory / NASA Goddard Space Flight Center — Blue Marble Next Generation |
| Licence | NASA content, texture maps named explicitly; attribution required (§4 above, quoted verbatim) |
| Acquisition / version date | July 2004 composite; image record 73751 |
| Original checksum | `4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba` (upstream, as served) |
| Processed checksum | identical — there is no processing step |
| Deterministic command | `node tools/geo/fetch-earth-textures.js --force` (checksum-first, fail-closed) |
| Output dimensions | 5400 × 2700 |
| Byte size | 2,308,798 |
| GPU memory estimate | ~74.6 MB (RGBA8 + full mip chain) at the native tier; ~42.0 MB on the 4096 POT tier |
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
