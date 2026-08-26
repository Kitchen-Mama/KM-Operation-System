#!/usr/bin/env node
/**
 * tools/geo/verify-earth-tiers.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §B / §I — verification of the generated Earth albedo tier ladder.
 *
 * WHY A SEPARATE VERIFIER, AND WHY IT DRIVES A BROWSER. tools/geo/build-earth-tiers.js writes the tiers with a
 * JPEG encoder written in this repository, and tools/geo/jpeg-image.js reads them back with a decoder written in
 * the same file. A round-trip through one author's encoder and that same author's decoder proves almost nothing:
 * a shared misreading of the spec would pass it and every browser would still refuse the file. So the load-bearing
 * check here is the INDEPENDENT one - Chrome's own JPEG decoder is asked to decode the generated tiers, and its
 * pixels are compared against this repository's decoder. Agreement between two independently written decoders is
 * evidence; agreement with oneself is not.
 *
 * WHAT IT CHECKS
 *   1  every tier's bytes and SHA-256 match the pins in build-earth-tiers.js
 *   2  every tier's SOF marker reports the expected dimensions and 2:1 equirectangular aspect (§B2)
 *   3  the tiers are the SAME GEOGRAPHY at three sample rates (§B10) - each tier is compared against the tier
 *      above, downsampled, and must agree within a tight tolerance
 *   4  REAL sharpness gain (§A4 / §B1) - mean absolute Laplacian over land, per tier, which must rise with
 *      resolution. An upscale of a smaller image would NOT raise it, which is exactly the shortcut §B forbids
 *   5  R2's accepted Canada classification (§A) holds on EVERY tier, not just the desktop one
 *   6  with --browser: Chrome decodes each tier and its pixels are compared with this repository's decoder
 *
 * This is a verification tool. It is never loaded by the page and is not part of any runtime path.
 *
 *   node tools/geo/verify-earth-tiers.js
 *   node tools/geo/verify-earth-tiers.js --browser
 *   node tools/geo/verify-earth-tiers.js --json
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var crypto = require('crypto');
var codec = require('./jpeg-image.js');
var builder = require('./build-earth-tiers.js');

var ROOT = path.join(__dirname, '..', '..');
var IMG_DIR = path.join(ROOT, 'assets', 'img', 'earth');

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

// Read the true pixel dimensions from the SOF marker. A checksum cannot make this check for you if the pin
// itself were ever updated carelessly, and the shader's texel maths depends on these being exact.
function jpegSof(buf) {
  var i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var m = buf[i + 1];
    if (m === 0xD8 || m === 0xD9 || m === 0x01 || m === 0xFF || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (i + 3 >= buf.length) return null;
    var len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { marker: m, progressive: m === 0xC2, precision: buf[i + 4],
               height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// Whole-image decode. The largest tier is 8192x4096 = 100 MB of RGB, which is affordable here; the
// 233-megapixel SOURCE is never decoded whole (build-earth-tiers.js streams it).
function decodeWhole(buf) {
  var out = null, W = 0, H = 0;
  var info = codec.decodeJpegStreaming(buf, function (y0, rows, rgb, w) {
    if (!out) { W = w; H = 0; }
    if (!out) out = [];
    out.push({ y0: y0, rows: rows, data: rgb.slice(0, rows * w * 3) });
    H = Math.max(H, y0 + rows);
  });
  var full = new Uint8Array(W * H * 3);
  out.forEach(function (b) { full.set(b.data, b.y0 * W * 3); });
  return { rgb: full, width: W, height: H, info: info };
}

// Bilinear upsample. Used for exactly one purpose: to CONSTRUCT the shortcut §B forbids - an upscale of the
// 5400x2700 asset to 8192x4096 - so the detail metric can be shown to reject it. It is never used to make a
// shipped tier.
function bilinearResample(src, sw, sh, dw, dh) {
  var out = new Uint8Array(dw * dh * 3);
  for (var y = 0; y < dh; y++) {
    var fy = (y + 0.5) * sh / dh - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    var ya = Math.max(0, Math.min(sh - 1, y0)), yb = Math.max(0, Math.min(sh - 1, y0 + 1));
    for (var x = 0; x < dw; x++) {
      var fx = (x + 0.5) * sw / dw - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      var xa = Math.max(0, Math.min(sw - 1, x0)), xb = Math.max(0, Math.min(sw - 1, x0 + 1));
      var o = (y * dw + x) * 3;
      for (var c = 0; c < 3; c++) {
        var v = src[(ya * sw + xa) * 3 + c] * (1 - tx) * (1 - ty) + src[(ya * sw + xb) * 3 + c] * tx * (1 - ty)
              + src[(yb * sw + xa) * 3 + c] * (1 - tx) * ty + src[(yb * sw + xb) * 3 + c] * tx * ty;
        out[o + c] = v < 0 ? 0 : (v > 255 ? 255 : Math.round(v));
      }
    }
  }
  return out;
}

function boxDownsample(rgb, w, h, ow, oh) {
  var out = new Float64Array(ow * oh * 3), cnt = new Float64Array(ow * oh);
  var sx = w / ow, sy = h / oh;
  for (var y = 0; y < h; y++) {
    var oy = Math.min(oh - 1, Math.floor(y / sy)), ro = y * w * 3;
    for (var x = 0; x < w; x++) {
      var ox = Math.min(ow - 1, Math.floor(x / sx)), o = (oy * ow + ox) * 3;
      out[o] += rgb[ro + x * 3]; out[o + 1] += rgb[ro + x * 3 + 1]; out[o + 2] += rgb[ro + x * 3 + 2];
      cnt[oy * ow + ox]++;
    }
  }
  for (var i = 0; i < ow * oh; i++) { var c = cnt[i] || 1; out[i * 3] /= c; out[i * 3 + 1] /= c; out[i * 3 + 2] /= c; }
  return out;
}

// THE MEASUREMENT THAT ANSWERS §A4, AND THE MISTAKE IT REPLACES.
//
// The obvious version of "is it sharper" - mean absolute Laplacian of each tier on its own pixel grid - measures
// the OPPOSITE of the intended thing, and it said so loudly when first run: BASE scored HIGHER than HIGH in all
// seven land regions. That is correct and useless. A per-pixel Laplacian is contrast per TEXEL, and shrinking an
// image packs the same geography into fewer texels, so coarse tiers win by construction.
//
// Detail is only comparable at a fixed ANGULAR step on a COMMON grid. So every tier is resampled onto the 8192
// grid first, and the stencil is then one 8192-texel wide - 0.0439 degrees, about 4.9 km at the equator - for all
// of them. On that footing the question is well posed, and it is the question §B1 actually asks: how much real
// variation exists at scales finer than the previous asset could hold.
//
// And the metric is required to REJECT the shortcut §B forbids. The verifier constructs that shortcut - the
// R2 5400x2700 asset bilinearly upscaled to 8192x4096 - and measures it identically. If the metric could not
// tell the real tier from the upscale, it would not be evidence of anything.
var DETAIL_BOXES = [
  { id: 'alps',        latN: 48.0, latS: 45.0, lngW: 6.0,   lngE: 14.0 },
  { id: 'himalaya',    latN: 36.0, latS: 27.0, lngW: 75.0,  lngE: 95.0 },
  { id: 'andes',       latN: -10.0, latS: -30.0, lngW: -76.0, lngE: -66.0 },
  { id: 'rockies-ca',  latN: 54.0, latS: 49.0, lngW: -125.0, lngE: -114.0 },
  { id: 'sahara-edge', latN: 20.0, latS: 12.0, lngW: -10.0, lngE: 20.0 },
  { id: 'amazon',      latN: -2.0, latS: -10.0, lngW: -70.0, lngE: -55.0 },
  { id: 'japan',       latN: 41.0, latS: 33.0, lngW: 130.0, lngE: 143.0 }
];

function detailMetric(rgb, w, h, box) {
  var x0 = Math.max(1, Math.floor((box.lngW + 180) / 360 * w));
  var x1 = Math.min(w - 2, Math.ceil((box.lngE + 180) / 360 * w));
  var y0 = Math.max(1, Math.floor((90 - box.latN) / 180 * h));
  var y1 = Math.min(h - 2, Math.ceil((90 - box.latS) / 180 * h));
  function lum(x, y) {
    var o = (y * w + x) * 3;
    return 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2];
  }
  var sum = 0, n = 0;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var l = 4 * lum(x, y) - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1);
      sum += l < 0 ? -l : l; n++;
    }
  }
  return n ? sum / n : 0;
}

var canada = require('./earth-surface-regions.js');

// THE GRID THE FROZEN GATE'S THRESHOLDS WERE CALIBRATED ON.
//
// R2's accepted gate measures earth-albedo-5400.jpg through tools/geo/jpeg-dc-probe.js, which yields an exact
// 1/8-scale image: 676x338, one sample about 59 km. Its bounds - SNOW_L 150, SEPARATION_MIN 40,
// BORDER_STEP_MAX 25 - are bounds ON THAT MEASUREMENT.
//
// Running them at full tier resolution is not a stricter test, it is a DIFFERENT one, and that showed up
// immediately: measured at 5400x2700, the ACCEPTED R2 ASSET ITSELF reads a 49th-parallel step of 28 and would
// fail its own gate. The step sits at -120..-117, where forested interior British Columbia (L36) meets the drier
// US Columbia Plateau (L64) - real land cover that crosses the border rather than following it, resolved sharply
// at full resolution and averaged away at 59 km.
//
// So the new tiers are classified on the SAME 676x338 grid. That keeps the frozen thresholds meaning what they
// were calibrated to mean, and it makes the four numbers directly comparable instead of merely similar. The
// alternative - relaxing BORDER_STEP_MAX until full-resolution numbers fit - would have quietly weakened an
// accepted gate to accommodate a measurement change, which is the opposite of what §A asks for.
var GATE_GRID_W = 676, GATE_GRID_H = 338;

function boxMean(rgb, w, h, box) {
  var x0 = Math.max(0, Math.floor((box.lngW + 180) / 360 * w));
  var x1 = Math.min(w - 1, Math.ceil((box.lngE + 180) / 360 * w));
  var y0 = Math.max(0, Math.floor((90 - box.latN) / 180 * h));
  var y1 = Math.min(h - 1, Math.ceil((90 - box.latS) / 180 * h));
  var r = 0, g = 0, b = 0, n = 0;
  for (var y = y0; y <= y1; y++) {
    var ro = y * w * 3;
    for (var x = x0; x <= x1; x++) { r += rgb[ro + x * 3]; g += rgb[ro + x * 3 + 1]; b += rgb[ro + x * 3 + 2]; n++; }
  }
  if (!n) return null;
  return { r: r / n, g: g / n, b: b / n, n: n };
}

// ---------------------------------------------------------------------------------------------------------
// the independent decoder: Chrome
// ---------------------------------------------------------------------------------------------------------
var CHROME_CANDIDATES = [
  process.env.KM_CHROME || '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
function findChrome() {
  for (var i = 0; i < CHROME_CANDIDATES.length; i++) if (CHROME_CANDIDATES[i] && fs.existsSync(CHROME_CANDIDATES[i])) return CHROME_CANDIDATES[i];
  return '';
}

// Chrome is asked for a coarse grid rather than full pixels: at GRID_W x GRID_H per tier the comparison still
// covers the whole globe, stays inside a console line, and is immune to the one difference we do NOT want to
// measure - Skia's downscale filter, since nearest-neighbour sampling is forced.
var GRID_W = 96, GRID_H = 48;

function browserDecode(chrome, files) {
  var page = [
    '<meta charset="utf-8"><body><script>',
    'var FILES=' + JSON.stringify(files) + ';',
    'var out=[],left=FILES.length;',
    'if(!left){fin();}',
    'FILES.forEach(function(f,i){',
    '  var im=new Image();',
    '  im.onload=function(){',
    '    var cv=document.createElement("canvas");cv.width=' + GRID_W + ';cv.height=' + GRID_H + ';',
    '    var cx=cv.getContext("2d",{willReadFrequently:true});',
    '    cx.imageSmoothingEnabled=false;',
    '    cx.drawImage(im,0,0,' + GRID_W + ',' + GRID_H + ');',
    '    var d=cx.getImageData(0,0,' + GRID_W + ',' + GRID_H + ').data,px=[];',
    '    for(var k=0;k<d.length;k+=4){px.push(d[k],d[k+1],d[k+2]);}',
    '    out[i]={file:f,w:im.naturalWidth,h:im.naturalHeight,px:px};',
    '    if(--left===0)fin();',
    '  };',
    '  im.onerror=function(){out[i]={file:f,error:"BROWSER_DECODE_FAILED"};if(--left===0)fin();};',
    '  im.src=f;',
    '});',
    'function fin(){console.log("KMJPEG "+JSON.stringify(out));document.title="done";}',
    '</script></body>'
  ].join('\n');
  // Written at the repository ROOT so every asset reference is a plain relative path: over file:// from a
  // directory whose name is non-ASCII, a `../` traversal loads the document but silently fails its children.
  var htmlPath = path.join(ROOT, '.km-verify-tiers.html');
  fs.writeFileSync(htmlPath, page, 'utf8');
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kmvt-'));
  var r = cp.spawnSync(chrome, [
    '--headless=new', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu', '--allow-file-access-from-files',
    '--enable-logging=stderr', '--v=0', '--log-level=0', '--virtual-time-budget=60000',
    'file:///' + encodeURI(htmlPath.replace(/\\/g, '/'))
  ], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  try { fs.unlinkSync(htmlPath); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  var blob = String(r.stdout || '') + '\n' + String(r.stderr || '');
  var m = /KMJPEG (\[[\s\S]*?\])\s*$/m.exec(blob) || /KMJPEG (\[.*\])/.exec(blob);
  if (!m) return { error: 'NO_BROWSER_OUTPUT', status: r.status, tail: blob.slice(-600) };
  try { return { views: JSON.parse(m[1]) }; } catch (e) { return { error: 'BROWSER_JSON_PARSE', tail: m[1].slice(0, 400) }; }
}

// ---------------------------------------------------------------------------------------------------------
function main() {
  var argv = process.argv.slice(2);
  var useBrowser = argv.indexOf('--browser') !== -1;
  var asJson = argv.indexOf('--json') !== -1;
  var report = { tiers: [], checks: [], browser: null };
  var fails = 0;
  function check(name, ok, detail) {
    report.checks.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    if (!ok) fails++;
    if (!asJson) console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  }

  var decoded = {};
  builder.TIERS.forEach(function (t) {
    var p = path.join(IMG_DIR, t.out);
    if (!fs.existsSync(p)) { check('tier present: ' + t.out, false, 'missing'); return; }
    var buf = fs.readFileSync(p);
    var pin = builder.OUTPUT_PINS[t.out];
    var digest = sha256(buf);
    check('pinned digest: ' + t.out, !!pin && buf.length === pin.bytes && digest === pin.sha256,
      buf.length + ' B  ' + digest.slice(0, 16) + '...');
    var sof = jpegSof(buf);
    check('SOF dimensions: ' + t.out, !!sof && sof.width === t.w && sof.height === t.h && sof.components === 3 && !sof.progressive,
      sof ? ('SOF' + (sof.marker - 0xC0) + ' ' + sof.width + 'x' + sof.height + ' ' + sof.components + 'ch ' + sof.precision + 'bit') : 'no SOF');
    check('2:1 equirectangular: ' + t.out, !!sof && sof.width === sof.height * 2, sof ? (sof.width / sof.height).toFixed(4) : '');
    var d = decodeWhole(buf);
    decoded[t.key] = d;
    report.tiers.push({ key: t.key, file: t.out, bytes: buf.length, sha256: digest,
      width: d.width, height: d.height, subsampling: d.info.subsampling });
  });

  // §B10 — tier-to-tier geography agreement. Each lower tier is compared with the tier above, box-downsampled
  // to the lower tier's grid. These are the SAME pixels at three sample rates, so all that should remain is the
  // quantisation noise of two independent JPEG encodes - a couple of units out of 255.
  //
  // THE BOUND IS CALIBRATED, NOT CHOSEN TO FIT. A tolerance that only ever sees passing numbers proves nothing,
  // so the same comparison is run against a deliberately MISREGISTERED tier - the upper tier shifted one degree
  // of longitude - and that must land far outside the bound. Misregistration between tiers is precisely the
  // defect §B10 describes ("no visible tier seam or change in geography"), so this is the control that gives the
  // pass its meaning.
  var TIER_AGREE_MAX = 3.0;
  function tierResidual(aRgb, aw, ah, bRgb, bw, bh, shiftDeg) {
    var ref = boxDownsample(aRgb, aw, ah, bw, bh);
    var shiftPx = Math.round((shiftDeg || 0) / 360 * bw);
    var tot = 0, worst = 0, n = 0;
    for (var y = 0; y < bh; y++) {
      for (var x = 0; x < bw; x++) {
        var sx = ((x + shiftPx) % bw + bw) % bw;
        var ao = (y * bw + sx) * 3, bo = (y * bw + x) * 3;
        for (var c = 0; c < 3; c++) { var dd = Math.abs(ref[ao + c] - bRgb[bo + c]); tot += dd; if (dd > worst) worst = dd; n++; }
      }
    }
    return { mean: tot / n, worst: worst };
  }
  [['HIGH', 'MID'], ['MID', 'BASE']].forEach(function (pair) {
    var a = decoded[pair[0]], b = decoded[pair[1]];
    if (!a || !b) return;
    var r = tierResidual(a.rgb, a.width, a.height, b.rgb, b.width, b.height, 0);
    check('§B10 same geography ' + pair[0] + '->' + pair[1], r.mean < TIER_AGREE_MAX,
      'meanAbsDiff=' + r.mean.toFixed(3) + ' worst=' + r.worst + ' (bound ' + TIER_AGREE_MAX + ')');
    report.checks[report.checks.length - 1].mean_abs_diff = +r.mean.toFixed(3);
    var mis = tierResidual(a.rgb, a.width, a.height, b.rgb, b.width, b.height, 1);
    check('§B10 control: a 1-degree misregistration ' + pair[0] + '->' + pair[1] + ' is REJECTED',
      mis.mean >= TIER_AGREE_MAX, 'meanAbsDiff=' + mis.mean.toFixed(3) + ' (must be >= ' + TIER_AGREE_MAX + ')');
  });

  // §A4 / §B1 — real detail, at a fixed angular step on the common 8192 grid.
  var GW = builder.TIERS[0].w, GH = builder.TIERS[0].h;
  var detail = {};
  function measureOnCommonGrid(label, rgb, w, h) {
    var onGrid = (w === GW && h === GH) ? rgb : bilinearResample(rgb, w, h, GW, GH);
    detail[label] = {};
    DETAIL_BOXES.forEach(function (bx) { detail[label][bx.id] = +detailMetric(onGrid, GW, GH, bx).toFixed(3); });
    return onGrid;
  }
  if (decoded.HIGH) measureOnCommonGrid('HIGH_8192', decoded.HIGH.rgb, decoded.HIGH.width, decoded.HIGH.height);
  if (decoded.MID) measureOnCommonGrid('MID_4096', decoded.MID.rgb, decoded.MID.width, decoded.MID.height);
  if (decoded.BASE) measureOnCommonGrid('BASE_2048', decoded.BASE.rgb, decoded.BASE.width, decoded.BASE.height);

  var r2Path = path.join(IMG_DIR, 'earth-albedo-5400.jpg');
  var r2 = fs.existsSync(r2Path) ? decodeWhole(fs.readFileSync(r2Path)) : null;
  // The R2 asset placed on the 8192 grid is BOTH the "before" number and, by construction, the exact shortcut
  // §B forbids: a 5400x2700 JPEG resampled up to 8192x4096. One measurement serves as both, which is why the
  // row is named for what it is.
  if (r2) measureOnCommonGrid('R2_5400_upscaled_to_8192', r2.rgb, r2.width, r2.height);
  var UPSCALE_ROW = 'R2_5400_upscaled_to_8192';
  report.detail_angular = { grid: GW + 'x' + GH, stencil_deg: +(360 / GW).toFixed(4), boxes: detail };

  if (detail.HIGH_8192 && detail[UPSCALE_ROW]) {
    // Both are on the 8192 grid and measured with the same stencil, so "the real tier carries more fine-scale
    // variation than the upscale" is a like-for-like statement. The bound is 1.5x rather than "any increase":
    // a metric that only had to detect a difference would also pass on JPEG noise.
    var beat = DETAIL_BOXES.filter(function (bx) { return detail.HIGH_8192[bx.id] > detail[UPSCALE_ROW][bx.id] * 1.5; });
    var ratios = DETAIL_BOXES.map(function (bx) { return (detail.HIGH_8192[bx.id] / detail[UPSCALE_ROW][bx.id]).toFixed(2) + 'x'; });
    check('§A4/§B1 real 8192 carries >1.5x the fine-scale detail of an upscaled 5400, in every land box',
      beat.length === DETAIL_BOXES.length, beat.length + '/' + DETAIL_BOXES.length + '  ' + ratios.join(' '));
  }
  if (detail.HIGH_8192 && detail.MID_4096 && detail.BASE_2048) {
    var ordered = DETAIL_BOXES.filter(function (bx) {
      return detail.HIGH_8192[bx.id] > detail.MID_4096[bx.id] && detail.MID_4096[bx.id] > detail.BASE_2048[bx.id];
    }).length;
    check('§B fine-scale detail is ordered HIGH > MID > BASE at a common angular step', ordered === DETAIL_BOXES.length,
      ordered + '/' + DETAIL_BOXES.length + ' boxes');
  }

  // §A — R2's accepted Canada classification, on the grid its thresholds were calibrated for, for EVERY tier
  // plus the accepted asset itself as the reference row.
  report.canada = {};
  function gateOn(label, d) {
    var g = boxDownsample(d.rgb, d.width, d.height, GATE_GRID_W, GATE_GRID_H);
    var res = canada.classifyAll(function (box) { return boxMean(g, GATE_GRID_W, GATE_GRID_H, box); });
    report.canada[label] = res;
    check('§A Canada seasonal gate on ' + label, res.pass, res.summary + (res.problems.length ? '  ' + res.problems.join('; ') : ''));
    return res;
  }
  var gateRef = r2 ? gateOn('R2_5400_accepted', r2) : null;
  ['HIGH', 'MID', 'BASE'].forEach(function (k) { if (decoded[k]) gateOn(k, decoded[k]); });
  // §B10 restated as a measurement rather than a promise: on the gate grid the new tiers must not merely pass,
  // they must read the SAME as the accepted asset. A tier that had drifted to different imagery could still pass
  // the gate on its own while disagreeing here.
  if (gateRef) {
    ['HIGH', 'MID', 'BASE'].forEach(function (k) {
      var a = report.canada[k], b = gateRef;
      if (!a) return;
      var keys = Object.keys(b.bands);
      var worst = 0, which = '';
      keys.forEach(function (bk) { var dd = Math.abs(a.bands[bk] - b.bands[bk]); if (dd > worst) { worst = dd; which = bk; } });
      check('§B10 ' + k + ' reads the same as the accepted R2 asset on the gate grid', worst <= 3.0,
        'max band difference ' + worst.toFixed(1) + ' (' + which + ')');
    });
  }

  // Independent decoder
  if (useBrowser) {
    var chrome = findChrome();
    if (!chrome) {
      check('independent browser decoder available', false, 'no Chrome/Chromium/Edge found; set KM_CHROME');
    } else {
      var files = builder.TIERS.map(function (t) { return 'assets/img/earth/' + t.out; });
      var br = browserDecode(chrome, files);
      report.browser = { binary: path.basename(chrome), grid: GRID_W + 'x' + GRID_H };
      if (br.error) {
        check('independent browser decode', false, br.error + ' ' + (br.tail || ''));
      } else {
        br.views.forEach(function (v, i) {
          var t = builder.TIERS[i], d = decoded[t.key];
          if (v.error) { check('browser decodes ' + t.out, false, v.error); return; }
          check('browser decodes ' + t.out + ' at ' + t.w + 'x' + t.h, v.w === t.w && v.h === t.h, v.w + 'x' + v.h);
          if (!d) return;
          // Compare Chrome's nearest-neighbour grid against ours sampled the same way.
          var tot = 0, worst = 0, n = 0;
          for (var gy = 0; gy < GRID_H; gy++) {
            for (var gx = 0; gx < GRID_W; gx++) {
              var sx = Math.min(d.width - 1, Math.floor((gx + 0.5) * d.width / GRID_W));
              var sy = Math.min(d.height - 1, Math.floor((gy + 0.5) * d.height / GRID_H));
              var mo = (sy * d.width + sx) * 3, bo = (gy * GRID_W + gx) * 3;
              for (var c = 0; c < 3; c++) {
                var dd = Math.abs(d.rgb[mo + c] - v.px[bo + c]);
                tot += dd; if (dd > worst) worst = dd; n++;
              }
            }
          }
          var mean = tot / n;
          // Nearest-neighbour on a 96x48 grid lands on slightly different source texels in the two paths
          // (Chrome maps the grid through its own rounding), so a few units of disagreement is sampling, not
          // decoding. A genuine decode disagreement shows up as tens of units of mean error, not single digits.
          check('browser pixels agree with repo decoder: ' + t.out, mean < 8.0,
            'meanAbsDiff=' + mean.toFixed(2) + ' worst=' + worst + ' over ' + n + ' channels');
        });
      }
    }
  }

  if (asJson) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log('\nDETAIL (mean |Laplacian| of luminance, higher = more real spatial detail)');
    var keys = Object.keys(detail);
    console.log('  ' + 'box'.padEnd(14) + keys.map(function (k) { return k.padStart(11); }).join(''));
    DETAIL_BOXES.forEach(function (bx) {
      console.log('  ' + bx.id.padEnd(14) + keys.map(function (k) { return String(detail[k][bx.id]).padStart(11); }).join(''));
    });
    console.log('\n' + (report.checks.length - fails) + '/' + report.checks.length + ' checks passed');
  }
  return fails ? 1 : 0;
}

module.exports = { jpegSof: jpegSof, decodeWhole: decodeWhole, detailMetric: detailMetric,
                   boxMean: boxMean, DETAIL_BOXES: DETAIL_BOXES, findChrome: findChrome };

if (require.main === module) process.exit(main());
