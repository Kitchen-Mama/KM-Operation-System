# Interaction latency capture (S3-R11 §1/§2)

**Written for:** the operator, at the real deployment.

**File to paste:** `docs/evidence/s3-r11-interaction-performance/s3r11-interaction-capture.js`
It defines exactly one global, `window.__kmS3R11`. Nothing else on the page is touched.

```
READ ONLY — zero writes, zero locks, zero DB mutation, and it dispatches no request of its own.
It times the requests YOUR clicks cause.
```

## Why you are being asked for these numbers

S3-R11 measured every interaction in a real headless browser over a populated fixture world, and that
run is authoritative for **request counts** — how many canonical reads each interaction costs, and
whether any of them is asked for twice. Those are properties of the code, and the evidence file proves
it: the 0 ms and the 400 ms runs are identical on every count.

What that run cannot give is **milliseconds**. It runs under Chrome's virtual clock, which stops during
work and jumps to the next timer, so its timing field measures poll ticks. Real latency is a property
of this deployment, this Apps Script container and this network — and only you are standing in front of
it. So the split is: the harness owns the counts, you own the clock.

## Doing it

1. Open the app and hard-reload once (Ctrl-F5).
2. Open DevTools → Console.
3. Paste the whole capture file. You should see `__kmS3R11 ready`.
4. `__kmS3R11.help()` lists the contract names.

For each one:

```js
__kmS3R11.start('SKU_SWITCH_MS')     // then click the thing
__kmS3R11.stop()                     // the moment it is usable
```

When you are done:

```js
__kmS3R11.report()                   // prints a table and a JSON blob to paste back
```

**Take each contract three times.** `report()` gives the median, and a single sample from a cold
container is not a number anyone should plan against.

### Where to stop the clock

There is no automatic "done" signal, and inventing one would be worse than asking you. Stop it at the
moment **you** would say the screen is ready to work with. If that judgement is difficult for a
particular interaction, say so in the note — `__kmS3R11.stop('hard to call, table flickered twice')` —
because that is itself a finding about the interaction.

### The one to take first

```
FC_NEW_UPDATE_NEXT_MS
```

This is the complaint the round was asked about: **+ New FC Update → Next waits too long.** The harness
established what it costs in requests — **two** canonical table reads (`sku_details`,
`marketplace_skus`) on the first Next in a session, and **zero** on every Next after that. What it could
not establish is how long those two take against the real deployment. Take it cold (first Next after a
reload) and warm (a second Next in the same session) and label them, because the difference between
those two numbers is the whole answer:

- If cold is slow and warm is fast, the cost is the two reads and nothing else, and the next round's
  work is on the server side of those two tables.
- If **warm** is also slow, something after the reads is expensive, and that is a new finding — the
  harness says the warm path issues no request at all.

## What to send back

The JSON that `report()` prints. It already carries, per contract: sample count, median, min, max, and
how many transport requests happened inside each measurement.

Contracts you did not measure are listed separately under `not_measured`. **Leave them there.** A blank
is a fact; an estimate is not.

## If something misbehaves while you are capturing

Capture these before anything else, in this order:

1. The exact on-screen refusal text.
2. `KM.transport.openRequestDetails()` — what is still in flight, oldest first.
3. `KM.transport.timeline()`.

A reproduction of a failure is worth more than a complete set of timings.
