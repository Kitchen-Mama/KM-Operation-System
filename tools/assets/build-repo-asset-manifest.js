/*
 * ================================================================================================================
 * BUILD THE REPO ASSET MANIFEST — P1-B8D-R9 §5
 *
 * Writes assets/js/utils/km-repo-asset-manifest.js from what is ACTUALLY ON DISK under the covered roots.
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN LIST. The manifest's entire value is that it is not an opinion. A list
 * somebody typed is a second claim about the repository that can drift from the repository; a list read off the
 * directory IS the repository. `product-strategy-image-asset-manifest-p1-b8d-r9.test.js` re-reads the same
 * directories and fails if the committed manifest and the disk disagree, so the two cannot separate silently.
 *
 * WHAT "COVERED" MEANS, AND WHY IT IS NARROW ON PURPOSE. The manifest may only be used to prove a file ABSENT,
 * and absence is only provable inside a directory that was actually enumerated. So the manifest publishes its
 * roots, and the policy refuses a reference only when the reference falls under one of them. A path outside
 * every root is not judged — it is passed through exactly as it was before this file existed. That is the
 * difference between "I looked and it is not there" and "I did not look".
 *
 * Usage:  node tools/assets/build-repo-asset-manifest.js
 * ================================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '..', '..');
var OUT = path.join(REPO, 'assets', 'js', 'utils', 'km-repo-asset-manifest.js');

/* THE COVERED ROOTS. Every directory the application serves product or page imagery from. Adding a root here
   is a decision to let the policy REFUSE unknown paths under it, so a root is added only when the directory is
   genuinely complete in the repository. */
var ROOTS = ['assets/img'];

function walk(abs, rel, out) {
  var names = fs.readdirSync(abs).sort();
  names.forEach(function (name) {
    var a = path.join(abs, name);
    var r = rel + '/' + name;
    if (fs.statSync(a).isDirectory()) { walk(a, r, out); return; }
    out.push(r);
  });
}

function build() {
  var files = [];
  ROOTS.forEach(function (root) {
    var abs = path.join(REPO, root);
    if (!fs.existsSync(abs)) throw new Error('covered root does not exist: ' + root);
    walk(abs, root, files);
  });
  files.sort();
  return files;
}

function render(files) {
  var q = String.fromCharCode(39);
  var L = [];
  L.push('/*');
  L.push(' * ================================================================================================================');
  L.push(' * KM_REPO_ASSET_MANIFEST — GENERATED. DO NOT EDIT BY HAND.');
  L.push(' *');
  L.push(' * Regenerate with:  node tools/assets/build-repo-asset-manifest.js');
  L.push(' *');
  L.push(' * WHAT THIS IS FOR. `sku_details.image_url` holds repo-relative paths. The shared image policy could');
  L.push(' * already tell a path that NAMES a file from an opaque id, but it could not tell a path naming a file');
  L.push(' * that EXISTS from one that does not — so every stale row in the database became a GET that could only');
  L.push(' * ever return 404, and on the Product Strategy chart it became an empty plate captioned as a photograph.');
  L.push(' *');
  L.push(' * This file is the directory listing, so the question is answerable BEFORE the request is made.');
  L.push(' *');
  L.push(' * IT MAY ONLY PROVE ABSENCE INSIDE `roots`. A reference outside every root is not judged by it.');
  L.push(' * ================================================================================================================');
  L.push(' */');
  L.push('(function (root) {');
  L.push('  ' + q + 'use strict' + q + ';');
  L.push('');
  L.push('  var M = {};');
  L.push('');
  L.push('  M.CONTRACT_ID = ' + q + 'KM_REPO_ASSET_MANIFEST_V1' + q + ';');
  L.push('');
  L.push('  /* The directories enumerated to build this file. Absence is only provable under one of these. */');
  L.push('  M.roots = [' + ROOTS.map(function (r) { return q + r + q; }).join(', ') + '];');
  L.push('');
  L.push('  /* Every file under those roots, repo-relative, sorted, exactly as it is named on disk. */');
  L.push('  M.files = [');
  files.forEach(function (f, i) {
    L.push('    ' + q + f + q + (i === files.length - 1 ? '' : ','));
  });
  L.push('  ];');
  L.push('');
  L.push('  M.count = ' + files.length + ';');
  L.push('');
  L.push('  /* Lookup sets, built on first use. `LOWER` answers "does a file with this name in some other CASE');
  L.push('     exist" — the difference between a row pointing at nothing and a row pointing at the right file with');
  L.push('     the wrong capitalisation. Two different database defects with two different fixes, and on a');
  L.push('     case-sensitive host (GitHub Pages is one) both render as the same blank frame. */');
  L.push('  var EXACT = null;');
  L.push('  var LOWER = null;');
  L.push('  function index() {');
  L.push('    if (EXACT) return;');
  L.push('    EXACT = {};');
  L.push('    LOWER = {};');
  L.push('    for (var i = 0; i < M.files.length; i++) {');
  L.push('      EXACT[M.files[i]] = true;');
  L.push('      LOWER[M.files[i].toLowerCase()] = M.files[i];');
  L.push('    }');
  L.push('  }');
  L.push('');
  L.push('  /** Is this exact repo-relative path a file in the repository? */');
  L.push('  M.has = function (p) { index(); return EXACT[String(p)] === true; };');
  L.push('');
  L.push('  /** The real file whose path differs from `p` only by case, or null. */');
  L.push('  M.caseVariantOf = function (p) {');
  L.push('    index();');
  L.push('    var hit = LOWER[String(p).toLowerCase()];');
  L.push('    return (hit === undefined || hit === String(p)) ? null : hit;');
  L.push('  };');
  L.push('');
  L.push('  /** Does `p` fall under a root this manifest actually enumerated? */');
  L.push('  M.covers = function (p) {');
  L.push('    var v = String(p);');
  L.push('    for (var i = 0; i < M.roots.length; i++) {');
  L.push('      if (v === M.roots[i] || v.indexOf(M.roots[i] + ' + q + '/' + q + ') === 0) return true;');
  L.push('    }');
  L.push('    return false;');
  L.push('  };');
  L.push('');
  L.push('  if (typeof module !== ' + q + 'undefined' + q + ' && module.exports) { module.exports = M; }');
  L.push('  root.KM_REPO_ASSET_MANIFEST = M;');
  L.push('}(typeof globalThis !== ' + q + 'undefined' + q + ' ? globalThis : this));');
  L.push('');
  return L.join('\n');
}

var files = build();
fs.writeFileSync(OUT, render(files), 'utf8');
process.stdout.write('wrote ' + path.relative(REPO, OUT).replace(/\\/g, '/')
  + ' — ' + files.length + ' files under ' + ROOTS.join(', ') + '\n');
