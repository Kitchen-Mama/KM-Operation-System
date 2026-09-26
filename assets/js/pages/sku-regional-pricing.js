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
// PRICING-R4G — THESE THREE COLUMNS ARE USER OVERRIDES NOW. regular_price / minimum_price / msrp hold what
// a PERSON typed, and blank means no override exists. What the site charges is the RESOLVED price: the
// override when there is one, otherwise auto_*, otherwise Not Set. This screen is the one place that shows
// all three, because it is the one place where the difference is the point.
//
// (superseded) THE EFFECTIVE PRICE IS STILL THE EFFECTIVE PRICE. regular_price / minimum_price / msrp remain what every
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

    // ---- PRICING-R4C-R2 §1 — DISPLAY LABEL vs INTERNAL VALUE ------------------------------------------
    //
    // The three modes above are the WRITE CONTRACT and they do not move: 73_ accepts NO_CHANGE / MANUAL /
    // AUTO, the flag columns stay TRUE / FALSE / blank, and nothing about the database changes here.
    //
    // What changes is the word a person reads. "MANUAL" is authority-implementation vocabulary: it names
    // who will own the field afterwards, which is a consequence of the action rather than the action. The
    // person is choosing "update this price"; that it makes them the owner is what the system does about
    // it. Asking an operator to type the consequence is how "I want to change a price" became "I must
    // understand the ownership model first".
    //
    //   No Change        NO_CHANGE
    //   Update Price     MANUAL
    //   Use Auto Price   AUTO
    //
    // BOTH SPELLINGS PARSE. The label is what the template ships and what the UI offers; the internal
    // value keeps working because files already downloaded, already edited and already half-uploaded exist
    // in the world, and a round that renames a vocabulary must not invalidate them.
    SRP.ACTIONS = [
        { value: 'NO_CHANGE', label: 'No Change',
          help: 'Leave this price exactly as it is. The price cell must be blank.' },
        { value: 'MANUAL', label: 'Update Price',
          help: 'Enter the new price in the adjacent price column.' },
        { value: 'AUTO', label: 'Use Auto Price',
          help: 'Restore the system-calculated price. Leave the price cell blank.' }
    ];

    var ACTION_LABEL = {};
    SRP.ACTIONS.forEach(function (a) { ACTION_LABEL[a.value] = a.label; });

    /** The word a person sees for an internal mode. */
    SRP.actionLabel = function (v) { return ACTION_LABEL[String(v || '').toUpperCase()] || ACTION_LABEL.NO_CHANGE; };

    /** Every label, for an instruction block or a dropdown, in contract order. */
    SRP.actionLabels = function () { return SRP.ACTIONS.map(function (a) { return a.label; }); };

    /**
     * Read one action cell into an internal mode, or null when it is not an action at all.
     *
     * BLANK IS NO CHANGE and nothing else — the frozen §8 rule, restated here because this function is now
     * the only place that decides it. An unrecognised word is NULL rather than NO_CHANGE: silently ignoring
     * a word someone typed on purpose is how an edit disappears without anyone being told.
     */
    SRP.readAction = function (cell) {
        var s = String(cell == null ? '' : cell).trim().toUpperCase().replace(/[\s-]+/g, '_');
        if (s === '') return 'NO_CHANGE';
        if (s === 'NO_CHANGE') return 'NO_CHANGE';
        if (s === 'MANUAL' || s === 'UPDATE_PRICE') return 'MANUAL';
        if (s === 'AUTO' || s === 'USE_AUTO_PRICE' || s === 'USE_AUTO') return 'AUTO';
        return null;
    };

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

    /**
     * Everything the panel and the editor need about one field.
     *
     * PRICING-R4G §10 — THREE NUMBERS, AND THEY ARE NOT INTERCHANGEABLE:
     *
     *   override   the raw user override cell. null means NO OVERRIDE EXISTS, which is healthy.
     *   auto       the system reference, base x FX.
     *   resolved   what the site charges: the override when there is one, otherwise auto, otherwise null.
     *
     * `effective` is kept as the former name of `override` because the template builders and the §10
     * census read it, and renaming those here would be a second change riding on this one. It is the raw
     * cell — never resolved — and `resolved` is the new field a display should use.
     */
    SRP.fieldView = function (row, spec) {
        var raw = (row && row.raw) || {};
        var effective = num(row ? row[spec.cc] : null);
        if (effective === null) effective = num(raw[spec.key]);
        var auto = num(row ? row[spec.auto] : null);
        if (auto === null) auto = num(raw[spec.autoKey]);
        var isNa = /^(NA|N\/A)$/i.test(String(raw[spec.key] == null ? '' : raw[spec.key]).trim());
        // The client resolver's rule, and the only place this module applies it. NA never falls back.
        var resolved = effective !== null ? effective : (isNa ? null : auto);
        return {
            key: spec.key, label: spec.label,
            effective: effective, override: effective, resolved: resolved, auto: auto,
            resolvedSource: effective !== null ? 'OVERRIDE'
                : (isNa ? 'NA' : (auto !== null ? 'AUTO' : 'NOT_SET')),
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

    // §9 — TWO VOCABULARIES AGAIN, and for the same reason. On screen an operator is told what HAPPENED to
    // the price ("a person updated it"); in an exported file the column holds the machine's own word, so a
    // spreadsheet filter, a diff against an earlier export and a test all keep matching on one token. The
    // two are separate functions so that changing the wording can never change the file.
    var OWNER_LABEL = {};
    OWNER_LABEL[SRP.OWNER_MANUAL] = 'User Updated';
    OWNER_LABEL[SRP.OWNER_AUTO] = 'Auto';
    OWNER_LABEL[SRP.OWNER_UNKNOWN] = 'Not Set';
    SRP.ownerLabel = function (o) { return OWNER_LABEL[o] || 'Not Set'; };

    var OWNER_CODE = {};
    OWNER_CODE[SRP.OWNER_MANUAL] = 'MANUAL';
    OWNER_CODE[SRP.OWNER_AUTO] = 'AUTO';
    OWNER_CODE[SRP.OWNER_UNKNOWN] = 'NOT_SET';
    /** The token an EXPORTED FILE carries. Frozen, and deliberately not derived from the display label. */
    SRP.ownerCode = function (o) { return OWNER_CODE[o] || 'NOT_SET'; };

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
            // PRICING-R4G §10 — RESOLVED / AUTO / OVERRIDE, each on its own line and each labelled.
            // "Override: Not set" beside a resolved number is the NORMAL state of a healthy row and must
            // not read as a warning; "Regular Price: Not Set" means no layer has a price and is the row
            // that needs a person. Conflating the two is the one thing this layout exists to prevent.
            var badge = '<span class="srd-own srd-own--' + v.owner.toLowerCase() + '">' + esc(SRP.ownerLabel(v.owner)) + '</span>';
            var resolved = v.effectiveIsNa ? '<em>NA</em>'
                : (v.resolved === null ? '<em>Not set</em>' : esc(money(v.resolved, currency)));
            var auto = v.auto === null ? '<em>Not set</em>' : esc(money(v.auto, currency));
            var override = v.effectiveIsNa ? '<em>NA</em>'
                : (v.override === null ? '<em>Not set</em>' : esc(money(v.override, currency)));
            var note = v.diverges
                ? '<div class="srd-pr__note">The override differs from Auto. That is a fact about the two numbers, not a claim about who set either.</div>' : '';
            return '<div class="srd-pr__row"><div class="srd-pr__lbl">' + esc(spec.label) + ' ' + badge + '</div>' +
                '<div class="srd-pr__val"><span class="srd-pr__eff">' + resolved + '</span>' +
                '<span class="srd-pr__auto">Auto ' + auto + '</span>' +
                '<span class="srd-pr__ovr">Override ' + override + '</span></div>' + note + '</div>';
        }).join('');

        var head = '<div class="srd-pr__head">' +
            '<span>Currency <strong>' + (currency ? esc(currency) : '<em>not set</em>') + '</strong></span>' +
            '<span>FX Rate <strong>' + (fxRate === null ? '<em>not set</em>' : esc(String(fxRate))) + '</strong></span>' +
            '<span>FX Date <strong>' + (fxDate ? esc(fxDate) : '<em>not set</em>') + '</strong></span>' +
            '</div>';

        var anyUnknown = SRP.FIELDS.some(function (s) { return SRP.ownerOf(row, s) === SRP.OWNER_UNKNOWN; });
        var unknownNote = anyUnknown
            ? '<div class="srd-secnote">A field marked <strong>Not Set</strong> has no recorded owner. That does not stop it resolving: an empty override always falls back to Auto. It means nobody has recorded whether the stored override was set by a person.</div>'
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
                        '<option value="NO_CHANGE" selected>' + esc(SRP.actionLabel('NO_CHANGE')) + '</option>' +
                        '<option value="AUTO">' + esc(SRP.actionLabel('AUTO')) + ' (' + esc(autoTxt) + ')</option>' +
                        '<option value="MANUAL">' + esc(SRP.actionLabel('MANUAL')) + '</option>' +
                    '</select>' +
                    '<input id="' + id + '-value" type="text" inputmode="decimal" disabled placeholder="' +
                        (v.resolved === null ? 'enter a price' : esc(String(v.resolved))) + '" value="">' +
                    '</div>';
            }).join('') +
            '<p class="srd-modal__hint">Each price is owned separately: choosing <strong>Update Price</strong> for <strong>Regular</strong> does not change who owns <strong>Minimum</strong> or <strong>MSRP</strong>. ' +
            '<strong>Use Auto Price</strong> hands the field back to the system and restores it from the stored auto value — it is refused when there is no auto value to restore, because writing 0 there would be a price.</p>' +
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

    /* =============================================================================================
       S3-R11 §11 — THE HEADER A PERSON READS, AND THE KEY THE IMPORTER MATCHES.

       §11 asks for human-readable headers and for no hidden internal token the operator has to
       supply. `marketplace_sku_id` is neither readable nor optional: it is the identity, and a
       pricing row is never addressed by master SKU alone. So the column stays, it ships PRE-FILLED
       and LOCKED, and it is spelled in words.

       BOTH SPELLINGS PARSE, for the same reason PRICING-R4C-R2 kept both action vocabularies: files
       downloaded before this round exist in the world, and a round that renames a header must not
       invalidate a file somebody is halfway through editing. This is the only place that decides,
       so the CSV reader and the XLSX reader cannot drift apart — there is one contract with two
       front doors, never two contracts. */
    SRP.TEMPLATE_HEADER_LABELS = {
        marketplace_sku_id: 'Marketplace SKU ID',
        master_sku: 'Master SKU',
        site_sku: 'Site SKU',
        company: 'Company',
        country: 'Country',
        marketplace: 'Marketplace',
        currency: 'Currency',
        regular_price_mode: 'Regular Price Action',
        regular_price: 'Regular Price',
        minimum_price_mode: 'Minimum Price Action',
        minimum_price: 'Minimum Price',
        msrp_mode: 'MSRP Action',
        msrp: 'MSRP'
    };
    var _HEADER_KEY_BY_LABEL = {};
    function _hdrNorm(v) {
        return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s_\-]+/g, ' ');
    }
    Object.keys(SRP.TEMPLATE_HEADER_LABELS).forEach(function (k) {
        _HEADER_KEY_BY_LABEL[_hdrNorm(SRP.TEMPLATE_HEADER_LABELS[k])] = k;
        _HEADER_KEY_BY_LABEL[_hdrNorm(k)] = k;
    });
    /**
     * One header cell -> the canonical column key, or the lowercased cell when it is neither.
     * An unknown header is passed through rather than dropped: MISSING_REQUIRED_COLUMNS is the error
     * that should fire for a wrong file, and swallowing the name here would hide which one it was.
     */
    SRP.headerKey = function (cell) {
        var n = _hdrNorm(cell);
        return _HEADER_KEY_BY_LABEL[n] || String(cell == null ? '' : cell).trim().toLowerCase();
    };

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
     * The UPDATE template. §3 — every action cell ships as "No Change" and every price cell ships BLANK, so
     * a downloaded-and-re-uploaded file with no edits changes nothing at all, and an untouched template
     * VISUALLY means "nothing will change". The current effective prices are deliberately NOT pre-filled:
     * a file that arrives holding today's prices invites an operator to edit two of them and upload the
     * other ninety-eight as manual claims nobody made. Current prices live in their own download.
     *
     * §1/§2 — the action cell carries the WORD A PERSON RECOGNISES rather than the internal token. CSV
     * cannot carry dropdown validation, so the file cannot stop a wrong word being typed; what it can do
     * is make the right word obvious, and the upload refuses anything else by name.
     */
    SRP.buildTemplateCsv = function (pricingRows, marketplaceSkus) {
        // S3-R11 §11 — the rows are the shared ones, so the CSV fallback and the XLSX primary cannot
        // describe different templates. The CSV keeps the MACHINE header spelling it has always
        // shipped: those are the files already in circulation, and SRP.headerKey reads both.
        return SRP.toCsv(SRP.TEMPLATE_COLUMNS, SRP.buildTemplateRows(pricingRows, marketplaceSkus));
    };

    /* -------------------------------------------------------------------------------------------
       THE TEXT FRONT DOORS. Unchanged names, unchanged signatures, unchanged behaviour — a CSV is
       parsed into a grid and handed to the rules. Every existing caller and every existing test
       keeps working, and the XLSX reader enters through the SAME rules one function lower down.
       ------------------------------------------------------------------------------------------- */
    SRP.validateFile = function (text) { return SRP.validateGrid(SRP.parseCsv(text)); };
    SRP.validateBulkFile = function (text, scope) { return SRP.validateBulkGrid(SRP.parseCsv(text), scope); };

    /**
     * S3-R11 §11 — ONE SET OF TEMPLATE ROWS, TWO FILE FORMATS.
     * Lifted out of buildTemplateCsv unchanged so the XLSX cannot ship a different template from the
     * CSV. §3 still holds: every action cell is "No Change" and every price cell is blank, so an
     * unedited download that is uploaded again changes nothing at all.
     */
    SRP.buildTemplateRows = function (pricingRows, marketplaceSkus) {
        var mix = indexMkt(marketplaceSkus);
        var nc = SRP.actionLabel('NO_CHANGE');
        return (pricingRows || []).map(function (p) {
            var c = ctxOf(p, mix);
            c.regular_price_mode = nc; c.regular_price = '';
            c.minimum_price_mode = nc; c.minimum_price = '';
            c.msrp_mode = nc; c.msrp = '';
            return c;
        });
    };

    /**
     * S3-R11 §11 — THE XLSX TEMPLATE SPEC, for the shared KM.templateExport builder.
     *
     * WHY XLSX IS THE PRIMARY AND CSV IS THE FALLBACK. The action cell is a three-word enum, and CSV
     * cannot carry validation — buildTemplateCsv's own comment says so: "the file cannot stop a wrong
     * word being typed". A dropdown can, which turns MODE_UNSUPPORTED from a round trip through the
     * importer into something the spreadsheet refuses at the point of typing.
     *
     * NO NEW DEPENDENCY. ExcelJS already ships in index.html for the Template UI Standard, and
     * KM.templateExport already implements freeze pane, header style, per-kind fills, protection,
     * dropdown validation and auto width. §11's STOP gate is about ADDING a library; this adds none.
     *
     * blankInputRows: 0 IS LOAD-BEARING. The shared builder appends 50 empty rows by default so an
     * operator can add records. A pricing row cannot be ADDED from this template — it is addressed by
     * an existing marketplace_sku_id — so those rows would arrive as 50 IDENTITY_MISSING errors on a
     * file nobody typed in. The same reasoning rules out an example row.
     */
    /* Stamped into the hidden _SYSTEM sheet so a file that arrives months later can be traced to the
       build that produced it. It is NOT read back on import and grants nothing: the importer decides
       from the headers and the rules, exactly as it does for a CSV that carries no version at all. */
    SRP.TEMPLATE_VERSION = 'S3-R11';

    SRP.templateXlsxSpec = function (scope, pricingRows, marketplaceSkus) {
        var rows = SRP.buildTemplateRows(pricingRows, marketplaceSkus);
        var actions = SRP.actionLabels();
        // Identity and context are LOCKED (grey, protected); the six action/price cells are BUSINESS
        // EDITABLE (yellow, unlocked). The colouring is the instruction: what is yellow is yours.
        var LOCKED = ['marketplace_sku_id', 'master_sku', 'site_sku', 'company', 'country',
            'marketplace', 'currency'];
        var columns = SRP.TEMPLATE_COLUMNS.map(function (key) {
            var spec = SRP.FIELDS.filter(function (f) { return f.mode === key; })[0];
            var isAction = !!spec;
            var isPrice = SRP.FIELDS.some(function (f) { return f.key === key; });
            var col = {
                key: key,
                header: SRP.TEMPLATE_HEADER_LABELS[key] || key,
                kind: (LOCKED.indexOf(key) >= 0) ? 'locked' : 'business',
                width: isAction ? 18 : 16
            };
            if (isAction) {
                col.dropdown = actions;
                col.comment = SRP.ACTIONS.map(function (a) { return a.label + ' — ' + a.help; }).join('\n');
            } else if (isPrice) {
                col.comment = 'Fill this in only when the action beside it is "'
                    + SRP.actionLabel('MANUAL') + '". Blank is not zero.';
            }
            return col;
        });
        var country = (scope && scope.country) || '';
        var marketplace = (scope && scope.marketplace) || '';
        var currency = (scope && scope.currency) || '';
        return {
            filename: 'price-update-template-' + country + '-' + marketplace + '.xlsx',
            sheetName: 'Price Update',
            instructionRow: 'Prices are in ' + currency + ' for ' + country + ' / ' + marketplace
                + '.  Choose an action from the dropdown in each yellow Action column; type a price only '
                + 'beside "' + SRP.actionLabel('MANUAL') + '".  Grey columns identify the row and must not '
                + 'be edited.  An unedited file changes nothing.',
            columns: columns,
            rows: rows,
            blankInputRows: 0,
            protect: true,
            system: {
                template_id: 'pricing-bulk-update',
                template_name: 'Pricing Bulk Update',
                template_version: SRP.TEMPLATE_VERSION,
                module: 'sku-regional-details',
                generated_at: new Date().toISOString(),
                export_mode: 'update',
                source_system: 'Kitchen Mama Operation System',
                notes: country + '/' + marketplace + ' · ' + currency
            }
        };
    };

    /**
     * S3-R11 §11 — ONE WORKSHEET -> THE SAME GRID A CSV PRODUCES.
     *
     * The HEADER ROW IS FOUND, not assumed to be row 1: the template writes an instruction banner
     * above it, and an operator may add a note of their own. The row carrying the identity column is
     * the header by definition, so that is what is looked for.
     *
     * A cell is read as the TEXT A PERSON SEES. ExcelJS hands back numbers, formula objects and rich
     * text; the rules below were written against strings, and `readAction`/`num` already do the
     * interpreting. Flattening here rather than teaching the rules about Excel types is what keeps
     * this a reader and not a second contract.
     */
    SRP.sheetToGrid = function (ws) {
        function flat(v) {
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') {
                if (v instanceof Date) return v.toISOString().slice(0, 10);
                if (typeof v.text === 'string') return v.text;
                if (Array.isArray(v.richText)) return v.richText.map(function (r) { return r.text || ''; }).join('');
                if (v.result !== undefined) return flat(v.result);
                if (v.formula !== undefined) return '';
                if (v.hyperlink !== undefined && v.text !== undefined) return String(v.text);
                return '';
            }
            return String(v);
        }
        var raw = [];
        ws.eachRow({ includeEmpty: true }, function (row) {
            var cells = [];
            row.eachCell({ includeEmpty: true }, function (cell) { cells.push(flat(cell.value)); });
            raw.push(cells);
        });
        var hdr = -1;
        for (var i = 0; i < raw.length && i < 40; i++) {
            var keys = raw[i].map(SRP.headerKey);
            if (keys.indexOf('marketplace_sku_id') >= 0) { hdr = i; break; }
        }
        if (hdr === -1) return [];
        var grid = raw.slice(hdr);
        // A spreadsheet carries trailing empty rows almost every time. They are not rows a person
        // typed, so they are dropped here rather than reported as IDENTITY_MISSING against a file
        // that looks, to the operator, exactly as they left it.
        while (grid.length > 1) {
            var last = grid[grid.length - 1];
            var any = last.some(function (c) { return String(c || '').trim() !== ''; });
            if (any) break;
            grid.pop();
        }
        return grid;
    };

    /** The CURRENT prices, for reading rather than for uploading. Ownership is spelled out per field. */
    SRP.buildCurrentCsv = function (pricingRows, marketplaceSkus) {
        var mix = indexMkt(marketplaceSkus);
        var rows = (pricingRows || []).map(function (p) {
            var c = ctxOf(p, mix);
            SRP.FIELDS.forEach(function (spec) {
                var v = SRP.fieldView(p, spec);
                c[spec.key] = v.effectiveIsNa ? 'NA' : (v.effective === null ? '' : v.effective);
                c[spec.key + '_owner'] = SRP.ownerCode(v.owner);
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
    /**
     * S3-R11 §11 — THE READER MOVED OUT; THE RULES DID NOT.
     * Everything below this line is the frozen §8 contract, unchanged, operating on a GRID. CSV and
     * XLSX both produce a grid, so both meet these rules by construction rather than by a second
     * implementation that has to be kept in step.
     */
    SRP.validateGrid = function (grid) {
        var out = { ok: true, errors: [], lines: [], rowCount: 0 };
        grid = grid || [];
        if (!grid.length) {
            out.ok = false;
            out.errors.push({ line: 0, code: 'EMPTY_FILE', detail: 'The file has no rows.' });
            return out;
        }
        var headers = grid[0].map(SRP.headerKey);
        var required = ['marketplace_sku_id'].concat(SRP.FIELDS.map(function (s) { return s.mode; }));
        var missing = required.filter(function (r) { return headers.indexOf(r) === -1; });
        if (missing.length) {
            out.ok = false;
            out.errors.push({ line: 1, code: 'MISSING_REQUIRED_COLUMNS',
                detail: 'The file is missing: ' + missing.map(function (m) {
                    return SRP.TEMPLATE_HEADER_LABELS[m] || m; }).join(', ') +
                    '. Download the template and edit that.' });
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
                // §8 — a BLANK cell is NO_CHANGE. It is never a deletion and never AUTO. SRP.readAction is
                // the one place that decides this, and it accepts the display label as well as the token.
                var mode = SRP.readAction(modeRaw);
                if (mode === null) {
                    out.ok = false; bad = true;
                    out.errors.push({ line: lineNo, code: 'MODE_UNSUPPORTED', field: spec.key,
                        detail: JSON.stringify(modeRaw) + ' is not one of ' + SRP.actionLabels().join(' / ') + '.' });
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


    // ---- the bulk-update target scope (PRICING-R4B) ------------------------------------------------------
    //
    // A bulk import is scoped to ONE country + ONE marketplace, and the list of targets is derived from the
    // pricing rows that actually exist rather than from the marketplaces table. A marketplace with no
    // pricing rows would offer a target whose template downloads empty, and an operator would reasonably
    // read that as "there is nothing to price here" rather than "this list is not about pricing".
    //
    // THE CURRENCY COMES FROM pricing_list.currency, and that is a decision rather than a shortcut. The
    // server refuses a line whose currency disagrees with THE ROW — its own refusal, named in 73_ — so a notice
    // quoting any other source could tell an operator to fill a file the writer then rejects. The
    // marketplaces table carries its own `currency` column; if the two ever disagree that is a data
    // question for someone to settle, not something an import should silently pick a side in.
    SRP.scopes = function (pricingRows, marketplaceSkus) {
        var mix = indexMkt(marketplaceSkus);
        var byKey = {};
        (pricingRows || []).forEach(function (p) {
            var raw = p.raw || {};
            var msid = String(p.marketplaceSkuId || raw.marketplace_sku_id || '').trim();
            if (!msid) return;
            var m = mix[msid] || {};
            var country = String(p.country || raw.country || m.country || '').trim().toUpperCase();
            var marketplace = String(p.marketplace || raw.marketplace || m.marketplace || '').trim();
            if (!country || !marketplace) return;
            var key = country + '|' + marketplace;
            var sc = byKey[key] || (byKey[key] = { key: key, country: country, marketplace: marketplace,
                ids: {}, rows: [], counts: {}, companies: {} });
            var cur = String(p.currency || raw.currency || '').trim().toUpperCase();
            if (cur) sc.counts[cur] = (sc.counts[cur] || 0) + 1;
            if (m.company) sc.companies[m.company] = 1;
            sc.ids[msid] = 1;
            sc.rows.push(p);
        });
        return Object.keys(byKey).sort().map(function (k) {
            var sc = byKey[k];
            sc.currencyList = Object.keys(sc.counts).sort();
            // ONE currency or NONE. A target whose rows disagree is not importable, and picking the most
            // common one would write the minority rows in a currency nobody chose.
            sc.currency = sc.currencyList.length === 1 ? sc.currencyList[0] : null;
            sc.companyList = Object.keys(sc.companies).sort();
            sc.rowCount = sc.rows.length;
            return sc;
        });
    };

    SRP.countriesOf = function (scopes) {
        var seen = {};
        (scopes || []).forEach(function (sc) { seen[sc.country] = 1; });
        return Object.keys(seen).sort();
    };
    SRP.scopesForCountry = function (scopes, country) {
        var c = String(country || '').trim().toUpperCase();
        return (scopes || []).filter(function (sc) { return sc.country === c; });
    };
    SRP.findScope = function (scopes, key) {
        var hit = (scopes || []).filter(function (sc) { return sc.key === key; });
        return hit.length === 1 ? hit[0] : null;
    };

    /**
     * THE BULK FILE CHECK: the frozen file contract, plus the two things only a SCOPED import can know.
     *
     * SRP.validateFile is not changed and not re-implemented — it is called. It drops a value supplied
     * beside AUTO, which is the safe reading and the reason a price cannot ride in behind a hand-back. A
     * scoped import can afford to be stricter than safe: a file saying both AUTO and 45.99 for one field is
     * saying two different things, and an operator should be told rather than have one of them discarded
     * quietly. So the contradiction is REFUSED here while the frozen function keeps dropping it, and no
     * second import contract exists — this is a gate in front of the same one.
     */
    SRP.validateBulkGrid = function (grid, scope) {
        var out = { ok: true, errors: [], lines: [], rowCount: 0 };
        grid = grid || [];
        if (!scope) {
            out.ok = false;
            out.errors.push({ line: 0, code: 'TARGET_NOT_SELECTED', detail: 'Choose a country and a marketplace before uploading.' });
            return out;
        }
        if (!scope.currency) {
            out.ok = false;
            out.errors.push({ line: 0, code: 'TARGET_CURRENCY_AMBIGUOUS',
                detail: scope.currencyList.length
                    ? 'The pricing rows for this target carry more than one currency (' + scope.currencyList.join(', ') +
                      '). An import cannot choose between them.'
                    : 'No pricing row in this target carries a currency, so there is nothing to validate an upload against.' });
            return out;
        }

        var base = SRP.validateGrid(grid);
        out.rowCount = base.rowCount;
        // A FAILED FILE STILL GETS THE FULL READING. Returning here would report only the file-shape
        // errors, and an operator fixing a blank Update Price would upload again to be told about the
        // price they left beside a No Change. The scan below reads the GRID, not the lines, so it works
        // just as well on a file that has already failed — and one round trip beats three.
        if (!base.ok) { out.ok = false; out.errors = base.errors.slice(); }

        // §4 — A PRICE BESIDE AN ACTION THAT TAKES NO PRICE. Read off the GRID, because validateFile has
        // already dropped the value by the time it returns lines — which is exactly the behaviour being kept
        // intact underneath.
        //
        // THE MISUSE THIS EXISTS FOR (§2): a person deletes the action word, types a price, and uploads. The
        // frozen reader is right to treat a blank action as No Change, and right to drop the price — but the
        // combination of the two means an operator who did the most natural thing in the world is told
        // "valid, nothing to do" about a file they believe contains a price change. Dropping a value is the
        // safe reading; it is not an honest one when the value was the entire point.
        //
        // So the scoped import REFUSES both contradictions and names them, while the frozen function keeps
        // dropping. There is no second import contract — this is a gate in front of the same one.
        var headers = (grid[0] || []).map(SRP.headerKey);
        var cell = function (r, n) { var i = headers.indexOf(n); return i === -1 ? '' : String(r[i] == null ? '' : r[i]).trim(); };
        var NC = SRP.actionLabel('NO_CHANGE'), UP = SRP.actionLabel('MANUAL'), UA = SRP.actionLabel('AUTO');
        for (var g = 1; g < grid.length; g++) {
            SRP.FIELDS.forEach(function (spec) {
                var raw = cell(grid[g], spec.mode);
                var mode = SRP.readAction(raw);
                var val = cell(grid[g], spec.key);
                if (val === '') return;
                if (mode === 'AUTO') {
                    out.ok = false;
                    out.errors.push({ line: g + 1, code: 'AUTO_WITH_VALUE', field: spec.key,
                        detail: '"' + UA + '" and a price in the same row say two different things. ' + UA +
                            ' restores the price from the stored auto value; clear the price cell, or choose "' + UP + '".' });
                } else if (mode === 'NO_CHANGE') {
                    out.ok = false;
                    out.errors.push({ line: g + 1, code: 'NO_CHANGE_WITH_PRICE', field: spec.key,
                        detail: (raw === ''
                            ? 'The action cell is blank, which means "' + NC + '", but a price is filled in. '
                            : '"' + NC + '" and a price in the same row say two different things. ') +
                            'To change this price set the action to "' + UP + '". To leave it alone, clear the price cell.' });
                }
            });
        }

        if (!base.ok) { out.lines = []; return out; }

        // SCOPE MEMBERSHIP IS DECIDED BY marketplace_sku_id ALONE, never by the country or marketplace cell.
        // Those columns are context: the import does not read them, so a row pasted from another target
        // cannot be retargeted by editing them, and editing them on a row that IS in scope changes nothing.
        base.lines.forEach(function (l) {
            var id = String(l.marketplace_sku_id || '').trim();
            if (!scope.ids[id]) {
                out.ok = false;
                out.errors.push({ line: 0, code: 'ROW_OUTSIDE_TARGET', marketplace_sku_id: id,
                    detail: id + ' is not a pricing row of ' + scope.country + ' / ' + scope.marketplace +
                        '. A file is addressed by marketplace_sku_id, so a row from another target lands outside this import rather than being moved into it.' });
                return;
            }
            var cur = String(l.currency || '').trim().toUpperCase();
            if (cur && cur !== scope.currency) {
                out.ok = false;
                out.errors.push({ line: 0, code: 'FILE_CURRENCY_NOT_TARGET', marketplace_sku_id: id,
                    detail: 'This target prices in ' + scope.currency + '; the file says ' + cur +
                        '. The currency is set by the marketplace and an import may not change it.' });
                return;
            }
            out.lines.push(l);
        });

        if (!out.ok) out.lines = [];   // §9 — a rejected file offers nothing for writing
        return out;
    };

    /**
     * THE PREVIEW TABLE. It is driven by the SERVER receipt, not by a second opinion: the rows and fields
     * shown are the ones the dry run said would change, and this only decorates them with the current value
     * and the current owner, which the page already holds. Deciding here what would change would make the
     * browser a second pricing authority — the thing §8 of the previous round was careful not to build.
     */
    SRP.previewRows = function (receiptRows, lines, pricingRows) {
        var byId = SRP.indexByMarketplaceSkuId(pricingRows);
        var lineById = {};
        (lines || []).forEach(function (l) { lineById[String(l.marketplace_sku_id || '').trim()] = l; });
        var out = [];
        (receiptRows || []).forEach(function (rec) {
            if (!rec || !rec.changed) return;
            var id = String(rec.marketplace_sku_id || '').trim();
            var row = byId[id], line = lineById[id] || {};
            SRP.FIELDS.forEach(function (spec) {
                var f = rec.fields && rec.fields[spec.key];
                if (!f || !f.changed) return;
                var view = row ? SRP.fieldView(row, spec) : { effective: null, auto: null, owner: SRP.OWNER_UNKNOWN };
                var newValue = f.mode === 'AUTO' ? view.auto : num(line[spec.key]);
                out.push({
                    marketplace_sku_id: id,
                    sku: String((row && (row.sku || (row.raw && row.raw.sku))) || ''),
                    site_sku: String((row && (row.siteSku || (row.raw && row.raw.site_sku))) || ''),
                    field: spec.key, label: spec.label, mode: f.mode,
                    current_value: view.effective, new_value: newValue,
                    current_owner: view.owner,
                    new_owner: f.mode === 'AUTO' ? SRP.OWNER_AUTO : SRP.OWNER_MANUAL
                });
            });
        });
        return out;
    };

    /**
     * §8 — ONE CARD PER SKU. previewRows emits one entry per CHANGED FIELD, which is the right shape for a
     * receipt and the wrong shape for a person: a SKU whose Regular, Minimum and MSRP all move appears three
     * times, in three places, with nothing tying them together. Grouping is presentation and it is done
     * here rather than in the page so the grouping itself can be tested without a DOM.
     *
     * Order is preserved from the receipt. A "sorted by size of change" list would put the biggest number
     * first, which reads as a ranking of importance that nobody computed.
     */
    SRP.groupPreview = function (previewRows) {
        var order = [], byId = {};
        (previewRows || []).forEach(function (r) {
            var id = String(r.marketplace_sku_id || '').trim();
            var g = byId[id];
            if (!g) {
                g = byId[id] = { marketplace_sku_id: id, sku: r.sku, site_sku: r.site_sku, changes: [] };
                order.push(g);
            }
            g.changes.push(r);
        });
        return order;
    };

    /** §7 — how many SKU cards one screen shows before asking. Not a scroll limit: a render limit. */
    SRP.PREVIEW_PAGE_SIZE = 20;

    /**
     * §6/§11 — THE NUMBERS ABOVE THE LIST, and the same numbers again on the confirmation.
     *
     * Every count is derived from the SERVER RECEIPT, never from the file: the receipt is what the dry run
     * said would happen, and a browser-side recount would be a second opinion that can disagree with the
     * thing about to be written. rowsInFile is the only figure that comes from the file, because it is a
     * fact about the file.
     *
     * "Rows unchanged" deliberately counts rows the server said would not move — which includes a row whose
     * file line asked for a price it already holds. Calling those "unchanged" rather than "skipped" is the
     * honest word: the operator asked for something, and the answer is that it is already so.
     */
    SRP.previewSummary = function (parsed, receiptRows, previewRows) {
        var rows = receiptRows || [];
        var changedRows = rows.filter(function (r) { return r && r.changed; });
        var out = {
            rowsInFile: (parsed && parsed.rowCount) || 0,
            rowsChecked: rows.length,
            rowsChanging: changedRows.length,
            rowsUnchanged: rows.length - changedRows.length,
            rowsRejected: Math.max(0, ((parsed && parsed.rowCount) || 0) - (((parsed && parsed.lines) || []).length)),
            errorCount: ((parsed && parsed.errors) || []).length,
            fieldChanges: 0,
            byField: {}, byAction: { MANUAL: 0, AUTO: 0 }
        };
        SRP.FIELDS.forEach(function (spec) { out.byField[spec.key] = 0; });
        (previewRows || []).forEach(function (r) {
            out.fieldChanges++;
            if (out.byField[r.field] !== undefined) out.byField[r.field]++;
            if (r.mode === 'AUTO') out.byAction.AUTO++;
            else if (r.mode === 'MANUAL') out.byAction.MANUAL++;
        });
        return out;
    };

    /** What actually happened, counted off the write receipt rather than off the file that was sent. */
    SRP.resultSummary = function (receiptRows) {
        var out = { rows_updated: 0, fields_updated: 0, manual_fields: 0, auto_fields: 0 };
        (receiptRows || []).forEach(function (rec) {
            if (!rec || !rec.changed) return;
            out.rows_updated++;
            SRP.FIELDS.forEach(function (spec) {
                var f = rec.fields && rec.fields[spec.key];
                if (!f || !f.changed) return;
                out.fields_updated++;
                if (f.mode === 'AUTO') out.auto_fields++; else out.manual_fields++;
            });
        });
        return out;
    };

    global.KM = global.KM || {};
    global.KM.SkuRegionalPricing = SRP;
    if (typeof module !== 'undefined' && module.exports) module.exports = SRP;

})(typeof window !== 'undefined' ? window : this);
