'use strict';
// Read-only check for the reviewed publication form: comments/layout can differ, executable AST cannot.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const builder = require('./build-apps-script-bundle.js');
const built = builder.buildBundleFromDisk(path.join(root, 'assets/js/core'));
const file = path.join(root, 'assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs');
const published = fs.readFileSync(file, 'utf8');
// Node's bundled Acorn is used only by this local verification tool; no runtime/production dependency.
const parserSource = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
assert(parserSource, 'PARSER_UNAVAILABLE: use the pinned workspace Node runtime');
const parserModule = { exports: {} };
vm.runInNewContext(parserSource, { module: parserModule, exports: parserModule.exports });
const syntax = text => JSON.stringify(parserModule.exports.parse(text, { ecmaVersion: 'latest' }), (key, value) => ['start', 'end', 'raw', 'loc'].includes(key) ? undefined : value);
assert.equal(syntax(published), syntax(built.code), 'PUBLISHED_BUNDLE_EXECUTABLE_AST_MISMATCH');
const context = {};
vm.createContext(context); vm.runInContext(published, context);
assert.equal(context.KM_BUNDLE_CONTENT_HASH_, built.hash, 'BUNDLE_SOURCE_HASH_MISMATCH');
const country = require('../js/core/supply-planning-country-identity.js');
assert.equal(context.KMCID.VERSION, country.VERSION);
assert.equal(context.KMCID.canonicalCountryCode('UK'), 'GB');
assert.equal(JSON.stringify(context.KMCID.planningSetMembers('EU')), JSON.stringify(country.planningSetMembers('EU')));
console.log('PUBLISHED_BUNDLE_EQUIVALENT modules=' + built.manifest.length + ' source_hash=' + built.hash + ' publication_sha256=' + crypto.createHash('sha256').update(published).digest('hex') + ' AST=PASS runtime_identity=PASS');
console.log('NOTE: exact-byte --check remains a separate check and may fail for the comment/layout-stripped publication; no file was rewritten.');
