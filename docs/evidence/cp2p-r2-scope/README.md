# CP2P-R2 - the render scope, and the number the leak was paying for

Captured by `assets/tests/_cp2p-ir-expand-runner.js` against the real page, 100-SKU fixture.

**Six interleaved TRIPLES** - each arm run back to back within its triple:

| file | arm |
|---|---|
| `unshared-1..6.json` | no share at all (the page at `95c8eb9b`) |
| `leaky-microtask-1..6.json` | CP2P-R1: shared, released by a microtask - WITHDRAWN |
| `scoped-1..6.json` | CP2P-R2: shared inside an explicit synchronous scope - shipped |

Three arms because two questions had to be answered together: does the CORRECT version still help, and
what was the leak worth?

## Medians

| | unshared | leaky microtask | scoped |
|---|---|---|---|
| click -> first paint | 98.5 ms | 70.5 ms | **69.7 ms** |
| click -> Execution resolved | 297.1 ms | 148.7 ms | **259.1 ms** |
| synchronous handler | 60.7 ms | 35.3 ms | 34.3 ms |
| assembly cost INSIDE the handler | 57.8 ms | 32.5 ms | 31.9 ms |
| assembly cost AFTER the handler | 204.2 ms | 90.7 ms | 200.5 ms |

## Paired deltas

| comparison | first paint | Execution resolved |
|---|---|---|
| unshared -> **scoped** | **-29.5 ms, better in 6 of 6** | **-35.3 ms, better in 6 of 6** |
| unshared -> leaky | -28.2 ms | -146.8 ms |
| leaky -> **scoped** | -1.2 ms | **+113.8 ms, worse in 6 of 6** |

## What this says, plainly

**Most of the CP2P-R1 headline was the leak.** That round reported -113 ms on the full ready time. The
correctly scoped version delivers about -35 ms. The difference is the escaped share answering async
continuations it was never entitled to answer - visible as the assembly cost AFTER the handler: 204 ms
unshared, 91 ms while leaking, and back to 200 ms once the scope is honest.

**The legitimate gain is inside the synchronous handler**, which is the only place one scope can share:
57.8 -> 31.9 ms. The cost after the handler is essentially unchanged, because each later continuation is
its own scope. **No scope was widened to recover the lost number.**

## What this does NOT show

- Nothing about production. 100 SKUs, one machine, loopback.
- The ~1 s the Owner reports was not reproduced on any arm.
