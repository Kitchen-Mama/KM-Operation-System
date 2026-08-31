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
  // TEXTURE-3-R4 §C — FACING WITHOUT PROJECTING, AND IT IS THE SAME NUMBER, NOT AN APPROXIMATION.
  //
  // `projectToScreen` returns `facing` = (model * v).z. For a rotation matrix the translation column is zero, so
  // that value is exactly model[2]*x + model[6]*y + model[10]*z — three multiplies and two adds, with no matrix
  // multiply, no 4-component apply and no object allocated. The regression suite asserts the two agree to the
  // bit rather than taking this comment's word for it.
  //
  // WHY IT MATTERS: the division label pass projected all 3,835 anchors every frame to keep ~22 of them. The
  // facing test is what rejects the overwhelming majority, and it can now run BEFORE the expensive part instead
  // of after it.
  function facingOf(model, x, y, z) { return model[2] * x + model[6] * y + model[10] * z; }

  // The same projection as projectToScreen, written into a CALLER-OWNED object. Identical arithmetic; the only
  // difference is that a frame which projects a few thousand anchors no longer allocates a few thousand objects
  // and two temporaries each. Returns false when the point is behind the eye.
  function projectInto(mvp, model, x, y, z, width, height, out) {
    var cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 1e-6) return false;
    var cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    var cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    out.x = (cx / cw * 0.5 + 0.5) * width;
    out.y = (1 - (cy / cw * 0.5 + 0.5)) * height;
    out.facing = facingOf(model, x, y, z);
    out.front = out.facing > 0.02;
    return true;
  }

  // World point -> screen pixel + visibility. modelZ>0 means front hemisphere (not occluded by the sphere).
  function projectToScreen(mvp, model, v3, width, height) {
    var clip = mat4Apply(mvp, v3);
    if (clip.w <= 1e-6) return null;
    var mv = mat4Apply(model, v3);
    return {
      x: (clip.x / clip.w * 0.5 + 0.5) * width,
      y: (1 - (clip.y / clip.w * 0.5 + 0.5)) * height,
      front: mv.z > 0.02,
      // TEXTURE-3-R3 §G — for a point on the unit sphere, mv.z IS the cosine of the angle between the
      // surface normal and the view axis: 1 at the centre of the disc, 0 exactly at the limb. `front` only
      // asks whether the point is on the near hemisphere at all, which is far too weak a test for a label -
      // it admits text that is compressed into near-invisibility against the horizon. Exposed so the label
      // layers can require a point to be genuinely FACING the camera rather than merely not behind it.
      facing: mv.z
    };
  }


  // ==============================================================================================================
  // F1-7N-MAP-COUNTRY-BOUNDARY-1 — COUNTRY BOUNDARY + ISO LABEL LAYER (pure, deterministic, no GL, no DOM).
  //
  // GEOGRAPHIC REFERENCE ONLY. Nothing in this block reads, writes or derives a shipment, route, event, marker or
  // warehouse coordinate. It consumes the vendored public-domain dataset (window.KM_WORLD_COUNTRIES) and produces
  // a static line buffer plus a screen-space label selection. A regression suite executes these functions.
  // ==============================================================================================================

  // ==============================================================================================================
  // TEXTURE-3-R3 §C — ONE GLOBE SURFACE. THE BORDER LAYERS NO LONGER FLOAT ABOVE IT.
  // ==============================================================================================================
  // WHAT WAS WRONG, AND IT WAS GEOMETRIC RATHER THAN COSMETIC. The boundary layers used to sit on their own
  // radii - COUNTRY_R 1.0035 and ADMIN1_R 1.0030 - i.e. two concentric shells above the r=1 surface. §C forbids
  // exactly that ("do not create an obvious second outer sphere to avoid z-fighting") for a reason that is
  // measurable: a layer at radius 1+d, viewed at an angle t from the surface normal, is displaced from the
  // ground it is meant to describe by d*tan(t). At Earth scale d=0.0035 is 22 km of altitude, and that
  // displacement DIVERGES towards the limb - which is precisely where borders looked detached from the coast.
  //
  // THE FIX IS DEPTH, NOT ALTITUDE. Every boundary vertex now sits at EXACTLY r=1, so there is no parallax at
  // any zoom or any angle - the line is on the ground by construction. Separation from the sphere is done in
  // the DEPTH BUFFER instead, by biasing clip-space z toward the viewer by a constant fraction of w (see
  // VS_RIBBON / VS_LINE). A constant NDC bias is scale-invariant, so one number works from the globe view to
  // maximum zoom.
  //
  // WHY THE BIAS CAN BE THIS SMALL. The sphere is tessellated 48x96, so its triangles are CHORDS lying inside
  // the true sphere: a point at r=1 is already up to 1-cos(1.875deg) = 5.4e-4 in front of the mesh everywhere
  // except exactly at a mesh vertex. The bias only has to win at those vertices, so 2.5e-4 NDC is ample - about
  // half the tessellation sag, and two orders of magnitude smaller than the 0.0035 radial offset it replaces.
  var BORDER_R = 1.0;
  var BORDER_DEPTH_BIAS_ = 0.00025;
  // Arcs and markers KEEP their radial elevation, and that is a different decision rather than an inconsistent
  // one: a shipment arc is not a property of the surface, it is an object above it, and its altitude is what
  // makes it read as a flight path rather than a painted line. They are documented here so §C's audit has one
  // place that lists every radius in the engine.
  var ARC_R_ = 1.006, MARKER_R_ = 1.012;
  var COUNTRY_R = BORDER_R;
  // Longer segments are subdivided along the GREAT CIRCLE. Two reasons, both measured against this dataset:
  //   · SAG. The dataset's longest single edge is ~18 deg (a simplified US ring). A straight chord across 18 deg
  //     sags 1-cos(9deg) = 0.0123 below the surface — nearly 4x the 0.0035 offset, so it would sink INTO the
  //     sphere and be occluded. At 2 deg the worst sag is 0.00015, which is 23x under the offset.
  //   · ANTIMERIDIAN. Subdivision is done by slerp on 3D unit vectors, so no longitude arithmetic happens
  //     anywhere. See the note on buildCountrySegments.
  var COUNTRY_MAX_SEG_DEG = 2;
  var COUNTRY_COLOR = [0.38, 0.45, 0.56];   // muted slate: legible over ocean AND land, clearly subordinate to
                                            // the cyan route arcs and the coloured shipment markers.

  // ==============================================================================================================
  // TEXTURE-3-R3 §E — THE BORDER HIERARCHY, AS THREE DISTINCT CLASSES RATHER THAN TWO SHADES OF ONE
  // ==============================================================================================================
  // R2's own captures showed international and ADM1 borders at visibly the SAME weight, which §E requires to
  // differ. The reason they could not differ is worth stating plainly: BOTH were drawn with gl.LINES, and Chrome
  // clamps gl.lineWidth to 1.0. Every "make the national border heavier" lever available to the old code was
  // therefore colour and alpha only - two shades of one line.
  //
  // So the national boundary is now a SCREEN-SPACE RIBBON: a triangle pair per segment, expanded perpendicular
  // to the segment in pixel space by the vertex shader. That is what §E's "tune widths in screen-space terms so
  // zooming does not make lines excessively thick" actually requires - a constant pixel width at every zoom,
  // which a world-space thickness cannot give.
  //
  // The other two classes stay gl.LINES at the hardware minimum, and that is the right answer for both:
  //   COASTLINE is largely REDUNDANT with the albedo's own coastline. §E warns against a "bright duplicated
  //     rim", so its job is to firm up the edge, not to draw a second one. It is the dimmest thing on the globe.
  //   ADM1 must be "thinner, lower opacity, subordinate" - and 1 px is as thin as hardware allows.
  //
  // Colours are a single neutral hue at three luminances, so the hierarchy reads as weight rather than as three
  // different-coloured lines. No glow, no outline, no second pass: §E forbids neon and double lines, and there
  // is no code here that could produce either.
  var BORDER_STYLE_ = {
    COASTLINE:     { color: [0.34, 0.38, 0.44], alpha: 0.55, widthPx: 0, rank: 1 },
    INTERNATIONAL: { color: [0.62, 0.69, 0.78], alpha: 0.95, widthPx: 1.7, rank: 2 },
    ADM1:          { color: [0.35, 0.39, 0.45], alpha: 0.62, widthPx: 0, rank: 3 }
  };
  // A ribbon narrower than about 1.2 px cannot be resolved and only produces alpha shimmer, so the ribbon path
  // is used only where the width earns it; widthPx 0 means "use gl.LINES".
  var RIBBON_MIN_PX_ = 1.2;

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
  // TEXTURE-3-R3 §D — RASTERISING THE CANONICAL TOPOLOGY (independent SEGMENTS, not rings)
  // ==============================================================================================================
  // ringsToSegments above walks CLOSED RINGS, which is what made every shared boundary appear twice. This
  // consumes the deduplicated edge list from KM.geoTopology instead: a flat [lng,lat,lng,lat,...] list of
  // INDEPENDENT segments where each physical boundary appears exactly once.
  //
  // The two guarantees ringsToSegments earned are preserved verbatim, because they live in the subdivision and
  // not in the ring walk:
  //   SAG — a straight chord across a long edge sinks below the surface. At r=1 exactly there is no altitude to
  //     sink through, so sag now shows as the line cutting INTO the sphere and being depth-culled. Subdividing
  //     at 2 deg keeps the worst sag at 1-cos(1deg) = 1.5e-4, below the depth bias, so it cannot happen.
  //   ANTI-MERIDIAN — every endpoint is projected to a 3D unit vector FIRST and interpolation is slerp between
  //     those vectors. No longitude is compared, averaged, wrapped or unwrapped anywhere, so 179 -> -179 is a
  //     2 deg arc and Antarctica's (180,-90) -> (-180,-90) pair is a 0 deg arc between two identical points.
  function segmentsToVertices(flat, r, maxSegDeg, col, alpha) {
    var maxSeg = maxSegDeg * DEG;
    var a4 = alpha == null ? 1 : alpha;
    var count = flat.length / 4;
    var out = [], segmentCount = 0, maxArc = 0, skipped = 0;
    for (var i = 0; i < count; i++) {
      var o = i * 4;
      var A = latLngToVec3(flat[o + 1], flat[o], 1);
      var B = latLngToVec3(flat[o + 3], flat[o + 2], 1);
      var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
      if (dot > 1) dot = 1; else if (dot < -1) dot = -1;
      var th = Math.acos(dot);
      if (th > maxArc) maxArc = th;
      if (th < 1e-9) { skipped++; continue; }
      var steps = Math.ceil(th / maxSeg); if (steps < 1) steps = 1;
      for (var s = 0; s < steps; s++) {
        var p1 = slerp(A, B, s / steps), p2 = slerp(A, B, (s + 1) / steps);
        out.push(p1[0] * r, p1[1] * r, p1[2] * r, col[0], col[1], col[2], a4);
        out.push(p2[0] * r, p2[1] * r, p2[2] * r, col[0], col[1], col[2], a4);
        segmentCount++;
      }
    }
    return {
      positions: new Float32Array(out), vertexCount: out.length / 7,
      segmentCount: segmentCount, sourceEdges: count, degenerateSkipped: skipped,
      maxSourceArcDeg: maxArc / DEG, radius: r, maxSegmentDeg: maxSegDeg
    };
  }

  // The RIBBON form of the same thing: six vertices per subdivided segment (two triangles), each carrying its
  // own endpoint, the OTHER endpoint, and a side. The shader needs both endpoints to know which way is
  // perpendicular in screen space, which is the only place a constant pixel width can be computed.
  function segmentsToRibbon(flat, r, maxSegDeg, col, alpha) {
    var maxSeg = maxSegDeg * DEG;
    var a4 = alpha == null ? 1 : alpha;
    var count = flat.length / 4;
    var out = [], segmentCount = 0;
    // side/corner pattern for the two triangles of a quad: (end, side) per vertex
    var CORNERS = [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]];
    for (var i = 0; i < count; i++) {
      var o = i * 4;
      var A = latLngToVec3(flat[o + 1], flat[o], 1);
      var B = latLngToVec3(flat[o + 3], flat[o + 2], 1);
      var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
      if (dot > 1) dot = 1; else if (dot < -1) dot = -1;
      var th = Math.acos(dot);
      if (th < 1e-9) continue;
      var steps = Math.ceil(th / maxSeg); if (steps < 1) steps = 1;
      for (var s = 0; s < steps; s++) {
        var p1 = slerp(A, B, s / steps), p2 = slerp(A, B, (s + 1) / steps);
        for (var c = 0; c < 6; c++) {
          var atEnd = CORNERS[c][0], side = CORNERS[c][1];
          var here = atEnd ? p2 : p1, other = atEnd ? p1 : p2;
          out.push(here[0] * r, here[1] * r, here[2] * r,
                   other[0] * r, other[1] * r, other[2] * r,
                   side, col[0], col[1], col[2], a4);
        }
        segmentCount++;
      }
    }
    return {
      positions: new Float32Array(out), vertexCount: out.length / 11,
      segmentCount: segmentCount, sourceEdges: count, radius: r, maxSegmentDeg: maxSegDeg,
      floatsPerVertex: 11
    };
  }

  /**
   * buildBorderLayers(topology, opts) — turn one canonical topology into the three renderable layers.
   *
   * §D's "shared edge rendered once" is inherited from the topology; what this adds is that the three classes
   * are three SEPARATE buffers. That is what makes §E's hierarchy possible at all, and it is also why
   * "international supersedes ADM1" needs no runtime comparison: an edge is in exactly one bucket.
   *
   * `opts.countries` is an ISO allow-list for low-capability degradation. IT FILTERS THE RENDERED EDGES, NEVER
   * THE TOPOLOGY INPUT — classification must see the whole world or an edge shared with an excluded neighbour
   * would be reclassified as coastline and drawn in the wrong class. That is a real trap: filtering first
   * produces a plausible-looking globe with silently wrong borders.
   */
  function buildBorderLayers(topology, opts) {
    opts = opts || {};
    var only = opts.countries || null;
    var maxSeg = opts.maxSegmentDeg || COUNTRY_MAX_SEG_DEG;
    var r = opts.radius == null ? BORDER_R : opts.radius;
    var out = { layers: {}, stats: { filtered_by_country: !!only } };
    ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (cls) {
      var edges = topology.edges[cls] || [];
      var use = edges;
      if (only) {
        use = edges.filter(function (e) {
          for (var i = 0; i < e.countries.length; i++) if (only.indexOf(e.countries[i]) !== -1) return true;
          return false;
        });
      }
      var flat = new Float64Array(use.length * 4);
      for (var i = 0; i < use.length; i++) {
        var e = use[i], o = i * 4;
        flat[o] = e.a[0]; flat[o + 1] = e.a[1]; flat[o + 2] = e.b[0]; flat[o + 3] = e.b[1];
      }
      var st = BORDER_STYLE_[cls];
      var ribbon = st.widthPx >= RIBBON_MIN_PX_;
      var built = ribbon
        ? segmentsToRibbon(flat, r, maxSeg, st.color, st.alpha)
        : segmentsToVertices(flat, r, maxSeg, st.color, st.alpha);
      built.mode = ribbon ? 'RIBBON' : 'LINES';
      built.widthPx = st.widthPx;
      built.rank = st.rank;
      built.edgeCount = use.length;
      built.edgeCountUnfiltered = edges.length;
      out.layers[cls] = built;
    });
    out.stats.topology = topology.stats;
    return out;
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

  var ADMIN1_R = BORDER_R;   // TEXTURE-3-R3 §C — was 1.0030, a second shell above the surface. Where a
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
  // §G — how far off the view axis a DIVISION label may still be placed. Country and continent labels keep
  // the looser near-hemisphere test: naming the country at the edge of the disc is useful context, naming its
  // provinces there is noise.
  var ADMIN1_LABEL_MIN_FACING_ = 0.55;
  // TEXTURE-3-R4 §F — AND THE COUNTRY CLASS NEEDS ONE TOO, WHICH THE CAPTURES ARE WHAT SHOWED.
  //
  // R3 gave divisions a facing threshold and deliberately left countries on the bare `front` test (mv.z > 0.02),
  // on the reasoning that naming the country at the edge of the disc is useful context. The R4 Taiwan/China
  // capture shows where that reasoning runs out: with the camera on eastern Asia, LIBYA - facing 0.043, which is
  // 87.5 degrees off the view axis - was painted over the Tibetan Plateau. The projection is not wrong; near the
  // limb an enormous span of longitude compresses into a few pixels, so a label that is geometrically correct
  // reads as a label on the wrong continent.
  //
  // 0.08 is about 85.4 degrees, a deliberately SMALL tightening of the 88.9 degrees `front` already allowed. It
  // removes the labels that are compressed into meaninglessness (Libya 0.043, Tanzania 0.047, France 0.044,
  // Mozambique 0.028 in that view) and keeps the ones that genuinely orient the reader (Turkey 0.345, Egypt 0.2,
  // Italy 0.112). Continents use the same bound: a continent name at the limb has the same failure.
  var COUNTRY_LABEL_MIN_FACING_ = 0.08;
  function layerVisible(mode, lod, minLod) {
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return lod >= minLod;
  }
  // How many ADM1 labels may be admitted at this level. §E: "must not instantly stuff every division and its
  // text onto the screen"; the cap is the blunt guarantee behind the collision pass.
  function admin1LabelBudget(lod) { return lod >= 3 ? 42 : (lod >= 2 ? 22 : 0); }

  // TEXTURE-3-R3 §E — "introduced by zoom/LOD" and "must not crowd" are two requirements, and the LOD gate
  // alone only satisfies the first. The captures made that plain: the moment LOD 2 was reached, EVERY
  // country's divisions appeared at once, and over France, Germany, the UK and Italy the ADM1 mesh read as
  // texture rather than as boundaries.
  //
  // So the layer FADES IN across the LOD-2 band instead of appearing at full strength. This is an alpha
  // multiplier rather than a geometry filter on purpose: culling per viewport would mean re-uploading a
  // 68,000-edge buffer on every camera move, which is a far worse trade than one uniform.
  var ADMIN1_FADE_FAR_ = 1.95, ADMIN1_FADE_NEAR_ = 1.55;
  function admin1BorderStrength(dist) {
    if (!(dist > 0)) return 1;
    var k = (ADMIN1_FADE_FAR_ - dist) / (ADMIN1_FADE_FAR_ - ADMIN1_FADE_NEAR_);
    return k < 0 ? 0 : (k > 1 ? 1 : k);
  }

  // TEXTURE-3-R3 §G — THE LABEL SIZE LADDER, as one function so the three classes cannot drift apart.
  //
  // R2's captures showed country and division labels at nearly the same size, because the ADM1 size was
  // "country - 2 px": at 11 px that is a 9 px division label, an 18% difference that reads as one class of
  // text at slightly different sizes. §G requires the hierarchy to be VISIBLE, so the sizes are ratios of a
  // base rather than offsets from each other, and the continent size is deliberately the LARGEST while its
  // colour is the faintest - the cartographic convention for a label that names a region rather than a place.
  var LABEL_BASE_PX_ = 12;
  function labelSizes(dist) {
    var base = LABEL_BASE_PX_;
    return {
      continent: Math.round(base * 1.45),   // 17 px
      country: base,                        // 12 px
      admin1: Math.max(9, Math.round(base * 0.75))   // 9 px
    };
  }
  // Continents are a ZOOMED-OUT aid: they name what you are looking at before the countries are legible, and
  // §G asks them to "fade when no longer useful". They are strongest on the full globe and gone by the time
  // ADM1 appears, so the two never compete.
  var CONTINENT_FADE_NEAR_ = 2.05, CONTINENT_FADE_FAR_ = 2.65;
  function continentStrength(dist) {
    if (!(dist > 0)) return 0;
    var k = (dist - CONTINENT_FADE_NEAR_) / (CONTINENT_FADE_FAR_ - CONTINENT_FADE_NEAR_);
    return k < 0 ? 0 : (k > 1 ? 1 : k);
  }

  // §G — CONTINENT ANCHORS ARE DERIVED, NOT INVENTED. There is no vendored continent geometry, and adding a
  // hand-placed anchor table would be exactly the kind of unreviewed cartographic data this task keeps out
  // of the repository. Instead each continent's anchor is the mean of its member countries' OWN vendored
  // label anchors, averaged as 3D UNIT VECTORS and renormalised.
  //
  // Averaging in 3D rather than in lat/lng is the whole point: Oceania spans the anti-meridian, so a mean of
  // longitudes would place it in the Atlantic. Weighting is by the dataset's own `lng_span_deg` size proxy so
  // a scatter of small island states cannot drag a continent's label off the continent.
  function continentAnchors(countryDataset, isoToContinent) {
    var list = (countryDataset && countryDataset.countries) || [];
    var acc = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var key = isoToContinent(c.iso);
      if (!key) continue;
      var w = Math.max(0.25, Number(c.lng_span_deg) || 0.25);
      var v = latLngToVec3(c.label[1], c.label[0], 1);
      var a = acc[key] || (acc[key] = { x: 0, y: 0, z: 0, w: 0, n: 0 });
      a.x += v[0] * w; a.y += v[1] * w; a.z += v[2] * w; a.w += w; a.n++;
    }
    var out = [];
    Object.keys(acc).sort().forEach(function (k) {
      var a = acc[k];
      var L = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (!(L > 1e-9)) return;
      out.push({ key: k, vec: [a.x / L, a.y / L, a.z / L], members: a.n });
    });
    return out;
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
  // TEXTURE-3-R4 §D — CLASS FIRST, then the existing keys. A candidate with no `cls` gets the same rank as
  // every other candidate with no `cls`, so a caller that has never heard of classes sees the identical order
  // it saw before; the key only separates candidates that actually declare different classes.
  function orderLabelCandidates(cands) {
    return cands.slice().sort(function (a, b) {
      return (labelClassRank(a.cls) - labelClassRank(b.cls)) ||
             (a.priority - b.priority) || (a.rank - b.rank) ||
             (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);
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
    // TEXTURE-3-R4 §C — an OPTIONAL counter object. §C asks for the collision-test count to be measured rather
    // than asserted, and a caller that does not care passes nothing and pays nothing. It is written to, never
    // read, so it cannot change which labels are chosen.
    var stats = opts.stats || null;
    var accepted = [], placed = [];
    var ordered = orderLabelCandidates(cands);
    for (var i = 0; i < ordered.length; i++) {
      var c = ordered[i];
      var pd = (prev[c.iso] ? stickyPad : pad);
      var rect = { x0: c.x - c.w / 2 - pd, x1: c.x + c.w / 2 + pd, y0: c.y - c.h / 2 - pd, y1: c.y + c.h / 2 + pd };
      var blocked = false;
      for (var j = 0; j < placed.length; j++) { if (stats) stats.tests++; if (rectsOverlap(rect, placed[j])) { blocked = true; break; } }
      // Never let a geographic reference cover a shipment marker — the marker is the business object.
      if (!blocked) {
        for (var k = 0; k < markerRects.length; k++) { if (stats) stats.tests++; if (rectsOverlap(rect, markerRects[k])) { blocked = true; break; } }
      }
      if (blocked) continue;
      placed.push(rect);
      accepted.push(c);
    }
    return accepted;
  }

  // ============================================================================================================
  // TEXTURE-3-R4 §C/§D — THE FOUR LABEL CLASSES, AND ONE PLACE THAT DECIDES BETWEEN THEM.
  // ------------------------------------------------------------------------------------------------------------
  // §C fixes the precedence: operational, then country, then continent, then ADM1. Before this round that order
  // was real but IMPLICIT - it emerged from the sequence of three calls inside the draw function and from the
  // fact that each pass was handed the previous passes' rectangles as blockers. Implicit is not testable, and
  // §D asks for the cross-class outcomes to be proven, so the orchestration is lifted out here as a PURE
  // function the engine calls and the suite calls.
  //
  // WHY STAGED RATHER THAN ONE FLAT SORT. Each class is measured in its OWN font, and a flat sort would have to
  // measure everything up front - which is exactly the cost §C is about. Staging lets each class be measured
  // only after the classes above it have taken their space.
  //
  // OPERATIONAL IS A CLASS HERE, NOT A SIDE CHANNEL. Shipment markers used to be passed in as a bare rectangle
  // list. They are the business objects and they outrank every geographic label, which is a PRECEDENCE fact, so
  // they enter as class 0 candidates and the same comparator explains why they win.
  var LABEL_CLASS_ORDER_ = ['OPERATIONAL', 'COUNTRY', 'CONTINENT', 'ADM1'];
  function labelClassRank(cls) {
    var i = LABEL_CLASS_ORDER_.indexOf(String(cls || ''));
    return i === -1 ? LABEL_CLASS_ORDER_.length : i;
  }

  // How many candidates may be MEASURED per label the budget allows. §C forbids rejected labels consuming
  // layout work, and an unbounded pass over a crowded view is what that rule is about: at the dense-Europe zoom
  // 1,706 divisions were text-resolved and text-measured to place 22. Three attempts per slot leaves room for
  // collisions to be resolved without the work scaling with the dataset.
  var LABEL_MEASURE_FACTOR_ = 3;

  // §C/§D — the whole frame's label decision, as one deterministic function of (candidates, blockers, previous
  // set). No clock, no PRNG, no dependence on input array order: every stage sorts with orderLabelCandidates,
  // whose final tie-break is immutable identity.
  //
  // `input.operational` are pre-placed rectangles: they are never dropped and never measured, because a marker's
  // size is a property of the marker and not of any text.
  function planLabelSet(input, opts) {
    input = input || {}; opts = opts || {};
    var pads = opts.pad || {}, sticky = opts.stickyPad || {}, prev = opts.previous || {};
    function padOf(cls, dflt) { return pads[cls] == null ? dflt : pads[cls]; }
    function stickyOf(cls, dflt) { return sticky[cls] == null ? dflt : sticky[cls]; }

    var operational = (input.operational || []).slice();
    var blockers = operational.map(function (r) { return r; });
    var out = { operational: operational, country: [], continent: [], adm1: [] };
    var counts = { operational: operational.length, country: 0, continent: 0, adm1: 0 };
    var tests = { operational: 0, country: 0, continent: 0, adm1: 0 };

    function stage(key, cands, dfltPad, dfltSticky, prevKey) {
      var list = cands || [];
      if (!list.length) return;
      var st = { tests: 0 };
      var accepted = selectVisibleLabels(list, {
        pad: padOf(key.toUpperCase(), dfltPad),
        stickyPad: stickyOf(key.toUpperCase(), dfltSticky),
        previous: prev[prevKey] || {},
        markerRects: blockers,
        stats: st
      });
      tests[key] = st.tests;
      out[key] = accepted;
      counts[key] = accepted.length;
      for (var i = 0; i < accepted.length; i++) {
        var a = accepted[i], m = 2;
        blockers.push({ x0: a.x - a.w / 2 - m, x1: a.x + a.w / 2 + m,
                        y0: a.y - a.h / 2 - m, y1: a.y + a.h / 2 + m });
      }
    }

    // The order below IS §C's precedence. Each stage's accepted rectangles become the next stage's blockers, so
    // a country label can hide a continent label and a continent label can hide a division label, never the
    // reverse - and an operational rectangle blocks all three.
    stage('country', input.country, 3, 1, 'country');
    stage('continent', input.continent, 6, 3, 'continent');
    stage('adm1', input.adm1, 2, 1, 'adm1');
    return { accepted: out, counts: counts, collision_tests: tests,
             class_order: LABEL_CLASS_ORDER_.slice() };
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
    ADMIN1_BORDER_MIN_LOD: ADMIN1_BORDER_MIN_LOD, ADMIN1_LABEL_MIN_LOD: ADMIN1_LABEL_MIN_LOD,
    ADMIN1_LABEL_MIN_FACING: ADMIN1_LABEL_MIN_FACING_,
    COUNTRY_LABEL_MIN_FACING: COUNTRY_LABEL_MIN_FACING_,
    // MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §C/§D/§E — exported so the suites EXECUTE the shipped topology,
    // hierarchy and surface-authority decisions instead of pattern-matching their source.
    BORDER_R: BORDER_R, BORDER_DEPTH_BIAS: BORDER_DEPTH_BIAS_,
    ARC_R: ARC_R_, MARKER_R: MARKER_R_,
    BORDER_STYLE: BORDER_STYLE_, RIBBON_MIN_PX: RIBBON_MIN_PX_,
    segmentsToVertices: segmentsToVertices, segmentsToRibbon: segmentsToRibbon,
    buildBorderLayers: buildBorderLayers,
    admin1BorderStrength: admin1BorderStrength, continentStrength: continentStrength,
    labelSizes: labelSizes, continentAnchors: continentAnchors,
    // TEXTURE-3-R4 §C/§D — exported so the determinism suite executes the SHIPPED planner and the SHIPPED
    // facing test rather than a re-implementation of either.
    facingOf: facingOf, projectInto: projectInto,
    labelClassRank: labelClassRank, planLabelSet: planLabelSet,
    LABEL_CLASS_ORDER: LABEL_CLASS_ORDER_, LABEL_MEASURE_FACTOR: LABEL_MEASURE_FACTOR_,
    ADMIN1_FADE_FAR: ADMIN1_FADE_FAR_, ADMIN1_FADE_NEAR: ADMIN1_FADE_NEAR_,
    CONTINENT_FADE_NEAR: CONTINENT_FADE_NEAR_, CONTINENT_FADE_FAR: CONTINENT_FADE_FAR_,
    LABEL_BASE_PX: LABEL_BASE_PX_
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
  // TEXTURE-3-R2 §L2 established WHICH month the surface shows (July 2004, not December - see PROVENANCE.md).
  // TEXTURE-3-R3 §B establishes HOW MANY TEXELS it has, which R2 reported as not done: the asset was 5400x2700
  // before and after, so the seasonal fix bought correctness without sharpness.
  //
  // ALL THREE TIERS ARE NOW ONE IMAGE AT THREE SAMPLE RATES. They are generated by tools/geo/build-earth-tiers.js
  // from a single pinned source - `world.topo.bathy.200407.3x21600x10800.jpg`, 21600x10800, the SAME NASA image
  // record 73751 that July 2004 was accepted from, at its published full resolution. HIGH is an area-average of
  // that source; MID and BASE are exact 2x box halvings of the tier above.
  //
  // THAT STRUCTURE IS THE §B10 GUARANTEE, not a nicety. Before this round BASE was a DIFFERENT PRODUCT entirely
  // (the 2002 Blue Marble `land_ocean_ice_2048.jpg`) while HIGH was BMNG - so changing tier changed the season,
  // the bathymetry and the sea ice, and a tier switch was a visible change of planet. Three sample rates of one
  // decode cannot disagree about geography, and it also means R2's accepted Canada gate can be measured on EVERY
  // tier instead of only the desktop one (it is: see tools/geo/verify-earth-tiers.js, which reads all three).
  //
  // EVERY TIER IS POWER-OF-TWO, which retires a real complication rather than working around it. 5400x2700 is
  // NPOT, so WebGL1 could only have it with CLAMP_TO_EDGE and no mip chain, and the engine carried a second
  // "POT downscale" tier and a client-side canvas resample of a 14.6-megapixel image to avoid that. Both are
  // gone: each tier now maps 1:1 onto an asset, so no tier resamples anything at runtime.
  var EARTH_ASSETS_ = {
    BASE: { file: 'earth-albedo-2048.jpg', w: 2048, h: 1024, bytes: 453127,
            product: 'NASA Blue Marble Next Generation, July 2004, topography and bathymetry (2048 tier)' },
    MID:  { file: 'earth-albedo-4096.jpg', w: 4096, h: 2048, bytes: 1386011,
            product: 'NASA Blue Marble Next Generation, July 2004, topography and bathymetry (4096 tier)' },
    HIGH: { file: 'earth-albedo-8192.jpg', w: 8192, h: 4096, bytes: 4217345,
            product: 'NASA Blue Marble Next Generation, July 2004, topography and bathymetry (8192 tier)' }
  };
  // The tier ladder, largest first. Selection walks this in order and takes the first tier the device has EARNED
  // - never the largest that merely exists (§B8/§B11).
  var EARTH_TIER_ORDER_ = ['HIGH', 'MID', 'BASE'];
  function earthAssetDir() {
    var o = (typeof window !== 'undefined' && window.KM_GLOBE_EARTH_ASSET_DIR) || '';
    return o ? String(o) : EARTH_ASSET_DIR_;
  }
  // TEXTURE-3-R2 §L2/§J — THE IMAGE NEEDS A CACHE-BUST TOKEN OF ITS OWN.
  //
  // The filename did not change when the December asset was replaced by July, and the request carried no version
  // query, so every browser holding the old JPEG would keep serving it from cache and the corrected surface
  // would simply never arrive. index.html's `?v=` tokens cover the SCRIPTS; they do nothing for an image the
  // engine requests itself. The token is pinned to the asset content, so it moves exactly when the bytes do.
  // R3: the token moves with the CONTENT of the tier set, not with the release. Every one of the three files
  // changed this round (8192 and 4096 are new; 2048 was regenerated from the same July source), and BASE kept its
  // filename while its bytes changed - which is exactly the case a filename-only cache would serve stale forever.
  var EARTH_ASSET_VERSION_ = 'jul2004-tiers-e7ca8837';
  function earthAssetPath(key) {
    var a = EARTH_ASSETS_[key];
    return a ? (earthAssetDir() + a.file + '?v=' + EARTH_ASSET_VERSION_) : '';
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
  function nowMsGlobal_() {
    try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; } catch (e) { return 0; }
  }

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

  // RGBA8 / SRGB8_ALPHA8 is 4 bytes per texel; a full mip chain adds one third.
  function estimateGpuBytes(w, h, mips) {
    var b = (w || 0) * (h || 0) * 4;
    return Math.round(mips ? b * 4 / 3 : b);
  }

  // §B6 - A STATED, ENFORCED, REPORTED TEXTURE MEMORY BUDGET.
  //
  // "Select tier using actual WebGL capability and bounded memory budget" needs a number, so here it is. With a
  // mip chain at SRGB8_ALPHA8 the tiers cost 179 MB (8192), 45 MB (4096) and 11 MB (2048). The budget admits the
  // 8192 tier and nothing larger, which is the point: it is the ceiling this ladder was designed against, not a
  // value chosen to be permissive. It is reported in getMaterialInfo() so the cost is visible rather than implied.
  var GPU_TEXTURE_BUDGET_BYTES_ = 192 * 1024 * 1024;

  // §B6-§B9, §B11 - CAPABILITY-GATED MATERIAL TIERS. Returns the tier the device has EARNED, never the largest
  // one that exists, and never one the device cannot hold.
  //
  // §B11 IS A SEPARATE RULE FROM §B8 AND IS ENFORCED SEPARATELY. §B8 says never request a tier the device does
  // not support; §B11 says do not ship an excessive file merely BECAUSE 8192 is supported. So MAX_TEXTURE_SIZE
  // is necessary and not sufficient: the 8192 tier is a 4 MB download and 179 MB of texture memory, and it is
  // released only to a device that also reports real memory or real parallelism. A phone GPU can advertise
  // MAX_TEXTURE_SIZE 8192 and still be the wrong place to spend that.
  //
  // The rule kept unchanged from the audited earlier ladder, because it is the one that matters most in practice:
  // an UNIDENTIFIED device stays LOW rather than gambling tens of megabytes on a guess.
  function pickMaterialTier(caps) {
    caps = caps || {};
    var maxTex = Number(caps.maxTextureSize || 0);
    var gl2 = !!caps.webgl2;
    var nav = (typeof navigator !== 'undefined') ? navigator : {};
    var mem = Number(caps.deviceMemory != null ? caps.deviceMemory : (nav.deviceMemory || 0));
    var cores = Number(caps.hardwareConcurrency != null ? caps.hardwareConcurrency : (nav.hardwareConcurrency || 0));
    var budget = Number(caps.budgetBytes || GPU_TEXTURE_BUDGET_BYTES_);

    function tierOf(assetKey, tierName, reason) {
      var a = EARTH_ASSETS_[assetKey];
      return { tier: tierName, asset: assetKey, gpuW: a.w, gpuH: a.h, resample: 'NONE', reason: reason,
               asset_bytes: a.bytes, estimated_gpu_bytes: estimateGpuBytes(a.w, a.h, true),
               budget_bytes: budget };
    }

    // Below the smallest shipped asset there is no asset to use, so this is the one tier that still downscales -
    // and it downscales the SMALLEST file, not the largest, so a weak device never decodes 4 MB to throw it away.
    if (maxTex && maxTex < 2048) {
      var sub = tierOf('BASE', 'REAL_BASE_1024', 'MAX_TEXTURE_SIZE_BELOW_2048');
      sub.gpuW = 1024; sub.gpuH = 512; sub.resample = 'DOWNSCALE_2048_TO_1024';
      sub.estimated_gpu_bytes = estimateGpuBytes(1024, 512, true);
      return sub;
    }
    if (maxTex && maxTex < 4096) return tierOf('BASE', 'REAL_BASE_2048', 'MAX_TEXTURE_SIZE_BELOW_4096');
    if (!maxTex) return tierOf('BASE', 'REAL_BASE_2048', 'MAX_TEXTURE_SIZE_UNKNOWN');
    if (mem && mem < 4) return tierOf('BASE', 'REAL_BASE_2048', 'LOW_DEVICE_MEMORY');
    if (cores && cores < 4) return tierOf('BASE', 'REAL_BASE_2048', 'LOW_CORE_COUNT');
    if (!mem && !cores) return tierOf('BASE', 'REAL_BASE_2048', 'DEVICE_CAPABILITY_UNKNOWN');

    // HIGH needs three separate things: the texture size to hold it (§B7/§B8), a memory or parallelism signal
    // strong enough to justify a 4 MB download and 171 MB of texture memory (§B11), and room inside the stated
    // budget (§B6).
    //
    // THE WEBGL2 REQUIREMENT IS GONE, AND THAT IS A CONSEQUENCE OF THE ASSETS RATHER THAN A RELAXATION. The old
    // ladder reserved the top tier for WebGL2 because 5400x2700 is NPOT, and in WebGL1 an NPOT texture may have
    // neither mipmaps nor REPEAT wrapping - which would have traded aliasing across the whole minified globe for
    // close-zoom texels. Every tier is now power-of-two, so that constraint no longer exists and there is nothing
    // left for the version check to protect. §B6 asks for selection by ACTUAL capability, so capability is what
    // is checked; `gl2` still decides sRGB handling at upload time, which is a different question.
    var strong = (mem >= 8) || (!mem && cores >= 8);
    if (maxTex >= EARTH_ASSETS_.HIGH.w && strong &&
        estimateGpuBytes(EARTH_ASSETS_.HIGH.w, EARTH_ASSETS_.HIGH.h, true) <= budget) {
      return tierOf('HIGH', 'REAL_HIGH_8192', 'CAPABLE_AND_WITHIN_BUDGET');
    }
    if (maxTex >= EARTH_ASSETS_.MID.w &&
        estimateGpuBytes(EARTH_ASSETS_.MID.w, EARTH_ASSETS_.MID.h, true) <= budget) {
      return tierOf('MID', 'REAL_MID_4096',
        maxTex < EARTH_ASSETS_.HIGH.w ? 'MAX_TEXTURE_SIZE_BELOW_8192' : 'DEVICE_NOT_STRONG_ENOUGH_FOR_8192');
    }
    return tierOf('BASE', 'REAL_BASE_2048', 'BUDGET_ALLOWS_BASE_ONLY');
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
  // TEXTURE-3-R3 §C — uBias shifts clip-space z toward the viewer by a constant fraction of w. That is a
  // CONSTANT NDC offset, so it behaves identically at every camera distance, and it replaces the radial
  // elevation the boundary layers used to rely on. uBias is 0 for the arc layer, which is genuinely above the
  // surface and must be depth-tested against it honestly.
  var VS_LINE = 'attribute vec3 aPos;attribute vec4 aColor;uniform mat4 uMVP;uniform float uBias;varying vec4 vColor;void main(){vec4 p=uMVP*vec4(aPos,1.0);p.z-=uBias*p.w;gl_Position=p;vColor=aColor;}';
  // uAlphaMul is how the ADM1 layer FADES IN (§E) rather than switching on. It defaults to 1 and is set
  // explicitly on every draw, because a GL uniform persists between draw calls and an unset one would leak
  // the previous layer's fade onto the coastline.
  var FS_LINE = 'precision mediump float;uniform float uAlphaMul;varying vec4 vColor;void main(){gl_FragColor=vec4(vColor.rgb,vColor.a*uAlphaMul);}';

  // TEXTURE-3-R3 §E — THE SCREEN-SPACE RIBBON. Chrome clamps gl.lineWidth to 1.0, so a heavier national border
  // is impossible with gl.LINES; this expands each segment into a quad whose half-width is a fixed number of
  // DEVICE PIXELS, computed after projection. Because the width is applied in screen space it is invariant to
  // zoom - §E's "zooming does not make lines excessively thick" - and because the expansion is perpendicular to
  // the segment's own screen direction it stays a constant-width ribbon at any orientation, including at the
  // limb where the segment is nearly edge-on.
  //
  // A vertex behind the eye has w <= 0 and its screen position is meaningless, so the perpendicular falls back
  // to a fixed direction rather than producing a NaN that would blank the whole draw call. The far hemisphere is
  // removed by the depth test as before, not by this.
  var VS_RIBBON =
    'attribute vec3 aPos;attribute vec3 aOther;attribute float aSide;attribute vec4 aColor;' +
    'uniform mat4 uMVP;uniform vec2 uViewport;uniform float uHalfPx;uniform float uBias;' +
    'varying vec4 vColor;varying float vSide;' +
    'void main(){' +
    'vec4 p=uMVP*vec4(aPos,1.0);vec4 q=uMVP*vec4(aOther,1.0);' +
    'vec2 hp=uViewport*0.5;' +
    'vec2 dir=vec2(0.0,1.0);' +
    'if(p.w>0.0001&&q.w>0.0001){vec2 a=p.xy/p.w*hp;vec2 b=q.xy/q.w*hp;vec2 d=b-a;float L=length(d);' +
    'if(L>0.0001){dir=d/L;}}' +
    'vec2 nrm=vec2(-dir.y,dir.x);' +
    'p.xy+=nrm*aSide*uHalfPx/hp*p.w;' +
    'p.z-=uBias*p.w;' +
    'gl_Position=p;vColor=aColor;vSide=aSide;}';
  // No feathering, no glow: §E forbids a neon rim, and an alpha ramp across a 1.7 px ribbon would read as one.
  var FS_RIBBON = 'precision mediump float;uniform float uAlphaMul;varying vec4 vColor;varying float vSide;void main(){gl_FragColor=vec4(vColor.rgb,vColor.a*uAlphaMul);}';

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
      // TEXTURE-3-R3 §I — the UNMASKED renderer string, so a performance number can never be reported as
      // hardware when it came from a software rasteriser. Extension-gated and guarded: where the browser
      // withholds it (privacy settings, some Firefox builds) the value is UNAVAILABLE rather than a guess, and a
      // measurement labelled UNAVAILABLE must not be presented as a GPU result either.
      renderer: (function () {
        try {
          var dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            var r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
            if (r) return String(r);
          }
          var plain = gl.getParameter(gl.RENDERER);
          return plain ? String(plain) : 'UNAVAILABLE';
        } catch (e) { return 'UNAVAILABLE'; }
      })(),
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
      // TEXTURE-3-R3 §I — GPU UPLOAD is measured as its own phase. It is not the same thing as decode: the
      // browser decodes the JPEG into a bitmap, and texImage2D then copies that bitmap across to the driver
      // and generateMipmap builds the chain. On the 8192 tier the second half is 134 MB of traffic.
      var __upT0 = nowMsGlobal_();
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
      matInfo.gpu_upload_ms = Math.round((nowMsGlobal_() - __upT0) * 10) / 10;
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
    // THE SEASONAL MISMATCH THAT SHAPED THIS LADDER IS GONE (TEXTURE-3-R2 §L2). TEXTURE-2 measured the base
    // asset's boreal Canada at rgb ~49,54,22 (dark green) against the December high asset's rgb ~187,197,202
    // (snow) and built the ladder so the two are never seen in sequence. The high tier is now JULY 2004, and the
    // same box measures rgb(29,38,14) - the SAME class as the base. The ladder is kept exactly as it is anyway:
    // one visible transition per device is still the right behaviour, and it is now green -> green rather than
    // green -> white, so the transition is close to invisible instead of merely non-jarring.
    //
    // So there is exactly ONE visible material transition per device, never two:
    //   capable device      procedural bootstrap -> REAL HIGH        (the base asset is not even requested)
    //   low-capability      procedural bootstrap -> REAL BASE 2048   (the 2.5 MB asset is never requested, §I.5)
    //   high failed         -> REAL BASE 2048, with the reason reported
    //   asset unavailable   -> procedural fallback, with the reason reported
    // ONE LADDER WALK FOR ALL THREE TIERS.
    //
    // The previous version had a bespoke path for HIGH and another for BASE, with the second doubling as the
    // failure handler for the first. With a third tier that shape would have needed a third special case and the
    // fallback chain would have had two places to get wrong. So it is now a single function that applies a named
    // tier and, on ANY failure, steps to the next rung DOWN the same ladder - carrying the reason with it.
    //
    // §B9 is structural here rather than promised: `applyTier` only ever asks for a rung at or below the one
    // pickMaterialTier selected, so a device can never be sent to fetch a tier it did not earn.
    function tierNameFor(assetKey, gpuW) {
      if (assetKey === 'HIGH') return 'REAL_HIGH_8192';
      if (assetKey === 'MID') return 'REAL_MID_4096';
      return gpuW === 1024 ? 'REAL_BASE_1024' : 'REAL_BASE_2048';
    }

    function applyTier(assetKey, why) {
      var order = EARTH_TIER_ORDER_.indexOf(assetKey);
      if (order < 0) { applyProceduralFallback((why ? why + '_THEN_' : '') + 'UNKNOWN_TIER'); return Promise.resolve(); }
      var asset = EARTH_ASSETS_[assetKey];
      // The selected tier keeps its own GPU dimensions (the sub-1024 rung is the only one that differs from its
      // asset); every rung BELOW the selection is uploaded at the asset's native size.
      var gpuW = (assetKey === matTier.asset) ? matTier.gpuW : asset.w;
      var gpuH = (assetKey === matTier.asset) ? matTier.gpuH : asset.h;
      var next = EARTH_TIER_ORDER_[order + 1] || null;
      function stepDown(reason) {
        if (next) { applyTier(next, reason); }
        else { applyProceduralFallback(reason); }
      }
      return loadEarthImage(assetKey).then(function (img) {
        if (destroyed) return;
        if (assetKey === 'HIGH') matInfo.high_detail_load_ms = img.ms || 0;
        matInfo.load_ms_by_tier = matInfo.load_ms_by_tier || {};
        matInfo.load_ms_by_tier[assetKey] = img.ms || 0;
        // §I.7 - a failed OPTIONAL layer degrades to the tier below and SAYS SO. It never blanks the map.
        if (img.status !== 'READY') { stepDown((why ? why + '_THEN_' : '') + assetKey + '_ASSET_' + img.error); return; }
        // Every tier now matches its asset exactly, so this is a pass-through in the normal case; it stays in the
        // path because the sub-1024 rung still needs it, and because earthResample REFUSES to upscale, which is
        // the guard that keeps a missing/substituted asset from being silently magnified.
        var src = (gpuW === img.w && gpuH === img.h) ? img.img : earthResample(img.img, gpuW, gpuH);
        if (!src) { stepDown((why ? why + '_THEN_' : '') + assetKey + '_RESAMPLE_REFUSED_WOULD_UPSCALE'); return; }
        var resample = (gpuW === img.w && gpuH === img.h) ? 'NONE' : ('DOWNSCALE_' + img.w + '_TO_' + gpuW);
        if (!uploadAlbedo(src, gpuW, gpuH, assetKey === 'BASE' ? 'REAL_BASE' : ('REAL_' + assetKey),
              tierNameFor(assetKey, gpuW),
              asset.product + ' [' + asset.file + ']', asset.w + 'x' + asset.h, resample, img.w + 'x' + img.h)) {
          // §E.1-3 - abandon the attempt and fall back to a tier that is KNOWN to fit, so the globe is never left
          // holding an incomplete texture. The reason travels with it instead of being swallowed.
          stepDown((why ? why + '_THEN_' : '') + assetKey + '_UPLOAD_' + (matInfo.fallback_reason || 'FAILED'));
          return;
        }
        matDetailOn = fragHighp; matInfo.detail_enabled = matDetailOn;
        if (why) matInfo.fallback_reason = why;
        else if (!fragHighp) matInfo.fallback_reason = 'RELIEF_DISABLED_NO_FRAGMENT_HIGHP';
        recomputeZoomLimit(); schedule();
      });
    }

    // Kept as a named entry point because the context-restore path and the older call sites read better with it.
    function applyRealBase(why) { return applyTier('BASE', why); }

    function beginMaterialUpgrade() { applyTier(matTier.asset, ''); }

    var progSphere, progPts, progLine, progRibbon, sphere, buf = {}, tex;
    try {
      progSphere = program(gl, VS_SPHERE, FS_SPHERE);
      progPts = program(gl, VS_PTS, FS_PTS);
      progLine = program(gl, VS_LINE, FS_LINE);
      progRibbon = program(gl, VS_RIBBON, FS_RIBBON);
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
    // TEXTURE-3-R3 §E — the border classes carry alpha (coastline 0.55, ADM1 0.62) and the ADM1 layer fades
    // in with zoom, so blending has to be enabled for any of that to be visible rather than rounded to on/off.
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    var lastAdmin1LabelStats = { considered: 0, after_facing: 0, on_screen: 0, measured: 0, measure_cap: 0,
                                 candidates: 0, drawn: 0, budget: 0 };
    var degradeReason = '';
    var prevLabelSet = {}, prevAdmin1Set = {},
        lastLabelStats = { considered: 0, after_facing: 0, on_screen: 0, measured: 0, candidates: 0,
                           drawn: 0, tier: 0 };
    var lastLabelMs = 0, firstRenderMs = 0, framesDrawn = 0, lastFrameMs = 0, createT0 = nowMsGlobal_();
    var prevContinentSet = {};
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
      // TEXTURE-3-R3 §D — the active canonical topology follows the LOD. syncBorderSet() is a no-op unless
      // the WANTED set actually differs, so a slow zoom across a threshold re-uploads once, not per frame,
      // and the LOD hysteresis above is what keeps a camera resting on a boundary from thrashing it.
      syncBorderSet();
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
      var __frameT0 = nowMsGlobal_();
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
      // TEXTURE-3-R3 §D/§E — the three canonical classes, drawn in HIERARCHY ORDER: coastline, then ADM1, then
      // the international boundary last so it is the one that survives every overlap. There is no overlap to
      // resolve in the geometry (an edge belongs to exactly one class), so this ordering is purely about which
      // line wins where two DIFFERENT boundaries cross - and §D says the international one does.
      //
      // All three sit at r=1 and are separated from the surface by the depth bias only, so none of them can
      // drift from the ground it describes. The far hemisphere is still removed by the depth test.
      var activeSet = borderActive === 'FINE' ? layersFine : (borderActive === 'COARSE' ? layersCoarse : null);
      if (activeSet && showBorders) {
        var showAdm1 = admin1BordersVisible();
        var adm1Strength = admin1BorderStrength(cam.dist);
        // A fully transparent layer is still a full draw call over ~14,000 vertices, so it is skipped rather
        // than drawn at alpha 0 — the fade must not cost anything at the distances where it is invisible.
        if (adm1Strength <= 0.01) showAdm1 = false;
        ['COASTLINE', 'ADM1', 'INTERNATIONAL'].forEach(function (cls) {
          if (cls === 'ADM1' && !showAdm1) return;
          var L = activeSet.layers[cls];
          var n = borderCounts[cls];
          if (!L || !n) return;
          if (L.mode === 'RIBBON') {
            gl.useProgram(progRibbon);
            gl.bindBuffer(gl.ARRAY_BUFFER, borderBufs[cls]);
            var rp = gl.getAttribLocation(progRibbon, 'aPos'), ro = gl.getAttribLocation(progRibbon, 'aOther'),
                rs = gl.getAttribLocation(progRibbon, 'aSide'), rc = gl.getAttribLocation(progRibbon, 'aColor');
            var RS = 11 * 4;
            gl.enableVertexAttribArray(rp); gl.vertexAttribPointer(rp, 3, gl.FLOAT, false, RS, 0);
            gl.enableVertexAttribArray(ro); gl.vertexAttribPointer(ro, 3, gl.FLOAT, false, RS, 3 * 4);
            gl.enableVertexAttribArray(rs); gl.vertexAttribPointer(rs, 1, gl.FLOAT, false, RS, 6 * 4);
            gl.enableVertexAttribArray(rc); gl.vertexAttribPointer(rc, 4, gl.FLOAT, false, RS, 7 * 4);
            gl.uniformMatrix4fv(gl.getUniformLocation(progRibbon, 'uMVP'), false, new Float32Array(mvp));
            // The viewport is in DEVICE pixels and so is the half-width, so the ribbon is a constant number of
            // device pixels on a HiDPI screen rather than a constant number of CSS pixels.
            gl.uniform2f(gl.getUniformLocation(progRibbon, 'uViewport'), gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.uniform1f(gl.getUniformLocation(progRibbon, 'uHalfPx'), L.widthPx * 0.5 * dpr);
            gl.uniform1f(gl.getUniformLocation(progRibbon, 'uBias'), BORDER_DEPTH_BIAS_);
            gl.uniform1f(gl.getUniformLocation(progRibbon, 'uAlphaMul'), 1);
            gl.drawArrays(gl.TRIANGLES, 0, n);
          } else {
            gl.useProgram(progLine);
            gl.bindBuffer(gl.ARRAY_BUFFER, borderBufs[cls]);
            stride7(progLine);
            gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'uMVP'), false, new Float32Array(mvp));
            gl.uniform1f(gl.getUniformLocation(progLine, 'uBias'), BORDER_DEPTH_BIAS_);
            gl.uniform1f(gl.getUniformLocation(progLine, 'uAlphaMul'), cls === 'ADM1' ? adm1Strength : 1);
            gl.drawArrays(gl.LINES, 0, n);
          }
        });
      }

      // arcs (depth-tested → back segments occluded by the sphere)
      if (lineCount) {
        gl.useProgram(progLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.line); gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW);
        stride7(progLine);
        gl.uniformMatrix4fv(gl.getUniformLocation(progLine, 'uMVP'), false, new Float32Array(mvp));
        // uBias is EXPLICITLY zero here. A GL uniform persists on the program between draw calls, so
        // without this the arcs would silently inherit the border layers' depth bias and be pulled toward
        // the viewer - a shipment route is genuinely ABOVE the surface and must be depth-tested honestly.
        gl.uniform1f(gl.getUniformLocation(progLine, 'uBias'), 0);
        gl.uniform1f(gl.getUniformLocation(progLine, 'uAlphaMul'), 1);
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
      framesDrawn++;
      // §I — FIRST RENDER, recorded once: the interval from create() to the end of the first complete frame.
      // Everything after it is a redraw, and averaging the two would hide whichever one matters.
      if (framesDrawn === 1) firstRenderMs = Math.round((nowMsGlobal_() - createT0) * 10) / 10;
      lastFrameMs = Math.round((nowMsGlobal_() - __frameT0) * 100) / 100;
    }

    // TEXTURE-3-R3 §G — one clipping rule for all label classes. A label is admitted only if its whole painted
    // box, plus the halo width, fits inside the viewport. `PAD` is the halo's own outset: the stroke is 3 px
    // wide and centred on the glyph edge, so the ink reaches 1.5 px beyond the measured box.
    var LABEL_EDGE_PAD_ = 2;
    function boxInsideViewport(x, y, w, h) {
      var hw = w / 2 + LABEL_EDGE_PAD_, hh = h / 2 + LABEL_EDGE_PAD_;
      return (x - hw) >= 0 && (x + hw) <= W && (y - hh) >= 0 && (y + hh) <= H;
    }
    // A cheap ANCHOR test used before the text is resolved, when the box is not known yet. It is deliberately
    // generous - half the viewport's shorter side - so it only removes anchors that no label of any plausible
    // width could reach into frame from. The exact box test above still runs on everything that survives.
    function anchorNearViewport(x, y) {
      var m = Math.max(64, Math.min(W, H) * 0.5);
      return x >= -m && x <= W + m && y >= -m && y <= H + m;
    }

    // ==========================================================================================================
    // TEXTURE-3-R4 §C — WHY THIS PASS IS SHAPED THE WAY IT IS.
    // ----------------------------------------------------------------------------------------------------------
    // MEASURED BEFORE: at the dense-Europe zoom the label pass was 3.1 ms of a 3.44 ms frame, and the reason was
    // in the counters rather than in the renderer - 1,706 division candidates were projected, name-resolved and
    // text-measured to draw 22. Ninety-nine per cent of the layout work was thrown away, which is exactly what
    // §C's "labels rejected by collision must not consume draw/layout work" forbids.
    //
    // THREE THINGS CHANGED, IN THIS ORDER:
    //
    //   1 A CULL THAT COSTS THREE MULTIPLIES. `facing` is (model * v).z, and for a rotation matrix that is one
    //     dot product. It now runs BEFORE the projection instead of being read off the projection's result, so
    //     the ~97% of divisions that face away are rejected without a 4x4 apply or a single allocation.
    //
    //   2 MEASUREMENT IS BOUNDED BY THE BUDGET, NOT BY THE DATASET. The ordering keys - class, priority,
    //     LABELRANK, identity - are all known WITHOUT the text, so the candidates are ordered and cut to
    //     budget x LABEL_MEASURE_FACTOR first, and only those are name-resolved and measured. The count that is
    //     actually measured is reported, so a cut is visible rather than silent.
    //
    //   3 RESOLVED TEXT AND TEXT METRICS ARE CACHED BY IDENTITY. Both are pure functions of inputs that do not
    //     change between frames; recomputing them per frame was work with no output.
    //
    // WHAT DID NOT CHANGE: which labels are chosen. The cull is the same predicate the pass already applied, the
    // ordering is the same total order, and the collision pass is the same function. This is the same answer
    // computed without the discarded work.
    // ==========================================================================================================

    // Unit-sphere anchors, built once per dataset. Rebuilding a vector per label per frame was ~4,000 array
    // allocations a frame for a value that is a property of the data.
    var countryAnchors = null, admin1Anchors = null;
    function buildCountryAnchors() {
      var list = (countryData && countryData.countries) || [];
      countryAnchors = new Array(list.length);
      for (var i = 0; i < list.length; i++) {
        var v = latLngToVec3(list[i].label[1], list[i].label[0], BORDER_R);
        countryAnchors[i] = { d: list[i], x: v[0], y: v[1], z: v[2] };
      }
    }
    function buildAdmin1Anchors() {
      var list = (admin1Data && admin1Data.admin1) || [];
      admin1Anchors = new Array(list.length);
      for (var i = 0; i < list.length; i++) {
        var d = list[i], v = latLngToVec3(d.l[1], d.l[0], BORDER_R);
        admin1Anchors[i] = { d: d, x: v[0], y: v[1], z: v[2] };
      }
    }

    // Text and metrics caches. The resolver is pure and the fonts are fixed per class, so both keys are stable
    // for the life of the instance. Bounded by the dataset: at most one entry per division per font size.
    var labelTextCache = {}, labelMetricCache = {};
    function measureCached(font, text) {
      var k = font + '\u0000' + text;
      var w = labelMetricCache[k];
      if (w === undefined) {
        if (labelCtx.font !== font) labelCtx.font = font;
        w = labelCtx.measureText(text).width;
        labelMetricCache[k] = w;
      }
      return w;
    }

    var _proj = { x: 0, y: 0, facing: 0, front: false };

    // §G — THE CONTINENT LAYER. §G asks for restrained continent names on the default globe view and for them to
    // fade when no longer useful. Anchors are DERIVED from the vendored country label points (see
    // continentAnchors) and the names come from the same KM.geoNames authority as everything else, at its
    // ZH_HANT_REVIEWED_LIST level. Nothing here invents a name or a position.
    var continentCache = null;
    function continentList() {
      if (continentCache) return continentCache;
      var G = (typeof window !== 'undefined' && window.KM && window.KM.geoNames) ? window.KM.geoNames : null;
      if (!G || !countryData) { continentCache = []; return continentCache; }
      var anchors = continentAnchors(countryData, function (iso) {
        try { return G.continentOfCountry(iso) || ''; } catch (e) { return ''; }
      });
      // TEXTURE-3-R6 §B — THE CALLER'S HALF OF THE LEAK, WHICH WAS INDEPENDENT OF THE RESOLVER'S.
      //
      // This used to read:
      //     var nm = a.key;
      //     try { var r = G.continent(a.key); if (r && r.name) nm = r.name; } catch (e) {}
      //
      // Two separate failures in three lines, and fixing only the resolver would have left the second one:
      //
      //   1. `nm` was SEEDED with the raw English key before the authority was consulted at all, so the English
      //      string was the starting point rather than a fallback anybody had chosen.
      //   2. `if (r && r.name)` treated an EMPTY name as "the resolver had nothing to say" and kept the seed.
      //      That is exactly backwards: an empty name is the resolver's most deliberate answer — HIDE THIS —
      //      and this line converted it into "paint the English key".
      //
      // So a hidden label is now DROPPED, and the resolver's refusal is the only thing that decides it. The
      // page carries no key list and no dictionary of its own (§B), and a resolver that throws is treated as
      // absent rather than as permission to paint the source string.
      continentCache = anchors.map(function (a) {
        var r = null;
        try { r = G.continent(a.key); } catch (e) { r = null; }
        var nm = (r && r.name) ? r.name : '';
        return { key: a.key, vec: a.vec, text: nm, members: a.members,
                 hidden_reason: (r && !r.name) ? (r.hidden_reason || 'HIDDEN') : '' };
      }).filter(function (a) {
        // No name, no label. This is the §B rule and it is deliberately unconditional: there is no branch here
        // that can decide to paint something the authority declined to name.
        if (!a.text) return false;
        // Antarctica's derived anchor is the pole, where an equirectangular label is meaningless and the
        // projection is degenerate. It is dropped rather than placed badly.
        return a.key !== 'Antarctica';
      });
      return continentCache;
    }

    // ==========================================================================================================
    // TEXTURE-3 — GEOGRAPHIC LABEL TEXT. One place, so the language rule cannot drift between the layers.
    // ----------------------------------------------------------------------------------------------------------
    // The name authority is KM.geoNames (assets/js/core/geo-name-resolver.js) over the vendored zh-Hant assets.
    // It is consulted through a guarded call rather than assumed present: if an asset or the resolver has not
    // loaded, these fall back to exactly what the globe painted before localization - the ISO code and the
    // division code - so a missing asset degrades the LANGUAGE and never the map.
    //
    // No conversion happens here and no name is invented. Whatever the resolver returns is painted verbatim.
    // ==========================================================================================================
    function countryLabelText(iso) {
      var key = 'C:' + iso;
      var hit = labelTextCache[key];
      if (hit !== undefined) return hit;
      var out = String(iso == null ? '' : iso);
      try {
        if (window.KM && window.KM.geoNames && typeof window.KM.geoNames.country === 'function') {
          var r = window.KM.geoNames.country(iso);
          if (r && r.name) out = r.name;
        }
      } catch (e) {}
      labelTextCache[key] = out;
      return out;
    }
    // TEXTURE-3-R4 §B — the division's name is resolved with its `adm1_code`, because two of the three levels
    // above the English fallback are keyed on that stable source identity. Passing only the DISPLAYED code would
    // reach the wrong row: `country|displayedCode` collides across 53 rows, BA|BIH alone over nine cantons.
    function admin1LabelText(d) {
      var code = String((d && d.k) == null ? '' : d.k);
      var adm1 = String((d && d.a) == null ? '' : d.a);
      var key = 'A:' + (adm1 || (d && d.c) + '/' + code);
      var hit = labelTextCache[key];
      if (hit !== undefined) return hit;
      var full = (d && d.n != null && d.n !== '') ? String(d.n) : code;
      var out = code;
      try {
        if (window.KM && window.KM.geoNames && typeof window.KM.geoNames.admin1 === 'function') {
          var r = window.KM.geoNames.admin1(d && d.c, code, { english: full, adm1Code: adm1 });
          if (r && r.name) out = r.name;
        }
      } catch (e) {}
      labelTextCache[key] = out;
      return out;
    }

    function fontFor(px, weight) {
      return weight + ' ' + px + 'px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", ' +
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    }

    var lastContinentStats = { candidates: 0, drawn: 0, strength: 0 };
    var lastLabelPlan = null;

    // MAP-COUNTRY-BOUNDARY-1 §F/§G, TEXTURE-3-R4 §C — build every class's candidates, plan once, paint once.
    // One 2D canvas, cleared and redrawn; no DOM node is created or removed here.
    function drawCountryLabels() {
      if (!labelCtx) return;
      // §I — LABEL PLACEMENT is a separate phase from rendering: it is synchronous CPU work on a 2D canvas
      // (cull, project, order, measure, collide, paint) and it is charged to no GPU. Measuring it separately is
      // how the first frame-timing attempt was caught measuring labels instead of frames.
      var __lblT0 = nowMsGlobal_();
      labelCtx.setTransform(1, 0, 0, 1, 0, 0);
      labelCtx.clearRect(0, 0, labelCv.width, labelCv.height);
      // §G LAYER INDEPENDENCE. This canvas carries several layers, so it may only bail when NONE has anything to
      // draw. Bailing whenever country labels were off would silently chain the ADM1 toggle to the country one.
      var wantCountry = showLabels && !!(countryData && countryData.countries);
      var wantAdmin1 = admin1LabelsVisible() && !!(admin1Data && admin1Data.admin1);
      if (!wantCountry && !wantAdmin1) {
        lastLabelStats = { considered: 0, after_facing: 0, on_screen: 0, measured: 0, candidates: 0, drawn: 0, tier: 0 };
        lastAdmin1LabelStats = { considered: 0, after_facing: 0, on_screen: 0, measured: 0, measure_cap: 0,
                                 candidates: 0, drawn: 0, budget: 0 };
        lastContinentStats = { candidates: 0, drawn: 0, strength: 0 };
        lastLabelPlan = null;
        lastLabelMs = Math.round((nowMsGlobal_() - __lblT0) * 100) / 100;
        return;
      }
      labelCtx.scale(dpr, dpr);   // §F/§K DPR-aware: draw in CSS pixels onto a device-pixel backing store
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      labelCtx.lineJoin = 'round';

      // TEXTURE-3-R3 §G — the sizes come from ONE ladder (17 / 12 / 9 px) so the hierarchy cannot drift into
      // three near-identical sizes, which is what R2's captures showed.
      var SIZES = labelSizes(cam.dist);
      var fontPx = SIZES.country;
      // TEXTURE-3 — A TRADITIONAL-CHINESE-PREFERRING STACK, NOT JUST ANY CJK FONT. Han characters shared between
      // the two orthographies have DIFFERENT GLYPH SHAPES per region, and a generic `system-ui` can resolve them
      // through a Simplified-Chinese face - which would render zh-Hant text in zh-Hans letterforms and quietly
      // undo the whole point of sourcing verified Traditional names. The zh-TW faces are therefore named first
      // (Windows, macOS/iOS, then Noto), with the previous Latin stack retained behind them unchanged.
      var countryFont = fontFor(fontPx, '700');
      var continentFont = fontFor(SIZES.continent, '600');
      var admin1Font = fontFor(SIZES.admin1, '600');

      // ---- CLASS 0: OPERATIONAL ----------------------------------------------------------------------------
      // Shipment markers are the business objects; a geographic reference may never sit on top of one. They are
      // pre-sized rectangles rather than text, so they are never measured and never dropped.
      var markerRects = [];
      for (var m = 0; m < markers.length; m++) {
        var mk = markers[m];
        if (!isFinite(mk.lat) || !isFinite(mk.lng)) continue;
        var mv3 = latLngToVec3(mk.lat, mk.lng, mk.elev || MARKER_R_);
        if (!projectInto(mvp, model, mv3[0], mv3[1], mv3[2], W, H, _proj) || !_proj.front) continue;
        var half = ((mk.size || 10) / 2) + 3;
        markerRects.push({ x0: _proj.x - half, x1: _proj.x + half, y0: _proj.y - half, y1: _proj.y + half });
      }

      // ---- CLASS 1: COUNTRY --------------------------------------------------------------------------------
      if (!countryAnchors && countryData) buildCountryAnchors();
      var tier = countryLabelTier(cam.dist);
      var cands = [], cConsidered = 0, cFacing = 0, cScreen = 0;
      if (wantCountry && countryAnchors) {
        cConsidered = countryAnchors.length;
        for (var i = 0; i < countryAnchors.length; i++) {
          var a = countryAnchors[i], c = a.d;
          // §C — the cull first, and it costs three multiplies. Everything below it is more expensive.
          // §F — and it is the COUNTRY threshold, not the bare rear-hemisphere test: see the note on
          // COUNTRY_LABEL_MIN_FACING_ for the capture that made the difference visible.
          if (facingOf(model, a.x, a.y, a.z) < COUNTRY_LABEL_MIN_FACING_) continue;
          cFacing++;
          var pri = countryPriorityOf(c.iso, countryPriority);
          // A priority country is never hidden by the zoom tier — an active shipment's country must stay
          // readable however far out the operator is looking.
          if (pri > 3 && c.rank > tier) continue;
          if (!projectInto(mvp, model, a.x, a.y, a.z, W, H, _proj)) continue;
          if (!anchorNearViewport(_proj.x, _proj.y)) continue;
          cScreen++;
          cands.push({ iso: c.iso, x: _proj.x, y: _proj.y, rank: c.rank, priority: pri, cls: 'COUNTRY' });
        }
      }
      // §C — ordered BEFORE the text is resolved, because every ordering key is known without it. The country
      // class has no budget: §C requires country readability not to regress, and 175 cached measurements cost
      // nothing after the first frame.
      var cOrdered = orderLabelCandidates(cands), cMeasured = 0, countryCands = [];
      for (var ci = 0; ci < cOrdered.length; ci++) {
        var cc = cOrdered[ci];
        // TEXTURE-3 — the DISPLAYED text is the resolved Traditional Chinese country name; the ISO code stays
        // the label's IDENTITY. That separation matters: `iso` keys the previous-frame set that gives the
        // collision pass its hysteresis, so keying on display text would make a language change look like a
        // different label and reintroduce the flicker the hysteresis exists to stop. The width is measured on
        // the text actually painted, so collision boxes stay honest - a Chinese name is wider than two letters.
        cc.text = countryLabelText(cc.iso);
        cc.w = measureCached(countryFont, cc.text);
        cc.h = fontPx;
        cMeasured++;
        // TEXTURE-3-R3 §G — "no clipped label at the globe edge", tested on the label's own BOX rather than on
        // its anchor, so a label is either wholly readable or absent.
        if (!boxInsideViewport(cc.x, cc.y, cc.w, cc.h)) continue;
        countryCands.push(cc);
      }

      // ---- CLASS 2: CONTINENT ------------------------------------------------------------------------------
      var contStrength = continentStrength(cam.dist), continentCands = [];
      if (contStrength > 0.02) {
        var clist = continentList();
        for (var k2 = 0; k2 < clist.length; k2++) {
          var ca = clist[k2];
          if (facingOf(model, ca.vec[0] * BORDER_R, ca.vec[1] * BORDER_R, ca.vec[2] * BORDER_R) < COUNTRY_LABEL_MIN_FACING_) continue;
          if (!projectInto(mvp, model, ca.vec[0] * BORDER_R, ca.vec[1] * BORDER_R, ca.vec[2] * BORDER_R, W, H, _proj)) continue;
          var cw2 = measureCached(continentFont, ca.text);
          if (!boxInsideViewport(_proj.x, _proj.y, cw2, SIZES.continent)) continue;
          continentCands.push({ iso: 'CONT:' + ca.key, text: ca.text, x: _proj.x, y: _proj.y,
            w: cw2, h: SIZES.continent, rank: 1, priority: 5, cls: 'CONTINENT' });
        }
      }

      // ---- CLASS 3: ADM1 -----------------------------------------------------------------------------------
      var budget = wantAdmin1 ? admin1LabelBudget(lod) : 0;
      var measureCap = budget * LABEL_MEASURE_FACTOR_;
      var aConsidered = 0, aFacing = 0, aScreen = 0, aMeasured = 0, admin1Cands = [];
      if (budget > 0) {
        if (!admin1Anchors) buildAdmin1Anchors();
        aConsidered = admin1Anchors.length;
        var raw = [];
        for (var ai = 0; ai < admin1Anchors.length; ai++) {
          var an = admin1Anchors[ai], d = an.d;
          if (admin1Countries && admin1Countries.indexOf(d.c) === -1) continue;
          // §G — AND NOT AT THE LIMB. `front` admits the whole near hemisphere, which is why the Europe capture
          // carried Indiana, Rondonia, Ceara and Nagasaki-ken squeezed against the horizon while the camera was
          // looking at Germany. A division label is a REGIONAL aid: 0.55 keeps it within about 57 degrees of the
          // view axis, which is the part of the globe the operator is actually reading. §C: this rejection now
          // happens before any projection, so a back-facing label consumes no layout work at all.
          if (facingOf(model, an.x, an.y, an.z) < ADMIN1_LABEL_MIN_FACING_) continue;
          aFacing++;
          if (!projectInto(mvp, model, an.x, an.y, an.z, W, H, _proj)) continue;
          if (!anchorNearViewport(_proj.x, _proj.y)) continue;
          aScreen++;
          // TEXTURE-3-R3 §D — IDENTITY IS `d.a` (Natural Earth adm1_code), NOT `d.c + '/' + d.k`. The old key was
          // `country|displayedCode`, which §D prohibits and which is measurably not unique: 35 keys collide
          // across 53 rows, and BA|BIH alone covers nine Bosnian cantons. This key is the label layer's
          // collision-memory key, so nine cantons shared one memory slot.
          raw.push({ iso: d.a || (d.c + '/' + d.k), x: _proj.x, y: _proj.y,
            rank: d.r, priority: 6, cls: 'ADM1', d: d });
        }
        // §C — THE BOUND. Ordering needs no text, so it happens first and the list is cut to what the budget
        // could possibly consume. `measured` and `measure_cap` are both reported: a cut is a fact, not a silence.
        var aOrdered = orderLabelCandidates(raw).slice(0, measureCap);
        for (var aj = 0; aj < aOrdered.length; aj++) {
          var ac = aOrdered[aj];
          ac.text = admin1LabelText(ac.d);
          ac.w = measureCached(admin1Font, ac.text);
          ac.h = SIZES.admin1;
          aMeasured++;
          if (!boxInsideViewport(ac.x, ac.y, ac.w, ac.h)) continue;
          admin1Cands.push(ac);
        }
      }

      // ---- ONE PLAN ----------------------------------------------------------------------------------------
      // §C/§D — the precedence lives in planLabelSet, not in the order these paint calls happen to appear in.
      var plan = planLabelSet(
        { operational: markerRects, country: countryCands, continent: continentCands, adm1: admin1Cands },
        { previous: { country: prevLabelSet, continent: prevContinentSet, adm1: prevAdmin1Set } });
      lastLabelPlan = plan;

      // ---- PAINT -------------------------------------------------------------------------------------------
      var drawn = plan.accepted.country, next = {};
      labelCtx.font = countryFont;
      labelCtx.lineWidth = 3;
      labelCtx.strokeStyle = 'rgba(6,10,20,0.86)';   // dark halo -> readable over ocean AND land (§F/§K)
      for (var d2 = 0; d2 < drawn.length; d2++) {
        var lab = drawn[d2];
        next[lab.iso] = 1;
        labelCtx.fillStyle = lab.priority <= 1 ? 'rgba(250,224,140,0.98)' : 'rgba(226,235,248,0.92)';
        labelCtx.strokeText(lab.text, lab.x, lab.y);
        labelCtx.fillText(lab.text, lab.x, lab.y);
      }
      prevLabelSet = next;
      lastLabelStats = { considered: cConsidered, after_facing: cFacing, on_screen: cScreen,
                         measured: cMeasured, candidates: countryCands.length, drawn: drawn.length, tier: tier };

      // Restrained by design: a continent name is context, not a destination. Faint, and larger rather than
      // louder, which is the cartographic convention for a label that names a region rather than a place.
      var cdrawn = plan.accepted.continent, cnext = {};
      if (cdrawn.length) {
        labelCtx.font = continentFont;
        labelCtx.lineWidth = 3.5;
        labelCtx.strokeStyle = 'rgba(6,10,20,' + (0.55 * contStrength).toFixed(3) + ')';
        labelCtx.fillStyle = 'rgba(206,220,238,' + (0.62 * contStrength).toFixed(3) + ')';
        for (var d3 = 0; d3 < cdrawn.length; d3++) {
          cnext[cdrawn[d3].iso] = 1;
          labelCtx.strokeText(cdrawn[d3].text, cdrawn[d3].x, cdrawn[d3].y);
          labelCtx.fillText(cdrawn[d3].text, cdrawn[d3].x, cdrawn[d3].y);
        }
      }
      prevContinentSet = cnext;
      lastContinentStats = { candidates: continentCands.length, drawn: cdrawn.length,
                             strength: Math.round(contStrength * 100) / 100 };

      // §E — the budget is the blunt guarantee behind the collision pass: "must not instantly stuff every
      // division and its text onto the screen". It is applied to the ORDERED accepted list, so what survives a
      // crowded view is the highest-rank divisions rather than whichever happened to be first in the dataset.
      var adrawn = plan.accepted.adm1.slice(0, budget), anext = {};
      if (adrawn.length) {
        labelCtx.font = admin1Font;
        labelCtx.lineWidth = 2.5;
        labelCtx.strokeStyle = 'rgba(6,10,20,0.80)';
        labelCtx.fillStyle = 'rgba(196,212,232,0.86)';   // dimmer than a country name — subordinate, still legible
        for (var d4 = 0; d4 < adrawn.length; d4++) {
          anext[adrawn[d4].iso] = 1;
          labelCtx.strokeText(adrawn[d4].text, adrawn[d4].x, adrawn[d4].y);
          labelCtx.fillText(adrawn[d4].text, adrawn[d4].x, adrawn[d4].y);
        }
      }
      prevAdmin1Set = anext;
      lastAdmin1LabelStats = { considered: aConsidered, after_facing: aFacing, on_screen: aScreen,
                               measured: aMeasured, measure_cap: measureCap,
                               candidates: admin1Cands.length, drawn: adrawn.length, budget: budget };

      lastLabelMs = Math.round((nowMsGlobal_() - __lblT0) * 100) / 100;
    }

    function admin1BordersVisible() { return layerVisible(showAdmin1Borders, lod, ADMIN1_BORDER_MIN_LOD) && !!admin1Data; }
    function admin1LabelsVisible() { return layerVisible(showAdmin1Labels, lod, ADMIN1_LABEL_MIN_LOD) && !!admin1Data; }

    // ==========================================================================================================
    // TEXTURE-3-R3 §D — TWO CANONICAL TOPOLOGIES, ONE ACTIVE AT A TIME
    // ==========================================================================================================
    // WHY TWO, AND WHY NOT MERGED. Measured: only 7 of the ADM1 dataset's 67,976 unique edges match a
    // country-dataset edge exactly. The 110m country rings and the 10m ADM1 rings are independent
    // generalisations of the same boundaries, so there is no shared vertex to join them on, and welding them
    // would need a ~0.2 deg (about 20 km) snap tolerance - large enough to also fuse genuinely separate islands.
    //
    // So each dataset gets its own internally-consistent topology and EXACTLY ONE IS DRAWN:
    //   LOD 0-1 (global, medium)  COARSE  from world-countries-110m — coastline + international, 6,656 edges
    //   LOD 2+  (regional, close) FINE    from world-admin1-10m     — coastline + international + ADM1, 67,976
    //
    // That is what makes §D's "shared country edge rendered once" true ACROSS layers and not merely within one:
    // the previous arrangement drew the 110m country outline AND the 10m ADM1 outer rings simultaneously, so
    // every coastline was drawn twice at two different resolutions, about 0.2 deg apart. Switching the whole set
    // per LOD means the outline changes resolution at the LOD boundary - which is what LOD is - instead of two
    // resolutions of the same coastline being visible at once.
    //
    // The ADM1 topology is the one that makes the hierarchy complete, because it is the only dataset that knows
    // where divisions are. Its coastline and international classes come from the SAME rings as its ADM1 class,
    // so an ADM1 border meets the coast at a shared vertex rather than near it: combined dangling endpoints are
    // 0 (measured), against 4,554 if the ADM1 class were drawn against a 110m coastline.
    var topoCoarse = null, topoFine = null;
    var layersCoarse = null, layersFine = null;
    var borderBufs = { COASTLINE: null, INTERNATIONAL: null, ADM1: null };
    var borderCounts = { COASTLINE: 0, INTERNATIONAL: 0, ADM1: 0 };
    var borderActive = 'NONE';
    var topoBuildMs = { coarse: 0, fine: 0 }, borderUploadMs = { coarse: 0, fine: 0 };

    function topologyModule() {
      return (typeof window !== 'undefined' && window.KM && window.KM.geoTopology) ? window.KM.geoTopology : null;
    }
    function nowMs() {
      try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; } catch (e) { return 0; }
    }

    function buildCoarseTopology() {
      var T = topologyModule();
      if (!T || !countryData || !countryData.countries || !countryData.countries.length) return;
      var t0 = nowMs();
      var f = T.countryFeatures(countryData);
      topoCoarse = T.build(f.features);
      layersCoarse = buildBorderLayers(topoCoarse, {});
      topoBuildMs.coarse = Math.round((nowMs() - t0) * 10) / 10;
    }
    function buildFineTopology() {
      var T = topologyModule();
      if (!T || !admin1Data || !admin1Data.admin1 || !admin1Data.admin1.length) return;
      var t0 = nowMs();
      var f = T.admin1Features(admin1Data, decodeAdmin1Ring);
      // §D — a missing stable source identity is a NAMED failure, never a silent fall back to a colliding key.
      if (f.missing_identity) { degradeReason = 'ADMIN1_MISSING_SOURCE_IDENTITY_' + f.missing_identity; }
      if (f.colliding_identity) { degradeReason = 'ADMIN1_COLLIDING_SOURCE_IDENTITY_' + f.colliding_identity; }
      topoFine = T.build(f.features);
      layersFine = buildBorderLayers(topoFine, { countries: admin1Countries });
      topoBuildMs.fine = Math.round((nowMs() - t0) * 10) / 10;
    }

    // Upload whichever set the current LOD calls for. Called on LOD transition, on dataset attach and on context
    // restore — never from draw() when the active set has not changed.
    function uploadBorderSet(which) {
      var set = which === 'FINE' ? layersFine : layersCoarse;
      if (!set) { borderActive = 'NONE'; borderCounts = { COASTLINE: 0, INTERNATIONAL: 0, ADM1: 0 }; return; }
      var t0 = nowMs();
      try {
        ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (cls) {
          var L = set.layers[cls];
          if (!L || !L.vertexCount) { borderCounts[cls] = 0; return; }
          if (!borderBufs[cls]) borderBufs[cls] = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, borderBufs[cls]);
          gl.bufferData(gl.ARRAY_BUFFER, L.positions, gl.STATIC_DRAW);
          borderCounts[cls] = L.vertexCount;
        });
        borderActive = which;
        countryVertexCount = borderCounts.COASTLINE + borderCounts.INTERNATIONAL;
        admin1VertexCount = borderCounts.ADM1;
        countryInfo = set.layers.INTERNATIONAL;
        admin1Info = set.layers.ADM1;
        countryBufferBuilds++;
        if (which === 'FINE') { admin1BufferBuilds++; admin1BuildMs = topoBuildMs.fine; }
        borderUploadMs[which === 'FINE' ? 'fine' : 'coarse'] = Math.round((nowMs() - t0) * 10) / 10;
      } catch (e) {
        // §H.7/§H.8 — a failed geographic layer must never take the map down. The base globe, the routes, the
        // markers and every interaction keep working; only this reference layer is absent, and it says why.
        borderActive = 'NONE';
        borderCounts = { COASTLINE: 0, INTERNATIONAL: 0, ADM1: 0 };
        countryVertexCount = 0; admin1VertexCount = 0;
        degradeReason = 'BORDER_BUFFER_BUILD_FAILED';
      }
    }

    // The set the current LOD wants. FINE needs the ADM1 dataset to have arrived; until it does, COARSE is used
    // at every LOD, which is exactly the pre-attach behaviour and is why a slow ADM1 fetch is never a blank map.
    function wantedBorderSet() {
      if (layersFine && layerVisible(showAdmin1Borders, lod, ADMIN1_BORDER_MIN_LOD)) return 'FINE';
      return layersCoarse ? 'COARSE' : 'NONE';
    }
    function syncBorderSet() {
      var want = wantedBorderSet();
      if (want !== borderActive) uploadBorderSet(want);
    }

    function rebuildAdmin1Buffer() { buildFineTopology(); syncBorderSet(); }
    function rebuildCountryBuffer() { buildCoarseTopology(); syncBorderSet(); }

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
    // TEXTURE-3-R6 §C/§D — ROUTE ARC GEOMETRY, AND WHAT R5's CAPTURES WERE ACTUALLY SHOWING.
    //
    // R5 reported "markers render, no arc is drawn" from the acceptance captures and could not find a cause in
    // the engine. The cause was not in the engine: tools/geo/capture-views.js called
    // setArcs([{ from: [lat,lng], to: [lat,lng] }]), and this function reads `a.points`. `a.points` was
    // undefined, `pts` became [], the leg loop never ran, and lineCount was 0 — silently, with no error.
    //
    // The shipped page has always passed `{ points: seq }` (global-logistics-map.js), so PRODUCTION ARCS WERE
    // NEVER BROKEN. The real finding is worse than a broken arc: the acceptance harness had never once
    // exercised the arc contract, so no round had visually verified route arcs at all.
    //
    // THE API IS NOT WIDENED TO ACCEPT `from`/`to`. That would leave two payload shapes for one meaning, which
    // is the same defect class R5 spent its conflict resolution removing from the name resolver. One shape, and
    // a caller using the wrong one now finds out immediately — see `skipped` below, surfaced through
    // getRouteInfo() rather than swallowed. A silent [] is what let this survive five rounds.
    var routeInfo = { arcs_in: 0, arcs_drawn: 0, arcs_skipped: 0, segments: 0, vertices: 0, skipped: [] };
    function rebuildLines() {
      var arr = [];
      routeInfo = { arcs_in: arcs.length, arcs_drawn: 0, arcs_skipped: 0, segments: 0, vertices: 0, skipped: [] };
      arcs.forEach(function (a, ai) {
        var c = a.color || [0, 0.5, 0.73];
        var raw = a.points;
        function skip(reason, detail) {
          routeInfo.arcs_skipped++;
          routeInfo.skipped.push({ index: ai, id: (a.id == null ? '' : String(a.id)), reason: reason,
                                   detail: (detail == null ? '' : String(detail)) });
        }
        // §D: an unresolved route fails CLOSED and says why. Each branch is a distinct, named refusal because
        // "no arc appeared" is the one symptom all of them share and the least useful thing to be told.
        if (!raw || !raw.length) { skip('NO_POINTS', 'arc carries no `points` array'); return; }
        if (!Array.isArray(raw)) { skip('POINTS_NOT_ARRAY', typeof raw); return; }
        var pts = [];
        for (var k = 0; k < raw.length; k++) {
          var p = raw[k];
          // rebuildPoints() has always validated its coordinates with isFinite; this function never did, so a
          // NaN latitude anywhere in a route produced NaN vertices and a route that vanished without a word.
          // The asymmetry between the two builders was the second half of §D's "fails closed and reports why".
          if (!p || !isFinite(p[0]) || !isFinite(p[1])) { skip('NODE_UNRESOLVED', 'index ' + k); return; }
          if (p[0] < -90 || p[0] > 90 || p[1] < -180 || p[1] > 180) {
            skip('NODE_OUT_OF_RANGE', 'index ' + k + ' (' + p[0] + ',' + p[1] + ')'); return;
          }
          pts.push(p);
        }
        // §D: a single-node route draws its marker and NO invented arc. Reported so "one node" is
        // distinguishable from "something went wrong".
        if (pts.length < 2) { skip('SINGLE_NODE', pts.length + ' node'); return; }
        var world = pts.map(function (p) { return norm(latLngToVec3(p[0], p[1], 1.006)); });
        var drew = 0;
        for (var i = 0; i + 1 < world.length; i++) {
          var A = world[i], B = world[i + 1];
          // §D: DUPLICATE ADJACENT COORDINATES MUST NOT CREATE ZERO-LENGTH ARTEFACTS. Two identical nodes made
          // slerp(A, A, t) return A for every t, so the old code emitted 40 degenerate segments — 80 vertices
          // describing a point — per duplicated pair. A route through the same warehouse twice is ordinary data.
          if (Math.abs(A[0] - B[0]) < 1e-12 && Math.abs(A[1] - B[1]) < 1e-12 && Math.abs(A[2] - B[2]) < 1e-12) {
            continue;
          }
          // Great-circle subdivision. slerp interpolates ON the unit sphere and always takes the SHORTER of the
          // two arcs between A and B, so an antimeridian crossing needs no special case and no line can pass
          // through the globe: every emitted vertex is at radius 1.006 by construction, never a Cartesian
          // midpoint that would sink beneath the surface.
          var steps = 40;   // UI-GLOBE-01: smoother great-circle arc (SAME endpoints/coordinates/routing)
          for (var st = 0; st < steps; st++) {
            var p1 = slerp(A, B, st / steps), p2 = slerp(A, B, (st + 1) / steps);
            arr.push(p1[0] * 1.006, p1[1] * 1.006, p1[2] * 1.006, c[0], c[1], c[2], 1);
            arr.push(p2[0] * 1.006, p2[1] * 1.006, p2[2] * 1.006, c[0], c[1], c[2], 1);
          }
          drew++;
        }
        if (!drew) { skip('ALL_SEGMENTS_DEGENERATE', pts.length + ' identical nodes'); return; }
        routeInfo.arcs_drawn++;
        routeInfo.segments += drew;
      });
      lineData = new Float32Array(arr); lineCount = arr.length / 7;
      routeInfo.vertices = lineCount;
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
      // TEXTURE-3-R6 §C — the route census, in the same shape as the other getXInfo() diagnostics. §C asks for
      // resolved/rejected node counts, segment and vertex counts and the first boundary at which an arc
      // disappears; none of that was observable from outside before, which is why R5 could report the symptom
      // and not the cause. `attached` is the buffer-level fact: geometry exists AND the draw call will run.
      getRouteInfo: function () {
        return { arcs_in: routeInfo.arcs_in, arcs_drawn: routeInfo.arcs_drawn,
                 arcs_skipped: routeInfo.arcs_skipped, segments: routeInfo.segments,
                 vertices: routeInfo.vertices, line_count: lineCount,
                 attached: !!(buf.line && lineCount > 0),
                 markers: ptCount,
                 skipped: routeInfo.skipped.slice() };
      },
      getRenderInfo: function () { return { dpr: dpr, device_pixel_ratio: (window.devicePixelRatio || 1), dpr_cap: 2, css_width: W, css_height: H, buffer_width: canvas.width, buffer_height: canvas.height }; },
      // TEXTURE-3-R3 §I — STEADY ROTATE/ZOOM FRAME TIMING, measured here rather than in a harness page.
      //
      // It lives in the engine because only the engine can drive a SYNCHRONOUS frame: from outside, the best a
      // caller can do is nudge the camera and wait for requestAnimationFrame, which measures the browser's
      // scheduling rather than the renderer. This walks the camera and calls the real recomputeMatrices() + draw()
      // per sample, so the number describes a MOVING camera - which is what §I asks for and what a static redraw
      // would flatter.
      //
      // The camera is restored afterwards, so calling this never changes what the next frame shows. It is a
      // diagnostics entry point in the same family as getMaterialInfo(), not a render path: nothing in the engine
      // calls it.
      measureFrames: function (o) {
        o = o || {};
        var n = Math.max(1, Math.min(240, o.samples || 24));
        var dYaw = o.dYaw == null ? 0.004 : o.dYaw;
        var dDist = o.dDist == null ? 0.0015 : o.dDist;
        // WITHOUT THIS THE MEASUREMENT IS MEANINGLESS, AND THE FIRST VERSION PROVED IT. WebGL calls only ENQUEUE
        // work; the driver completes it asynchronously. Timing recomputeMatrices()+draw() therefore measures
        // command submission plus the synchronous 2D label pass - and it showed the 141,608-vertex LOD-3 globe
        // as FASTER (0.00 ms) than the 22,452-vertex LOD-0 globe (0.18 ms), because LOD 0 draws more LABELS.
        // gl.finish() blocks until the pipeline has drained, which is what makes the number a frame time.
        var doFinish = o.finish !== false;
        var saved = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
        // TEXTURE-3-R4 §C — the LABEL time is collected per sample too. `label_placement_last_frame` is one
        // sample, and one sample of a pass that swings with what happens to be on screen is not a number a
        // before can be compared against. Both arrays are filled by the same loop, so the label figure is
        // always a subset of the frame figure it sits beside.
        var t = [], lbl = [], i;
        try {
          // One untimed frame first, so a lazily-compiled shader or a first-use buffer binding is not charged to
          // sample 0 - that would show up as a p95 that never happens again in practice.
          recomputeMatrices(); draw();
          if (doFinish) gl.finish();
          for (i = 0; i < n; i++) {
            cam.yaw += dYaw;
            cam.dist = Math.max(MIN_D, Math.min(MAX_D, cam.dist + (i % 2 ? dDist : -dDist)));
            var t0 = nowMs();
            recomputeMatrices(); draw();
            if (doFinish) gl.finish();
            t.push(nowMs() - t0);
            lbl.push(lastLabelMs);
          }
        } catch (e) {
          cam.yaw = saved.yaw; cam.pitch = saved.pitch; cam.dist = saved.dist;
          recomputeMatrices(); draw();
          return { error: String((e && e.message) || e) };
        }
        cam.yaw = saved.yaw; cam.pitch = saved.pitch; cam.dist = saved.dist;
        recomputeMatrices(); draw();
        var sorted = t.slice().sort(function (a, b) { return a - b; });
        function pct(p) { return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 100) / 100; }
        var lsorted = lbl.slice().sort(function (a, b) { return a - b; });
        function lpct(p) { return lsorted.length ? Math.round(lsorted[Math.min(lsorted.length - 1, Math.floor(p * lsorted.length))] * 100) / 100 : 0; }
        var sum = 0; for (i = 0; i < t.length; i++) sum += t[i];
        var lsum = 0; for (i = 0; i < lbl.length; i++) lsum += lbl[i];
        return {
          samples: t.length,
          mean_ms: Math.round(sum / t.length * 100) / 100,
          p50_ms: pct(0.5), p95_ms: pct(0.95), min_ms: pct(0), max_ms: pct(0.999),
          label_mean_ms: lbl.length ? Math.round(lsum / lbl.length * 100) / 100 : 0,
          label_p50_ms: lpct(0.5), label_p95_ms: lpct(0.95), label_max_ms: lpct(0.999),
          // Reported so the reader is never left to assume hardware numbers. The renderer string comes from the
          // driver, not from this file.
          renderer: matInfo.renderer || 'UNKNOWN',
          // What the number actually includes, stated with the number. A reader cannot otherwise tell whether
          // this is submission time or completion time, and the two differ by orders of magnitude.
          pipeline_drained: doFinish,
          measures: doFinish
            ? 'matrix update + GL submission + 2D label pass + gl.finish() (pipeline drained)'
            : 'matrix update + GL submission + 2D label pass ONLY - NOT a frame time',
          lod: lod, distance: Math.round(cam.dist * 1000) / 1000,
          adm1_visible: admin1BordersVisible(),
          border_vertices: borderCounts.COASTLINE + borderCounts.INTERNATIONAL + borderCounts.ADM1,
          sphere_triangles: sphere && sphere.idx ? sphere.idx.length / 3 : 0
        };
      },
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
        // TEXTURE-3-R4 §C — the anchor cache and the two label caches are DERIVED from this dataset, so a new
        // dataset must drop them. Keeping them would paint the previous dataset's names at the previous
        // dataset's positions, which is the class of bug §E's "cannot reuse stale buffers" is about.
        admin1Anchors = null;
        labelTextCache = {};
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
      // TEXTURE-3-R3 §D/§E/§I — THE TOPOLOGY IS OBSERVABLE. Every number the report has to state about the
      // canonical edge set is read from here rather than recomputed by the reporter: which set is active, how
      // many duplicate edges were removed, the per-class edge and vertex counts, the endpoint connectivity,
      // the anti-meridian census, and the separate timings §I asks to be measured separately.
      // TEXTURE-3-R6 §B/§F — what the continent layer will actually PAINT, and what it declined to.
      // §F asks for evidence that no unintended English open-ocean label reaches the default view. Reading it
      // off a screenshot is not evidence; this reports the strings the layer holds, plus the keys it dropped and
      // why, so the acceptance capture can assert on the label set rather than on pixels.
      getContinentLabels: function () {
        var out = [];
        try {
          continentList().forEach(function (c) { out.push({ key: c.key, text: c.text }); });
        } catch (e) {}
        return out;
      },
      getTopologyInfo: function () {
        function setInfo(name, topo, layers, buildMs, uploadMs) {
          if (!topo || !layers) return { available: false, reason: name + '_NOT_BUILT' };
          var st = topo.stats;
          var cls = {};
          ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (c) {
            var L = layers.layers[c];
            cls[c] = {
              edges: L.edgeCount, edges_unfiltered: L.edgeCountUnfiltered,
              segments_after_subdivision: L.segmentCount, vertices: L.vertexCount,
              buffer_bytes: L.positions.byteLength, mode: L.mode, width_px: L.widthPx, rank: L.rank,
              max_source_arc_deg: Math.round((L.maxSourceArcDeg || 0) * 100) / 100
            };
          });
          return {
            available: true,
            input_features: st.input.features, input_rings: st.input.rings,
            directed_edges: st.input.directed_edges, degenerate_edges: st.input.degenerate_edges,
            unique_edges: st.input.unique_edges,
            duplicate_edges_removed: st.duplicate_edges_removed,
            duplicate_percent: st.duplicate_percent,
            classes: cls,
            endpoints: st.endpoints, antimeridian: st.antimeridian,
            topology_build_ms: buildMs, buffer_upload_ms: uploadMs
          };
        }
        return {
          active_set: borderActive,
          active_reason: borderActive === 'FINE'
            ? 'LOD_' + lod + '_AT_OR_ABOVE_' + ADMIN1_BORDER_MIN_LOD + '_AND_ADM1_DATA_PRESENT'
            : (layersFine ? 'LOD_' + lod + '_BELOW_' + ADMIN1_BORDER_MIN_LOD : 'ADM1_DATA_NOT_ATTACHED'),
          surface_radius: 1, border_radius: BORDER_R, border_depth_bias: BORDER_DEPTH_BIAS_,
          arc_radius: ARC_R_, marker_radius: MARKER_R_,
          adm1_border_strength: Math.round(admin1BorderStrength(cam.dist) * 100) / 100,
          continent_label_strength: Math.round(continentStrength(cam.dist) * 100) / 100,
          label_sizes_px: labelSizes(cam.dist),
          // TEXTURE-3-R4 §C — the counters the density work is JUDGED by, not just the drawn count.
          // `considered` is the whole dataset, `after_facing` what survived the three-multiply cull,
          // `on_screen` what was projected and near the viewport, `measured` how many were text-resolved and
          // text-measured, and `drawn` what was painted. The gap between `on_screen` and `measured` is the work
          // that used to be done and thrown away.
          label_counts: {
            country: { considered: lastLabelStats.considered, after_facing: lastLabelStats.after_facing,
                       on_screen: lastLabelStats.on_screen, measured: lastLabelStats.measured,
                       candidates: lastLabelStats.candidates, drawn: lastLabelStats.drawn },
            continent: { candidates: lastContinentStats.candidates, drawn: lastContinentStats.drawn },
            adm1: { considered: lastAdmin1LabelStats.considered, after_facing: lastAdmin1LabelStats.after_facing,
                    on_screen: lastAdmin1LabelStats.on_screen, measured: lastAdmin1LabelStats.measured,
                    measure_cap: lastAdmin1LabelStats.measure_cap,
                    candidates: lastAdmin1LabelStats.candidates, drawn: lastAdmin1LabelStats.drawn,
                    budget: lastAdmin1LabelStats.budget }
          },
          // §C — the collision work itself, so "rejected labels do not consume layout work" is a number.
          label_collision: (function () {
            if (!lastLabelPlan) return { placed: { operational: 0, country: 0, continent: 0, adm1: 0 },
                                         tests: { operational: 0, country: 0, continent: 0, adm1: 0 }, total_tests: 0 };
            var t = lastLabelPlan.collision_tests || {};
            return { placed: lastLabelPlan.counts, tests: t,
                     total_tests: (t.operational || 0) + (t.country || 0) + (t.continent || 0) + (t.adm1 || 0) };
          })(),
          label_class_order: LABEL_CLASS_ORDER_.slice(),
          label_measure_factor: LABEL_MEASURE_FACTOR_,
          // §I — THE PHASES, MEASURED SEPARATELY. `asset_load_ms` is what the browser reports for fetching
          // AND decoding the image together; `gpu_upload_ms` is the texImage2D + generateMipmap copy after
          // that. Resource Timing can split fetch from decode, and tools/geo/measure-perf.js does so - it is
          // not split here because the engine must not depend on a timing API being present.
          phases_ms: {
            asset_load_fetch_plus_decode: matInfo.load_ms_by_tier || {},
            gpu_upload: matInfo.gpu_upload_ms == null ? null : matInfo.gpu_upload_ms,
            topology_prepare_coarse: topoBuildMs.coarse,
            topology_prepare_fine: topoBuildMs.fine,
            border_buffer_upload_coarse: borderUploadMs.coarse,
            border_buffer_upload_fine: borderUploadMs.fine,
            label_placement_last_frame: lastLabelMs,
            first_render: firstRenderMs,
            last_frame_submit: lastFrameMs
          },
          frames_drawn: framesDrawn,
          coarse: setInfo('COARSE', topoCoarse, layersCoarse, topoBuildMs.coarse, borderUploadMs.coarse),
          fine: setInfo('FINE', topoFine, layersFine, topoBuildMs.fine, borderUploadMs.fine),
          degrade_reason: degradeReason || null
        };
      },
      getAdmin1LayerInfo: function () {
        return {
          available: !!(admin1Data && admin1Data.admin1 && admin1Data.admin1.length),
          dataset: (admin1Data && admin1Data.meta) ? admin1Data.meta.dataset : null,
          resolution: (admin1Data && admin1Data.meta) ? admin1Data.meta.resolution : null,
          division_count: (admin1Data && admin1Data.admin1) ? admin1Data.admin1.length : 0,
          country_count: (topoFine && topoFine.stats) ? topoFine.stats.input.features : 0,
          ring_count: (topoFine && topoFine.stats) ? topoFine.stats.input.rings : 0,
          segment_count: admin1Info ? admin1Info.segmentCount : 0,
          vertex_count: admin1VertexCount,
          buffer_bytes: admin1Info ? admin1Info.positions.byteLength : 0,
          gpu_buffers: admin1Info && admin1VertexCount ? 1 : 0,
          buffer_builds: admin1BufferBuilds,
          build_ms: admin1BuildMs,
          max_source_arc_deg: admin1Info ? admin1Info.maxSourceArcDeg : 0,
          radius: BORDER_R, max_segment_deg: COUNTRY_MAX_SEG_DEG,
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
          if (buf.admin1) gl.deleteBuffer(buf.admin1);
          ['COASTLINE', 'INTERNATIONAL', 'ADM1'].forEach(function (cls) {
            if (borderBufs[cls]) gl.deleteBuffer(borderBufs[cls]);
          });
          gl.deleteProgram(progSphere); gl.deleteProgram(progPts); gl.deleteProgram(progLine);
          if (progRibbon) gl.deleteProgram(progRibbon);
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
        TIER_ORDER: EARTH_TIER_ORDER_, GPU_TEXTURE_BUDGET_BYTES: GPU_TEXTURE_BUDGET_BYTES_,
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
        TIER_ORDER: EARTH_TIER_ORDER_, GPU_TEXTURE_BUDGET_BYTES: GPU_TEXTURE_BUDGET_BYTES_,
        isPot: isPot_, arcDegAtDist: arcDegAtDist, magnificationAt: magnificationAt,
        minDistForTier: minDistForTier, detailForDistance: detailForDistance,
        MAG_BUDGET: MAG_BUDGET_, MIN_D_FLOOR: MIN_D_FLOOR_, MIN_D_CEIL: MIN_D_CEIL_,
        DETAIL_MAX: DETAIL_MAX_, DETAIL_FAR: DETAIL_FAR_, DETAIL_NEAR: DETAIL_NEAR_, OCEAN_SPEC: OCEAN_SPEC_
      }
    };
  }
})();
