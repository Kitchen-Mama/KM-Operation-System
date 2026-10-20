// FX1-R4 — FX Rate Book (Administration page controller).
//
// ROUTED. index.html carries the mount point, the menu entry and the script tag; `showSection('fx-rate-book')`
// maps to `fx-rate-book-section` in both of app.js's maps, and the lifecycle registration is at the foot
// of this file. FX1 prepared this page unrouted and FX1-R3 left it that way; it is live now because the
// two actions it needs exist in 01_ and 75_.
//
// READ-ONLY ON LOAD. Opening the page calls fxRateBook.get and nothing else. "Save changes" is the only
// thing here that writes, and it carries the doc_version it read.
//
// THIS PAGE DECIDES NOTHING. The FX1 prototype resolved rates in the browser against a second copy of
// the rules (assets/tests/_fx-rate-book-contract.js, which is not even shipped, so in a browser it was
// never there and the coverage panel reported a missing module to every operator who opened the page).
// Validation, resolution, the frozen direction, the effective period and the version compare-and-swap
// are 75_'s, once. What arrives here is rendered; what the operator types is submitted; every refusal
// shown below is the server's, quoted by its own code.
//
// AND IT PRICES NOTHING. 73_ stays the one writer of pricing_list. Saving a coefficient changes what the
// NEXT creation reads and what a reconciliation could later be asked to apply — it reprices nothing by
// itself, and it can never overwrite a price a person set by hand.
(function () {
    'use strict';

    var _state = {
        rates: [],          // the editable working copy
        serverRates: [],    // what the server last returned, for "is anything actually different"
        docVersion: null,   // the version the working copy was read at — a save carries THIS
        currencies: [],
        log: [],
        capacity: null,
        mayEdit: false,
        authorityModel: null,
        authorityReason: null,
        loaded: false,
        busy: false,
        // FX1-R4-R1 — how many rows arrived without a legal per-row version. Supplying one is
        // necessary (the server requires it and refuses the whole book without it) but it is a
        // change to stored data, so it is counted and said out loud rather than done quietly.
        repairedVersions: 0
    };

    // THE FIELDS THIS EDITOR DRAWS — which is NOT the whole stored row, and the difference is the
    // defect FX1-R4-R1 closes. Every load and every save rebuilt each row from this list alone, so
    // `version` — required by 75_ on every entry, whole number, at least 1 — was dropped on the way
    // in and never sent on the way out. A non-empty book could therefore NEVER be saved: the server
    // refused it with one FX_VERSION_INVALID per row. An EMPTY book saved perfectly, because rates:[]
    // has no entries to validate, which is exactly why 283 passing assertions never noticed.
    var FIELDS = ['base_currency', 'quote_currency', 'rate', 'source', 'as_of',
                  'effective_from', 'effective_to', 'status'];

    // A LEGAL VERSION, per the stored contract: a whole number of at least 1. The page does not
    // INVENT a version for a row that has one, and it does not bump one either — 75_ neither asks
    // for that nor records it, and a counter the client maintains alone would be a second history
    // competing with the change log, which is the server's and is built from the two states it
    // actually committed.
    function legalVersion(v) {
        var n = Number(v);
        return (isFinite(n) && n >= 1 && Math.floor(n) === n) ? n : null;
    }

    // THE WORKING COPY OF ONE STORED ROW. Everything the server sent is carried, not only the eight
    // columns drawn below: a field this page does not render is still a field the operator's save
    // would otherwise delete, and `version` was the first casualty of exactly that. A later field
    // added server-side survives a round trip here without this file being touched.
    function workingRow(e) {
        var o = {};
        Object.keys(e || {}).forEach(function (k) { o[k] = e[k]; });
        FIELDS.forEach(function (f) { if (o[f] === undefined || o[f] === null) o[f] = ''; });
        var v = legalVersion(o.version);
        if (v === null) { o.version = 1; _state.repairedVersions++; } else { o.version = v; }
        return o;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function el(id) { return document.getElementById(id); }

    // ------------------------------------------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------------------------------------------
    function renderAuthority() {
        var host = el('fx-book-authority');
        if (!host) return;
        if (!_state.loaded) { host.hidden = true; return; }
        if (_state.mayEdit) {
            host.hidden = true; host.innerHTML = '';
            return;
        }
        host.hidden = false;
        // NAMED, NOT MERELY DISABLED. "The button does nothing" is the single worst way to tell somebody
        // they are not allowed to do something, and the reason is the Owner's to act on.
        host.innerHTML = '<strong>Read-only.</strong> This page is showing the stored rates, and saving is '
            + 'not available to you: <code>' + esc(_state.authorityReason || 'FX_NOT_AUTHORISED') + '</code>'
            + (_state.authorityModel ? ' (authority model <code>' + esc(_state.authorityModel) + '</code>)' : '')
            + '. Nothing is missing from the book and nothing you do here can change it.';
    }

    function cell(i, field, value, type) {
        var ro = _state.mayEdit ? '' : ' disabled';
        if (field === 'status') {
            var v = String(value || '').toLowerCase();
            return '<td><select data-i="' + i + '" data-f="status" class="fx-book-in"' + ro + '>'
                + '<option value="active"' + (v === 'active' ? ' selected' : '') + '>active</option>'
                + '<option value="inactive"' + (v !== 'active' ? ' selected' : '') + '>inactive</option>'
                + '</select></td>';
        }
        if (field === 'base_currency' || field === 'quote_currency') {
            // The supported list is the SERVER's (73_'s precision table). A currency this deployment
            // cannot round is not offered, rather than offered and refused on save.
            var opts = ['<option value=""></option>'].concat(_state.currencies.map(function (c) {
                return '<option value="' + esc(c) + '"' + (String(value) === c ? ' selected' : '') + '>' + esc(c) + '</option>';
            })).join('');
            return '<td><select data-i="' + i + '" data-f="' + field + '" class="fx-book-in"' + ro + '>' + opts + '</select></td>';
        }
        return '<td><input type="' + (type || 'text') + '" data-i="' + i + '" data-f="' + field + '" '
            + 'class="fx-book-in' + (type === 'number' ? ' fx-num' : '') + '" value="' + esc(value) + '"'
            + (field === 'effective_to' ? ' placeholder="open-ended"' : '')
            + ro + '></td>';
    }

    function renderBook() {
        var host = el('fx-book-table');
        if (!host) return;
        if (!_state.loaded) { host.innerHTML = '<div class="fx-book-loading">Loading rate book&hellip;</div>'; return; }
        if (!_state.rates.length) {
            host.innerHTML = '<div class="fx-book-note">The rate book is empty. A cross-currency SKU created '
                + 'now is born <code>pending_fx</code> with blank prices — which is the behaviour this page '
                + 'exists to change, and nothing is wrong.</div>';
            return;
        }
        var rows = _state.rates.map(function (e, i) {
            var cls = String(e.status || '').toLowerCase() === 'active' ? 'fx-active' : 'fx-inactive';
            return '<tr data-i="' + i + '" class="' + cls + '">'
                + cell(i, 'base_currency', e.base_currency)
                + cell(i, 'quote_currency', e.quote_currency)
                + cell(i, 'rate', e.rate, 'number')
                + cell(i, 'source', e.source)
                + cell(i, 'as_of', e.as_of, 'date')
                + cell(i, 'effective_from', e.effective_from, 'date')
                + cell(i, 'effective_to', e.effective_to, 'date')
                + cell(i, 'status', e.status)
                + '<td class="fx-book-rowact">'
                + (_state.mayEdit
                    ? '<button type="button" class="fx-book-x" data-drop="' + i + '" '
                      + 'title="Remove this row from the working copy. Nothing is stored until you save.">remove</button>'
                    : '')
                + '</td></tr>';
        }).join('');
        host.innerHTML = '<table class="fx-book-rates"><thead><tr>'
            + '<th>Base</th><th>Quote</th><th>Rate</th><th>Source</th><th>As of</th>'
            + '<th>Effective from</th><th>Effective to</th><th>Status</th><th></th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>'
            + '<p class="fx-book-hint">An empty <em>effective to</em> is open-ended. '
            + 'Two active rows covering the same pair on the same day are refused by the server as ambiguous — '
            + 'close the old period rather than deleting it, so the history survives.</p>';
    }

    function renderFoot() {
        var v = el('fx-book-version');
        if (v) {
            v.textContent = (_state.docVersion === null || _state.docVersion === undefined)
                ? '' : ('read at version ' + _state.docVersion);
        }
        var c = el('fx-book-capacity');
        if (c) {
            if (!_state.capacity) { c.textContent = ''; }
            else {
                var used = Number(_state.capacity.used_bytes) || 0;
                var lim = Number(_state.capacity.limit_bytes) || 0;
                var pct = lim ? Math.round((used / lim) * 100) : 0;
                c.innerHTML = 'Stored size ' + used + ' of ' + lim + ' bytes (' + pct + '%).'
                    + (pct >= 80 ? ' <strong>Close to the limit.</strong> A save that would not fit is '
                        + 'refused in full — retire periods that are over rather than letting it arrive as a surprise.' : '');
            }
        }
        var btn = el('fx-book-save');
        if (btn) btn.disabled = !(_state.loaded && _state.mayEdit) || _state.busy;
        var add = el('fx-book-add');
        if (add) add.disabled = !(_state.loaded && _state.mayEdit) || _state.busy;
        var draft = el('fx-book-draft');
        if (draft) draft.disabled = !(_state.loaded && _state.mayEdit) || _state.busy;
    }

    // THE SERVER'S RECORD, IN THE SERVER'S FIELDS. This read changed_at / changed_by / old_rate /
    // new_rate; 75_ has never emitted any of them. It writes { at, by, pair, change, ... } where the
    // tail depends on what happened — `to` for an ADDED pair, `from` for a REMOVED one, and `fields`
    // (field / from / to, one per column that moved) for an EDIT. So every cell on this panel was
    // blank for every entry, and a log that renders empty looks exactly like a log with nothing in
    // it: the one panel kept to answer 'who changed this rate, and from what' answered neither.
    //
    // WHO and WHEN are 75_'s. The operator is the identity the server established — not a name the
    // browser sent, which is a claim — and the instant is the server clock in UTC, which is the only
    // representation that can be ordered across the people reading it.
    function stampOf(iso) {
        var s = String(iso || '');
        var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s);
        return m ? (m[1] + ' ' + m[2] + ' UTC') : (s || '—');
    }
    function dash(v) { return (v === null || v === undefined || v === '') ? '—' : v; }
    function summarise(o) {
        if (!o) return '';
        return ['rate', 'source', 'as_of', 'status'].filter(function (k) { return o[k] !== undefined; })
            .map(function (k) { return esc(k) + ' <strong>' + esc(dash(o[k])) + '</strong>'; }).join(', ');
    }
    function renderLog() {
        var host = el('fx-book-logbody');
        if (!host) return;
        if (!_state.log.length) { host.innerHTML = '<div class="fx-book-note">No changes recorded yet.</div>'; return; }
        host.innerHTML = '<table class="fx-book-logtable"><thead><tr>'
            + '<th>When</th><th>Who</th><th>Pair</th><th>Change</th><th>What moved</th></tr></thead><tbody>'
            + _state.log.slice().reverse().map(function (r) {
                r = r || {};
                var kind = String(r.change || '').toUpperCase();
                var what;
                if (kind === 'EDITED') {
                    what = (r.fields || []).map(function (f) {
                        return esc(f.field) + ' <strong>' + esc(dash(f.from)) + '</strong> &rarr; <strong>'
                            + esc(dash(f.to)) + '</strong>';
                    }).join('<br>') || '&mdash;';
                } else if (kind === 'ADDED') {
                    what = summarise(r.to) || '&mdash;';
                } else if (kind === 'REMOVED') {
                    what = summarise(r.from) || '&mdash;';
                } else {
                    // An entry in a shape this build does not know is SHOWN, not dropped. A log that
                    // silently hides what it cannot parse is how a history stops being one.
                    what = '<code>' + esc(JSON.stringify(r).slice(0, 160)) + '</code>';
                }
                return '<tr class="fx-log-' + esc(kind.toLowerCase() || 'other') + '">'
                    + '<td title="' + esc(r.at || '') + '">' + esc(stampOf(r.at)) + '</td>'
                    + '<td>' + esc(dash(r.by)) + '</td>'
                    + '<td>' + esc(dash(r.pair)) + '</td>'
                    + '<td>' + esc(kind || 'CHANGED') + '</td>'
                    + '<td>' + what + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    function showWarnings(errors) {
        var host = el('fx-book-warnings');
        if (!host) return;
        if (!errors || !errors.length) { host.hidden = true; host.innerHTML = ''; return; }
        host.hidden = false;
        host.innerHTML = '<ul class="fx-book-errs">' + errors.map(function (e) {
            return '<li><code>' + esc(e.code || 'FX_ERROR') + '</code> ' + esc(e.message || e.detail || '') + '</li>';
        }).join('') + '</ul>';
    }

    function say(msg) { var s = el('fx-book-savestate'); if (s) s.textContent = msg || ''; }

    function renderAll() { renderAuthority(); renderBook(); renderFoot(); renderLog(); }

    // ------------------------------------------------------------------------------------------------
    // EDIT — the working copy, which is not the book until a save succeeds
    // ------------------------------------------------------------------------------------------------
    function onInput(ev) {
        var t = ev && ev.target;
        if (!t || !t.getAttribute) return;
        var i = t.getAttribute('data-i'), f = t.getAttribute('data-f');
        if (i === null || !f) return;
        var row = _state.rates[Number(i)];
        if (!row) return;
        // A RATE IS KEPT AS TYPED until it is sent. Coercing here would turn '' into 0, and 0 is a rate
        // nobody stated; the server refuses a non-positive rate by name and that is the right place for it.
        row[f] = t.value;
        say('Edited — not saved.');
    }

    function onClick(ev) {
        var t = ev && ev.target;
        if (!t || !t.getAttribute) return;
        var drop = t.getAttribute('data-drop');
        if (drop === null) return;
        if (!_state.mayEdit) return;
        _state.rates.splice(Number(drop), 1);
        renderBook(); say('Row removed from the working copy — not saved.');
    }

    function addRow() {
        if (!_state.mayEdit) return;
        // version 1 — a new pair's first revision. Without it the server refuses the WHOLE book,
        // so one added row used to make every other row unsavable too.
        _state.rates.push({ base_currency: '', quote_currency: '', rate: '', source: 'manual',
            as_of: '', effective_from: '', effective_to: '', status: 'active', version: 1 });
        renderBook(); say('Row added to the working copy — not saved.');
    }

    // THE PREPARED STARTING SET. It is a DRAFT and it stays one: this loads it into the editor, where it
    // can be read and changed, and writes nothing. Nothing on this page writes except Save.
    function loadDraft() {
        if (!_state.mayEdit) return;
        say('Loading the prepared draft…');
        fetch('docs/planning/fx1-r1-staging/fx-rate-book-initial-draft.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
            .then(function (j) {
                var rows = (j && j.rates) || [];
                if (!rows.length) { say('The prepared draft holds no rates.'); return; }
                // THE SAME ROW BUILDER THE SERVER'S ROWS GO THROUGH. The draft file already carries a
                // version per row; rebuilding from FIELDS dropped it, so the prepared starting set was
                // unsavable for the same reason a stored book was.
                _state.rates = rows.map(workingRow);
                renderBook();
                say(rows.length + ' draft row(s) loaded into the editor. NOTHING has been written — '
                    + 'review them and press Save changes if they are right.');
            })
            .catch(function (err) {
                say('');
                showWarnings([{ code: 'FX_DRAFT_UNAVAILABLE',
                    message: 'The prepared draft could not be read (' + String(err && err.message || err)
                        + '). This changes nothing about the stored book.' }]);
            });
    }

    // ------------------------------------------------------------------------------------------------
    // LOAD / SAVE
    // ------------------------------------------------------------------------------------------------
    // ADOPT WHAT ARRIVED — AND NOTHING ELSE.
    //
    // A GET and a SAVE do not answer in the same shape, and they should not: a save has nothing new
    // to say about which currencies this deployment can round, and re-sending that list on every
    // write would be a bigger answer for no reason. What was wrong was reading a SAVE's answer as
    // though every field a GET carries had come back EMPTY. So a save that SUCCEEDED cleared the
    // currency list (and with it every <select>'s options, so the next save would have sent blank
    // currencies), blanked the capacity meter, and set may_edit false — which disabled the editor,
    // removed the row controls and raised the read-only band naming an authority failure that had
    // not happened. The operator's reward for a successful save was a page that said they were not
    // allowed to save.
    //
    // `fresh` marks the answer that establishes the whole page (the GET). For that one an absent
    // field really does mean absent. For a SAVE, an absent field means UNCHANGED.
    function adopt(data, opts) {
        data = data || {};
        var fresh = !!(opts && opts.fresh);
        if (data.rates !== undefined) {
            _state.repairedVersions = 0;
            _state.serverRates = data.rates || [];
            _state.rates = _state.serverRates.map(workingRow);
        }
        if (typeof data.doc_version === 'number') _state.docVersion = data.doc_version;
        else if (fresh) _state.docVersion = null;
        if (data.supported_currencies !== undefined) _state.currencies = data.supported_currencies || [];
        else if (fresh) _state.currencies = [];
        if (data.change_log !== undefined) _state.log = data.change_log || [];
        else if (fresh) _state.log = [];
        // The SAVE answer reports the stored size under different names (bytes / limit) because it is
        // reporting what the commit MEASURED rather than what the property happened to hold when the
        // page opened. Read either, so the meter is refreshed by a save rather than merely surviving
        // one — the number really did change, and showing the old one would be its own small lie.
        if (data.capacity !== undefined) _state.capacity = data.capacity || null;
        else if (typeof data.bytes === 'number') {
            _state.capacity = { used_bytes: data.bytes,
                limit_bytes: (typeof data.limit === 'number') ? data.limit
                    : (_state.capacity ? _state.capacity.limit_bytes : null) };
        } else if (fresh) _state.capacity = null;
        // A SAVE THAT SUCCEEDED IS PROOF OF PERMISSION. 75_ runs its authority gate before it reads a
        // single field, so a success cannot have come from a caller who may not edit.
        if (data.may_edit !== undefined) _state.mayEdit = !!data.may_edit;
        else if (fresh) _state.mayEdit = false;
        if (data.authority_model !== undefined) _state.authorityModel = data.authority_model || null;
        else if (data.authority !== undefined) _state.authorityModel = data.authority || null;
        else if (fresh) _state.authorityModel = null;
        if (data.authority_reason !== undefined) _state.authorityReason = data.authority_reason || null;
        else if (fresh) _state.authorityReason = null;
        _state.loaded = true;
    }

    function load() {
        if (!(window.KM && window.KM.DB && typeof window.KM.DB.getFxRateBook === 'function')) {
            // FAIL CLOSED AND SAY WHICH HALF IS MISSING. An empty table here would read as "there are no
            // rates", which is a statement about the database this page is in no position to make.
            showWarnings([{ code: 'FX_BACKEND_UNAVAILABLE',
                message: 'The rate book actions are not available in this build, so the stored book could '
                    + 'not be read. This is a transport gap, not an empty book.' }]);
            _state.loaded = true; _state.mayEdit = false;
            renderAll();
            return Promise.resolve();
        }
        return Promise.resolve(window.KM.DB.getFxRateBook()).then(function (res) {
            if (!res || res.success !== true) {
                showWarnings([{ code: (res && res.error && res.error.code) || 'FX_READ_FAILED',
                    message: (res && res.error && res.error.message)
                        || 'The rate book could not be read. Nothing was changed.' }]);
                _state.loaded = true; _state.mayEdit = false; renderAll();
                return;
            }
            showWarnings([]);
            adopt(res.data || {}, { fresh: true });
            renderAll();
            say(_state.repairedVersions
                ? (_state.repairedVersions + ' stored row(s) arrived without a usable version number and '
                   + 'have been given one. Nothing is saved until you press Save changes.')
                : '');
        }).catch(function (err) {
            showWarnings([{ code: 'FX_READ_THREW', message: String(err && err.message || err) }]);
            _state.loaded = true; _state.mayEdit = false; renderAll();
        });
    }

    function save() {
        if (!_state.mayEdit || _state.busy) return;
        if (typeof _state.docVersion !== 'number') {
            showWarnings([{ code: 'FX_NO_VERSION_IN_HAND',
                message: 'This page has no doc_version to save against, so it will not write. Reload the page.' }]);
            return;
        }
        _state.busy = true; renderFoot(); say('Saving…');
        // SENT AS TYPED, with ONE conversion: the rate becomes a number, because the contract is a number
        // and a numeric string is refused by name. Everything else is the server's to validate.
        var payload = {
            doc_version: _state.docVersion,
            rates: _state.rates.map(function (e) {
                // THE WHOLE ROW, not a rebuild from the drawn columns. Sending only what is on screen
                // deletes every stored field the screen does not show, and the version 75_ requires
                // was the proof of that: the book could not be saved at all.
                var o = {};
                Object.keys(e).forEach(function (k) { o[k] = e[k]; });
                o.rate = (String(e.rate).trim() === '') ? e.rate : Number(e.rate);
                o.version = legalVersion(e.version) === null ? 1 : legalVersion(e.version);
                return o;
            })
        };
        Promise.resolve(window.KM.DB.saveFxRateBook(payload)).then(function (res) {
            _state.busy = false;
            if (!res || res.success !== true) {
                // EVERY PROBLEM, NOT THE FIRST ONE. The transport collapses the server's errors[] to
                // a single `error` for the pages that only ever read one; `errors` is the full list
                // when it carried more, so a book with four bad rows no longer reports one of them
                // and leaves the operator to find the rest by saving again.
                var errs = (res && res.errors && res.errors.length) ? res.errors
                    : (res && res.error ? [res.error] : []);
                showWarnings(errs.length ? errs : [{ code: 'FX_SAVE_FAILED',
                    message: 'The save was refused and NOTHING was written.' }]);
                // A VERSION CONFLICT IS NOT A FAILED EDIT. Somebody else saved while this tab was open;
                // the typing is still on screen, and re-reading is what makes it safe to try again.
                //
                // FX1-R4-R1 — BY ITS OWN CODE, NOT BY THE WORD 'VERSION'. The substring test also
                // matched FX_VERSION_INVALID (a row of THIS operator's own, missing a version) and
                // FX_DOC_VERSION_REQUIRED (this page's request, malformed). Both were then announced
                // as a competing editor, which is a statement about somebody else that was not true,
                // and which sent the operator away to reload instead of toward the field at fault.
                // MEASURED: before the row-version fix below, every save of a non-empty book produced
                // FX_VERSION_INVALID and this page blamed a colleague for it, every time.
                var conflict = errs.some(function (e) { return String(e && e.code) === 'FX_VERSION_CONFLICT'; });
                say(conflict
                    ? 'Somebody else saved this book while you were editing. Your changes are still on '
                      + 'screen and nothing was overwritten — reload to see theirs, then re-apply yours.'
                    : 'Refused — nothing was written.');
                renderFoot();
                return;
            }
            showWarnings([]);
            adopt(res.data || {});          // an UPDATE, not a fresh page — see adopt()
            renderAll();
            say('Saved. The book is now version ' + _state.docVersion + '. No price moved.'
                + (Number(res.data && res.data.log_trimmed) > 0
                    ? ' The oldest ' + Number(res.data.log_trimmed) + ' change record(s) were dropped to '
                      + 'keep the book inside one Script Property.' : ''));
        }).catch(function (err) {
            _state.busy = false;
            showWarnings([{ code: 'FX_SAVE_THREW', message: String(err && err.message || err) }]);
            say('The save could not be completed. Whether it was stored is unknown — reload before trying again.');
            renderFoot();
        });
    }

    // ------------------------------------------------------------------------------------------------
    // MOUNT
    // ------------------------------------------------------------------------------------------------
    function bind() {
        var host = el('fx-rate-book-section');
        if (!host || host.getAttribute('data-fx-bound') === '1') return;
        host.setAttribute('data-fx-bound', '1');
        host.addEventListener('input', onInput);
        host.addEventListener('change', onInput);
        host.addEventListener('click', onClick);
        var s = el('fx-book-save'); if (s) s.addEventListener('click', save);
        var a = el('fx-book-add'); if (a) a.addEventListener('click', addRow);
        var d = el('fx-book-draft'); if (d) d.addEventListener('click', loadDraft);
    }

    function ensureMarkup() {
        if (document.getElementById('fx-rate-book-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('fx-rate-book', 'assets/html/pages/fx-rate-book.html', '#fx-rate-book-mount')
                .then(function () { return true; })
                .catch(function (err) {
                    try { console.warn('[FxRateBook] partial load failed:', err); } catch (e) {}
                    return false;
                });
        }
        return Promise.resolve(false);
    }

    function mount() {
        return ensureMarkup().then(function () {
            var sec = document.getElementById('fx-rate-book-section');
            if (sec) sec.classList.add('active');
            bind();
            return load();        // READ-ONLY — opening the page never writes
        });
    }

    window.KM = window.KM || {};
    window.KM.fxRateBookPage = { mount: mount, reload: load, _state: _state };

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('fx-rate-book-section', {
            mount: function () { mount(); },
            unmount: function () {}
        });
    }
}());
