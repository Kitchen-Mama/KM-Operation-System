'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const sandbox = { console, location: { protocol: 'https:', host: 'kitchen-mama.github.io' } };
sandbox.window = sandbox; vm.createContext(sandbox);
for (const name of ['km-repo-asset-manifest.js','km-image-reference-policy.js','sku-overrides.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/utils',name),'utf8'), sandbox, { filename: name });
}
const m = sandbox.KM_REPO_ASSET_MANIFEST, p = sandbox.KM_IMAGE_REFERENCE_POLICY;
const files = [];
function walk(dir) { for (const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
  const rel = dir + '/' + e.name; if(e.isDirectory()) walk(rel); else files.push(rel);
} }
m.roots.forEach(walk); files.sort();
assert.deepEqual(Array.from(m.files),files);
assert.equal(m.count,files.length);
const image = 'assets/img/products/SJ1210-R.jpg';
assert.equal(m.has(image),true);
assert.equal(p.classify(image).accepted,true);
assert.equal(sandbox.getNormalizedSkuImage({sku:'SJ1210-R',image_url:image}),image);
assert.equal(sandbox.classifySkuImageSource({sku:'SJ1210-R',image_url:image}).state,'PRESENT');
assert.equal(sandbox.getNormalizedSkuImage({sku:'SJ1210-R',image_url:''}),'');
assert.equal(p.classify('assets/img/products/sj1210-r.jpg').reason,'REPO_ASSET_CASE_MISMATCH');
assert.equal(p.classify('assets/img/products/MISSING-FIXTURE.jpg').reason,'REPO_ASSET_NOT_FOUND');
assert.equal(p.classify('C:/Users/person/SJ1210-R.jpg').accepted,false);
console.log('Product image manifest: 10 checks passed');
