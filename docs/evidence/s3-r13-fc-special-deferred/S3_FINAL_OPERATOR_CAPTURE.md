# S3 final operator capture — one pass, after deploying `origin/main..HEAD`

**Written for:** the operator, to run in a real browser against the real Apps Script deployment.

```
OPERATOR_SMOKE_REQUIRED = YES
BLOCKS_S3_CODE_SEAL     = NO      (the code side is complete; this is acceptance, not development)
```

This replaces the two earlier checklists — `s3-r11-interaction-performance/OPERATOR_INTERACTION_CAPTURE.md`
and `s3-r11-interaction-performance/PSB_OPERATOR_SMOKE.md`. Run **this one**; the older two are superseded.

**Approximate human timing is what is wanted.** A phone stopwatch, or "instant / a couple of seconds /
about half a minute", is enough. Please do **not** reach for a precise number you do not have — every round
so far has kept operator timings and harness timings separate on purpose, and a fabricated precision would
break that. Write `?` where you did not measure.

---

## Before you start

1. Push and deploy `origin/main..HEAD` as **one** release (see `§13` in the round report). R12 and R13 ship
   together; R12 was never deployed on its own.
2. Rotate the cache token. If the page still shows the old behaviour, you are looking at a cached bundle and
   nothing below is meaningful.
3. **Hard reload once**, then start. The first entry of a session is the cold one and it is the one that matters.

---

## 1 — FC Summary → + New FC Update

This is the round's main change. Regular is expected to be unchanged; Special should be noticeably faster
cold, because it now fetches three tables and one slice instead of five and one.

| | Cold (first time this session) | Warm (close the modal, reopen) |
|---|---|---|
| **Regular → Next** | `REGULAR_NEXT_COLD = ______` | `REGULAR_NEXT_WARM = ______` |
| **Special Event → Next** | `SPECIAL_NEXT_COLD = ______` | `SPECIAL_NEXT_WARM = ______` |

R12's figures for the same four cells were ~6 s / immediate / ~37 s / immediate.

### 1a — the two deferred loads, which are new

Open the Special builder and, **without closing it**:

```
Pick an existing event from "New or existing event"
  → the picker area says "Loading the saved SKU lines for this event…" briefly     SEEN / NOT SEEN
  → the event then opens with its Deal Price AND Discount % filled in             YES / NO
  → pick a SECOND saved event: it opens with no visible loading at all            YES / NO

Type a SKU into a blank SKU row
  → Regular Price briefly reads "Loading price…" (NOT "Missing Regular Price")    SEEN / NOT SEEN
  → the price and currency then appear                                            YES / NO
  → a second row with a SKU fills in immediately                                  YES / NO
```

`DEFERRED_LOADS_BEHAVED = ______`

If either one shows an amber box with a **Retry** button, that is the failure surface working as designed.
Click Retry once and note whether it recovered: `DEFERRED_RETRY_RECOVERED = ______`

**What would be a bug, and is worth stopping for:** a price cell that says *Missing Regular Price* for a SKU
you know is priced, or a saved event that opens with a blank Discount %. Both mean the "not loaded yet" state
leaked into a "there is no data" message. Please screenshot it.

---

## 2 — SKU Regional cold entry

Hard reload, then go straight to SKU Regional Details.

```
SKU_REGIONAL_COLD_ENTRY = ______            (time to the master list appearing)
Did the first read time out?                 YES / NO
If yes: did Retry recover it?                YES / NO / N/A
If yes: how many Retry clicks?               ______
Was the message specific (named the action / said REQUEST_TIMEOUT)?   YES / NO
```

This has now been seen twice in production and R13 does **not** claim to have fixed it — the cause is
server-side and is not reproducible from this repository. What R13 seals is the behaviour around it: the
refusal names the failure, no skeleton is left spinning, no request is left open, and one Retry recovers in
one read. This question is asking whether that holds in production, not whether the timeout is gone.

---

## 3 — Pricing upload, 42 rows

Use the same file that produced the redirect-404 message.

```
PRICING_UPLOAD_42_ROWS = ______             (time from Preview click to the preview appearing)
Preview succeeded?                           YES / NO
Confirm → write succeeded?                   YES / NO
```

**If a preview fails again**, the wording is what R13 changed, so please record it verbatim:

```
Message shown: ____________________________________________
```

- *"The file has not been checked yet — no answer came back… This is a connection problem, not a problem
  with the file: preview it again."* → **correct.** The connection dropped; your file is fine; press Preview again.
- *"The database rejected the file. Nothing was written."* accompanied by a **transport** reason (a 404, an
  expired redirect, a timeout) → **the bug is back.** Screenshot it. That exact sentence for that exact cause
  is what this round removed.
- *"The database rejected the file. Nothing was written."* accompanied by **row errors** → correct and
  unchanged: the server read your file and refused it.

---

## 4 — Product Strategy Board, three rounds

Six views, three times, leaving and returning between rounds. For each view: does it render useful data,
with no 404, no timeout, and does switching away and back work?

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Executive Overview | | | |
| Category Analysis | | | |
| Deal Risk | | | |
| Data Quality | | | |
| Strategy Workspace | | | |
| Advanced Details | | | |

```
PSB_ROUND_1 = ______
PSB_ROUND_2 = ______
PSB_ROUND_3 = ______
```

Nothing was changed in this board this round. The last production data point for it is still S3-R8's
`productPricing.workspace.get` failing at 59 030 ms with `REDIRECT_TARGET_NOT_FOUND`, and R12's
`PSB_PRODUCTION_SMOKE_POSITIVE = YES` was a positive smoke rather than the three-round seal. This table is
what turns one into the other.

---

## Send back

Just the filled-in values. If everything passed, `S3_PRODUCTION_SEAL = YES` follows from them and no further
development round is implied. If something failed, the screenshot and the verbatim message are worth more
than a timing.
