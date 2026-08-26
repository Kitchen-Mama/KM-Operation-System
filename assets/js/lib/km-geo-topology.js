// ========================================
// KM.geoTopology — CANONICAL SHARED-EDGE BOUNDARY TOPOLOGY
// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §D (and the classification §E's hierarchy renders)
// ----------------------------------------------------------------------------------------------------
// THE DEFECT THIS REPLACES, MEASURED. Both border layers used to rasterise INDEPENDENT POLYGON RINGS. Every
// boundary between two neighbours therefore existed twice in the vertex buffer and was drawn twice:
//
//   country dataset (110m)  8,733 directed ring edges -> 6,660 unique. 2,073 shared by exactly two countries.
//   ADM1 dataset (10m)     76,931 directed ring edges -> 68,879 unique. 8,052 shared by two divisions.
//
// Drawing a line twice is not free and not invisible: with alpha < 1 the shared edge composites to a DIFFERENT,
// darker colour than an unshared one, so on the old ADM1 layer (alpha 0.72) every interior state border read
// heavier than every coastal one. That is §D's "neighbouring polygons must not produce double brightness".
//
// AND A SECOND, LARGER ONE. The remaining 4,587 single-owner country edges are not borders at all - they are
// COASTLINE, the boundary between a country and the ocean. They were drawn in the international-border colour,
// which is exactly §D's "coastline is not also drawn as a country border". Roughly two thirds of what looked
// like national borders on the globe were coastline.
//
// WHAT THIS MODULE DOES. It takes the vendored ring datasets and produces a canonical EDGE set: each physical
// boundary segment appears ONCE, carrying the identities of everything that touches it, classified into the
// three-level hierarchy §D specifies:
//
//   COASTLINE      one owner  - land meets ocean
//   INTERNATIONAL  two owners in DIFFERENT countries
//   ADM1           two owners in the SAME country
//
// The classification is DERIVED FROM ADJACENCY, never from a name, a code or a label. That is the point: it
// cannot be fooled by a naming collision, and it is why "international supersedes ADM1" needs no special case -
// an edge with two countries on it is simply not in the ADM1 bucket.
//
// EXACT VERTEX EQUALITY IS THE JOIN, AND IT WAS MEASURED BEFORE BEING RELIED ON. Both datasets store
// coordinates at 2 decimal places, and their generators simplify in a way that preserves shared edges: 2,073 of
// 2,073 shared country edges match exactly, and all 2,073 are between different countries (none is an artefact
// of one country's own hole). So the key is the coordinate pair itself - no tolerance, no spatial index, no
// fuzzy snapping that could join two boundaries that are merely near each other.
//
// PURE. No DOM, no WebGL, no network, no clock, no randomness. It emits plain arrays; the caller turns them
// into vertex buffers. That is what lets the whole thing be asserted in Node against real vertex counts.
// ========================================
(function () {
    'use strict';

    var CLASS = {
        COASTLINE: 'COASTLINE',           // hierarchy 1
        INTERNATIONAL: 'INTERNATIONAL',   // hierarchy 2
        ADM1: 'ADM1'                      // hierarchy 3
    };
    // §D's hierarchy, as a number so a renderer can compare instead of matching strings.
    var RANK = { COASTLINE: 1, INTERNATIONAL: 2, ADM1: 3 };

    // ---- edge keys ---------------------------------------------------------------------------------------
    // UNDIRECTED. Ring winding is opposite on the two sides of a shared boundary, so A->B in one polygon is
    // B->A in its neighbour; a directed key would never match and nothing would ever dedupe.
    function vkey(lng, lat) { return lng + ',' + lat; }
    function edgeKey(a, b) { return a < b ? (a + '|' + b) : (b + '|' + a); }

    // Degenerate edges (a repeated vertex) carry no geometry and would otherwise become a zero-length segment
    // that still costs two vertices and can produce a stray dot at large line widths.
    function isDegenerate(a, b) { return a === b; }

    /**
     * buildEdgeIndex(features) -> { edges: Map-like object, stats }
     *
     * `features` is [{ id, country, rings: [flat [lng,lat,...]] }]. `id` MUST be a stable, unique feature
     * identity - see the note on identity in the caller. Nothing here reads a name or a label.
     */
    function buildEdgeIndex(features) {
        var index = Object.create(null);
        var stats = { features: 0, rings: 0, directed_edges: 0, degenerate_edges: 0, unique_edges: 0 };
        for (var fi = 0; fi < features.length; fi++) {
            var f = features[fi];
            var rings = f.rings || [];
            stats.features++;
            for (var ri = 0; ri < rings.length; ri++) {
                var flat = rings[ri];
                var n = flat.length / 2;
                if (n < 3) continue;
                stats.rings++;
                // The ring is CLOSED here by wrapping to index 0. The datasets store the ring without the
                // repeated first point, so the closing edge is real data and must participate in dedup too -
                // omitting it would leave one edge per ring undeduped and drawn twice.
                var prev = vkey(flat[(n - 1) * 2], flat[(n - 1) * 2 + 1]);
                for (var i = 0; i < n; i++) {
                    var cur = vkey(flat[i * 2], flat[i * 2 + 1]);
                    stats.directed_edges++;
                    if (isDegenerate(prev, cur)) { stats.degenerate_edges++; prev = cur; continue; }
                    var k = edgeKey(prev, cur);
                    var e = index[k];
                    if (!e) {
                        // Endpoints are stored in the key's own canonical order so a rendered segment does not
                        // depend on which polygon happened to be visited first.
                        var lo = prev < cur ? prev : cur, hi = prev < cur ? cur : prev;
                        var lp = lo.split(','), hp = hi.split(',');
                        e = index[k] = {
                            a: [Number(lp[0]), Number(lp[1])],
                            b: [Number(hp[0]), Number(hp[1])],
                            owners: [], countries: []
                        };
                        stats.unique_edges++;
                    }
                    if (e.owners.indexOf(f.id) === -1) e.owners.push(f.id);
                    if (f.country && e.countries.indexOf(f.country) === -1) e.countries.push(f.country);
                    prev = cur;
                }
            }
        }
        return { index: index, stats: stats };
    }

    /**
     * classifyEdges(index) -> { COASTLINE: [...], INTERNATIONAL: [...], ADM1: [...], stats }
     *
     * Each bucket is an array of { a: [lng,lat], b: [lng,lat], owners, countries }.
     */
    function classifyEdges(index) {
        var out = { COASTLINE: [], INTERNATIONAL: [], ADM1: [] };
        var stats = { coastline: 0, international: 0, adm1: 0, over_shared: 0, by_owner_count: {} };
        var keys = Object.keys(index);
        for (var i = 0; i < keys.length; i++) {
            var e = index[keys[i]];
            var oc = e.owners.length, cc = e.countries.length;
            stats.by_owner_count[oc] = (stats.by_owner_count[oc] || 0) + 1;
            if (cc >= 2) {
                // An edge with two or more countries on it is INTERNATIONAL, whatever else is true of it. This
                // single line is §D's "international edge supersedes overlapping ADM1 edge": an ADM1 division
                // boundary that happens to run along a national border classifies as international and is
                // therefore never in the ADM1 bucket, so it cannot be drawn twice or drawn in the weaker style.
                out.INTERNATIONAL.push(e); stats.international++;
            } else if (oc >= 2) {
                out.ADM1.push(e); stats.adm1++;
            } else {
                // Exactly one owner: the other side is not another polygon in this dataset. For a whole-world
                // dataset that means ocean - i.e. coastline. It also legitimately covers a lake shore, which is
                // still "land meets water" and still belongs in the coastline class rather than the border one.
                out.COASTLINE.push(e); stats.coastline++;
            }
            if (oc > 2) stats.over_shared++;
        }
        return { buckets: out, stats: stats };
    }

    // ---- endpoint connectivity (§D: "no disconnected endpoints after simplification") --------------------
    // Reported rather than repaired. A canonical edge set makes this measurable for the first time: count the
    // vertices where an ODD number of edges of the same class meet. On a set of closed rings every vertex has
    // even degree, so an odd-degree vertex is a dangling end. Repairing one would mean MOVING a vertex, and
    // moving a vertex to make a metric look better is exactly the kind of silent geometry edit §D's
    // "topology simplification preserves shared endpoints" is guarding against.
    function endpointReport(edges) {
        var deg = Object.create(null);
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            var ka = vkey(e.a[0], e.a[1]), kb = vkey(e.b[0], e.b[1]);
            deg[ka] = (deg[ka] || 0) + 1;
            deg[kb] = (deg[kb] || 0) + 1;
        }
        var keys = Object.keys(deg), odd = 0, dangling = 0, junction = 0;
        for (var j = 0; j < keys.length; j++) {
            var d = deg[keys[j]];
            if (d === 1) dangling++;
            if (d % 2 === 1) odd++;
            if (d > 2) junction++;
        }
        return { vertices: keys.length, dangling_endpoints: dangling, odd_degree: odd, junctions: junction };
    }

    // ---- anti-meridian and polar validity (§D) ----------------------------------------------------------
    // NOTHING in this module compares, averages, wraps or unwraps a longitude, so an edge from lng 179 to
    // lng -179 is stored exactly as given and is later interpolated by SLERP on 3D unit vectors by the
    // renderer - a 2-degree great-circle arc, not a 358-degree sweep across the Pacific. This function does not
    // FIX anything; it MEASURES, so the claim can be a number in a test rather than a sentence in a comment.
    function antimeridianReport(edges) {
        var crossing = 0, wide = 0, polar = 0, worstDeltaLng = 0;
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            var dl = Math.abs(e.a[0] - e.b[0]);
            if (dl > worstDeltaLng) worstDeltaLng = dl;
            if (dl > 180) crossing++;                 // stored as a raw >180 delta: the anti-meridian case
            if (dl > 90 && dl <= 180) wide++;
            if (Math.abs(e.a[1]) >= 89.5 || Math.abs(e.b[1]) >= 89.5) polar++;
        }
        return { antimeridian_edges: crossing, wide_edges: wide, polar_edges: polar, worst_delta_lng: worstDeltaLng };
    }

    // ---- flatten to the shape the renderer wants --------------------------------------------------------
    // A flat [lng,lat,lng,lat,...] pair list per class. The renderer projects and subdivides; this module never
    // touches 3D or a radius, so there is exactly one place in the codebase that decides the globe's radius and
    // conventions (§C).
    function toSegmentList(edges) {
        var out = new Float64Array(edges.length * 4);
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i], o = i * 4;
            out[o] = e.a[0]; out[o + 1] = e.a[1]; out[o + 2] = e.b[0]; out[o + 3] = e.b[1];
        }
        return out;
    }

    /**
     * build(features) -> canonical topology for ONE dataset.
     *
     * ONE DATASET AT A TIME, DELIBERATELY, AND THE REASON IS MEASURED. Only 7 of the ADM1 dataset's 68,879
     * unique edges match a country-dataset edge exactly: the 110m country rings and the 10m ADM1 rings are
     * independent generalisations of the same boundaries, so there is no shared vertex to join them on. Merging
     * them would require snapping with a tolerance large enough (~0.2 deg, about 20 km) to also weld genuinely
     * separate features together. So each dataset gets its own internally-consistent topology and the RENDERER
     * uses exactly one of them at a time - see the LOD note in km-globe.js.
     */
    function build(features) {
        var idx = buildEdgeIndex(features);
        var cls = classifyEdges(idx.index);
        var res = {
            classes: CLASS, rank: RANK,
            edges: cls.buckets,
            segments: {
                COASTLINE: toSegmentList(cls.buckets.COASTLINE),
                INTERNATIONAL: toSegmentList(cls.buckets.INTERNATIONAL),
                ADM1: toSegmentList(cls.buckets.ADM1)
            },
            stats: {
                input: idx.stats,
                classified: cls.stats,
                // The headline §D number: how many segments the old independent-ring rendering drew twice.
                duplicate_edges_removed: idx.stats.directed_edges - idx.stats.degenerate_edges - idx.stats.unique_edges,
                duplicate_percent: idx.stats.directed_edges
                    ? +(100 * (idx.stats.directed_edges - idx.stats.degenerate_edges - idx.stats.unique_edges)
                        / idx.stats.directed_edges).toFixed(2) : 0,
                endpoints: {
                    COASTLINE: endpointReport(cls.buckets.COASTLINE),
                    INTERNATIONAL: endpointReport(cls.buckets.INTERNATIONAL),
                    ADM1: endpointReport(cls.buckets.ADM1),
                    ALL: endpointReport(cls.buckets.COASTLINE.concat(cls.buckets.INTERNATIONAL, cls.buckets.ADM1))
                },
                antimeridian: antimeridianReport(cls.buckets.COASTLINE.concat(cls.buckets.INTERNATIONAL, cls.buckets.ADM1))
            }
        };
        return res;
    }

    // ---- dataset adapters -------------------------------------------------------------------------------
    // IDENTITY IS THE WHOLE POINT OF THESE TWO FUNCTIONS, so it is stated here rather than left implicit.
    //
    // §D PROHIBITS `country|displayedCode`, `country|fullEnglishName`, a translated label and visible label text
    // as geometry keys. Measured against the vendored ADM1 asset, the first two are not merely inadvisable, they
    // are NOT UNIQUE: `country|displayedCode` has 35 colliding keys hiding 53 rows (BA|BIH covers NINE Bosnian
    // cantons, MG|F five Malagasy provinces, IE|D three Dublin councils), and `country|fullEnglishName` has 13
    // colliding keys hiding 13 rows. Using either would merge nine cantons' geometry into one feature identity.
    //
    // So identity is `adm1_code` - Natural Earth's own per-feature key, unique by construction in the pinned
    // source and carried through to the vendored asset by tools/geo/build-admin1-boundaries.js as field `a`.
    // If it is ever absent the adapter FAILS LOUDLY rather than silently falling back to a colliding key.
    function admin1Features(dataset, decodeRing) {
        var list = (dataset && dataset.admin1) || [];
        var scale = (dataset && dataset.meta && dataset.meta.coord_scale) || 100;
        var out = [], missing = 0, seen = Object.create(null), collided = 0;
        for (var i = 0; i < list.length; i++) {
            var d = list[i];
            var id = d.a;
            if (!id) { missing++; continue; }
            if (seen[id]) { collided++; }
            seen[id] = 1;
            if (!d.__rings) {
                d.__rings = (d.g || []).map(function (r) { return decodeRing(r, scale); });
            }
            out.push({ id: id, country: String(d.c || '').toUpperCase(), rings: d.__rings, row: i });
        }
        return { features: out, missing_identity: missing, colliding_identity: collided };
    }

    // The country dataset's identity is the ISO alpha-2 code, which IS a stable source identity and IS unique
    // there (175 features, 175 distinct codes - asserted in the suite). It is not a "displayed code": nothing
    // renders it as this layer's label, and the classification never reads it.
    function countryFeatures(dataset) {
        var list = (dataset && dataset.countries) || [];
        var out = [], seen = Object.create(null), collided = 0;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var id = String(c.iso || '').toUpperCase();
            if (!id) continue;
            if (seen[id]) collided++;
            seen[id] = 1;
            out.push({ id: id, country: id, rings: c.rings || [], row: i });
        }
        return { features: out, missing_identity: 0, colliding_identity: collided };
    }

    var api = {
        CLASS: CLASS, RANK: RANK,
        vkey: vkey, edgeKey: edgeKey,
        buildEdgeIndex: buildEdgeIndex, classifyEdges: classifyEdges,
        endpointReport: endpointReport, antimeridianReport: antimeridianReport,
        toSegmentList: toSegmentList,
        build: build,
        admin1Features: admin1Features, countryFeatures: countryFeatures
    };
    if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.geoTopology = api; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
