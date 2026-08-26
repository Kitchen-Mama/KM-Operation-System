#!/usr/bin/env node
/**
 * tools/geo/fetch-earth-textures.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-2 — deterministic re-acquisition of the vendored Earth albedo textures.
 *
 * This is a BUILD/MAINTENANCE tool. It is never loaded by the page, and it is not part of any runtime path:
 * assets/js/lib/km-globe.js contains no URL, no fetch, no XMLHttpRequest and no tile server (the regression
 * suites assert this). Its only job is to make the two vendored binaries REPRODUCIBLE by someone who does not
 * trust them: it re-downloads the exact upstream files and verifies them against pinned SHA-256 digests.
 *
 * It is CHECKSUM-FIRST and FAIL-CLOSED. A file is written only if its digest matches the pin, so a moved,
 * re-encoded or substituted upstream file is a hard error rather than a silent content change in the repository.
 * There is no image processing here at all — the bytes are vendored exactly as served — because this toolchain
 * has no image codec, and a re-encode that cannot be verified by checksum would defeat the purpose.
 *
 * Provenance, dimensions, licence and attribution: assets/img/earth/PROVENANCE.md
 *
 *   node tools/geo/fetch-earth-textures.js            # verify existing files, download only what is missing
 *   node tools/geo/fetch-earth-textures.js --force    # re-download and re-verify both
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var crypto = require('crypto');

var OUT_DIR = path.join(__dirname, '..', '..', 'assets', 'img', 'earth');

// Pinned upstream identity. `sha256` is the digest of the upstream file AS SERVED; `bytes` is a cheap pre-check
// that catches a truncated download before hashing. Both are recorded in PROVENANCE.md.
// OWNERSHIP CHANGED IN TEXTURE-3-R3 §B, AND THIS TOOL WOULD HAVE CLOBBERED THE NEW TIERS IF IT HAD NOT.
//
// This file used to own `earth-albedo-2048.jpg` and pinned it to the 2002 Blue Marble `land_ocean_ice_2048.jpg`
// (sha256 d4dc80a6...). R3 regenerates all three runtime tiers - 8192, 4096 and 2048 - from ONE pinned
// 21600x10800 July 2004 source, so that filename now holds a DERIVED file with different bytes. Left as it was,
// a plain run of this tool would have found a digest mismatch, re-downloaded the 2002 image and silently
// replaced the generated BASE tier with a different product - undoing §B10 without a word.
//
// So the tiers are owned by tools/geo/build-earth-tiers.js, which generates and pins them, and this tool keeps
// exactly one asset: `earth-albedo-5400.jpg`, which is no longer a runtime tier but IS the frozen acceptance
// baseline that TEXTURE-3-R2's Canada gate measures. Retaining it costs 2.2 MB of repository weight and buys the
// accepted gate; retiring it is a one-line decision for the reviewer, not one to take silently here.
var ASSETS = [
  {
    out: 'earth-albedo-5400.jpg',
    // MAP-VISUAL-REAL-EARTH-TEXTURE-3-R2 §L2 — JULY, NOT DECEMBER, AND THE REASON THE PREVIOUS ROUND CHOSE
    // DECEMBER WAS A SEARCH ERROR RATHER THAN AN AVAILABILITY LIMIT.
    //
    // TEXTURE-2's provenance recorded that "months 200401/04/06/07/08/09 all return HTTP 404 at that size" and
    // concluded December was the only 5400x2700 topography+bathymetry image NASA publishes. That is false. Each
    // BMNG month has its OWN image record; the probe had queried record 73909 (December's record) for every
    // month, so of course every other month 404'd. Measured with HEAD requests: 200407 lives at record 73751
    // (2,308,798 B) and 200408 at 73776 (2,308,163 B), both HTTP 200.
    //
    // That mattered, because December is a WINTER composite and it is the whole of the Canada defect: measured
    // over the vendored December asset, southern-prairie Canada reads rgb(193,192,187) - brighter than the Arctic
    // ice in the same image - and the snow line runs along the 49th parallel, so the surface showed a colour
    // discontinuity that followed a political border. July reads rgb(62,69,34) in the same box.
    //
    // JULY over August, decided by measurement rather than preference: the two are indistinguishable across
    // southern Canada (prairie L60/L64/L50 vs L59/L64/L53) but July retains MORE legitimate high-elevation snow
    // (St Elias glacier L175 vs L170), and §L2 forbids removing real mountain snow while fixing the season.
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg',
    bytes: 2308798,
    sha256: '4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba',
    width: 5400, height: 2700,
    product: 'NASA Blue Marble Next Generation, July 2004, w/ Topography and Bathymetry'
  }
];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// Read the true pixel dimensions out of the JPEG's SOF marker. This is the one check a checksum cannot make for
// you if the pin itself were ever updated carelessly: the shader's texel maths and the tier ladder both depend on
// these being exactly what km-globe.js believes.
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  var i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var m = buf[i + 1];
    if (m === 0xD8 || m === 0xD9 || m === 0x01 || m === 0xFF || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (i + 3 >= buf.length) return null;
    var len = buf.readUInt16BE(i + 2);
    // any SOF except DHT (C4), JPG (C8) and DAC (CC)
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      if (i + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function download(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'user-agent': 'km-ops-earth-texture-fetch' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(require('url').resolve(url, res.headers.location), redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Every reason a candidate can be rejected, named. A silent "close enough" here would put unverified bytes in the
// repository, which is the one thing this script exists to prevent.
function verify(a, buf) {
  var problems = [];
  if (buf.length !== a.bytes) problems.push('SIZE_MISMATCH expected ' + a.bytes + ' got ' + buf.length);
  var got = sha256(buf);
  if (got !== a.sha256) problems.push('SHA256_MISMATCH expected ' + a.sha256 + ' got ' + got);
  var dim = jpegSize(buf);
  if (!dim) problems.push('NOT_A_DECODABLE_JPEG_HEADER');
  else if (dim.width !== a.width || dim.height !== a.height) {
    problems.push('DIMENSION_MISMATCH expected ' + a.width + 'x' + a.height + ' got ' + dim.width + 'x' + dim.height);
  }
  return problems;
}

function main() {
  var force = process.argv.indexOf('--force') !== -1;
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  var failures = 0;
  var chain = Promise.resolve();
  ASSETS.forEach(function (a) {
    chain = chain.then(function () {
      var dest = path.join(OUT_DIR, a.out);
      if (!force && fs.existsSync(dest)) {
        var problems = verify(a, fs.readFileSync(dest));
        if (!problems.length) {
          console.log('OK       ' + a.out + '  ' + a.width + 'x' + a.height + '  ' + a.bytes + ' B  (already vendored, verified)');
          return;
        }
        console.log('STALE    ' + a.out + '  ' + problems.join(' | ') + '  -> re-downloading');
      }
      console.log('GET      ' + a.url);
      return download(a.url).then(function (buf) {
        var problems = verify(a, buf);
        if (problems.length) {
          failures++;
          console.error('REFUSED  ' + a.out + '  NOTHING WRITTEN');
          problems.forEach(function (p) { console.error('           ' + p); });
          return;
        }
        fs.writeFileSync(dest, buf);
        console.log('WROTE    ' + a.out + '  ' + a.width + 'x' + a.height + '  ' + buf.length + ' B  sha256 ok');
        console.log('           ' + a.product);
      });
    });
  });

  chain.then(function () {
    console.log('');
    console.log('Licence: NASA content, including texture maps, is generally not subject to copyright in the US.');
    console.log('NASA must be acknowledged as the source. See assets/img/earth/PROVENANCE.md for the verbatim policy.');
    if (failures) { console.error('\n' + failures + ' asset(s) REFUSED — the repository was not modified.'); process.exit(1); }
  }, function (e) {
    console.error('FATAL ' + (e && e.message || e));
    process.exit(1);
  });
}

main();
