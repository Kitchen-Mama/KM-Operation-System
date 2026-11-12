(function () {
    'use strict';
    var nativeFetch = window.fetch.bind(window), session = '', expires = 0, endpoint = '';
    // Public endpoint only. Never copy the Sandbox caller credential into the login layer.
    endpoint = window.KM_PRODUCTION_CONFIG_ && window.KM_PRODUCTION_CONFIG_.endpoint || '';
    var meta = document.querySelector('meta[name="km-access-endpoint"]');
    // Production endpoint comes only from the frozen public configuration.
    var endpointOk = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(endpoint);
    var storageKey = 'km-password-access-v1:' + endpoint;
    function forgetSession() {
        try { window.sessionStorage.removeItem(storageKey); } catch (e) { /* Storage may be disabled. */ }
    }
    function rememberSession() {
        try { window.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, endpoint: endpoint, access_session: session, expires_at: expires })); } catch (e) { /* Keep memory-only access when storage is unavailable. */ }
    }
    function restoreSession() {
        if (!endpointOk) return;
        try {
            var saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null'), now = Date.now();
            if (!saved) return;
            if (saved.version !== 1 || saved.endpoint !== endpoint || typeof saved.access_session !== 'string' ||
                !/^[0-9a-f]{64}$/.test(saved.access_session) || typeof saved.expires_at !== 'number' ||
                !isFinite(saved.expires_at) || saved.expires_at <= now || saved.expires_at - now > 4 * 60 * 60 * 1000) {
                forgetSession(); return;
            }
            session = saved.access_session; expires = saved.expires_at;
        } catch (e) { forgetSession(); }
    }
    // Same-tab reload only. The server still checks expiry and revocation on every request.
    restoreSession();
    var waiting = [], cover, form, error, field, busy = false, configFlight = null, configStarted = 0;
    function locked() { return !session || Date.now() >= expires; }
    function show(message) {
        session = ''; expires = 0; forgetSession();
        if (cover) { cover.hidden = false; error.textContent = message || ''; field.focus(); }
    }
    function rejectWaiting() { var q = waiting; waiting = []; q.forEach(function (w) { w.reject(new Error('Sign in required. Nothing was resent.')); }); }
    function authError() { var e = new Error('Sign in required. Nothing was sent.'); e.apiCode = 'AUTH_REQUIRED'; e.zero_write = true; return e; }
    function ready(signal) {
        if (signal && signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
        if (!locked()) return Promise.resolve();
        if (cover && cover.hidden) show('Please sign in again.');
        return new Promise(function (resolve, reject) {
            var waiter;
            function cleanup() { waiting = waiting.filter(function (w) { return w !== waiter; }); if (signal) signal.removeEventListener('abort', abort); }
            function abort() { cleanup(); reject(new DOMException('Aborted', 'AbortError')); }
            waiter = { resolve: function () { cleanup(); resolve(); }, reject: function (e) { cleanup(); reject(e); } };
            waiting.push(waiter); if (signal) signal.addEventListener('abort', abort, { once: true });
        });
    }
    window.KM = window.KM || {};
    window.KM.passwordAccess = { whenSignedIn: ready, isSignedIn: function () { return !locked(); }, assertWriteAllowed: function () { if (locked()) { show('Please sign in again.'); throw authError(); } } };
    function postAuth(body) {
        if (!endpointOk) return Promise.reject(new Error('Sign in is not available.'));
        var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 30000);
        return nativeFetch(endpoint, { method: 'POST', cache: 'no-store', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
            .then(function (r) { return r.json(); }).finally(function () { clearTimeout(timer); });
    }
    function configForLogin() {
        // Public salt only, held in memory briefly while the user enters the password.
        if (!configFlight || performance.now() - configStarted >= 60000) {
            configStarted = performance.now();
            configFlight = postAuth({ action: 'auth.config' }).then(function (c) {
                return c && c.success && c.iterations === 600000 && c.hash === 'SHA-256' && /^[0-9a-f]{64}$/.test(c.salt) ? c : null;
            }).catch(function () { return null; });
        }
        return configFlight;
    }
    async function login(event) {
        event.preventDefault(); if (busy) return;
        busy = true; form.querySelector('button').disabled = true; error.textContent = '';
        var password = field.value; field.value = '';
        try {
            var c = await configForLogin();
            if (!c) throw new Error('not ready');
            var salt = Uint8Array.from(c.salt.match(/../g), function (v) { return parseInt(v, 16); });
            var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); password = '';
            var bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 600000, hash: 'SHA-256' }, key, 256));
            var derived = Array.from(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); bytes.fill(0);
            var r = await postAuth({ action: 'auth.login', password_key: derived }); derived = '';
            if (!r || !r.success || !/^[0-9a-f]{64}$/.test(r.access_session) || !isFinite(r.expires_at) || r.expires_at <= Date.now()) {
                configFlight = null;
                error.textContent = r && r.code === 'AUTH_RATE_LIMIT' ? 'Please wait a minute and try again.' : 'Unable to sign in. Check your password or try again.'; return;
            }
            session = r.access_session; expires = r.expires_at; rememberSession(); cover.hidden = true;
            var q = waiting; waiting = []; q.forEach(function (w) { w.resolve(); });
        } catch (e) { configFlight = null; error.textContent = 'Unable to sign in. Please try again.'; }
        finally { password = ''; busy = false; form.querySelector('button').disabled = false; }
    }
    window.fetch = function (input, init) {
        var u; try { u = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return Promise.reject(e); }
        if (!/^script\.google\.com$/.test(u.hostname)) return nativeFetch(input, init);
        if (!endpointOk || u.origin + u.pathname !== endpoint) return Promise.reject(new Error('Unrecognized application endpoint.'));
        if (typeof input !== 'string') return Promise.reject(new Error('Unsupported authenticated request.'));
        if (locked() && String((init && init.method) || 'GET').toUpperCase() !== 'GET') { show('Please sign in again.'); return Promise.reject(authError()); }
        return ready(init && init.signal).then(function () {
            if (init && init.signal && init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            if (locked()) { show('Please sign in again.'); throw new Error('Sign in required. Nothing was sent.'); }
            var body = {}, options = Object.assign({}, init || {}), method = String(options.method || 'GET').toUpperCase();
            if (method === 'GET') {
                u.searchParams.forEach(function (v, k) { if (k !== 'km_ct') body[k] = v; });
                if (body.km_body) { var extra = JSON.parse(body.km_body); if (extra.action && extra.action !== body.action) throw new Error('Request action mismatch.'); Object.keys(extra).forEach(function (k) { if (k !== 'action') body[k] = extra[k]; }); delete body.km_body; }
            } else if (method === 'POST') body = JSON.parse(options.body || '{}');
            else throw new Error('Unsupported application request.');
            if (!body || typeof body !== 'object' || Array.isArray(body) || !body.action || /^auth\./.test(body.action)) throw new Error('Unsupported application request.');
            if (u.searchParams.get('action') && u.searchParams.get('action') !== body.action) throw new Error('Request action mismatch.');
            var sentSession = session;
            body.access_session = sentSession;
            // The password-derived credential and the short-lived session never enter a URL.
            u.search = ''; // No caller credential is used in Production.
            u.searchParams.set('action', body.action); u.searchParams.set('km_via', 'post');
            options.method = 'POST'; options.body = JSON.stringify(body); options.cache = 'no-store'; options.headers = { 'Content-Type': 'text/plain' };
            return nativeFetch(u.toString(), options).then(function (response) {
                return response.clone().json().then(function (r) {
                    if (r && /^AUTH_/.test(r.code || '') && !r.success && session === sentSession) { show('Please sign in again.'); rejectWaiting(); }
                    return response; // No automatic replay, especially for writes.
                }, function () { return response; });
            });
        });
    };
    function mount() {
        cover = document.createElement('section'); cover.id = 'km-password-access';
        cover.innerHTML = '<form><img src="assets/img/logo_500_500-removebg.png" alt="Kitchen Mama"><h1>Kitchen Mama</h1><label for="km-access-password">Password</label><input id="km-access-password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Sign in</button><p role="status" aria-live="polite"></p></form>';
        document.body.appendChild(cover); form = cover.querySelector('form'); field = form.querySelector('input'); error = form.querySelector('p'); form.addEventListener('submit', login); field.focus();
        if (!locked()) cover.hidden = true;
        else { forgetSession(); configForLogin(); }
        var logout = document.createElement('button'); logout.id = 'km-access-logout'; logout.textContent = 'Sign out'; logout.type = 'button';
        logout.onclick = async function () {
            if (busy) return;
            if (locked()) { show('Please sign in again.'); return; }
            busy = true; form.querySelector('button').disabled = true;
            var logoutSession = session;
            show('Signing out...'); rejectWaiting();
            try { var r = await postAuth({ action: 'auth.logout', access_session: logoutSession }); if (!r.success) throw Error('unavailable'); location.reload(); }
            catch (e) { show('Signed out here. Close this tab if you cannot reconnect.'); rejectWaiting(); }
            finally { busy = false; form.querySelector('button').disabled = false; }
        };
        var header = document.querySelector('.top-header .header-right');
        if (header) { var identity = header.querySelector('.user-info'); if (identity) identity.textContent = 'Shared access'; header.appendChild(logout); }
        else document.body.appendChild(logout);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
