/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R2 — A PNG READER, SO A SCREENSHOT CAN BE EVIDENCE INSTEAD OF AN ILLUSTRATION
 * ==================================================================================================
 *
 * WHY THIS EXISTS. "The Map canvas is not blank" is a claim about PIXELS, and until now every
 * screenshot this repository produced was looked at by a human and described in a sentence. A
 * sentence about a picture is not a measurement, and it cannot be re-checked by a suite later.
 *
 * AND IT CANNOT BE ASKED OF THE PAGE. km-globe.js creates its context WITHOUT
 * `preserveDrawingBuffer`, so after the frame is composited the drawing buffer is gone: toDataURL
 * and drawImage both return a blank image from that canvas. The screenshot Chrome composites is the
 * ONLY place those pixels survive, which is why this decodes the file rather than asking the DOM.
 *
 * NO DEPENDENCY. Node ships zlib, and a PNG is a header, a run of IDAT chunks holding one zlib
 * stream, and five scanline filters. That is the whole format for what Chrome writes, so the decoder
 * is about eighty lines and the repository gains no package.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: interlacing (Chrome does not write it), 16-bit channels, and
 * palettes. Each is REFUSED BY NAME rather than guessed at, because a decoder that silently
 * mis-reads a format produces confident numbers about the wrong pixels.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function decodePng(file) {
  const buf = fs.readFileSync(file);
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('NOT_A_PNG');

  let off = 8, ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8],
        colorType: data[9], compression: data[10], filter: data[11], interlace: data[12] };
    } else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('NO_IHDR');
  if (ihdr.interlace !== 0) throw new Error('INTERLACED_PNG_NOT_SUPPORTED');
  if (ihdr.bitDepth !== 8) throw new Error('BIT_DEPTH_' + ihdr.bitDepth + '_NOT_SUPPORTED');
  const CH = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!CH) throw new Error('COLOR_TYPE_' + ihdr.colorType + '_NOT_SUPPORTED');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: W, height: H } = ihdr;
  const stride = W * CH;
  const out = Buffer.alloc(stride * H);

  // The five PNG scanline filters. Each row is predicted from the row above and the pixel to the
  // left; getting this wrong produces a picture that still "looks like" noise, so it is written
  // straight from the spec rather than from memory.
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    const row = raw.slice(p, p + stride); p += stride;
    const o = y * stride, up = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= CH ? out[o + x - CH] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = (x >= CH && y > 0) ? out[up + x - CH] : 0;
      let v = row[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (ft !== 0) throw new Error('BAD_FILTER_' + ft);
      out[o + x] = v & 255;
    }
  }
  return { width: W, height: H, channels: CH, data: out };
}

/** One pixel as [r,g,b]. Grayscale and alpha-less forms are normalised so callers need one shape. */
function px(img, x, y) {
  const i = y * img.width * img.channels + x * img.channels;
  const d = img.data;
  if (img.channels >= 3) return [d[i], d[i + 1], d[i + 2]];
  return [d[i], d[i], d[i]];
}

/**
 * Describe a rectangle: how much of it is NOT the background, how many distinct colours it holds,
 * and where its non-background mass sits. A blank canvas scores nonBackgroundFraction 0 and
 * distinctColours 1, and no wording can make that look like a rendered globe.
 *
 * `distinctColours` is quantised to 5 bits per channel. A WebGL render of a lit sphere produces
 * thousands of near-identical shades; counting them exactly would report a large number for a subtle
 * gradient over a blank field, which is the thing being guarded against.
 */
function describeRegion(img, rx, ry, rw, rh, opts) {
  opts = opts || {};
  const step = opts.step || 1;
  const x0 = Math.max(0, Math.round(rx)), y0 = Math.max(0, Math.round(ry));
  const x1 = Math.min(img.width, Math.round(rx + rw)), y1 = Math.min(img.height, Math.round(ry + rh));
  if (x1 <= x0 || y1 <= y0) return { error: 'EMPTY_REGION', x0, y0, x1, y1 };

  const hist = Object.create(null);
  let n = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const c = px(img, x, y);
    hist[(c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3)] = (hist[(c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3)] || 0) + 1;
    n++;
  }
  // The background is whatever colour dominates; everything else is drawn content.
  let bgKey = null, bgN = 0;
  for (const k in hist) if (hist[k] > bgN) { bgN = hist[k]; bgKey = k; }
  const distinct = Object.keys(hist).length;

  // Where the drawn mass sits, so "the globe is in the frame" is a number rather than an impression.
  let sx = 0, sy = 0, m = 0, minX = x1, maxX = x0, minY = y1, maxY = y0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const c = px(img, x, y);
    if ((c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3) === bgKey) continue;
    sx += x; sy += y; m++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return {
    region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    sampled: n,
    distinctColours: distinct,
    backgroundColour: bgKey,
    nonBackgroundFraction: +(m / n).toFixed(4),
    contentBox: m ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null,
    centroid: m ? { x: Math.round(sx / m), y: Math.round(sy / m) } : null,
    // How far the drawn mass's centre is from the region's centre, as a fraction of the region.
    centroidOffset: m ? +(Math.hypot((sx / m) - (x0 + x1) / 2, (sy / m) - (y0 + y1) / 2)
      / Math.hypot((x1 - x0) / 2, (y1 - y0) / 2)).toFixed(3) : null
  };
}

/** Fraction of sampled pixels that differ by more than `tol` in any channel. */
function diffRegion(a, b, rx, ry, rw, rh, opts) {
  opts = opts || {};
  const step = opts.step || 1, tol = opts.tol === undefined ? 8 : opts.tol;
  if (a.width !== b.width || a.height !== b.height) return { error: 'SIZE_MISMATCH', a: [a.width, a.height], b: [b.width, b.height] };
  const x0 = Math.max(0, Math.round(rx)), y0 = Math.max(0, Math.round(ry));
  const x1 = Math.min(a.width, Math.round(rx + rw)), y1 = Math.min(a.height, Math.round(ry + rh));
  let n = 0, d = 0, maxd = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const p = px(a, x, y), q = px(b, x, y);
    const delta = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
    if (delta > maxd) maxd = delta;
    if (delta > tol) d++;
    n++;
  }
  return { sampled: n, changedFraction: +(d / n).toFixed(4), maxChannelDelta: maxd, tolerance: tol };
}

module.exports = { decodePng, px, describeRegion, diffRegion };
