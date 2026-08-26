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


---

# Traditional Chinese geographic name asset — provenance, licence and deterministic regeneration

**Task:** MAP-VISUAL-REAL-EARTH-TEXTURE-3 (localization authority decision) · **Recorded:** 2026-08-26
**Produced asset:** `assets/js/data/geo-names-zh-hant.js` (sets `window.KM_GEO_NAMES_ZH_HANT`)
**Generator:** `tools/geo/build-geo-names-zh-hant.js`
**Consumer:** `assets/js/core/geo-name-resolver.js` (`window.KM.geoNames`)

## 1. Scope — NAMES ONLY

This asset carries **no ring, no coordinate and no label anchor**. The localization authority requires that the
new source "supplies names only; it must not replace geometry or coordinates" and that the existing Natural Earth
geometry and label anchors are preserved.

Keeping the names in a **separate file** is what makes that verifiable rather than asserted: the three geometry
assets (`world-land-110m.js`, `world-countries-110m.js`, `world-admin1-10m.js`) are **not regenerated and not
modified**, so a diff of them is empty by construction. The regression suite asserts that emptiness.

## 2. Sources

| purpose | source | field | licence |
| --- | --- | --- | --- |
| Country names | Natural Earth v5.1.2 `ne_110m_admin_0_countries` | `NAME_ZHT` | Public domain |
| ADM1 names | Natural Earth v5.1.2 `ne_10m_admin_1_states_provinces` | `name_zht` | Public domain |
| Script test | Unicode 15.1.0 Unihan | `kTraditionalVariant` | Unicode License v3 |
| Continent names | hand-reviewed 7-name list, vendored in the generator | — | authored here |

| input | URL | SHA-256 | size |
| --- | --- | --- | --- |
| admin-0 | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson` | `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` | 838,726 B · 177 features |
| admin-1 | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson` | `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5` | 40,726,851 B · 4,596 features |
| Unihan | `https://www.unicode.org/Public/15.1.0/ucd/Unihan.zip` | `a0226610e324bcf784ac380e11f4cbf533ee1e6b3d028b0991bf8c0dc3f85853` | 7,999,959 B |

Raw inputs are **not vendored** (41 MB the runtime never loads). The generator **re-verifies both Natural Earth
checksums at build time and aborts on a mismatch**, so the output is reproducible and the pins are not decorative.

Unicode licence: <https://www.unicode.org/license.txt>. Natural Earth terms: public domain, attribution not
required — <https://www.naturalearthdata.com/about/terms-of-use/>.

## 3. `NAME_ZHT` was VERIFIED Traditional, not assumed

The authority decision is explicit that `NAME_ZH` must not be treated as Traditional merely because it is
Chinese, and that level 1 applies only "if you confirm the exact field exists and is Traditional Chinese rather
than Simplified Chinese". Measured across all 177 admin-0 features:

| field | present | Simplified-only characters | Traditional-only characters |
| --- | --- | --- | --- |
| `NAME_ZH` | 177/177 | 152 | 0 |
| `NAME_ZHT` | 177/177 | **0** | **155** |

138 rows differ between the two. Zero counter-examples. The values also follow **Taiwan naming convention**, not
merely converted mainland forms: 坦尚尼亞 (not 坦桑尼亞), 紐幾內亞, 索馬利亞, 肯亞, 查德, 多明尼加, 哈薩克.

**Consequence: no CLDR mapping was vendored.** Authority level 1 covers all 175 ISO-coded countries, so level 2
(vendored CLDR `zh-Hant`) is wired in the resolver but empty.

`name_zht` at ADM1 level is **NOT** uniformly Traditional — it is MIXED (3,967 Traditional-only characters but
**567 Simplified-only characters still present**, e.g. `阿里卡和帕里纳科塔大区`). It is therefore accepted **per
division**, never as a whole field.

## 4. The script test — two pinned sources that must AGREE

Deciding "is this string fully Traditional?" is **detection only**. Nothing converts a character: converting
would be the translation the authority forbids, and it is unsafe in principle (干 → 幹 or 乾 by sense).

Each source alone is **measurably wrong** for this question:

- **Unihan `kTraditionalVariant` alone is too broad.** It records that a character is the Simplified form of
  something *in some sense*, so it flags 里 (裏/裡), 谷 (穀), 克, 蒙, 干, 千, 合 — all ordinary Traditional
  characters. Measured: it rejected **18 of 177** plainly-Traditional country names, including 薩爾瓦多 and 貝里斯.
- **The Natural Earth `name_zh`/`name_zht` corpus alone is too noisy.** It mixes script conversion with
  *translation* differences (坦桑尼亞 → 坦尚尼亞 is both). Measured: it rejected 新疆維吾爾自治區 and 薩爾瓦多.
- **A hand-typed character list was wrong in both directions** and was discarded: it wrongly flagged 里, 谷 and 雅.

**The test used:** a character is Simplified-only iff Unihan gives it a distinct `kTraditionalVariant` **and** the
Natural Earth corpus converted it at least once and **never** left it in place in a row it did convert. 里 fails
the second half (the corpus keeps it 121×); 區 passes both.

Result: **214 characters**, 6 contested characters excluded. **0 false positives** across a 15-character control
set (里 谷 雅 薩 疆 努 克 蒙 干 千 合 胡 爾 國 區), and **all 18** control Simplified characters caught.

The test is conservative in the **safe** direction: a false positive costs a fallback to English, which the
authority permits. It can never emit a wrong Chinese name.

## 5. Coverage

| class | accepted Traditional | falls back |
| --- | --- | --- |
| Countries (ISO a2) | **175 / 175 (100%)** | 0 |
| Continents | 7 named | 1 deliberately unnamed → hidden |
| ADM1 divisions | **3,479 / 3,835 (90.7%)** | 356 |

ADM1 join rate against the vendored asset: **3,835 / 3,835 (100%)** — every division resolved to a source row.

Per-country ADM1 coverage is 100% for TW · CN · HK · MO · JP · KR · DE · AU · CA · VN · TH · MY; 96–97% for
US · GB · IN · MX; and lowest in Latin America, Indonesia and the Benelux (SG 40%, ID 58%, BR 59%). Missing ADM1
Chinese coverage is explicitly allowed to fall back and **must not block the country/continent layer**.

The eighth Natural Earth `CONTINENT` value, `Seven seas (open ocean)`, is **not a continent** and is deliberately
given no name, so it is **hidden** rather than mislabelled — the authority's own instruction for that case.

## 6. Why ADM1 names are keyed by NAME, not by the displayed code

`country|displayedCode` is **measurably not unique** in `world-admin1-10m.js`: **35 keys collide across 53 rows**,
and the collisions are not harmless duplicates —

- `BA|BIH` covers **nine different Bosnian cantons**;
- `IE|D` covers three Dublin councils;
- `CO|CUN` conflates **Bogotá with Cundinamarca**.

Keying names on that would hand nine cantons one canton's name. Names are therefore keyed
`<ISO a2>|<full English name, lowercased>`, which collides on only **13 rows** — every one a case where the
English name genuinely repeats inside a country (AF Parwan ×2, LV Daugavpils ×2), so one Chinese name is the
correct answer for all of them.

**This is a PRE-EXISTING defect of the displayed-code label layer, not of this asset:** nine cantons currently
render the same visible code on the globe. It is **reported here and not silently repaired**, because coastline /
boundary / deduplication behaviour belongs to the boundary-topology addendum.

## 7. Long formal country names — recorded, not shortened

Eleven `NAME_ZHT` values are **formal long names** rather than the short form a map label usually carries:

`朝鮮民主主義人民共和國` (11) · `波士尼亞與赫塞哥維納` (10) · `法屬南部和南極領地` (9) ·
`阿拉伯聯合大公國` (8) · `剛果民主共和國` · `中華人民共和國` · `巴布亞紐幾內亞` · `千里達及托巴哥` (7) ·
`新喀里多尼亞` · `巴勒斯坦地區` · `沙烏地阿拉伯` (6)

The asset records each with its character count and **makes no shortening decision and invents no name**. Whether
a globe label shows the formal or a short form is a label-**content** decision for the label-hierarchy addendum,
not a name-**source** decision.

## 8. Regeneration (deterministic)

```sh
curl -sSL -o ne_110m_admin_0_countries.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
curl -sSL -o ne_10m_admin_1_states_provinces.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
curl -sSL -o Unihan.zip https://www.unicode.org/Public/15.1.0/ucd/Unihan.zip
unzip -o Unihan.zip Unihan_Variants.txt

node tools/geo/build-geo-names-zh-hant.js \
  ne_110m_admin_0_countries.geojson ne_10m_admin_1_states_provinces.geojson Unihan_Variants.txt
```

No clock, no randomness, no network, no filesystem discovery; every map is emitted with keys sorted ascending, so
two runs on the same inputs produce a byte-identical file.

## 9. Runtime posture

Loaded **eagerly** as a same-origin `<script>` (93,786 B) beside the country geometry it names, because country
labels are needed at LOD 0 — a lazy path would flash ISO codes before the Chinese names arrived. The 538 KB ADM1
**geometry** stays lazy-loaded and unchanged.

**No runtime translation. No remote naming API. No CDN. No runtime fetch. No Google Maps data.** The only name
source at runtime is this vendored asset.
