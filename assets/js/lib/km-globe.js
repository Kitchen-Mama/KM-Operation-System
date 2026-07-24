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

  var MATH = {
    mat4Identity: mat4Identity, mat4Mul: mat4Mul, mat4Perspective: mat4Perspective,
    mat4Translate: mat4Translate, mat4RotX: mat4RotX, mat4RotY: mat4RotY, mat4Apply: mat4Apply,
    latLngToVec3: latLngToVec3, focusAngles: focusAngles, modelMatrix: modelMatrix,
    slerp: slerp, projectToScreen: projectToScreen
  };

  // ---------------- earth texture (rasterized from vendored land outline) ----------------
  // Returns a 2D canvas (equirectangular, north at top) or null if land data is unavailable.
  function buildEarthCanvas(tw, th) {
    var land = window.KM_WORLD_LAND;
    if (!land || !land.rings || !land.rings.length) return null;
    var cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
    var ctx = cv.getContext('2d'); if (!ctx) return null;
    // Ocean base (deep→mid blue vertical gradient for a little depth).
    var g = ctx.createLinearGradient(0, 0, 0, th);
    g.addColorStop(0, '#0b2f52'); g.addColorStop(0.5, '#12507f'); g.addColorStop(1, '#0b2f52');
    ctx.fillStyle = g; ctx.fillRect(0, 0, tw, th);
    function px(lng) { return (lng + 180) / 360 * tw; }
    function py(lat) { return (90 - lat) / 180 * th; }
    // Land fill.
    ctx.fillStyle = '#3f7a43';               // natural green land
    ctx.strokeStyle = 'rgba(30,70,40,0.9)';  // low-contrast coastline
    ctx.lineWidth = Math.max(1, tw / 2048);
    ctx.lineJoin = 'round';
    land.rings.forEach(function (ring) {
      ctx.beginPath();
      for (var i = 0; i < ring.length; i++) {
        var x = px(ring[i][0]), y = py(ring[i][1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
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
  var FS_SPHERE = 'precision mediump float;uniform sampler2D uTex;varying vec2 vUV;varying vec3 vN;varying vec3 vView;void main(){vec3 n=normalize(vN);vec3 v=normalize(vView);vec3 l=normalize(vec3(0.35,0.25,1.0));float diff=max(dot(n,l),0.0);float shade=0.62+0.5*diff;vec4 tex=texture2D(uTex,vUV);vec3 col=tex.rgb*shade;float rim=pow(1.0-max(dot(n,v),0.0),3.0);col+=vec3(0.10,0.16,0.30)*rim;gl_FragColor=vec4(col,1.0);}';
  var VS_PTS = 'attribute vec3 aPos;attribute vec4 aColor;attribute float aSize;attribute float aRing;uniform mat4 uMVP;varying vec4 vColor;varying float vRing;void main(){gl_Position=uMVP*vec4(aPos,1.0);gl_PointSize=aSize;vColor=aColor;vRing=aRing;}';
  var FS_PTS = 'precision mediump float;varying vec4 vColor;varying float vRing;void main(){vec2 c=gl_PointCoord-vec2(0.5);float d=length(c);if(d>0.5)discard;vec4 col=vColor;if(d>0.36)col=vec4(1.0,1.0,1.0,1.0);if(vRing>0.5&&d>0.40)col=vec4(1.0,0.82,0.2,1.0);gl_FragColor=col;}';
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

    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl', { antialias: true, alpha: false }); } catch (e) {}
    if (!gl) { container.removeChild(canvas); return err('webgl', 'WebGL context could not be created'); }

    var earthCv = buildEarthCanvas(2048, 1024);
    if (!earthCv) { container.removeChild(canvas); return err('asset', 'Land outline asset (KM_WORLD_LAND) is missing or empty; cannot rasterize the Earth texture.'); }

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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (e) { try { container.removeChild(canvas); } catch (x) {} return err('gl', 'GL init failed: ' + (e && e.message || e)); }

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.043, 0.055, 0.094, 1);   // deep-space background

    var MIN_D = 1.35, MAX_D = 5.0;
    var cam = { yaw: 0, pitch: 0, dist: 3.0 };
    var reduced = !!opts.reducedMotion;
    var markers = [], arcs = [];
    var ptData = null, ptCount = 0, lineData = null, lineCount = 0;
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
          var steps = 24;
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
        rebuildPoints();   // point sizes scale with dpr
        schedule(); return true;
      },
      zoomIn: function () { zoomBy(0.82); }, zoomOut: function () { zoomBy(1.22); },
      reset: function () { this.overview(); },
      getStatus: function () { return { ok: status.ok, error: status.error, dist: cam.dist }; },
      setReducedMotion: function (v) { reduced = !!v; },
      canvas: canvas,
      destroy: function () {
        destroyed = true; if (raf) cancelAnimationFrame(raf); if (anim) anim.cancelled = true;
        try { window.removeEventListener('resize', onWinResize); } catch (e) {}
        try { if (ro) ro.disconnect(); } catch (e) {}
        try {
          gl.deleteTexture(tex); gl.deleteBuffer(buf.pos); gl.deleteBuffer(buf.nrm); gl.deleteBuffer(buf.uv);
          gl.deleteBuffer(buf.idx); gl.deleteBuffer(buf.pts); gl.deleteBuffer(buf.line);
          gl.deleteProgram(progSphere); gl.deleteProgram(progPts); gl.deleteProgram(progLine);
          var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        } catch (e) {}
        try { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } catch (e) {}
      }
    };

    // context-loss handling (e.g. GPU reset) — report, do not silently die
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); status.ok = false; status.error = 'WebGL context lost'; err('contextlost', 'WebGL context lost'); });

    var onWinResize = (function () { var t = 0; return function () { clearTimeout(t); t = setTimeout(function () { inst.resize(); }, 150); }; })();
    window.addEventListener('resize', onWinResize);
    var ro = null;
    try { if (window.ResizeObserver) { ro = new ResizeObserver(function () { inst.resize(); }); ro.observe(container); } } catch (e) {}

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
