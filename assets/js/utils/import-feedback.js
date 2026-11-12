(function () {
    'use strict';
    window.KM = window.KM || {};
    var controllers = {};
    function controller(key, config) {
        if (controllers[key]) return controllers[key];
        var phase = 'idle', saved = [], storageKey = 'km.import-review.r11.' + key;
        try { if (sessionStorage.getItem(storageKey)) phase = 'unknown'; } catch (e) {}
        function roots() { return config.roots.map(function (id) { return document.getElementById(id); }).filter(Boolean); }
        function buttons() { return Array.prototype.slice.call(document.querySelectorAll(config.buttons)); }
        function note(text) {
            roots().forEach(function (root) {
                var n = root.querySelector('[data-import-feedback]');
                if (!n && !text) return;
                if (!n) { n = document.createElement('p'); n.setAttribute('data-import-feedback', ''); n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); n.style.cssText = 'margin:8px 0;color:#334155;font-size:13px;'; (root.querySelector('.pc-modal__body,.ovs-modal-body,.fc-modal-body,.replen-modal-body') || root).appendChild(n); }
                n.textContent = text;
            });
        }
        function remember() {
            var nodes = buttons();
            roots().forEach(function (r) { nodes = nodes.concat(Array.prototype.slice.call(r.querySelectorAll('button,input,select,textarea'))); });
            saved = nodes.filter(function (n, i) { return nodes.indexOf(n) === i; }).map(function (n) {
                return { node: n, disabled: n.disabled, text: n.textContent, aria: n.getAttribute('aria-busy') };
            });
        }
        function restore() {
            saved.forEach(function (s) { s.node.disabled = s.disabled; if (s.aria === null) s.node.removeAttribute('aria-busy'); else s.node.setAttribute('aria-busy', s.aria); });
        }
        function reserve(b) {
            var rect = b.getBoundingClientRect();
            if (b.dataset.importSized) return;
            var span = document.createElement('span'); span.textContent = 'Importing...';
            span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
            if (window.getComputedStyle) span.style.font = window.getComputedStyle(b).font;
            document.body.appendChild(span);
            b.style.minWidth = Math.max(rect.width || 0, span.getBoundingClientRect().width + 28, 116) + 'px';
            b.style.minHeight = (rect.height || 32) + 'px'; span.remove(); b.dataset.importSized = '1';
        }
        function label(text, disabled) {
            buttons().forEach(function (b) {
                reserve(b);
                b.textContent = text; b.disabled = disabled; b.setAttribute('aria-busy', phase === 'reading' || phase === 'writing' ? 'true' : 'false');
            });
        }
        function pendingMarker(on) { try { if (on) sessionStorage.setItem(storageKey, 'review-required'); else sessionStorage.removeItem(storageKey); } catch (e) {} }
        function zeroWrite(value) {
            if (value && value.zero_write === true) return true;
            var msg = String(value && value.message || value && value.error || value || '');
            // These are existing pre-dispatch Sandbox refusals, not generic error guesses.
            if (/\b(SANDBOX_WRITE_NOT_ALLOWED|SANDBOX_ACTION_NOT_ALLOWED|CALLER_CREDENTIAL_REQUIRED|CALLER_CREDENTIAL_NOT_CONFIGURED)\b/.test(msg)) return true;
            var db = window.KM && window.KM.DB;
            try { return !!(db && db.zeroWriteProven && db.zeroWriteProven(msg) === true); } catch (e) { return false; }
        }
        var api = {
            blocked: function () { return phase === 'reading' || phase === 'writing' || phase === 'unknown'; },
            active: function () { return phase === 'reading' || phase === 'writing'; },
            done: function () { return phase === 'done'; },
            phase: function () { return phase; },
            reset: function () {
                if (api.blocked()) { if (phase === 'unknown') { label('Check result', true); note('Import result is unknown. Check the saved data before another import.'); } return false; }
                restore(); saved = []; phase = 'idle'; buttons().forEach(reserve); note(''); return true;
            },
            begin: function () {
                if (phase !== 'idle') return false;
                remember(); phase = 'reading'; saved.forEach(function (s) { s.node.disabled = true; }); label('Importing...', true); note('Importing...'); return true;
            },
            writing: function () {
                if (phase !== 'reading') throw new Error('Import is not ready to send.');
                phase = 'writing'; pendingMarker(true);
            },
            endRead: function () { if (phase === 'reading') { phase = 'idle'; restore(); saved.forEach(function (s) { if (buttons().indexOf(s.node) !== -1) s.node.textContent = s.text; }); note(''); } },
            finish: function (result) {
                if (phase !== 'writing') return false;
                if (result && result.success === true) { phase = 'done'; pendingMarker(false); restore(); label('Done', false); note('Imported.'); return true; }
                api.fail(result); return false;
            },
            fail: function (error) {
                if (phase === 'done') { note('Imported. Refresh failed; do not import again.'); return; }
                if (phase === 'reading') { api.endRead(); return; }
                if (phase !== 'writing') return;
                if (zeroWrite(error)) { phase = 'idle'; pendingMarker(false); restore(); label('Import', false); note('Not imported. Nothing was written.'); }
                else { phase = 'unknown'; restore(); label('Check result', true); note('Import result is unknown. Check the saved data before another import.'); }
            }
        };
        buttons().forEach(reserve);
        controllers[key] = api; return api;
    }
    window.KM.importFeedback = { controller: controller };
})();
