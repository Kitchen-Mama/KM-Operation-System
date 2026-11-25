// Site Inventory calendar. The caller supplies one instant for the entire calculation run.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.siteCalendar = api; }
})(this, function () {
  'use strict';
  // Planning-day policy, not warehouse location. US/Canada follow the Amazon Pacific reporting day.
  var ZONES = { US: 'America/Los_Angeles', CA: 'America/Los_Angeles', UK: 'Europe/London', GB: 'Europe/London',
    EU: 'Europe/Berlin', DE: 'Europe/Berlin', FR: 'Europe/Paris', IT: 'Europe/Rome', ES: 'Europe/Madrid',
    JP: 'Asia/Tokyo', AU: 'Australia/Sydney', TW: 'Asia/Taipei', CN: 'Asia/Shanghai' };
  function timeZone(country) { return ZONES[String(country || '').trim().toUpperCase()] || null; }
  function localDate(epochMs, country, formatter) {
    var tz = timeZone(country);
    if (!tz || typeof epochMs !== 'number' || !isFinite(epochMs)) throw new Error('SITE_CALENDAR_UNAVAILABLE');
    if (formatter) return formatter(new Date(epochMs), tz);
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(epochMs));
    var by = {}; parts.forEach(function (p) { by[p.type] = p.value; });
    return by.year + '-' + by.month + '-' + by.day;
  }
  return { timeZone: timeZone, localDate: localDate, VERSION: 'site-daily-20261125-v2' };
});
