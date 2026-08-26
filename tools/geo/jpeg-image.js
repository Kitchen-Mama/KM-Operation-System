/**
 * tools/geo/jpeg-image.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §B — a dependency-free BASELINE JPEG decoder and encoder.
 *
 * WHY THIS EXISTS. §B requires a real surface-resolution upgrade derived DETERMINISTICALLY from verified
 * higher-resolution source imagery, and explicitly forbids upscaling the existing 5400x2700 file and calling it
 * higher resolution. NASA publishes the same July 2004 Blue Marble Next Generation frame at 21600x10800 - 233
 * megapixels, sixteen times the texels of the vendored 5400x2700 - so the imagery exists. What did not exist was
 * any way to READ it: this toolchain has no image library (no sharp, no jimp, no ImageMagick, no PIL), and
 * tools/geo/jpeg-dc-probe.js decodes DC coefficients only, which is an exact 1/8-scale image and therefore
 * cannot produce an 8192-wide tier.
 *
 * So the pipeline is built rather than borrowed. That is also the honest choice for reproducibility: a reviewer
 * who does not trust the vendored tiers can re-run one command and get byte-identical files, because every step
 * here is IEEE-deterministic with no library version in the loop. Driving a headless browser's canvas would
 * have been less code and strictly weaker - the output would then depend on the local Skia build.
 *
 * SCOPE, stated so it is not mistaken for more than it is:
 *   DECODER - baseline sequential DCT (SOF0/SOF1), 8-bit precision, 1-3 components, arbitrary sampling factors,
 *             restart intervals. Progressive (SOF2), 12-bit and arithmetic coding are REPORTED as unsupported
 *             rather than guessed at. The pinned NASA source is SOF0 8-bit 4:2:0, which is asserted at decode.
 *   ENCODER - baseline sequential DCT, 8-bit, 3-component YCbCr, 4:2:0 or 4:4:4, standard Annex K quantisation
 *             tables scaled by a quality factor, standard Annex K Huffman tables. No progressive, no
 *             optimised/custom Huffman tables, no restart intervals, no EXIF, no colour profile.
 *
 * The decoder STREAMS: it hands back one MCU row of RGB at a time, so a 233-megapixel image is decoded in about
 * a megabyte of working memory instead of the ~700 MB a whole-image buffer would need.
 *
 * This is a BUILD/VERIFICATION tool. It is never loaded by the page and is not part of any runtime path.
 */
'use strict';

// ---------------------------------------------------------------------------------------------------------
// shared tables
// ---------------------------------------------------------------------------------------------------------

// Zig-zag order: coefficient k of the entropy-coded sequence lives at natural index ZIGZAG[k] of the 8x8 block.
var ZIGZAG = [
   0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63
];

// The 8-point orthonormal DCT-II basis, used for both the inverse and the forward transform. Chosen over a fast
// butterfly on purpose: it is short enough to audit against the definition, and the whole point of this file is
// that a reviewer can believe its output. The all-AC-zero shortcut below recovers most of the speed a butterfly
// would have given, because on this imagery a large fraction of ocean blocks are flat.
var COS = (function () {
  var t = new Float64Array(64);
  for (var u = 0; u < 8; u++) {
    var cu = (u === 0) ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
    for (var x = 0; x < 8; x++) t[u * 8 + x] = cu * Math.cos((2 * x + 1) * u * Math.PI / 16);
  }
  return t;
})();

function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

// ---------------------------------------------------------------------------------------------------------
// bit reader — fast enough for 27 MB of entropy-coded data
// ---------------------------------------------------------------------------------------------------------
// A marker (FFxx where xx is not 00) is NOT entropy data. It must be left in place for the restart handler
// rather than fed in as eight data bits, which would put the Huffman decoder permanently out of phase and read
// as plausible-but-wrong colour everywhere. Byte stuffing (FF 00) yields a literal FF.
function BitReader(buf, pos) {
  this.buf = buf;
  this.pos = pos;
  this.acc = 0;      // bit accumulator, most-significant bit first
  this.cnt = 0;      // number of valid bits in acc
  this.marker = 0;   // set once a marker has been reached
  this.eof = false;
}

BitReader.prototype.fill = function () {
  while (this.cnt <= 24) {
    if (this.marker || this.pos >= this.buf.length) {
      this.acc = (this.acc << 8) & 0xFFFFFFFF; this.cnt += 8; this.eof = true; continue;
    }
    var b = this.buf[this.pos];
    if (b === 0xFF) {
      var nxt = this.buf[this.pos + 1];
      if (nxt === 0x00) { this.pos += 2; }
      else { this.marker = nxt || 0xD9; this.acc = (this.acc << 8) & 0xFFFFFFFF; this.cnt += 8; continue; }
    } else { this.pos++; }
    this.acc = ((this.acc << 8) | b) & 0xFFFFFFFF;
    this.cnt += 8;
  }
};

BitReader.prototype.receive = function (n) {
  if (n === 0) return 0;
  if (this.cnt < n) this.fill();
  var v = (this.acc >>> (this.cnt - n)) & ((1 << n) - 1);
  this.cnt -= n;
  return v;
};
// EXTEND (spec F.2.2.1): an n-bit magnitude whose top bit is 0 encodes a negative value.
BitReader.prototype.receiveExtend = function (n) {
  var v = this.receive(n);
  return (v < (1 << (n - 1))) ? v - (1 << n) + 1 : v;
};
// Realign to the next byte boundary, consume the RSTn marker, and resume.
BitReader.prototype.restart = function () {
  this.cnt = 0; this.acc = 0;
  while (this.pos < this.buf.length - 1) {
    if (this.buf[this.pos] === 0xFF && this.buf[this.pos + 1] >= 0xD0 && this.buf[this.pos + 1] <= 0xD7) {
      this.pos += 2; this.marker = 0; this.eof = false; return true;
    }
    this.pos++;
  }
  return false;
};

// ---------------------------------------------------------------------------------------------------------
// Huffman — canonical mincode/maxcode/valptr decode (spec Figure F.16)
// ---------------------------------------------------------------------------------------------------------
function buildHuffTable(bits, vals) {
  var huffsize = [], huffcode = [], i, j, k, code, si;
  for (i = 1; i <= 16; i++) for (j = 0; j < bits[i - 1]; j++) huffsize.push(i);
  huffsize.push(0);
  k = 0; code = 0; si = huffsize[0];
  while (huffsize[k]) {
    while (huffsize[k] === si) { huffcode[k++] = code++; }
    code <<= 1; si++;
  }
  var mincode = new Int32Array(18), maxcode = new Int32Array(18), valptr = new Int32Array(18);
  var p = 0;
  for (i = 1; i <= 16; i++) {
    if (bits[i - 1]) { valptr[i] = p; mincode[i] = huffcode[p]; p += bits[i - 1]; maxcode[i] = huffcode[p - 1]; }
    else { maxcode[i] = -1; }
  }
  maxcode[17] = 0x7FFFFFFF;
  return { mincode: mincode, maxcode: maxcode, valptr: valptr, vals: vals, bits: bits };
}

function huffDecode(br, t) {
  var code = br.receive(1), l = 1;
  while (code > t.maxcode[l]) { code = (code << 1) | br.receive(1); l++; if (l > 16) return 0; }
  return t.vals[t.valptr[l] + code - t.mincode[l]];
}

// ---------------------------------------------------------------------------------------------------------
// DECODER
// ---------------------------------------------------------------------------------------------------------
/**
 * decodeJpegStreaming(buf, onRows) -> info
 *
 * Decodes a baseline JPEG and calls onRows(y0, rowCount, rgb, width) once per MCU row, where `rgb` holds
 * rowCount*width*3 bytes. `rgb` is REUSED between calls - consume or copy it before returning. rowCount is
 * already clipped to the image height, so the caller never sees the MCU padding rows.
 */
function decodeJpegStreaming(buf, onRows) {
  if (!(buf && buf.length > 4) || buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('NOT_A_JPEG');

  var qt = {}, huffDC = {}, huffAC = {}, frame = null, restartInterval = 0;
  var i = 2;

  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var m = buf[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m === 0xD9) break;
    if (i + 3 >= buf.length) break;
    var len = buf.readUInt16BE(i + 2);
    var seg = i + 4, segEnd = i + 2 + len;

    if (m === 0xDB) {                                   // DQT
      while (seg < segEnd) {
        var pq = buf[seg] >> 4, tq = buf[seg] & 15; seg++;
        var tbl = new Int32Array(64);
        for (var z = 0; z < 64; z++) tbl[ZIGZAG[z]] = pq ? buf.readUInt16BE(seg + z * 2) : buf[seg + z];
        seg += pq ? 128 : 64;
        qt[tq] = tbl;
      }
    } else if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {   // SOF
      if (m !== 0xC0 && m !== 0xC1) throw new Error('UNSUPPORTED_JPEG_SOF' + (m - 0xC0) + '_BASELINE_ONLY');
      var prec = buf[seg];
      if (prec !== 8) throw new Error('UNSUPPORTED_JPEG_PRECISION_' + prec);
      var fh = buf.readUInt16BE(seg + 1), fw = buf.readUInt16BE(seg + 3), nc = buf[seg + 5];
      if (nc < 1 || nc > 3) throw new Error('UNSUPPORTED_JPEG_COMPONENTS_' + nc);
      var comps = [], hmax = 1, vmax = 1;
      for (var c = 0; c < nc; c++) {
        var o = seg + 6 + c * 3;
        var cp = { id: buf[o], hs: buf[o + 1] >> 4, vs: buf[o + 1] & 15, tq: buf[o + 2] };
        if (cp.hs < 1 || cp.vs < 1) throw new Error('BAD_SAMPLING_FACTOR');
        if (cp.hs > hmax) hmax = cp.hs;
        if (cp.vs > vmax) vmax = cp.vs;
        comps.push(cp);
      }
      frame = { width: fw, height: fh, comps: comps, hmax: hmax, vmax: vmax };
    } else if (m === 0xC4) {                            // DHT
      while (seg < segEnd) {
        var tc = buf[seg] >> 4, th = buf[seg] & 15; seg++;
        var bits = [], total = 0;
        for (var b1 = 0; b1 < 16; b1++) { bits.push(buf[seg + b1]); total += buf[seg + b1]; }
        seg += 16;
        var vals = [];
        for (var v1 = 0; v1 < total; v1++) vals.push(buf[seg + v1]);
        seg += total;
        var ht = buildHuffTable(bits, vals);
        if (tc === 0) huffDC[th] = ht; else huffAC[th] = ht;
      }
    } else if (m === 0xDD) {                            // DRI
      restartInterval = buf.readUInt16BE(seg);
    } else if (m === 0xDA) {                            // SOS — entropy-coded data starts after this segment
      break;
    }
    i = segEnd;
  }

  if (!frame) throw new Error('NO_SOF_MARKER');
  if (buf[i + 1] !== 0xDA) throw new Error('NO_SOS_MARKER');

  var sosLen = buf.readUInt16BE(i + 2);
  var ns = buf[i + 4];
  var scanComps = [];
  for (var s = 0; s < ns; s++) {
    var cid = buf[i + 5 + s * 2], tt = buf[i + 6 + s * 2], fc = null;
    for (var q = 0; q < frame.comps.length; q++) if (frame.comps[q].id === cid) fc = frame.comps[q];
    if (!fc) throw new Error('SCAN_COMPONENT_NOT_IN_FRAME');
    fc.dcTbl = tt >> 4; fc.acTbl = tt & 15;
    scanComps.push(fc);
  }
  if (ns !== frame.comps.length) throw new Error('UNSUPPORTED_NON_INTERLEAVED_SCAN');

  var W = frame.width, H = frame.height, hmx = frame.hmax, vmx = frame.vmax;
  var mcuW = hmx * 8, mcuH = vmx * 8;
  var mcusPerLine = Math.ceil(W / mcuW), mcuLines = Math.ceil(H / mcuH);

  frame.comps.forEach(function (cp) {
    cp.lineW = mcusPerLine * cp.hs * 8;
    cp.lineH = cp.vs * 8;
    cp.samples = new Uint8Array(cp.lineW * cp.lineH);
    cp.pred = 0;
    cp.qtbl = qt[cp.tq];
    if (!cp.qtbl) throw new Error('MISSING_QUANT_TABLE_' + cp.tq);
  });

  var br = new BitReader(buf, i + 2 + sosLen);
  var coef = new Int32Array(64);
  var blk = new Float64Array(64);
  var tmp = new Float64Array(64);
  var rgb = new Uint8Array(mcuH * W * 3);
  var mcusDone = 0;

  function idctBlock(cp, dstX, dstY) {
    var qtbl = cp.qtbl, out = cp.samples, lineW = cp.lineW, k, u, x, y;
    var allZero = true;
    for (k = 1; k < 64; k++) if (coef[k]) { allZero = false; break; }
    if (allZero) {
      var dc = clamp255(Math.round(coef[0] * qtbl[0] / 8 + 128));
      for (y = 0; y < 8; y++) {
        var ro = (dstY + y) * lineW + dstX;
        for (x = 0; x < 8; x++) out[ro + x] = dc;
      }
      return;
    }
    for (k = 0; k < 64; k++) blk[k] = coef[k] * qtbl[k];
    for (y = 0; y < 8; y++) {
      for (x = 0; x < 8; x++) {
        var sv = 0;
        for (u = 0; u < 8; u++) sv += COS[u * 8 + y] * blk[u * 8 + x];
        tmp[y * 8 + x] = sv;
      }
    }
    for (y = 0; y < 8; y++) {
      var ro2 = (dstY + y) * lineW + dstX, base = y * 8;
      for (x = 0; x < 8; x++) {
        var sh = 0;
        for (u = 0; u < 8; u++) sh += COS[u * 8 + x] * tmp[base + u];
        out[ro2 + x] = clamp255(Math.round(sh + 128));
      }
    }
  }

  function decodeBlock(cp, dstX, dstY) {
    for (var k = 0; k < 64; k++) coef[k] = 0;
    var tDC = huffDC[cp.dcTbl], tAC = huffAC[cp.acTbl];
    if (!tDC || !tAC) throw new Error('MISSING_HUFFMAN_TABLE');
    var t0 = huffDecode(br, tDC);
    cp.pred += t0 ? br.receiveExtend(t0) : 0;
    coef[0] = cp.pred;
    var kk = 1;
    while (kk < 64) {
      var rs = huffDecode(br, tAC), sBits = rs & 15, r = rs >> 4;
      if (sBits === 0) { if (r !== 15) break; kk += 16; continue; }
      kk += r;
      if (kk > 63) break;
      coef[ZIGZAG[kk]] = br.receiveExtend(sBits);
      kk++;
    }
    idctBlock(cp, dstX, dstY);
  }

  var cY = frame.comps[0], cB = frame.comps[1] || null, cR = frame.comps[2] || null;
  var nComp = frame.comps.length;

  for (var my = 0; my < mcuLines; my++) {
    for (var mx = 0; mx < mcusPerLine; mx++) {
      if (restartInterval && mcusDone > 0 && mcusDone % restartInterval === 0) {
        br.restart();
        frame.comps.forEach(function (cp) { cp.pred = 0; });
      }
      for (var ci = 0; ci < scanComps.length; ci++) {
        var cp2 = scanComps[ci];
        for (var by = 0; by < cp2.vs; by++) {
          for (var bx = 0; bx < cp2.hs; bx++) decodeBlock(cp2, (mx * cp2.hs + bx) * 8, by * 8);
        }
      }
      mcusDone++;
    }

    var y0 = my * mcuH;
    var rows = Math.min(mcuH, H - y0);
    for (var ry = 0; ry < rows; ry++) {
      var ob = ry * W * 3;
      var yRow = (((ry * cY.vs / vmx) | 0)) * cY.lineW;
      var bRow = cB ? (((ry * cB.vs / vmx) | 0)) * cB.lineW : 0;
      var rRow = cR ? (((ry * cR.vs / vmx) | 0)) * cR.lineW : 0;
      for (var px = 0; px < W; px++) {
        var Yv = cY.samples[yRow + ((px * cY.hs / hmx) | 0)];
        if (nComp === 1) { rgb[ob] = Yv; rgb[ob + 1] = Yv; rgb[ob + 2] = Yv; ob += 3; continue; }
        var Cb = cB.samples[bRow + ((px * cB.hs / hmx) | 0)] - 128;
        var Cr = cR.samples[rRow + ((px * cR.hs / hmx) | 0)] - 128;
        rgb[ob]     = clamp255(Math.round(Yv + 1.402 * Cr));
        rgb[ob + 1] = clamp255(Math.round(Yv - 0.344136 * Cb - 0.714136 * Cr));
        rgb[ob + 2] = clamp255(Math.round(Yv + 1.772 * Cb));
        ob += 3;
      }
    }
    onRows(y0, rows, rgb, W);
  }

  return {
    width: W, height: H, components: nComp,
    sampling: frame.comps.map(function (cp) { return cp.hs + 'x' + cp.vs; }).join(','),
    subsampling: (nComp === 3 && hmx === 2 && vmx === 2) ? '4:2:0'
               : (nComp === 3 && hmx === 1 && vmx === 1) ? '4:4:4' : hmx + 'x' + vmx,
    restart_interval: restartInterval,
    mcu_rows: mcuLines
  };
}

// ---------------------------------------------------------------------------------------------------------
// ENCODER — baseline sequential, standard Annex K tables
// ---------------------------------------------------------------------------------------------------------
// Annex K.1 example quantisation tables (the de-facto standard baseline), in NATURAL (not zig-zag) order.
var QT_LUMA_50 = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99
];
var QT_CHROMA_50 = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99
];

// The IJG quality scaling, reproduced exactly so that "quality 90" here means what it means everywhere else.
function scaleQuantTable(base, quality) {
  var q = Math.max(1, Math.min(100, quality | 0));
  var scale = (q < 50) ? Math.floor(5000 / q) : (200 - q * 2);
  var out = new Int32Array(64);
  for (var k = 0; k < 64; k++) {
    var v = Math.floor((base[k] * scale + 50) / 100);
    out[k] = v < 1 ? 1 : (v > 255 ? 255 : v);
  }
  return out;
}

// Annex K.3 standard Huffman tables.
var STD_DC_LUMA_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
var STD_DC_LUMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
var STD_DC_CHROMA_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
var STD_DC_CHROMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
var STD_AC_LUMA_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
var STD_AC_LUMA_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa
];
var STD_AC_CHROMA_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
var STD_AC_CHROMA_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa
];

// (code, length) per symbol value, in canonical order.
function buildHuffEncode(bits, vals) {
  var codes = new Int32Array(256), lens = new Int32Array(256);
  var code = 0, k = 0;
  for (var l = 1; l <= 16; l++) {
    for (var n = 0; n < bits[l - 1]; n++) { codes[vals[k]] = code; lens[vals[k]] = l; k++; code++; }
    code <<= 1;
  }
  return { codes: codes, lens: lens };
}

function ByteWriter() { this.chunks = []; this.buf = Buffer.alloc(1 << 16); this.n = 0; }
ByteWriter.prototype.byte = function (b) {
  if (this.n === this.buf.length) { this.chunks.push(this.buf); this.buf = Buffer.alloc(1 << 16); this.n = 0; }
  this.buf[this.n++] = b & 0xFF;
};
ByteWriter.prototype.word = function (w) { this.byte(w >> 8); this.byte(w); };
ByteWriter.prototype.bytes = function (arr) { for (var i = 0; i < arr.length; i++) this.byte(arr[i]); };
ByteWriter.prototype.finish = function () {
  this.chunks.push(this.buf.subarray(0, this.n));
  return Buffer.concat(this.chunks);
};

/**
 * encodeJpeg({ width, height, rgb, quality, subsampling }) -> Buffer
 *
 * `rgb` is a Uint8Array of width*height*3. `subsampling` is '4:2:0' (default) or '4:4:4'.
 * The whole image is held in memory here - the tiers this produces are at most 8192x4096 (100 MB of RGB),
 * which is affordable; the 233-megapixel SOURCE is never encoded, only decoded (which streams).
 */
function encodeJpeg(opts) {
  var W = opts.width | 0, H = opts.height | 0;
  var rgb = opts.rgb;
  var quality = opts.quality == null ? 90 : (opts.quality | 0);
  var sub = opts.subsampling || '4:2:0';
  if (sub !== '4:2:0' && sub !== '4:4:4') throw new Error('UNSUPPORTED_SUBSAMPLING_' + sub);
  if (!(W > 0 && H > 0)) throw new Error('BAD_DIMENSIONS');
  if (!rgb || rgb.length < W * H * 3) throw new Error('RGB_BUFFER_TOO_SMALL');

  var qL = scaleQuantTable(QT_LUMA_50, quality);
  var qC = scaleQuantTable(QT_CHROMA_50, quality);

  var hs = (sub === '4:2:0') ? 2 : 1, vs = hs;
  var mcuW = hs * 8, mcuH = vs * 8;
  var mcusX = Math.ceil(W / mcuW), mcusY = Math.ceil(H / mcuH);

  // Full-resolution luma plus (possibly decimated) chroma planes, as floats centred on zero.
  var cw = (sub === '4:2:0') ? Math.ceil(W / 2) : W;
  var ch = (sub === '4:2:0') ? Math.ceil(H / 2) : H;
  var Yp = new Float32Array(W * H);
  var Bp = new Float32Array(cw * ch);
  var Rp = new Float32Array(cw * ch);
  var Wt = (sub === '4:2:0') ? new Float32Array(cw * ch) : null;

  for (var y = 0; y < H; y++) {
    var so = y * W * 3, yo = y * W;
    for (var x = 0; x < W; x++) {
      var r = rgb[so + x * 3], g = rgb[so + x * 3 + 1], b = rgb[so + x * 3 + 2];
      var Yv = 0.299 * r + 0.587 * g + 0.114 * b;
      var Cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      var Cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
      Yp[yo + x] = Yv - 128;
      if (sub === '4:2:0') {
        var ci = ((y >> 1) * cw) + (x >> 1);
        Bp[ci] += Cb; Rp[ci] += Cr; Wt[ci] += 1;
      } else {
        Bp[yo + x] = Cb; Rp[yo + x] = Cr;
      }
    }
  }
  if (Wt) for (var ci2 = 0; ci2 < Wt.length; ci2++) { var wv = Wt[ci2] || 1; Bp[ci2] /= wv; Rp[ci2] /= wv; }

  var eDCl = buildHuffEncode(STD_DC_LUMA_BITS, STD_DC_LUMA_VALS);
  var eACl = buildHuffEncode(STD_AC_LUMA_BITS, STD_AC_LUMA_VALS);
  var eDCc = buildHuffEncode(STD_DC_CHROMA_BITS, STD_DC_CHROMA_VALS);
  var eACc = buildHuffEncode(STD_AC_CHROMA_BITS, STD_AC_CHROMA_VALS);

  var out = new ByteWriter();
  out.word(0xFFD8);                                        // SOI
  // JFIF APP0: units=0, density 1:1, no thumbnail. Nothing here varies, so nothing here can drift.
  out.word(0xFFE0); out.word(16); out.bytes([0x4A, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  // DQT (both tables, in zig-zag order as the format requires)
  out.word(0xFFDB); out.word(2 + 2 * 65);
  out.byte(0x00); for (var z1 = 0; z1 < 64; z1++) out.byte(qL[ZIGZAG[z1]]);
  out.byte(0x01); for (var z2 = 0; z2 < 64; z2++) out.byte(qC[ZIGZAG[z2]]);
  // SOF0
  out.word(0xFFC0); out.word(8 + 3 * 3); out.byte(8); out.word(H); out.word(W); out.byte(3);
  out.byte(1); out.byte((hs << 4) | vs); out.byte(0);
  out.byte(2); out.byte(0x11); out.byte(1);
  out.byte(3); out.byte(0x11); out.byte(1);
  // DHT
  function dht(tc, th, bits, vals) {
    out.word(0xFFC4); out.word(3 + 16 + vals.length); out.byte((tc << 4) | th);
    out.bytes(bits); out.bytes(vals);
  }
  dht(0, 0, STD_DC_LUMA_BITS, STD_DC_LUMA_VALS);
  dht(1, 0, STD_AC_LUMA_BITS, STD_AC_LUMA_VALS);
  dht(0, 1, STD_DC_CHROMA_BITS, STD_DC_CHROMA_VALS);
  dht(1, 1, STD_AC_CHROMA_BITS, STD_AC_CHROMA_VALS);
  // SOS
  out.word(0xFFDA); out.word(6 + 2 * 3); out.byte(3);
  out.byte(1); out.byte(0x00);
  out.byte(2); out.byte(0x11);
  out.byte(3); out.byte(0x11);
  out.byte(0); out.byte(63); out.byte(0);

  // ---- entropy coder ----
  var bitAcc = 0, bitCnt = 0;
  function putBits(code, length) {
    for (var l = length - 1; l >= 0; l--) {
      bitAcc = (bitAcc << 1) | ((code >> l) & 1);
      bitCnt++;
      if (bitCnt === 8) {
        out.byte(bitAcc);
        if ((bitAcc & 0xFF) === 0xFF) out.byte(0x00);       // byte stuffing
        bitAcc = 0; bitCnt = 0;
      }
    }
  }
  function flushBits() {
    while (bitCnt > 0) { bitAcc = (bitAcc << 1) | 1; bitCnt++; if (bitCnt === 8) { out.byte(bitAcc); if ((bitAcc & 0xFF) === 0xFF) out.byte(0x00); bitAcc = 0; bitCnt = 0; } }
  }
  function magBits(v) { var a = v < 0 ? -v : v, n = 0; while (a) { n++; a >>= 1; } return n; }

  var fblk = new Float64Array(64), ftmp = new Float64Array(64), qblk = new Int32Array(64);

  // Extract one 8x8 block with edge replication (the standard way to pad a partial MCU).
  function grab(plane, pw, ph, bx, by) {
    for (var yy = 0; yy < 8; yy++) {
      var sy = by + yy; if (sy >= ph) sy = ph - 1;
      var ro = sy * pw;
      for (var xx = 0; xx < 8; xx++) {
        var sx = bx + xx; if (sx >= pw) sx = pw - 1;
        fblk[yy * 8 + xx] = plane[ro + sx];
      }
    }
  }
  function fdctQuant(qtbl) {
    var u, x, y, sv;
    for (u = 0; u < 8; u++) {
      for (x = 0; x < 8; x++) {
        sv = 0;
        for (y = 0; y < 8; y++) sv += COS[u * 8 + y] * fblk[y * 8 + x];
        ftmp[u * 8 + x] = sv;
      }
    }
    for (u = 0; u < 8; u++) {
      var base = u * 8;
      for (x = 0; x < 8; x++) {
        sv = 0;
        for (y = 0; y < 8; y++) sv += COS[x * 8 + y] * ftmp[base + y];
        // Round-half-away-from-zero, so the quantiser is symmetric about zero and fully specified.
        var t = sv / qtbl[base + x];
        qblk[base + x] = t < 0 ? -Math.round(-t) : Math.round(t);
      }
    }
  }
  var preds = [0, 0, 0];
  function emitBlock(comp, qtbl, eDC, eAC) {
    fdctQuant(qtbl);
    var dc = qblk[0], diff = dc - preds[comp];
    preds[comp] = dc;
    var nb = magBits(diff);
    putBits(eDC.codes[nb], eDC.lens[nb]);
    if (nb) putBits(diff < 0 ? diff + (1 << nb) - 1 : diff, nb);
    var run = 0;
    for (var k = 1; k < 64; k++) {
      var v = qblk[ZIGZAG[k]];
      if (v === 0) { run++; continue; }
      while (run > 15) { putBits(eAC.codes[0xF0], eAC.lens[0xF0]); run -= 16; }
      var s = magBits(v), rs = (run << 4) | s;
      putBits(eAC.codes[rs], eAC.lens[rs]);
      putBits(v < 0 ? v + (1 << s) - 1 : v, s);
      run = 0;
    }
    if (run > 0) putBits(eAC.codes[0x00], eAC.lens[0x00]);
  }

  for (var my = 0; my < mcusY; my++) {
    for (var mx = 0; mx < mcusX; mx++) {
      for (var by = 0; by < vs; by++) {
        for (var bx = 0; bx < hs; bx++) {
          grab(Yp, W, H, (mx * hs + bx) * 8, (my * vs + by) * 8);
          emitBlock(0, qL, eDCl, eACl);
        }
      }
      grab(Bp, cw, ch, mx * 8, my * 8); emitBlock(1, qC, eDCc, eACc);
      grab(Rp, cw, ch, mx * 8, my * 8); emitBlock(2, qC, eDCc, eACc);
    }
  }
  flushBits();
  out.word(0xFFD9);                                        // EOI
  return out.finish();
}

module.exports = {
  ZIGZAG: ZIGZAG,
  buildHuffTable: buildHuffTable,
  decodeJpegStreaming: decodeJpegStreaming,
  encodeJpeg: encodeJpeg,
  scaleQuantTable: scaleQuantTable,
  QT_LUMA_50: QT_LUMA_50,
  QT_CHROMA_50: QT_CHROMA_50
};
