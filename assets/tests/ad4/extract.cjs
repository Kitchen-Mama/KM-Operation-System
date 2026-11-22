'use strict';
// Extract top-level functions / var statements from a page source by NAME, with a string/comment/regex-aware brace scanner.
// Used to run the REAL page code (never a re-statement of it) in a vm context. Pure text work, no network, no repo write.
const crypto = require('crypto');

function skipString(src, i) { const q = src[i]; i++; while (i < src.length) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === q) return i + 1; i++; } return i; }
function skipTemplate(src, i) {
  i++;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') { i = skipBraces(src, i + 1); continue; }
    i++;
  }
  return i;
}
// i points at '{'; returns index just after the matching '}'
function skipBraces(src, i) {
  let depth = 0, prevSig = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i); prevSig = 'x'; continue; }
    if (c === '`') { i = skipTemplate(src, i); prevSig = 'x'; continue; }
    if (c === '/') {
      // regex literal when the previous significant char cannot end an expression
      if (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prevSig) >= 0) {
        i++;
        let inClass = false;
        while (i < src.length) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) { i++; break; } else if (d === '\n') break; i++; }
        while (/[a-z]/i.test(src[i] || '')) i++;
        prevSig = 'x'; continue;
      }
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return i;
}
// i points at the start of a var statement; returns index after the terminating ';' at depth 0
function skipStatement(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return i + 1;
    i++;
  }
  return i;
}

// pickFn(name) / pickVar(name) -> boolean. Returns [{kind,name,start,end,text}] in source order.
function extract(src, pickFn, pickVar) {
  const out = [];
  const rxFn = /^function[ ]+([A-Za-z_$][A-Za-z0-9_$]*)[ ]*\(/gm;
  const rxVar = /^(?:var|let|const)[ ]+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m;
  while ((m = rxFn.exec(src))) {
    if (!pickFn(m[1])) continue;
    const open = src.indexOf('{', src.indexOf(')', m.index));
    const end = skipBraces(src, open);
    out.push({ kind: 'function', name: m[1], start: m.index, end, text: src.slice(m.index, end) });
  }
  while ((m = rxVar.exec(src))) {
    if (!pickVar(m[1])) continue;
    const end = skipStatement(src, m.index);
    out.push({ kind: 'var', name: m[1], start: m.index, end, text: src.slice(m.index, end) });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
module.exports = { extract, sha };
