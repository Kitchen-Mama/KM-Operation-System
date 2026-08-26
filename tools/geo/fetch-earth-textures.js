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
var ASSETS = [
  {
    out: 'earth-albedo-2048.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg',
    bytes: 266599,
    sha256: 'd4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e',
    width: 2048, height: 1024,
    product: 'NASA Blue Marble (2002): land surface, ocean colour and sea ice'
  },
  {
    out: 'earth-albedo-5400.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
    bytes: 2566770,
    sha256: 'a9f0088972dee0254610af851c4d6838ca3f2cf79176987e0a5713e2c15ec042',
    width: 5400, height: 2700,
    product: 'NASA Blue Marble Next Generation, December 2004, w/ Topography and Bathymetry'
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
