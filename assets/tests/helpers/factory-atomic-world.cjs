'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
function installFactoryAtomic(h, read, gs) {
  vm.runInContext(read(gs + '82a_factory_atomic_commit.gs'), h.c, { filename: '82a_factory_atomic_commit.gs' });
  let id = 0;
  function dimensions() {
    for (const sh of Object.values(h.tables)) if (!sh.getSheetId) {
      const sid = ++id; sh.maxRows = Math.max(sh.grid.length, 5);
      sh.getSheetId = () => sid; sh.getMaxRows = () => sh.maxRows; sh.getMaxColumns = () => sh.grid[0].length;
    }
  }
  h.ss.getId = () => 'SYNTHETIC';
  const atomic = h.atomic = { calls: [], reads: [], beforeApply: null, afterApply: null, dimensions };
  h.c.Sheets = { Spreadsheets: { Values: { batchGet(spreadsheetId, options) {
    assert.equal(spreadsheetId, 'SYNTHETIC'); assert.equal(options.valueRenderOption, 'UNFORMATTED_VALUE');
    atomic.reads.push(options);
    return { valueRanges: options.ranges.map(range => {
      const match = /^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range); assert(match);
      const name = match[1].replace(/''/g, "'");
      const col = s => [...s].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0);
      return { range, values: h.tables[name].grid.slice(+match[3] - 1, +match[5]).map(r => r.slice(col(match[2]) - 1, col(match[4]))) };
    }) };
  } }, batchUpdate(body, spreadsheetId) {
    assert.equal(spreadsheetId, 'SYNTHETIC'); dimensions();
    atomic.calls.push(JSON.parse(JSON.stringify(body)));
    const before = Object.fromEntries(Object.entries(h.tables).map(([name, sh]) => [name, sh.grid.map(r => r.slice())]));
    if (atomic.beforeApply) atomic.beforeApply(body);
    const staged = Object.fromEntries(Object.entries(before).map(([name, grid]) => [name, grid.map(r => r.slice())]));
    const maxRows = Object.fromEntries(Object.entries(h.tables).map(([name, sh]) => [name, sh.maxRows]));
    for (const req of body.requests) {
      assert.equal(Object.keys(req).length, 1);
      const x = req.updateCells || req.appendDimension;
      const sid = x.start ? x.start.sheetId : x.sheetId;
      const name = Object.keys(h.tables).find(n => h.tables[n].getSheetId() === sid); assert(name);
      if (req.appendDimension) { assert.equal(x.dimension, 'ROWS'); maxRows[name] += x.length; continue; }
      assert.equal(x.start.rowIndex + x.rows.length <= maxRows[name], true);
      assert(x.fields === 'userEnteredValue' || x.fields === 'userEnteredValue,userEnteredFormat.numberFormat');
      x.rows.forEach((r, i) => r.values.forEach((c, j) => {
        assert(x.start.columnIndex + j < h.tables[name].getMaxColumns());
        const row = x.start.rowIndex + i;
        while (staged[name].length <= row) staged[name].push([]);
        // an empty CellData under the userEnteredValue mask clears the cell (PO200 writes one for each blank cell of a new row)
        staged[name][row][x.start.columnIndex + j] = c.userEnteredValue ? Object.values(c.userEnteredValue)[0] : '';
      }));
    }
    // The mock validates every request before replacing any business grid, as Sheets batchUpdate does.
    for (const [name, grid] of Object.entries(staged)) {
      h.tables[name].grid.splice(0, h.tables[name].grid.length, ...grid);
      h.tables[name].maxRows = maxRows[name];
    }
    if (atomic.afterApply) atomic.afterApply(body);
    return { spreadsheetId, replies: body.requests.map(() => ({})) };
  } } };
  dimensions();
  return atomic;
}
module.exports = { installFactoryAtomic };
