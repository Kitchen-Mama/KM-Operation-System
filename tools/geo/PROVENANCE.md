# Country boundary asset — provenance, licence and deterministic regeneration

**Task:** F1-7N-MAP-COUNTRY-BOUNDARY-1 · **Recorded:** 2026-08-26
**Produced asset:** `assets/js/data/world-countries-110m.js` (sets `window.KM_WORLD_COUNTRIES`)
**Generator:** `tools/geo/build-country-boundaries.js`

---

## 1. Repository audit performed first (§C)

Before any dataset was considered, the repository was searched for an existing country polygon / GeoJSON /
TopoJSON / Natural Earth / administrative-boundary / ISO-country-code / centroid asset.

**Result: none existed.** The only vector asset present was `assets/js/data/world-land-110m.js` — a Natural Earth
110m **land outline** (128 rings, 5,122 points) with **no per-ring country name, ISO code or administrative
attribution**. It is a coastline/land mask consumed only by `buildEarthCanvas()` to rasterize the earth texture,
and it cannot express borders. It was therefore **reused unchanged for what it does** (the texture) and a new
asset was prepared for boundaries and labels.

## 2. Source

| field | value |
| --- | --- |
| Source | Natural Earth |
| Dataset | `ne_110m_admin_0_countries` |
| Resolution | 1:110m (small scale) |
| Version | **v5.1.2** (an immutable git tag — deliberately **not** `master`, which moves) |
| URL | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson` |
| Input SHA-256 | `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` |
| Input size | 838,726 bytes · 177 features |

`nvkelso/natural-earth-vector` is the canonical upstream repository for Natural Earth vector data.

## 3. Licence

**Public domain.** Verbatim from the upstream `LICENSE.md`:

> *"All versions of Natural Earth raster + vector map data found on this website are in the public domain. You may
> use the maps in any manner, including modifying the content and design, electronic dissemination, and offset
> printing. … No permission is needed to use Natural Earth. Crediting the authors is unnecessary."*

Terms of use: <https://www.naturalearthdata.com/about/terms-of-use/>

Attribution is **not required**. The voluntary credit *"Made with Natural Earth."* is carried in the asset's
`meta.credit` anyway.

**No unlicensed map asset was copied, and no third-party redistribution was used** — the file came from the
upstream project's own repository at a pinned tag.

## 4. Regeneration (deterministic)

```sh
curl -sSL -o ne_110m_admin_0_countries.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson

# verify you have the exact input this asset was built from
sha256sum ne_110m_admin_0_countries.geojson
# 6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f

node tools/geo/build-country-boundaries.js ne_110m_admin_0_countries.geojson
```

The raw input is **not vendored** — it is ~820 KB of source data the runtime never loads. The pinned URL plus the
SHA-256 above make the build verifiable without it.

**Determinism:** the generator uses no clock, no randomness, no network and no filesystem discovery. Countries are
emitted sorted by ISO alpha-2 ascending; ring and vertex order are preserved from the source; Douglas–Peucker is
iterative (fixed traversal order); `-0` is normalised to `0`. Running it twice on the same input produces a
**byte-identical** file — verified by comparing SHA-256 across two runs.

## 5. Processing applied

| step | value | why |
| --- | --- | --- |
| Douglas–Peucker tolerance | `0.08°` | NE 110m is already generalized; this only removes near-collinear noise |
| Coordinate rounding | 2 decimals (~1.1 km) | far below one screen pixel on a 2048 px globe; identical rounding on both sides of a shared border keeps neighbours coincident, so no gaps open |
| Closing vertex | dropped | the loop is closed explicitly at render time, so the closing edge is never treated as data |
| Degenerate rings | dropped (2) | a ring reduced below 4 points would emit a zero-length GL line |
| Holes | kept | enclaves and lakes are borders too |

**Output:** 175 countries · 285 rings · 8,733 vertices · **138,068 bytes**.

## 6. ISO alpha-2 resolution, and the two exclusions

Resolution order: `ISO_A2_EH` → `ISO_A2` → `WB_A2`, requiring `^[A-Z]{2}$`. `ISO_A2_EH` is first because plain
`ISO_A2` carries `-99` for France and Norway.

**Two features were EXCLUDED because they have no assigned ISO 3166-1 alpha-2 code — never invented:**

| feature | ISO_A2 | ISO_A2_EH | WB_A2 | disposition |
| --- | --- | --- | --- | --- |
| N. Cyprus | `-99` | `-99` | `-99` | excluded (recorded in `meta.excluded`) |
| Somaliland | `-99` | `-99` | `-99` | excluded (recorded in `meta.excluded`) |

Both are disputed territories. Excluding them means the map shows the ISO-conformant view (Cyprus and Somalia
unified). The exclusions are recorded **in the asset itself**, so the omission is visible rather than silent.

## 7. Label points are cartographer-placed, not centroids

`LABEL_X` / `LABEL_Y` are Natural Earth's own representative label points. All 175 records use them
(`label_source: "NE_LABEL_XY"`). This is not a preference — a centroid is measurably wrong for the exact cases
this task calls out:

| country | bbox centre | NE label point | why the centroid fails |
| --- | --- | --- | --- |
| Russia | `0.0, 61.2` | `44.69, 58.25` | spans the antimeridian → centroid lands on the prime meridian |
| France | `-22.5, 26.6` | `2.55, 46.70` | overseas territories drag it into the Atlantic |
| United States | `-119.4, 45.1` | `-97.48, 39.54` | Alaska + Hawaii drag it into the Pacific |
| Indonesia | `118.2, -2.4` | `101.89, -0.95` | archipelago |
| Fiji | `0.0, -17.2` | `177.98, -17.83` | straddles the antimeridian → centroid lands off Africa |

20 of 175 records sit more than 3° from their own bounding-box centre; each record carries `label_offset_deg` so
the claim is checkable from the data.

## 8. Antimeridian and multipolygon evidence

- 29 of 175 countries are **MultiPolygon**; the largest is Canada with 30 rings.
- **Each ring is an independent closed loop.** Rings are never concatenated, so two unrelated islands of one
  country can never be joined by a false straight border segment.
- The dataset contains the definitive antimeridian case: **Antarctica** has a consecutive vertex pair
  `(180, −90) → (−180, −90)` — a **360° longitude jump** that is a **0.000° great-circle arc**, because both
  points are the south pole. A renderer that interpolates in longitude draws a line straight across the map; the
  renderer here projects every vertex to a 3D unit vector *first* and interpolates with `slerp`, so no longitude
  arithmetic exists anywhere and the failure mode is structurally impossible.
- Longest single source edge: **18.06°** (a simplified US ring). Subdivided at ≤2° so the chord sag is 0.00015 —
  23× under the 0.0035 surface offset, which is why boundaries never sink into the sphere.

## 9. What this asset is not

It is a **geographic reference only**. It is never a business coordinate, a warehouse identity, a route node or a
shipment location, and no writer, handler or DB schema reads it. The runtime loads it once, same-origin, with no
CDN and no fetch.

---

# ADM1 boundary asset — provenance, licence and deterministic regeneration

**Task:** MAP-VISUAL-REAL-EARTH-LOD-1 · **Recorded:** 2026-08-26
**Produced asset:** `assets/js/data/world-admin1-10m.js` (sets `window.KM_WORLD_ADMIN1`)
**Generator:** `tools/geo/build-admin1-boundaries.js`

## 1. Repository audit performed first

The repository was searched for any existing ADM1 / state / province / prefecture / administrative-subdivision
asset. **Result: none existed.** The two vendored vector assets are a 110m land outline (coastline only, no
attribution) and the 110m admin-0 country asset above (national borders only). Neither can express a
first-level administrative division, so a new asset was prepared.

## 2. Source

| field | value |
| --- | --- |
| Source | Natural Earth |
| Dataset | `ne_10m_admin_1_states_provinces` |
| Resolution | 1:10m (large scale) |
| Version | **v5.1.2** (an immutable git tag — deliberately **not** `master`, which moves) |
| URL | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson` |
| Input SHA-256 | `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5` |
| Input size | 40,726,851 bytes · 4,596 features |

### Why 10m and not 50m or 110m

| dataset | features | countries covered | verdict |
| --- | --- | --- | --- |
| `ne_110m_admin_1_states_provinces` | few | a handful | far too sparse |
| `ne_50m_admin_1_states_provinces` | 294 | **9** (AU, BR, CA, CN, ID, IN, RU, US, ZA) | **no Japan, no UK, no Germany** — cannot satisfy §E LOD-2 |
| `ne_10m_admin_1_states_provinces` | 4,596 | **241** | chosen |

The 50m layer was downloaded and inspected before being rejected; it carries **zero** Japanese prefectures, so
§E's explicit "JP: prefectures" requirement is unmeetable from it. The 10m file is large, but it is an **input,
not an output** — the generator simplifies it to a 0.54 MB vendored asset and the raw file is never committed.

## 3. Licence

**Public domain**, identical to the admin-0 asset above — same upstream project, same terms. Attribution is
**not required**; the voluntary credit *"Made with Natural Earth."* is carried in the asset's `meta.credit`.
Terms of use: <https://www.naturalearthdata.com/about/terms-of-use/>

**No unlicensed map asset was copied and no third-party redistribution was used** — the file came from the
upstream project's own repository at a pinned tag.

## 4. Regeneration (deterministic)

```sh
curl -sSL -o ne_10m_admin_1_states_provinces.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson

sha256sum ne_10m_admin_1_states_provinces.geojson
# 22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5

node --max-old-space-size=4096 tools/geo/build-admin1-boundaries.js ne_10m_admin_1_states_provinces.geojson
```

Running it twice on the same input produces a **byte-identical** file (verified).
Output SHA-256: `c109d22e922c5a157fcac0eb41bf994830d1dbf4060ddb73128d9569c6a6e14b`

## 5. Reduction

| measure | value |
| --- | --- |
| Source vertices | 1,290,908 |
| Kept vertices | 76,931 (**94.0 % removed**) |
| Divisions | 3,835 across 208 countries |
| Rings | 5,081 (dropped: 2,227 sub-resolution islets, 1,143 degenerate) |
| Output size | 538,175 bytes |

Simplification is Douglas-Peucker at **0.08°** — the same tolerance the admin-0 asset already uses — with
coordinates rounded to 2 decimals (~1.1 km). Rings whose bounding-box diagonal is under 0.15° are dropped: those
are sub-pixel coastal islets that cost vertices and render as noise. **A division is never dropped for this
reason, only its unresolvable slivers**, and every count above is recorded in the asset's own `meta.stats`.

## 6. Ring encoding

Rings are stored as **delta + zigzag + varint strings** over a 64-character URL-safe alphabet, not as coordinate
arrays. This is a pure transport encoding: decoding is an exact integer prefix-sum divided by 100, so every
reconstructed vertex is bit-for-bit the rounded coordinate. Measured effect: **2.20 MB → 0.54 MB**.

The generator runs a **full round-trip self-check at build time** — all 76,931 vertices are decoded back and
asserted to be in range and exactly quantised — so a broken encoder fails the build instead of shipping. The
runtime decoder in `km-globe.js` is the exact inverse, and a regression test decodes the shipped asset with the
shipped function and compares against the generator's alphabet and scale.

## 7. Division label codes — the authority rule

§E requires a short **authoritative** division code, and forbids arbitrary truncation or invented codes.

| case | rule | count | example |
| --- | --- | --- | --- |
| ISO 3166-2 subdivision part is **alphabetic** | use it verbatim | 2,340 | `US-CA` → **CA**, `DE-BY` → **BY**, `AU-QLD` → **QLD** |
| ISO 3166-2 subdivision part is **numeric** | use the **name** | 1,424 | `JP-13` → **Tokyo**, `FR-75` → **Paris** |
| no ISO 3166-2 code at all | use the **name** | 71 | — |
| neither code nor name | **no label** | 0 | — |

Natural Earth's own `postal` field is deliberately **not** promoted to a displayed code: it is a cartographic
abbreviation invented by the dataset (Ōita → `OT`), not a published standard, so using it would be exactly the
invention §E forbids. Every record carries `t` (0/1/2) recording which rule produced its label, so the claim is
checkable from the data.

United States coverage is the full 51 (50 states + DC) with official codes — `CA`, `TX`, `NY`, `FL`, `AK`, `HI`
all present. Canada 13, Australia 10, Japan 47 prefectures, Germany 16, China 31, Mexico 32.

## 8. Label anchors

`latitude` / `longitude` are Natural Earth's own cartographer-placed representative points, not centroids, and
are preferred for the same reason as the admin-0 `LABEL_X/Y`: a bounding-box centre for Alaska lands in the sea.
Where the source has no anchor the bbox centre is used and the record is flagged `f:1`.

## 9. Antimeridian and geometry safety

The ADM1 layer goes through **the same shared rasteriser** as the country layer (`ringsToSegments`), so the
antimeridian and chord-sag guarantees are structurally shared rather than reimplemented:

- every vertex is projected to a 3D unit vector **first** and interpolation is `slerp` — no longitude arithmetic
  exists anywhere, so a line straight across the Pacific is impossible by construction;
- each ring is an independent closed loop and rings are never concatenated, so two unrelated islands are never
  joined by a false straight segment;
- longest single source edge **16.47°**, subdivided at ≤2° → worst chord sag 0.00015, which is 20× under the
  0.0030 surface offset, so a border can never sink into the sphere and be wrongly occluded.

ADM1 sits at radius **1.0030**, *below* the country layer's 1.0035, so where a state border coincides with a
national border the national border is the one that wins the depth test.

## 10. What this asset is not

It is a **geographic reference only**. It is never a business coordinate, a warehouse identity, a route node or a
shipment location, and no writer, handler or DB schema reads it. It is **lazy-loaded** — same-origin, no CDN, no
fetch, no runtime network — only once the zoom level first calls for it, so it is never in the path of the
initial shipment workspace load.
