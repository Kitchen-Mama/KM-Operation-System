'use strict';
// FX1-R4 — the GS load surface against the Owner-approved ceiling, re-runnable forever.
//
// The round that BUILT this feature measured it by applying a staged integration and restoring the
// tree. That tool cannot be re-run once the integration IS the tree - its anchors no longer match -
// and leaving it in that state would be the same fault this round recorded about FX1-R2: a number
// nobody can check again. This one reads the deployed set and compares it to the ceiling, which is a
// question that keeps its meaning.
//
// It is READ-ONLY. It writes nothing, and it exits non-zero when the surface is over the ceiling.
//
// Run:  node docs/planning/fx1-r1-staging/measure-fx1-r4-surface.js
const fs = require('fs');
const path = require('path');
const GSDIR = path.resolve(__dirname, '../../../assets/specs/active/apps-script');
// The Owner-approved ceiling for FX1-R4, and the same number apps-script-load-surface-slim-r1 gates on.
const CEILING = 4668000;
// LF BYTES, which is how git stores them and how gs-load-surface-audit.js counts them. Counting the
// worktree CRLF would report a surface this deployment does not have.
const lf = (s) => Buffer.byteLength(s.replace(/\r\n/g, '\n'), 'utf8');
let bytes = 0, files = 0;
const rows = [];
fs.readdirSync(GSDIR).filter(f => /\.gs$/.test(f)).sort().forEach(f => {
  const n = lf(fs.readFileSync(path.join(GSDIR, f), 'utf8'));
  bytes += n; files++; rows.push([f, n]);
});
rows.sort((a, b) => b[1] - a[1]);
console.log('');
console.log('FX1-R4 — APPS SCRIPT LOAD SURFACE (repository directory)');
console.log('');
rows.slice(0, 6).forEach(r => console.log('  ' + r[0].padEnd(46) + String(r[1]).padStart(9)));
console.log('  ... ' + (rows.length - 6) + ' more');
console.log('');
console.log('  files   ' + files);
console.log('  bytes   ' + bytes);
console.log('  ceiling ' + CEILING + '   (Owner-approved, FX1-R4)');
console.log('  ' + (bytes <= CEILING ? 'VERDICT  UNDER by ' + (CEILING - bytes) + ' bytes'
                                     : 'VERDICT  OVER by ' + (bytes - CEILING) + ' bytes — STOP AND REPORT'));
console.log('');
process.exitCode = bytes <= CEILING ? 0 : 1;
