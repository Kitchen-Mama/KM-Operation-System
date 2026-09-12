/*
 * ================================================================================================================
 * P1-B8C-R3 — THE ASSET-EVIDENCE CAPTURE.
 *
 * WHY A THIRD CAPTURE EXISTS, AND WHY NEITHER OF THE OTHER TWO COULD DO THIS JOB.
 *
 * R3 fixes the reason a repo-relative `sku_details.image_url` drew a fallback marker on the board while SKU
 * Details drew the photograph. Proving the fix means RENDERING ONE. Neither existing capture can:
 *
 *   `_p1b8c-capture.js`     DETERMINISTIC. Its image field is a redaction marker by design, and R3 removed that
 *                           marker's extension precisely so it stays undrawable. It is not supposed to have a
 *                           picture.
 *   `_p1b8c-r2-live-derived.js`
 *                           LIVE_DERIVED_REDACTED. The sixty rows came out of production, and the diagnostic
 *                           REMOVED every image address before the log left the Apps Script editor — correctly,
 *                           because an address is a locator. So the live rows cannot demonstrate a rendered
 *                           image either, and saying "the live replay proves the pictures work" would be
 *                           claiming evidence that was deliberately destroyed.
 *
 * WHAT THIS FILE CARRIES, AND WHAT ITS PROVENANCE ACTUALLY IS. The seven image paths below are NOT invented
 * here and are NOT a naming pattern applied to a sku. They are `psb-data-contract.js`'s `IMAGE_POLICY.
 * verified_mappings`, whose basis is recorded there as OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS:
 * the operator stated, sku by sku, the `image_url` the live `sku_details` row carries, and each named file was
 * then checked to exist at that exact path. THEY ARE THE ONLY IMAGE VALUES IN THIS REPOSITORY WITH A
 * PRODUCTION PROVENANCE, which is exactly what R3 needs and exactly why nothing else was substituted.
 *
 * P0-R3-R1'S RETRACTION STILL STANDS AND IS NOT BEING WALKED BACK. A filename that matches a sku proves the
 * file's name and nothing about the bytes. This file reads the SEVEN the operator named and refuses to extend
 * the list by one; the mapping table is imported rather than retyped, so it cannot drift from the contract.
 *
 * PRICES HERE ARE STILL DEMONSTRATION DATA. Only the image identity is operator-asserted. The capture says so
 * in its own fields rather than leaving a reader to infer it from the filename.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  function base() {
    if (root.P1B8C_CAPTURE) return root.P1B8C_CAPTURE;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./_p1b8c-capture.js');
    }
    throw new Error('P1B8C_R3_ASSETS: the deterministic capture must be loaded first');
  }

  /* psb-data-contract.js publishes onto `this`, which is the window in a page and `module.exports`
     under Node — so the same file answers to two different names and BOTH are looked for. */
  function contract() {
    if (root.PSB_CONTRACT) return root.PSB_CONTRACT;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      var m = require('../js/product-strategy/psb-data-contract.js');
      if (m && m.PSB_CONTRACT) return m.PSB_CONTRACT;
      if (m && m.IMAGE_POLICY) return m;
    }
    throw new Error('P1B8C_R3_ASSETS: the data contract must be loaded first');
  }

  var A = {};
  var B = base();

  A.CAPTURE_KIND = 'ASSET_EVIDENCE';
  A.SOURCE_KIND = 'ASSET_EVIDENCE';
  A.IS_LIVE = false;
  A.IS_A_DETERMINISTIC_FIXTURE = true;      // the PRICES are; the image identities are not
  A.IMAGE_IDENTITY_IS_OPERATOR_ASSERTED = true;
  A.PRICES_ARE_DEMONSTRATION_DATA = true;
  A.NOT_LOADED_BY_PRODUCTION = true;
  A.READ_ONLY_CAPTURE = true;
  A.DERIVED_FROM = '_p1b8c-capture.js';
  A.IMAGE_BASIS = 'OPERATOR_ASSERTED_DB_RECORD + EXACT_REPO_FILE_EXISTS';
  A.IMAGE_SOURCE_OF_TRUTH = 'psb-data-contract.js IMAGE_POLICY.verified_mappings';

  A.CONTRACT_VERSION = B.CONTRACT_VERSION;
  A.UNIVERSE_CONTRACT_VERSION = B.UNIVERSE_CONTRACT_VERSION;
  A.SITES = B.SITES;
  A.CATEGORIES = B.CATEGORIES;
  A.siteKey = B.siteKey;
  A.fingerprint = B.fingerprint;
  A.MUST_BE_ABSENT_OR_NULL = B.MUST_BE_ABSENT_OR_NULL;

  /* THE SEVEN, READ FROM THE CONTRACT RATHER THAN COPIED INTO THIS FILE. A copy is a second list that has
     not drifted yet, and the whole of R3 is about two places deciding the same thing differently. */
  A.MAPPINGS = contract().IMAGE_POLICY.verified_mappings;
  A.MAPPED_SKUS = Object.keys(A.MAPPINGS);

  /* NO ABSOLUTE URL IS CARRIED HERE, AND THAT IS A MEASUREMENT RATHER THAN AN OMISSION. The acceptance
     page is opened over `file://`, where `location.host` is the empty string — so nothing can be
     same-origin, and any absolute url this capture carried would be refused for the PAGE's reason rather
     than the policy's. Writing a deploy hostname in here to dodge that would be hard-coding a remote
     address nobody in this round measured. Case 3 of the acceptance list is therefore proven in the unit
     suite, where the origin is an injected parameter and both answers are checkable. */

  /* THE ONE REFERENCE THAT MUST NOT RENDER, CARRIED ON PURPOSE. An acceptance run in which everything
     draws cannot tell "the policy accepts good values" from "the policy accepts everything". */
  A.REFUSED_REFERENCE = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';

  /* Rows take an image by POSITION, deterministically: the first seven rows of each site's list get the
     seven mapped paths in contract order, the eighth gets the reference that must be REFUSED, and every
     row after that carries none. Position is
     used rather than sku matching because the base capture's skus are demonstration skus — pretending
     they ARE the operator's seven would be the substitution P0-R3-R1 retracted. */
  function imageFor(i) {
    if (i < A.MAPPED_SKUS.length) return A.MAPPINGS[A.MAPPED_SKUS[i]];
    if (i === A.MAPPED_SKUS.length) return A.REFUSED_REFERENCE;
    return null;
  }
  A.imageFor = imageFor;

  function withImages(env) {
    var e = JSON.parse(JSON.stringify(env));
    var rows = (e.data && e.data.normalizedRows) || [];
    for (var i = 0; i < rows.length; i++) rows[i].product_image = imageFor(i);
    return e;
  }

  A.workspaceEnvelope = function (site) { return withImages(B.workspaceEnvelope(site)); };
  A.universeEnvelope = function () { return B.universeEnvelope(); };
  A.workspaces = function () {
    var w = B.workspaces(), out = {};
    Object.keys(w).forEach(function (k) { out[k] = withImages(w[k]); });
    return out;
  };

  /** How many rows on one site are expected to draw, and how many are expected to refuse. */
  A.expectedDrawable = function (site) {
    var rows = B.workspaceEnvelope(site).data.normalizedRows.length;
    var n = 0;
    for (var i = 0; i < rows; i++) if (imageFor(i) !== null && imageFor(i) !== A.REFUSED_REFERENCE) n++;
    return n;
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = A; }
  root.P1B8C_R3_ASSETS = A;
}(typeof globalThis !== 'undefined' ? globalThis : this));
