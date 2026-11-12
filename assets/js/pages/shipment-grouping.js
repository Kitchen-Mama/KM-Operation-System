(function () {
    'use strict';
    var id = 'shipment-grouping-section', generation = 0, busy = false, policy = null, uncertain = false;
    function section() { return document.getElementById(id); }
    function message(text) { var s = section(); if (s) s.querySelector('[data-status]').textContent = text; }
    function controls(saving) {
        var s = section(); if (!s) return;
        s.querySelector('[data-settings]').disabled = saving || !policy || uncertain;
        s.querySelector('[data-save]').disabled = saving || !policy || uncertain;
        s.querySelector('[data-save]').textContent = saving ? 'Saving...' : 'Save';
        s.querySelector('[data-refresh]').disabled = saving;
    }
    function read() {
        if (busy) return Promise.resolve(false);
        var epoch = ++generation; policy = null; controls(false); message('Loading...');
        return window.KM.DB.getShipmentConsolidationPolicy().then(function (r) {
            if (epoch !== generation) return;
            if (!r || !r.success || !r.policy || ['SEPARATE', 'SAME_COMPANY', 'CROSS_COMPANY'].indexOf(r.policy.mode) < 0 || !Number.isSafeInteger(r.policy.version)) throw Error('READ_FAILED');
            policy = r.policy; uncertain = false;
            var s = section(); if (!s) return;
            s.querySelector('[value="' + policy.mode + '"]').checked = true;
            s.querySelector('[data-version]').textContent = 'Version ' + policy.version + (policy.updated_at ? ' / ' + policy.updated_at : '');
            message(''); controls(false);
        }).catch(function () { if (epoch === generation) { message('Settings could not be loaded. Refresh to try again.'); controls(false); } });
    }
    function save(event) {
        event.preventDefault(); if (busy || uncertain || !policy) return;
        var s = section(), choice = s.querySelector('[name=shipmentGrouping]:checked'), actor = s.querySelector('[name=actor]').value.trim(), reason = s.querySelector('[name=reason]').value.trim();
        if (!choice || !actor || !reason) { message('Choose a policy and enter your name and reason.'); return; }
        var epoch = generation; busy = true; controls(true); message('');
        return window.KM.DB.saveShipmentConsolidationPolicy({ mode: choice.value, expected_version: policy.version, actor: actor, reason: reason }).then(function (r) {
            if (epoch !== generation) return;
            if (r && r.success && r.policy) { policy = r.policy; s.querySelector('[data-version]').textContent = 'Version ' + policy.version; message('Saved.'); return; }
            if (r && r.zero_write === true) { message(r.code === 'POLICY_EDIT_CONFLICT' ? 'Settings changed. Refresh before saving again.' : 'Not saved. Check the settings and refresh.'); policy = null; return; }
            uncertain = true; message('Result unknown. Refresh to check the saved policy. Nothing was resent.');
        }).catch(function () { if (epoch === generation) { uncertain = true; message('Result unknown. Refresh to check the saved policy. Nothing was resent.'); } })
          .then(function () { busy = false; if (epoch === generation) controls(false); });
    }
    function mount(epoch) {
        return window.KM.partialLoader.loadPartial('shipment-grouping', 'assets/html/pages/shipment-grouping.html', '#shipment-grouping-mount').then(function () {
            if (epoch != null && window.KM.lifecycle.commitGuard && !window.KM.lifecycle.commitGuard(epoch, id)) return false;
            var s = section(); if (!s) return false; s.classList.add('active');
            if (!s.dataset.bound) { s.dataset.bound = 'yes'; s.querySelector('[data-form]').addEventListener('submit', save); s.querySelector('[data-refresh]').addEventListener('click', read); }
            return read();
        });
    }
    window.KM.lifecycle.register(id, { mount: mount, unmount: function () { ++generation; policy = null; } });
    window.KM.shipmentGrouping = { read: read, mount: mount };
})();
