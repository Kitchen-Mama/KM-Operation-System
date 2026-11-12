(function () {
    'use strict';
    var C = window.KM_PRODUCTION_CONFIG_, nativeFetch = window.fetch.bind(window), flight = null;
    var G = { verdict: null, mode: 'PRODUCTION', profile: C && C.profile_id, identity: null };
    window.KM_PRODUCTION_GUARD_ = G;
    function fail(code) { G.verdict = code; G.identity = null; return new Error(code); }
    function endpoint(url) { return url.origin + url.pathname === C.endpoint; }
    function control(action, body) {
        if (!C || C.allowed.indexOf(action) < 0) throw new Error('PRODUCTION_ACTION_NOT_ENABLED');
        if (/^import\./.test(action) && (!body || !C.import_scopes || !Object.prototype.hasOwnProperty.call(C.import_scopes, body.domain) ||
            (['import.template.get', 'import.validate', 'import.commit'].indexOf(action) >= 0 ?
                C.import_scopes[body.domain].indexOf(body.mode) < 0 :
                ['import.receipt.get', 'import.history.list'].indexOf(action) < 0))) throw new Error('PRODUCTION_IMPORT_SCOPE_REFUSED');
    }
    function identity() {
        if (flight) return flight;
        if (!C || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(C.endpoint)) return Promise.reject(fail('PRODUCTION_CONFIGURATION_REQUIRED'));
        flight = nativeFetch(C.endpoint + '?action=getClientCapabilities', { method: 'GET', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (r) {
            var p = r && r.production_gate;
            if (!r.success || !p || p.environment !== 'KM_PRODUCTION' || p.profile_id !== C.profile_id ||
                p.policy_sha256 !== C.policy_sha256 || p.db_fp !== C.db_fp || p.bound_equals_constant !== true || p.module_stamps_ok !== true || p.flat_v2 !== true ||
                p.administration_enabled !== false || p.ai_plan_enabled !== false) throw fail('PRODUCTION_IDENTITY_MISMATCH');
            G.identity = p; G.verdict = 'VERIFIED'; return true;
        }).catch(function (e) { if (!G.verdict) fail('PRODUCTION_IDENTITY_UNAVAILABLE'); throw e; });
        return flight;
    }
    G.ready = identity;
    G.environmentKey = function () { return G.verdict === 'VERIFIED' ? 'production:' + C.endpoint_sha256 + ':' + C.db_fp + ':' + C.profile_id : ''; };
    G.isActionAllowed = function (a) { return !!C && C.allowed.indexOf(a) >= 0; };
    window.fetch = function (input, init) {
        var u;
        try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return Promise.reject(e); }
        if (!/^(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|script\.googleapis\.com)$/.test(u.hostname)) return nativeFetch(input, init);
        if (!C || !endpoint(u) || typeof input !== 'string') return Promise.reject(new Error('PRODUCTION_ENDPOINT_MISMATCH'));
        if (['km_ct', 'access_session', 'password', 'password_key'].some(function (k) { return u.searchParams.has(k); })) return Promise.reject(new Error('PRODUCTION_CREDENTIAL_IN_URL'));
        var body = {}, action = u.searchParams.get('action') || '', method = String(init && init.method || 'GET').toUpperCase();
        try {
            if (method === 'POST') body = JSON.parse(init.body || '{}');
            else if (method === 'GET') { u.searchParams.forEach(function (v, k) { body[k] = v; }); if (body.km_body) { var extra = JSON.parse(body.km_body); if (extra.action && extra.action !== action) throw new Error('REQUEST_ACTION_MISMATCH'); Object.assign(body, extra); } }
            else throw new Error('UNSUPPORTED_METHOD');
            if (!body || typeof body !== 'object' || Array.isArray(body) || (action && body.action && action !== body.action)) throw new Error('REQUEST_ACTION_MISMATCH');
            action = action || body.action; control(action, body);
            if (C.reads.indexOf(action) < 0) window.KM.passwordAccess.assertWriteAllowed();
        } catch (e) { return Promise.reject(e); }
        return identity().then(function () { return nativeFetch(input, init); });
    };
    if (window.XMLHttpRequest) {
        var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, url) { this.__kmProdUrl = String(url); return open.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function () { if (/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|script\.googleapis\.com)\//.test(this.__kmProdUrl || '')) throw new Error('PRODUCTION_XHR_REFUSED'); return send.apply(this, arguments); };
    }
    if (navigator.sendBeacon) { var beacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (url, data) { if (/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|script\.googleapis\.com)\//.test(String(url))) return false; return beacon(url, data); }; }
    function restrictUi() {
        // Only the owner-tool entry is exposed; business administration stays gated.
        document.querySelectorAll('[data-parent="administration"] .menu-item:not([data-owner-password-entry]),#replen-ai-plan-btn,#ro-ai-plan-btn').forEach(function (el) { el.hidden = true; el.style.display = 'none'; });
    }
    function mount() {
        restrictUi();
        var old = window.showSection;
        if (typeof old === 'function') window.showSection = function (name) {
            if (['automation', 'shipment-grouping', 'site-priority', 'fx-rate-book'].indexOf(name) >= 0) return false;
            return old.apply(this, arguments);
        };
        new MutationObserver(restrictUi).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
