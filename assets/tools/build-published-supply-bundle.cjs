'use strict';
// Preserve the repository's comment-stripped publication form; executable AST must match the canonical build.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const builder = require('./build-apps-script-bundle.js');
const root = path.resolve(__dirname, '../..'), built = builder.buildBundleFromDisk(path.join(root, 'assets/js/core'));
const native = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
assert(native, 'Node bundled Acorn unavailable');
const mod = { exports: {} };
vm.runInNewContext(native, { module: mod, exports: mod.exports });
const parser = mod.exports, comments = [];
const canonical = parser.parse(built.code, { ecmaVersion: 'latest', onComment: comments });
let code = built.code;
comments.reverse().forEach(c => { code = code.slice(0, c.start) + code.slice(c.start, c.end).replace(/[^\r\n]/g, '') + code.slice(c.end); });
code = code.split('\n').map(line => line.trim()).join('\n');
const shape = ast => JSON.stringify(ast, (k, v) => ['start', 'end', 'raw', 'loc'].includes(k) ? undefined : v);
assert.equal(shape(parser.parse(code, { ecmaVersion: 'latest' })), shape(canonical), 'Publication changed executable AST');
const dir = path.join(root, 'assets/specs/active/apps-script');
fs.writeFileSync(path.join(dir, '90_generated_supply_planning_bundle.gs'), code);
for (const name of ['01_router.gs', '63_api_v1_system_health.gs']) {
  const file = path.join(dir, name), original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(/("symbol": "KM_BUNDLE_CONTENT_HASH_",\s*"expected": ")[a-f0-9]{64}(")/g, '$1' + built.hash + '$2');
  assert(updated.includes('"expected": "' + built.hash + '"'), 'Bundle hash pin missing: ' + name);
  fs.writeFileSync(file, updated);
}
console.log('PUBLISHED_SUPPLY_BUNDLE_PASS modules=' + built.manifest.length + ' hash=' + built.hash + ' AST=PASS');
