// km-globe.js — self-contained WebGL 3D Earth engine (no external CDN, no runtime network).
//
// Renders a REAL sphere: a UV-sphere mesh textured with a land/ocean earth image that is rasterized at
// runtime from the vendored Natural Earth land outline (window.KM_WORLD_LAND, loaded as a same-origin
// <script>). Supports pointer-drag rotation, wheel/keyboard/button zoom, geographic markers (with
// back-hemisphere occlusion via the depth buffer), great-circle route arcs, focus-to-coordinate, and
// resize. There is NO 2D fallback inside this engine: if WebGL or the land asset is unavailable it calls
// opts.onError(kind,msg) and returns null so the caller can show an explicit, honest error — never a blue
// grid masquerading as Earth.
//
// Public API (window.KMGlobe):
//   KMGlobe.isSupported() -> bool
//   KMGlobe.create(container, opts) -> instance | null
//     opts: { onError(kind,msg), onMarkerClick(id), onMarkerHover(id|null), reducedMotion }
//   instance: setMarkers(list), setArcs(list), focus(lat,lng[,opts]), overview(), resize(),
//             getStatus(), destroy()
//   KMGlobe.math -> pure functions (unit-tested in assets/tests/globe-math.test.js)
//
// Markers: [{ id, lat, lng, color:[r,g,b], size, ring:bool }] (r/g/b 0..1). lat/lng must be finite; the
// caller is responsible for never passing fabricated (0,0). Arcs: [{ points:[[lat,lng],...], color:[r,g,b] }].

(function () {
  'use strict';

  var DEG = Math.PI / 180;

  // ---------------- pure math (exposed for tests) ----------------
  function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  // column-major 4x4 multiply: returns a*b (apply b first, then a)
  function mat4Mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }
  function mat4Perspective(fovyRad, aspect, near, far) {
    var f = 1 / Math.tan(fovyRad / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function mat4Translate(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function mat4RotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function mat4RotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  // Apply a column-major mat4 to a vec3 (w=1); returns {x,y,z,w}.
  function mat4Apply(m, v) {
    return {
      x: m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
      y: m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
      z: m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
      w: m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15]
    };
  }
  // lat/lng (deg) -> unit-sphere xyz. Convention: (0,0) faces +Z (toward the camera at rest).
  function latLngToVec3(lat, lng, r) {
    r = (r == null) ? 1 : r;
    var phi = lat * DEG, lam = lng * DEG, cp = Math.cos(phi);
    return [r * cp * Math.sin(lam), r * Math.sin(phi), r * cp * Math.cos(lam)];
  }
  // Model rotation that brings (lat,lng) to face the camera. M = rotX(pitch)*rotY(yaw).
  function focusAngles(lat, lng) { return { yaw: -lng * DEG, pitch: lat * DEG }; }
  function modelMatrix(yaw, pitch) { return mat4Mul(mat4RotX(pitch), mat4RotY(yaw)); }
  // slerp between two unit vec3 (t 0..1) — great-circle interpolation for arcs.
  function slerp(a, b, t) {
    var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    dot = Math.max(-1, Math.min(1, dot));
    var th = Math.acos(dot);
    if (th < 1e-6) return [a[0], a[1], a[2]];
    var s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
    return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
  }
  // World point -> screen pixel + visibility. modelZ>0 means front hemisphere (not occluded by the sphere).
  function projectToScreen(mvp, model, v3, width, height) {
    var clip = mat4Apply(mvp, v3);
    if (clip.w <= 1e-6) return null;
    var mv = mat4Apply(model, v3);
    return {
      x: (clip.x / clip.w * 0.5 + 0.5) * width,
      y: (1 - (clip.y / clip.w * 0.5 + 0.5)) * height,
      front: mv.z > 0.02
    };
  }


  // ==============================================================================================================
  // F1-7N-MAP-COUNTRY-BOUNDARY-1 — COUNTRY BOUNDARY + ISO LABEL LAYER (pure, deterministic, no GL, no DOM).
  //
  // GEOGRAPHIC REFERENCE ONLY. Nothing in this block reads, writes or derives a shipment, route, event, marker or
  // warehouse coordinate. It consumes the vendored public-domain dataset (window.KM_WORLD_COUNTRIES) and produces
  // a static line buffer plus a screen-space label selection. A regression suite executes these functions.
  // ==============================================================================================================

  // Just above the sphere (r=1) and BELOW the arcs (1.006) and markers (1.012), so the depth test alone makes the
  // boundaries subordinate, occluded on the far side, and never in front of a route or a pin.
  var COUNTRY_R = 1.0035;
  // Longer segments are subdivided along the GREAT CIRCLE. Two reasons, both measured against this dataset:
  //   · SAG. The dataset's longest single edge is ~18 deg (a simplified US ring). A straight chord across 18 deg
  //     sags 1-cos(9deg) = 0.0123 below the surface — nearly 4x the 0.0035 offset, so it would sink INTO the
  //     sphere and be occluded. At 2 deg the worst sag is 0.00015, which is 23x under the offset.
  //   · ANTIMERIDIAN. Subdivision is done by slerp on 3D unit vectors, so no longitude arithmetic happens
  //     anywhere. See the note on buildCountrySegments.
  var COUNTRY_MAX_SEG_DEG = 2;
  var COUNTRY_COLOR = [0.38, 0.45, 0.56];   // muted slate: legible over ocean AND land, clearly subordinate to
                                            // the cyan route arcs and the coloured shipment markers.

  // Build the STATIC gl.LINES vertex array for every country ring. Called ONCE per globe instance (and again only
  // on a GL context restore) — never per frame.
  //
  // ANTIMERIDIAN SAFETY IS STRUCTURAL, NOT A SPECIAL CASE. Every vertex is projected to a 3D unit vector FIRST,
  // and interpolation is slerp between those vectors. No code here averages, wraps, unwraps or compares
  // longitudes, so the classic "line straight across the Pacific" cannot be produced: two points at lng 179 and
  // lng -179 are 2 deg apart in 3D and slerp takes that short path. The dataset contains the definitive case —
  // Antarctica has a consecutive pair (180,-90) -> (-180,-90), a 360 DEGREE longitude jump that is a 0.000 degree
  // great-circle arc, because both points are the south pole.
  //
  // RINGS ARE NEVER JOINED. Each ring emits its own closed loop of independent gl.LINES pairs, so two unrelated
  // islands of one MultiPolygon country are never connected by a false straight border segment.
  // THE SHARED RING RASTERISER. Both the country layer and the ADM1 layer go through this one function, so the
  // antimeridian and sag guarantees above are STRUCTURALLY shared rather than reimplemented (and re-broken) per
  // layer. `ringsOf(item)` lets each dataset keep its own storage shape.
  function ringsToSegments(list, ringsOf, r, maxSegDeg, col, alpha) {
    var maxSeg = maxSegDeg * DEG;
    var a4 = alpha == null ? 1 : alpha;
    var out = [], ringCount = 0, segmentCount = 0, maxArc = 0;
    for (var ci = 0; ci < list.length; ci++) {
      var rings = ringsOf(list[ci]) || [];
      for (var ri = 0; ri < rings.length; ri++) {
        var flat = rings[ri];
        var n = flat.length / 2;
        if (n < 3) continue;
        ringCount++;
        // Pre-project the whole ring once; the closing edge reuses index 0, which is what closes the loop.
        var v = new Array(n);
        for (var i = 0; i < n; i++) v[i] = latLngToVec3(flat[i * 2 + 1], flat[i * 2], 1);
        for (var a = 0; a < n; a++) {
          var A = v[a], B = v[(a + 1) % n];
          var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
          if (dot > 1) dot = 1; else if (dot < -1) dot = -1;
          var th = Math.acos(dot);
          if (th > maxArc) maxArc = th;
          if (th < 1e-9) continue;                       // duplicate / pole-collapsed pair: no segment at all
          var steps = Math.ceil(th / maxSeg); if (steps < 1) steps = 1;
          for (var sIdx = 0; sIdx < steps; sIdx++) {
            var p1 = slerp(A, B, sIdx / steps), p2 = slerp(A, B, (sIdx + 1) / steps);
            out.push(p1[0] * r, p1[1] * r, p1[2] * r, col[0], col[1], col[2], a4);
            out.push(p2[0] * r, p2[1] * r, p2[2] * r, col[0], col[1], col[2], a4);
            segmentCount++;
          }
        }
      }
    }
    return {
      positions: new Float32Array(out),
      vertexCount: out.length / 7,
      segmentCount: segmentCount,
      ringCount: ringCount,
      maxSourceArcDeg: maxArc / DEG,
      radius: r,
      maxSegmentDeg: maxSegDeg
    };
  }

  function buildCountrySegments(dataset, opts) {
    opts = opts || {};
    var list = (dataset && dataset.countries) || [];
    var info = ringsToSegments(list, function (c) { return c.rings; },
      opts.radius || COUNTRY_R, opts.maxSegmentDeg || COUNTRY_MAX_SEG_DEG, opts.color || COUNTRY_COLOR, 1);
    info.countryCount = list.length;
    return info;
  }

  // ==============================================================================================================
  // MAP-VISUAL-REAL-EARTH-LOD-1 §E/§F — ADM1 (first-level administrative division) layer.
  // ==============================================================================================================
  // The ADM1 asset stores each ring as a zigzag-varint STRING rather than a coordinate array, because the plain
  // form measured 2.2 MB against 0.54 MB encoded. This decoder is the exact inverse of `encodeRing` in
  // tools/geo/build-admin1-boundaries.js, and the generator runs a full round-trip self-check at build time so
  // the two can never disagree about a single vertex.
  var ADMIN1_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var ADMIN1_ALPHA_IDX = (function () { var m = {}; for (var i = 0; i < ADMIN1_ALPHABET.length; i++) m[ADMIN1_ALPHABET.charAt(i)] = i; return m; })();
  // Returns a FLAT [lng,lat,lng,lat,...] ring — the same shape the country dataset stores directly, so the
  // shared rasteriser above consumes both without a special case.
  function decodeAdmin1Ring(str, scale) {
    scale = scale || 100;
    var out = [], x = 0, y = 0, i = 0, n = str.length;
    while (i < n) {
      var shift = 1, res = 0, c, d;
      for (;;) { c = ADMIN1_ALPHA_IDX[str.charAt(i++)]; d = c & 31; res += d * shift; if (!(c & 32)) break; shift *= 32; }
      x += (res % 2) ? -((res + 1) / 2) : (res / 2);
      shift = 1; res = 0;
      for (;;) { c = ADMIN1_ALPHA_IDX[str.charAt(i++)]; d = c & 31; res += d * shift; if (!(c & 32)) break; shift *= 32; }
      y += (res % 2) ? -((res + 1) / 2) : (res / 2);
      out.push(x / scale, y / scale);
    }
    return out;
  }

  var ADMIN1_R = 1.0030;   // BELOW the country radius, so where a state border coincides with a national border
                           // the NATIONAL border is the one that wins the depth test — §G's visual hierarchy.
  var ADMIN1_MAX_SEG_DEG = 2;
  var ADMIN1_COLOR = [0.30, 0.36, 0.45];   // dimmer than COUNTRY_COLOR: present, clearly subordinate.
  var ADMIN1_ALPHA = 0.72;

  // Decode + rasterise every division. Called ONCE (and again only on a GL context restore) — never per frame.
  function buildAdmin1Segments(dataset, opts) {
    opts = opts || {};
    var list = (dataset && dataset.admin1) || [];
    var scale = (dataset && dataset.meta && dataset.meta.coord_scale) || 100;
    var only = opts.countries || null;           // optional ISO alpha-2 allow-list (low-capability degradation)
    var use = only ? list.filter(function (d) { return only.indexOf(d.c) !== -1; }) : list;
    var info = ringsToSegments(use, function (d) {
      // decode lazily and cache on the record, so a rebuild after a context loss costs no second decode
      if (!d.__rings) { d.__rings = (d.g || []).map(function (r) { return decodeAdmin1Ring(r, scale); }); }
      return d.__rings;
    }, opts.radius || ADMIN1_R, opts.maxSegmentDeg || ADMIN1_MAX_SEG_DEG, opts.color || ADMIN1_COLOR,
      opts.alpha == null ? ADMIN1_ALPHA : opts.alpha);
    info.divisionCount = use.length;
    info.countryCount = (function () { var m = {}; use.forEach(function (d) { m[d.c] = 1; }); return Object.keys(m).length; })();
    return info;
  }

  // ---- LOD (§E) -------------------------------------------------------------------------------------------
  // cam.dist runs MIN_D 1.35 (close) .. MAX_D 5.0 (far), so LOD rises as distance falls.
  //   LOD 0  global      — coastlines + national outlines + ISO country codes only
  //   LOD 1  medium      — same, plus ADM1 geometry begins to fade in for what is actually on screen
  //   LOD 2  country      — ADM1 outlines + authoritative division codes
  //   LOD 3  close        — more division codes admitted
  var LOD_THRESHOLDS = [2.60, 1.95, 1.62];
  // HYSTERESIS. Each boundary is widened in the direction of travel, giving a 2*LOD_HYSTERESIS dead band: to
  // LEAVE a level the camera must pass the boundary by the margin, not merely touch it. Without this a camera
  // resting exactly on a threshold flips the ADM1 layer on and off on every frame of a slow zoom — the flicker
  // §E forbids. It is a pure function of (distance, previous level): no clock, no counter, no random.
  var LOD_HYSTERESIS = 0.08;
  function lodForDistance(dist, prevLod) {
    var prev = prevLod | 0, lod = 0;
    for (var i = 0; i < LOD_THRESHOLDS.length; i++) {
      var bound = LOD_THRESHOLDS[i] + (prev > i ? LOD_HYSTERESIS : -LOD_HYSTERESIS);
      if (dist > bound) break;
      lod = i + 1;
    }
    return lod;
  }
  // A layer mode is 'auto' | 'on' | 'off'. AUTO is what §G asks the default user to get: correct without touching
  // a control. ADM1 geometry starts one level earlier than ADM1 text, so borders establish the shape before the
  // labels arrive rather than everything appearing at once.
  // BOTH start at LOD 2, and that is a deliberate reading of §E rather than an omission. §E.1 allows ADM1
  // geometry to begin fading in at LOD 1, but only for "the important divisions of the currently visible area",
  // and it forbids ever stuffing every division onto the screen at once. At LOD 1 the camera still sees most of
  // a hemisphere, and this dataset holds 3,835 divisions / 76.8k segments worldwide; drawing them there would be
  // precisely the wall of lines §E.1 rules out, and restricting to "the visible area" would need a per-frame
  // point-in-polygon pass that §H.1 forbids. So ADM1 appears at LOD 2 — the "zoomed into one country" level §E.2
  // actually describes — and the gradual part of the progression is carried by the LABEL BUDGET (22 at LOD 2,
  // 42 at LOD 3) plus the caller-driven country restriction, neither of which costs a per-frame test.
  var ADMIN1_BORDER_MIN_LOD = 2;
  var ADMIN1_LABEL_MIN_LOD = 2;
  function layerVisible(mode, lod, minLod) {
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return lod >= minLod;
  }
  // How many ADM1 labels may be admitted at this level. §E: "must not instantly stuff every division and its
  // text onto the screen"; the cap is the blunt guarantee behind the collision pass.
  function admin1LabelBudget(lod) { return lod >= 3 ? 42 : (lod >= 2 ? 22 : 0); }

  // SCALE-AWARE VISIBILITY. cam.dist runs 1.35 (close) .. 5.0 (far). Natural Earth's LABELRANK (2 = a major
  // country, 7 = a minor one) is the dataset's OWN priority field, so the tiers are read from the data rather
  // than invented here. A priority country (an active shipment's country) ignores the tier entirely.
  function countryLabelTier(dist) {
    // The tiers are chosen from the dataset's ACTUAL rank distribution (rank<=2 is 36 countries, <=4 is 125,
    // all is 175), not from a guess. Zoomed out the layer must stay a REFERENCE: a full globe carrying 64 labels
    // is a wall of text that obscures exactly the route arcs and markers this layer is meant to sit behind.
    if (dist > 2.6) return 2;    // zoomed out: the 36 majors only (plus any priority country, which ignores the tier)
    if (dist > 1.9) return 4;    // medium: 125
    return 99;                   // close: every label that survives collision
  }

  // DETERMINISTIC PRIORITY (§G). Lower is more important:
  //   0 origin / destination / current country of an ACTIVE shipment
  //   1 country of the SELECTED shipment
  //   2 country containing a visible shipment node
  //   3 configured high-priority country
  //   4 everything else
  function countryPriorityOf(iso, pri) {
    pri = pri || {};
    function has(k) { var a = pri[k]; return !!(a && a.indexOf && a.indexOf(iso) !== -1); }
    if (has('active')) return 0;
    if (has('selected')) return 1;
    if (has('nodes')) return 2;
    if (has('high')) return 3;
    return 4;
  }

  // Total order: priority, then the dataset's LABELRANK, then ISO ascending. ISO is the final tie-break, so the
  // winner between two colliding labels never depends on array order, screen position, or time — which is what
  // stops labels swapping back and forth while the globe rotates. Nothing here consults a clock or a PRNG.
  function orderLabelCandidates(cands) {
    return cands.slice().sort(function (a, b) {
      return (a.priority - b.priority) || (a.rank - b.rank) || (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);
    });
  }

  function rectsOverlap(a, b) {
    return !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
  }

  // Greedy collision suppression in the total order above. A label is HIDDEN, never moved: §G forbids nudging a
  // geographic anchor to dodge a neighbour, because a moved label is a wrong label.
  //
  // HYSTERESIS, AND WHY IT IS NOT JITTER. A label accepted on the previous frame is tested with slightly less
  // padding, so a pair hovering exactly at the overlap threshold does not toggle every frame while the globe
  // turns. It is a function of the previous ACCEPTED SET only — deterministic, reproducible, and with no random
  // component. Given the same rotation and the same previous set it always yields the same answer.
  function selectVisibleLabels(cands, opts) {
    opts = opts || {};
    var pad = opts.pad == null ? 3 : opts.pad;
    var stickyPad = opts.stickyPad == null ? 0 : opts.stickyPad;
    var prev = opts.previous || {};
    var markerRects = opts.markerRects || [];
    var accepted = [], placed = [];
    var ordered = orderLabelCandidates(cands);
    for (var i = 0; i < ordered.length; i++) {
      var c = ordered[i];
      var pd = (prev[c.iso] ? stickyPad : pad);
      var rect = { x0: c.x - c.w / 2 - pd, x1: c.x + c.w / 2 + pd, y0: c.y - c.h / 2 - pd, y1: c.y + c.h / 2 + pd };
      var blocked = false;
      for (var j = 0; j < placed.length; j++) { if (rectsOverlap(rect, placed[j])) { blocked = true; break; } }
      // Never let a geographic reference cover a shipment marker — the marker is the business object.
      if (!blocked) {
        for (var k = 0; k < markerRects.length; k++) { if (rectsOverlap(rect, markerRects[k])) { blocked = true; break; } }
      }
      if (blocked) continue;
      placed.push(rect);
      accepted.push(c);
    }
    return accepted;
  }

  // Map a shipment's country value onto an ISO alpha-2 present in the dataset. Accepts an already-2-letter code
  // or a full country name; anything else yields null. It NEVER invents a code, and it is used only to decide
  // which LABEL to prioritise — never to derive a coordinate.
  function countryIsoIndex(dataset) {
    var byIso = {}, byName = {};
    var list = (dataset && dataset.countries) || [];
    for (var i = 0; i < list.length; i++) {
      byIso[list[i].iso] = list[i];
      byName[String(list[i].name || '').trim().toLowerCase()] = list[i].iso;
    }
    return {
      resolve: function (v) {
        var t = String(v == null ? '' : v).trim();
        if (!t) return null;
        var u = t.toUpperCase();
        if (/^[A-Z]{2}$/.test(u) && byIso[u]) return u;
        var n = byName[t.toLowerCase()];
        return n || null;
      }
    };
  }

  var MATH = {
    mat4Identity: mat4Identity, mat4Mul: mat4Mul, mat4Perspective: mat4Perspective,
    mat4Translate: mat4Translate, mat4RotX: mat4RotX, mat4RotY: mat4RotY, mat4Apply: mat4Apply,
    latLngToVec3: latLngToVec3, focusAngles: focusAngles, modelMatrix: modelMatrix,
    slerp: slerp, projectToScreen: projectToScreen,
    // MAP-COUNTRY-BOUNDARY-1 — exported so the regression suite executes the SHIPPED functions.
    buildCountrySegments: buildCountrySegments, countryLabelTier: countryLabelTier,
    countryPriorityOf: countryPriorityOf, orderLabelCandidates: orderLabelCandidates,
    rectsOverlap: rectsOverlap, selectVisibleLabels: selectVisibleLabels,
    countryIsoIndex: countryIsoIndex,
    COUNTRY_R: COUNTRY_R, COUNTRY_MAX_SEG_DEG: COUNTRY_MAX_SEG_DEG, COUNTRY_COLOR: COUNTRY_COLOR,
    // MAP-VISUAL-REAL-EARTH-LOD-1 — exported so the regression suite executes the SHIPPED functions.
    ringsToSegments: ringsToSegments, decodeAdmin1Ring: decodeAdmin1Ring,
    buildAdmin1Segments: buildAdmin1Segments, lodForDistance: lodForDistance,
    layerVisible: layerVisible, admin1LabelBudget: admin1LabelBudget,
    ADMIN1_R: ADMIN1_R, ADMIN1_MAX_SEG_DEG: ADMIN1_MAX_SEG_DEG, ADMIN1_COLOR: ADMIN1_COLOR,
    ADMIN1_ALPHABET: ADMIN1_ALPHABET, LOD_THRESHOLDS: LOD_THRESHOLDS, LOD_HYSTERESIS: LOD_HYSTERESIS,
    ADMIN1_BORDER_MIN_LOD: ADMIN1_BORDER_MIN_LOD, ADMIN1_LABEL_MIN_LOD: ADMIN1_LABEL_MIN_LOD
  };

  // ---------------- earth texture (rasterized from vendored land outline) ----------------
  // Returns a 2D canvas (equirectangular, north at top) or null if land data is unavailable.
  //
  // UI-GLOBE-02 (VISUAL ONLY): a premium, control-tower-grade Earth painted ENTIRELY from the existing
  // vendored land outline (window.KM_WORLD_LAND) with pure canvas-2D — NO external asset, NO network, NO new
  // dependency. Adds latitude biome banding (snow / taiga / temperate / desert / tropical), geographically
  // anchored desert/forest/ice patches, two-octave relief mottling (mountain/terrain feel with no elevation
  // data), an ocean depth gradient + a soft continental-shelf halo, a faint baked graticule (lat/long grid),
  // and a restrained baked cloud layer. Everything is composed ONCE at globe creation from a deterministic
  // seeded PRNG (identical every load, no per-frame cost, no Math.random, no setInterval, no extra draw pass),
  // at the SAME 2048×1024 dimensions → texture memory unchanged. Nothing here touches geometry, coordinates,
  // markers, arcs, projection, interaction, or the render loop — it only paints the texture image.
  // V3G6A(D/E/F) - TEXTURE FIDELITY TIER. AUDIT RESULT: the close-zoom blur is NOT a device-pixel-ratio or
  // backing-buffer defect (both were already correct: dpr = min(devicePixelRatio||1, 2) and
  // canvas.width = round(cssW * dpr), re-applied by a window resize listener AND a container ResizeObserver).
  // The limit is the TEXTURE: the earth image is rasterized at runtime by buildEarthCanvas() and was fixed at
  // 2048x1024 equirectangular. At MIN_D the sphere fills the viewport, so that texture is MAGNIFIED - one
  // texel spans several device pixels - and gl.LINEAR magnification interpolates it into visible softness.
  // Mipmaps/anisotropy cannot fix magnification; only real texel density can. The texture is generated in
  // this repository from the vendored land outline, so raising the tier needs NO external asset, NO network
  // request and NO licence: buildEarthCanvas is fully resolution-parametric (every coordinate and line width
  // derives from tw/th), so a larger raster reproduces the identical artwork with more detail.
  // The tier is capability-gated so low-end devices keep the original cost.
  var TEX_BASE_W_ = 2048, TEX_BASE_H_ = 1024;
  function pickTextureTier(gl) {
    var out = { width: TEX_BASE_W_, height: TEX_BASE_H_, reason: 'BASE_TIER' };
    try {
      var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      if (maxTex < 4096) { out.reason = 'MAX_TEXTURE_SIZE_BELOW_4096'; return out; }
      var nav = (typeof navigator !== 'undefined') ? navigator : {};
      // deviceMemory / hardwareConcurrency are optional; absent means "unknown", which stays on the base tier
      // rather than gambling ~32MB of texture memory on an unidentified device.
      var mem = Number(nav.deviceMemory || 0), cores = Number(nav.hardwareConcurrency || 0);
      if (mem && mem < 4) { out.reason = 'LOW_DEVICE_MEMORY'; return out; }
      if (cores && cores < 4) { out.reason = 'LOW_CORE_COUNT'; return out; }
      if (!mem && !cores) { out.reason = 'DEVICE_CAPABILITY_UNKNOWN'; return out; }
      out.width = 4096; out.height = 2048; out.reason = 'HIGH_TIER_4K';
      return out;
    } catch (e) { out.reason = 'CAPABILITY_PROBE_FAILED'; return out; }
  }
  function buildEarthCanvas(tw, th) {
    var land = window.KM_WORLD_LAND;
    if (!land || !land.rings || !land.rings.length) return null;
    var cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
    var ctx = cv.getContext('2d'); if (!ctx) return null;

    // Deterministic seeded PRNG (LCG) — same Earth every load, no flicker, no clock/Math.random.
    var _seed = 0x9e3779b1 >>> 0;
    function rnd() { _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0; return _seed / 4294967296; }
    function px(lng) { return (lng + 180) / 360 * tw; }
    function py(lat) { return (90 - lat) / 180 * th; }
    // Low-res grayscale value-noise tile (built once) → scaled up for cheap, soft relief mottling.
    function noiseTile(w, h) {
      var nc = document.createElement('canvas'); nc.width = w; nc.height = h;
      var nx = nc.getContext('2d'); if (!nx) return nc;
      var img = nx.createImageData(w, h), d = img.data;
      for (var i = 0; i < w * h; i++) { var g = (110 + rnd() * 150) | 0; d[i*4] = g; d[i*4+1] = g; d[i*4+2] = g; d[i*4+3] = 255; }
      nx.putImageData(img, 0, 0); return nc;
    }
    // Trace the vendored land outline into the current path (reused for shelf halo, fill, clip, coastline).
    function traceLand() {
      ctx.beginPath();
      land.rings.forEach(function (ring) {
        for (var i = 0; i < ring.length; i++) { var x = px(ring[i][0]), y = py(ring[i][1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.closePath();
      });
    }

    // ---- OCEAN: latitude depth gradient — UI-GLOBE-02B darker + calmer (deeper navy, less cyan, restrained coastal) ----
    var og = ctx.createLinearGradient(0, 0, 0, th);
    og.addColorStop(0.00, '#081627'); og.addColorStop(0.16, '#0b2b48'); og.addColorStop(0.34, '#104465');
    og.addColorStop(0.50, '#134f70'); og.addColorStop(0.66, '#104465'); og.addColorStop(0.84, '#0b2b48'); og.addColorStop(1.00, '#081627');
    ctx.fillStyle = og; ctx.fillRect(0, 0, tw, th);
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(noiseTile(256, 128), 0, 0, tw, th); ctx.restore();

    // ---- Continental-shelf halo: a soft lighter ring hugging coasts → shallow-water depth cue ----
    ctx.save(); traceLand();
    ctx.strokeStyle = 'rgba(74,132,165,0.32)'; ctx.lineWidth = Math.max(3, tw / 320); ctx.lineJoin = 'round';
    try { ctx.filter = 'blur(' + Math.max(1, (tw / 900) | 0) + 'px)'; } catch (e) {}   // soft shelf; ignored if unsupported
    ctx.stroke(); ctx.restore();

    // ---- LAND base ----
    traceLand(); ctx.fillStyle = '#4a6a48'; ctx.fill();

    // ---- LAND biomes + relief (clipped to land) ----
    ctx.save(); traceLand(); ctx.clip();
    // latitude biome band: snow → ice → taiga → temperate → desert → tropical (mirrored across the equator)
    var bg = ctx.createLinearGradient(0, 0, 0, th);
    // UI-GLOBE-02B: desaturated toward natural satellite tones (muted olive-greens + muted tan/ochre, not vivid); regional variation kept.
    bg.addColorStop(0.00, '#e2e8ec'); bg.addColorStop(0.09, '#d2dce2'); bg.addColorStop(0.15, '#5a6f55');
    bg.addColorStop(0.26, '#556b46'); bg.addColorStop(0.35, '#a2915f'); bg.addColorStop(0.44, '#436340');
    bg.addColorStop(0.50, '#3b6039'); bg.addColorStop(0.56, '#436340'); bg.addColorStop(0.65, '#9c8b5b');
    bg.addColorStop(0.74, '#556b46'); bg.addColorStop(0.85, '#5a6f55'); bg.addColorStop(0.92, '#d2dce2'); bg.addColorStop(1.00, '#e2e8ec');
    ctx.globalAlpha = 0.9; ctx.fillStyle = bg; ctx.fillRect(0, 0, tw, th); ctx.globalAlpha = 1;
    // geographically anchored soft patches so it reads as real biomes, not just latitude stripes
    function patch(lat, lng, degR, color, a) {
      var cx = px(lng), cy = py(lat), rad = degR / 180 * th;
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a; ctx.fillStyle = rg; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); ctx.globalAlpha = 1;
    }
    var TAN = 'rgba(176,156,110,0.62)', ARID = 'rgba(158,142,104,0.55)', FOR = 'rgba(46,74,50,0.5)', ICE = 'rgba(224,232,236,0.8)';  // UI-GLOBE-02B: muted + lower alpha (natural, not vivid)
    patch(23, 13, 22, TAN, 0.85); patch(24, 45, 15, TAN, 0.8); patch(41, 100, 16, ARID, 0.6);   // Sahara, Arabian, Gobi
    patch(-25, 133, 18, TAN, 0.82); patch(-22, 21, 12, TAN, 0.6); patch(-24, -69, 6, TAN, 0.7);  // Australia, Kalahari, Atacama
    patch(37, -112, 9, ARID, 0.55); patch(41, 63, 9, ARID, 0.5);                                 // SW-US, Kazakh steppe
    patch(-3, -62, 20, FOR, 0.55); patch(1, 22, 13, FOR, 0.5); patch(2, 113, 12, FOR, 0.5);      // Amazon, Congo, Borneo
    patch(72, -40, 16, ICE, 0.88); patch(30, 82, 7, ICE, 0.5);                                   // Greenland, Himalaya
    // two-octave relief mottling (soft-light) → mountain/terrain texture without any elevation data
    ctx.globalCompositeOperation = 'soft-light';   // UI-GLOBE-02B: mild local-contrast lift (0.34→0.40 / 0.20→0.24)
    ctx.globalAlpha = 0.40; ctx.drawImage(noiseTile(384, 192), 0, 0, tw, th);
    ctx.globalAlpha = 0.24; ctx.drawImage(noiseTile(128, 64), 0, 0, tw, th);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ---- coastline (soft, low-contrast) ----
    traceLand(); ctx.strokeStyle = 'rgba(24,52,32,0.55)'; ctx.lineWidth = Math.max(1, tw / 2048); ctx.lineJoin = 'round'; ctx.stroke();

    // ---- faint graticule (lat/long grid) — ~10% presence, a quiet coordinate reference ----
    ctx.save(); ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(0.75, tw / 2400);
    for (var glng = -150; glng <= 180; glng += 30) { var gx = px(glng); ctx.strokeStyle = (glng === 0) ? 'rgba(210,228,240,0.16)' : 'rgba(200,220,235,0.09)'; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, th); ctx.stroke(); }
    for (var glat = -60; glat <= 60; glat += 30) { var gy = py(glat); ctx.strokeStyle = (glat === 0) ? 'rgba(210,228,240,0.18)' : 'rgba(200,220,235,0.09)'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(tw, gy); ctx.stroke(); }
    ctx.restore();

    // ---- baked cloud layer — UI-GLOBE-02B minimized to a faint hint (fewer, smaller, much lower opacity) so it
    //      must NOT haze terrain detail; clouds still cluster in the ITCZ + mid-latitude storm bands ----
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (var ci = 0; ci < 54; ci++) {
      var clat = rnd() * 180 - 90, band = Math.abs(clat);
      var keep = (band < 12) ? 0.85 : (band > 38 && band < 62) ? 0.65 : 0.22;   // clouds cluster near equator + mid-latitudes
      if (rnd() > keep) continue;
      // V3G6A - the ONLY absolute pixel radii in this rasterizer; scaled with the tier so a 4K raster paints
      // the IDENTICAL artwork (every other dimension already derives from tw/th).
      var _cs = tw / 2048;
      var cx = px(rnd() * 360 - 180), cy = py(clat), rw = (26 + rnd() * 66) * _cs, rh = rw * (0.32 + rnd() * 0.3);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, rh / rw);
      var cgr = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
      cgr.addColorStop(0, 'rgba(255,255,255,' + (0.035 + rnd() * 0.05).toFixed(3) + ')'); cgr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cgr; ctx.beginPath(); ctx.arc(0, 0, rw, 0, 6.2832); ctx.fill(); ctx.restore();
    }
    ctx.restore();

    return cv;
  }

  // ---------------- real-Earth material (MAP-VISUAL-REAL-EARTH-TEXTURE-2) ----------------
  //
  // WHY THIS SECTION EXISTS - the audited root cause, not a restatement of the symptom.
  //
  // buildEarthCanvas() above paints a careful, good-looking, ENTIRELY INVENTED Earth. Its only per-pixel input is
  // window.KM_WORLD_LAND: a 110m land/ocean OUTLINE. Everything inside a coastline is therefore manufactured - a
  // latitude colour ramp, thirteen hand-placed radial patches (Sahara, Amazon, Greenland...) and two octaves of
  // value noise stretched up from a 384x192 tile. Three consequences follow, and they are the four classifications
  // this task asked to be separated:
  //
  //   SOURCE_TEXTURE_DETAIL_LIMIT   the artwork holds no geography, so raising the raster 2048 -> 4096 reproduced
  //                                 the SAME picture with more texels. That is why the previous fidelity tier did
  //                                 not read as an improvement: it was never a resolution problem.
  //   PROCEDURAL_NOISE_SMEARING     'relief' is uncorrelated value noise magnified ~5-11x by drawImage. Bilinear
  //                                 magnification of white noise IS low-frequency mush - it looks precisely like
  //                                 blur, and no amount of it becomes a mountain range.
  //   OCEAN_MATERIAL_LIMIT          the ocean is one vertical linear gradient plus a 5% noise overlay and a blurred
  //                                 coast stroke. There is no bathymetry, so there is nothing to vary.
  //   SHADER_LIGHTING_LIMIT         one hardcoded light, one shade term, no land/ocean distinction, no specular, no
  //                                 normal detail, and the multiply performed in gamma space (see FS_SPHERE §G).
  //
  // TEXTURE_MAGNIFICATION is real but SECONDARY and already mitigated (mipmaps + anisotropy + the 4K tier); it is
  // bounded below by whatever a global albedo can physically carry, which is what minDistForTier() now measures.
  // INTERMEDIATE_CANVAS_LIMIT applies only to the fallback rasterizer, which keeps its blurred shelf stroke.
  // CAPABILITY_FALLBACK was already correct (unknown device -> base tier) and is preserved verbatim below.
  // COLOR_SPACE_OR_GAMMA is addressed in FS_SPHERE. NONE of these is fixable by a larger buffer or a filter.
  //
  // THE FIX IS INFORMATION, NOT PIXELS: a genuinely higher-information source. NASA Blue Marble equirectangular
  // albedo carries real MODIS land cover (forest, grassland, desert, snow and ice) AND real bathymetry, vendored
  // REPO-LOCAL under assets/img/earth/. Provenance, dimensions, byte sizes, checksums and the licence are recorded
  // in assets/img/earth/PROVENANCE.md and re-acquirable with tools/geo/fetch-earth-textures.js.
  //
  // NO RUNTIME NETWORK (§I.10): every source below is a repo-relative path. This file contains no URL, no protocol,
  // no host, no fetch, no XHR and no tile server. buildEarthCanvas() is KEPT as the synchronous bootstrap and as
  // the offline fallback, so the globe is never blank and never depends on an asset arriving.
  var EARTH_ASSET_DIR_ = 'assets/img/earth/';
  var EARTH_ASSETS_ = {
    // BASE ships to every device: 239 KB, power-of-two, and REAL geography - so even the low-capability path stops
    // showing an invented planet. HIGH is capability-gated and loaded only when the device has earned it.
    BASE: { file: 'earth-albedo-2048.jpg', w: 2048, h: 1024, bytes: 266599,
            product: 'NASA Blue Marble (2002): land surface, ocean colour and sea ice' },
    HIGH: { file: 'earth-albedo-5400.jpg', w: 5400, h: 2700, bytes: 2566770,
            product: 'NASA Blue Marble Next Generation, December 2004, topography and bathymetry' }
  };
  function earthAssetDir() {
    var o = (typeof window !== 'undefined' && window.KM_GLOBE_EARTH_ASSET_DIR) || '';
    return o ? String(o) : EARTH_ASSET_DIR_;
  }
  function earthAssetPath(key) {
    var a = EARTH_ASSETS_[key];
    return a ? (earthAssetDir() + a.file) : '';
  }

  // Decoded images are cached PER SESSION, keyed by path (§I.3): a second mount of the map, or a tier switch and
  // back, reuses the decoded bitmap instead of decoding a 14.6-megapixel JPEG again.
  var earthImgCache_ = {};
  function earthNow_() {
    try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; } catch (e) { return 0; }
  }
  function loadEarthImage(key) {
    var src = earthAssetPath(key);
    var rec = earthImgCache_[src];
    if (rec && (rec.status === 'READY' || rec.status === 'ERROR')) return Promise.resolve(rec);
    if (rec && rec.promise) return rec.promise;                  // single-flight: two mounts share one decode
    rec = earthImgCache_[src] = { status: 'LOADING', asset: key, src: src, img: null, error: '', ms: 0, w: 0, h: 0 };
    var t0 = earthNow_();
    rec.promise = new Promise(function (resolve) {
      var im;
      try { im = document.createElement('img'); } catch (e) {
        rec.status = 'ERROR'; rec.error = 'EARTH_ASSET_DECODER_UNAVAILABLE'; return resolve(rec);
      }
      im.onload = function () {
        rec.w = im.naturalWidth || im.width || 0; rec.h = im.naturalHeight || im.height || 0;
        rec.ms = Math.round(earthNow_() - t0);
        // A decode that yields no pixels is a FAILURE, not a success with an empty image - saying so here is what
        // keeps the globe from uploading a 0x0 texture and going black (§I.7).
        if (!rec.w || !rec.h) { rec.status = 'ERROR'; rec.error = 'EARTH_ASSET_DECODED_EMPTY'; return resolve(rec); }
        rec.status = 'READY'; rec.img = im; resolve(rec);
      };
      im.onerror = function () {
        rec.status = 'ERROR'; rec.error = 'EARTH_ASSET_LOAD_FAILED'; rec.ms = Math.round(earthNow_() - t0); resolve(rec);
      };
      im.src = src;            // repo-relative path only - see the NO RUNTIME NETWORK note above
    });
    return rec.promise;
  }

  function isPot_(n) { return n > 0 && (n & (n - 1)) === 0; }

  // §D - DOWNSCALE ONLY, and it refuses rather than inventing. Producing a bitmap LARGER than its source is
  // exactly the forbidden "resize the texture and call it new detail", so that request returns null instead of a
  // plausible-looking upscale. Native size short-circuits with NO intermediate canvas at all.
  var earthResampleCache_ = {};
  function earthResample(img, w, h) {
    var sw = (img && (img.naturalWidth || img.width)) || 0, sh = (img && (img.naturalHeight || img.height)) || 0;
    if (!sw || !sh || !w || !h) return null;
    if (w > sw || h > sh) return null;                       // never upscale
    if (w === sw && h === sh) return img;                    // native - zero copies, zero canvas
    var key = (img.getAttribute ? (img.getAttribute('src') || '') : '') + '@' + w + 'x' + h;
    if (earthResampleCache_[key]) return earthResampleCache_[key];
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d'); if (!cx) return null;
    cx.imageSmoothingEnabled = true;
    try { cx.imageSmoothingQuality = 'high'; } catch (e) {}
    cx.drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
    earthResampleCache_[key] = cv;                           // once per session, not once per mount (§I.2/§I.3)
    return cv;
  }

  // §E - CAPABILITY-GATED MATERIAL TIERS. Returns the tier the device has EARNED, never the largest one that
  // exists. The device-capability rules are the ones already audited for the procedural tier and are deliberately
  // unchanged, including the important one: an UNIDENTIFIED device stays low rather than gambling tens of MB.
  //
  // Why there are two high tiers instead of one: 5400x2700 is NOT power-of-two. In WebGL1 an NPOT texture is legal
  // only with CLAMP_TO_EDGE and NO mip chain - which would buy close-zoom texels by paying with aliasing across the
  // entire minified globe and the whole grazing-angle limb. That is a bad trade, so WebGL1 gets a POT DOWNSCALE of
  // the same source and only WebGL2 - where NPOT textures may have mipmaps and REPEAT wrapping - uses the asset at
  // its native resolution. No tier ever upscales anything.
  function pickMaterialTier(caps) {
    caps = caps || {};
    var maxTex = Number(caps.maxTextureSize || 0), gl2 = !!caps.webgl2;
    var out = { tier: 'REAL_BASE_2048', asset: 'BASE', gpuW: 2048, gpuH: 1024, resample: 'NONE', reason: 'BASE_TIER' };
    if (maxTex && maxTex < 2048) {
      out.tier = 'REAL_BASE_1024'; out.gpuW = 1024; out.gpuH = 512;
      out.resample = 'DOWNSCALE_2048_TO_1024'; out.reason = 'MAX_TEXTURE_SIZE_BELOW_2048'; return out;
    }
    if (maxTex < 4096) { out.reason = 'MAX_TEXTURE_SIZE_BELOW_4096'; return out; }
    var nav = (typeof navigator !== 'undefined') ? navigator : {};
    var mem = Number(nav.deviceMemory || 0), cores = Number(nav.hardwareConcurrency || 0);
    if (mem && mem < 4) { out.reason = 'LOW_DEVICE_MEMORY'; return out; }
    if (cores && cores < 4) { out.reason = 'LOW_CORE_COUNT'; return out; }
    if (!mem && !cores) { out.reason = 'DEVICE_CAPABILITY_UNKNOWN'; return out; }
    if (gl2 && maxTex >= 5400) {
      out.tier = 'REAL_HIGH_5400_NATIVE'; out.asset = 'HIGH'; out.gpuW = 5400; out.gpuH = 2700;
      out.resample = 'NONE'; out.reason = 'WEBGL2_NPOT_NATIVE'; return out;
    }
    out.tier = 'REAL_HIGH_4096_POT'; out.asset = 'HIGH'; out.gpuW = 4096; out.gpuH = 2048;
    out.resample = 'DOWNSCALE_5400_TO_4096';
    out.reason = gl2 ? 'WEBGL2_MAX_TEXTURE_SIZE_BELOW_5400' : 'WEBGL1_POT_MIPMAP_REQUIRED';
    return out;
  }
  // RGBA8 / SRGB8_ALPHA8 is 4 bytes per texel; a full mip chain adds one third.
  function estimateGpuBytes(w, h, mips) {
    var b = (w || 0) * (h || 0) * 4;
    return Math.round(mips ? b * 4 / 3 : b);
  }

  // §F - ZOOM VERSUS TEXEL DENSITY, measured rather than asserted. The projection is a 45 degree vertical fov on a
  // unit sphere, so at camera distance d the viewport height spans this much arc across the nearest surface:
  var GLOBE_FOV_DEG_ = 45;
  var ARC_PER_UNIT_ = 2 * Math.tan(GLOBE_FOV_DEG_ / 2 * DEG) / (2 * Math.PI) * 360;   // ~47.46 deg per world unit
  function arcDegAtDist(d) { return Math.max(0, d - 1) * ARC_PER_UNIT_; }
  // Device pixels per SOURCE TEXEL. 1.0 is pixel-perfect; the old configuration reached ~15 at MIN_D on a 1400px
  // viewport, which is the "soft pixel field" this task exists to remove.
  function magnificationAt(texH, dist, viewH) {
    var arc = arcDegAtDist(dist);
    if (!texH || !viewH || arc <= 0) return 0;
    return viewH / ((texH / 180) * arc);
  }
  // The closest distance at which the ACTIVE tier still holds up, given the ACTUAL viewport. Bounded on both
  // sides on purpose: it can never open the zoom past the engine's historical MIN_D (that would be a behaviour
  // change nobody asked for), and it can never close it past MIN_D_CEIL_ - §F authorises constraining zoom
  // "slightly" to avoid magnified blur, not taking the close view away. On the tier a capable desktop actually
  // gets, the derived limit falls below the floor, so the full historical zoom range is retained unchanged.
  var MAG_BUDGET_ = 6.0, MIN_D_FLOOR_ = 1.35, MIN_D_CEIL_ = 1.85;
  function minDistForTier(texH, viewH) {
    if (!texH || !viewH) return MIN_D_FLOOR_;
    var needArc = viewH / ((texH / 180) * MAG_BUDGET_);
    return Math.max(MIN_D_FLOOR_, Math.min(MIN_D_CEIL_, 1 + needArc / ARC_PER_UNIT_));
  }

  // §F option B - the relief layer is a CLOSE-ZOOM refinement only. At global zoom it is off, so the planet reads
  // clean and the albedo's own shaded topography carries the terrain; it ramps in as the camera approaches. This
  // is also what keeps it from ever registering as a repeating pattern at overview distance.
  var DETAIL_MAX_ = 0.30, DETAIL_FAR_ = 2.60, DETAIL_NEAR_ = 1.55, OCEAN_SPEC_ = 0.30;
  function detailForDistance(dist) {
    var k = (DETAIL_FAR_ - dist) / (DETAIL_FAR_ - DETAIL_NEAR_);
    return Math.max(0, Math.min(1, k)) * DETAIL_MAX_;
  }

  // ---------------- geometry ----------------
  function buildSphere(rows, cols, r) {
    var pos = [], nrm = [], uv = [], idx = [];
    for (var y = 0; y <= rows; y++) {
      var lat = 90 - (y / rows) * 180;          // +90 (north) → -90
      for (var x = 0; x <= cols; x++) {
        var lng = -180 + (x / cols) * 360;
        var v = latLngToVec3(lat, lng, 1);
        pos.push(v[0] * r, v[1] * r, v[2] * r);
        nrm.push(v[0], v[1], v[2]);
        uv.push((lng + 180) / 360, (90 - lat) / 180);   // v=0 at north (canvas top) — no FLIP_Y
      }
    }
    var stride = cols + 1;
    for (var yy = 0; yy < rows; yy++) {
      for (var xx = 0; xx < cols; xx++) {
        var a = yy * stride + xx, b = a + stride;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  // ---------------- GL helpers ----------------
  function compile(gl, type, src) {
    var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { var e = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('shader: ' + e); }
    return sh;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { var e = gl.getProgramInfoLog(p); throw new Error('program: ' + e); }
    return p;
  }

  // MAP-VISUAL-REAL-EARTH-TEXTURE-2 - the sphere now needs a TANGENT FRAME, because the relief layer
  // perturbs the normal along the surface's east/north directions. Both are derived analytically from the
  // vertex normal (the mesh is a UV sphere with equirectangular UVs, so east/north ARE the UV axes) and are
  // transformed by the same matrix as the normal, so the frame stays consistent under rotation. The pole
  // vertices are degenerate for cross(up, n), so they pick a different reference axis. THE ATTRIBUTES AND
  // THE uMVP/uMV UNIFORMS ARE UNCHANGED - only varyings were added.
  var VS_SPHERE = 'attribute vec3 aPos;attribute vec3 aNormal;attribute vec2 aUV;uniform mat4 uMVP;uniform mat4 uMV;varying vec2 vUV;varying vec3 vN;varying vec3 vView;varying vec3 vT;varying vec3 vB;void main(){gl_Position=uMVP*vec4(aPos,1.0);vUV=aUV;mat3 nm=mat3(uMV);vN=nm*aNormal;vView=-(uMV*vec4(aPos,1.0)).xyz;vec3 ref=abs(aNormal.y)>0.999?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);vec3 ea=normalize(cross(ref,aNormal));vT=nm*ea;vB=nm*cross(aNormal,ea);}';
  // MAP-VISUAL-REAL-EARTH-TEXTURE-2 §C/§G - THE REAL-EARTH SURFACE SHADER.
  //
  // SUPERSEDES the UI-GLOBE-02B single-term shade ('shade = 0.46 + 0.52*diff', one hardcoded light, no material
  // distinction). That was the right shader for an INVENTED texture: with no land/ocean information in the image
  // there was nothing to shade differently. A real albedo carries that information, so the surface can finally
  // answer light the way land and water actually do. DELIBERATELY UNCHANGED: the sun direction, the rim exponent
  // 3.4 and the rim colour 0.10/0.20/0.38 - the atmosphere silhouette is exactly the one already signed off.
  //
  // §G COLOUR SPACE, stated explicitly rather than assumed. JPEG and canvas pixels are sRGB-ENCODED. Multiplying
  // an sRGB value by a light term - what the old shader did - is lighting in GAMMA space: darks crush, midtones
  // flatten and terrain contrast is lost, which is part of why the old surface read as flat. Here the albedo is
  // DECODED to linear, all lighting is accumulated in LINEAR space, and the result is re-ENCODED once at the end.
  // uDecode is what prevents DOUBLE GAMMA: it is 0.0 when the sampler already decoded (WebGL2 SRGB8_ALPHA8) and
  // 1.0 when the shader must do it (WebGL1). The rim is added AFTER the encode because it is an authored
  // screen-space decoration rather than incident light - which also keeps it identical to the signed-off look.
  //
  // §C WATER MASK, DERIVED FROM THE ALBEDO'S OWN CHROMA. A vector coastline mask is the obvious choice and the
  // wrong one: the 110m outline and real satellite imagery disagree by tens of kilometres, so specular would land
  // on beaches while headlands went matte - exactly the coastline bleeding §G forbids. Reading water out of the
  // image itself is ALIGNED BY CONSTRUCTION, and it correctly treats lakes and inland seas as water.
  //
  // §C/§F RELIEF. The albedo already contains real shaded topography and bathymetry, so its luminance gradient is
  // a genuine, if indirect, terrain signal. The frame's handedness matters and was derived rather than assumed:
  // ea = cross((0,1,0), n) is EAST (= +u), vB = cross(n, ea) is NORTH, and buildSphere's v runs (90-lat)/180 so
  // +v points SOUTH. The v term is therefore (hd - hu), not (hu - hd) - the inverted form lights north-south
  // slopes backwards while east-west slopes stay correct, which reads as inconsistent embossing, not relief.
  // Perturbing the normal by this gradient recovers surface response at close zoom
  // without inventing landforms and without a repeating detail tile. It is LAND-ONLY, ramps in only as the camera
  // approaches (detailForDistance) and is small by design - a lighting refinement, not manufactured geography. A
  // true elevation model would be strictly better and is recorded as the one remaining asset gap.
  var FS_SPHERE =
    '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'uniform sampler2D uTex;uniform vec2 uTexel;uniform float uDecode;uniform float uDetail;uniform float uSpec;' +
    'varying vec2 vUV;varying vec3 vN;varying vec3 vView;varying vec3 vT;varying vec3 vB;' +
    'vec3 dec(vec3 c){return uDecode>0.5?pow(c,vec3(2.2)):c;}' +
    'float lum(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}' +
    'void main(){' +
      'vec3 n=normalize(vN);vec3 v=normalize(vView);vec3 l=normalize(vec3(0.35,0.25,1.0));' +
      'vec4 tex=texture2D(uTex,vUV);vec3 alb=dec(tex.rgb);' +
      'float water=smoothstep(0.012,0.085,tex.b-max(tex.r,tex.g));' +
      'vec3 nn=n;' +
      'if(uDetail>0.0005){' +
        'float hl=lum(dec(texture2D(uTex,vec2(vUV.x-uTexel.x,vUV.y)).rgb));' +
        'float hr=lum(dec(texture2D(uTex,vec2(vUV.x+uTexel.x,vUV.y)).rgb));' +
        'float hu=lum(dec(texture2D(uTex,vec2(vUV.x,vUV.y-uTexel.y)).rgb));' +
        'float hd=lum(dec(texture2D(uTex,vec2(vUV.x,vUV.y+uTexel.y)).rgb));' +
        'nn=normalize(n+(vT*(hl-hr)+vB*(hd-hu))*uDetail*(1.0-water));' +
      '}' +
      'float ndl=max(dot(nn,l),0.0);float wrap=max(dot(n,l),0.0);' +
      'float diff=mix(ndl,wrap,0.28);' +
      'float amb=mix(0.175,0.130,water);' +
      'vec3 lit=alb*(amb+0.93*diff);' +
      'vec3 hv=normalize(l+v);' +
      'lit+=vec3(0.42,0.56,0.78)*pow(max(dot(n,hv),0.0),mix(30.0,86.0,water))*water*uSpec*step(0.001,wrap);' +
      'vec3 col=pow(max(lit,0.0),vec3(1.0/2.2));' +
      'float rim=pow(1.0-max(dot(n,v),0.0),3.4);' +
      'col+=vec3(0.10,0.20,0.38)*rim;' +
      'gl_FragColor=vec4(col,1.0);' +
    '}';
  var VS_PTS = 'attribute vec3 aPos;attribute vec4 aColor;attribute float aSize;attribute float aRing;uniform mat4 uMVP;varying vec4 vColor;varying float vRing;void main(){gl_Position=uMVP*vec4(aPos,1.0);gl_PointSize=aSize;vColor=aColor;vRing=aRing;}';
  // UI-GLOBE-02 (visual only): layered marker — colored core → white halo → status ring → crisp dark rim, for
  // clean definition on the brighter Earth. CONSTANT-ONLY (thresholds/colors); still fully opaque (no blend),
  // same attributes/varyings, same geometry, same picking. Data-driven marker color (vColor) is untouched.
  var FS_PTS = 'precision mediump float;varying vec4 vColor;varying float vRing;void main(){vec2 c=gl_PointCoord-vec2(0.5);float d=length(c);if(d>0.5)discard;vec4 col=vColor;if(d>0.34)col=vec4(1.0,1.0,1.0,1.0);if(vRing>0.5&&d>0.40)col=vec4(1.0,0.82,0.2,1.0);if(d>0.46)col=vec4(0.05,0.09,0.16,1.0);gl_FragColor=col;}';
  var VS_LINE = 'attribute vec3 aPos;attribute vec4 aColor;uniform mat4 uMVP;varying vec4 vColor;void main(){gl_Position=uMVP*vec4(aPos,1.0);vColor=aColor;}';
  var FS_LINE = 'precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}';

  // ---------------- instance ----------------
  function create(container, opts) {
    opts = opts || {};
    function err(kind, msg) { try { if (opts.onError) opts.onError(kind, msg || ''); } catch (e) {} return null; }
    if (!container) return err('container', 'no container element');

    var canvas = document.createElement('canvas');
    canvas.className = 'km-globe-canvas';
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D Earth globe. Use the zoom buttons and the shipment list for keyboard access.');
    container.appendChild(canvas);

    // MAP-COUNTRY-BOUNDARY-1 §F — ISO label overlay. ONE 2D canvas, created once, sitting above the WebGL canvas.
    // pointer-events:none so it can never intercept a drag, a wheel zoom or a marker click; aria-hidden because
    // the labels are decoration over a canvas that already carries the accessible name. Using a single canvas
    // (rather than one DOM node per label) is what keeps §I's "no continuous DOM creation per frame" true.
    var labelCv = document.createElement('canvas');
    labelCv.className = 'km-globe-labels';
    labelCv.setAttribute('aria-hidden', 'true');
    labelCv.style.position = 'absolute';
    labelCv.style.left = '0'; labelCv.style.top = '0';
    labelCv.style.width = '100%'; labelCv.style.height = '100%';
    labelCv.style.pointerEvents = 'none';
    labelCv.style.zIndex = '3';
    container.appendChild(labelCv);
    var labelCtx = null;
    try { labelCtx = labelCv.getContext('2d'); } catch (e) { labelCtx = null; }

    // MAP-VISUAL-REAL-EARTH-TEXTURE-2 §G - WEBGL2 FIRST, WEBGL1 UNCHANGED BEHIND IT.
    // WebGL2 is requested because it is the only path where two things this task needs are legal: a NON
    // power-of-two texture with a full mip chain (so the 5400x2700 asset can be used at its NATIVE size instead of
    // being downscaled) and an SRGB8_ALPHA8 internal format (so sRGB decode - and therefore mip filtering - happens
    // in linear space in the sampler). Nothing else in this engine changes: GLSL ES 1.00 shaders, gl_PointSize,
    // gl.LINES and Uint16 indices are all accepted by WebGL2 unchanged, and if WebGL2 is absent the WebGL1 path is
    // exactly what it has always been. glVersion is reported in diagnostics rather than inferred.
    var gl = null, glVersion = 0;
    var glAttrs = { antialias: true, alpha: false };
    try { gl = canvas.getContext('webgl2', glAttrs); if (gl) glVersion = 2; } catch (e) {}
    if (!gl) { try { gl = canvas.getContext('webgl', glAttrs) || canvas.getContext('experimental-webgl', glAttrs); if (gl) glVersion = 1; } catch (e2) {} }
    if (!gl) { container.removeChild(canvas); return err('webgl', 'WebGL context could not be created'); }

    // §I.6 - THE GLOBE MUST BE USABLE IMMEDIATELY, so the material is staged.
    // buildEarthCanvas() is synchronous, so the BASE procedural raster is the bootstrap: it paints on the very
    // first frame and guarantees the sphere is never blank or black while the real albedo is still decoding. It is
    // deliberately built at BASE size only - building the 4K procedural raster and then discarding it 100 ms later
    // would be exactly the wasteful per-mount canvas work §I.2 rules out. pickTextureTier remains the ladder for
    // the PROCEDURAL FALLBACK (used only when the real asset cannot load at all); the real-Earth ladder is
    // pickMaterialTier.
    var texTier = pickTextureTier(gl);
    var earthCv = buildEarthCanvas(TEX_BASE_W_, TEX_BASE_H_);
    if (!earthCv) { container.removeChild(canvas); return err('asset', 'Land outline asset (KM_WORLD_LAND) is missing or empty; cannot rasterize the Earth texture.'); }
    var texInfo = { width: TEX_BASE_W_, height: TEX_BASE_H_, tier_reason: 'PROCEDURAL_BOOTSTRAP', mipmaps: false,
      anisotropy: 1, max_anisotropy: 1, max_texture_size: 0, allocation_verified: false, downgraded_from: null };
    try { texInfo.max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0; } catch (e) {}

    // §G - is highp actually available in the fragment stage? At 5400 texels a UV offset is 1.85e-4, which mediump
    // (about 3 decimal digits) cannot represent, so the relief taps would read the WRONG texels and emboss noise.
    // Rather than shipping that on weak hardware, the relief layer is switched OFF and says so in diagnostics.
    var fragHighp = false;
    try { var _pf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); fragHighp = !!(_pf && _pf.precision > 0); } catch (e) {}

    var matDecode = 1, matGpuW = TEX_BASE_W_, matGpuH = TEX_BASE_H_, matDetailOn = fragHighp;
    var matTier = pickMaterialTier({ maxTextureSize: texInfo.max_texture_size, webgl2: glVersion === 2 });
    var matInfo = {
      stage: 'PROCEDURAL_BOOTSTRAP', tier: 'PROCEDURAL_BASE', tier_reason: 'BOOTSTRAP',
      target_tier: matTier.tier, target_tier_reason: matTier.reason,
      source_asset: 'procedural (rasterized from KM_WORLD_LAND, 110m land outline)',
      source_dimensions: TEX_BASE_W_ + 'x' + TEX_BASE_H_,
      decoded_dimensions: TEX_BASE_W_ + 'x' + TEX_BASE_H_,
      gpu_dimensions: TEX_BASE_W_ + 'x' + TEX_BASE_H_,
      resample: 'NONE', gamma_decode: '', srgb_internalformat: '', webgl_version: glVersion,
      estimated_gpu_bytes: 0, max_texture_size: texInfo.max_texture_size,
      mipmaps: false, filter: '', wrap_s: '', anisotropy: 1, max_anisotropy: 1,
      allocation_verified: false, fallback_reason: '', high_detail_load_ms: 0,
      fragment_highp: fragHighp, detail_enabled: fragHighp, detail_strength: 0,
      magnification_budget: MAG_BUDGET_, min_distance: MIN_D_FLOOR_, effective_magnification: 0,
      context_lost: 0, context_restored: 0,
      layers: []
    };
    // The layer list is DERIVED, never a fixed string: the relief layer is genuinely absent on a procedural
    // fallback and on hardware without fragment highp, and a diagnostics field that claimed it anyway would be
    // the exact kind of confident-but-wrong report this whole task is trying to remove.
    function materialLayers() {
      var l = ['albedo:' + matInfo.tier, 'water-mask:albedo-chroma', 'ocean-specular', 'atmosphere-rim'];
      if (matInfo.detail_enabled) l.splice(2, 0, 'relief:albedo-luminance');
      return l;
    }

    // ---------------- THE ONE ALBEDO UPLOAD PATH ----------------
    // Bootstrap, tier upgrade, tier downgrade, procedural fallback and context restore ALL go through here. That
    // is deliberate: mipmap generation, filter choice, wrap mode, anisotropy, sRGB handling and allocation
    // verification are a single policy, and a second upload site is how such a policy silently diverges.
    function uploadAlbedo(source, gpuW, gpuH, stage, tier, sourceLabel, sourceDims, resample, decodedDims) {
      if (!source || !gpuW || !gpuH) { matInfo.fallback_reason = 'NO_SOURCE'; return false; }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   // v=0 is the image TOP, matching buildSphere's UVs
      while (gl.getError() !== gl.NO_ERROR) { /* drain pre-existing errors so the check below is about US */ }
      var decode = 1, ifmt = 'RGB8';
      if (glVersion === 2 && gl.SRGB8_ALPHA8) {
        // §G - the SAMPLER decodes sRGB, so mip filtering also averages in LINEAR space (strictly more correct
        // than averaging gamma-encoded texels). SRGB8_ALPHA8 rather than SRGB8 because only the former is
        // guaranteed colour-renderable, which is what generateMipmap requires.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
        decode = 0; ifmt = 'SRGB8_ALPHA8';
      } else {
        // §G - WebGL1 has no dependable hardware equivalent (EXT_sRGB's interaction with generateMipmap is not
        // reliable across drivers), so the SHADER decodes instead. uDecode carries which of the two happened,
        // and that is precisely what makes double gamma impossible rather than merely unlikely.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        decode = 1; ifmt = 'RGB8';
      }
      var texErr = gl.getError();
      if (texErr !== gl.NO_ERROR) {
        // §E - STILL ALLOCATION-VERIFIED. MAX_TEXTURE_SIZE, deviceMemory and hardwareConcurrency are hints, not
        // promises: a driver that reports the capability can refuse the memory under pressure, and an unverified
        // upload leaves an INCOMPLETE texture, which renders BLACK - the one outcome §I.7 forbids.
        matInfo.fallback_reason = 'ALLOCATION_FAILED_0x' + texErr.toString(16);
        texInfo.allocation_verified = false;
        return false;
      }
      texInfo.allocation_verified = true;
      // V3G6A(E4) - MIPMAPS. This fixes the shimmering/aliasing of MINIFIED texels (the zoomed-out globe and the
      // whole grazing-angle limb), which plain gl.LINEAR could not. Magnification stays gl.LINEAR - the correct
      // filter there. A driver may still refuse the chain, so the result is CHECKED, not assumed.
      try { gl.generateMipmap(gl.TEXTURE_2D); texInfo.mipmaps = true; } catch (e) { texInfo.mipmaps = false; }
      if (texInfo.mipmaps && gl.getError() !== gl.NO_ERROR) { texInfo.mipmaps = false; }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texInfo.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // §G/§J.7 - THE DATELINE SEAM. Longitude wraps; latitude does not. So S REPEATS and T CLAMPS. Under
      // CLAMP_TO_EDGE the two seam columns could only ever sample their own edge texel, leaving a half-texel
      // discontinuity down the +/-180 meridian; REPEAT interpolates ACROSS the seam, which is what the geometry
      // actually is - and it also makes the relief taps correct for pixels sitting on the seam. REPEAT requires
      // power-of-two in WebGL1, so an NPOT texture there keeps CLAMP_TO_EDGE rather than becoming incomplete.
      var canRepeat = (glVersion === 2) || (isPot_(gpuW) && isPot_(gpuH));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, canRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // V3G6A(E4) - ANISOTROPY. On a sphere most of the visible surface is viewed at a grazing angle, where an
      // isotropic mip level is chosen from the WORST axis and the terrain smears. Extension-gated; absent
      // extension simply leaves anisotropy at 1.
      try {
        var aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
        if (aniso && texInfo.mipmaps) {
          var maxA = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
          texInfo.max_anisotropy = maxA;
          if (maxA > 1) { gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxA); texInfo.anisotropy = maxA; }
        }
      } catch (e) {}
      matDecode = decode; matGpuW = gpuW; matGpuH = gpuH;
      texInfo.width = gpuW; texInfo.height = gpuH; texInfo.tier_reason = tier;
      matInfo.stage = stage; matInfo.tier = tier;
      matInfo.source_asset = sourceLabel; matInfo.source_dimensions = sourceDims;
      // §I wants the SOURCE, DECODED and GPU dimensions reported separately, because they answer different
      // questions: what the asset is, what the browser actually gave us, and what the GPU is sampling. They
      // differ whenever a resample happened, and conflating them would hide exactly that.
      matInfo.decoded_dimensions = decodedDims || sourceDims;
      matInfo.gpu_dimensions = gpuW + 'x' + gpuH; matInfo.resample = resample || 'NONE';
      matInfo.gamma_decode = decode ? 'SHADER_POW_2_2' : 'SAMPLER_SRGB8_ALPHA8';
      matInfo.srgb_internalformat = ifmt;
      matInfo.mipmaps = texInfo.mipmaps;
      matInfo.filter = (texInfo.mipmaps ? 'LINEAR_MIPMAP_LINEAR' : 'LINEAR') + '/LINEAR';
      matInfo.wrap_s = canRepeat ? 'REPEAT' : 'CLAMP_TO_EDGE';
      matInfo.anisotropy = texInfo.anisotropy; matInfo.max_anisotropy = texInfo.max_anisotropy;
      matInfo.allocation_verified = true;
      matInfo.estimated_gpu_bytes = estimateGpuBytes(gpuW, gpuH, texInfo.mipmaps);
      return true;
    }

    // §F - the zoom limit follows the ACTIVE tier and the ACTUAL viewport, so it tightens while a weak tier is
    // showing and RELAXES again the moment a better one lands. Recomputed on resize and after every material
    // change; it can only ever move inside [MIN_D_FLOOR_, MIN_D_CEIL_].
    function recomputeZoomLimit() {
      var viewH = canvas.height || 0;
      MIN_D = minDistForTier(matGpuH, viewH);
      matInfo.min_distance = Math.round(MIN_D * 1000) / 1000;
      matInfo.effective_magnification = Math.round(magnificationAt(matGpuH, MIN_D, viewH) * 100) / 100;
      if (cam.dist < MIN_D) { cam.dist = MIN_D; }
    }

    // The PROCEDURAL FALLBACK ladder - reached only when the real albedo cannot be loaded or uploaded at all,
    // never as a silent substitute for it. This is where pickTextureTier's capability ladder still applies, and
    // it is the one place buildEarthCanvas is asked for more than the base raster.
    function applyProceduralFallback(reason) {
      if (destroyed) return;
      var cv = buildEarthCanvas(texTier.width, texTier.height);
      if (!cv) return;
      if (uploadAlbedo(cv, texTier.width, texTier.height, 'PROCEDURAL_FALLBACK', 'PROCEDURAL_' + texTier.reason,
            'procedural (rasterized from KM_WORLD_LAND, 110m land outline)',
            texTier.width + 'x' + texTier.height, 'NONE')) {
        // Invented value noise must never be embossed as though it were terrain, so the relief layer is OFF on
        // this path regardless of hardware. Reporting the reason is the point: a silent fallback would look
        // exactly like the upgrade having been delivered.
        matDetailOn = false; matInfo.detail_enabled = false;
        matInfo.fallback_reason = reason;
        recomputeZoomLimit(); schedule();
      }
    }

    // ---- §E/§I.6 STAGED UPGRADE ----
    //
    // A REAL SEASONAL FINDING SHAPED THIS LADDER. The two vendored assets are different Blue Marble products:
    // the 2048 base is an annual/growing-season composite (boreal Canada reads dark green, measured rgb ~49,54,22)
    // while the only 5400x2700 topography+bathymetry image NASA publishes is DECEMBER 2004, in which the northern
    // hemisphere is snow-covered (the same region measures rgb ~187,197,202). Verified by decoding both assets -
    // see tools/geo/jpeg-dc-probe.js. Loading base and THEN high would therefore flip Canada and Siberia from
    // green to white about a second after every page load, which looks like a bug rather than an upgrade.
    //
    // So there is exactly ONE visible material transition per device, never two:
    //   capable device      procedural bootstrap -> REAL HIGH        (the base asset is not even requested)
    //   low-capability      procedural bootstrap -> REAL BASE 2048   (the 2.5 MB asset is never requested, §I.5)
    //   high failed         -> REAL BASE 2048, with the reason reported
    //   asset unavailable   -> procedural fallback, with the reason reported
    function applyRealBase(why) {
      return loadEarthImage('BASE').then(function (base) {
        if (destroyed) return;
        if (base.status !== 'READY') { applyProceduralFallback((why ? why + '_THEN_' : '') + 'BASE_ASSET_' + base.error); return; }
        var bw = (matTier.tier === 'REAL_BASE_1024') ? 1024 : 2048, bh = bw / 2;
        var src = earthResample(base.img, bw, bh);
        if (!src || !uploadAlbedo(src, bw, bh, 'REAL_BASE', 'REAL_BASE_' + bw,
              EARTH_ASSETS_.BASE.product + ' [' + EARTH_ASSETS_.BASE.file + ']',
              EARTH_ASSETS_.BASE.w + 'x' + EARTH_ASSETS_.BASE.h,
              bw === base.w ? 'NONE' : 'DOWNSCALE_' + base.w + '_TO_' + bw, base.w + 'x' + base.h)) {
          applyProceduralFallback((why ? why + '_THEN_' : '') + 'BASE_UPLOAD_' + (matInfo.fallback_reason || 'FAILED'));
          return;
        }
        matDetailOn = fragHighp; matInfo.detail_enabled = matDetailOn;
        if (why) matInfo.fallback_reason = why;
        else if (!fragHighp) matInfo.fallback_reason = 'RELIEF_DISABLED_NO_FRAGMENT_HIGHP';
        recomputeZoomLimit(); schedule();
      });
    }

    function beginMaterialUpgrade() {
      if (matTier.asset !== 'HIGH') { applyRealBase(''); return; }
      loadEarthImage('HIGH').then(function (hi) {
        if (destroyed) return;
        matInfo.high_detail_load_ms = hi.ms || 0;
        // §I.7 - a failed OPTIONAL layer degrades to the tier below and SAYS SO. It never blanks the map.
        if (hi.status !== 'READY') { applyRealBase('HIGH_ASSET_' + hi.error); return; }
        var src = earthResample(hi.img, matTier.gpuW, matTier.gpuH);
        if (!src) { applyRealBase('HIGH_RESAMPLE_REFUSED_WOULD_UPSCALE'); return; }
        if (!uploadAlbedo(src, matTier.gpuW, matTier.gpuH, 'REAL_HIGH', matTier.tier,
              EARTH_ASSETS_.HIGH.product + ' [' + EARTH_ASSETS_.HIGH.file + ']',
              EARTH_ASSETS_.HIGH.w + 'x' + EARTH_ASSETS_.HIGH.h,
              matTier.resample, hi.w + 'x' + hi.h)) {
          // §E.1-3 - abandon the attempt and fall back to a tier that is KNOWN to fit, so the globe is never left
          // holding an incomplete texture. The reason travels with it instead of being swallowed.
          applyRealBase(matInfo.fallback_reason || 'HIGH_UPLOAD_FAILED');
          return;
        }
        matDetailOn = fragHighp; matInfo.detail_enabled = matDetailOn;
        if (!fragHighp) matInfo.fallback_reason = 'RELIEF_DISABLED_NO_FRAGMENT_HIGHP';
        recomputeZoomLimit(); schedule();
      });
    }

    var progSphere, progPts, progLine, sphere, buf = {}, tex;
    try {
      progSphere = program(gl, VS_SPHERE, FS_SPHERE);
      progPts = program(gl, VS_PTS, FS_PTS);
      progLine = program(gl, VS_LINE, FS_LINE);
      sphere = buildSphere(48, 96, 1);
      buf.pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf.pos); gl.bufferData(gl.ARRAY_BUFFER, sphere.pos, gl.STATIC_DRAW);
      buf.nrm = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf.nrm); gl.bufferData(gl.ARRAY_BUFFER, sphere.nrm, gl.STATIC_DRAW);
      buf.uv = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf.uv); gl.bufferData(gl.ARRAY_BUFFER, sphere.uv, gl.STATIC_DRAW);
      buf.idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.idx, gl.STATIC_DRAW);
      buf.pts = gl.createBuffer(); buf.line = gl.createBuffer();
      tex = gl.createTexture();
      if (!uploadAlbedo(earthCv, TEX_BASE_W_, TEX_BASE_H_, 'PROCEDURAL_BOOTSTRAP', 'PROCEDURAL_BASE',
                        matInfo.source_asset, TEX_BASE_W_ + 'x' + TEX_BASE_H_, 'NONE')) {
        // Even 2048x1024 was refused. Do not leave an INCOMPLETE texture bound (that is the black-globe
        // outcome); drop one rung and RE-RASTERISE from the vector source rather than rescale a bitmap.
        var subCv = buildEarthCanvas(1024, 512);
        if (subCv) {
          texInfo.downgraded_from = TEX_BASE_W_ + 'x' + TEX_BASE_H_;
          uploadAlbedo(subCv, 1024, 512, 'PROCEDURAL_BOOTSTRAP', 'PROCEDURAL_SUB_BASE',
                       matInfo.source_asset, '1024x512', 'NONE');
          texInfo.tier_reason = 'DOWNGRADED_ALLOCATION_FAILED_0x' + (matInfo.fallback_reason || '').replace(/^ALLOCATION_FAILED_0x/, '');
        }
      }
    } catch (e) { try { container.removeChild(canvas); } catch (x) {} return err('gl', 'GL init failed: ' + (e && e.message || e)); }

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.043, 0.055, 0.094, 1);   // deep-space background

    var MIN_D = 1.35, MAX_D = 5.0;
    var cam = { yaw: 0, pitch: 0, dist: 3.0 };
    var reduced = !!opts.reducedMotion;
    var markers = [], arcs = [];
    var ptData = null, ptCount = 0, lineData = null, lineCount = 0;
    // MAP-COUNTRY-BOUNDARY-1 — the country layer's own state. countryInfo is built ONCE (see rebuildCountryBuffer)
    // and the GPU buffer is STATIC_DRAW: neither is touched by the render loop.
    var countryData = (typeof window !== 'undefined' && window.KM_WORLD_COUNTRIES) ? window.KM_WORLD_COUNTRIES : null;
    var countryInfo = null, countryVertexCount = 0, countryBufferBuilds = 0;
    var countryIso = countryIsoIndex(countryData);
    var showBorders = opts.countryBorders !== false, showLabels = opts.countryLabels !== false;
    var countryPriority = { active: [], selected: [], nodes: [], high: [] };
    // MAP-VISUAL-REAL-EARTH-LOD-1 — the ADM1 layer's own state. Its dataset is attached LATER (setAdmin1Data),
    // because the asset is ~0.5 MB and §H forbids making the initial workspace load carry it: the page fetches it
    // only when the LOD first calls for it. Until then this layer is simply absent and everything else works.
    var admin1Data = (typeof window !== 'undefined' && window.KM_WORLD_ADMIN1) ? window.KM_WORLD_ADMIN1 : null;
    var admin1Info = null, admin1VertexCount = 0, admin1BufferBuilds = 0, admin1BuildMs = 0;
    var admin1Countries = null;             // optional allow-list used by the low-capability degradation path
    var showAdmin1Borders = opts.admin1Borders || 'auto';   // 'auto' | 'on' | 'off'
    var showAdmin1Labels = opts.admin1Labels || 'auto';
    var lod = 0, lastLodNotified = -1;
    var lastAdmin1LabelStats = { candidates: 0, drawn: 0, budget: 0 };
    var degradeReason = '';
    var prevLabelSet = {}, lastLabelStats = { candidates: 0, drawn: 0, tier: 0 };
    var W = 1, H = 1, dpr = 1;
    var mvp = mat4Identity(), model = mat4Identity(), mv = mat4Identity();
    var anim = null, raf = 0, destroyed = false, status = { ok: true, error: '' };

    function clampPitch(p) { return Math.max(-1.5, Math.min(1.5, p)); }

    function updateLod() {
      var next = lodForDistance(cam.dist, lod);
      if (next === lod) return false;
      lod = next;
      // §H.3 — the page is told only when the level actually CHANGES, so a lazy asset fetch or a relayout is
      // driven by a threshold crossing rather than by every frame of a drag.
      if (lod !== lastLodNotified) {
        lastLodNotified = lod;
        try { if (opts.onLodChange) opts.onLodChange(lod); } catch (e) {}
      }
      return true;
    }

    function recomputeMatrices() {
      updateLod();
      model = modelMatrix(cam.yaw, cam.pitch);
      var view = mat4Translate(0, 0, -cam.dist);
      mv = mat4Mul(view, model);
      var proj = mat4Perspective(45 * DEG, W / H || 1, 0.01, 100);
      mvp = mat4Mul(proj, mv);
    }

    function schedule() { if (!raf && !destroyed) raf = requestAnimationFrame(draw); }

    function draw() {
      raf = 0; if (destroyed) return;
      recomputeMatrices();
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // sphere
      gl.useProgram(progSphere);
      bindAttr(progSphere, 'aPos', buf.pos, 3);
      bindAttr(progSphere, 'aNormal', buf.nrm, 3);
      bindAttr(progSphere, 'aUV', buf.uv, 2);
      gl.uniformMatrix4fv(gl.getUniformLocation(progSphere, 'uMVP'), false, new Float32Array(mvp));
      gl.uniformMatrix4fv(gl.getUniformLocation(progSphere, 'uMV'), false, new Float32Array(mv));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(progSphere, 'uTex'), 0);
      // MAP-VISUAL-REAL-EARTH-TEXTURE-2 - the material uniforms. uTexel is the ACTIVE texture's texel size, so
      // the relief taps stay one texel apart at every tier; uDecode records who performed the sRGB decode (see
      // uploadAlbedo) so gamma is applied exactly once; uDetail ramps the relief in with zoom and is 0 whenever
      // the surface is invented or highp is unavailable.
      gl.uniform2f(gl.getUniformLocation(progSphere, 'uTexel'), 1 / (matGpuW || 1), 1 / (matGpuH || 1));
      gl.uniform1f(gl.getUniformLocation(progSphere, 'uDecode'), matDecode);
      var uDet = matDetailOn ? detailForDistance(cam.dist) : 0;
      matInfo.detail_strength = Math.round(uDet * 1000) / 1000;
      gl.uniform1f(gl.getUniformLocation(progSphere, 'uDetail'), uDet);
      gl.uniform1f(gl.getUniformLocation(progSphere, 'uSpec'), OCEAN_SPEC_);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
      gl.drawElements(gl.TRIANGLES, sphere.idx.length, gl.UNSIGNED_SHORT, 0);

      // MAP-COUNTRY-BOUNDARY-1 §E — country boundaries. Drawn AFTER the sphere and BEFORE the arcs, from a
      // STATIC buffer that is only bound here — no bufferData, no geometry work, no allocation in this path.
      // The depth test does the rest: at r=1.0035 the far-side rings are occluded by the sphere, and the arcs
      // (1.006) and markers (1.012) always win in front, which is what keeps this layer subordinate.
      // MAP-VISUAL-REAL-EARTH-LOD-1 §E/§F — ADM1 outlines, drawn BEFORE the national outlines so that where a
      // state border runs along a national border the NATIONAL one is what the operator sees. Same STATIC buffer
      // discipline as the country layer: bound here, never rebuilt from the render loop.
      if (admin1BordersVisible() && admin1VertexCount) {
        gl.useProgram(progLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.admin1);
        stride7(progLine);
        gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'uMVP'), false, new Float32Array(mvp));
        gl.drawArrays(gl.LINES, 0, admin1VertexCount);
      }

      if (showBorders && countryVertexCount) {
        gl.useProgram(progLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.country);
        stride7(progLine);
        gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'uMVP'), false, new Float32Array(mvp));
        gl.drawArrays(gl.LINES, 0, countryVertexCount);
      }

      // arcs (depth-tested → back segments occluded by the sphere)
      if (lineCount) {
        gl.useProgram(progLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.line); gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
        stride7(progLine);
        gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'uMVP'), false, new Float32Array(mvp));
        gl.drawArrays(gl.LINES, 0, lineCount);
      }

      // markers (points; depth-tested so far-side pins are hidden behind the globe)
      if (ptCount) {
        gl.useProgram(progPts);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.pts); gl.bufferData(gl.ARRAY_BUFFER, ptData, gl.DYNAMIC_DRAW);
        var ppos = gl.getAttribLocation(progPts, 'aPos'), pcol = gl.getAttribLocation(progPts, 'aColor'),
            psz = gl.getAttribLocation(progPts, 'aSize'), prg = gl.getAttribLocation(progPts, 'aRing');
        var S = 9 * 4;
        gl.enableVertexAttribArray(ppos); gl.vertexAttribPointer(ppos, 3, gl.FLOAT, false, S, 0);
        gl.enableVertexAttribArray(pcol); gl.vertexAttribPointer(pcol, 4, gl.FLOAT, false, S, 3 * 4);
        gl.enableVertexAttribArray(psz); gl.vertexAttribPointer(psz, 1, gl.FLOAT, false, S, 7 * 4);
        gl.enableVertexAttribArray(prg); gl.vertexAttribPointer(prg, 1, gl.FLOAT, false, S, 8 * 4);
        gl.uniformMatrix4fv(gl.getUniformLocation(progPts, 'uMVP'), false, new Float32Array(mvp));
        gl.drawArrays(gl.POINTS, 0, ptCount);
      }

      drawCountryLabels();
    }

    // MAP-COUNTRY-BOUNDARY-1 §F/§G — project, filter, order, collide, paint. One 2D canvas, cleared and redrawn;
    // no DOM node is created or removed here, and nothing is allocated per label beyond the small candidate list.
    function drawCountryLabels() {
      if (!labelCtx) return;
      labelCtx.setTransform(1, 0, 0, 1, 0, 0);
      labelCtx.clearRect(0, 0, labelCv.width, labelCv.height);
      // §G LAYER INDEPENDENCE. This canvas now carries TWO layers, so it may only bail when NEITHER has
      // anything to draw. Bailing whenever country labels were off would have silently chained the ADM1 label
      // toggle to the country label toggle.
      var wantCountry = showLabels && !!(countryData && countryData.countries);
      if (!wantCountry && !admin1LabelsVisible()) { lastLabelStats = { candidates: 0, drawn: 0, tier: 0 }; lastAdmin1LabelStats = { candidates: 0, drawn: 0, budget: 0 }; return; }
      labelCtx.scale(dpr, dpr);   // §F/§K DPR-aware: draw in CSS pixels onto a device-pixel backing store

      var fontPx = 11;
      // TEXTURE-3 — A TRADITIONAL-CHINESE-PREFERRING STACK, NOT JUST ANY CJK FONT. Han characters shared between
      // the two orthographies have DIFFERENT GLYPH SHAPES per region, and a generic `system-ui` can resolve them
      // through a Simplified-Chinese face — which would render zh-Hant text in zh-Hans letterforms and quietly
      // undo the whole point of sourcing verified Traditional names. The zh-TW faces are therefore named first
      // (Windows, macOS/iOS, then Noto), with the previous Latin stack retained behind them unchanged.
      labelCtx.font = '700 ' + fontPx + 'px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';

      var tier = countryLabelTier(cam.dist);
      var list = wantCountry ? countryData.countries : [];
      var cands = [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var pri = countryPriorityOf(c.iso, countryPriority);
        // A priority country is never hidden by the zoom tier — an active shipment's country must stay readable
        // however far out the operator is looking.
        if (pri > 3 && c.rank > tier) continue;
        var sp = projectToScreen(mvp, model, latLngToVec3(c.label[1], c.label[0], COUNTRY_R), W, H);
        if (!sp || !sp.front) continue;                                   // §F rear hemisphere -> hidden
        if (sp.x < -40 || sp.y < -20 || sp.x > W + 40 || sp.y > H + 20) continue;   // §F outside viewport -> hidden
        // TEXTURE-3 — the DISPLAYED text is the resolved Traditional Chinese country name; the ISO code stays
        // the label's IDENTITY. That separation matters: `iso` keys the previous-frame set that gives the
        // collision pass its hysteresis, so keying on display text would make a language change look like a
        // different label and reintroduce the flicker the hysteresis exists to stop. The width is measured on
        // the text actually painted, so collision boxes stay honest — a Chinese name is wider than two letters.
        var disp = countryLabelText(c.iso);
        cands.push({ iso: c.iso, text: disp, x: sp.x, y: sp.y, w: labelCtx.measureText(disp).width, h: fontPx,
          rank: c.rank, priority: pri });
      }

      // Shipment markers are the business objects; a geographic reference may never sit on top of one.
      var markerRects = [];
      for (var m = 0; m < markers.length; m++) {
        var mk = markers[m];
        if (!isFinite(mk.lat) || !isFinite(mk.lng)) continue;
        var mp = projectToScreen(mvp, model, latLngToVec3(mk.lat, mk.lng, mk.elev || 1.012), W, H);
        if (!mp || !mp.front) continue;
        var half = ((mk.size || 10) / 2) + 3;
        markerRects.push({ x0: mp.x - half, x1: mp.x + half, y0: mp.y - half, y1: mp.y + half });
      }

      var drawn = wantCountry ? selectVisibleLabels(cands, { pad: 3, stickyPad: 1, previous: prevLabelSet, markerRects: markerRects }) : [];
      var next = {};
      labelCtx.lineJoin = 'round';
      labelCtx.lineWidth = 3;
      labelCtx.strokeStyle = 'rgba(6,10,20,0.86)';   // dark halo -> readable over ocean AND land (§F/§K)
      var countryRects = [];
      for (var d2 = 0; d2 < drawn.length; d2++) {
        var lab = drawn[d2];
        next[lab.iso] = 1;
        labelCtx.fillStyle = lab.priority <= 1 ? 'rgba(250,224,140,0.98)' : 'rgba(226,235,248,0.92)';
        labelCtx.strokeText(lab.text, lab.x, lab.y);
        labelCtx.fillText(lab.text, lab.x, lab.y);
        countryRects.push({ x0: lab.x - lab.w / 2 - 2, x1: lab.x + lab.w / 2 + 2, y0: lab.y - lab.h / 2 - 2, y1: lab.y + lab.h / 2 + 2 });
      }
      prevLabelSet = next;
      lastLabelStats = { candidates: cands.length, drawn: drawn.length, tier: tier };

      // §G — ADM1 text is SUBORDINATE by construction: it is laid out after the country codes and is blocked by
      // both those codes and the shipment markers, so a division code can never cover either.
      drawAdmin1Labels(markerRects.concat(countryRects), fontPx);
    }

    // ==========================================================================================================
    // TEXTURE-3 — GEOGRAPHIC LABEL TEXT. One place, so the language rule cannot drift between the two layers.
    // ----------------------------------------------------------------------------------------------------------
    // The name authority is KM.geoNames (assets/js/core/geo-name-resolver.js) over the vendored zh-Hant asset.
    // It is consulted through a guarded call rather than assumed present: if the asset or the resolver has not
    // loaded, these fall back to exactly what the globe painted before this round — the ISO code and the division
    // code — so a missing asset degrades the LANGUAGE and never the map.
    //
    // No conversion happens here and no name is invented. Whatever the resolver returns is painted verbatim.
    // ==========================================================================================================
    function countryLabelText(iso) {
      try {
        if (window.KM && window.KM.geoNames && typeof window.KM.geoNames.country === 'function') {
          var r = window.KM.geoNames.country(iso);
          if (r && r.name) return r.name;
        }
      } catch (e) {}
      return String(iso == null ? '' : iso);
    }
    function admin1LabelText(d) {
      var code = String((d && d.k) == null ? '' : d.k);
      var full = (d && d.n != null && d.n !== '') ? String(d.n) : code;
      try {
        if (window.KM && window.KM.geoNames && typeof window.KM.geoNames.admin1 === 'function') {
          var r = window.KM.geoNames.admin1(d && d.c, code, { english: full });
          if (r && r.name) return r.name;
        }
      } catch (e) {}
      return code;
    }

    // MAP-VISUAL-REAL-EARTH-LOD-1 §E/§G — division codes. Same project -> filter -> order -> collide -> paint
    // pipeline as the country codes, at a smaller size, admitted only from LOD 2 and capped by a budget.
    var prevAdmin1Set = {};
    function drawAdmin1Labels(blockers, countryFontPx) {
      if (!admin1LabelsVisible() || !admin1Data || !admin1Data.admin1) { lastAdmin1LabelStats = { candidates: 0, drawn: 0, budget: 0 }; return; }
      var budget = admin1LabelBudget(lod);
      if (budget <= 0) { lastAdmin1LabelStats = { candidates: 0, drawn: 0, budget: 0 }; return; }

      var fontPx = Math.max(8, countryFontPx - 2);   // §G: strictly smaller than a country label
      labelCtx.font = '600 ' + fontPx + 'px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

      var list = admin1Data.admin1, cands = [];
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (admin1Countries && admin1Countries.indexOf(d.c) === -1) continue;
        var sp = projectToScreen(mvp, model, latLngToVec3(d.l[1], d.l[0], ADMIN1_R), W, H);
        if (!sp || !sp.front) continue;                                              // §F rear hemisphere -> hidden
        if (sp.x < -30 || sp.y < -16 || sp.x > W + 30 || sp.y > H + 16) continue;     // §F outside viewport -> hidden
        // TEXTURE-3 — the division's Traditional Chinese name where the pinned source verifiably has one, else
        // the existing English name, else the existing code. 356 of 3,835 divisions legitimately fall back, so
        // this layer is EXPECTED to be mixed-language and that must not block anything.
        var dTxt = admin1LabelText(d);
        cands.push({ iso: d.c + '/' + d.k, text: dTxt, x: sp.x, y: sp.y,
          w: labelCtx.measureText(dTxt).width, h: fontPx, rank: d.r, priority: 4 });
      }
      // The budget is applied to the ORDERED candidate list, so what survives a crowded view is the highest-rank
      // divisions rather than whichever happened to be first in the dataset.
      var ordered = orderLabelCandidates(cands).slice(0, budget * 3);
      var drawn = selectVisibleLabels(ordered, { pad: 2, stickyPad: 1, previous: prevAdmin1Set, markerRects: blockers }).slice(0, budget);
      var next = {};
      labelCtx.lineWidth = 2.5;
      labelCtx.strokeStyle = 'rgba(6,10,20,0.80)';
      labelCtx.fillStyle = 'rgba(196,212,232,0.86)';   // dimmer than a country code — subordinate, still legible
      for (var j = 0; j < drawn.length; j++) {
        next[drawn[j].iso] = 1;
        labelCtx.strokeText(drawn[j].text, drawn[j].x, drawn[j].y);
        labelCtx.fillText(drawn[j].text, drawn[j].x, drawn[j].y);
      }
      prevAdmin1Set = next;
      lastAdmin1LabelStats = { candidates: cands.length, drawn: drawn.length, budget: budget };
    }

    function admin1BordersVisible() { return layerVisible(showAdmin1Borders, lod, ADMIN1_BORDER_MIN_LOD) && !!admin1Data; }
    function admin1LabelsVisible() { return layerVisible(showAdmin1Labels, lod, ADMIN1_LABEL_MIN_LOD) && !!admin1Data; }

    // Built ONCE per dataset (and again ONLY on a GL context restore). Never called from draw().
    function rebuildAdmin1Buffer() {
      if (!admin1Data || !admin1Data.admin1 || !admin1Data.admin1.length) { admin1VertexCount = 0; return; }
      try {
        var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        admin1Info = buildAdmin1Segments(admin1Data, { countries: admin1Countries });
        if (!buf.admin1) buf.admin1 = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.admin1);
        gl.bufferData(gl.ARRAY_BUFFER, admin1Info.positions, gl.STATIC_DRAW);
        admin1VertexCount = admin1Info.vertexCount;
        admin1BufferBuilds++;
        var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
        admin1BuildMs = Math.round((t1 - t0) * 10) / 10;
      } catch (e) {
        // §H.7/§H.8 — a failed geographic layer must never take the map down. The base globe, the routes, the
        // markers and every interaction keep working; only this reference layer is absent, and it says why.
        admin1VertexCount = 0; admin1Info = null; degradeReason = 'ADMIN1_BUFFER_BUILD_FAILED';
      }
    }
    // MAP-COUNTRY-BOUNDARY-1 §I — built ONCE per globe instance, and again ONLY if the GL context is restored.
    // Never called from draw(). STATIC_DRAW because the geometry is immutable for the life of the context.
    function rebuildCountryBuffer() {
      if (!countryData || !countryData.countries || !countryData.countries.length) { countryVertexCount = 0; return; }
      try {
        countryInfo = buildCountrySegments(countryData);
        if (!buf.country) buf.country = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.country);
        gl.bufferData(gl.ARRAY_BUFFER, countryInfo.positions, gl.STATIC_DRAW);
        countryVertexCount = countryInfo.vertexCount;
        countryBufferBuilds++;
      } catch (e) { countryVertexCount = 0; }
    }

    function bindAttr(prog, name, b, size) { var loc = gl.getAttribLocation(prog, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
    function stride7(prog) { var lp = gl.getAttribLocation(prog, 'aPos'), lc = gl.getAttribLocation(prog, 'aColor'), S = 7 * 4; gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, S, 0); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, S, 3 * 4); }

    function rebuildPoints() {
      var arr = [];
      markers.forEach(function (m) {
        if (!isFinite(m.lat) || !isFinite(m.lng)) return;
        var v = latLngToVec3(m.lat, m.lng, m.elev || 1.012);   // higher elev => nearer camera => drawn on top
        var c = m.color || [0, 0.5, 0.73];
        arr.push(v[0], v[1], v[2], c[0], c[1], c[2], 1, (m.size || 10) * dpr, m.ring ? 1 : 0);
      });
      ptData = new Float32Array(arr); ptCount = arr.length / 9;
    }
    function rebuildLines() {
      var arr = [];
      arcs.forEach(function (a) {
        var pts = a.points || []; var c = a.color || [0, 0.5, 0.73];
        var world = pts.map(function (p) { return latLngToVec3(p[0], p[1], 1.006); });
        for (var i = 0; i + 1 < world.length; i++) {
          // subdivide each leg along the great circle for a curved, on-surface arc
          var A = norm(world[i]), B = norm(world[i + 1]);
          var steps = 40;   // UI-GLOBE-01: smoother great-circle arc (more interpolated points; SAME endpoints/coordinates/routing)
          for (var s = 0; s < steps; s++) {
            var p1 = slerp(A, B, s / steps), p2 = slerp(A, B, (s + 1) / steps);
            arr.push(p1[0] * 1.006, p1[1] * 1.006, p1[2] * 1.006, c[0], c[1], c[2], 1);
            arr.push(p2[0] * 1.006, p2[1] * 1.006, p2[2] * 1.006, c[0], c[1], c[2], 1);
          }
        }
      });
      lineData = new Float32Array(arr); lineCount = arr.length / 7;
    }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

    // ---- interaction ----
    var dragging = false, moved = 0, lastX = 0, lastY = 0, downX = 0, downY = 0;
    canvas.addEventListener('pointerdown', function (e) { dragging = true; moved = 0; lastX = downX = e.clientX; lastY = downY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) { hoverTest(e); return; }
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.yaw += dx * 0.006; cam.pitch = clampPitch(cam.pitch + dy * 0.006);
      schedule();
    });
    function endDrag(e) {
      if (!dragging) return; dragging = false;
      if (moved < 5) clickTest(e);
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', function () { dragging = false; });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = Math.max(MIN_D, Math.min(MAX_D, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); schedule(); }, { passive: false });
    canvas.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft') { cam.yaw -= 0.1; schedule(); }
      else if (k === 'ArrowRight') { cam.yaw += 0.1; schedule(); }
      else if (k === 'ArrowUp') { cam.pitch = clampPitch(cam.pitch + 0.1); schedule(); }
      else if (k === 'ArrowDown') { cam.pitch = clampPitch(cam.pitch - 0.1); schedule(); }
      else if (k === '+' || k === '=') { zoomBy(0.85); }
      else if (k === '-' || k === '_') { zoomBy(1.18); }
      else return;
      e.preventDefault();
    });

    function screenHit(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top, best = null, bestD = 18;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i]; if (!isFinite(m.lat) || !isFinite(m.lng)) continue;
        var v = latLngToVec3(m.lat, m.lng, m.elev || 1.012);
        var sp = projectToScreen(mvp, model, v, rect.width, rect.height);
        if (!sp || !sp.front) continue;
        var d = Math.hypot(sp.x - mx, sp.y - my);
        if (d < bestD) { bestD = d; best = m; }
      }
      return best;
    }
    function clickTest(e) { var m = screenHit(e); if (m && opts.onMarkerClick) opts.onMarkerClick(m.id); }
    var hoverId = null;
    function hoverTest(e) { var m = screenHit(e); var id = m ? m.id : null; canvas.style.cursor = m ? 'pointer' : 'grab'; if (id !== hoverId) { hoverId = id; if (opts.onMarkerHover) opts.onMarkerHover(id); } }

    function zoomBy(f) { cam.dist = Math.max(MIN_D, Math.min(MAX_D, cam.dist * f)); schedule(); }

    function animateTo(target) {
      if (anim) anim.cancelled = true;
      if (reduced) { cam.yaw = target.yaw; cam.pitch = clampPitch(target.pitch); if (target.dist) cam.dist = target.dist; schedule(); return; }
      var a = { cancelled: false }; anim = a;
      var start = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist }, t0 = null;
      // shortest angular path for yaw
      var dyaw = target.yaw - start.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      function step(ts) {
        if (a.cancelled || destroyed) return;
        if (t0 == null) t0 = ts; var k = Math.min(1, (ts - t0) / 520); var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        cam.yaw = start.yaw + dyaw * e;
        cam.pitch = clampPitch(start.pitch + (target.pitch - start.pitch) * e);
        if (target.dist) cam.dist = start.dist + (target.dist - start.dist) * e;
        recomputeMatrices(); draw();
        if (k < 1) requestAnimationFrame(step); else anim = null;
      }
      requestAnimationFrame(step);
    }

    // ---- public methods ----
    var inst = {
      setMarkers: function (list) { markers = (list || []).slice(); rebuildPoints(); schedule(); },
      setArcs: function (list) { arcs = (list || []).slice(); rebuildLines(); schedule(); },
      focus: function (lat, lng, o) { if (!isFinite(lat) || !isFinite(lng)) return; var fa = focusAngles(lat, lng); animateTo({ yaw: fa.yaw, pitch: fa.pitch, dist: (o && o.dist) || Math.min(cam.dist, 2.4) }); },
      overview: function () { animateTo({ yaw: 0.35, pitch: 0.35, dist: 3.0 }); },
      resize: function () {
        var w = container.clientWidth || canvas.clientWidth || 0, h = container.clientHeight || canvas.clientHeight || 0;
        if (w < 2 || h < 2) { return false; }                 // hidden/detached — skip, no crash
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = w; H = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        // MAP-COUNTRY-BOUNDARY-1 §F/§H — the label overlay uses the SAME css size, the SAME dpr and the SAME
        // rounding as the GL canvas, so fullscreen, a container resize and a browser-zoom change keep the two
        // layers pixel-aligned by construction rather than by coincidence.
        labelCv.width = canvas.width; labelCv.height = canvas.height;
        rebuildPoints();   // point sizes scale with dpr
        // §F - texel density is a function of the VIEWPORT as well as the tier, so the zoom limit is re-derived
        // whenever the backing buffer changes (fullscreen, sidebar, browser zoom, DPR change).
        recomputeZoomLimit();
        schedule(); return true;
      },
      zoomIn: function () { zoomBy(0.82); }, zoomOut: function () { zoomBy(1.22); },
      reset: function () { this.overview(); },
      getStatus: function () { return { ok: status.ok, error: status.error, dist: cam.dist }; },
      // V3G6A - read-only render/texture facts, so the fidelity configuration is observable instead of assumed.
      getRenderInfo: function () { return { dpr: dpr, device_pixel_ratio: (window.devicePixelRatio || 1), dpr_cap: 2, css_width: W, css_height: H, buffer_width: canvas.width, buffer_height: canvas.height }; },
      getTextureInfo: function () { return { width: texInfo.width, height: texInfo.height, tier_reason: texInfo.tier_reason, mipmaps: texInfo.mipmaps, anisotropy: texInfo.anisotropy, max_anisotropy: texInfo.max_anisotropy, max_texture_size: texInfo.max_texture_size, allocation_verified: texInfo.allocation_verified, downgraded_from: texInfo.downgraded_from }; },
      // MAP-VISUAL-REAL-EARTH-TEXTURE-2 §I - the material is fully observable, so which tier is live, what it
      // cost, how colour is handled and WHY anything degraded are all facts rather than inferences. Reported
      // separately from getTextureInfo, which keeps its existing shape for the callers that already read it.
      getMaterialInfo: function () {
        var o = {}; for (var k in matInfo) { if (Object.prototype.hasOwnProperty.call(matInfo, k)) o[k] = matInfo[k]; }
        o.layers = materialLayers();
        o.estimated_gpu_mb = Math.round((matInfo.estimated_gpu_bytes / 1048576) * 10) / 10;
        o.asset_dir = earthAssetDir();
        o.zoom_min_floor = MIN_D_FLOOR_; o.zoom_min_ceiling = MIN_D_CEIL_; o.zoom_max = MAX_D;
        o.viewport_device_px = canvas.height || 0;
        return o;
      },
      setReducedMotion: function (v) { reduced = !!v; },
      // ---- MAP-VISUAL-REAL-EARTH-LOD-1 — ADM1 reference layer (visual only) ----
      // The ADM1 asset is attached LATE. §H.4/§H.5 require that this ~0.5 MB geographic file never sits in the
      // path of the initial shipment workspace load, so the page fetches it only once the LOD asks for it and
      // hands it in here. Everything before that point renders and interacts exactly as it did.
      setAdmin1Data: function (data) {
        if (!data || !data.admin1 || !data.admin1.length) return false;
        if (admin1Data === data) return true;
        admin1Data = data;
        rebuildAdmin1Buffer();
        schedule();
        return admin1VertexCount > 0;
      },
      // Two INDEPENDENT toggles, each 'auto' | 'on' | 'off'. AUTO is the default and is what §G means by "the
      // ordinary user must not have to flip a switch to get a correct picture".
      setAdmin1Layers: function (o) {
        o = o || {};
        function mode(v, cur) {
          if (v == null) return cur;
          if (v === true) return 'on';
          if (v === false) return 'off';
          var t = String(v).toLowerCase();
          return (t === 'on' || t === 'off' || t === 'auto') ? t : cur;
        }
        showAdmin1Borders = mode(o.borders, showAdmin1Borders);
        showAdmin1Labels = mode(o.labels, showAdmin1Labels);
        schedule();
      },
      // §H.6 — the low-capability degradation ladder, driven by the caller. Restricting the layer to the
      // countries actually on screen (or to none) is the cheapest step and is done by REBUILDING the static
      // buffer, never by filtering per frame.
      setAdmin1Countries: function (list) {
        admin1Countries = (list && list.length) ? list.slice() : null;
        if (admin1Data) rebuildAdmin1Buffer();
        schedule();
      },
      getLodInfo: function () {
        return {
          lod: lod, distance: cam.dist, min_distance: MIN_D, max_distance: MAX_D,
          thresholds: LOD_THRESHOLDS.slice(), hysteresis: LOD_HYSTERESIS,
          admin1_borders_mode: showAdmin1Borders, admin1_labels_mode: showAdmin1Labels,
          admin1_borders_visible: admin1BordersVisible(), admin1_labels_visible: admin1LabelsVisible(),
          admin1_border_min_lod: ADMIN1_BORDER_MIN_LOD, admin1_label_min_lod: ADMIN1_LABEL_MIN_LOD,
          country_label_tier: countryLabelTier(cam.dist)
        };
      },
      getAdmin1LayerInfo: function () {
        return {
          available: !!(admin1Data && admin1Data.admin1 && admin1Data.admin1.length),
          dataset: (admin1Data && admin1Data.meta) ? admin1Data.meta.dataset : null,
          resolution: (admin1Data && admin1Data.meta) ? admin1Data.meta.resolution : null,
          division_count: admin1Info ? admin1Info.divisionCount : 0,
          country_count: admin1Info ? admin1Info.countryCount : 0,
          ring_count: admin1Info ? admin1Info.ringCount : 0,
          segment_count: admin1Info ? admin1Info.segmentCount : 0,
          vertex_count: admin1VertexCount,
          buffer_bytes: admin1Info ? admin1Info.positions.byteLength : 0,
          gpu_buffers: admin1Info && admin1VertexCount ? 1 : 0,
          buffer_builds: admin1BufferBuilds,
          build_ms: admin1BuildMs,
          max_source_arc_deg: admin1Info ? admin1Info.maxSourceArcDeg : 0,
          radius: ADMIN1_R, max_segment_deg: ADMIN1_MAX_SEG_DEG,
          restricted_to_countries: admin1Countries ? admin1Countries.slice() : null,
          labels: { candidates: lastAdmin1LabelStats.candidates, drawn: lastAdmin1LabelStats.drawn, budget: lastAdmin1LabelStats.budget },
          degrade_reason: degradeReason || null
        };
      },
      // ---- MAP-COUNTRY-BOUNDARY-1 — country reference layers (visual only) ----
      // Two INDEPENDENT toggles: borders and labels never imply one another.
      setCountryLayers: function (o) {
        o = o || {};
        if (o.borders != null) showBorders = !!o.borders;
        if (o.labels != null) showLabels = !!o.labels;
        schedule();
      },
      // Which countries matter right now. Values may be ISO alpha-2 or full country names; anything that does not
      // resolve against the dataset is DROPPED, never guessed. This only affects which LABEL is prioritised — it
      // can never move, name or derive a business coordinate.
      setCountryPriority: function (o) {
        o = o || {};
        function map(a) {
          var out = [];
          (a || []).forEach(function (v) { var iso = countryIso.resolve(v); if (iso && out.indexOf(iso) === -1) out.push(iso); });
          return out.sort();   // sorted -> the priority set itself is deterministic
        }
        countryPriority = { active: map(o.active), selected: map(o.selected), nodes: map(o.nodes), high: map(o.high) };
        schedule();
      },
      getCountryLayerInfo: function () {
        return {
          available: !!(countryData && countryData.countries && countryData.countries.length),
          borders_visible: showBorders, labels_visible: showLabels,
          country_count: countryInfo ? countryInfo.countryCount : 0,
          ring_count: countryInfo ? countryInfo.ringCount : 0,
          segment_count: countryInfo ? countryInfo.segmentCount : 0,
          vertex_count: countryVertexCount,
          buffer_bytes: countryInfo ? countryInfo.positions.byteLength : 0,
          gpu_buffers: countryInfo && countryVertexCount ? 1 : 0,
          buffer_builds: countryBufferBuilds,
          max_source_arc_deg: countryInfo ? countryInfo.maxSourceArcDeg : 0,
          radius: COUNTRY_R, max_segment_deg: COUNTRY_MAX_SEG_DEG,
          label_tier: lastLabelStats.tier, label_candidates: lastLabelStats.candidates, labels_drawn: lastLabelStats.drawn,
          priority: countryPriority,
          meta: (countryData && countryData.meta) || null
        };
      },
      canvas: canvas,
      destroy: function () {
        destroyed = true; if (raf) cancelAnimationFrame(raf); if (anim) anim.cancelled = true;
        try { window.removeEventListener('resize', onWinResize); } catch (e) {}
        try { if (ro) ro.disconnect(); } catch (e) {}
        try {
          gl.deleteTexture(tex); gl.deleteBuffer(buf.pos); gl.deleteBuffer(buf.nrm); gl.deleteBuffer(buf.uv);
          gl.deleteBuffer(buf.idx); gl.deleteBuffer(buf.pts); gl.deleteBuffer(buf.line);
          if (buf.country) gl.deleteBuffer(buf.country);
          gl.deleteProgram(progSphere); gl.deleteProgram(progPts); gl.deleteProgram(progLine);
          var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        } catch (e) {}
        try { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } catch (e) {}
        try { if (labelCv.parentNode) labelCv.parentNode.removeChild(labelCv); } catch (e) {}
      }
    };

    // context-loss handling (e.g. GPU reset) — report, do not silently die
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); status.ok = false; status.error = 'WebGL context lost'; matInfo.context_lost++; err('contextlost', 'WebGL context lost'); });
    // MAP-COUNTRY-BOUNDARY-1 §I — if the context is ever restored, the country buffer is rebuilt rather than left
    // dangling. It is deliberately the ONLY thing this handler claims to fix: the pre-existing behaviour for the
    // sphere, texture and programs is "report, do not silently die", and this task does not change that.
    // §I - CONTEXT RESTORE. A lost context invalidates every GL object, so the texture must be RE-CREATED, not
    // merely re-bound. It is re-uploaded FROM THE DECODED IMAGE ALREADY IN THE SESSION CACHE: no second network
    // request, no second JPEG decode, and the same single upload path (so the restored texture gets the identical
    // mipmap / filter / wrap / sRGB configuration rather than a subtly different one). If the real asset is not
    // in cache for any reason this re-rasterises the procedural bootstrap instead, so the sphere is never blank.
    // Re-creating the shader programs and vertex buffers is NOT part of this task and is unchanged.
    function restoreMaterial() {
      try { tex = gl.createTexture(); } catch (e) { return false; }
      var want = (matInfo.stage === 'REAL_HIGH') ? 'HIGH' : 'BASE';
      var rec = earthImgCache_[earthAssetPath(want)];
      if (rec && rec.status === 'READY' && rec.img) {
        var gw = (want === 'HIGH') ? matTier.gpuW : ((matTier.tier === 'REAL_BASE_1024') ? 1024 : 2048);
        var gh = (want === 'HIGH') ? matTier.gpuH : gw / 2;
        var src = earthResample(rec.img, gw, gh);
        if (src && uploadAlbedo(src, gw, gh, matInfo.stage, matInfo.tier,
              EARTH_ASSETS_[want].product + ' [' + EARTH_ASSETS_[want].file + ']',
              EARTH_ASSETS_[want].w + 'x' + EARTH_ASSETS_[want].h,
              matInfo.resample, rec.w + 'x' + rec.h)) { return true; }
      }
      var cv = buildEarthCanvas(TEX_BASE_W_, TEX_BASE_H_);
      return !!(cv && uploadAlbedo(cv, TEX_BASE_W_, TEX_BASE_H_, 'PROCEDURAL_BOOTSTRAP', 'PROCEDURAL_BASE',
        'procedural (rasterized from KM_WORLD_LAND, 110m land outline)', TEX_BASE_W_ + 'x' + TEX_BASE_H_, 'NONE'));
    }
    canvas.addEventListener('webglcontextrestored', function () { try { matInfo.context_restored++; restoreMaterial(); recomputeZoomLimit(); buf.country = null; rebuildCountryBuffer(); buf.admin1 = null; rebuildAdmin1Buffer(); schedule(); } catch (e) {} });

    var onWinResize = (function () { var t = 0; return function () { clearTimeout(t); t = setTimeout(function () { inst.resize(); }, 150); }; })();
    window.addEventListener('resize', onWinResize);
    var ro = null;
    try { if (window.ResizeObserver) { ro = new ResizeObserver(function () { inst.resize(); }); ro.observe(container); } } catch (e) {}

    rebuildCountryBuffer();   // ONCE, at creation — never from draw()
    if (admin1Data) rebuildAdmin1Buffer();   // only when the asset was already present at construction
    inst.resize();
    inst.overview();
    schedule();
    // §I.6/§I.8 - LAST, and NOT awaited. The globe is already interactive on the bootstrap raster by this point,
    // and the material upgrade is a repo-local image decode that runs on its own: it cannot delay the first
    // paint, and it touches no workspace read, no DB and no API. Failure downgrades and reports (see
    // applyProceduralFallback) instead of leaving the map broken.
    beginMaterialUpgrade();
    return inst;
  }

  if (typeof window !== 'undefined') {
    window.KMGlobe = {
      math: MATH,
      isSupported: function () { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } },
      buildEarthCanvas: buildEarthCanvas,
      // MAP-VISUAL-REAL-EARTH-TEXTURE-2 - the material's PURE decisions (which tier a capability set earns, what
      // it costs, how close the camera may get before texels run out, whether a resample is legal) are exported so
      // they can be asserted directly instead of inferred from a rendered frame that Node cannot produce.
      material: {
        ASSETS: EARTH_ASSETS_, assetDir: earthAssetDir, assetPath: earthAssetPath,
        pickTier: pickMaterialTier, estimateGpuBytes: estimateGpuBytes, resample: earthResample,
        loadImage: loadEarthImage, isPot: isPot_,
        arcDegAtDist: arcDegAtDist, magnificationAt: magnificationAt, minDistForTier: minDistForTier,
        detailForDistance: detailForDistance,
        MAG_BUDGET: MAG_BUDGET_, MIN_D_FLOOR: MIN_D_FLOOR_, MIN_D_CEIL: MIN_D_CEIL_,
        DETAIL_MAX: DETAIL_MAX_, DETAIL_FAR: DETAIL_FAR_, DETAIL_NEAR: DETAIL_NEAR_, OCEAN_SPEC: OCEAN_SPEC_
      },
      create: create
    };
  }

  // Node/CommonJS export for unit testing the pure math and the pure material decisions. Both are exported so
  // the regression suites can EXECUTE them (tier selection, texel-density limits, resample legality) rather than
  // pattern-match their source, which is the difference between testing behaviour and testing spelling.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      math: MATH,
      material: {
        ASSETS: EARTH_ASSETS_, assetDir: earthAssetDir, assetPath: earthAssetPath,
        pickTier: pickMaterialTier, estimateGpuBytes: estimateGpuBytes, resample: earthResample,
        isPot: isPot_, arcDegAtDist: arcDegAtDist, magnificationAt: magnificationAt,
        minDistForTier: minDistForTier, detailForDistance: detailForDistance,
        MAG_BUDGET: MAG_BUDGET_, MIN_D_FLOOR: MIN_D_FLOOR_, MIN_D_CEIL: MIN_D_CEIL_,
        DETAIL_MAX: DETAIL_MAX_, DETAIL_FAR: DETAIL_FAR_, DETAIL_NEAR: DETAIL_NEAR_, OCEAN_SPEC: OCEAN_SPEC_
      }
    };
  }
})();
