# CP2P-R2 - the render scope, and the number the leak was paying for

Captured by `assets/tests/_cp2p-ir-expand-runner.js` against the real page, 100-SKU fixture.

**Two batches, each paired WITHIN itself. They are never cross-compared** - a pair must be a pair, which is
the lesson CP2P learned when a pooled comparison across a drifting machine pointed the wrong way.

| batch | files | what it answers |
|---|---|---|
| 1 - six interleaved TRIPLES | `triple-unshared-*`, `triple-leaky-*`, `triple-scoped-*` | what was the LEAK worth? |
| 2 - six interleaved PAIRS | `unshared-*`, `scoped-*` | does the SHIPPED build help? |

Batch 1's scoped arm predates a correction (see "the region coupling" below), so only batch 2 describes the
page on disk. The suite asserts exactly that.

## Batch 2 - the current acceptance

| | unshared | scoped (shipped) | paired |
|---|---|---|---|
| click -> first paint | 95.2 ms | 70.0 ms | **-21.9 ms, better in 6 of 6** |
| click -> Execution resolved | 286.5 ms | 254.8 ms | **-41.2 ms, better in 6 of 6** |
| synchronous handler | 62.4 ms | 34.7 ms | |
| assembly cost INSIDE the handler | 59.8 ms | 32.0 ms | **-24.5 ms, better in 6 of 6** |
| assembly cost AFTER the handler | 200.4 ms | 197.4 ms | -3.7 ms (noise) |

The gain is inside the synchronous handler, which is the only place one scope can share. The cost after the
handler is unchanged because each later continuation is its own scope.

## Batch 1 - what the leak was worth

| | unshared | leaky microtask | scoped |
|---|---|---|---|
| click -> Execution resolved | 297.1 ms | 148.7 ms | 259.1 ms |
| assembly cost AFTER the handler | 204.2 ms | 90.7 ms | 200.5 ms |

Paired `leaky -> scoped`: **+113.8 ms on the full ready time, worse in 6 of 6**.

**Most of the CP2P-R1 headline was the leak.** That round reported -113 ms; the correct version delivers
about -41 ms. The difference is the escaped share answering async continuations it was never entitled to
answer, which is visible in the "after the handler" row: 204 ms unshared, 91 ms while leaking, 200 ms once
the scope is honest. **No scope was widened to recover the lost number.**

## The region coupling, caught by the full regression and not by the targeted tests

The first version of this round also wrapped `_irRecoRerenderSummariesRender_` in the render scope. Six
suites `eval` the recommendation REGION of the page, which contains that function but NOT
`_irWithRenderPass_`, so the call referenced a helper that does not exist in their sandbox and all six
threw. The wrapper was removed rather than guarded: it bought nothing measurable (that function makes one
assembly per call, so there is no repeat inside it to share), and a region-sliced function must not depend
on a helper defined far outside its region. Batch 2 was re-measured against the corrected build, and the
removal cost nothing - the "after the handler" delta is -3.7 ms, noise.

## What this does NOT show

- Nothing about production. 100 SKUs, one machine, loopback.
- The ~1 s the Owner reports was not reproduced on any arm.
