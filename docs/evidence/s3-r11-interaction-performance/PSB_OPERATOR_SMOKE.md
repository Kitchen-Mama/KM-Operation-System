# Product Strategy Board — operator smoke (S3-R11 §9)

```
PSB_PRODUCTION_SMOKE_REQUIRED = YES
```

**Why this exists.** Product Strategy has never had the three-round production smoke that S3-R9 gave the
other five surfaces. Nothing in S3-R11 changes that: unit tests and a fixture-backed browser harness can
show the board reaches a useful view and issues one read on entry, and they cannot show it working against
the real Apps Script deployment. §9 says not to mark production stability from unit tests, so this round
does not. The last production data point for this page is still the one S3-R8 recorded:
`productPricing.workspace.get` failing at **59 030 ms** with `REDIRECT_TARGET_NOT_FOUND`.

**What S3-R11 established in the harness**, so you know what to expect and what would be new:

- Entry costs **one** read, `productPricing.siteUniverse.get`. No workspace read is issued until a scope
  is chosen — the board asks for Company / Country / Marketplace first, by design.
- With a healthy universe the scope selector populates and the board says
  *"Select a company, country and marketplace to begin."* That sentence is the success state of entry,
  not an error.

**Written for:** the operator running the smoke. Nothing here writes. Every step is a read.

---

## Before you start

1. Open the app, hard-reload once (Ctrl-F5) so the shell is not serving a stale bundle.
2. Open DevTools → Console, and leave the Network tab open on the second monitor if you have one.
3. Paste the capture tool from `OPERATOR_INTERACTION_CAPTURE.md` if you want the timings. It is optional —
   a pass/fail on the steps below is worth having on its own.

## The rounds

Run the **whole list three times**, in three separate sessions (close the tab between rounds). Three rounds
is what S3-R9 used, and a single pass says much less than three: the failure this page last showed was
intermittent.

| # | Step | What a PASS looks like |
|---|------|------------------------|
| 1 | Click **Product Strategy** in the sidebar | The board shell appears; the Company selector is populated |
| 2 | Choose Company → Country → Marketplace | A view renders. No 404, no Retry banner, no permanent "Loading…" |
| 3 | **Executive Overview** | Renders with content. Charts may be sparse — sparse is not a failure |
| 4 | **Category Analysis** | Renders. Switching to it does not reset the scope you chose |
| 5 | **Deal Risk** | Renders |
| 6 | **Data Quality** | Renders |
| 7 | **Strategy Workspace** | Renders |
| 8 | **Advanced Details** | Renders |
| 9 | Leave to another page, then come back | The scope you chose is still selected, or it re-reads and lands on the same view. It must not drop you back to "choose a company" with no explanation |
| 10 | Change the site selector to a different marketplace | The view updates to that site. It must never show one site's rows under another site's heading |

You do **not** need to interact deeply with every chart. What is being smoked is: does each view reach a
useful state, does the site selector behave, and does leaving and returning keep it.

## Record, per round

```
ROUND            = 1 | 2 | 3
ENTRY_OK         = YES / NO
SCOPE_SELECTOR   = POPULATED / EMPTY / REFUSED (paste the refusal text)
VIEWS_PASSED     = e.g. 6/6
404_COUNT        = 
TIMEOUT_COUNT    = 
PERMANENT_LOADING_COUNT =
ROUTE_RESET_ON_RETURN   = YES / NO
SLOWEST_STEP     = which one, and roughly how long
```

## If a step fails

Stop on that step and capture, in this order — the first two are the ones that cannot be recovered later:

1. The **exact** refusal text the board printed. It is written to be diagnostic; do not paraphrase it.
2. `KM.transport.timeline()` and `KM.transport.openRequestDetails()` from the console.
3. The Apps Script execution log for that minute (Executions → filter by time).
4. A screenshot.

A `REDIRECT_TARGET_NOT_FOUND` or a read past ~60 s is the S3-R8 shape and is the thing this smoke is
looking for. If you see it, say so plainly — a reproduction is more useful than three clean rounds.
