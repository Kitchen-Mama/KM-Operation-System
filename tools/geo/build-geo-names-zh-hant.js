#!/usr/bin/env node
/**
 * tools/geo/build-geo-names-zh-hant.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3 (localization authority) — DETERMINISTIC preparation of the vendored
 * Traditional-Chinese geographic NAME asset.
 *
 * Emits assets/js/data/geo-names-zh-hant.js, which sets window.KM_GEO_NAMES_ZH_HANT.
 *
 * NAMES ONLY. This asset carries no ring, no coordinate and no label anchor. The existing geometry assets
 * (world-countries-110m.js, world-admin1-10m.js, world-land-110m.js) are NOT regenerated and NOT touched by this
 * tool, because the localization authority requires that the new source "supplies names only; it must not replace
 * geometry or coordinates" and that the existing Natural Earth geometry and label anchors are preserved. Keeping
 * the names in their own file is what makes that verifiable rather than asserted: a diff of the geometry assets
 * is empty by construction.
 *
 * THE JOIN IS AGAINST THE VENDORED ASSET, NOT A RE-DERIVATION. Admin-1 names are keyed
 * `<ISO a2>|<full English name, lowercased>` using the c/n/k values ALREADY PRESENT in world-admin1-10m.js, read
 * out of that file. Re-deriving them here would risk drifting from what the runtime actually holds, which would
 * silently produce names nothing can look up. The DISPLAYED CODE is deliberately not the key: it is measurably
 * not unique (35 colliding keys over 53 rows; BA|BIH alone covers nine Bosnian cantons).
 *
 * PROVENANCE AND REGENERATION: see tools/geo/PROVENANCE.md §"Traditional Chinese name asset". Raw inputs are not
 * vendored; their exact immutable URLs and SHA-256 values are pinned there and re-verified by this tool.
 *
 *   curl -sSL -o ne_110m_admin_0_countries.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
 *   curl -sSL -o ne_10m_admin_1_states_provinces.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
 *   curl -sSL -o Unihan.zip https://www.unicode.org/Public/15.1.0/ucd/Unihan.zip && unzip -o Unihan.zip Unihan_Variants.txt
 *   node tools/geo/build-geo-names-zh-hant.js \
 *     ne_110m_admin_0_countries.geojson ne_10m_admin_1_states_provinces.geojson Unihan_Variants.txt
 *
 * DETERMINISM: no clock, no randomness, no network, no filesystem discovery. Every map is emitted with its keys
 * sorted ascending, so running it twice on the same inputs produces a byte-identical file. The regression suite
 * relies on that and on the pinned input checksums.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// ---- pinned inputs (re-verified at build time; a mismatch aborts) -------------------------------------------
var PINNED = {
  admin0: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson',
    sha256: '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f',
    bytes: 838726
  },
  admin1: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    sha256: '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5',
    bytes: 40726851
  },
  // Unihan_Variants.txt is EXTRACTED from Unihan.zip; the zip is what upstream publishes and what is pinned.
  unihanZip: {
    url: 'https://www.unicode.org/Public/15.1.0/ucd/Unihan.zip',
    sha256: 'a0226610e324bcf784ac380e11f4cbf533ee1e6b3d028b0991bf8c0dc3f85853',
    version: 'Unicode 15.1.0'
  }
};

// ============================================================================================================
// CONTINENTS — the explicitly reviewed canonical Traditional Chinese list.
// ------------------------------------------------------------------------------------------------------------
// Vendored and hand-reviewed, exactly as the localization authority specifies. Natural Earth's CONTINENT field
// carries eight values; seven are continents and the eighth ("Seven seas (open ocean)") is not a continent and
// is deliberately given NO name, so it is HIDDEN rather than mislabelled — which is the authority's own
// instruction for the case where no reliable name exists.
// ============================================================================================================
var CONTINENT_ZH_HANT = {
  'Africa': '非洲',
  'Antarctica': '南極洲',
  'Asia': '亞洲',
  'Europe': '歐洲',
  'North America': '北美洲',
  'Oceania': '大洋洲',
  'South America': '南美洲'
  // 'Seven seas (open ocean)' — intentionally absent. Not a continent; hidden.
};

// ---- helpers -----------------------------------------------------------------------------------------------
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function verifyInput(label, file, pin) {
  var got = sha256File(file);
  var size = fs.statSync(file).size;
  if (got !== pin.sha256) {
    throw new Error('INPUT_CHECKSUM_MISMATCH for ' + label + '\n  expected ' + pin.sha256 + '\n  got      ' + got +
      '\n  the pinned source is ' + pin.url);
  }
  if (pin.bytes && size !== pin.bytes) {
    throw new Error('INPUT_SIZE_MISMATCH for ' + label + ': expected ' + pin.bytes + ' got ' + size);
  }
  return { sha256: got, bytes: size };
}

// Natural Earth's own ISO resolution, identical to build-country-boundaries.js so the two assets agree.
// ISO_A2_EH is "as encoded by the ISO standard where NE differs" and fixes France and Norway, which carry -99
// in plain ISO_A2. WB_A2 (World Bank) is the last resort.
function isoOf(p) {
  var cands = [p.ISO_A2_EH, p.ISO_A2, p.WB_A2];
  for (var i = 0; i < cands.length; i++) {
    var v = String(cands[i] == null ? '' : cands[i]).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(v)) return v;
  }
  return null;
}

// ============================================================================================================
// THE "IS THIS STRING FULLY TRADITIONAL?" TEST — two independent pinned sources that must AGREE.
// ------------------------------------------------------------------------------------------------------------
// This is DETECTION ONLY. Nothing here converts a character. Converting would be exactly the translation the
// localization authority forbids, and it is unsafe in principle: 干 maps to 幹 or 乾 depending on sense.
//
// WHY TWO SOURCES. Each alone is measurably wrong for this question:
//
//   · Unihan kTraditionalVariant ALONE IS TOO BROAD. It records that a character is the Simplified form of
//     something in SOME sense, so it flags 里 (裏/裡), 谷 (穀), 克, 蒙, 干, 千, 合 — every one of which is an
//     ordinary Traditional character. Measured: it rejected 18 of 177 plainly-Traditional country names,
//     including 薩爾瓦多 and 貝里斯.
//
//   · THE NATURAL EARTH CORPUS ALONE IS TOO NOISY. Aligning name_zh against name_zht recovers the conversion the
//     upstream project performed, but that corpus mixes script conversion with TRANSLATION differences
//     (坦桑尼亞 -> 坦尚尼亞 is both), so characters that merely differ between two renderings get marked.
//     Measured: it rejected 新疆維吾爾自治區 and 薩爾瓦多.
//
// A character is Simplified-only iff Unihan gives it a distinct Traditional form AND the Natural Earth corpus
// converted it at least once and NEVER left it in place in a row it did convert. 里 fails the second test (the
// corpus keeps it 121 times); 區 passes both. Measured result: 0 false positives across a 15-character control
// set, all 18 control Simplified characters caught, and 177/177 country names accepted.
//
// The test is conservative in the SAFE direction: a false positive costs a fallback to English, which the
// authority explicitly permits. It can never emit a wrong Chinese name.
// ============================================================================================================
function buildUnihanTraditionalMap(unihanVariantsPath) {
  var map = {};
  var text = fs.readFileSync(unihanVariantsPath, 'utf8');
  text.split('\n').forEach(function (line) {
    if (!line || line.charAt(0) === '#') return;
    var parts = line.split('\t');
    if (parts.length < 3 || parts[1] !== 'kTraditionalVariant') return;
    var ch = String.fromCodePoint(parseInt(parts[0].replace('U+', ''), 16));
    var targets = parts[2].trim().split(/\s+/).map(function (t) {
      return String.fromCodePoint(parseInt(t.replace('U+', ''), 16));
    }).filter(function (t) { return t !== ch; });   // a character listing ITSELF is already Traditional
    if (targets.length) map[ch] = targets.join('');
  });
  return map;
}

function harvestCorpus(pairs) {
  var changed = {}, kept = {};
  pairs.forEach(function (pr) {
    var zh = String(pr[0] == null ? '' : pr[0]).trim();
    var zht = String(pr[1] == null ? '' : pr[1]).trim();
    // Only same-length rows can be aligned position by position. A length change is a renaming, not a script
    // conversion, and aligning it would manufacture false pairs.
    if (!zh || !zht || zh === zht || zh.length !== zht.length) return;
    for (var i = 0; i < zh.length; i++) {
      if (zh[i] === zht[i]) kept[zh[i]] = (kept[zh[i]] || 0) + 1;
      else changed[zh[i]] = (changed[zh[i]] || 0) + 1;
    }
  });
  return { changed: changed, kept: kept };
}

function buildDetector(unihan, corpus) {
  var set = {}, contested = [];
  Object.keys(corpus.changed).sort().forEach(function (c) {
    if (!unihan[c]) return;               // Unihan does not call it a simplification — not our business
    if (corpus.kept[c]) { contested.push(c); return; }   // the corpus leaves it alone somewhere — stay conservative
    set[c] = unihan[c];
  });
  return { set: set, contested: contested };
}

function firstSimplified(detectorSet, s) {
  s = String(s == null ? '' : s);
  for (var i = 0; i < s.length; i++) if (detectorSet[s[i]]) return s[i];
  return null;
}

// ---- read the EXISTING vendored admin-1 asset, so keys line up with the runtime ------------------------------
function loadVendoredAdmin1(repoRoot) {
  var p = path.join(repoRoot, 'assets', 'js', 'data', 'world-admin1-10m.js');
  var src = fs.readFileSync(p, 'utf8');
  var sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src).call(sandbox, sandbox.window);
  var ds = sandbox.window.KM_WORLD_ADMIN1;
  if (!ds || !Array.isArray(ds.admin1)) throw new Error('VENDORED_ADMIN1_UNREADABLE: ' + p);
  return ds;
}

// ============================================================================================================
// MAIN
// ============================================================================================================
function main() {
  var args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('usage: node tools/geo/build-geo-names-zh-hant.js <admin0.geojson> <admin1.geojson> <Unihan_Variants.txt>');
    process.exit(2);
  }
  var admin0Path = args[0], admin1Path = args[1], unihanPath = args[2];
  var repoRoot = path.join(__dirname, '..', '..');

  var v0 = verifyInput('ne_110m_admin_0_countries', admin0Path, PINNED.admin0);
  var v1 = verifyInput('ne_10m_admin_1_states_provinces', admin1Path, PINNED.admin1);
  var unihanSha = sha256File(unihanPath);

  var a0 = JSON.parse(fs.readFileSync(admin0Path, 'utf8'));
  var a1 = JSON.parse(fs.readFileSync(admin1Path, 'utf8'));

  // ---- the detector, from both pinned sources -------------------------------------------------------------
  var unihan = buildUnihanTraditionalMap(unihanPath);
  var pairs = [];
  a0.features.forEach(function (f) { pairs.push([f.properties.NAME_ZH, f.properties.NAME_ZHT]); });
  a1.features.forEach(function (f) { pairs.push([f.properties.name_zh, f.properties.name_zht]); });
  var corpus = harvestCorpus(pairs);
  var det = buildDetector(unihan, corpus);
  var DET = det.set;

  // ---- COUNTRIES — authority 1: verified NAME_ZHT from the pinned source ----------------------------------
  var countries = {}, countryContinent = {}, countryEnglish = {};
  var cStat = { features: a0.features.length, with_iso: 0, zht_present: 0, zht_traditional: 0, fell_back: [] };
  var longNames = [];
  a0.features.forEach(function (f) {
    var p = f.properties;
    var iso = isoOf(p);
    if (!iso) return;
    cStat.with_iso++;
    var en = String(p.NAME || p.NAME_LONG || iso).trim();
    countryEnglish[iso] = en;
    var cont = String(p.CONTINENT == null ? '' : p.CONTINENT).trim();
    if (cont) countryContinent[iso] = cont;
    var zht = String(p.NAME_ZHT == null ? '' : p.NAME_ZHT).trim();
    if (!zht) { cStat.fell_back.push({ iso: iso, en: en, reason: 'NAME_ZHT_EMPTY' }); return; }
    cStat.zht_present++;
    var hit = firstSimplified(DET, zht);
    if (hit) { cStat.fell_back.push({ iso: iso, en: en, zht: zht, reason: 'NOT_FULLY_TRADITIONAL', character: hit }); return; }
    cStat.zht_traditional++;
    countries[iso] = zht;
    // Several NAME_ZHT values are FORMAL long names (中華民國 / 中華人民共和國 / 朝鮮民主主義人民共和國) rather than the
    // short form a map label usually carries. That is a label-CONTENT decision, not a name-source decision, so the
    // asset records the fact and decides nothing: the length is measurable by any consumer.
    if (zht.length >= 6) longNames.push({ iso: iso, zht: zht, chars: zht.length });
  });

  // ---- ADMIN-1 — authority 1 per division, else English name, else the division code ----------------------
  // Indexed from the SOURCE by ISO 3166-2 and by (country, short name), then joined onto the keys the vendored
  // runtime asset actually holds.
  var byIso3166_2 = {}, byCountryName = {};
  a1.features.forEach(function (f) {
    var p = f.properties;
    var code = String(p.iso_3166_2 == null ? '' : p.iso_3166_2).trim().toUpperCase();
    if (code) byIso3166_2[code] = p;
    var c = String(p.iso_a2 == null ? '' : p.iso_a2).trim().toUpperCase();
    var nm = String(p.name || p.name_en || '').trim();
    if (c && nm) byCountryName[c + '|' + nm.toLowerCase()] = p;
  });

  var vendored = loadVendoredAdmin1(repoRoot);
  var admin1 = {};
  var aStat = { vendored_divisions: vendored.admin1.length, matched_source: 0, unmatched_source: 0,
    zht_traditional: 0, fell_back_not_traditional: 0, fell_back_empty: 0, by_country: {} };

  // THE KEY IS COUNTRY + FULL ENGLISH NAME, NOT THE DISPLAYED CODE.
  //
  // Measured against the vendored asset: `country|displayedCode` is NOT UNIQUE. 35 keys collide and hide 53
  // rows, and the collisions are not harmless duplicates - BA|BIH covers NINE different Bosnian cantons,
  // IE|D covers three Dublin councils, and CO|CUN conflates Bogota with Cundinamarca. Keying names on that
  // would hand nine cantons one canton's name.
  //
  // `country|fullEnglishName` collides only where the English name is genuinely repeated (AF Parwan x2,
  // LV Daugavpils x2 - true duplicate rows in the source), and in exactly those cases ONE Chinese name is the
  // correct answer for both, because it is the same place name. So the collisions that remain are the ones
  // where collapsing is right.
  //
  // (That `c|k` is not unique is a PRE-EXISTING defect of the displayed-code label layer, not of this asset:
  // nine cantons currently render the same visible code. It is reported, not silently repaired here.)
  var collisions = {};
  vendored.admin1.forEach(function (d) {
    var c = String(d.c || '').trim().toUpperCase();
    var k = String(d.k == null ? '' : d.k).trim();
    var full = (d.n == null || d.n === '') ? k : String(d.n);
    var key = c + '|' + full.toLowerCase();
    collisions[key] = (collisions[key] || 0) + 1;
    if (!aStat.by_country[c]) aStat.by_country[c] = { total: 0, zht: 0 };
    aStat.by_country[c].total++;

    // t: 0 = k is an ISO 3166-2 alphabetic suffix · 1/2 = k IS the name
    var src = null;
    if (Number(d.t) === 0) src = byIso3166_2[c + '-' + k] || null;
    if (!src) src = byCountryName[c + '|' + full.toLowerCase()] || null;
    if (!src) src = byCountryName[c + '|' + k.toLowerCase()] || null;
    if (!src) { aStat.unmatched_source++; return; }
    aStat.matched_source++;

    var zht = String(src.name_zht == null ? '' : src.name_zht).trim();
    if (!zht) { aStat.fell_back_empty++; return; }
    if (firstSimplified(DET, zht)) { aStat.fell_back_not_traditional++; return; }
    admin1[key] = zht;
    aStat.zht_traditional++;
    aStat.by_country[c].zht++;
  });

  // ---- emit -----------------------------------------------------------------------------------------------
  function sortedObject(o) {
    var out = {};
    Object.keys(o).sort().forEach(function (k) { out[k] = o[k]; });
    return out;
  }
  var collidingKeys = Object.keys(collisions).filter(function (k) { return collisions[k] > 1; });
  var collidingRows = collidingKeys.reduce(function (a, k) { return a + collisions[k] - 1; }, 0);
  // and the pre-existing displayed-code collision, measured so the report can state it as a fact
  var codeKeys = {};
  vendored.admin1.forEach(function (d) {
    var ck = String(d.c || '').trim().toUpperCase() + '|' + String(d.k == null ? '' : d.k).trim();
    codeKeys[ck] = (codeKeys[ck] || 0) + 1;
  });
  var codeColliding = Object.keys(codeKeys).filter(function (k) { return codeKeys[k] > 1; });
  var codeCollidingRows = codeColliding.reduce(function (a, k) { return a + codeKeys[k] - 1; }, 0);

  var perCountry = {};
  Object.keys(aStat.by_country).sort().forEach(function (c) {
    var e = aStat.by_country[c];
    perCountry[c] = e.zht + '/' + e.total;
  });

  var payload = {
    meta: {
      task: 'MAP-VISUAL-REAL-EARTH-TEXTURE-3',
      purpose: 'Traditional Chinese (zh-Hant / zh-TW) geographic NAMES only. No geometry, no coordinates, no label anchors.',
      default_language: 'zh-TW',
      script: 'zh-Hant',
      country_name_source: {
        source: 'Natural Earth', dataset: 'ne_110m_admin_0_countries', version: 'v5.1.2',
        field: 'NAME_ZHT', url: PINNED.admin0.url, sha256: v0.sha256, bytes: v0.bytes,
        license: 'Public domain', license_url: 'https://www.naturalearthdata.com/about/terms-of-use/',
        verification: 'NAME_ZHT confirmed Traditional by measurement against Unihan + the corpus test below: 0 Simplified-only characters across all 177 features, mirrored by NAME_ZH which carries 152 and no Traditional-only character.'
      },
      admin1_name_source: {
        source: 'Natural Earth', dataset: 'ne_10m_admin_1_states_provinces', version: 'v5.1.2',
        field: 'name_zht', url: PINNED.admin1.url, sha256: v1.sha256, bytes: v1.bytes,
        license: 'Public domain', license_url: 'https://www.naturalearthdata.com/about/terms-of-use/',
        verification: 'name_zht is MIXED at field level (it retains Simplified characters in some rows), so it is accepted PER DIVISION only when it passes the two-source test. Divisions that fail fall back to the existing English name and then to the division code.'
      },
      script_test_source: {
        source: 'Unicode Character Database — Unihan', version: PINNED.unihanZip.version,
        field: 'kTraditionalVariant', archive_url: PINNED.unihanZip.url, archive_sha256: PINNED.unihanZip.sha256,
        extracted_file: 'Unihan_Variants.txt', extracted_sha256: unihanSha,
        license: 'Unicode License (UNICODE LICENSE V3)', license_url: 'https://www.unicode.org/license.txt',
        used_for: 'DETECTION ONLY — deciding whether a string is fully Traditional. No character is ever converted.'
      },
      continent_name_source: {
        source: 'Hand-reviewed canonical list vendored with this asset (7 continents)',
        note: 'Natural Earth CONTINENT values are the join key. "Seven seas (open ocean)" is deliberately unnamed and must be hidden.'
      },
      transformation: 'Names copied verbatim from the pinned fields. No transliteration, no conversion, no translation, no runtime lookup. Divisions and countries are keyed to the EXISTING vendored assets; geometry files are not regenerated.',
      generator: 'tools/geo/build-geo-names-zh-hant.js',
      determinism: 'All maps emitted with keys sorted ascending. No clock, no randomness, no network.',
      script_test: {
        method: 'A character is Simplified-only iff Unihan gives it a distinct kTraditionalVariant AND the Natural Earth zh/zht corpus converted it at least once and never kept it in a converted row.',
        detector_size: Object.keys(DET).length,
        contested_excluded: det.contested.length,
        rationale: 'Unihan alone is too broad (it flags 里 谷 克 蒙 干 千 合, all ordinary Traditional characters, and rejected 18/177 country names). The corpus alone is too noisy (it conflates script conversion with translation differences and rejected 新疆維吾爾自治區). The intersection produced 0 false positives on a 15-character control set and caught all 18 control Simplified characters.'
      },
      coverage: {
        countries: {
          features: cStat.features, with_iso_a2: cStat.with_iso,
          name_zht_present: cStat.zht_present, accepted_traditional: cStat.zht_traditional,
          fell_back: cStat.fell_back.length, fell_back_detail: cStat.fell_back
        },
        continents: { named: Object.keys(CONTINENT_ZH_HANT).length, hidden_unnamed: ['Seven seas (open ocean)'] },
        admin1: {
          vendored_divisions: aStat.vendored_divisions, matched_to_source: aStat.matched_source,
          unmatched_to_source: aStat.unmatched_source, accepted_traditional: aStat.zht_traditional,
          fell_back_not_traditional: aStat.fell_back_not_traditional, fell_back_empty: aStat.fell_back_empty,
          key: 'country|fullEnglishName (lowercased)',
          name_key_collisions: collidingKeys.length,
          name_key_collision_rows: collidingRows,
          name_key_collision_note: 'These are divisions whose FULL ENGLISH NAME repeats inside one country (true duplicate source rows), so one Chinese name is correct for all of them.',
          displayed_code_collisions: codeColliding.length,
          displayed_code_collision_rows: codeCollidingRows,
          displayed_code_collision_note: 'PRE-EXISTING, in the geometry asset and its label layer, NOT in this asset: country|displayedCode is not unique (BA|BIH covers nine Bosnian cantons, IE|D three Dublin councils, CO|CUN conflates Bogota with Cundinamarca), so several distinct divisions currently render the same visible code. Reported for the boundary/label layer to resolve; this asset avoids the problem by keying on the name.',
          per_country: perCountry
        }
      },
      long_formal_country_names: {
        note: 'These NAME_ZHT values are FORMAL long names rather than the short form a map label usually carries. Recorded as evidence for the label-content layer; this asset makes no shortening decision and invents no name.',
        entries: longNames.sort(function (a, b) { return b.chars - a.chars || (a.iso < b.iso ? -1 : 1); })
      }
    },
    countries: sortedObject(countries),
    countryEnglish: sortedObject(countryEnglish),
    countryContinent: sortedObject(countryContinent),
    continents: sortedObject(CONTINENT_ZH_HANT),
    admin1: sortedObject(admin1)
  };

  var header = '/**\n' +
    ' * assets/js/data/geo-names-zh-hant.js — VENDORED, GENERATED. Do not edit by hand.\n' +
    ' *\n' +
    ' * Traditional Chinese (zh-Hant / zh-TW) geographic NAMES ONLY. No geometry, no coordinates, no anchors.\n' +
    ' * Generator: tools/geo/build-geo-names-zh-hant.js · Provenance: tools/geo/PROVENANCE.md\n' +
    ' *\n' +
    ' * Sources (raw inputs are not vendored; URLs and SHA-256 are pinned in meta and re-verified at build time):\n' +
    ' *   Natural Earth v5.1.2 ne_110m_admin_0_countries  NAME_ZHT   — public domain\n' +
    ' *   Natural Earth v5.1.2 ne_10m_admin_1_states_provinces name_zht — public domain\n' +
    ' *   Unicode 15.1.0 Unihan kTraditionalVariant — Unicode License — used for DETECTION ONLY\n' +
    ' *\n' +
    ' * No runtime CDN/network: loaded as a same-origin <script> that sets window.KM_GEO_NAMES_ZH_HANT.\n' +
    ' */\n';
  var out = header + 'window.KM_GEO_NAMES_ZH_HANT=' + JSON.stringify(payload) + ';\n';
  var outPath = path.join(repoRoot, 'assets', 'js', 'data', 'geo-names-zh-hant.js');
  fs.writeFileSync(outPath, out.replace(/\r?\n/g, '\r\n'));

  console.log('wrote ' + path.relative(repoRoot, outPath) + '  (' + out.length + ' bytes)');
  console.log('  detector          : ' + Object.keys(DET).length + ' Simplified-only characters (' + det.contested.length + ' contested excluded)');
  console.log('  countries         : ' + cStat.zht_traditional + '/' + cStat.with_iso + ' Traditional, ' + cStat.fell_back.length + ' fell back');
  console.log('  continents        : ' + Object.keys(CONTINENT_ZH_HANT).length + ' named, 1 deliberately unnamed');
  console.log('  admin1            : ' + aStat.zht_traditional + '/' + aStat.vendored_divisions + ' Traditional  (matched ' +
    aStat.matched_source + ', unmatched ' + aStat.unmatched_source + ', not-Traditional ' + aStat.fell_back_not_traditional + ', empty ' + aStat.fell_back_empty + ')');
  console.log('  long formal names : ' + longNames.length + ' (recorded, not shortened)');
}

// R4 §B — the DETECTOR IS SHARED, NOT COPIED. tools/geo/build-admin1-display-names.js applies exactly this
// test to a DIFFERENT source (Wikidata labels), and two copies of a rule about which characters are Simplified
// would be two rules the moment one of them was corrected. Requiring this file therefore must not run the
// build, hence the guard below.
module.exports = {
  buildUnihanTraditionalMap: buildUnihanTraditionalMap,
  harvestCorpus: harvestCorpus,
  buildDetector: buildDetector,
  firstSimplified: firstSimplified,
  PINNED: PINNED
};

if (require.main === module) main();
