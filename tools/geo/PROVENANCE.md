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
