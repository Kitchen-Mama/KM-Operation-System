// Globe visual-enhancement guard — Batch UI-GLOBE-01 + UI-GLOBE-02 (VISUAL ONLY).
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
section('Texture tier (V3G6A supersedes the fixed-resolution guard)');
// SUPERSEDED, NOT DELETED. The UI-GLOBE-01/02 batch was visual-only, so M1 pinned the raster at 2048x1024 to
// prove that batch changed no texture memory. F1-7N-FA-4A V3G6A is a deliberate, authorised FIDELITY task: the
// close-zoom blur was traced to that very ceiling (the texture is MAGNIFIED at MIN_D, which no filter can fix).
// M1 is therefore replaced by a stronger contract - the base tier is unchanged, the higher tier is
// capability-gated, and the rasterizer stays fully resolution-parametric so the artwork is identical.
ok(/var TEX_BASE_W_ = 2048, TEX_BASE_H_ = 1024;/.test(G), 'M1a the BASE texture tier is still 2048x1024 (unchanged cost on low-end devices)');
ok(/out\.width = 4096; out\.height = 2048;/.test(G) && /MAX_TEXTURE_SIZE/.test(G), 'M1b the 4K tier is gated on the GL MAX_TEXTURE_SIZE capability');
ok(/LOW_DEVICE_MEMORY/.test(G) && /LOW_CORE_COUNT/.test(G) && /DEVICE_CAPABILITY_UNKNOWN/.test(G), 'M1c and on device memory / core count, with UNKNOWN devices kept on the base tier');
ok(/buildEarthCanvas\(texTier\.width, texTier\.height\)/.test(G), 'M1d the rasterizer is called with the CHOSEN tier, never a hardcoded size');
ok((G.match(/cv\.width\s*=\s*tw;\s*cv\.height\s*=\s*th/) || []).length >= 1, 'M2 canvas sized from (tw,th) params — no hardcoded larger buffer');
ok(/var _cs = tw \/ 2048;/.test(G) && /rw = \(26 \+ rnd\(\) \* 66\) \* _cs/.test(G), 'M2b the only absolute pixel radii (clouds) scale with the tier, so a 4K raster paints identical artwork');

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
ok(/float shade=0\.46\+0\.52\*diff;/.test(G) && /pow\(1\.0-max\(dot\(n,v\),0\.0\),3\.4\)/.test(G) && /col\+=vec3\(0\.10,0\.20,0\.38\)\*rim;/.test(G), 'V1 FS_SPHERE UI-GLOBE-02B calibrated lighting: ambient 0.66→0.46 + diffuse 0.42→0.52 (de-fog, contrast, no overexposure) + narrower/subtler edge-only rim (constant-only; same attributes/uniforms)');
// UI-GLOBE-02 premium Earth — all painted in buildEarthCanvas from the vendored land outline (pure canvas-2D)
ok(/og\.addColorStop\(0\.50, '#134f70'\)/.test(G) && /var bg = ctx\.createLinearGradient/.test(G), 'V2 ocean depth gradient (UI-GLOBE-02B darker/calmer, less cyan) + latitude biome band gradient (desaturated toward natural tones)');
ok(/var steps = 40;/.test(G), 'V3 smoother great-circle arcs (40 subdivisions, UNCHANGED)');
ok(/\.glm-globe-host::before/.test(CSS) && /\.glm-globe-host::after/.test(CSS) && /mix-blend-mode: screen/.test(CSS), 'V4 CSS atmosphere glow + depth vignette overlay (UNCHANGED)');
ok(/function noiseTile\(/.test(G) && /function patch\(/.test(G) && /'soft-light'/.test(G), 'V5 relief mottling + anchored biome patches (mountain/desert/forest/snow variation, no elevation data)');
ok(/graticule/.test(G) && /for \(var glng =/.test(G) && /for \(var glat =/.test(G), 'V6 faint baked lat/long graticule grid (~10% presence)');
ok(/baked cloud layer/.test(G) && /ci < 54/.test(G), 'V7 baked cloud layer MINIMIZED (UI-GLOBE-02B: fewer + fainter, must not haze terrain; still static, no extra draw pass, no animation loop)');
ok(/[Ss]helf halo/.test(G), 'V8 continental-shelf ocean-depth halo (shallow-water cue)');
ok(/if\(d>0\.46\)col=vec4\(0\.05,0\.09,0\.16,1\.0\)/.test(G), 'V9 layered marker with crisp dark rim (FS_PTS constant-only; opaque, same attributes + same picking)');
ok(/Math\.imul\(_seed/.test(G) && /function rnd\(\)/.test(G), 'V10 deterministic seeded PRNG (Math.imul LCG) — same Earth every load, no per-frame cost (determinism; no-loop proven by R1/R4)');
// premium Control-Tower chrome (global-logistics-map.css) — design tokens + glass + motion, all class names preserved
ok(/--glm-brand:/.test(CSS) && /backdrop-filter:/.test(CSS) && /--glm-ease:/.test(CSS), 'V11 chrome design-system: brand token + glass (backdrop-filter) + motion easing token');
ok(/height: clamp\(600px, 80vh, 1000px\)/.test(CSS), 'V12 taller immersive map hero (map is the visual centre)');

// =====================================================================================================
section('CSS overlay cannot break interaction or cover UI');
ok(/\.glm-globe-host::before,\s*\n\.glm-globe-host::after \{ content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;/.test(CSS), 'X1 overlay is pointer-events:none + z-index:2 (above canvas, below all UI z>=4)');

console.log('\n----------------------------------------');
console.log('GLOBE VISUAL GUARD (UI-GLOBE-01/02/02B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
