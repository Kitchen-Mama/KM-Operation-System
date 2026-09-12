/**
 * ==================================================================================================
 * OPERATOR REGISTRY · ACTION PERMISSION · SITE SCOPE                              SEC-A2 §9
 * ==================================================================================================
 *
 * The registry answers three questions in order, and it answers "no" to all of them by default.
 *
 * EMPTY MEANS NOBODY. This is the single property the whole design rests on, and it is the one most
 * often lost by accident — `if (!list.length) return true` reads like a convenience and is a door left
 * open. A list whose purpose is to be narrow must be useless when empty.
 *
 * IDENTITY IS `provider + subject`, NEVER EMAIL. Google's `sub` is stable for the life of the account;
 * an email can be renamed, aliased, or handed to a new hire. A registry keyed on email follows the
 * mailbox rather than the person — which is fine until the day it is very much not.
 *
 * BUT AN OPERATOR MUST BE ADDABLE BEFORE THEY HAVE EVER SIGNED IN, and nobody knows their `sub` in
 * advance. So an entry may be SEEDED by email and is upgraded to a subject on first successful use.
 * The seed is one-way: once `principal_id` is set it wins, and the email is thereafter a label. That
 * is the whole of the compromise, and it is written down rather than discovered.
 *
 * THE REGISTRY NEVER LEAVES THE SERVER. `publicView()` exists so that a diagnostic can report shape
 * without content — counts and statuses, never a name, never an address.
 * ==================================================================================================
 */
'use strict';

var STATUS = { ACTIVE: 'active', DISABLED: 'disabled' };

/**
 * An entry:
 *   { principal_id: 'google:1234' | null,   // the durable key, null until first sign-in
 *     seed_email:   'someone@example'       // how a person is added before they have a subject
 *     display_label:'Ops - planning',       // for humans, never matched on
 *     status:       'active' | 'disabled',
 *     allowed_actions: ['productPricing.siteUniverse.get'],
 *     allowed_sites:   [{company, country, marketplace}],
 *     created_at, updated_at }
 */
function normaliseEmail(e) { return String(e == null ? '' : e).trim().toLowerCase(); }

/** Exactly one match, or null. A duplicate is a configuration error and is reported as one. */
function find(registry, principal) {
  var list = registry || [];
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    /* WILDCARDS ARE NOT MERELY UNSUPPORTED — they are refused, so a '*' typed into config does not
       quietly become an identity that matches everybody. */
    if (e.principal_id === '*' || e.seed_email === '*') continue;
    if (e.principal_id && String(e.principal_id) === principal.identity_key) { hits.push(e); continue; }
    if (!e.principal_id && e.seed_email && normaliseEmail(e.seed_email) === principal.verified_email) {
      hits.push(e);
    }
  }
  if (hits.length !== 1) return null;      // zero, or an ambiguous registry: both are "no"
  return hits[0];
}

function isUsable(entry) {
  return !!entry && String(entry.status) === STATUS.ACTIVE;
}

function mayRunAction(entry, action) {
  if (!isUsable(entry)) return false;
  var list = entry.allowed_actions || [];
  if (!list.length) return false;                       // no actions listed is no actions permitted
  var a = String(action == null ? '' : action);
  if (!a) return false;
  for (var i = 0; i < list.length; i++) {
    /* An exact string, and only an exact string. No prefix match, no '*', no 'productPricing.*'. */
    if (String(list[i]) === '*') continue;              // refused rather than honoured
    if (String(list[i]) === a) return true;
  }
  return false;
}

var ALL_TOKEN = /^all(_sites)?$/i;

function maySeeSite(entry, site) {
  if (!isUsable(entry)) return false;
  var list = entry.allowed_sites || [];
  if (!list.length) return false;
  var c = String((site || {}).company || '').trim();
  var k = String((site || {}).country || '').trim();
  var m = String((site || {}).marketplace || '').trim();
  if (!c || !k || !m) return false;                     // an incomplete key is never in scope
  if (ALL_TOKEN.test(c) || ALL_TOKEN.test(k) || ALL_TOKEN.test(m)) return false;
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    if (ALL_TOKEN.test(String(e.company)) || ALL_TOKEN.test(String(e.country))
      || ALL_TOKEN.test(String(e.marketplace))) continue;      // an ALL entry never matches anything
    if (String(e.company) === c && String(e.country) === k && String(e.marketplace) === m) return true;
  }
  return false;
}

/** Shape without content. Safe for a health or diagnostic response. */
function publicView(registry) {
  var list = registry || [];
  var active = 0, disabled = 0, seeded = 0;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].status) === STATUS.ACTIVE) active++; else disabled++;
    if (!list[i].principal_id) seeded++;
  }
  return { operators: list.length, active: active, disabled: disabled, awaiting_first_sign_in: seeded };
}

/**
 * The one-way upgrade: a seeded entry learns its subject the first time that person is authenticated.
 * Returns a NEW registry; the input is not mutated, so a caller cannot accidentally persist a change
 * it did not intend to make.
 */
function bindSubject(registry, principal) {
  return (registry || []).map(function (e) {
    if (!e.principal_id && e.seed_email && normaliseEmail(e.seed_email) === principal.verified_email) {
      var copy = {}; for (var k in e) copy[k] = e[k];
      copy.principal_id = principal.identity_key;
      copy.updated_at = principal.authenticated_at;
      return copy;
    }
    return e;
  });
}

module.exports = {
  STATUS: STATUS,
  find: find,
  isUsable: isUsable,
  mayRunAction: mayRunAction,
  maySeeSite: maySeeSite,
  publicView: publicView,
  bindSubject: bindSubject,
  normaliseEmail: normaliseEmail
};
