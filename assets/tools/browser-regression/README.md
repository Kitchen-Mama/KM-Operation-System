# Non-activation browser regression  (P1-B7E §7)

A real browser, not a DOM shim. Two files, no dependencies, nothing installed.

```
node assets/tools/browser-regression/serve-shell.js . 8786
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox \
  --window-size=1280,900 --virtual-time-budget=15000 --user-data-dir=<tmp> \
  --dump-dom http://127.0.0.1:8786/index.html > dom.html
```

The result is a `<pre id="km-probe-result">` in that DOM: one JSON object with every assertion, every
console error and every network URL the page asked for.

## Why this exists

The repository's test suites read source and run a narrow DOM shim. Both are good instruments and
neither can answer the question this round had to answer — *does loading the Product Strategy
stylesheet change any other page?* — because a stylesheet only exists in a cascade.

It earned its place immediately. P1-B7 scoped the shared primitives (`.btn`, `.filter-group`,
`.kmf-*`) by rewriting every selector that began a line at column zero. Five rules live **inside
`@media` blocks**, indented, and were missed:

| block | rule | what it reached |
|---|---|---|
| `max-width: 1100px` | `.filter-group` | every filter group in the application, on most laptops |
| `max-width: 640px` | `.kmf-panel` | the shared popover |
| `max-width: 820px` | `.kmf-trigger`, `.kmf-panel` | the shared popover |
| `print` | `.kmf-panel { display: none }` | every printed page's popovers |

The source-level assertion passed (it searched for `\n.selector {`). The browser's own CSSOM scan
**also** passed, for a subtler reason worth keeping: it asks whether a selector matches anything in
the document, and the Home page contains no `.filter-group` — *a leak that only reaches other pages
looks like no leak at all.*

## The measurement that did work

Snapshot every shell surface, **disable the stylesheet**, snapshot again, require the two to be
identical. It needs no element to be present and no value to be known in advance — which matters,
because the value this round first asserted for `.filter-group` was wrong (160px; it is 140px at
that viewport, from a rule nobody had read).

Custom properties get their own rule, because a variable is not a style: the sheet may **add** a name
the shell does not define, and may not **redefine** one it does. Of the 70 it declares on `:root`,
22 are its own and 48 are the deliberate base.css mirror — identical in the live cascade, which is
the same thing `product-strategy-board-p1-b2a.test.js` pins at source level.

## What the probe changes about the page

One thing, and only one: it records every `fetch`/`XHR` and rejects calls to the Apps Script host, so
the boot capability read cannot hang the load or make another live request. The calls are still
counted, which is what the zero-request assertion needs. Everything else is observation.

## Last result

25/25 at 1280x900, 1000x800 and 760x900 — zero console errors, zero rejections, zero Product Strategy
requests, `capability_mirror_false`, `showSection('product-strategy')` changes nothing, and the mount
point present and empty.
