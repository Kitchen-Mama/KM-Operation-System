'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const token = 'po200-shared-20261127-v2';
const pages = ['factory-stock', 'purchase-order-list', 'overseas-stock', 'shipping-history'];

test('all shared-importer callers use the reviewed release token', () => {
  for (const page of pages) {
    const source = read('assets/js/pages/' + page + '.js');
    const loads = [...source.matchAll(/assets\/js\/utils\/import-batch\.js\?v=([^'"\s]+)/g)];
    assert.equal(loads.length, 1, page);
    assert.equal(loads[0][1], token, page);
  }
});

test('each caller is reachable through a freshly versioned entry point', () => {
  const index = read('index.html');
  for (const page of pages.filter(p => p !== 'overseas-stock')) {
    assert(index.includes('assets/js/pages/' + page + '.js?v=' + token), page);
  }
  assert(index.includes('assets/js/app.js?v=' + token));
  assert(read('assets/js/app.js').includes('assets/js/pages/overseas-stock.js?v=' + token));
});

test('only PO and factory imports gain the 200-row limit', () => {
  assert.match(read('assets/js/utils/po-factory-import.js'), /MAX_ROWS\s*=\s*200\b/);
  assert.match(read('assets/specs/active/apps-script/82_api_v1_po_factory_import.gs'), /PFI_MAX_INPUT_ROWS_\s*=\s*200\b/);
  assert.match(read('assets/specs/active/apps-script/82a_factory_atomic_commit.gs'), /PFA_MAX_BYTES_\s*=\s*8000000\b/);
});
