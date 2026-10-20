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
        busy: false
    };

    var FIELDS = ['base_currency', 'quote_currency', 'rate', 'source', 'as_of',
                  'effective_from', 'effective_to', 'status'];

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

    function renderLog() {
        var host = el('fx-book-logbody');
        if (!host) return;
        if (!_state.log.length) { host.innerHTML = '<div class="fx-book-note">No changes recorded yet.</div>'; return; }
        host.innerHTML = '<table class="fx-book-logtable"><thead><tr>'
            + '<th>When</th><th>Who</th><th>Pair</th><th>Was</th><th>Became</th></tr></thead><tbody>'
            + _state.log.slice().reverse().map(function (r) {
                return '<tr><td>' + esc(r.changed_at) + '</td><td>' + esc(r.changed_by) + '</td>'
                    + '<td>' + esc(r.pair || '') + '</td>'
                    + '<td class="fx-num">' + esc(r.old_rate === null || r.old_rate === undefined ? '—' : r.old_rate) + '</td>'
                    + '<td class="fx-num">' + esc(r.new_rate === null || r.new_rate === undefined ? '—' : r.new_rate) + '</td></tr>';
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
        _state.rates.push({ base_currency: '', quote_currency: '', rate: '', source: 'manual',
            as_of: '', effective_from: '', effective_to: '', status: 'active' });
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
                _state.rates = rows.map(function (e) {
                    var o = {}; FIELDS.forEach(function (f) { o[f] = e[f] === undefined ? '' : e[f]; }); return o;
                });
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
    function adopt(data) {
        _state.serverRates = (data && data.rates) || [];
        _state.rates = _state.serverRates.map(function (e) {
            var o = {}; FIELDS.forEach(function (f) { o[f] = e[f] === undefined ? '' : e[f]; }); return o;
        });
        _state.docVersion = (data && typeof data.doc_version === 'number') ? data.doc_version : null;
        _state.currencies = (data && data.supported_currencies) || [];
        _state.log = (data && data.change_log) || [];
        _state.capacity = (data && data.capacity) || null;
        _state.mayEdit = !!(data && data.may_edit);
        _state.authorityModel = (data && data.authority_model) || null;
        _state.authorityReason = (data && data.authority_reason) || null;
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
            adopt(res.data || {});
            renderAll();
            say('');
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
                var o = {};
                FIELDS.forEach(function (f) { o[f] = e[f]; });
                o.rate = (String(e.rate).trim() === '') ? e.rate : Number(e.rate);
                return o;
            })
        };
        Promise.resolve(window.KM.DB.saveFxRateBook(payload)).then(function (res) {
            _state.busy = false;
            if (!res || res.success !== true) {
                var errs = (res && res.errors) || (res && res.error ? [res.error] : []);
                showWarnings(errs.length ? errs : [{ code: 'FX_SAVE_FAILED',
                    message: 'The save was refused and NOTHING was written.' }]);
                // A VERSION CONFLICT IS NOT A FAILED EDIT. Somebody else saved while this tab was open;
                // the typing is still on screen, and re-reading is what makes it safe to try again.
                var conflict = errs.some(function (e) { return /VERSION/i.test(String(e && e.code)); });
                say(conflict
                    ? 'Somebody else saved this book while you were editing. Your changes are still on '
                      + 'screen and nothing was overwritten — reload to see theirs, then re-apply yours.'
                    : 'Refused — nothing was written.');
                renderFoot();
                return;
            }
            showWarnings([]);
            adopt(res.data || {});
            renderAll();
            say('Saved. The book is now version ' + _state.docVersion + '. No price moved.');
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
