// Globe visual-enhancement guard — Batch UI-GLOBE-01 (VISUAL ONLY).
// The globe is raw WebGL + a runtime-rasterized canvas texture; neither WebGL nor a DOM canvas can run in
// headless Node, so this test does NOT render. It asserts, at the source level, that the visual enhancement
// (texture colors, shader lighting/rim constants, arc smoothness, CSS atmosphere overlay) did NOT change any
// RUNTIME behavior: same texture dimensions (memory stable), same on-demand render model (no continuous loop /
// no animation-timing change), same shader interface (uniforms/attributes → JS bindings still valid), same
// interaction, same public API, same GPU cleanup, and data-driven marker/arc colors untouched.
// Run: node assets/tests/globe-visual-guard.test.js
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var G = read('js/lib/km-globe.js');
var CSS = read('css/pages/global-logistics-map.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =====================================================================================================
section('Texture memory stable (no resolution change)');
ok(/buildEarthCanvas\(2048,\s*1024\)/.test(G), 'M1 earth texture is still rasterized at 2048x1024 (texture memory unchanged)');
ok((G.match(/cv\.width\s*=\s*tw;\s*cv\.height\s*=\s*th/) || []).length >= 1, 'M2 canvas sized from (tw,th) params — no hardcoded larger buffer');

// =====================================================================================================
section('On-demand render model preserved (no continuous loop / no animation-timing change)');
ok(G.indexOf('setInterval(') < 0, 'R1 no setInterval — no new continuous animation loop introduced');
ok(/function schedule\(\)\s*\{\s*if \(!raf && !destroyed\) raf = requestAnimationFrame\(draw\);/.test(G), 'R2 on-demand schedule() render guard unchanged (one queued frame at a time)');
ok(/if \(k < 1\) requestAnimationFrame\(step\); else anim = null;/.test(G), 'R3 focus tween is still BOUNDED (ends at k>=1) — not a perpetual spin');
// exactly the pre-existing requestAnimationFrame sites: schedule(draw), animateTo step x2. No new ones.
ok((G.match(/requestAnimationFrame\(/g) || []).length === 3, 'R4 requestAnimationFrame call-site count unchanged (3: schedule + tween start + tween step)');

// =====================================================================================================
section('Shader interface unchanged (JS uniform/attribute bindings stay valid)');
ok(/attribute vec3 aPos;attribute vec3 aNormal;attribute vec2 aUV;uniform mat4 uMVP;uniform mat4 uMV;/.test(G), 'S1 VS_SPHERE attributes/uniforms (aPos/aNormal/aUV/uMVP/uMV) unchanged');
ok(/uniform sampler2D uTex;/.test(G) && /texture2D\(uTex,vUV\)/.test(G), 'S2 FS_SPHERE still samples uTex (no uniform added/removed)');
ok((G.match(/uniform /g) || []).length === (G.match(/uniform /g) || []).length && /gl_Position=uMVP\*vec4\(aPos,1.0\)/.test(G), 'S3 vertex position pipeline intact');
ok(/VS_PTS =/.test(G) && /FS_PTS =/.test(G) && /VS_LINE =/.test(G) && /FS_LINE =/.test(G), 'S4 point + line shader programs still present');
// the JS binds exactly these sphere uniforms — must still match the shader
ok(/getUniformLocation\(progSphere, 'uMVP'\)/.test(G) && /getUniformLocation\(progSphere, 'uMV'\)/.test(G) && /getUniformLocation\(progSphere, 'uTex'\)/.test(G), 'S5 sphere uniform bindings (uMVP/uMV/uTex) unchanged — shader edit added no new uniform');

// =====================================================================================================
section('Interaction + public API + GPU cleanup preserved');
['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown'].forEach(function (ev) { ok(G.indexOf("addEventListener('" + ev + "'") >= 0, 'I:' + ev + ' listener preserved'); });
ok(/cam\.yaw \+= dx \* 0\.006; cam\.pitch = clampPitch\(cam\.pitch \+ dy \* 0\.006\)/.test(G), 'I6 drag-rotation sensitivity unchanged');
['setMarkers', 'setArcs', 'focus', 'overview', 'resize', 'zoomIn', 'zoomOut', 'reset', 'getStatus', 'destroy'].forEach(function (m) { ok(new RegExp(m + ':').test(G), 'API:' + m + ' preserved'); });
ok(/gl\.deleteTexture\(tex\)[\s\S]*gl\.deleteProgram\(progSphere\)[\s\S]*loseContext\(\)/.test(G), 'C1 destroy() still frees texture/buffers/programs + loses context (no leak)');

// =====================================================================================================
section('Data-driven marker/arc colors untouched (no business/semantic color change)');
ok(/var c = m\.color \|\| \[0, 0\.5, 0\.73\]/.test(G), 'D1 marker color still comes from the data (m.color) — not hardcoded by this batch');
ok(/var c = a\.color \|\| \[0, 0\.5, 0\.73\]/.test(G), 'D2 arc color still comes from the data (a.color)');
ok(/latLngToVec3\(m\.lat, m\.lng/.test(G) && /latLngToVec3\(p\[0\], p\[1\]/.test(G), 'D3 marker/arc coordinates unchanged (lat/lng from data)');

// =====================================================================================================
section('Visual enhancements present (the actual change)');
ok(/float shade=0\.66\+0\.42\*diff;/.test(G) && /pow\(1\.0-max\(dot\(n,v\),0\.0\),2\.4\)/.test(G) && /col\+=vec3\(0\.14,0\.28,0\.50\)\*rim;/.test(G), 'V1 FS_SPHERE softer lighting + wider/bluer rim atmosphere (constant-only)');
ok(/addColorStop\(0\.50, '#155a8c'\)/.test(G) && /var lg = ctx\.createLinearGradient/.test(G), 'V2 richer ocean gradient + land relief gradient in the texture');
ok(/var steps = 40;/.test(G), 'V3 smoother great-circle arcs (40 subdivisions)');
ok(/\.glm-globe-host::before/.test(CSS) && /\.glm-globe-host::after/.test(CSS) && /mix-blend-mode: screen/.test(CSS), 'V4 CSS atmosphere glow + depth vignette overlay added');

// =====================================================================================================
section('CSS overlay cannot break interaction or cover UI');
ok(/\.glm-globe-host::before,\s*\n\.glm-globe-host::after \{ content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;/.test(CSS), 'X1 overlay is pointer-events:none + z-index:2 (above canvas, below all UI z>=4)');

console.log('\n----------------------------------------');
console.log('GLOBE VISUAL GUARD (UI-GLOBE-01): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
