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
  function buildCountrySegments(dataset, opts) {
    opts = opts || {};
    var r = opts.radius || COUNTRY_R;
    var maxSeg = (opts.maxSegmentDeg || COUNTRY_MAX_SEG_DEG) * DEG;
    var col = opts.color || COUNTRY_COLOR;
    var list = (dataset && dataset.countries) || [];
    var out = [], ringCount = 0, segmentCount = 0, maxArc = 0;

    for (var ci = 0; ci < list.length; ci++) {
      var rings = list[ci].rings || [];
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
            out.push(p1[0] * r, p1[1] * r, p1[2] * r, col[0], col[1], col[2], 1);
            out.push(p2[0] * r, p2[1] * r, p2[2] * r, col[0], col[1], col[2], 1);
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
      countryCount: list.length,
      maxSourceArcDeg: maxArc / DEG,
      radius: r,
      maxSegmentDeg: (opts.maxSegmentDeg || COUNTRY_MAX_SEG_DEG)
    };
  }

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
    COUNTRY_R: COUNTRY_R, COUNTRY_MAX_SEG_DEG: COUNTRY_MAX_SEG_DEG, COUNTRY_COLOR: COUNTRY_COLOR
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

  var VS_SPHERE = 'attribute vec3 aPos;attribute vec3 aNormal;attribute vec2 aUV;uniform mat4 uMVP;uniform mat4 uMV;varying vec2 vUV;varying vec3 vN;varying vec3 vView;void main(){gl_Position=uMVP*vec4(aPos,1.0);vUV=aUV;vN=mat3(uMV)*aNormal;vView=-(uMV*vec4(aPos,1.0)).xyz;}';
  // UI-GLOBE-02B (visual only): calibrated lighting — LOWER ambient (0.66→0.46) + stronger diffuse (0.42→0.52) to
  // de-fog and lift terrain contrast (readable shadow side, no overexposure since 0.46+0.52=0.98); NARROWER, subtler
  // rim (pow 2.4→3.4, colour 0.14/0.28/0.50→0.10/0.20/0.38) so the atmosphere is an edge-only silhouette that never
  // milks the surface. CONSTANT-ONLY changes; the shader structure, attributes and uniforms are byte-for-byte identical.
  var FS_SPHERE = 'precision mediump float;uniform sampler2D uTex;varying vec2 vUV;varying vec3 vN;varying vec3 vView;void main(){vec3 n=normalize(vN);vec3 v=normalize(vView);vec3 l=normalize(vec3(0.35,0.25,1.0));float diff=max(dot(n,l),0.0);float shade=0.46+0.52*diff;vec4 tex=texture2D(uTex,vUV);vec3 col=tex.rgb*shade;float rim=pow(1.0-max(dot(n,v),0.0),3.4);col+=vec3(0.10,0.20,0.38)*rim;gl_FragColor=vec4(col,1.0);}';
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

    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl', { antialias: true, alpha: false }); } catch (e) {}
    if (!gl) { container.removeChild(canvas); return err('webgl', 'WebGL context could not be created'); }

    var texTier = pickTextureTier(gl);
    var earthCv = buildEarthCanvas(texTier.width, texTier.height);
    if (!earthCv) { container.removeChild(canvas); return err('asset', 'Land outline asset (KM_WORLD_LAND) is missing or empty; cannot rasterize the Earth texture.'); }
    var texInfo = { width: texTier.width, height: texTier.height, tier_reason: texTier.reason, mipmaps: false, anisotropy: 1, max_anisotropy: 1 };

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
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, earthCv);
      // V3G6A(E4) - MIPMAPS. Both tiers are power-of-two, so WebGL1 can generate a full mip chain. This fixes
      // the shimmering/aliasing of MINIFIED texels (the zoomed-out globe and the whole grazing-angle limb),
      // which plain gl.LINEAR could not. Magnification still uses gl.LINEAR - the correct filter there.
      try { gl.generateMipmap(gl.TEXTURE_2D); texInfo.mipmaps = true; } catch (e) { texInfo.mipmaps = false; }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texInfo.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // V3G6A(E4) - ANISOTROPY. On a sphere most of the visible surface is viewed at a grazing angle, where an
      // isotropic mip level is chosen from the WORST axis and the terrain smears. Anisotropic filtering is the
      // single largest fidelity win here. Extension-gated: absent extension simply leaves anisotropy at 1.
      try {
        var aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
        if (aniso && texInfo.mipmaps) {
          var maxA = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
          texInfo.max_anisotropy = maxA;
          if (maxA > 1) { gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxA); texInfo.anisotropy = maxA; }
        }
      } catch (e) {}
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
    var prevLabelSet = {}, lastLabelStats = { candidates: 0, drawn: 0, tier: 0 };
    var W = 1, H = 1, dpr = 1;
    var mvp = mat4Identity(), model = mat4Identity(), mv = mat4Identity();
    var anim = null, raf = 0, destroyed = false, status = { ok: true, error: '' };

    function clampPitch(p) { return Math.max(-1.5, Math.min(1.5, p)); }

    function recomputeMatrices() {
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
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idx);
      gl.drawElements(gl.TRIANGLES, sphere.idx.length, gl.UNSIGNED_SHORT, 0);

      // MAP-COUNTRY-BOUNDARY-1 §E — country boundaries. Drawn AFTER the sphere and BEFORE the arcs, from a
      // STATIC buffer that is only bound here — no bufferData, no geometry work, no allocation in this path.
      // The depth test does the rest: at r=1.0035 the far-side rings are occluded by the sphere, and the arcs
      // (1.006) and markers (1.012) always win in front, which is what keeps this layer subordinate.
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
      if (!showLabels || !countryData || !countryData.countries) { lastLabelStats = { candidates: 0, drawn: 0, tier: 0 }; return; }
      labelCtx.scale(dpr, dpr);   // §F/§K DPR-aware: draw in CSS pixels onto a device-pixel backing store

      var fontPx = 11;
      labelCtx.font = '700 ' + fontPx + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';

      var tier = countryLabelTier(cam.dist);
      var list = countryData.countries, cands = [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var pri = countryPriorityOf(c.iso, countryPriority);
        // A priority country is never hidden by the zoom tier — an active shipment's country must stay readable
        // however far out the operator is looking.
        if (pri > 3 && c.rank > tier) continue;
        var sp = projectToScreen(mvp, model, latLngToVec3(c.label[1], c.label[0], COUNTRY_R), W, H);
        if (!sp || !sp.front) continue;                                   // §F rear hemisphere -> hidden
        if (sp.x < -40 || sp.y < -20 || sp.x > W + 40 || sp.y > H + 20) continue;   // §F outside viewport -> hidden
        cands.push({ iso: c.iso, x: sp.x, y: sp.y, w: labelCtx.measureText(c.iso).width, h: fontPx,
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

      var drawn = selectVisibleLabels(cands, { pad: 3, stickyPad: 1, previous: prevLabelSet, markerRects: markerRects });
      var next = {};
      labelCtx.lineJoin = 'round';
      labelCtx.lineWidth = 3;
      labelCtx.strokeStyle = 'rgba(6,10,20,0.86)';   // dark halo -> readable over ocean AND land (§F/§K)
      for (var d2 = 0; d2 < drawn.length; d2++) {
        var lab = drawn[d2];
        next[lab.iso] = 1;
        labelCtx.fillStyle = lab.priority <= 1 ? 'rgba(250,224,140,0.98)' : 'rgba(226,235,248,0.92)';
        labelCtx.strokeText(lab.iso, lab.x, lab.y);
        labelCtx.fillText(lab.iso, lab.x, lab.y);
      }
      prevLabelSet = next;
      lastLabelStats = { candidates: cands.length, drawn: drawn.length, tier: tier };
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
        schedule(); return true;
      },
      zoomIn: function () { zoomBy(0.82); }, zoomOut: function () { zoomBy(1.22); },
      reset: function () { this.overview(); },
      getStatus: function () { return { ok: status.ok, error: status.error, dist: cam.dist }; },
      // V3G6A - read-only render/texture facts, so the fidelity configuration is observable instead of assumed.
      getRenderInfo: function () { return { dpr: dpr, device_pixel_ratio: (window.devicePixelRatio || 1), dpr_cap: 2, css_width: W, css_height: H, buffer_width: canvas.width, buffer_height: canvas.height }; },
      getTextureInfo: function () { return { width: texInfo.width, height: texInfo.height, tier_reason: texInfo.tier_reason, mipmaps: texInfo.mipmaps, anisotropy: texInfo.anisotropy, max_anisotropy: texInfo.max_anisotropy }; },
      setReducedMotion: function (v) { reduced = !!v; },
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
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); status.ok = false; status.error = 'WebGL context lost'; err('contextlost', 'WebGL context lost'); });
    // MAP-COUNTRY-BOUNDARY-1 §I — if the context is ever restored, the country buffer is rebuilt rather than left
    // dangling. It is deliberately the ONLY thing this handler claims to fix: the pre-existing behaviour for the
    // sphere, texture and programs is "report, do not silently die", and this task does not change that.
    canvas.addEventListener('webglcontextrestored', function () { try { buf.country = null; rebuildCountryBuffer(); schedule(); } catch (e) {} });

    var onWinResize = (function () { var t = 0; return function () { clearTimeout(t); t = setTimeout(function () { inst.resize(); }, 150); }; })();
    window.addEventListener('resize', onWinResize);
    var ro = null;
    try { if (window.ResizeObserver) { ro = new ResizeObserver(function () { inst.resize(); }); ro.observe(container); } } catch (e) {}

    rebuildCountryBuffer();   // ONCE, at creation — never from draw()
    inst.resize();
    inst.overview();
    schedule();
    return inst;
  }

  if (typeof window !== 'undefined') {
    window.KMGlobe = {
      math: MATH,
      isSupported: function () { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } },
      buildEarthCanvas: buildEarthCanvas,
      create: create
    };
  }

  // Node/CommonJS export for unit testing the pure math.
  if (typeof module !== 'undefined' && module.exports) { module.exports = { math: MATH }; }
})();
