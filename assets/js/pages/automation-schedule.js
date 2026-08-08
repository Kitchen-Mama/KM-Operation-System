// ADMIN-AUTOMATION-R1 — Automation Schedule Settings (page controller).
// Renders the Administration automation-schedule page. READ-ONLY on load (§N: opening the page NEVER writes a
// property or mutates a trigger — it only calls the read action). Only "Save & Apply" issues a write, which the
// server validates, persists to Script Properties, and reconciles into exactly one owned time trigger.
// No business logic / formula / DB access here — the page is a thin view over automationSchedule.get/update.
(function () {
  'use strict';

  var WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  var _busy = {};   // per-job in-flight guard (prevents duplicate submission)

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(id) { return document.getElementById(id); }
  function pad2(n) { return ('0' + n).slice(-2); }

  function twoDigitOptions(max) {
    var o = '';
    for (var i = 0; i <= max; i++) o += '<option value="' + i + '">' + pad2(i) + '</option>';
    return o;
  }

  function weekdayOptions(sel) {
    return WEEKDAYS.map(function (d) {
      var label = d.charAt(0) + d.slice(1).toLowerCase();
      return '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }

  // Build ONE implemented-automation card. Fields are seeded from the server view (human-friendly labels; the
  // technical handler lives only under the Details expander — no Script ID / URL / secret is ever rendered).
  function renderJobCard(job) {
    var statusCls = job.status === 'ENABLED' ? 'enabled' : (job.status === 'COMING_SOON' ? 'coming' : 'disabled');
    var statusText = job.status === 'ENABLED' ? 'Enabled' : (job.status === 'COMING_SOON' ? 'Coming Soon' : 'Disabled');

    if (!job.implemented) {
      return '<div class="auto-card auto-card--coming auto-card--disabled-job" data-key="' + esc(job.key) + '">'
        + '<div class="auto-card__head"><span class="auto-card__name">' + esc(job.label) + '</span>'
        + '<span class="auto-card__status auto-card__status--coming">Coming Soon</span></div>'
        + '<div class="auto-card__body">This automation is not available yet — its handler has not been implemented. It cannot be scheduled until a future release.</div>'
        + '</div>';
    }

    var isWeekly = job.frequency === 'WEEKLY';
    var triggerCls = job.triggerActive ? 'active' : 'inactive';
    var triggerText = job.triggerActive ? ('Trigger: Active' + (job.triggerCount > 1 ? ' (' + job.triggerCount + ' found — Save & Apply normalizes to one)' : '')) : 'Trigger: None';

    return '<div class="auto-card" data-key="' + esc(job.key) + '">'
      + '<div class="auto-card__head">'
      +   '<span class="auto-card__name">' + esc(job.label) + '</span>'
      +   '<span class="auto-card__status auto-card__status--' + statusCls + '">' + statusText + '</span>'
      + '</div>'
      + '<div class="auto-card__grid">'
      +   '<div class="auto-field"><label class="auto-toggle"><input type="checkbox" data-field="enabled"' + (job.enabled ? ' checked' : '') + '> Enabled</label></div>'
      +   '<div class="auto-field"><label>Frequency</label><select data-field="frequency">'
      +     '<option value="DAILY"' + (!isWeekly ? ' selected' : '') + '>Daily</option>'
      +     '<option value="WEEKLY"' + (isWeekly ? ' selected' : '') + '>Weekly</option>'
      +   '</select></div>'
      +   '<div class="auto-field auto-field--dow"' + (isWeekly ? '' : ' style="display:none"') + '><label>Day of Week</label><select data-field="dayOfWeek">' + weekdayOptions(job.dayOfWeek || 'MONDAY') + '</select></div>'
      +   '<div class="auto-field"><label>Target Time (Asia/Taipei)</label><div class="auto-time-inputs">'
      +     '<select data-field="hour">' + twoDigitOptions(23) + '</select><span class="auto-time-colon">:</span>'
      +     '<select data-field="minute">' + twoDigitOptions(59) + '</select></div></div>'
      +   '<div class="auto-field"><label>Timezone</label><span class="auto-tz">Asia/Taipei</span></div>'
      + '</div>'
      + '<div class="auto-card__foot">'
      +   '<span class="auto-card__trigger auto-card__trigger--' + triggerCls + '">' + esc(triggerText) + '</span>'
      +   '<span class="auto-card__meta">Last updated: ' + (job.lastUpdatedAt ? esc(job.lastUpdatedAt) : '—') + '</span>'
      +   '<span class="auto-card__msg" data-role="msg"></span>'
      +   '<button type="button" class="auto-btn" data-role="save" onclick="automationSaveJob(\'' + esc(job.key) + '\')">Save &amp; Apply</button>'
      + '</div>'
      + '<details class="auto-details"><summary>Details</summary><div class="auto-details__body">Handler: <code>' + esc(job.details && job.details.handler ? job.details.handler : 'n/a') + '</code></div></details>'
      + '</div>';
  }

  function selectVal(card, field, val) {
    var e = card.querySelector('[data-field="' + field + '"]');
    if (e) e.value = String(val);
  }

  function render(view) {
    var host = el('auto-sched-cards');
    if (!host) return;
    var jobs = (view && view.jobs) || [];
    host.innerHTML = jobs.map(renderJobCard).join('') || '<div class="auto-sched-loading">No automations configured.</div>';

    // Seed the hour/minute/day selects (option lists are static; set the current value per card).
    jobs.forEach(function (job) {
      if (!job.implemented) return;
      var card = host.querySelector('.auto-card[data-key="' + job.key + '"]');
      if (!card) return;
      selectVal(card, 'hour', job.hour);
      selectVal(card, 'minute', job.minute);
      if (job.dayOfWeek) selectVal(card, 'dayOfWeek', job.dayOfWeek);
      // Toggle the day-of-week field when frequency changes.
      var freq = card.querySelector('[data-field="frequency"]');
      if (freq) freq.addEventListener('change', function () {
        var dow = card.querySelector('.auto-field--dow');
        if (dow) dow.style.display = (freq.value === 'WEEKLY') ? '' : 'none';
      });
    });

    renderWarnings(view && view.warnings);
  }

  function renderWarnings(warnings) {
    var box = el('auto-sched-warnings');
    if (!box) return;
    if (!warnings || !warnings.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = warnings.map(function (w) { return '<div class="auto-sched-warn">⚠ ' + esc(w.message) + '</div>'; }).join('');
  }

  function readCardConfig(card) {
    function v(field) { var e = card.querySelector('[data-field="' + field + '"]'); return e ? e.value : null; }
    function checked(field) { var e = card.querySelector('[data-field="' + field + '"]'); return !!(e && e.checked); }
    var cfg = { enabled: checked('enabled'), frequency: v('frequency'), hour: parseInt(v('hour'), 10), minute: parseInt(v('minute'), 10) };
    if (cfg.frequency === 'WEEKLY') cfg.dayOfWeek = v('dayOfWeek');
    return cfg;
  }

  function setMsg(card, text, kind) {
    var m = card.querySelector('[data-role="msg"]');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'auto-card__msg' + (kind ? ' auto-card__msg--' + kind : '');
  }

  // Save & Apply — validate on the server, persist, reconcile ONE trigger, then re-render from the truthful result.
  function saveJob(key) {
    if (_busy[key]) return;                    // §10 disable duplicate submission
    var host = el('auto-sched-cards');
    var card = host && host.querySelector('.auto-card[data-key="' + key + '"]');
    if (!card) return;
    var btn = card.querySelector('[data-role="save"]');
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.updateAutomationSchedule === 'function')) {
      setMsg(card, 'Automation API is unavailable.', 'err');
      return;
    }
    _busy[key] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setMsg(card, '', null);
    var cfg = readCardConfig(card);

    Promise.resolve(window.KM.DB.updateAutomationSchedule({ key: key, config: cfg })).then(function (res) {
      if (res && res.success && res.data) {
        var updated = null;
        (res.data.jobs || []).forEach(function (j) { if (j.key === key) updated = j; });
        var timeLabel = updated ? (pad2(updated.hour) + ':' + pad2(updated.minute)) : '';
        var trig = (updated && updated.triggerActive) ? 'Active' : 'None';
        render(res.data);   // re-render truthful state (trigger status, last-updated, warnings) for all cards
        var card2 = host.querySelector('.auto-card[data-key="' + key + '"]');
        if (card2) setMsg(card2, 'Schedule updated. Target time: ' + timeLabel + ' Asia/Taipei · Trigger: ' + trig, 'ok');
      } else {
        // User-safe message only; keep the technical error in the console / response metadata (§10).
        var code = (res && res.error && res.error.code) || 'UPDATE_FAILED';
        try { console.warn('[AutomationSchedule] update failed', res && res.error); } catch (e) {}
        setMsg(card, friendlyError(code), 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Save & Apply'; }
      }
    }).catch(function (err) {
      try { console.warn('[AutomationSchedule] update error', err); } catch (e) {}
      setMsg(card, 'Could not update the schedule. Please try again.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Save & Apply'; }
    }).then(function () { _busy[key] = false; });
  }

  function friendlyError(code) {
    switch (code) {
      case 'WEEKLY_RECOMMENDATION_NOT_AVAILABLE': return 'This automation is not available yet and cannot be enabled.';
      case 'INVALID_TIME': return 'Please enter a valid target time.';
      case 'INVALID_DAY_OF_WEEK': return 'Please choose a day of the week for a weekly schedule.';
      case 'INVALID_FREQUENCY': return 'Please choose Daily or Weekly.';
      case 'NOT_AUTHORIZED': return 'You are not authorized to change automation schedules.';
      default: return 'Could not update the schedule. Please try again.';
    }
  }

  function loadAndRender() {
    var host = el('auto-sched-cards');
    if (host) host.innerHTML = '<div class="auto-sched-loading">Loading automation schedules…</div>';
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.getAutomationSchedule === 'function')) {
      if (host) host.innerHTML = '<div class="auto-sched-loading">Automation API is unavailable.</div>';
      return;
    }
    Promise.resolve(window.KM.DB.getAutomationSchedule()).then(function (res) {
      if (res && res.success && res.data) { render(res.data); }
      else {
        try { console.warn('[AutomationSchedule] load failed', res && res.error); } catch (e) {}
        if (host) host.innerHTML = '<div class="auto-sched-loading">Could not load automation schedules.</div>';
      }
    }).catch(function (err) {
      try { console.warn('[AutomationSchedule] load error', err); } catch (e) {}
      if (host) host.innerHTML = '<div class="auto-sched-loading">Could not load automation schedules.</div>';
    });
  }

  function ensureMarkup() {
    if (document.getElementById('automation-schedule-section')) return Promise.resolve(true);
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
      return window.KM.partialLoader
        .loadPartial('automation-schedule', 'assets/html/pages/automation-schedule.html', '#automation-schedule-mount')
        .then(function () { return true; })
        .catch(function (err) { try { console.warn('[AutomationSchedule] partial load failed:', err); } catch (e) {} return false; });
    }
    return Promise.resolve(false);
  }

  // Inline handler bridge.
  window.automationSaveJob = saveJob;
  window.initAutomationSchedulePage = loadAndRender;

  if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('automation-schedule-section', {
      mount: function () {
        ensureMarkup().then(function () {
          var sec = document.getElementById('automation-schedule-section');
          if (sec) sec.classList.add('active');
          loadAndRender();   // READ-ONLY — never writes on mount
        });
      },
      unmount: function () {}
    });
  }
})();
