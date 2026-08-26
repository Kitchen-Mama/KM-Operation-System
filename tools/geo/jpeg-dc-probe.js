/**
 * tools/geo/jpeg-dc-probe.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-2 §J — a minimal, dependency-free BASELINE JPEG **DC-ONLY** decoder.
 *
 * WHY THIS EXISTS. §J requires the new Earth surface to be verified, not asserted: land must not be a uniform
 * blurred green, real macro geography must be present in the correct broad regions, the ocean must not be a flat
 * single colour, and the dateline must not show a seam. Those are claims about PIXELS. This environment has no
 * WebGL, no browser and no image library (no ImageMagick, no sharp, no PIL), so there was no way to look at the
 * vendored albedo at all — which would have left the acceptance criteria as opinion.
 *
 * A full JPEG decoder is not needed to answer those questions. Every 8x8 block's DC coefficient IS the block's
 * mean value, so decoding DC coefficients alone yields an exact 1/8-scale image of the asset:
 *
 *     earth-albedo-2048.jpg (2048x1024)  ->  256x128
 *     earth-albedo-5400.jpg (5400x2700)  ->  675x338
 *
 * That is more than enough resolution to test continental-scale colour claims, and at 1/8 scale it is also the
 * RIGHT resolution for them: it measures macro geography rather than JPEG ringing. AC coefficients are still
 * Huffman-decoded (the bitstream cannot be advanced otherwise) but are discarded without an IDCT.
 *
 * SCOPE, stated so it is not mistaken for more than it is: baseline sequential DCT (SOF0) only, 8-bit, 1-3
 * components, with restart-interval support. Progressive (SOF2) and arithmetic coding are NOT supported and are
 * reported as such rather than guessed at — both vendored assets are baseline, which is checked.
 *
 * This is a verification tool. It is never loaded by the page and is not part of any runtime path.
 */
'use strict';

var ZIGZAG_DC_ = 0;   // the DC coefficient is always zig-zag index 0

function buildHuffman(bits, vals) {
  // Maps (length, code) -> value via a flat lookup built in canonical order, exactly as the JPEG spec generates it.
  var codes = [], code = 0, k = 0;
  for (var l = 1; l <= 16; l++) {
    for (var i = 0; i < bits[l - 1]; i++) { codes.push({ len: l, code: code, val: vals[k++] }); code++; }
    code <<= 1;
  }
  var lut = {};
  codes.forEach(function (c) { lut[c.len + ':' + c.code] = c.val; });
  return lut;
}

function BitReader(buf, pos) {
  this.buf = buf; this.pos = pos; this.bit = 0; this.cur = 0; this.eof = false; this.marker = 0;
}
BitReader.prototype.readBit = function () {
  if (this.bit === 0) {
    if (this.pos >= this.buf.length) { this.eof = true; return 0; }
    var b = this.buf[this.pos];
    if (b === 0xFF) {
      var nxt = this.buf[this.pos + 1];
      // A marker is NOT entropy data and must NOT be consumed here: the restart handler needs to find it still
      // sitting at the current position. Feeding the 0xFF in as eight data bits (the first version of this) puts
      // the Huffman decoder permanently out of phase, which reads as plausible-but-wrong colour everywhere.
      if (nxt === 0x00) { this.pos += 2; this.cur = 0xFF; }
      else { this.marker = nxt; this.eof = true; return 0; }
    } else { this.pos++; this.cur = b; }
    this.bit = 8;
  }
  this.bit--;
  return (this.cur >> this.bit) & 1;
};
BitReader.prototype.receive = function (n) { var v = 0; for (var i = 0; i < n; i++) v = (v << 1) | this.readBit(); return v; };
BitReader.prototype.align = function () { this.bit = 0; };
BitReader.prototype.decode = function (lut) {
  var code = 0;
  for (var len = 1; len <= 16; len++) {
    code = (code << 1) | this.readBit();
    var v = lut[len + ':' + code];
    if (v !== undefined) return v;
    if (this.eof) return 0;
  }
  return 0;
};
// JPEG's signed-magnitude extension of a received value.
function extend(v, n) { return n === 0 ? 0 : (v < (1 << (n - 1)) ? v - (1 << n) + 1 : v); }

function decodeDc(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { error: 'NOT_A_JPEG' };
  var i = 2, qt = {}, hdc = {}, hac = {}, frame = null, restartInterval = 0;

  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var m = buf[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m === 0xD9) break;
    var len = buf.readUInt16BE(i + 2), seg = i + 4, end = i + 2 + len;

    if (m === 0xDB) {                                   // DQT
      while (seg < end) {
        var pq = buf[seg] >> 4, tq = buf[seg] & 15; seg++;
        var tbl = new Int32Array(64);
        for (var z = 0; z < 64; z++) { tbl[z] = pq ? buf.readUInt16BE(seg + z * 2) : buf[seg + z]; }
        seg += pq ? 128 : 64;
        qt[tq] = tbl;
      }
    } else if (m === 0xC4) {                            // DHT
      while (seg < end) {
        var tc = buf[seg] >> 4, th = buf[seg] & 15; seg++;
        var bits = [], total = 0;
        for (var b = 0; b < 16; b++) { bits.push(buf[seg + b]); total += buf[seg + b]; }
        seg += 16;
        var vals = [];
        for (var vI = 0; vI < total; vI++) vals.push(buf[seg + vI]);
        seg += total;
        (tc === 0 ? hdc : hac)[th] = buildHuffman(bits, vals);
      }
    } else if (m === 0xDD) {                            // DRI
      restartInterval = buf.readUInt16BE(seg);
    } else if (m === 0xC2) {
      return { error: 'PROGRESSIVE_JPEG_NOT_SUPPORTED' };
    } else if (m === 0xC0 || m === 0xC1) {              // SOF0/SOF1 — baseline / extended sequential
      var precision = buf[seg];
      if (precision !== 8) return { error: 'PRECISION_' + precision + '_NOT_SUPPORTED' };
      var h = buf.readUInt16BE(seg + 1), w = buf.readUInt16BE(seg + 3), nc = buf[seg + 5];
      var comps = [];
      for (var c = 0; c < nc; c++) {
        var o = seg + 6 + c * 3;
        comps.push({ id: buf[o], hs: buf[o + 1] >> 4, vs: buf[o + 1] & 15, tq: buf[o + 2] });
      }
      frame = { width: w, height: h, comps: comps };
    } else if (m === 0xDA) {                            // SOS — decode the single baseline scan
      if (!frame) return { error: 'SOS_BEFORE_SOF' };
      var ns = buf[seg];
      for (var sI = 0; sI < ns; sI++) {
        var cid = buf[seg + 1 + sI * 2], tt = buf[seg + 2 + sI * 2];
        for (var ci = 0; ci < frame.comps.length; ci++) {
          if (frame.comps[ci].id === cid) { frame.comps[ci].dcT = tt >> 4; frame.comps[ci].acT = tt & 15; }
        }
      }
      return scan(buf, end, frame, qt, hdc, hac, restartInterval);
    }
    i = end;
  }
  return { error: 'NO_SCAN_FOUND' };
}

function scan(buf, pos, frame, qt, hdc, hac, restartInterval) {
  var comps = frame.comps;
  var hmax = 1, vmax = 1;
  comps.forEach(function (c) { hmax = Math.max(hmax, c.hs); vmax = Math.max(vmax, c.vs); });
  var mcusX = Math.ceil(frame.width / (8 * hmax)), mcusY = Math.ceil(frame.height / (8 * vmax));

  comps.forEach(function (c) {
    c.bw = mcusX * c.hs; c.bh = mcusY * c.vs;
    c.plane = new Float32Array(c.bw * c.bh);
    c.pred = 0;
  });

  var br = new BitReader(buf, pos);
  var mcu = 0, total = mcusX * mcusY;
  while (mcu < total) {
    if (restartInterval && mcu > 0 && mcu % restartInterval === 0) {
      // Resynchronise on the RSTn marker: byte-align, step over the marker, reset the DC predictors. Resetting
      // the predictors IS the point of a restart interval - carrying them across would corrupt every block after
      // the first restart. The marker is byte-aligned at the current position, so it is accepted there rather
      // than searched for: a blind forward scan can swallow real entropy data whose bytes happen to look like
      // a marker prefix.
      br.align();
      var p = br.pos;
      while (p < buf.length - 1 && buf[p] === 0xFF && buf[p + 1] === 0xFF) p++;   // marker fill bytes
      if (p < buf.length - 1 && buf[p] === 0xFF && buf[p + 1] >= 0xD0 && buf[p + 1] <= 0xD7) {
        br.pos = p + 2; br.eof = false; br.marker = 0;
      }
      comps.forEach(function (c) { c.pred = 0; });
    }
    var my = Math.floor(mcu / mcusX), mx = mcu % mcusX;
    for (var ci = 0; ci < comps.length; ci++) {
      var c = comps[ci], q = qt[c.tq] || new Int32Array(64).fill(1);
      for (var v = 0; v < c.vs; v++) {
        for (var hI = 0; hI < c.hs; hI++) {
          var t = br.decode(hdc[c.dcT] || {});
          var diff = t ? extend(br.receive(t), t) : 0;
          c.pred += diff;
          // A DC-only block reconstructs to a CONSTANT: dequantized DC / 8, plus the 128 level shift.
          var val = c.pred * q[ZIGZAG_DC_] / 8 + 128;
          var bx = mx * c.hs + hI, by = my * c.vs + v;
          if (bx < c.bw && by < c.bh) c.plane[by * c.bw + bx] = val;
          // Advance past the 63 AC coefficients without reconstructing them. The run/size pair advances the
          // coefficient index by r (the zero run) and then 1 for the coefficient itself - r + 1 in total. An
          // earlier version added r + 2, which desynchronised the bitstream a little more with every block.
          var k = 1;
          while (k <= 63) {
            var rs = br.decode(hac[c.acT] || {});
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
              if (r === 15) { k += 16; continue; }    // ZRL: sixteen zeroes, no coefficient
              break;                                 // EOB
            }
            k += r;
            if (k > 63) break;
            br.receive(s);
            k++;
          }
          if (br.eof && br.marker && !(br.marker >= 0xD0 && br.marker <= 0xD7)) { mcu = total; }
        }
      }
    }
    mcu++;
  }

  // Compose to RGB at the LUMA block grid (the finest of the planes).
  var y = comps[0];
  var ow = y.bw, oh = y.bh;
  var rgb = new Uint8Array(ow * oh * 3);
  var cb = comps[1] || null, cr = comps[2] || null;
  for (var yy = 0; yy < oh; yy++) {
    for (var xx = 0; xx < ow; xx++) {
      var Y = y.plane[yy * ow + xx], Cb = 128, Cr = 128;
      if (cb) { var bx2 = Math.min(cb.bw - 1, Math.floor(xx * cb.hs / y.hs)), by2 = Math.min(cb.bh - 1, Math.floor(yy * cb.vs / y.vs)); Cb = cb.plane[by2 * cb.bw + bx2]; }
      if (cr) { var cx2 = Math.min(cr.bw - 1, Math.floor(xx * cr.hs / y.hs)), cy2 = Math.min(cr.bh - 1, Math.floor(yy * cr.vs / y.vs)); Cr = cr.plane[cy2 * cr.bw + cx2]; }
      var R = Y + 1.402 * (Cr - 128), G = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128), B = Y + 1.772 * (Cb - 128);
      var o = (yy * ow + xx) * 3;
      rgb[o] = R < 0 ? 0 : R > 255 ? 255 : R;
      rgb[o + 1] = G < 0 ? 0 : G > 255 ? 255 : G;
      rgb[o + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
    }
  }
  return { width: frame.width, height: frame.height, w: ow, h: oh, rgb: rgb, scale: 8 * (hmax / y.hs) };
}

// ---- geographic sampling helpers: the image is equirectangular, so lat/lng maps linearly to pixels ----
function sampler(img) {
  return {
    w: img.w, h: img.h,
    // Mean colour of the box (latN..latS, lngW..lngE). Boxes are what continental claims are actually about;
    // a single pixel would be an anecdote.
    box: function (latN, latS, lngW, lngE) {
      var x0 = Math.max(0, Math.floor((lngW + 180) / 360 * img.w));
      var x1 = Math.min(img.w - 1, Math.ceil((lngE + 180) / 360 * img.w));
      var y0 = Math.max(0, Math.floor((90 - latN) / 180 * img.h));
      var y1 = Math.min(img.h - 1, Math.ceil((90 - latS) / 180 * img.h));
      var r = 0, g = 0, b = 0, n = 0;
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var o = (y * img.w + x) * 3;
          r += img.rgb[o]; g += img.rgb[o + 1]; b += img.rgb[o + 2]; n++;
        }
      }
      if (!n) return null;
      return { r: r / n, g: g / n, b: b / n, n: n };
    },
    px: function (x, y) { var o = (y * img.w + x) * 3; return { r: img.rgb[o], g: img.rgb[o + 1], b: img.rgb[o + 2] }; }
  };
}

module.exports = { decodeDc: decodeDc, sampler: sampler };
