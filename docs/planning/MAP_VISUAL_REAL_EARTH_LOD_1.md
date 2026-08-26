# On-the-Way Map — real-earth surface, ADM1 boundaries and adaptive LOD

**Task:** MAP-VISUAL-REAL-EARTH-LOD-1 · **Baseline:** `b16d3c9` (= `origin/main`, clean, ahead 0 / behind 0)
**Scope:** front-end map visuals only. No DB, no schema, no Apps Script, no Demo seed, no shipment coordinate.

---

## 1. §A — what already existed (VERIFIED, not re-claimed)

These were audited and confirmed **already present** before any change. None of them is a deliverable of this
task and none is reported below as new:

| capability | where | state |
| --- | --- | --- |
| DPR-correct backing buffer | `km-globe.js` `resize()` | `dpr = min(devicePixelRatio, 2)`, `canvas.width = round(cssW*dpr)` |
| Window resize + `ResizeObserver` | `km-globe.js` | both wired |
| 4096×2048 capability tier | `pickTextureTier` | gated on `MAX_TEXTURE_SIZE`, `deviceMemory`, `hardwareConcurrency` |
| Mipmaps | texture upload | `generateMipmap` + `LINEAR_MIPMAP_LINEAR` |
| Anisotropic filtering | texture upload | `EXT_texture_filter_anisotropic` at max |
| Country borders (110m) | `buildCountrySegments` | slerp-based, antimeridian-safe |
| Country ISO labels | `drawCountryLabels` | front-face, viewport, collision, priority |

**The 4K tier is pre-existing (V3G6A). It is not new work here.**

---

## 2. §B — the actual root cause of the blur

The nine candidate causes were tested against the source. Verdict:

| # | candidate | verdict |
| --- | --- | --- |
| 1 | **the source surface has no high-frequency detail** | **PRIMARY ROOT CAUSE** |
| 2 | interpolation of a magnified texture | symptom of (1), not a cause |
| 3 | procedural noise / cloud too strong | **CONTRIBUTING** — the noise is the *only* high-frequency content, and it is non-geographic, which is what reads as "plastic" |
| 4 | shader lacks normal / specular / roughness | contributing, but moot until (1) is fixed — there is no height or material data to light |
| 5 | intermediate buffer too small | NO — the rasteriser is fully resolution-parametric |
| 6 | CSS size vs WebGL backing buffer mismatch | **NO** — verified correct (V3G6A) |
| 7 | zoom exceeds usable texel density | true at MIN_D, but a consequence of (1) |
| 8 | country border geometry too coarse | true at close zoom (110m), **addressed for ADM1** at 10m |
| 9 | capability fallback mis-downgrading | NO — but it was **unverified**; see §4 |

### What the surface actually is

`buildEarthCanvas()` paints the entire Earth from three ingredients:

1. **ocean** — a vertical `createLinearGradient` keyed on latitude only;
2. **land** — one flat fill `#4a6a48`, plus a latitude-band gradient, plus **13 hand-placed radial blobs**
   (Sahara, Amazon, Greenland, …);
3. **"relief"** — `noiseTile()`, i.e. `Math.imul`-seeded **value noise**.

There is **no elevation data, no land-cover data, no bathymetry and no imagery** anywhere in the pipeline. The
only real geography is the 110m **coastline** used to clip land from ocean.

That is why raising 2048 → 4096 did not help: a latitude gradient rendered at twice the texels is still a
latitude gradient. **The pixels were never the limit; the information was.** Random noise cannot become a
mountain range, so no filter, resample, sharpen or contrast change can produce §C's forest / desert / mountain /
plain / ice layering. It requires a **real raster asset**.

---

## 3. §C / §D — `HIGH_RES_EARTH_ASSET_REQUIRED`

**The photoreal surface was NOT implemented, and nothing cosmetic is being presented as one.** Per §D.6 the
requirement is reported precisely instead:

**Needed:** an equirectangular (plate carrée) raster, longitude −180…180, latitude 90…−90, north at top.

| map | purpose | recommended size | format |
| --- | --- | --- | --- |
| **albedo / colour** (required) | the land + ocean surface itself | 8192×4096 (min 4096×2048) | JPEG q85, or WebP |
| **shaded relief / normal** (strongly recommended) | §C's mountain/terrain layering under directional light | 4096×2048 | JPEG or PNG-8 |
| **ocean mask / specular** (recommended) | §C's ocean specular without lighting the land | 2048×1024 | PNG-8 grayscale |
| **night lights** (optional) | terminator interest | 2048×1024 | JPEG |

**Licence conditions the asset must satisfy:** public domain or a permissive licence allowing redistribution in
a private commercial repository, with no runtime CDN dependency, no attribution obligation that the dashboard
cannot carry, and no share-alike obligation.

**Two candidate sources that satisfy those conditions** (neither downloaded, neither committed — both need an
explicit repo decision on committing multi-MB binaries):

- **NASA Blue Marble Next Generation** — public domain, photographic, 8192×4096 available.
- **Natural Earth raster** (`NE1_HR_LC_SR_W`, `HYP_HR_SR_OB_DR`) — public domain, same upstream project this
  repo already vendors vectors from; shaded relief + hypsometric tint, which suits a control-tower dashboard
  better than photography.

**Blocked on:** a decision to commit binary raster assets (~3–8 MB each) to this repository, plus the
lazy-loading policy for them. Until that decision, the surface is unchanged and honestly described as
procedural.

**Also evaluated and deliberately NOT shipped: an 8192×4096 tier.** The rasteriser is resolution-parametric, so
an 8K raster would draw cleanly — but it would re-rasterise the *same* gradient-and-noise artwork at 4× the
memory (~128 MB with mips). Under §D.3 and §B that is magnification dressed up as fidelity, so it was rejected.
It becomes worthwhile only once a real albedo raster exists.

---

## 4. §D / §H — what DID change in the texture path

One genuine, non-cosmetic fix: **the capability tier is now verified by actual allocation.**

`pickTextureTier` reads `MAX_TEXTURE_SIZE`, `deviceMemory` and `hardwareConcurrency`, but **none of those is a
promise the driver will hand over the memory** — a 4096×2048 RGB image plus its mip chain is ~32 MB. Nothing
checked the upload, so a refused allocation left an incomplete texture and the globe rendered **black** — the
one outcome §H.7 forbids. The upload now drains the GL error state, checks `texImage2D`, and on failure
**re-rasterises from the vector source** at the guaranteed base tier (never a rescale of a bitmap). The result
is exposed as `allocation_verified` / `downgraded_from` / `tier_reason`.

This is reported as **robustness**, not as fidelity.

---

## 5. §E / §F / §G — ADM1 boundaries and adaptive LOD (the substantive delivery)

### Asset

`assets/js/data/world-admin1-10m.js` — Natural Earth `ne_10m_admin_1_states_provinces` v5.1.2, **public domain,
attribution not required**. 3,835 divisions across 208 countries; 1,290,908 source vertices reduced to 76,931
(94.0 % removed); **538,175 bytes**. Full provenance, licence, checksums, reduction table, label-code rule and
antimeridian evidence: `tools/geo/PROVENANCE.md`. Generator: `tools/geo/build-admin1-boundaries.js`
(deterministic — byte-identical on rebuild, verified).

The 50m layer was downloaded and **rejected**: it carries only 9 countries and **zero Japanese prefectures**, so
§E's LOD-2 requirement is unmeetable from it.

Rings are stored as **delta + zigzag + varint strings** (2.20 MB → 0.54 MB). This is a transport encoding only:
the generator round-trips all 76,931 vertices at build time and fails the build on a single mismatch.

### LOD thresholds and hysteresis

Camera distance runs 1.35 (close) … 5.0 (far).

| LOD | distance | shows |
| --- | --- | --- |
| 0 | > 2.60 | coastlines, national outlines, ISO country codes (36 majors) |
| 1 | 1.95 – 2.60 | as LOD 0, country codes widen to 125 |
| 2 | 1.62 – 1.95 | **+ ADM1 outlines + division codes** (budget 22) |
| 3 | < 1.62 | as LOD 2, division-code budget 42 |

**Hysteresis = ±0.08** (a 0.16-wide dead band). Each boundary is widened *in the direction of travel*, so
leaving a level requires passing the boundary by the margin. It is a pure function of `(distance, previousLevel)`
— no clock, no counter, no randomness. Tested by sweeping the full range in both directions and asserting each
boundary is crossed **exactly once**, and by jittering across a boundary 400 times and asserting the level does
not move.

**Deviation, stated deliberately:** §E.1 invites ADM1 geometry to begin fading in at LOD 1. It is admitted at
LOD 2 instead. At LOD 1 the camera still sees most of a hemisphere, and the dataset is 3,835 divisions / 76.8k
segments worldwide — drawing them there is precisely the "wall of divisions" §E.1 forbids, and restricting to
"the visible area" would need a per-frame point-in-polygon pass that §H.1 forbids. The gradual progression is
carried instead by the **label budget** (22 → 42) and the caller-driven country restriction, neither of which
costs a per-frame test.

### Division label codes — authoritative, never invented

| case | rule | count |
| --- | --- | --- |
| ISO 3166-2 subdivision part is alphabetic | use verbatim — `US-CA` → **CA** | 2,340 |
| ISO 3166-2 subdivision part is numeric | use the **name** — `JP-13` → **Tokyo** | 1,424 |
| no ISO code | use the **name** | 71 |
| neither | **no label** | 0 |

Natural Earth's `postal` field is deliberately **never** promoted to a displayed code: it is a cartographic
abbreviation invented by the dataset (Ōita → `OT`), not a published standard. US coverage is all 51 with
official codes; Canada 13, Japan 47 prefectures, Australia 10, Germany 16, China 31, Mexico 32.

### Geometry correctness

The ADM1 layer goes through **the same shared rasteriser** (`ringsToSegments`) as the country layer, so the
guarantees are structurally shared rather than reimplemented:

- every vertex becomes a 3D unit vector **before** interpolation, and interpolation is `slerp` — **no longitude
  arithmetic exists anywhere**, so a line across the Pacific is impossible by construction (asserted: zero
  emitted segments exceed the subdivision limit, longest chord 0.035);
- each ring is an independent closed loop; rings are never concatenated, so Alaska's islands, Hawaii, the
  Japanese islands, Indonesia, New Zealand, the UK and the Caribbean are never joined by false segments;
- longest source edge 16.47°, subdivided at ≤2° → worst chord sag 0.00015, **20× under** the 0.0030 surface
  offset, so a border can never sink into the sphere;
- ADM1 sits at radius **1.0030**, below the country layer's **1.0035**, so a national border always wins where
  the two coincide; markers stay at 1.012, above both.

Rear-hemisphere division codes are rejected by the same `front` test the country codes use — **no code shows
through the globe**.

### Label hierarchy (§G)

Division codes are laid out **after** the country codes and are blocked by both those codes **and** the shipment
markers, so a geographic reference can never cover a business object. Font is strictly smaller
(`max(8, countryFont - 2)`), fill is dimmer. Collisions **hide**, never move, a label — a moved label is a wrong
label. Ordering is `priority → dataset rank → id`, so the winner never depends on array order or time.

### Layer controls (§G)

Four independent controls with the required defaults:

| layer | control | default |
| --- | --- | --- |
| Country borders | checkbox | **ON** |
| Country labels | checkbox | **ON** |
| ADM1 borders | Auto / On / Off | **AUTO** (by zoom) |
| ADM1 labels | Auto / On / Off | **AUTO** (by zoom) |

**A real bug was found and fixed here:** both label layers share one 2D overlay, and its early return bailed
whenever *country* labels were off — which would have switched the ADM1 labels off with them. It now bails only
when neither layer wants to draw. A regression test pins this, and the country suite's assertion that used to
pin the old early return was strengthened to the correct contract rather than deleted.

---

## 6. §H — performance, decoupling, degradation

- **No per-frame geometry work.** The render loop neither decodes the asset nor rebuilds segments; it binds one
  `STATIC_DRAW` buffer. Asserted structurally against the extracted `draw()` body.
- **Buffer built once** per dataset, and again only on `webglcontextrestored`. Decode + rasterise measured at
  ~40 ms for the whole world; GPU buffer 4.10 MB.
- **LOD callback fires only on a level change**, never per frame.
- **Lazy, decoupled load.** The 0.54 MB asset is **not** in `index.html`; the map page injects it as a
  same-origin `<script>` the first time the LOD reaches 2 (or the user forces a layer On). It is therefore never
  in the path of the initial shipment workspace read, and it touches no business API.
- **Degradation ladder:** `setAdmin1Countries()` restricts the layer to a country subset (rebuilds the static
  buffer, never a per-frame filter) → labels suppressed by budget → layer absent. If the asset fails to load or
  the buffer fails to build, the state is named (`ADMIN1_BUFFER_BUILD_FAILED`, `admin1AssetState: 'FAILED'`) and
  the operator is told **"The map, routes and shipments are unaffected."**
- **Diagnostics:** `window.KM_MAP_GLOBE_DIAGNOSTICS()` returns render info (DPR, CSS vs buffer size), texture
  info (tier, dimensions, `MAX_TEXTURE_SIZE`, mipmaps, anisotropy, allocation verification, downgrade reason),
  LOD info (level, distance, thresholds, hysteresis, per-layer modes and visibility), country-layer counts,
  ADM1-layer counts (divisions, rings, segments, vertices, buffer bytes, build ms, label candidates/drawn/budget,
  degrade reason) and the asset load state.

---

## 7. §I — interaction and business surface unchanged

No shipment coordinate, route, marker, status, event or ETA was touched. `km-globe.js` contains none of
`SpreadsheetApp`, `allocation_draft`, `shipment_events`, `planned_qty`, `doPost` (asserted). The globe performs
no `fetch`, `XMLHttpRequest` or `WebSocket` (asserted). Markers still project from their own lat/lng at 1.012,
above both reference layers. **No shipment write API is called anywhere in this change.**

---

## 8. Tests

New suite **165 / 0**, covering §J's allowed substitutes for pixel comparison: deterministic render-info
assertions, LOD threshold + hysteresis + flicker sweeps, antimeridian segment-length proofs against the real
asset, label-collision determinism, capability-fallback structure, no-network assertions, unchanged-coordinate
assertions, and the eight fixed camera regression views (Global Pacific, North America, Europe, Japan/East Asia,
Australia, Dateline crossing, Maximum zoom, Low-capability fallback) each asserting resolved LOD, ADM1
visibility under AUTO, label admission and antipode rejection.

Two assertions in the existing country-boundary suite were **strengthened** (never weakened) to follow the
shared-rasteriser refactor and the layer-independence fix.

Full sweep **356 suites → the same 4 pre-existing failures → 0 new**
(`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`,
`supply-planning-route-inventory`).

---

## 9. Deployment

`FRONTEND_DEPLOY_REQUIRED`: `assets/js/lib/km-globe.js`, `assets/js/pages/global-logistics-map.js`,
`assets/js/data/world-admin1-10m.js` (**new**), `index.html` (cache-buster).
`APPS_SCRIPT_SYNC_REQUIRED`: **none** — no `.gs` file was touched.
`BUNDLE_REBUILD_REQUIRED`: **NO**.
