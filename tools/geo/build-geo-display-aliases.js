#!/usr/bin/env node
/**
 * tools/geo/build-geo-display-aliases.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §F — the zh-TW DISPLAY-NAME authority, above the vendored formal names.
 *
 * WHAT §F ASKS FOR, AND WHAT MEASUREMENT SHOWED. §F keeps the verified Natural Earth `NAME_ZHT` as the FULL-name
 * authority but requires map LABELS to prefer, in order: verified CLDR zh-Hant `alt-short`, then a reviewed local
 * zh-TW display alias, then `NAME_ZHT`, then English, then ISO alpha-2. It also says not to use an 8-11 character
 * formal state name when a reviewed Taiwan-standard common map name exists.
 *
 * Measured against the 175 vendored countries, CLDR zh-Hant 46.0.0 and `NAME_ZHT` agree on 155 and differ on 20 -
 * and the twenty are not one problem but four:
 *
 *   A  MAINLAND TERMINOLOGY IN A TRADITIONAL-SCRIPT FIELD. `NAME_ZHT` is Traditional SCRIPT, which is not the
 *      same thing as Taiwan TERMINOLOGY: it carries 新西蘭, 盧旺達, 克羅地亞, 圭亞那, 布基納法索, 澳大利亞,
 *      印度尼西亞 and 厄瓜多爾, where the Taiwan-standard forms are 紐西蘭, 盧安達, 克羅埃西亞, 蓋亞那,
 *      布吉納法索, 澳洲, 印尼 and 厄瓜多. These are CORRECTNESS defects, not length ones, and R2's localisation
 *      round could not have seen them because it only verified that the strings were Traditional.
 *   B  FORMAL NAME WHERE A COMMON MAP NAME EXISTS - exactly §F's rule. 朝鮮民主主義人民共和國 (11 characters),
 *      法屬南部和南極領地 (9), 捷克共和國, 馬利共和國, 蒙古國, 大韓民國.
 *   C  CLDR IS LONGER, so applying it would be worse: 剛果（金夏沙）, 剛果（布拉薩）, 多明尼加共和國. Recorded
 *      as deliberately NOT applied, with the measurement, rather than silently skipped.
 *   D  GEOPOLITICALLY WEIGHTED. §F: "Do not silently decide disputed or geopolitical naming. Report any
 *      unresolved case for user review." TW (中華民國 vs 台灣) and CN (中華人民共和國 vs 中國) are decisions
 *      about how a Taiwan-facing product names Taiwan and China. This tool REFUSES them and reports both
 *      candidates for the user to choose.
 *
 * WHERE THE LINE BETWEEN "APPLY" AND "REFUSE" IS. Level 1 is an authority §F NAMES - CLDR `alt-short` - so
 * applying it is following the specification, not exercising judgement, and it is applied and reported. Level 2
 * is MY review, so on a name with geopolitical weight it is refused and reported instead. That distinction is the
 * whole reason the two levels are separate.
 *
 * DETERMINISTIC. The CLDR input is verified by SHA-256 before use, the classification is a fixed function of the
 * two name sets and the sensitive-ISO list below, and the output is sorted. Two runs produce identical bytes.
 *
 *   node tools/geo/build-geo-display-aliases.js            # verify pin, build, print the §F report
 *   node tools/geo/build-geo-display-aliases.js --report    # print the report only, write nothing
 *
 * NAMES ONLY. The emitted asset contains no coordinate, no ring and no label anchor - §F says "a deterministic
 * reviewed alias asset containing names only", and that is enforced by the regression suite.
 *
 * This is a BUILD tool. It is never loaded by the page.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var https = require('https');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var OUT = path.join(ROOT, 'assets', 'js', 'data', 'geo-display-aliases-zh-tw.js');
var CACHE_DIR = path.join(os.tmpdir(), 'km-cldr-src');

var CLDR = {
  version: '46.0.0',
  locale: 'zh-Hant',
  file: 'territories.json',
  url: 'https://raw.githubusercontent.com/unicode-org/cldr-json/46.0.0/cldr-json/cldr-localenames-full/main/zh-Hant/territories.json',
  bytes: 10135,
  sha256: 'e32bceb655bc2ddc9946f457d0b205e7018b59e4df2a73a939e3db13072024a7',
  license: 'Unicode License v3 (Unicode-3.0)',
  license_url: 'https://www.unicode.org/license.txt',
  credit: 'Territory names from Unicode CLDR (zh-Hant), Unicode Consortium'
};

// ---------------------------------------------------------------------------------------------------------
// GEOPOLITICALLY WEIGHTED NAMES — refused, not decided.
// ---------------------------------------------------------------------------------------------------------
// This list is deliberately SHORT and deliberately EXPLICIT. It is not "anything that might be sensitive": it is
// the cases where choosing between the vendored formal name and the CLDR common name is a statement about
// sovereignty in the product's own locale, and where a build tool has no business picking. Everything else is a
// transliteration or a formal/common distinction, which is a cartographic choice with a verifiable authority.
var SENSITIVE_ISO = {
  TW: 'How a Taiwan-facing product names Taiwan. NAME_ZHT gives the formal state name; CLDR zh-Hant gives the ' +
      'common name. Both are in ordinary use in Taiwan and the choice is editorial, not cartographic.',
  CN: 'The counterpart decision for China. Shortening the formal state name to the common one carries the same ' +
      'editorial weight in a zh-TW product and must be made by the same person who decides TW.'
};

// A reviewed alias is only worth applying if the displayed name is genuinely SHORTER (or equal) in rendered
// characters. §F's concern is a long formal name crowding the map; a "common" name that is longer than the
// formal one does not serve that at all.
function charLen(s) { return Array.from(String(s || '')).length; }

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function download(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error('TOO_MANY_REDIRECTS'));
    https.get(url, { headers: { 'user-agent': 'km-build-display-aliases' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return download(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP_' + res.statusCode)); }
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () { resolve(Buffer.concat(c)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function acquireCldr() {
  var cached = path.join(CACHE_DIR, CLDR.locale + '-' + CLDR.version + '-' + CLDR.file);
  if (fs.existsSync(cached)) {
    var b = fs.readFileSync(cached);
    if (b.length === CLDR.bytes && sha256(b) === CLDR.sha256) return Promise.resolve({ buf: b, from: cached });
    console.log('  cached CLDR failed its digest — re-downloading');
  }
  return download(CLDR.url, 0).then(function (buf) {
    if (buf.length !== CLDR.bytes) throw new Error('CLDR_BYTES ' + buf.length + ' != ' + CLDR.bytes);
    var d = sha256(buf);
    if (d !== CLDR.sha256) throw new Error('CLDR_SHA256 ' + d + ' != ' + CLDR.sha256);
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cached, buf); } catch (e) {}
    return { buf: buf, from: CLDR.url };
  });
}

function loadVendored() {
  global.window = global.window || {};
  require(path.join(ROOT, 'assets/js/data/world-countries-110m.js'));
  require(path.join(ROOT, 'assets/js/data/geo-names-zh-hant.js'));
  return { countries: global.window.KM_WORLD_COUNTRIES, names: global.window.KM_GEO_NAMES_ZH_HANT };
}

function main() {
  var reportOnly = process.argv.indexOf('--report') !== -1;
  return acquireCldr().then(function (src) {
    var terr = JSON.parse(src.buf.toString('utf8')).main[CLDR.locale].localeDisplayNames.territories;
    var v = loadVendored();
    var isoList = v.countries.countries.map(function (c) { return String(c.iso).toUpperCase(); }).sort();

    var altShort = {}, reviewed = {}, unresolved = [], keptExisting = [], agreed = 0, noCldr = [];

    isoList.forEach(function (iso) {
      var full = String((v.names.countries || {})[iso] || '');       // NAME_ZHT — the FULL-name authority
      var en = String((v.names.countryEnglish || {})[iso] || '');
      var std = String(terr[iso] || '');
      var alt = String(terr[iso + '-alt-short'] || '');
      if (!std) { noCldr.push(iso); return; }

      // LEVEL 1 — CLDR alt-short. An authority §F names, so it is applied rather than judged. Only when it
      // actually shortens the label; GB and US have an alt-short identical to their standard name.
      if (alt && charLen(alt) < charLen(full)) {
        altShort[iso] = {
          display: alt, full: full, english: en,
          source: 'UNICODE_CLDR_' + CLDR.version + '_' + CLDR.locale + '_ALT_SHORT',
          rationale: 'CLDR publishes an explicit alt-short form (' + alt + ') for this territory; §F ranks it ' +
            'first. Shortens the label from ' + charLen(full) + ' to ' + charLen(alt) + ' characters.',
          review_recommended: !!SENSITIVE_ISO[iso] || iso === 'PS',
          review_note: iso === 'PS'
            ? 'Applied because CLDR alt-short is the authority §F ranks first, but the naming of Palestine is ' +
              'politically contested. Flagged so the choice is visible rather than buried.'
            : null
        };
        return;
      }

      if (std === full) { agreed++; return; }

      // §F/§D — geopolitically weighted: REFUSE and report both candidates.
      if (SENSITIVE_ISO[iso]) {
        unresolved.push({
          iso: iso, english: en,
          current_displayed: full, current_source: 'NATURAL_EARTH_NAME_ZHT',
          candidate: std, candidate_source: 'UNICODE_CLDR_' + CLDR.version + '_' + CLDR.locale,
          current_chars: charLen(full), candidate_chars: charLen(std),
          why_unresolved: SENSITIVE_ISO[iso],
          decision_required_from: 'USER'
        });
        return;
      }

      // LEVEL 2 — reviewed alias. THE FIRST VERSION OF THIS RULE WAS "apply only if not longer", AND THE REPORT
      // IT PRINTED SHOWED WHY THAT IS WRONG:
      //
      //   · It REJECTED Croatia. NAME_ZHT has 克羅地亞, the mainland form; the Taiwan standard is 克羅埃西亞,
      //     which is one character LONGER. A length rule that overrides a correctness fix has the priorities
      //     backwards - §F asks for the Taiwan-standard name, not the shortest one.
      //   · It ACCEPTED 剛果（金夏沙） for DR Congo as a "terminology fix". It is neither: it is CLDR's
      //     PARENTHETICAL DISAMBIGUATION between the two Congos, which is a device for a sorted list and not a
      //     name to paint on a map.
      //
      // So the classification is now by WHAT KIND of difference it is, and the length test applies only where
      // length is what is at stake.
      var parenthetical = /[（(]/.test(std);
      // A formal state name is one that carries the state-form words. If the vendored name has them and CLDR
      // does not, the difference is formal-vs-common and §F's length rule is the right test.
      var FORMAL_WORDS = /共和國|民主主義|人民|聯合|合眾國|王國|聯邦|國$/;
      var formalToCommon = FORMAL_WORDS.test(full) && !FORMAL_WORDS.test(std);
      // ...and the REVERSE direction, which the first version of this test missed entirely: for the Dominican
      // Republic the vendored name is the common one (多明尼加) and CLDR is the formal one (多明尼加共和國), so
      // `formalToCommon` was false, the difference fell through to TERMINOLOGY, and TERMINOLOGY applies
      // regardless of length - which would have made the label LONGER and MORE formal, the exact opposite of §F.
      var commonToFormal = FORMAL_WORDS.test(std) && !FORMAL_WORDS.test(full);

      if (parenthetical) {
        // Never a map label. Recorded as rejected WITH the reason, not silently skipped.
        keptExisting.push({
          iso: iso, english: en, kept: full, kept_chars: charLen(full),
          cldr_rejected: std, cldr_chars: charLen(std),
          reason: 'CLDR uses a PARENTHETICAL DISAMBIGUATION here (' + std + '), which distinguishes entries in a ' +
            'sorted list rather than naming the place on a map. The vendored name is kept.'
        });
        return;
      }
      if (commonToFormal || (formalToCommon && charLen(std) >= charLen(full))) {
        keptExisting.push({
          iso: iso, english: en, kept: full, kept_chars: charLen(full),
          cldr_rejected: std, cldr_chars: charLen(std),
          reason: 'CLDR gives the MORE formal name here (' + std + ', ' + charLen(std) + ' characters, against ' +
            charLen(full) + '), which is the opposite of what §F asks a map label to be.'
        });
        return;
      }
      // A transliteration variant differs by a character or two. Anything much longer is not a transliteration,
      // so it does not get the correctness exemption from the length test.
      if (!formalToCommon && charLen(std) > charLen(full) + 1) {
        keptExisting.push({
          iso: iso, english: en, kept: full, kept_chars: charLen(full),
          cldr_rejected: std, cldr_chars: charLen(std),
          reason: 'CLDR is more than one character longer (' + charLen(std) + ' vs ' + charLen(full) + ') without ' +
            'removing a state form, so it is not a transliteration variant and does not earn the length exemption.'
        });
        return;
      }
      reviewed[iso] = {
        display: std, full: full, english: en,
        source: 'UNICODE_CLDR_' + CLDR.version + '_' + CLDR.locale,
        rationale: formalToCommon
          ? 'NAME_ZHT carries the formal state name (' + charLen(full) + ' characters); CLDR zh-Hant gives the ' +
            'common map name (' + charLen(std) + '). §F forbids using the formal name where a reviewed ' +
            'Taiwan-standard common name exists.'
          : 'NAME_ZHT is Traditional SCRIPT but not Taiwan TERMINOLOGY here (' + full + '); the Taiwan-standard ' +
            'form is ' + std + '. Applied regardless of length (' + charLen(full) + ' -> ' + charLen(std) +
            ') because this is a CORRECTNESS fix, not a length one.',
        kind: formalToCommon ? 'FORMAL_TO_COMMON' : 'TERMINOLOGY'
      };
    });

    // ---- report (§F: for every alias report ISO, full authoritative name, displayed name, source/rationale) --
    function line(iso, full, display, source) {
      return '  ' + iso.padEnd(4) + (full + '').padEnd(14) + ' -> ' + (display + '').padEnd(10) + '  ' + source;
    }
    console.log('\n§F DISPLAY-NAME AUTHORITY REPORT');
    console.log('CLDR ' + CLDR.version + ' ' + CLDR.locale + '  ' + CLDR.bytes + ' B  sha256 ' + CLDR.sha256.slice(0, 16) + '...');
    console.log('  verified from ' + src.from);
    console.log('\n' + isoList.length + ' countries · ' + agreed + ' already identical · ' +
      Object.keys(altShort).length + ' CLDR alt-short · ' + Object.keys(reviewed).length + ' reviewed alias · ' +
      keptExisting.length + ' kept (CLDR longer) · ' + unresolved.length + ' UNRESOLVED' +
      (noCldr.length ? ' · ' + noCldr.length + ' no CLDR entry (' + noCldr.join(',') + ')' : ''));

    if (Object.keys(altShort).length) {
      console.log('\nLEVEL 1 — verified CLDR zh-Hant alt-short:');
      Object.keys(altShort).sort().forEach(function (iso) {
        var a = altShort[iso];
        console.log(line(iso, a.full, a.display, a.source) + (a.review_recommended ? '   [REVIEW]' : ''));
        console.log('       ' + a.rationale);
        if (a.review_note) console.log('       REVIEW: ' + a.review_note);
      });
    }
    console.log('\nLEVEL 2 — reviewed zh-TW display alias:');
    ['TERMINOLOGY', 'FORMAL_TO_COMMON'].forEach(function (kind) {
      var ks = Object.keys(reviewed).filter(function (i) { return reviewed[i].kind === kind; }).sort();
      if (!ks.length) return;
      console.log('  ' + (kind === 'TERMINOLOGY'
        ? '(a) mainland terminology in a Traditional-script field — CORRECTNESS:'
        : '(b) formal state name where a common map name exists — §F\'s stated rule:'));
      ks.forEach(function (iso) {
        var r = reviewed[iso];
        console.log(line(iso, r.full, r.display, r.english));
      });
    });
    if (keptExisting.length) {
      console.log('\nDELIBERATELY NOT APPLIED — CLDR is longer:');
      keptExisting.forEach(function (k) {
        console.log('  ' + k.iso.padEnd(4) + k.kept + ' (' + k.kept_chars + ') KEPT over ' +
          k.cldr_rejected + ' (' + k.cldr_chars + ')');
      });
    }
    if (unresolved.length) {
      console.log('\nUNRESOLVED — REQUIRES A USER DECISION (§F: do not silently decide geopolitical naming):');
      unresolved.forEach(function (u) {
        console.log('  ' + u.iso + '  currently ' + u.current_displayed + ' (' + u.current_chars + ' chars, ' +
          u.current_source + ')');
        console.log('      candidate ' + u.candidate + ' (' + u.candidate_chars + ' chars, ' + u.candidate_source + ')');
        console.log('      ' + u.why_unresolved);
      });
      console.log('\n  Neither is applied. The map keeps the vendored NAME_ZHT for these until a decision is made,');
      console.log('  which is the status quo rather than a new choice.');
    }

    if (reportOnly) return 0;

    // ---- emit ------------------------------------------------------------------------------------------------
    function sorted(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
    var payload = {
      meta: {
        task: 'MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3',
        purpose: 'zh-TW MAP DISPLAY names only. No geometry, no coordinates, no label anchors. The FULL formal ' +
          'name authority remains assets/js/data/geo-names-zh-hant.js (Natural Earth NAME_ZHT).',
        generator: 'tools/geo/build-geo-display-aliases.js',
        default_language: 'zh-TW',
        authority_order: [
          '1 UNICODE_CLDR_ALT_SHORT (verified, pinned)',
          '2 REVIEWED_DISPLAY_ALIAS (this asset, reviewed against CLDR)',
          '3 ZH_HANT_PINNED_SOURCE (Natural Earth NAME_ZHT)',
          '4 ENGLISH_CANONICAL',
          '5 CODE (ISO alpha-2)'
        ],
        cldr: {
          version: CLDR.version, locale: CLDR.locale, url: CLDR.url,
          bytes: CLDR.bytes, sha256: CLDR.sha256,
          license: CLDR.license, license_url: CLDR.license_url, credit: CLDR.credit
        },
        counts: {
          countries: isoList.length, identical: agreed,
          cldr_alt_short: Object.keys(altShort).length,
          reviewed_alias: Object.keys(reviewed).length,
          kept_existing_cldr_longer: keptExisting.length,
          unresolved: unresolved.length
        },
        runtime_network_dependency: 'none — loaded as a same-origin <script>'
      },
      cldrAltShort: sorted(altShort),
      reviewed: sorted(reviewed),
      keptExisting: keptExisting,
      unresolved: unresolved
    };

    var banner = [
      '/**',
      ' * assets/js/data/geo-display-aliases-zh-tw.js — VENDORED, GENERATED. Do not edit by hand.',
      ' *',
      ' * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §F — zh-TW MAP DISPLAY NAMES ONLY. No geometry, no coordinates, no',
      ' * label anchors. The FULL formal name stays in geo-names-zh-hant.js and remains available for tooltips',
      ' * and detail panels; this asset only decides what is PAINTED on the map.',
      ' *',
      ' * Generator: tools/geo/build-geo-display-aliases.js (deterministic; CLDR input verified by SHA-256).',
      ' * Source: Unicode CLDR ' + CLDR.version + ' ' + CLDR.locale + ' territories — ' + CLDR.license + '.',
      ' * ' + CLDR.credit,
      ' *',
      ' * UNRESOLVED entries are NOT applied. They are carried so the map can report that a naming decision is',
      ' * outstanding rather than making it silently — see meta.counts.unresolved.',
      ' *',
      ' * No runtime CDN/network: loaded as a same-origin <script> that sets window.KM_GEO_DISPLAY_ALIASES.',
      ' */',
      'window.KM_GEO_DISPLAY_ALIASES=' + JSON.stringify(payload) + ';',
      ''
    ].join('\n');

    fs.writeFileSync(OUT, banner, 'utf8');
    console.log('\nwrote ' + OUT);
    console.log('  bytes : ' + Buffer.byteLength(banner, 'utf8'));
    console.log('  sha256: ' + sha256(Buffer.from(banner, 'utf8')));
    return 0;
  });
}

module.exports = { CLDR: CLDR, SENSITIVE_ISO: SENSITIVE_ISO, charLen: charLen };

if (require.main === module) {
  main().then(function (c) { process.exit(c || 0); }, function (e) {
    console.error('FAILED: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}
