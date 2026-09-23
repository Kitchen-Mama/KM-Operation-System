// Kitchen Mama Operation System — SKU REGIONAL DETAILS · SITE PRICING (PRICING-R2)
// =========================================================================================================
// THE PRIMARY SITE-PRICE UI. SKU Details owns the MASTER baseline (sku_details.minimum_price / msrp /
// selling_price / base_currency) and keeps it; what a product actually costs on one marketplace lives in
// pricing_list, one row per marketplace_sku_id, and this is where a person reads and changes it.
//
// WHAT THIS MODULE IS FOR, and it is one idea: a price has an OWNER, and the owner is per FIELD.
//
//   AUTO    the system maintains it. It equals the converted base price and the next FX run may refresh it.
//   MANUAL  a person maintains it. FX must leave it alone.
//   —       NOBODY HAS SAID. Shown as "Not set", never as AUTO.
//
// The third state is not a rendering nicety. Every pricing_list row in the business currently has blank
// ownership flags, because the columns did not exist before this round. Painting those as AUTO would tell
// an operator that the whole price book is system-maintained and safe to refresh, which is exactly the
// claim nobody has made. So the badge says what the data says, and the census below counts the gap.
//
// THE EFFECTIVE PRICE IS STILL THE EFFECTIVE PRICE. regular_price / minimum_price / msrp remain what every
// consumer reads. This screen shows the auto value NEXT TO it so a person can see whether they diverge —
// it never resolves one from the other, and no consumer gains a fallback.
//
// WHAT IS DELIBERATELY NOT HERE: no FX rates are fetched, no conversion is performed, no auto_* value is
// computed, and nothing is classified in bulk. The only writes this module can cause go through
// KM.DB.updatePricing → the one canonical action, which validates every line before writing any of them.
// =========================================================================================================

(function (global) {
    'use strict';

    var SRP = {};

    // The three price fields. Every loop reads the correspondence from here, so a fourth field is one row.
    SRP.FIELDS = [
        { key: 'regular_price', cc: 'regularPrice', auto: 'autoRegularPrice', autoKey: 'auto_regular_price', flag: 'regularPriceIsManual', mode: 'regular_price_mode', label: 'Regular Price' },
        { key: 'minimum_price', cc: 'minimumPrice', auto: 'autoMinimumPrice', autoKey: 'auto_minimum_price', flag: 'minimumPriceIsManual', mode: 'minimum_price_mode', label: 'Minimum Price' },
        { key: 'msrp', cc: 'msrp', auto: 'autoMsrp', autoKey: 'auto_msrp', flag: 'msrpIsManual', mode: 'msrp_mode', label: 'MSRP' }
    ];

    SRP.MODES = ['NO_CHANGE', 'MANUAL', 'AUTO'];
    SRP.OWNER_MANUAL = 'MANUAL';
    SRP.OWNER_AUTO = 'AUTO';
    SRP.OWNER_UNKNOWN = 'UNKNOWN';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    SRP.esc = esc;

    // ---- reading -----------------------------------------------------------------------------------------

    /** A stored number, or null. Blank is not zero, NA is not zero, and a typo is not a price. */
    function num(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return isFinite(v) ? v : null;
        var s = String(v).trim();
        if (s === '') return null;
        if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return null;
        var n = Number(s);
        return isFinite(n) ? n : null;
    }
    SRP.num = num;

    /** Three-state ownership. Blank is UNKNOWN. This is the whole point of the round. */
    function owner(v) {
        if (v === true) return SRP.OWNER_MANUAL;
        if (v === false) return SRP.OWNER_AUTO;
        var s = String(v == null ? '' : v).trim().toUpperCase();
        if (s === '') return SRP.OWNER_UNKNOWN;
        if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'MANUAL') return SRP.OWNER_MANUAL;
        if (s === 'FALSE' || s === '0' || s === 'NO' || s === 'N' || s === 'AUTO') return SRP.OWNER_AUTO;
        return SRP.OWNER_UNKNOWN;
    }
    SRP.owner = owner;

    /** The ownership of one field of one normalized pricing row. */
    SRP.ownerOf = function (row, spec) {
        if (!row) return SRP.OWNER_UNKNOWN;
        var v = row[spec.flag];
        if (v === undefined && row.raw) v = row.raw[spec.key + '_is_manual'];
        return owner(v);
    };

    /** Everything the panel and the editor need about one field, with nothing resolved or substituted. */
    SRP.fieldView = function (row, spec) {
        var raw = (row && row.raw) || {};
        var effective = num(row ? row[spec.cc] : null);
        if (effective === null) effective = num(raw[spec.key]);
        var auto = num(row ? row[spec.auto] : null);
        if (auto === null) auto = num(raw[spec.autoKey]);
        return {
            key: spec.key, label: spec.label,
            effective: effective, auto: auto,
            effectiveIsNa: /^(NA|N\/A)$/i.test(String(raw[spec.key] == null ? '' : raw[spec.key]).trim()),
            owner: SRP.ownerOf(row, spec),
            // A divergence is a FACT, not a verdict. It says the two numbers differ; it does not say which
            // is right, and it must never be read as evidence that someone set the price by hand — an auto
            // value refreshed after the effective one was last written diverges in exactly the same way.
            diverges: effective !== null && auto !== null && effective !== auto
        };
    };

    /** Index the page's pricing rows by the only identity a pricing row has. */
    SRP.indexByMarketplaceSkuId = function (rows) {
        var ix = {};
        (rows || []).forEach(function (r) {
            var k = String((r && (r.marketplaceSkuId || (r.raw && r.raw.marketplace_sku_id))) || '').trim();
            if (k && !ix[k]) ix[k] = r;
        });
        return ix;
    };

    /**
     * The pricing row for one regional record. Regional details are keyed by sku+company+country+marketplace
     * and pricing_list is keyed by marketplace_sku_id, so the marketplace_skus row is the bridge — and it
     * must match on ALL FOUR parts. pricing_list carries no `company`, so two companies on one
     * country|marketplace|sku are distinguishable only through that id; joining on the three parts
     * pricing_list does carry would silently return the other company's price.
     */
    SRP.resolveFor = function (regionalRow, marketplaceSkus, pricingRows) {
        var lc = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
        var matches = (marketplaceSkus || []).filter(function (m) {
            return lc(m.sku) === lc(regionalRow.sku) && lc(m.company) === lc(regionalRow.company) &&
                lc(m.country) === lc(regionalRow.country) && lc(m.marketplace) === lc(regionalRow.marketplace);
        });
        if (matches.length === 0) return { state: 'NO_MARKETPLACE_SKU', row: null, marketplaceSkuId: '' };
        // Never a first-row fallback: an ambiguous link is reported, exactly as the status join reports it.
        if (matches.length > 1) return { state: 'AMBIGUOUS_MARKETPLACE_SKU', row: null, marketplaceSkuId: '' };
        var msid = String(matches[0].marketplaceSkuId || '').trim();
        if (!msid) return { state: 'NO_MARKETPLACE_SKU_ID', row: null, marketplaceSkuId: '' };
        var ix = SRP.indexByMarketplaceSkuId(pricingRows);
        var row = ix[msid] || null;
        return { state: row ? 'OK' : 'NO_PRICING_ROW', row: row, marketplaceSkuId: msid };
    };

    // ---- §10 CENSUS — counting only. It classifies nothing and writes nothing. ---------------------------

    /**
     * What the data can actually prove about one field.
     *
     *   MANUAL_PROVABLE  the flag says so. Nothing else is accepted, because nothing else IS proof.
     *   AUTO_PROVABLE    the flag says so, OR the effective value already equals auto — in which case
     *                    declaring the system owner changes no money at all, which is the only sense in
     *                    which "auto" is provable without asking a person.
     *   AMBIGUOUS        everything else, and it stays that way until a person decides.
     *
     * A price that DIFFERS from auto is deliberately not counted as manual. Divergence is equally well
     * explained by an auto value refreshed after the effective one was last written, and guessing in that
     * direction would latch the guess into the schema — where the next FX run would honour it forever.
     */
    SRP.censusField = function (row, spec) {
        var o = SRP.ownerOf(row, spec);
        if (o === SRP.OWNER_MANUAL) return 'MANUAL_PROVABLE';
        if (o === SRP.OWNER_AUTO) return 'AUTO_PROVABLE';
        var v = SRP.fieldView(row, spec);
        if (v.effective !== null && v.auto !== null && v.effective === v.auto) return 'AUTO_PROVABLE';
        return 'AMBIGUOUS';
    };

    /** Row-level and field-level counts. A row is provable only when all three of its fields are. */
    SRP.census = function (rows) {
        var c = { total_rows: 0, auto_provable_rows: 0, manual_provable_rows: 0, ambiguous_rows: 0,
            fields: { auto_provable: 0, manual_provable: 0, ambiguous: 0 }, by_field: {} };
        SRP.FIELDS.forEach(function (s) { c.by_field[s.key] = { auto_provable: 0, manual_provable: 0, ambiguous: 0 }; });
        (rows || []).forEach(function (row) {
            c.total_rows++;
            var v = SRP.FIELDS.map(function (spec) {
                var r = SRP.censusField(row, spec);
                if (r === 'AUTO_PROVABLE') { c.fields.auto_provable++; c.by_field[spec.key].auto_provable++; }
                else if (r === 'MANUAL_PROVABLE') { c.fields.manual_provable++; c.by_field[spec.key].manual_provable++; }
                else { c.fields.ambiguous++; c.by_field[spec.key].ambiguous++; }
                return r;
            });
            if (v.indexOf('AMBIGUOUS') !== -1) c.ambiguous_rows++;
            else if (v.indexOf('MANUAL_PROVABLE') !== -1) c.manual_provable_rows++;
            else c.auto_provable_rows++;
        });
        return c;
    };

    // ---- display -----------------------------------------------------------------------------------------

    function money(n, currency) {
        if (n === null || n === undefined) return '';
        return String(n) + (currency ? ' ' + currency : '');
    }
    SRP.money = money;

    var OWNER_LABEL = {};
    OWNER_LABEL[SRP.OWNER_MANUAL] = 'Manual';
    OWNER_LABEL[SRP.OWNER_AUTO] = 'Auto';
    OWNER_LABEL[SRP.OWNER_UNKNOWN] = 'Not set';
    SRP.ownerLabel = function (o) { return OWNER_LABEL[o] || 'Not set'; };

    /** The read-only pricing block for the Marketplace section. */
    SRP.sectionHtml = function (resolved) {
        if (!resolved || resolved.state !== 'OK') {
            var why = {
                NO_MARKETPLACE_SKU: 'This SKU has no <code>marketplace_skus</code> row for this company / country / marketplace, so it is not listed on this site and has no site price.',
                AMBIGUOUS_MARKETPLACE_SKU: 'Multiple <code>marketplace_skus</code> rows match this identity. The price is not shown, because picking one of them would be a guess about which site this is. Resolve the duplicate linkage.',
                NO_MARKETPLACE_SKU_ID: 'The matching <code>marketplace_skus</code> row carries no <code>marketplace_sku_id</code>, which is the only identity a pricing row has.',
                NO_PRICING_ROW: 'No <code>pricing_list</code> row exists for this site SKU yet. Pricing rows are created with the marketplace SKU; this screen never creates one.'
            }[(resolved && resolved.state) || 'NO_PRICING_ROW'];
            return '<div class="srd-secnote">' + why + '</div>';
        }
        var row = resolved.row;
        var raw = row.raw || {};
        var currency = String(row.currency || raw.currency || '').trim();
        var fxRate = num(row.fxRate !== undefined ? row.fxRate : raw.fx_rate);
        var fxDate = String(row.fxRateDate || raw.fx_rate_date || '').trim();

        var rows = SRP.FIELDS.map(function (spec) {
            var v = SRP.fieldView(row, spec);
            var badge = '<span class="srd-own srd-own--' + v.owner.toLowerCase() + '">' + esc(SRP.ownerLabel(v.owner)) + '</span>';
            var eff = v.effectiveIsNa ? '<em>NA</em>' : (v.effective === null ? '<em>Not set</em>' : esc(money(v.effective, currency)));
            var auto = v.auto === null ? '<em>Not set</em>' : esc(money(v.auto, currency));
            var note = v.diverges
                ? '<div class="srd-pr__note">Effective differs from Auto. That is a fact about the two numbers, not a claim about who set either.</div>' : '';
            return '<div class="srd-pr__row"><div class="srd-pr__lbl">' + esc(spec.label) + ' ' + badge + '</div>' +
                '<div class="srd-pr__val"><span class="srd-pr__eff">' + eff + '</span>' +
                '<span class="srd-pr__auto">Auto ' + auto + '</span></div>' + note + '</div>';
        }).join('');

        var head = '<div class="srd-pr__head">' +
            '<span>Currency <strong>' + (currency ? esc(currency) : '<em>not set</em>') + '</strong></span>' +
            '<span>FX Rate <strong>' + (fxRate === null ? '<em>not set</em>' : esc(String(fxRate))) + '</strong></span>' +
            '<span>FX Date <strong>' + (fxDate ? esc(fxDate) : '<em>not set</em>') + '</strong></span>' +
            '</div>';

        var anyUnknown = SRP.FIELDS.some(function (s) { return SRP.ownerOf(row, s) === SRP.OWNER_UNKNOWN; });
        var unknownNote = anyUnknown
            ? '<div class="srd-secnote">A field marked <strong>Not set</strong> has no recorded owner. It is not the same as Auto, and no FX refresh will touch it until someone says which it is.</div>'
            : '';

        return '<div class="srd-pricing">' + head + rows + '</div>' + unknownNote +
            '<div class="srd-secnote">Site pricing is owned by <code>pricing_list</code>, one row per <code>marketplace_sku_id</code>. Master baseline prices stay on the Master SKU.</div>';
    };

    // ---- the editor --------------------------------------------------------------------------------------

    /** Per-field USE AUTO / MANUAL controls. Every field is independent — changing one marks only itself. */
    SRP.editorHtml = function (row) {
        var raw = (row && row.raw) || {};
        var currency = String((row && row.currency) || raw.currency || '').trim();
        return '<div class="srd-pe">' +
            '<div class="srd-pe__ctx">Site price · <strong>' + esc(currency || 'no currency') + '</strong>' +
            ' · <code>' + esc(String((row && row.marketplaceSkuId) || raw.marketplace_sku_id || '')) + '</code></div>' +
            SRP.FIELDS.map(function (spec) {
                var v = SRP.fieldView(row, spec);
                var id = 'srd-p-' + spec.key;
                var autoTxt = v.auto === null ? 'no auto value yet' : money(v.auto, currency);
                return '<div class="srd-pe__row">' +
                    '<label class="srd-pe__lbl">' + esc(spec.label) +
                        '<span class="srd-own srd-own--' + v.owner.toLowerCase() + '">' + esc(SRP.ownerLabel(v.owner)) + '</span></label>' +
                    '<select id="' + id + '-mode" onchange="srdPriceModeChanged(\'' + spec.key + '\')">' +
                        '<option value="NO_CHANGE" selected>Leave unchanged</option>' +
                        '<option value="AUTO">Use Auto (' + esc(autoTxt) + ')</option>' +
                        '<option value="MANUAL">Manual</option>' +
                    '</select>' +
                    '<input id="' + id + '-value" type="text" inputmode="decimal" disabled placeholder="' +
                        (v.effective === null ? 'enter a price' : esc(String(v.effective))) + '" value="">' +
                    '</div>';
            }).join('') +
            '<p class="srd-modal__hint">Each price is owned separately: setting <strong>Regular</strong> to Manual does not change who owns <strong>Minimum</strong> or <strong>MSRP</strong>. ' +
            '<strong>Use Auto</strong> hands the field back to the system and restores it from the stored auto value — it is refused when there is no auto value to restore, because writing 0 there would be a price.</p>' +
            '</div>';
    };

    /**
     * Read the editor into ONE payload line. `get(id)` returns a control's value. A field left on
     * "Leave unchanged" contributes NO_CHANGE and no value at all, so an untouched field cannot be
     * rewritten by a save that was about a different field.
     */
    SRP.collectLine = function (marketplaceSkuId, currency, get) {
        var line = { marketplace_sku_id: String(marketplaceSkuId || '').trim() };
        if (currency) line.currency = String(currency).trim();
        SRP.FIELDS.forEach(function (spec) {
            var mode = String(get('srd-p-' + spec.key + '-mode') || 'NO_CHANGE').trim().toUpperCase();
            if (SRP.MODES.indexOf(mode) === -1) mode = 'NO_CHANGE';
            line[spec.mode] = mode;
            if (mode === 'MANUAL') line[spec.key] = String(get('srd-p-' + spec.key + '-value') || '').trim();
        });
        return line;
    };

    /** True when at least one field asks for something. A save with nothing to do is refused by the page. */
    SRP.lineTouches = function (line) {
        return SRP.FIELDS.some(function (spec) {
            var m = String((line && line[spec.mode]) || 'NO_CHANGE').toUpperCase();
            return m === 'MANUAL' || m === 'AUTO';
        });
    };

    // ---- the template ------------------------------------------------------------------------------------
    //
    // Human-readable context FIRST so the file is legible in a spreadsheet, then the canonical identity, then
    // one mode + one value per price. The identity column is marketplace_sku_id and the import reads ONLY
    // that: master_sku / site_sku / company / country / marketplace are there so a person can see which row
    // they are editing, and are never used to find it.

    SRP.TEMPLATE_COLUMNS = [
        'marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace', 'currency',
        'regular_price_mode', 'regular_price',
        'minimum_price_mode', 'minimum_price',
        'msrp_mode', 'msrp'
    ];

    SRP.CURRENT_PRICING_COLUMNS = [
        'marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country', 'marketplace', 'currency',
        'regular_price', 'regular_price_owner', 'auto_regular_price',
        'minimum_price', 'minimum_price_owner', 'auto_minimum_price',
        'msrp', 'msrp_owner', 'auto_msrp',
        'fx_rate', 'fx_rate_date'
    ];

    function csvCell(v) {
        var s = String(v == null ? '' : v);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    SRP.toCsv = function (columns, rows) {
        return [columns.join(',')].concat((rows || []).map(function (r) {
            return columns.map(function (c) { return csvCell(r[c]); }).join(',');
        })).join('\r\n');
    };

    /** Context for one pricing row, taken from the marketplace_skus row that owns the identity. */
    function ctxOf(pricingRow, mktIndex) {
        var raw = pricingRow.raw || {};
        var msid = String(pricingRow.marketplaceSkuId || raw.marketplace_sku_id || '').trim();
        var m = mktIndex[msid] || {};
        return {
            marketplace_sku_id: msid,
            master_sku: pricingRow.sku || raw.sku || m.sku || '',
            site_sku: pricingRow.siteSku || raw.site_sku || m.siteSku || '',
            company: m.company || '',
            country: pricingRow.country || raw.country || m.country || '',
            marketplace: pricingRow.marketplace || raw.marketplace || m.marketplace || '',
            currency: pricingRow.currency || raw.currency || ''
        };
    }

    function indexMkt(marketplaceSkus) {
        var ix = {};
        (marketplaceSkus || []).forEach(function (m) {
            var k = String(m.marketplaceSkuId || '').trim();
            if (k && !ix[k]) ix[k] = m;
        });
        return ix;
    }

    /**
     * The UPDATE template. Every mode column ships as NO_CHANGE, so a downloaded-and-re-uploaded file with
     * no edits changes nothing at all. That is the property that makes the round trip safe to experiment
     * with, and it is the reason the modes are written out rather than left blank.
     */
    SRP.buildTemplateCsv = function (pricingRows, marketplaceSkus) {
        var mix = indexMkt(marketplaceSkus);
        var rows = (pricingRows || []).map(function (p) {
            var c = ctxOf(p, mix);
            c.regular_price_mode = 'NO_CHANGE'; c.regular_price = '';
            c.minimum_price_mode = 'NO_CHANGE'; c.minimum_price = '';
            c.msrp_mode = 'NO_CHANGE'; c.msrp = '';
            return c;
        });
        return SRP.toCsv(SRP.TEMPLATE_COLUMNS, rows);
    };

    /** The CURRENT prices, for reading rather than for uploading. Ownership is spelled out per field. */
    SRP.buildCurrentCsv = function (pricingRows, marketplaceSkus) {
        var mix = indexMkt(marketplaceSkus);
        var rows = (pricingRows || []).map(function (p) {
            var c = ctxOf(p, mix);
            SRP.FIELDS.forEach(function (spec) {
                var v = SRP.fieldView(p, spec);
                c[spec.key] = v.effectiveIsNa ? 'NA' : (v.effective === null ? '' : v.effective);
                c[spec.key + '_owner'] = SRP.ownerLabel(v.owner).toUpperCase().replace(' ', '_');
                c[spec.autoKey] = v.auto === null ? '' : v.auto;
            });
            var raw = p.raw || {};
            var fx = num(p.fxRate !== undefined ? p.fxRate : raw.fx_rate);
            c.fx_rate = fx === null ? '' : fx;
            c.fx_rate_date = String(p.fxRateDate || raw.fx_rate_date || '').trim();
            return c;
        });
        return SRP.toCsv(SRP.CURRENT_PRICING_COLUMNS, rows);
    };

    /** A small, strict CSV reader: quoted fields, doubled quotes, CR/LF or LF rows. */
    SRP.parseCsv = function (text) {
        var s = String(text == null ? '' : text).replace(/^﻿/, '');
        var rows = [], row = [], cell = '', q = false, i = 0;
        for (; i < s.length; i++) {
            var ch = s[i];
            if (q) {
                if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
                else cell += ch;
            } else if (ch === '"') q = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else if (ch === '\r') { /* handled by the \n that follows */ }
            else cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    };

    /**
     * FILE-shaped validation only, and that boundary is deliberate. This checks what can be known from the
     * file itself — required columns, a duplicate identity inside it, a mode that is not a mode, a MANUAL
     * with no number. It does NOT decide whether an id exists, whether a currency agrees, or whether AUTO
     * has anything to restore: those are facts about the DATABASE, and the server answers them on the
     * dry run. Answering them twice would make this a second pricing authority that drifts.
     */
    SRP.validateFile = function (text) {
        var out = { ok: true, errors: [], lines: [], rowCount: 0 };
        var grid = SRP.parseCsv(text);
        if (!grid.length) {
            out.ok = false;
            out.errors.push({ line: 0, code: 'EMPTY_FILE', detail: 'The file has no rows.' });
            return out;
        }
        var headers = grid[0].map(function (h) { return String(h).trim().toLowerCase(); });
        var required = ['marketplace_sku_id'].concat(SRP.FIELDS.map(function (s) { return s.mode; }));
        var missing = required.filter(function (r) { return headers.indexOf(r) === -1; });
        if (missing.length) {
            out.ok = false;
            out.errors.push({ line: 1, code: 'MISSING_REQUIRED_COLUMNS', detail: 'The file is missing: ' + missing.join(', ') + '. Download the template and edit that.' });
            return out;
        }
        var col = function (r, name) { var i = headers.indexOf(name); return i === -1 ? '' : String(r[i] == null ? '' : r[i]).trim(); };
        var seen = {};
        for (var i = 1; i < grid.length; i++) {
            var r = grid[i], lineNo = i + 1;
            out.rowCount++;
            var id = col(r, 'marketplace_sku_id');
            if (!id) {
                out.ok = false;
                out.errors.push({ line: lineNo, code: 'IDENTITY_MISSING', detail: 'marketplace_sku_id is blank. A pricing row is never addressed by master SKU alone.' });
                continue;
            }
            if (seen[id]) {
                out.ok = false;
                out.errors.push({ line: lineNo, code: 'DUPLICATE_IDENTITY', detail: id + ' is already on line ' + seen[id] + '. Two rows for one identity cannot both be the final answer.' });
                continue;
            }
            seen[id] = lineNo;
            var line = { marketplace_sku_id: id };
            var cur = col(r, 'currency');
            if (cur) line.currency = cur;
            var bad = false;
            SRP.FIELDS.forEach(function (spec) {
                var modeRaw = col(r, spec.mode);
                // §8 — a BLANK cell is NO_CHANGE. It is never a deletion and never AUTO.
                var mode = modeRaw === '' ? 'NO_CHANGE' : modeRaw.toUpperCase().replace(/[\s-]+/g, '_');
                if (SRP.MODES.indexOf(mode) === -1) {
                    out.ok = false; bad = true;
                    out.errors.push({ line: lineNo, code: 'MODE_UNSUPPORTED', field: spec.key,
                        detail: JSON.stringify(modeRaw) + ' is not one of ' + SRP.MODES.join(' / ') + '.' });
                    return;
                }
                line[spec.mode] = mode;
                var val = col(r, spec.key);
                if (mode === 'MANUAL') {
                    if (val === '') {
                        out.ok = false; bad = true;
                        out.errors.push({ line: lineNo, code: 'MANUAL_PRICE_REQUIRED', field: spec.key,
                            detail: 'MANUAL with a blank price. Blank is not zero.' });
                        return;
                    }
                    if (num(val) === null) {
                        out.ok = false; bad = true;
                        out.errors.push({ line: lineNo, code: 'PRICE_NOT_NUMERIC', field: spec.key,
                            detail: JSON.stringify(val) + ' is not a number.' });
                        return;
                    }
                    if (num(val) < 0) {
                        out.ok = false; bad = true;
                        out.errors.push({ line: lineNo, code: 'PRICE_NEGATIVE', field: spec.key, detail: 'A price may not be negative.' });
                        return;
                    }
                    line[spec.key] = val;
                }
                // AUTO deliberately drops any supplied value (§8): a file carrying both a price and AUTO
                // must not smuggle the price in through the back door.
            });
            if (!bad) out.lines.push(line);
        }
        if (!out.ok) out.lines = [];   // §9 — nothing is offered for writing until the whole file passes
        return out;
    };

    global.KM = global.KM || {};
    global.KM.SkuRegionalPricing = SRP;
    if (typeof module !== 'undefined' && module.exports) module.exports = SRP;

})(typeof window !== 'undefined' ? window : this);
