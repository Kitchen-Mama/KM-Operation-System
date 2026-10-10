// SHARED SOURCE READER — S8-R49-M2.
//
// NOT a test. One place where a suite turns a file on disk into text it asserts on.
//
// WHY THIS EXISTS. A suite that reads the WORKING COPY and matches a byte-level anchor written with a
// literal \n is not measuring the repository; it is measuring the checkout that happens to be running it.
// This repository is developed on Windows with core.autocrlf=true and carries .gitattributes rules for only
// a handful of pinned binaries, so an ordinary tracked source file is CRLF on disk and LF in the blob —
// and because autocrlf compares the NORMALIZED form, `git status` calls both states clean.
//
// S8-R49-M0 measured what that costs. Two checkouts of the SAME commit, both clean, differed in 840 files;
// every one was CRLF-vs-LF only, with zero encoding, whitespace or content differences, and every tracked
// file in both LF-normalized to its own blob. The content was never in doubt. What differed was the TEST
// RESULT: one checkout reported 631/631 and the other 628/631, because mutation anchors written with \n
// could not be found in a CRLF working copy. The harness behaved correctly — it refused to score a mutant
// that never applied — so the defect was the reader, not the gate.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not rewrite a tracked file, change .gitattributes, or convert
// the tree. Those were all considered in M0 and rejected: a repository-wide conversion would restate the
// line endings of ~6,800 files to fix an assumption in a handful of readers, and the repository has already
// refused that trade once in .gitattributes ("a much larger change than the defect justifies").
//
// `readSource` is for SEMANTIC assertions — anchors, symbol declarations, structure. `readRaw` is kept for
// the rare check whose subject IS the bytes, so that a suite asking a byte question still gets byte bytes;
// a caller must choose, because normalizing silently in both directions is how this class of bug started.
'use strict';

var fs = require('fs');
var path = require('path');

/** CRLF -> LF. Exactly git's text conversion, and nothing else: a lone CR is left alone, because a file
 *  that legitimately contains one is carrying data rather than line endings. */
function toLf(s) { return String(s).split('\r\n').join('\n'); }

/** Text for SEMANTIC assertions: LF-normalized, so an anchor means the same thing in every checkout. */
function readSource(root, rel) { return toLf(fs.readFileSync(path.join(root, rel), 'utf8')); }

/** The bytes exactly as they sit on this disk — for checks whose subject IS the encoding. */
function readRaw(root, rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

module.exports = { toLf: toLf, readSource: readSource, readRaw: readRaw };
