# Earth albedo textures — provenance, licence and deterministic re-acquisition

**Task:** MAP-VISUAL-REAL-EARTH-TEXTURE-2 · **Recorded:** 2026-08-26
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
| Byte size | 266,599 | 2,566,770 |
| SHA-256 | `d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e` | `a9f0088972dee0254610af851c4d6838ca3f2cf79176987e0a5713e2c15ec042` |
| Product | Blue Marble (2002): land surface, ocean colour and sea ice | Blue Marble Next Generation, **December 2004**, w/ Topography and Bathymetry |
| Publisher | NASA Earth Observatory / NASA Goddard Space Flight Center | same |
| Upstream file | `land_ocean_ice_2048.jpg` (image record 57730) | `world.topo.bathy.200412.3x5400x2700.jpg` (image record 73909) |
| Upstream URL | `https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg` | `https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg` |

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

**(b) The high asset is December, and the base asset is not.** NASA publishes the 5400 × 2700 topography +
bathymetry image for **December 2004 only** — months 200401/04/06/07/08/09 all return HTTP 404 at that size. In
December, boreal Canada reads snow-white (`rgb ~187,197,202`) where the base asset's growing-season composite
reads dark green (`rgb ~49,54,22`). Loading base **and then** high would visibly flip Canada and Siberia from
green to white about a second after every page load, which looks like a defect rather than an upgrade.

So the ladder gives every device exactly **one** visible material transition: a capable device goes
bootstrap → high and never requests the base asset; a low-capability device goes bootstrap → base and never
requests the 2.5 MB asset. The base asset is also the reported fallback if the high tier fails.

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
