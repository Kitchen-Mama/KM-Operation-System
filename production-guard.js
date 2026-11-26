(function () {
    'use strict';
    var C = window.KM_PRODUCTION_CONFIG_, nativeFetch = window.fetch.bind(window), flight = null;
    var G = { verdict: null, mode: 'PRODUCTION', profile: C && C.profile_id, identity: null };
    // During the manual GS rollout, retain the exact prior policy for its existing actions only.
    var priorPolicy = '27eedfe4914bcebb1431b7680f5720046e937f49e3f35a7f205212f4c949add8';
    var preWarehousePolicy = 'cc77c5a4692be7e787c65557198f7d673bcc06ece2cfb658f6655601fffd9420';
    var preStatusPolicy = 'ab29a81c6c86068efdaebd4d2e2ee19846dc953709c14e1373e17cbe8d8842ab';
    var preMixedPolicy = '320bc376386e5da3c6af894746f69e8b2ceb1291992a0ba1aa698703a00c8221';
    var preCampaignPolicy = 'ead55e3515dc2e807724274b5c27c0b519b0c8f969364e314f0737c1e0e3c87c';
    var preRepairPolicy = '0afcd8ef72dbffe76d670a765d7769ea1fa382691a0dfdf4f8b59d0b1ffb0161';
    var preAppendPolicy = '5e7d63c7f31a05dc261748eca7f9ab96e993b13586f21e1645cb246e56af8e47';
    var preRepricePolicy = '6d4a8af2ba5379008716e21b10acd3e8044c4f3b95120936a25450fb2fcbfa64';
    var preReviewPolicy = 'e2eafb38f249636bc4657eb8ce00817a267a7547607ee05a1d0017adb3775138';
    var preDocumentRecoveryPolicy = '0026f8ebcc150b0ed8cfd9e411d1ceefa13053283af228a42025dfd40c55d4f7';
    var preCartonOrderPolicy = 'bc5fbba6d72658b1dd4aa5095b75b5b53017f383671236715115069ac5c6b15c';
    var preShipmentPresentationPolicy = '354126dc9ac9f5af0b9e36c09619aa2cce443d08cfb932ad4e86ce799adc4e07';
    var preEuDestinationPolicy = 'b7f1312171e1c458337dd16653f649d231418d0bddc7c8b61e6319ead8f62ed8';
    var preNoRatePolicy = '21998a70bf573bb35f588b295dd0421eafb5336e12190542bc27ef954b7e0547';
    var preEuDocumentCustomsPolicy = "ee2356e6e9b7bbf581b274d9e85ad62b0fde94cee8e11ebef607dd14ab228a0c";
    var preOverseasNoDocsPolicy = "8cbae3c11b6e6444e65c90cfc1f14097a222969e71e0151f9e5d953c9b566f08";
    var preCancelledPlanEditPolicy = "f1e0bdd348032e242d335b2e4496e573734672849237069cb23fff0f256b8762";
    var preDispatchStatusPolicy = "a4acb5a8e7716df04346f11d1f5c170e58aea1fbb5189b49230fa04b7f2132bf";
    var preScopedDispatchPolicy = "b3399adbda1363a7c9fda69a65c584c10bfb4c767419a96a62e9b5b71a2ac136";
    window.KM_PRODUCTION_GUARD_ = G;
    function fail(code) { G.verdict = code; G.identity = null; return new Error(code); }
    function endpoint(url) { return url.origin + url.pathname === C.endpoint; }
    function control(action, body) {
        if (!C || C.allowed.indexOf(action) < 0) throw new Error('PRODUCTION_ACTION_NOT_ENABLED');
        if (action === 'updateRecommendationDecisionLocked' && !rtrMonthlyAllocationEditScope_(body)) throw new Error('PRODUCTION_ALLOCATION_EDIT_SCOPE_REFUSED');
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
            if (r && r.success === false && /^PRODUCTION_(MODULE_MISMATCH|TARGET_MISMATCH|TARGET_UNAVAILABLE|FLAT_V2_REQUIRED)$/.test(r.code || '')) throw fail(r.code);
            if (!r.success || !p || p.environment !== 'KM_PRODUCTION' || p.profile_id !== C.profile_id ||
                (p.policy_sha256 !== C.policy_sha256 && p.policy_sha256 !== priorPolicy && p.policy_sha256 !== preWarehousePolicy && p.policy_sha256 !== preStatusPolicy && p.policy_sha256 !== preMixedPolicy && p.policy_sha256 !== preCampaignPolicy && p.policy_sha256 !== preRepairPolicy && p.policy_sha256 !== preAppendPolicy && p.policy_sha256 !== preRepricePolicy && p.policy_sha256 !== preReviewPolicy && p.policy_sha256 !== preDocumentRecoveryPolicy && p.policy_sha256 !== preCartonOrderPolicy && p.policy_sha256 !== preShipmentPresentationPolicy && p.policy_sha256 !== preEuDestinationPolicy && p.policy_sha256 !== preNoRatePolicy && p.policy_sha256 !== preCancelledPlanEditPolicy && p.policy_sha256 !== preOverseasNoDocsPolicy && p.policy_sha256 !== preEuDocumentCustomsPolicy && p.policy_sha256 !== preDispatchStatusPolicy && p.policy_sha256 !== preScopedDispatchPolicy) || p.db_fp !== C.db_fp || p.bound_equals_constant !== true || p.module_stamps_ok !== true || p.flat_v2 !== true ||
                p.administration_enabled !== false || p.ai_plan_enabled !== false) throw fail('PRODUCTION_IDENTITY_MISMATCH');
            G.identity = p; G.verdict = 'VERIFIED'; return true;
        }).catch(function (e) { flight = null; if (!G.verdict) fail('PRODUCTION_IDENTITY_UNAVAILABLE'); throw e; });
        return flight;
    }
    G.ready = identity;
    G.environmentKey = function () { return G.verdict === 'VERIFIED' ? 'production:' + C.endpoint_sha256 + ':' + C.db_fp + ':' + C.profile_id : ''; };
    G.isActionAllowed = function (a) { return !!C && C.allowed.indexOf(a) >= 0 &&
        !(a === 'shipment.dispatch.status' && (!G.identity || (G.identity.policy_sha256 !== C.policy_sha256 && G.identity.policy_sha256 !== preScopedDispatchPolicy))) &&
        !(a === 'factoryInventory.workspace.get' && (!G.identity || (G.identity.policy_sha256 !== C.policy_sha256 && G.identity.policy_sha256 !== preStatusPolicy && G.identity.policy_sha256 !== preMixedPolicy && G.identity.policy_sha256 !== preCampaignPolicy && G.identity.policy_sha256 !== preRepairPolicy && G.identity.policy_sha256 !== preAppendPolicy && G.identity.policy_sha256 !== preRepricePolicy && G.identity.policy_sha256 !== preReviewPolicy && G.identity.policy_sha256 !== preDocumentRecoveryPolicy && G.identity.policy_sha256 !== preCartonOrderPolicy && G.identity.policy_sha256 !== preShipmentPresentationPolicy && G.identity.policy_sha256 !== preEuDestinationPolicy && G.identity.policy_sha256 !== preNoRatePolicy && G.identity.policy_sha256 !== preCancelledPlanEditPolicy && G.identity.policy_sha256 !== preOverseasNoDocsPolicy && G.identity.policy_sha256 !== preEuDocumentCustomsPolicy && G.identity.policy_sha256 !== preDispatchStatusPolicy && G.identity.policy_sha256 !== preScopedDispatchPolicy))) &&
        !(a === 'gapJob.status.get' && (!G.identity || (G.identity.policy_sha256 !== C.policy_sha256 && G.identity.policy_sha256 !== preMixedPolicy && G.identity.policy_sha256 !== preCampaignPolicy && G.identity.policy_sha256 !== preRepairPolicy && G.identity.policy_sha256 !== preAppendPolicy && G.identity.policy_sha256 !== preRepricePolicy && G.identity.policy_sha256 !== preReviewPolicy && G.identity.policy_sha256 !== preDocumentRecoveryPolicy && G.identity.policy_sha256 !== preCartonOrderPolicy && G.identity.policy_sha256 !== preShipmentPresentationPolicy && G.identity.policy_sha256 !== preEuDestinationPolicy && G.identity.policy_sha256 !== preNoRatePolicy && G.identity.policy_sha256 !== preCancelledPlanEditPolicy && G.identity.policy_sha256 !== preOverseasNoDocsPolicy && G.identity.policy_sha256 !== preEuDocumentCustomsPolicy && G.identity.policy_sha256 !== preDispatchStatusPolicy && G.identity.policy_sha256 !== preScopedDispatchPolicy))) &&
        !(a === 'shippingPlan.mixedCartons.save' && (!G.identity || (G.identity.policy_sha256 !== C.policy_sha256 && G.identity.policy_sha256 !== preCampaignPolicy && G.identity.policy_sha256 !== preRepairPolicy && G.identity.policy_sha256 !== preAppendPolicy && G.identity.policy_sha256 !== preRepricePolicy && G.identity.policy_sha256 !== preReviewPolicy && G.identity.policy_sha256 !== preDocumentRecoveryPolicy && G.identity.policy_sha256 !== preCartonOrderPolicy && G.identity.policy_sha256 !== preShipmentPresentationPolicy && G.identity.policy_sha256 !== preEuDestinationPolicy && G.identity.policy_sha256 !== preNoRatePolicy && G.identity.policy_sha256 !== preCancelledPlanEditPolicy && G.identity.policy_sha256 !== preOverseasNoDocsPolicy && G.identity.policy_sha256 !== preEuDocumentCustomsPolicy && G.identity.policy_sha256 !== preDispatchStatusPolicy && G.identity.policy_sha256 !== preScopedDispatchPolicy))) &&
        !(/^campaign\.builder\./.test(a) && (!G.identity || (G.identity.policy_sha256 !== C.policy_sha256 && G.identity.policy_sha256 !== preRepairPolicy && G.identity.policy_sha256 !== preAppendPolicy && G.identity.policy_sha256 !== preRepricePolicy && G.identity.policy_sha256 !== preReviewPolicy && G.identity.policy_sha256 !== preDocumentRecoveryPolicy && G.identity.policy_sha256 !== preCartonOrderPolicy && G.identity.policy_sha256 !== preShipmentPresentationPolicy && G.identity.policy_sha256 !== preEuDestinationPolicy && G.identity.policy_sha256 !== preNoRatePolicy && G.identity.policy_sha256 !== preCancelledPlanEditPolicy && G.identity.policy_sha256 !== preOverseasNoDocsPolicy && G.identity.policy_sha256 !== preEuDocumentCustomsPolicy && G.identity.policy_sha256 !== preDispatchStatusPolicy && G.identity.policy_sha256 !== preScopedDispatchPolicy))) &&
        !(a === 'updateRecommendationDecisionLocked' && (!G.identity || G.identity.policy_sha256 === priorPolicy)); };
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
        return identity().then(function () {
            if (!G.isActionAllowed(action)) throw new Error(action === 'factoryInventory.workspace.get'
                ? 'PRODUCTION_WAREHOUSE_BACKEND_UPDATE_REQUIRED' : action === 'shipment.dispatch.status'
                ? 'PRODUCTION_DISPATCH_STATUS_BACKEND_UPDATE_REQUIRED' : action === 'gapJob.status.get'
                ? 'PRODUCTION_STATUS_BACKEND_UPDATE_REQUIRED' : action === 'shippingPlan.mixedCartons.save'
                ? 'PRODUCTION_MIXED_CARTONS_BACKEND_UPDATE_REQUIRED' : /^campaign\.builder\./.test(action)
                ? 'PRODUCTION_CAMPAIGN_BACKEND_UPDATE_REQUIRED' : 'PRODUCTION_ALLOCATION_EDIT_BACKEND_UPDATE_REQUIRED');
            return nativeFetch(input, init);
        });
    };
    if (window.XMLHttpRequest) {
        var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, url) { this.__kmProdUrl = String(url); return open.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function () { if (/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|script\.googleapis\.com)\//.test(this.__kmProdUrl || '')) throw new Error('PRODUCTION_XHR_REFUSED'); return send.apply(this, arguments); };
    }
    if (navigator.sendBeacon) { var beacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (url, data) { if (/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+\.)?script\.googleusercontent\.com|script\.googleapis\.com)\//.test(String(url))) return false; return beacon(url, data); }; }
    function rtrMonthlyAllocationEditScope_(body) {
        return !!body && body.recommendationType === 'MONTHLY_ORDER' &&
            typeof body.draftId === 'string' && /^RD::MONTHLY_ORDER::\d{4}-\d{2}::/.test(body.draftId) &&
            !body.reconcile && !body.allowInsert && body.expectedToken && typeof body.expectedToken === 'object' && !Array.isArray(body.expectedToken) &&
            Array.isArray(body.edits) && body.edits.length > 0 && body.edits.length <= 3 && body.edits.every(function (edit) {
                if (!edit || Object.keys(edit).some(function (k) { return ['naturalKey', 'fields'].indexOf(k) < 0; })) return false;
                var key = edit.naturalKey, fields = edit.fields;
                return key && ['T1', 'T2', 'T3'].indexOf(key.request_bucket) >= 0 && /^\d{4}-\d{2}$/.test(key.request_month) &&
                    Object.keys(key).every(function (k) { return ['request_month', 'request_bucket'].indexOf(k) >= 0; }) &&
                    fields && Object.keys(fields).length > 0 && Object.keys(fields).every(function (k) {
                        return k === 'order_qty' ? typeof fields[k] === 'number' && isFinite(fields[k]) && fields[k] >= 0 : k === 'note' && typeof fields[k] === 'string';
                    });
            });
    }
    function restrictUi() {
        // ADMIN-RESTORE (2026-11-13): every Administration entry is visible; each action stays gated by production-config/01_
        // (reads only; every Administration write is refused by control() and by 01_). Only the AI Plan buttons stay hidden.
        document.querySelectorAll('#replen-ai-plan-btn,#ro-ai-plan-btn').forEach(function (el) { el.hidden = true; el.style.display = 'none'; });
    }
    function mount() {
        restrictUi();
        var old = window.showSection;
        if (typeof old === 'function') window.showSection = function (name) {
            return old.apply(this, arguments);
        };
        new MutationObserver(restrictUi).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
