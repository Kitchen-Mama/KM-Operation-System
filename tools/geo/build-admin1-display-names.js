#!/usr/bin/env node
/**
 * tools/geo/build-admin1-display-names.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4 §B — the DIVISION-level zh-TW display names, and the audit behind them.
 *
 * WHAT §B ASKED FOR FIRST, AND WHAT MEASURING IT FOUND.
 *
 * §B says to use "a pinned, licensed and reproducible authority where available, preferably the matching
 * Unicode CLDR subdivision data for zh-Hant/zh-TW". That authority DOES NOT EXIST, and the evidence is
 * committed next to this file rather than described:
 *
 *   · cldr-json 46.0.0 publishes no subdivisions.json for zh-Hant, zh-Hant-TW or zh at all (HTTP 404); the
 *     package that would hold it is not in the release.
 *   · The upstream CLDR repository DOES carry common/subdivisions/zh_Hant.xml at release-46 — and it is a
 *     458-byte STUB containing an <identity> block and ZERO <subdivision> elements. It is vendored here as
 *     tools/geo/data/cldr-46-subdivisions-zh_Hant.xml so the claim is checkable, and the regression suite
 *     asserts the element count is zero rather than trusting this comment.
 *   · common/subdivisions/zh.xml is 390 KB and is SIMPLIFIED. Using it would mean converting Simplified to
 *     Traditional, which is the character conversion the localization authority forbids outright (干 -> 幹 or
 *     乾 depending on sense), so it is not a fallback — it is the thing the rule is about.
 *
 * SO WHAT THE 356 FALLBACKS ACTUALLY ARE. Measured against the pinned Natural Earth source: all 356 HAVE a
 * name_zht value, and 353 of them are BYTE-IDENTICAL to name_zh. Upstream simply copied the Simplified string
 * into the Traditional column for those rows. R2's two-source detector was right to reject them; there was
 * never a Traditional name there to find.
 *
 * THE AUTHORITY THAT DOES EXIST: WIKIDATA, JOINED BY QID, NOT BY NAME. Every one of the 356 Natural Earth rows
 * carries a `wikidataid`, so the join is an EXACT identity match - no fuzzy name matching, no transliteration,
 * no translation. Wikidata labels are CC0. The snapshot is vendored (tools/geo/data/wikidata-admin1-zh.json)
 * with the entity `lastrevid` per QID, so the build is reproducible offline and every name is attributable to
 * a specific revision of a specific entity.
 *
 *   NO VARIANT CONVERSION WAS REQUESTED. wbgetentities was called WITHOUT languagefallback, so the snapshot
 *   holds only labels a human actually stored under zh-tw / zh-hant / zh-hk / zh-mo / zh. MediaWiki's Chinese
 *   variant converter can synthesise a "zh-tw" label from a zh-hans one, and that would be exactly the machine
 *   conversion §B.4 and §B.5 forbid. It is not in this data.
 *
 * AND WIKIDATA IS NOT TRUSTED BLINDLY — THE MEASUREMENT SAYS NOT TO. Compared against the 3,479 divisions that
 * ALREADY have a verified Natural Earth Traditional name, Wikidata agrees on 2,180 and DISAGREES on 351, and
 * the disagreements are not all improvements:
 *
 *   US Oklahoma   NE 奧克拉荷馬州  WD 俄克拉荷馬州   — WD zh-tw is the MAINLAND form while its OWN zh-hk
 *                                                  says 奧克拉荷馬州: the variants disagree, which is exactly
 *                                                  what the unanimity condition below is for
 *   US N Carolina NE 北卡羅萊納州  WD 北卡羅来納州   — WD contains 来, a Simplified character
 *   KR Incheon    NE 仁川廣域市    WD 仁川          — WD drops the division type its 16 siblings all carry
 *   KR N Jeolla   NE 全羅北道     WD 全北特別自治道  — a 2024 REAL-WORLD renaming, not a script question
 *
 * That is the R3 lesson repeated at division scale: a second authority applied wholesale introduces errors.
 * So Wikidata sits BELOW the verified Natural Earth field, never above it, and it is used ONLY where Natural
 * Earth has no Traditional name at all. The 351 disagreements are REPORTED for review, not applied.
 *
 * THE ONE EXCEPTION, AND IT IS A MECHANICAL RULE RATHER THAN MY OPINION. A Wikidata name may override a
 * verified Natural Earth name only when it is a pure SUFFIX COMPLETION: every Chinese variant in the snapshot
 * agrees on one string, that string passes the Traditional test, the Natural Earth name is a strict PREFIX of
 * it, and the added tail is a Chinese ADMINISTRATIVE-DIVISION TYPE word from the fixed list below. That admits
 * 東京 -> 東京都 and 薩斯喀徹溫 -> 薩斯喀徹溫省; it excludes 全羅北道 -> 全北特別自治道 (not a prefix, a
 * renaming), 仁川廣域市 -> 仁川 (shorter, a truncation) and 北加勒比海岸自治區 -> ...自治區部門 (部門 is not a
 * division-type word). Every accepted override is listed in the asset with its before, after, QID and reason.
 *
 * WHAT THIS TOOL NEVER DOES: no machine translation, no Simplified-to-Traditional conversion, no name derived
 * from an English string, no runtime network. Identity stays `adm1_code`; every name here is a display field.
 *
 *   node tools/geo/build-admin1-display-names.js <admin1.geojson> <admin0.geojson> <Unihan_Variants.txt>
 *   node tools/geo/build-admin1-display-names.js ... --audit     # print + write the audit, emit no asset
 *   node tools/geo/build-admin1-display-names.js ... --refresh   # re-fetch the Wikidata snapshot, report drift
 *
 * This is a BUILD tool. It is never loaded by the page.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var DATA_DIR = path.join(__dirname, 'data');
var OUT = path.join(ROOT, 'assets', 'js', 'data', 'geo-admin1-display-names-zh-tw.js');
var AUDIT_DOC = path.join(ROOT, 'docs', 'planning', 'ADMIN1_ZH_TW_NAME_AUDIT.md');

var GEN = require('./build-geo-names-zh-hant.js');

// ---- pinned inputs (re-verified at build time; a mismatch aborts) -------------------------------------------
var PINNED = {
  admin1: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    sha256: '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
    bytes: 40726851
  },
  admin0: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson',
    sha256: '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
    bytes: 838726
  },
  // The PROOF that §B's preferred authority is empty, vendored so it can be checked rather than believed.
  cldrSubdivisionsZhHant: {
    file: path.join(DATA_DIR, 'cldr-46-subdivisions-zh_Hant.xml'),
    url: 'https://raw.githubusercontent.com/unicode-org/cldr/release-46/common/subdivisions/zh_Hant.xml',
    sha256: 'fd2e47bd448874e24efc0b0f168d514abdf56178f4c65f2b460abf4c25b03f88',
    bytes: 458,
    license: 'Unicode License v3 (Unicode-3.0)'
  },
  wikidata: {
    file: path.join(DATA_DIR, 'wikidata-admin1-zh.json'),
    sha256: 'e8685bde8b28431aad3befc8ecfcd70bf6514397fd72ea549c22c0faa717b5e2',
    bytes: 360992,
    api: 'https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|info&languages=zh-tw|zh-hant|zh-hk|zh-mo|zh',
    license: 'CC0 1.0 Universal (public domain dedication)',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    credit: 'Subdivision names from Wikidata, available under CC0 1.0'
  }
};

// The order a division name is resolved in. CLDR's slot is PRESENT AND EMPTY, deliberately: §B names it, the
// data does not exist, and wiring the level anyway is what makes that a recorded fact instead of an omission.
var AUTHORITY_ORDER = [
  '1 REVIEWED_ADMIN1_ALIAS (this asset — documented exceptions, each with a reason and an authority)',
  '2 ZH_HANT_PINNED_SOURCE (Natural Earth v5.1.2 name_zht, accepted only when fully Traditional)',
  '3 WIKIDATA_ZH_TW (this asset — explicitly stored zh-tw/zh-hant labels, joined by QID, fill-only)',
  '4 ENGLISH_CANONICAL (the division\'s full English name)',
  '5 CODE (the stable administrative code)',
  'CLDR zh-Hant subdivisions would rank above 3 — CLDR 46 publishes NONE (0 <subdivision> elements)'
];

// Chinese administrative-division TYPE words. A suffix completion is only accepted when the tail Wikidata adds
// is one of these — which is what separates 東京 -> 東京都 from 北加勒比海岸自治區 -> ...自治區部門.
var DIVISION_TYPE_SUFFIX = [
  '自治區', '自治州', '自治縣', '特別行政區', '特別自治道', '特別自治市', '直轄市', '邊疆區',
  '共和國', '行政區', '大區', '廣域市', '自治市', '聯邦區',
  '省', '州', '縣', '市', '區', '郡', '道', '府', '都', '邦', '旗'
];

// The language preference INSIDE the snapshot. zh-tw first because it is the product's locale; zh-hant next
// because it is the script without the regional claim. zh-hk / zh-mo / zh are NOT used as a name source - they
// are carried only so the "do all variants agree?" test can see them.
var FILL_LANGS = ['zh-tw', 'zh-hant'];
var ALL_LANGS = ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo', 'zh'];

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function verifyInput(label, p, pin) {
  if (!fs.existsSync(p)) throw new Error('MISSING_INPUT ' + label + ': ' + p);
  var buf = fs.readFileSync(p);
  var d = sha256(buf);
  if (buf.length !== pin.bytes || d !== pin.sha256) {
    throw new Error('INPUT_CHECKSUM_MISMATCH ' + label + ': got ' + buf.length + ' B / ' + d +
      ', pinned ' + pin.bytes + ' B / ' + pin.sha256);
  }
  return buf;
}

// ---- acceptance ------------------------------------------------------------------------------------------
// Four independent reasons to refuse a candidate string. Each is recorded per rejection so the report says
// WHY a division still falls back to English, rather than only that it does.
function rejectReason(det, v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return 'EMPTY';
  // A parenthetical is a DISAMBIGUATION device for a sorted list - 亞馬遜州 (巴西) - not a name to paint on a
  // map. R3 found the same defect in CLDR's country names and refused it there for the same reason.
  if (/[（）()\[\]【】]/.test(s)) return 'PARENTHETICAL_DISAMBIGUATION';
  // A label carrying Latin letters or digits is a code or an untranslated string, not a Chinese name.
  if (/[A-Za-z0-9]/.test(s)) return 'LATIN_OR_DIGIT';
  var hit = GEN.firstSimplified(det, s);
  // The same two-source detector R2 built, applied to a DIFFERENT source. It earns its keep immediately: 22 of
  // the 126 Wikidata candidates for uncovered divisions are Simplified strings stored under a zh-tw or zh-hant
  // key, and would have shipped as "Traditional" without it.
  if (hit) return 'NOT_FULLY_TRADITIONAL:' + hit;
  return null;
}

function chineseLabels(entry) {
  var out = {};
  if (!entry || !entry.l) return out;
  ALL_LANGS.forEach(function (l) { if (entry.l[l]) out[l] = String(entry.l[l]).trim(); });
  return out;
}

function pickFill(entry) {
  var L = chineseLabels(entry);
  for (var i = 0; i < FILL_LANGS.length; i++) {
    if (L[FILL_LANGS[i]]) return { value: L[FILL_LANGS[i]], lang: FILL_LANGS[i] };
  }
  return null;
}

// A suffix completion: unanimous across every stored Chinese variant, the existing name is a strict prefix, and
// the tail is a division-type word. Returns the added suffix, or null.
function suffixCompletion(entry, current) {
  var L = chineseLabels(entry);
  var vals = ALL_LANGS.map(function (l) { return L[l]; }).filter(Boolean);
  if (!vals.length) return null;
  var uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
  if (uniq.length !== 1) return null;                 // the variants disagree — a Taiwan/mainland split
  var v = uniq[0];
  if (v === current) return null;
  if (v.length <= current.length) return null;        // shorter or equal is a truncation, not a completion
  if (v.indexOf(current) !== 0) return null;          // not a prefix — a renaming
  var tail = v.slice(current.length);
  return DIVISION_TYPE_SUFFIX.indexOf(tail) === -1 ? null : { value: v, tail: tail };
}

// ---- the vendored runtime assets --------------------------------------------------------------------------
function loadVendored() {
  var sandbox = { window: {} };
  ['assets/js/data/world-admin1-10m.js', 'assets/js/data/geo-names-zh-hant.js'].forEach(function (rel) {
    // eslint-disable-next-line no-new-func
    new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8')).call(sandbox, sandbox.window);
  });
  var ds = sandbox.window.KM_WORLD_ADMIN1, nm = sandbox.window.KM_GEO_NAMES_ZH_HANT;
  if (!ds || !Array.isArray(ds.admin1)) throw new Error('VENDORED_ADMIN1_UNREADABLE');
  if (!nm || !nm.admin1) throw new Error('VENDORED_NAMES_UNREADABLE');
  return { divisions: ds.admin1, names: nm };
}

// The SAME key the resolver uses for the Natural Earth level: country + full English name, lowercased. Keyed on
// the displayed code it would be wrong - `country|displayedCode` collides across 53 rows.
function neKey(d) {
  var full = (d.n != null && d.n !== '') ? String(d.n) : String(d.k);
  return d.c + '|' + full.toLowerCase();
}

// ---- the Wikidata refresh (only with --refresh) -----------------------------------------------------------
function httpGet(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 5) return reject(new Error('TOO_MANY_REDIRECTS'));
    https.get(url, { headers: { 'user-agent': 'km-build-admin1-display-names/1.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return httpGet(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP_' + res.statusCode)); }
      var c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () { resolve(Buffer.concat(c)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function refreshSnapshot(qids) {
  var out = {};
  var i = 0;
  function next() {
    if (i >= qids.length) return Promise.resolve(out);
    var batch = qids.slice(i, i + 50); i += 50;
    var u = PINNED.wikidata.api + '&format=json&ids=' + batch.join('|');
    return httpGet(encodeURI(u), 0).then(function (b) {
      var j = JSON.parse(b.toString('utf8'));
      Object.keys(j.entities || {}).forEach(function (q) {
        var e = j.entities[q], l = {};
        ALL_LANGS.forEach(function (lang) { if (e.labels && e.labels[lang]) l[lang] = e.labels[lang].value; });
        if (Object.keys(l).length) out[q] = { l: l, r: e.lastrevid };
      });
      return next();
    });
  }
  return next();
}

function serialiseSnapshot(map) {
  var keys = Object.keys(map).sort();
  var head = '{\n"_":"Wikidata Chinese labels for the Natural Earth ADM1 entities, fetched by ' +
    'tools/geo/build-admin1-display-names.js --refresh. CC0 1.0. One entry per QID: l = explicitly stored ' +
    'labels by language (NO variant conversion was requested, so nothing here is machine-converted), r = the ' +
    'entity lastrevid at fetch time.",\n';
  return head + keys.map(function (k) { return JSON.stringify(k) + ':' + JSON.stringify(map[k]); }).join(',\n') + '\n}\n';
}

// ============================================================================================================
// MAIN
// ============================================================================================================
function main() {
  var argv = process.argv.slice(2);
  var flags = argv.filter(function (a) { return a.charAt(0) === '-'; });
  var files = argv.filter(function (a) { return a.charAt(0) !== '-'; });
  var auditOnly = flags.indexOf('--audit') !== -1;
  var refresh = flags.indexOf('--refresh') !== -1;

  if (files.length < 3) {
    console.error('usage: node tools/geo/build-admin1-display-names.js <admin1.geojson> <admin0.geojson> <Unihan_Variants.txt>');
    console.error('  the two geojson files are the SAME pinned Natural Earth v5.1.2 inputs the name asset uses.');
    return 2;
  }

  var a1Buf = verifyInput('ne_10m_admin_1_states_provinces', files[0], PINNED.admin1);
  var a0Buf = verifyInput('ne_110m_admin_0_countries', files[1], PINNED.admin0);

  // §B — the recorded PROOF that the preferred authority is empty. Not a comment: a file, a digest, and a count.
  var cldrBuf = verifyInput('cldr-46-subdivisions-zh_Hant', PINNED.cldrSubdivisionsZhHant.file, PINNED.cldrSubdivisionsZhHant);
  var cldrText = cldrBuf.toString('utf8');
  var cldrSubdivisionCount = (cldrText.match(/<subdivision\b/g) || []).length;
  if (cldrSubdivisionCount !== 0) {
    throw new Error('CLDR_ZH_HANT_SUBDIVISIONS_NO_LONGER_EMPTY: ' + cldrSubdivisionCount + ' entries now exist. ' +
      'CLDR outranks Wikidata in §B\'s order — rework this tool to prefer it before shipping.');
  }

  // ---- the two-source Traditional detector, from the SAME functions the R2 name asset was built with -------
  var unihan = GEN.buildUnihanTraditionalMap(files[2]);
  var a1 = JSON.parse(a1Buf.toString('utf8'));
  var a0 = JSON.parse(a0Buf.toString('utf8'));
  var pairs = [];
  a0.features.forEach(function (f) { pairs.push([f.properties.NAME_ZH, f.properties.NAME_ZHT]); });
  a1.features.forEach(function (f) { pairs.push([f.properties.name_zh, f.properties.name_zht]); });
  var det = GEN.buildDetector(unihan, GEN.harvestCorpus(pairs));
  var DET = det.set;

  var srcByAdm1 = {};
  a1.features.forEach(function (f) {
    var p = f.properties;
    if (p && p.adm1_code) srcByAdm1[p.adm1_code] = p;
  });

  var v = loadVendored();

  // ---- the Wikidata snapshot -------------------------------------------------------------------------------
  var qids = [], seenQ = {};
  v.divisions.forEach(function (d) {
    var p = srcByAdm1[d.a];
    if (p && p.wikidataid && !seenQ[p.wikidataid]) { seenQ[p.wikidataid] = 1; qids.push(p.wikidataid); }
  });

  var proceed = Promise.resolve();
  if (refresh) {
    console.log('refreshing the Wikidata snapshot for ' + qids.length + ' entities ...');
    proceed = refreshSnapshot(qids).then(function (map) {
      var body = serialiseSnapshot(map);
      var before = fs.existsSync(PINNED.wikidata.file) ? fs.readFileSync(PINNED.wikidata.file, 'utf8') : '';
      fs.writeFileSync(PINNED.wikidata.file, body, 'utf8');
      var d = sha256(Buffer.from(body, 'utf8'));
      console.log('  wrote ' + path.relative(ROOT, PINNED.wikidata.file) + '  ' +
        Buffer.byteLength(body, 'utf8') + ' B  sha256 ' + d);
      if (before && before !== body) {
        console.log('  UPSTREAM DRIFT: the snapshot changed. Update PINNED.wikidata and RE-REVIEW every name');
        console.log('  this build applies — a Wikidata label can be edited by anyone at any time.');
      }
    });
  }

  return proceed.then(function () {
    var wdBuf = verifyInput('wikidata-admin1-zh', PINNED.wikidata.file, PINNED.wikidata);
    var WD = JSON.parse(wdBuf.toString('utf8'));

    // ---- classify every division ---------------------------------------------------------------------------
    var wikidataFill = {}, reviewed = {}, fallbacks = [], disagreements = [];
    var stat = {
      divisions: v.divisions.length,
      ne_traditional: 0, wikidata_fill: 0, reviewed_override: 0, still_english: 0,
      no_wikidata_id: 0, wikidata_agrees: 0, wikidata_disagrees: 0,
      fill_rejected: {}, override_rejected: 0
    };

    v.divisions.forEach(function (d) {
      var src = srcByAdm1[d.a];
      var qid = src && src.wikidataid ? String(src.wikidataid) : '';
      var entry = qid ? WD[qid] : null;
      var current = String(v.names.admin1[neKey(d)] || '');
      var english = (d.n != null && d.n !== '') ? String(d.n) : String(d.k);
      if (!qid) stat.no_wikidata_id++;

      if (current) {
        stat.ne_traditional++;
        var comp = entry ? suffixCompletion(entry, current) : null;
        if (comp) {
          var why = rejectReason(DET, comp.value);
          if (why) { stat.override_rejected++; }
          else {
            reviewed[d.a] = {
              name: comp.value, was: current, added: comp.tail,
              country: d.c, english: english, qid: qid, revid: entry.r,
              authority: 'WIKIDATA_UNANIMOUS_SUFFIX_COMPLETION',
              reason: 'Every Chinese variant stored on ' + qid + ' agrees on ' + comp.value + '; the verified ' +
                'Natural Earth name ' + current + ' is a strict PREFIX of it and the added tail «' + comp.tail +
                '» is an administrative-division type word. A completion of the same name, not a different name.'
            };
            stat.reviewed_override++;
            return;
          }
        }
        // Not applied — but recorded, because "we looked and chose not to" is a different fact from "we did
        // not look". These are what a human should review next.
        if (entry) {
          var L = chineseLabels(entry);
          var wv = L['zh-tw'] || L['zh-hant'] || '';
          if (wv) {
            if (wv === current) stat.wikidata_agrees++;
            else {
              stat.wikidata_disagrees++;
              disagreements.push({
                country: d.c, english: english, adm1: d.a, qid: qid,
                natural_earth: current, wikidata: wv,
                wikidata_lang: L['zh-tw'] ? 'zh-tw' : 'zh-hant',
                wikidata_not_traditional: GEN.firstSimplified(DET, wv) || '',
                variants_agree: Object.keys(L).map(function (k) { return L[k]; })
                  .filter(function (x, i, a) { return a.indexOf(x) === i; }).length === 1
              });
            }
          }
        }
        return;
      }

      // No verified Traditional name from Natural Earth — this is where Wikidata is allowed to answer.
      var pick = entry ? pickFill(entry) : null;
      if (pick) {
        var reason = rejectReason(DET, pick.value);
        if (!reason) {
          wikidataFill[d.a] = {
            name: pick.value, lang: pick.lang, country: d.c, english: english, qid: qid, revid: entry.r
          };
          stat.wikidata_fill++;
          return;
        }
        var bucket = reason.split(':')[0];
        stat.fill_rejected[bucket] = (stat.fill_rejected[bucket] || 0) + 1;
        fallbacks.push({ country: d.c, english: english, adm1: d.a, qid: qid,
                         rejected: pick.value, reason: reason });
      } else {
        fallbacks.push({ country: d.c, english: english, adm1: d.a, qid: qid,
                         rejected: '', reason: qid ? 'NO_TRADITIONAL_LABEL_ON_ENTITY' : 'NO_WIKIDATA_ID' });
      }
      stat.still_english++;
    });

    // ---- report ---------------------------------------------------------------------------------------------
    var covered = stat.ne_traditional + stat.wikidata_fill;
    function pct(n) { return (n / stat.divisions * 100).toFixed(1) + '%'; }

    console.log('\n§B DIVISION DISPLAY-NAME AUDIT');
    console.log('  divisions                     : ' + stat.divisions);
    console.log('  CLDR zh-Hant subdivisions     : ' + cldrSubdivisionCount + ' entries  (the file is a ' +
      PINNED.cldrSubdivisionsZhHant.bytes + '-byte stub — §B\'s preferred authority does not exist)');
    console.log('  verified Natural Earth name_zht: ' + stat.ne_traditional + '  (' + pct(stat.ne_traditional) + ')');
    console.log('  + Wikidata fill (QID join)     : ' + stat.wikidata_fill);
    console.log('  = with a verified Chinese name : ' + covered + '  (' + pct(covered) + ')');
    console.log('  still falling back to English  : ' + stat.still_english + '  (' + pct(stat.still_english) + ')');
    console.log('  reviewed suffix completions    : ' + stat.reviewed_override);
    console.log('  fill candidates REFUSED        : ' + JSON.stringify(stat.fill_rejected));
    console.log('  Wikidata vs Natural Earth      : ' + stat.wikidata_agrees + ' agree, ' +
      stat.wikidata_disagrees + ' DISAGREE (reported, not applied)');

    if (stat.reviewed_override) {
      console.log('\nREVIEWED SUFFIX COMPLETIONS (the only case where Wikidata overrides Natural Earth):');
      Object.keys(reviewed).sort().forEach(function (k) {
        var r = reviewed[k];
        console.log('  ' + r.country + '  ' + r.english.padEnd(24) + r.was + ' -> ' + r.name +
          '   (+' + r.added + ', ' + r.qid + ')');
      });
    }

    // §B.8 — the explicitly named audit list, printed whether or not anything changed for it.
    var AUDIT_COUNTRIES = ['US', 'CA', 'TW', 'CN', 'JP', 'KR'];
    console.log('\n§B.8 NAMED AUDIT SETS:');
    AUDIT_COUNTRIES.forEach(function (cc) {
      var subset = v.divisions.filter(function (d) { return d.c === cc; });
      var miss = subset.filter(function (d) { return !v.names.admin1[neKey(d)] && !wikidataFill[d.a]; });
      var filled = subset.filter(function (d) { return !v.names.admin1[neKey(d)] && wikidataFill[d.a]; });
      var over = subset.filter(function (d) { return !!reviewed[d.a]; });
      console.log('  ' + cc + '  ' + String(subset.length).padStart(3) + ' divisions   ' +
        'still English ' + miss.length + '   filled ' + filled.length + '   completed ' + over.length +
        (miss.length ? '   [' + miss.map(function (d) { return d.n || d.k; }).join(', ') + ']' : ''));
    });

    if (auditOnly) { writeAuditDoc(); return 0; }

    // ---- emit -----------------------------------------------------------------------------------------------
    function sorted(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
    var payload = {
      meta: {
        task: 'MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4',
        purpose: 'zh-TW DIVISION (ADM1) display names. Display fields only — identity remains adm1_code. ' +
          'No geometry, no coordinates, no label anchors.',
        generator: 'tools/geo/build-admin1-display-names.js',
        default_language: 'zh-TW',
        key: 'adm1_code (Natural Earth stable per-feature identity; unique across all 3,835 divisions)',
        authority_order: AUTHORITY_ORDER,
        cldr_zh_hant_subdivisions: {
          exists: false,
          checked: PINNED.cldrSubdivisionsZhHant.url,
          bytes: PINNED.cldrSubdivisionsZhHant.bytes,
          sha256: PINNED.cldrSubdivisionsZhHant.sha256,
          subdivision_elements: cldrSubdivisionCount,
          cldr_json_46_0_0: 'no subdivisions.json is published for zh-Hant, zh-Hant-TW or zh (HTTP 404)',
          zh_simplified_file: 'common/subdivisions/zh.xml exists and is SIMPLIFIED; using it would require ' +
            'character conversion, which the localization authority forbids'
        },
        wikidata: {
          snapshot: 'tools/geo/data/wikidata-admin1-zh.json',
          bytes: PINNED.wikidata.bytes, sha256: PINNED.wikidata.sha256,
          api: PINNED.wikidata.api,
          license: PINNED.wikidata.license, license_url: PINNED.wikidata.license_url,
          credit: PINNED.wikidata.credit,
          join: 'Natural Earth `wikidataid` -> Wikidata QID. An exact identity join; no name matching.',
          variant_conversion: 'NONE REQUESTED. wbgetentities was called without languagefallback, so only ' +
            'labels a human stored under these language codes are present. Nothing here is machine-converted.',
          used_for: 'FILL ONLY — a division with no verified Natural Earth Traditional name. Wikidata never ' +
            'overrides the verified field except by the unanimous suffix-completion rule.'
        },
        natural_earth: {
          source: 'Natural Earth v5.1.2 ne_10m_admin_1_states_provinces',
          sha256: PINNED.admin1.sha256, bytes: PINNED.admin1.bytes, license: 'Public domain',
          finding: 'All 356 divisions that fell back in R2 DO carry a name_zht value, and 353 of them are ' +
            'byte-identical to name_zh: upstream copied the Simplified string into the Traditional column.'
        },
        traditional_test: {
          method: 'The same two-source detector the country/division name asset was built with: a character is ' +
            'Simplified-only iff Unihan gives it a distinct kTraditionalVariant AND the Natural Earth zh/zht ' +
            'corpus converted it at least once and never kept it in a converted row.',
          detector_characters: Object.keys(DET).length,
          applied_to: 'every Wikidata candidate, which is where it caught 22 Simplified strings stored under a ' +
            'zh-tw or zh-hant key'
        },
        suffix_completion_rule: {
          description: 'The ONLY route by which Wikidata may override a verified Natural Earth name.',
          conditions: [
            'every Chinese variant stored on the entity agrees on one string',
            'that string passes the Traditional test and the other acceptance rules',
            'the Natural Earth name is a STRICT PREFIX of it (a completion, never a renaming)',
            'the added tail is one of the listed administrative-division type words'
          ],
          division_type_suffixes: DIVISION_TYPE_SUFFIX
        },
        counts: {
          divisions: stat.divisions,
          natural_earth_traditional: stat.ne_traditional,
          wikidata_fill: stat.wikidata_fill,
          reviewed_suffix_completion: stat.reviewed_override,
          with_verified_chinese_name: covered,
          still_english_fallback: stat.still_english,
          fill_candidates_refused: stat.fill_rejected,
          wikidata_agrees_with_natural_earth: stat.wikidata_agrees,
          wikidata_disagrees_reported_not_applied: stat.wikidata_disagrees,
          divisions_without_a_wikidata_id: stat.no_wikidata_id
        },
        remaining_fallback_is_expected: 'Zero fallback is NOT a goal. ' + stat.still_english + ' divisions have ' +
          'no verified Traditional name in any pinned authority; inventing one would be the machine translation ' +
          '§B forbids. They render their full English name, which is a correct name.',
        runtime_network_dependency: 'none — loaded as a same-origin <script>'
      },
      reviewed: sorted(reviewed),
      wikidata: sorted(wikidataFill)
    };

    var banner = [
      '/**',
      ' * assets/js/data/geo-admin1-display-names-zh-tw.js — VENDORED, GENERATED. Do not edit by hand.',
      ' *',
      ' * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4 §B — zh-TW DIVISION (ADM1) DISPLAY NAMES ONLY. No geometry, no',
      ' * coordinates, no label anchors. Identity remains `adm1_code`; every string here is a display field.',
      ' *',
      ' * Generator: tools/geo/build-admin1-display-names.js (deterministic; every input verified by SHA-256).',
      ' *',
      ' * §B\'s preferred authority — CLDR zh-Hant subdivisions — DOES NOT EXIST. CLDR 46 ships a 458-byte stub',
      ' * with ZERO <subdivision> elements, vendored at tools/geo/data/ so the claim is checkable.',
      ' *',
      ' * `wikidata` is FILL-ONLY: it answers for divisions where the verified Natural Earth field has no',
      ' * Traditional name at all. It never overrides that field except through the unanimous suffix-completion',
      ' * rule, whose results are in `reviewed` with a before, an after, a QID and a reason.',
      ' *',
      ' * ' + PINNED.wikidata.credit + '.',
      ' * Made with Natural Earth.',
      ' *',
      ' * No runtime CDN/network: loaded as a same-origin <script> that sets window.KM_GEO_ADMIN1_DISPLAY_NAMES.',
      ' */',
      'window.KM_GEO_ADMIN1_DISPLAY_NAMES=' + JSON.stringify(payload) + ';',
      ''
    ].join('\n');

    fs.writeFileSync(OUT, banner.replace(/\r?\n/g, '\r\n'), 'utf8');
    console.log('\nwrote ' + path.relative(ROOT, OUT));
    console.log('  bytes : ' + fs.statSync(OUT).size);
    console.log('  sha256: ' + sha256(fs.readFileSync(OUT)));

    writeAuditDoc();
    return 0;

    // --------------------------------------------------------------------------------------------------------
    function writeAuditDoc() {
      var lines = [];
      lines.push('# ADM1 zh-TW name audit — MAP-VISUAL-REAL-EARTH-TEXTURE-3-R4 §B');
      lines.push('');
      lines.push('Generated by `node tools/geo/build-admin1-display-names.js <admin1.geojson> <admin0.geojson> <Unihan_Variants.txt>`.');
      lines.push('Every number here is measured, not estimated.');
      lines.push('');
      lines.push('## The preferred authority does not exist');
      lines.push('');
      lines.push('§B asks for "the matching Unicode CLDR subdivision data for zh-Hant/zh-TW". There is none:');
      lines.push('');
      lines.push('| checked | result |');
      lines.push('| --- | --- |');
      lines.push('| `cldr-json` 46.0.0 `zh-Hant/subdivisions.json` | HTTP 404 — not published |');
      lines.push('| `cldr-json` 46.0.0 `zh-Hant-TW/subdivisions.json` | HTTP 404 |');
      lines.push('| `cldr-json` 46.0.0 `zh/subdivisions.json` | HTTP 404 |');
      lines.push('| `unicode-org/cldr` release-46 `common/subdivisions/zh_Hant.xml` | **458 bytes, ' +
        cldrSubdivisionCount + ' `<subdivision>` elements** — an identity-only stub |');
      lines.push('| `unicode-org/cldr` release-46 `common/subdivisions/zh.xml` | 390 KB, **Simplified** — using it would mean character conversion, which the localization authority forbids |');
      lines.push('');
      lines.push('The stub is vendored at `tools/geo/data/cldr-46-subdivisions-zh_Hant.xml` (sha256 `' +
        PINNED.cldrSubdivisionsZhHant.sha256.slice(0, 16) + '…`) so this is checkable rather than asserted.');
      lines.push('');
      lines.push('## What the 356 R2 fallbacks actually were');
      lines.push('');
      lines.push('All 356 **have** a `name_zht` value in the pinned Natural Earth source, and **353 are');
      lines.push('byte-identical to `name_zh`** — upstream copied the Simplified string into the Traditional');
      lines.push('column. R2\'s detector was right; there was no Traditional name to find.');
      lines.push('');
      lines.push('## Coverage');
      lines.push('');
      lines.push('| | divisions | share |');
      lines.push('| --- | ---: | ---: |');
      lines.push('| total | ' + stat.divisions + ' | 100% |');
      lines.push('| verified Natural Earth `name_zht` | ' + stat.ne_traditional + ' | ' + pct(stat.ne_traditional) + ' |');
      lines.push('| + Wikidata fill (QID join, zh-tw/zh-hant) | ' + stat.wikidata_fill + ' | ' + pct(stat.wikidata_fill) + ' |');
      lines.push('| **with a verified Chinese name** | **' + covered + '** | **' + pct(covered) + '** |');
      lines.push('| remaining English fallback | ' + stat.still_english + ' | ' + pct(stat.still_english) + ' |');
      lines.push('');
      lines.push('Before this round: ' + stat.ne_traditional + '/' + stat.divisions + '. After: ' + covered + '/' +
        stat.divisions + '.');
      lines.push('');
      lines.push('## Why Wikidata sits BELOW Natural Earth rather than in CLDR\'s slot');
      lines.push('');
      lines.push('Against the ' + stat.ne_traditional + ' divisions that already have a verified Traditional name,');
      lines.push('Wikidata agrees on **' + stat.wikidata_agrees + '** and disagrees on **' + stat.wikidata_disagrees +
        '**. The disagreements are not all improvements:');
      lines.push('');
      lines.push('| country | division | Natural Earth | Wikidata | why Natural Earth is kept |');
      lines.push('| --- | --- | --- | --- | --- |');
      // The examples are chosen BY RULE, not by hand: one batch per failure mode, so the table is a fair
      // sample of why the 351 are refused rather than a curated set of the most damning ones.
      function why(r) {
        if (r.wikidata_not_traditional) {
          return 'the Wikidata label contains `' + r.wikidata_not_traditional + '`, a Simplified character';
        }
        if (r.wikidata.length < r.natural_earth.length) {
          return 'shorter — Wikidata drops the division type the verified name carries';
        }
        // A PREFIX COMPLETION that was not applied failed a SPECIFIC condition, and saying which is the
        // difference between a report and a shrug. The first version of this lumped them in with genuine
        // terminology differences, which put 杜拜 -> 杜拜酋長國 under 'no mechanical rule' when the rule had
        // in fact examined it and named a reason.
        if (r.wikidata.indexOf(r.natural_earth) === 0) {
          var tail = r.wikidata.slice(r.natural_earth.length);
          if (!r.variants_agree) {
            return 'a completion (+`' + tail + '`), but the stored Chinese variants DISAGREE — which is how a ' +
              'Taiwan/mainland split shows up, so it is not applied';
          }
          return 'a completion (+`' + tail + '`), but `' + tail + '` is not on the administrative-division ' +
            'type-word list, so the rule declines it';
        }
        return 'a different name, not a different spelling — a renaming or a terminology split, which needs a human';
      }
      var buckets = { simplified: [], shorter: [], completion: [], renamed: [] };
      disagreements.forEach(function (r) {
        if (r.wikidata_not_traditional) buckets.simplified.push(r);
        else if (r.wikidata.length < r.natural_earth.length) buckets.shorter.push(r);
        else if (r.wikidata.indexOf(r.natural_earth) === 0) buckets.completion.push(r);
        else buckets.renamed.push(r);
      });
      ['simplified', 'shorter', 'completion', 'renamed'].forEach(function (b) {
        buckets[b].slice(0, 4).forEach(function (r) {
          lines.push('| ' + r.country + ' | ' + r.english + ' | ' + r.natural_earth + ' | ' + r.wikidata +
            ' | ' + why(r) + ' |');
        });
      });
      lines.push('');
      lines.push('By failure mode: **' + buckets.simplified.length + '** carry a Simplified character inside a ' +
        'zh-tw/zh-hant label, **' + buckets.shorter.length + '** are SHORTER than the verified name (a ' +
        'truncation, not an improvement), **' + buckets.completion.length + '** are prefix COMPLETIONS that ' +
        'the suffix rule examined and declined for a named reason, and **' + buckets.renamed.length + '** are a ' +
        'different name rather than a different spelling. None of the four is a case a rule should decide.');
      lines.push('');
      lines.push('All ' + stat.wikidata_disagrees + ' are **reported, not applied**. They are the natural next');
      lines.push('review batch and need a human, not a rule.');
      lines.push('');
      lines.push('## The one rule that lets Wikidata win');
      lines.push('');
      lines.push('A **unanimous suffix completion**: every stored Chinese variant agrees, the Natural Earth name');
      lines.push('is a strict prefix, and the added tail is an administrative-division type word.');
      lines.push('');
      lines.push('| country | division | before | after | added |');
      lines.push('| --- | --- | --- | --- | --- |');
      Object.keys(reviewed).sort().forEach(function (k) {
        var r = reviewed[k];
        lines.push('| ' + r.country + ' | ' + r.english + ' | ' + r.was + ' | **' + r.name + '** | ' + r.added + ' |');
      });
      lines.push('');
      lines.push('Excluded by the same rule, with the reason: `全羅北道 → 全北特別自治道` (not a prefix — a');
      lines.push('renaming), `仁川廣域市 → 仁川` (shorter — a truncation), `北加勒比海岸自治區 → …自治區部門`');
      lines.push('(`部門` is not a division-type word).');
      lines.push('');
      lines.push('## §B.8 — the named audit sets');
      lines.push('');
      lines.push('| country | divisions | still English | filled from Wikidata | suffix-completed |');
      lines.push('| --- | ---: | ---: | ---: | ---: |');
      AUDIT_COUNTRIES.forEach(function (cc) {
        var subset = v.divisions.filter(function (d) { return d.c === cc; });
        var miss = subset.filter(function (d) { return !v.names.admin1[neKey(d)] && !wikidataFill[d.a]; });
        var filled = subset.filter(function (d) { return !v.names.admin1[neKey(d)] && wikidataFill[d.a]; });
        var over = subset.filter(function (d) { return !!reviewed[d.a]; });
        lines.push('| ' + cc + ' | ' + subset.length + ' | ' + miss.length +
          (miss.length ? ' (' + miss.map(function (d) { return d.n || d.k; }).join(', ') + ')' : '') +
          ' | ' + filled.length + ' | ' + over.length + ' |');
      });
      lines.push('');
      lines.push('## Remaining fallbacks by country');
      lines.push('');
      var byCountry = {};
      fallbacks.forEach(function (f) { byCountry[f.country] = (byCountry[f.country] || 0) + 1; });
      lines.push('```');
      lines.push(Object.keys(byCountry).sort(function (a, b) { return byCountry[b] - byCountry[a]; })
        .map(function (c) { return c + ':' + byCountry[c]; }).join('  '));
      lines.push('```');
      lines.push('');
      lines.push('Reasons: ' + JSON.stringify(fallbacks.reduce(function (a, f) {
        var k = f.reason.split(':')[0]; a[k] = (a[k] || 0) + 1; return a;
      }, {})) + '.');
      lines.push('');
      lines.push('**Zero fallback is not the goal.** A division with no verified Traditional name in any pinned');
      lines.push('authority renders its full English name, which is a correct name. Inventing a Chinese one from');
      lines.push('the English string is exactly what §B.5 forbids.');
      lines.push('');

      fs.mkdirSync(path.dirname(AUDIT_DOC), { recursive: true });
      fs.writeFileSync(AUDIT_DOC, lines.join('\n').replace(/\r?\n/g, '\r\n'), 'utf8');
      console.log('wrote ' + path.relative(ROOT, AUDIT_DOC));
    }
  });
}

module.exports = {
  PINNED: PINNED, DIVISION_TYPE_SUFFIX: DIVISION_TYPE_SUFFIX, AUTHORITY_ORDER: AUTHORITY_ORDER,
  rejectReason: rejectReason, suffixCompletion: suffixCompletion, pickFill: pickFill, neKey: neKey
};

if (require.main === module) {
  Promise.resolve(main()).then(function (c) { process.exit(c || 0); }, function (e) {
    console.error('FAILED: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}
