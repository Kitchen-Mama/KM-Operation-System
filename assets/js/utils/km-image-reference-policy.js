/*
 * ================================================================================================================
 * KM_IMAGE_REFERENCE_POLICY — P1-B8C-R3
 *
 * THE ONE PLACE THAT DECIDES WHETHER A STORED IMAGE REFERENCE MAY REACH AN `<img src>`.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS AN EXTRACTION RATHER THAN A SECOND MAPPING. Two pages already resolved
 * `sku_details.image_url`, and they disagreed:
 *
 *   SKU Details   sku-overrides.js -> getNormalizedSkuImage -> resolveSkuImageUrl -> <img src>
 *                 Upgrades http:// to https:// on an https page, and PASSES EVERYTHING ELSE THROUGH.
 *   Product Strategy
 *                 km-product-pricing-adapter.js -> imageStateOf -> /^https?:\/\// -> VERIFIED_DB_MAPPING
 *                 An ABSOLUTE url, or nothing.
 *
 * THE LIVE CONSEQUENCE, MEASURED IN P1-B8C-R2. `sku_details.image_url` in production is a REPO-RELATIVE path
 * (`assets/img/products/CO1100-R.jpg`) — the seven mappings in psb-data-contract.js were asserted sku by sku by
 * the operator against the live rows — and R2's sixty live rows reached VERIFIED_DB_MAPPING ZERO times. So SKU
 * Details draws the photograph, because a browser resolves a relative path against the page, and Product
 * Strategy draws a fallback marker for the very same row, because the regex wanted a scheme. ONE VALUE, TWO
 * ANSWERS, AND NEITHER SIDE WAS CONSULTING THE OTHER. The design freeze already said the board "inherits that
 * classification"; the regex was the drift, and this file is where the classification now actually lives.
 *
 * THE SECOND DEFECT, WHICH IS THE MORE SERIOUS ONE. SKU Details had NO VALIDATION AT ALL. `javascript:alert(1)`,
 * `C:\Users\...\photo.jpg` and a bare Drive id all went into `src` verbatim. PASSING A VALUE THROUGH IS NOT THE
 * SAME AS ACCEPTING IT, and this file is the first thing in the chain that tells the two apart.
 *
 * WHAT IS NOT HERE. No sku -> file composition. Nothing in this file turns a sku into a path, a directory or an
 * extension: it only ever judges a value some row already carried. P0-R3-R1 retracted exactly that inference —
 * "a filename proves the file's name; that is all it proves" — and nothing here reinstates it.
 *
 * PURE. No DOM, no clock, no storage. The page origin is a PARAMETER with a `location` default, so the same
 * reference plus the same origin gives the same verdict in a browser, in Node and in a test.
 * ================================================================================================================
 */
(function (root) {
  'use strict';

  var P = {};

  P.CONTRACT_ID = 'KM_IMAGE_REFERENCE_POLICY_V1';

  /* An extension is how a relative reference proves it names a FILE rather than an opaque id.
     `CO1100-R.jpg` is a path a browser can fetch; `1AbCdEf...` is a Drive id that resolves to a 404
     against the page. */
  P.IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico'];

  /* THE ALLOWLIST IS OPERATOR-OWNED AND SHIPS EMPTY, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
     Nothing in this repository names an approved image host: no CSP, no img-src, no configuration value,
     and P1-B8C-R2 measured zero absolute urls across sixty live rows. An allowlist invented here would be
     a hostname somebody guessed, enforced as policy. The page's OWN origin is approved without being
     listed, because that is not a guess — it is wherever this file is already running from. */
  P.APPROVED_EXTERNAL_HOSTS = [];

  P.KINDS = ['ABSENT', 'SAME_ORIGIN_ASSET', 'ABSOLUTE_APPROVED', 'REJECTED'];
  P.REJECTION_REASONS = ['UNSUPPORTED_SCHEME', 'LOCAL_FILE_PATH', 'PATH_TRAVERSAL', 'OPAQUE_REFERENCE',
    'NOT_AN_IMAGE_FILENAME', 'UNAPPROVED_HOST'];

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function hasImageExtension(pathPart) {
    var p = String(pathPart).toLowerCase().split('?')[0].split('#')[0];
    for (var i = 0; i < P.IMAGE_EXTENSIONS.length; i++) {
      if (p.slice(-P.IMAGE_EXTENSIONS[i].length) === P.IMAGE_EXTENSIONS[i]) return true;
    }
    return false;
  }
  P.hasImageExtension = hasImageExtension;

  /* The page's origin, read per call and never cached, so a test can hand in a different one and a browser
     needs to hand in nothing. `window.location` and the bare `location` are the same object in a page and
     are NOT the same object in a vm sandbox, so both are looked for — an origin found only one of the two
     ways is an origin that works in production and silently empties under test. */
  function locationOf() {
    try { if (root.location && typeof root.location === 'object') return root.location; } catch (e) {}
    try { if (root.window && root.window.location) return root.window.location; } catch (e) {}
    return null;
  }

  function hostOfLocation(loc) {
    var h = str(loc.host);
    if (h !== '') return h.toLowerCase();
    // `origin` is the other spelling, and it carries the scheme that has to come back off.
    var m = /^[A-Za-z][A-Za-z0-9+.\-]*:\/\/([^\/?#]+)/.exec(str(loc.origin));
    return m ? m[1].toLowerCase() : '';
  }

  function originOf(opts) {
    var o = opts || {};
    if (o.pageProtocol !== undefined || o.pageHost !== undefined) {
      return { protocol: str(o.pageProtocol), host: str(o.pageHost).toLowerCase() };
    }
    var loc = locationOf();
    if (loc) return { protocol: str(loc.protocol), host: hostOfLocation(loc) };
    return { protocol: '', host: '' };
  }
  P.originOf = originOf;

  function reject(reason, raw) {
    return { accepted: false, kind: 'REJECTED', reason: reason, url: '', input: raw, note: null };
  }

  /**
   * THE WHOLE POLICY, IN ONE FUNCTION.
   *
   * Returns { accepted, kind, reason, url, input, note }. `url` is '' unless `accepted`, so a caller that
   * reads nothing but `url` still cannot put a refused reference into the DOM.
   */
  P.classify = function (raw, opts) {
    var v = str(raw);
    if (v === '') {
      return { accepted: false, kind: 'ABSENT', reason: 'NO_IMAGE_URL_ON_RECORD', url: '', input: v, note: null };
    }

    /* A control character, a quote, an angle bracket or a backslash means the value is not one plain
       address. Checked before every other rule so nothing downstream has to defend against a smuggled
       newline or a broken-out attribute. */
    if (v.indexOf('\\') !== -1) return reject('LOCAL_FILE_PATH', v);
    if (/[\u0000-\u001F\u007F<>"'`]/.test(v)) return reject('UNSUPPORTED_SCHEME', v);
    if (/\s/.test(v)) return reject('UNSUPPORTED_SCHEME', v);

    // `C:/Users/...` — a local file that happens to have been typed with forward slashes.
    if (/^[A-Za-z]:\//.test(v)) return reject('LOCAL_FILE_PATH', v);
    if (/^file:/i.test(v)) return reject('LOCAL_FILE_PATH', v);

    if (v.indexOf('..') !== -1) return reject('PATH_TRAVERSAL', v);

    var org = originOf(opts);
    var approved = (opts && opts.approvedHosts) || P.APPROVED_EXTERNAL_HOSTS;

    /* ---- absolute, and protocol-relative, which is absolute wearing the page's scheme ---------------- */
    var m = /^(https?:)?\/\/([^\/?#]+)(\/[^?#]*)?/i.exec(v);
    if (m) {
      var host = String(m[2]).toLowerCase();
      if (!hasImageExtension(m[3] || '')) return reject('NOT_AN_IMAGE_FILENAME', v);
      var sameOrigin = (org.host !== '' && host === org.host);
      var listed = false;
      for (var i = 0; i < approved.length; i++) {
        if (String(approved[i]).toLowerCase() === host) { listed = true; break; }
      }
      if (!sameOrigin && !listed) return reject('UNAPPROVED_HOST', v);

      /* F1-7N-FB-4E-R3 §F, PRESERVED EXACTLY: an http:// image on an https:// page is mixed content and the
         browser blocks it, so the scheme is upgraded at render time. This rewrites nothing stored. */
      var url = v;
      if (/^http:\/\//i.test(url) && org.protocol === 'https:') {
        url = 'https://' + url.slice('http://'.length);
      }
      return { accepted: true, kind: 'ABSOLUTE_APPROVED', reason: null, url: url, input: v,
        note: url === v ? null : 'UPGRADED_HTTP_TO_HTTPS' };
    }

    // Any other scheme — javascript:, data:, vbscript:, mailto: — is not an image address.
    if (/^[A-Za-z][A-Za-z0-9+.\-]*:/.test(v)) return reject('UNSUPPORTED_SCHEME', v);

    /* ---- same-origin relative ------------------------------------------------------------------------ */
    /* THE ONE RULE THAT SEPARATES A REPO ASSET FROM A DRIVE ID. Both are bare strings a browser would
       resolve against the page; only one of them names a file. A Spreadsheet or Drive id carries no
       extension, which is why the extension is the test and the LENGTH of the id is not — a rule keyed on
       length would refuse a deeply-nested legitimate path and accept a short id. */
    if (!hasImageExtension(v)) return reject('OPAQUE_REFERENCE', v);
    return { accepted: true, kind: 'SAME_ORIGIN_ASSET', reason: null, url: v, input: v, note: null };
  };

  /** The string form, for a caller that only wants something to put in `src`. '' means "do not render". */
  P.resolve = function (raw, opts) { return P.classify(raw, opts).url; };

  P.CONTRACT = {
    id: P.CONTRACT_ID,
    one_policy_per_system: true,
    per_page_policy_permitted: false,
    pure: true,
    composes_a_path_from_a_sku: false,
    page_origin_is_a_parameter: true,
    external_hosts_are_operator_declared: true,
    consumers: ['assets/js/utils/sku-overrides.js  (SKU Details, SKU Handbook)',
      'assets/js/api/km-product-pricing-adapter.js  (Product Strategy)']
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = P; }
  root.KM_IMAGE_REFERENCE_POLICY = P;
}(typeof globalThis !== 'undefined' ? globalThis : this));
