# S3-R10 — Pricing write truthfulness: one-row production smoke

**PRODUCTION_WRITE_AUTHORIZED = NO from the development environment.** Every step below is performed by the
operator, on production, after the deploy. Nothing here was run from the repository.

This smoke needs **one pricing row**. Not a hundred. The thing being verified is whether a write outcome is
*decidable*, and one row decides that as well as a hundred would — while keeping the blast radius at one row.

---

## Before you start

Both halves must be deployed, and they must match:

| Half | What must be there |
|---|---|
| Apps Script | `73_api_v1_pricing_write.gs`, `01_router.gs`, `63_api_v1_system_health.gs` |
| Frontend | `index.html`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/sku-regional-details.js` |

Confirm the deployment answers at the new contract before touching any price:

```js
await KM.DB.checkDeploymentContract()
```

You want `deployed_action_contract_version >= 17`. If it is 16, the Apps Script half is not deployed and the
verification step cannot work — stop here rather than testing a half-built system.

---

## Choose the row

Pick **one** `marketplace_sku_id` you are comfortable changing and changing back. Record it.

```
MARKETPLACE_SKU_ID = ______________________
```

### Capture the PRE state

In SKU Regional Details, open that row's price editor and record what it shows:

```
PRE regular_price          = ______________
PRE regular_price owner    = AUTO / MANUAL
PRE pricing_change_log rows for this pricing_id = ______   (count them in the sheet)
```

---

## Step 1 — a normal write that succeeds

Change **one** field (Regular Price is fine) to a new value and Confirm.

Expected: the page reports success as it always has.

```
browser final outcome = ____________________     (expect: success / rows written)
write_id              = ____________________     (from the console line below)
```

To read the write id back afterwards:

```js
KM.transport.metrics().samples.filter(s => s.action === 'pricing.update').slice(-3)
```

### Capture the POST state

```
POST regular_price         = ______________
POST owner                 = AUTO / MANUAL      (expect: MANUAL)
POST pricing_change_log rows for this pricing_id = ______   (expect: PRE + 1)
```

---

## Step 2 — the case this round exists for

This is the one that matters. It proves a write whose response is lost is no longer reported as "Nothing was
written".

You do **not** need to break the network. Take the `write_id` from Step 1 and ask the server directly:

```js
await KM.DB.getPricingWriteStatus('PASTE_THE_write_id_HERE')
```

Expected:

```
status          = COMMITTED
written         = 1
committed_at    = <a timestamp>
```

Record it:

```
status for the Step 1 write = ____________________
```

Then ask about a write id that never existed:

```js
await KM.DB.getPricingWriteStatus('PRW-does-not-exist')
```

Expected `status = NOT_COMMITTED`. Record:

```
status for a fabricated id  = ____________________
```

Those two answers together are the whole mechanism: a committed write is provable after the fact, and an
absent one is distinguishable from it.

---

## Step 3 — duplicate safety

Re-send the **same** write id. This must not write a second time.

```js
await fetch(KM.DB.getApiBaseUrl(), {
  method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    action: 'pricing.update',
    write_id: 'PASTE_THE_SAME_write_id_HERE',
    changed_by: 's3r10-smoke',
    lines: [{ marketplace_sku_id: 'YOUR_ID', regular_price_mode: 'MANUAL', regular_price: '999' }]
  })
}).then(r => r.json())
```

Note the deliberately wrong price (`999`). It must **not** be applied.

Expected: `success: true`, `data.replayed: true`, and the ORIGINAL `written` count.

```
replayed          = ____________________     (expect: true)
regular_price now = ____________________     (expect: UNCHANGED from Step 1 — NOT 999)
pricing_change_log rows for this pricing_id = ______   (expect: STILL PRE + 1, not PRE + 2)
```

If `999` landed, stop and report it — that is the idempotency guard failing, and it is the most important
line in this runbook.

---

## Step 4 — put the row back

Use **Use Auto** on the field you changed, or set it back to the `PRE` value.

```
FINAL regular_price = ______________      FINAL owner = AUTO / MANUAL
```

---

## What to report back

```
MARKETPLACE_SKU_ID          =
PRE price / owner           =
PRE change_log count        =
write_id                    =
browser final outcome       =
POST price / owner          =
POST change_log count       =
status for the write_id     =        (expect COMMITTED)
status for a fabricated id  =        (expect NOT_COMMITTED)
replayed on resend          =        (expect true)
price after resend          =        (expect unchanged, NOT 999)
change_log count after resend=       (expect unchanged)
row restored                =
```

---

## What this smoke does NOT prove

It does not reproduce a genuinely lost response — that needs the platform to drop one, which cannot be
arranged on demand. What it proves is that **the evidence needed to survive a lost response is being
recorded**, and that a duplicate arrival cannot mutate twice. The lost-response path itself is driven end to
end in `assets/tests/s3-r10-write-truthfulness.test.js` §D against the real client code.

If a real lost response happens in normal use after this deploy, the UI will now say it could not confirm the
result and ask you not to resubmit, then resolve itself. That sentence appearing in production is the round
working, not the round failing.
