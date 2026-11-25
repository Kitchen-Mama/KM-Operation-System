'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { parts } = require('./helpers/write-command-flight-world.cjs');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
const PD = require('../js/core/supply-planning-planning-demand.js');
const CAL = require('../js/core/supply-planning-site-calendar.js');
function world(epoch = Date.parse('2026-11-25T00:30:00Z')) {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
  const c = vm.createContext({ Date: Clock, window: { KM: { core: { planningDemand: PD }, siteCalendar: CAL } } });
  vm.runInContext(source.slice(source.indexOf('window.IRMap = (function'), source.indexOf('// Format an Upcoming Event date range')), c);
  vm.runInContext(parts(source, ['_irForecastQtyText_', '_irForecastBreakdownHtml_', 'escapeReplenHtml']), c);
  return c;
}
const scope = { company: 'KM', country: 'AU', marketplace: 'Amazon', sku: 'CO1100-R', category: 'Opener', series: 'CO1100' };
const names = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function rows() { return [2026, 2027, 2028].map(year => Object.assign({ ...scope, year }, ...names.map((n, i) => ({ [n]: (year - 2025) * 100 + i + 1 })))); }
const plain = x => JSON.parse(JSON.stringify(x));
module.exports = { world, rows, scope, source, root, names };
if (require.main === module) {
  let checks = 0; const c = world(), IR = c.window.IRMap;
  const eq = (a, b) => { assert.deepEqual(plain(a), b); checks++; };
  let fc = rows(), w = IR.forecastWindow(fc, [], scope);
  eq(w.months.map(m => m.ym), ['2026-12','2027-01','2027-02']);
  eq(w.months.map(m => m.label), ['Dec. 2026','Jan. 2027','Feb. 2027']);
  eq(w.months.map(m => m.base), [112,201,202]); eq(w.baseTotal, 515);
  eq(w.adjustedTotal, 515); eq(IR.forecast60d(fc, [], scope, []), 515);
  eq(IR.forecast60d(fc.slice().reverse(), [], scope, []), 515);
  const events = [{ ...scope, year: 2026, eventMonth: 12, fcQty: 10 }, { ...scope, year: 2027, eventMonth: 1, fcQty: 20 },
    { ...scope, year: 2026, eventMonth: 1, fcQty: 9999 }, { ...scope, year: 2028, eventMonth: 2, fcQty: 9999 }];
  eq(IR.forecast60d(fc, [], scope, events), 545);
  eq(IR.forecast60d(fc, [], scope, [{ ...scope, eventStartDate: '2027-02-02', fcQty: 20 }]), 535);
  eq(IR.forecast60d(fc, [], scope, [{ ...events[0], company: 'OTHER' }]), 515);
  const rules = [2026,2027].map(year => ({ ...scope, year, scope_type: 'sku', scope_id: scope.sku, dec_pct: 200, jan_pct: 50, feb_pct: 150 }));
  w = IR.forecastWindow(fc, rules, scope);
  eq(w.months.map(m => m.adjusted), [224,101,303]); eq(w.adjustedTotal, 628);
  eq(IR.forecast60d(fc, rules, scope, []), 515); // Reference is Base FC; breakdown retains Target% semantics.
  for (const m of w.months) eq(m.adjusted, PD.adjustedRegularFc(fc, rules, scope, scope, scope.sku, m.ym).adjusted);
  const oldOnly = IR.forecastWindow(fc.filter(r => r.year === 2026), [], scope);
  eq(oldOnly.months.map(m => m.base), [112,null,null]); eq(oldOnly.baseTotal, null);
  eq(IR.forecast60d(fc.filter(r => r.year === 2026), [], scope, events), null);
  fc = rows(); fc[1].jan = 0; fc[1].feb = 0;
  eq(IR.forecastWindow(fc, [], scope).months.map(m => m.base), [112,0,0]); eq(IR.forecast60d(fc, [], scope, []), 112);
  fc = rows(); fc.push({ ...fc[1], jan: 999 }); eq(IR.forecastWindow(fc, [], scope).months[1].base, null);
  fc = rows(); fc.push({ ...fc[1] }); eq(IR.forecastWindow(fc, [], scope).months[1].base, 201);
  fc = rows(); fc[1].raw = { ...fc[1], jan: '' }; fc[1].jan = 0; eq(IR.forecastWindow(fc, [], scope).months[1].base, null);
  for (const field of ['company','country','marketplace','sku']) {
    fc = rows(); fc[1][field] = 'OTHER'; eq(IR.forecastWindow(fc, [], scope).baseTotal, null);
  }
  fc = rows(); fc.forEach(r => { delete r.year; }); eq(IR.forecastWindow(fc, [], scope).baseTotal, null);
  for (let month = 0; month < 12; month++) {
    const epoch = Date.UTC(2026, month, 15, 12), ctx = world(epoch), actual = ctx.window.IRMap.forecastWindow(rows(), [], scope);
    const expected = [1,2,3].map(off => { const d = new Date(Date.UTC(2026, month + off, 1)); return d.toISOString().slice(0,7); });
    eq(actual.months.map(m => m.ym), expected);
    eq(actual.months.map(m => m.base), expected.map(ym => (Number(ym.slice(0,4)) - 2025) * 100 + Number(ym.slice(5))));
  }
  const boundary = Date.parse('2027-01-01T01:00:00Z'), br = world(boundary).window.IRMap;
  const usRows = rows().map(r => ({ ...r, country: 'US' }));
  eq(br.forecastWindow(usRows, [], { ...scope, country: 'US' }).months.map(m => m.ym), ['2027-01','2027-02','2027-03']);
  eq(br.forecastWindow(rows(), [], scope).months.map(m => m.ym), ['2027-02','2027-03','2027-04']);
  eq(IR.forecastWindow(rows(), [], { ...scope, country: 'UNKNOWN' }).baseTotal, null);
  eq(c._irForecastQtyText_(null), '\u2014'); eq(c._irForecastQtyText_(0), '0');
  const html = c._irForecastBreakdownHtml_({ nextMonth: 'Dec. 2026', next2Month: 'Jan. 2027', next3Month: 'Feb. 2027', fcNextMonth: 112, fcNext2Month: null, fcNext3Month: null });
  eq((html.match(/\u2014/g) || []).length, 3); eq(html.includes('Jan. 2027'), true);
  eq(source.includes('nextMonth: forecast.months[0]'), true); eq(source.includes('IR.forecast60d(fcRows, targetRules, scope, events, upcomingInstant, forecast)'), true);
  console.log('INVENTORY_FORECAST_YEAR_PASS ' + checks + ' live_writes=0');
}
