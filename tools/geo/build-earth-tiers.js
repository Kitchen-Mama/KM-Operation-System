#!/usr/bin/env node
/**
 * tools/geo/build-earth-tiers.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §B — deterministic generation of the three Earth albedo tiers from ONE
 * pinned higher-resolution NASA source.
 *
 * THE DEFECT THIS CLOSES. R2 corrected WHICH month the surface shows (July 2004 instead of December 2004) but
 * not how many texels it has: the vendored asset was 5400x2700 before and after, so §A4's sharpness requirement
 * was reported as NOT DONE. §B forbids the obvious shortcut - upscaling that 5400x2700 JPEG and calling it
 * higher resolution - and requires genuinely higher spatial detail from a verified source.
 *
 * THE SOURCE EXISTS AND IT IS THE SAME FRAME. NASA's Blue Marble Next Generation image record 73751 - the same
 * record R2 selected July 2004 from - also publishes `world.topo.bathy.200407.3x21600x10800.jpg`: 21600x10800,
 * 233 megapixels, SIXTEEN TIMES the texels of the 5400x2700 file, same month, same product family, same
 * publisher, same licence, same 2:1 equirectangular projection. So this is not a different picture of the Earth
 * chosen for sharpness; it is the SAME picture at its published full resolution, which is exactly why §A's
 * freeze on the July decision is preserved rather than reopened.
 *
 * WHY ALL THREE TIERS COME FROM THE ONE SOURCE. §B10 requires no visible tier seam and no change in geography
 * between tiers. Before this task BASE was a different product entirely (the 2002 Blue Marble
 * `land_ocean_ice_2048.jpg`) while HIGH was BMNG December 2004, so switching tiers changed the season, the
 * bathymetry and the ice - a tier change was a visible change of planet. Deriving 8192, 4096 and 2048 from one
 * decode of one file makes that structurally impossible: the tiers are the same image at three sample rates.
 * It also means R2's accepted Canada gate can be measured on EVERY tier instead of only the desktop one.
 *
 * DETERMINISM (§B3). Every step is fixed-function: a pinned source verified by SHA-256 before use, an exact
 * area-average (box) resample whose weights are derived only from the integer dimensions, exact 2x box halving
 * for the lower tiers, and the baseline JPEG encoder in tools/geo/jpeg-image.js with standard Annex K tables at
 * a pinned quality. No library version, no GPU, no clock and no randomness enters the pixels. Two runs on two
 * machines produce byte-identical files, which is what makes the pinned output digests meaningful.
 *
 * WHY AREA-AVERAGE AND NOT LANCZOS. The reduction is 2.637x in both axes. Area-average over exactly the source
 * footprint of each output texel is the honest downsample for that ratio: it is a correct anti-aliasing filter,
 * it invents no detail, and it cannot ring. Lanczos would look marginally crisper by adding overshoot at
 * coastlines - i.e. by drawing a bright rim that is not in the source - and this task is specifically about not
 * fabricating surface detail.
 *
 *   node tools/geo/build-earth-tiers.js                 # verify pins, build any missing/changed tier
 *   node tools/geo/build-earth-tiers.js --force         # rebuild all tiers
 *   node tools/geo/build-earth-tiers.js --check         # verify only; write nothing (exit 1 on mismatch)
 *   node tools/geo/build-earth-tiers.js --src <file>    # use an already-downloaded source file
 *
 * The 27 MB source is a BUILD INPUT and is deliberately NOT vendored - the same rule the Natural Earth GeoJSON
 * inputs follow. It is cached outside the repository (os.tmpdir()) and re-verified by digest on every run.
 *
 * This is a BUILD tool. It is never loaded by the page and is not part of any runtime path.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var https = require('https');
var crypto = require('crypto');
var codec = require('./jpeg-image.js');

var OUT_DIR = path.join(__dirname, '..', '..', 'assets', 'img', 'earth');
var CACHE_DIR = path.join(os.tmpdir(), 'km-earth-src');

// ---------------------------------------------------------------------------------------------------------
// PINNED SOURCE — the same image record R2 accepted July 2004 from, at its published full resolution.
// ---------------------------------------------------------------------------------------------------------
var SOURCE = {
  file: 'world.topo.bathy.200407.3x21600x10800.jpg',
  url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg',
  bytes: 27201049,
  sha256: 'd225f1f35a6448a4d1d8f6de6e48f3433e470085b70a35800e64f384f269a7b0',
  width: 21600,
  height: 10800,
  product: 'NASA Blue Marble Next Generation, July 2004, w/ Topography and Bathymetry',
  image_record: 73751,
  publisher: 'NASA Earth Observatory / NASA Goddard Space Flight Center',
  licence: 'NASA imagery is not copyrighted and may be used freely; credit requested',
  licence_url: 'https://earthobservatory.nasa.gov/image-use-policy',
  credit: 'Earth imagery courtesy NASA Earth Observatory / NASA Goddard Space Flight Center (Blue Marble)'
};

// ---------------------------------------------------------------------------------------------------------
// TIER LADDER
// ---------------------------------------------------------------------------------------------------------
// Every tier is 2:1 equirectangular (§B2) and power-of-two, so mipmaps and wrapping behave identically on
// WebGL 1 and 2. HIGH is generated by area-average from the 21600-wide source; MID and BASE are EXACT 2x box
// halvings of the tier above, which is what guarantees §B10 - three sample rates of one image, so there is no
// geography to disagree about and no seam to appear when the tier changes.
//
// QUALITY is pinned per tier rather than global. 88 on HIGH keeps the file near the source's own bits-per-pixel
// (the 21600 source is 0.117 B/px; the 5400 file NASA publishes is 0.158 B/px) instead of spending megabytes on
// quantisation noise the sphere shader immediately averages away. Lower tiers get slightly higher quality
// because they are small enough that it costs almost nothing, and they are the ones a weak device sees up close.
var TIERS = [
  { key: 'HIGH', out: 'earth-albedo-8192.jpg', w: 8192, h: 4096, quality: 88, subsampling: '4:2:0', from: 'SOURCE' },
  { key: 'MID',  out: 'earth-albedo-4096.jpg', w: 4096, h: 2048, quality: 90, subsampling: '4:2:0', from: 'HIGH' },
  { key: 'BASE', out: 'earth-albedo-2048.jpg', w: 2048, h: 1024, quality: 92, subsampling: '4:2:0', from: 'MID' }
];

// Pinned output digests. Written by --write-pins after a build, then asserted on every later run and by
// assets/tests/globe-earth-tier-ladder-texture-3-r3.test.js. A pin that no longer matches is a hard failure:
// either the source moved or the pipeline changed, and both must be looked at rather than absorbed.
var OUTPUT_PINS = {
  'earth-albedo-8192.jpg': { bytes: 4217345, sha256: 'e7ca8837c1ec906479f55463955dbf68434a134146958aed646a06ae45a95779' },
  'earth-albedo-4096.jpg': { bytes: 1386011, sha256: '366b86ec02abac1169583b64630304d94a6d782bdc44e65f4990e18a547bd28d' },
  'earth-albedo-2048.jpg': { bytes: 453127, sha256: '02037552b15ec5488e655467d5419a2b31f29777f9ccebca0cf49a27139637d9' }
};

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function download(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error('TOO_MANY_REDIRECTS'));
    https.get(url, { headers: { 'user-agent': 'km-build-earth-tiers' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP_' + res.statusCode)); }
      var chunks = [], got = 0;
      res.on('data', function (d) {
        chunks.push(d); got += d.length;
        if (process.stdout.isTTY) process.stdout.write('\r  downloading ' + (got / 1048576).toFixed(1) + ' MB');
      });
      res.on('end', function () { if (process.stdout.isTTY) process.stdout.write('\n'); resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function acquireSource(explicit) {
  var cached = explicit || path.join(CACHE_DIR, SOURCE.file);
  if (fs.existsSync(cached)) {
    var buf = fs.readFileSync(cached);
    if (buf.length === SOURCE.bytes && sha256(buf) === SOURCE.sha256) return Promise.resolve({ buf: buf, from: cached });
    if (explicit) return Promise.reject(new Error('SOURCE_DIGEST_MISMATCH: ' + explicit));
    console.log('  cached source failed its digest — re-downloading');
  }
  if (explicit) return Promise.reject(new Error('SOURCE_NOT_FOUND: ' + explicit));
  return download(SOURCE.url, 0).then(function (buf) {
    if (buf.length !== SOURCE.bytes) throw new Error('SOURCE_BYTES ' + buf.length + ' != ' + SOURCE.bytes);
    var d = sha256(buf);
    if (d !== SOURCE.sha256) throw new Error('SOURCE_SHA256 ' + d + ' != ' + SOURCE.sha256);
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cached, buf); } catch (e) {}
    return { buf: buf, from: SOURCE.url };
  });
}

// ---------------------------------------------------------------------------------------------------------
// area-average (box) resample — separable, streaming, exact
// ---------------------------------------------------------------------------------------------------------
// Precompute, per output column, the source columns that fall inside its footprint and their overlap lengths.
// Weights come only from the integer dimensions, so they are identical on every machine.
function buildColumnWeights(srcW, dstW) {
  var sx = srcW / dstW;
  var starts = new Int32Array(dstW + 1);
  var idx = [], wts = [];
  for (var ox = 0; ox < dstW; ox++) {
    starts[ox] = idx.length;
    var a = ox * sx, b = (ox + 1) * sx;
    var x0 = Math.floor(a), x1 = Math.ceil(b);
    for (var x = x0; x < x1 && x < srcW; x++) {
      var w = Math.min(b, x + 1) - Math.max(a, x);
      if (w > 0) { idx.push(x); wts.push(w); }
    }
  }
  starts[dstW] = idx.length;
  return { starts: starts, idx: Int32Array.from(idx), wts: Float64Array.from(wts), scale: sx };
}

/**
 * Streaming area-average resample of a JPEG to dstW x dstH RGB.
 * Source rows arrive in order, so each output row can be finalised as soon as the last source row that
 * overlaps it has been seen: only two row accumulators are ever live, and a 233-megapixel source is resampled
 * in about the size of its OUTPUT rather than its input.
 */
function resampleJpeg(buf, dstW, dstH, onProgress) {
  var out = new Uint8Array(dstW * dstH * 3);
  var cw = null;
  // Vertical scale, in source rows per output row. Taken from the PINNED source height rather than from the
  // decoded header, so a source whose dimensions do not match the pin cannot quietly produce a plausible
  // resample - the dimension assertion after the decode is then a real check and not a formality.
  var syf = SOURCE.height / dstH;
  if (!(syf >= 1)) throw new Error('UPSCALE_REFUSED_' + SOURCE.height + '_to_' + dstH);
  var accA = new Float64Array(dstW * 3), accB = new Float64Array(dstW * 3);
  var wA = 0, wB = 0;
  var cur = 0;
  var rowBuf = new Float64Array(dstW * 3);
  var lastPct = -1;

  function finaliseRow(acc, wsum, oy) {
    if (oy < 0 || oy >= dstH) return;
    var o = oy * dstW * 3, inv = wsum > 0 ? 1 / wsum : 0;
    for (var i = 0; i < dstW * 3; i++) {
      var v = acc[i] * inv;
      out[o + i] = v < 0 ? 0 : (v > 255 ? 255 : Math.round(v));
    }
  }

  var info = codec.decodeJpegStreaming(buf, function (y0, rows, rgb, W) {
    if (!cw) {
      if (W < dstW) throw new Error('SOURCE_NARROWER_THAN_TARGET_' + W + '_lt_' + dstW);
      cw = buildColumnWeights(W, dstW);
    }
    for (var ry = 0; ry < rows; ry++) {
      var sy = y0 + ry;
      // horizontal pass for this source row
      var ro = ry * W * 3;
      for (var ox = 0; ox < dstW; ox++) {
        var s0 = cw.starts[ox], s1 = cw.starts[ox + 1];
        var r = 0, g = 0, b = 0, ws = 0;
        for (var k = s0; k < s1; k++) {
          var w = cw.wts[k], so = ro + cw.idx[k] * 3;
          r += rgb[so] * w; g += rgb[so + 1] * w; b += rgb[so + 2] * w; ws += w;
        }
        var iw = ws > 0 ? 1 / ws : 0;
        var oo = ox * 3;
        rowBuf[oo] = r * iw; rowBuf[oo + 1] = g * iw; rowBuf[oo + 2] = b * iw;
      }
      // vertical accumulation — this source row spans [sy, sy+1) and so touches at most two output rows
      var oy0 = Math.floor(sy / syf), oy1 = Math.floor((sy + 1 - 1e-9) / syf);
      for (var oy = oy0; oy <= oy1; oy++) {
        if (oy < cur) continue;
        var w2 = Math.min(sy + 1, (oy + 1) * syf) - Math.max(sy, oy * syf);
        if (!(w2 > 0)) continue;
        var acc = (oy === cur) ? accA : accB;
        for (var i2 = 0; i2 < dstW * 3; i2++) acc[i2] += rowBuf[i2] * w2;
        if (oy === cur) wA += w2; else wB += w2;
      }
      // output row `cur` is complete once the source rows have passed its end
      while (cur < dstH && (cur + 1) * syf <= sy + 1 + 1e-9) {
        finaliseRow(accA, wA, cur);
        var t = accA; accA = accB; accB = t;
        wA = wB; wB = 0;
        accB.fill(0);
        cur++;
        if (onProgress) {
          var pct = Math.floor(cur * 100 / dstH);
          if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
        }
      }
    }
  });

  if (info.width !== SOURCE.width || info.height !== SOURCE.height) {
    throw new Error('SOURCE_DIMENSIONS ' + info.width + 'x' + info.height +
      ' != pinned ' + SOURCE.width + 'x' + SOURCE.height);
  }
  // any tail rows (rounding) get whatever accumulated
  if (cur < dstH) { finaliseRow(accA, wA, cur); cur++; }
  return { rgb: out, width: dstW, height: dstH, decode: info };
}

// Exact 2x box halve. Both dimensions must be even, which every tier below HIGH satisfies by construction, so
// this is an average of exactly four texels — no weights, no rounding policy to argue about beyond one round().
function halve(rgb, w, h) {
  if (w % 2 || h % 2) throw new Error('HALVE_REQUIRES_EVEN_DIMENSIONS_' + w + 'x' + h);
  var ow = w / 2, oh = h / 2;
  var out = new Uint8Array(ow * oh * 3);
  for (var y = 0; y < oh; y++) {
    var r0 = (y * 2) * w * 3, r1 = (y * 2 + 1) * w * 3, oo = y * ow * 3;
    for (var x = 0; x < ow; x++) {
      var a = r0 + x * 6, b = r1 + x * 6, o = oo + x * 3;
      for (var k = 0; k < 3; k++) {
        out[o + k] = Math.round((rgb[a + k] + rgb[a + 3 + k] + rgb[b + k] + rgb[b + 3 + k]) / 4);
      }
    }
  }
  return { rgb: out, width: ow, height: oh };
}

// ---------------------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------------------
function main() {
  var argv = process.argv.slice(2);
  var force = argv.indexOf('--force') !== -1;
  var checkOnly = argv.indexOf('--check') !== -1;
  var writePins = argv.indexOf('--write-pins') !== -1;
  var srcIdx = argv.indexOf('--src');
  var explicitSrc = srcIdx !== -1 ? argv[srcIdx + 1] : null;
  var report = { source: null, tiers: [], timings: {} };

  var upToDate = TIERS.every(function (t) {
    var p = path.join(OUT_DIR, t.out);
    if (!fs.existsSync(p)) return false;
    var pin = OUTPUT_PINS[t.out];
    if (!pin || /^0+$/.test(pin.sha256)) return false;
    var b = fs.readFileSync(p);
    return b.length === pin.bytes && sha256(b) === pin.sha256;
  });

  if (upToDate && !force) {
    console.log('All ' + TIERS.length + ' tiers present and matching their pinned digests. Nothing to do.');
    TIERS.forEach(function (t) { console.log('  OK  ' + t.out + '  ' + OUTPUT_PINS[t.out].bytes + ' B'); });
    return Promise.resolve(0);
  }
  if (checkOnly) {
    console.error('CHECK FAILED: at least one tier is missing or does not match its pinned digest.');
    return Promise.resolve(1);
  }

  console.log('Source: ' + SOURCE.file + '  ' + SOURCE.width + 'x' + SOURCE.height +
              '  ' + SOURCE.bytes + ' B  sha256 ' + SOURCE.sha256.slice(0, 16) + '...');

  return acquireSource(explicitSrc).then(function (src) {
    report.source = { from: src.from, bytes: src.buf.length, sha256: sha256(src.buf) };
    console.log('  verified from ' + src.from);

    var t0 = Date.now();
    var high = resampleJpeg(src.buf, TIERS[0].w, TIERS[0].h, function (pct) {
      if (process.stdout.isTTY && pct % 5 === 0) process.stdout.write('\r  decode+resample ' + pct + '%');
    });
    if (process.stdout.isTTY) process.stdout.write('\n');
    report.timings.decode_resample_ms = Date.now() - t0;
    console.log('  decoded ' + high.decode.width + 'x' + high.decode.height + ' ' + high.decode.subsampling +
                ' and resampled to ' + high.width + 'x' + high.height +
                ' in ' + report.timings.decode_resample_ms + ' ms');

    var planes = { HIGH: { rgb: high.rgb, width: high.width, height: high.height } };
    var t1 = Date.now();
    planes.MID = halve(planes.HIGH.rgb, planes.HIGH.width, planes.HIGH.height);
    planes.BASE = halve(planes.MID.rgb, planes.MID.width, planes.MID.height);
    report.timings.halve_ms = Date.now() - t1;

    TIERS.forEach(function (t) {
      var pl = planes[t.key];
      if (pl.width !== t.w || pl.height !== t.h) {
        throw new Error('TIER_DIMENSION_MISMATCH ' + t.key + ' ' + pl.width + 'x' + pl.height);
      }
      var te = Date.now();
      var jpg = codec.encodeJpeg({
        width: pl.width, height: pl.height, rgb: pl.rgb,
        quality: t.quality, subsampling: t.subsampling
      });
      var ms = Date.now() - te;
      var digest = sha256(jpg);
      var p = path.join(OUT_DIR, t.out);
      fs.writeFileSync(p, jpg);
      var pin = OUTPUT_PINS[t.out];
      var pinned = pin && !/^0+$/.test(pin.sha256);
      var match = pinned ? (jpg.length === pin.bytes && digest === pin.sha256) : null;
      report.tiers.push({
        key: t.key, file: t.out, width: pl.width, height: pl.height,
        quality: t.quality, subsampling: t.subsampling, derived_from: t.from,
        bytes: jpg.length, sha256: digest, encode_ms: ms,
        bytes_per_pixel: +(jpg.length / (pl.width * pl.height)).toFixed(4),
        gpu_bytes_rgb8_with_mips: Math.round(pl.width * pl.height * 3 * 4 / 3),
        pin_match: match
      });
      console.log('  ' + (match === false ? 'PIN MISMATCH' : 'wrote') + '  ' + t.out + '  ' +
                  pl.width + 'x' + pl.height + '  q' + t.quality + '  ' + jpg.length + ' B  ' +
                  'sha256 ' + digest + '  (' + ms + ' ms)');
    });

    if (writePins) {
      var lines = report.tiers.map(function (t) {
        return "  '" + t.file + "': { bytes: " + t.bytes + ", sha256: '" + t.sha256 + "' }";
      });
      console.log('\nPaste into OUTPUT_PINS:\nvar OUTPUT_PINS = {\n' + lines.join(',\n') + '\n};');
    }

    var mism = report.tiers.filter(function (t) { return t.pin_match === false; });
    if (mism.length && !writePins) {
      console.error('\n' + mism.length + ' tier(s) did not match their pinned digest. This is a hard failure: ' +
                    'either the source moved or the pipeline changed.');
      return 1;
    }
    console.log('\nJSON REPORT\n' + JSON.stringify(report, null, 2));
    return 0;
  });
}

module.exports = {
  SOURCE: SOURCE, TIERS: TIERS, OUTPUT_PINS: OUTPUT_PINS,
  buildColumnWeights: buildColumnWeights, halve: halve, resampleJpeg: resampleJpeg, sha256: sha256
};

if (require.main === module) {
  main().then(function (code) { process.exit(code || 0); }, function (e) {
    console.error('FAILED: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}
