// Inventory Replenishment expanded-row layout guards (2026-07-24). Source-scan checks for the Execution
// Plan grid + Decision Area intrinsic-width repair. Pure Node (no DOM) — the visual acceptance (G/H) is a
// browser pass; these guarantee the structural CSS/JS contract that fixes the overflow.
// Run: node assets/tests/replen-execution-plan.test.js

var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'inventory-replenishment.css'), 'utf8');

// G6 — Execution Plan grid columns exactly: From / To / Qty / Method / Expected Arrival / Action
var head = (js.match(/ir-exec-plan__grid--head[\s\S]{0,260}?<\/div>/) || [''])[0];
['From', 'To', 'Qty', 'Method', 'Expected Arrival', 'Action'].forEach(function (c) {
  eq(new RegExp('>' + c + '<').test(head), true, 'G6: Execution Plan head has "' + c + '" column');
});

// G7 — X button is the last grid child in NORMAL document flow (a grid cell), not absolute-positioned
// F1-7N-FB-4F-B6-R1 — the capture was bounded by a 1600-character budget, and a comment inside the innerHTML
// expression spent it, so the match came back EMPTY and every assertion below reported a missing button that
// is right there. The terminator is what delimits this builder; a character count never did.
var rowBuilder = (js.match(/row\.innerHTML =[\s\S]*?<\/button>';/) || [''])[0];
eq(/replen-card__remove-btn/.test(rowBuilder), true, 'G7: route row renders the remove (X) button');
eq(/removeExecutionRoute/.test(rowBuilder), true, 'G7: X button wired to removeExecutionRoute');
var removeBtnRule = (css.match(/\.exec-route-row \.replen-card__remove-btn\s*\{[\s\S]{0,200}?\}/) || [''])[0];
eq(/position:\s*absolute/.test(removeBtnRule), false, 'G7: X button is NOT absolutely positioned (stays in the Action track)');

// Execution Plan grid = 6 tracks, Action fixed 40px (last), box-sizing so it fits the card
var gridRule = (css.match(/#ops-section \.ir-exec-plan__grid \{[\s\S]{0,700}?\}/) || [''])[0];
eq(/grid-template-columns:[^;]*40px;/.test(gridRule), true, 'G7: Action is a fixed 40px last grid track');
eq((gridRule.match(/minmax|px/g) || []).length >= 6, true, 'G6: six explicit grid tracks');
eq(/box-sizing:\s*border-box/.test(gridRule), true, 'C: exec grid is border-box (fits inside the card)');

// G5 — Decision Area wide enough to hold the full 6-column grid (>= ~540px)
var actionRule = (css.match(/#ops-section \.ir-panel-column--action \{[\s\S]{0,140}?\}/) || [''])[0];
var actionW = (actionRule.match(/width:\s*(\d+)px/) || [])[1];
eq(actionW != null && parseInt(actionW, 10) >= 540, true, 'G5: Decision Area min-width fits the Execution Plan grid (' + actionW + 'px)');

// G1/G2 — left analysis group has a fixed width so it cannot be crushed/covered
var invRule = (css.match(/#ops-section \.ir-panel--inventory-group \{[\s\S]{0,140}?\}/) || [''])[0];
eq(/flex:\s*0 0 \d+px/.test(invRule) && /width:\s*\d+px/.test(invRule), true, 'G1: inventory (left analysis) group has a fixed, non-shrinking width');

// H — single scroll via the main table: expanded row is nowrap + overflow visible, NO nested scrollbar
var scrollRule = (css.match(/#ops-section \.replen-expand-scroll \{[\s\S]{0,900}?\}/) || [''])[0];
eq(/flex-wrap:\s*nowrap/.test(scrollRule), true, 'H: expanded row is a single nowrap flex row (main table scrolls it)');
eq(/overflow:\s*visible/.test(scrollRule), true, 'H: expanded row overflow visible (no clipping)');
eq(/overflow(-x|-y)?:\s*(auto|scroll)/.test(scrollRule), false, 'H: no nested scrollbar on the expanded row');

// G4 — Recommendation Summary stacked directly above Execution Plan (same column, separate cards)
eq(/ir-decision-area/.test(js) && /replen-card--recommendation-summary/.test(js) && /replen-card--execution-plan/.test(js), true, 'G4: Recommendation Summary + Execution Plan stacked in the decision area');
var decisionRule = (css.match(/#ops-section \.ir-decision-area \{[\s\S]{0,120}?\}/) || [''])[0];
eq(/flex-direction:\s*column/.test(decisionRule), true, 'G4: decision area stacks its two cards vertically (same width)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
