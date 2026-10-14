# CP2P-R1 §A — one synchronous render, one assembly

Captured by `assets/tests/_cp2p-ir-expand-runner.js` against the real page with a 100-SKU workspace fixture.

| file | what it is |
|---|---|
| `baseline-1..8.json` | the page at `95c8eb9b`, before the approved share |
| `shared-1..8.json` | the same page with the share |

**Interleaved pairs**: baseline, shared, baseline, shared, eight times, each pair back to back. Every figure
below is a PAIRED comparison, because CP2P established that this machine drifts between runs by more than
the effect being measured — a pooled four-run comparison there pointed the wrong way and nearly shipped a
regression.

## Result

| | baseline (median) | shared (median) | paired delta |
|---|---|---|---|
| click -> first paint | 73.8 ms | 56.3 ms | **-20.1 ms, better in 8 of 8** |
| click -> Execution panel resolved | 239.8 ms | **123.0 ms** | **-113 ms, better in 8 of 8** |
| synchronous handler | 48.0 ms | 30.1 ms | -18.9 ms |
| assembly cost INSIDE the handler | 45.5 ms | 28.4 ms | |
| assembly cost AFTER the handler | 172.9 ms | 77.8 ms | |

Neither metric was traded for the other: both improved, in every pair.

## The timing boundaries are corrected

CP2P reported a "build rest" figure computed as *the synchronous handler duration minus every assembly seen
anywhere in the measurement window*. The window also contains assemblies that run LATER, from async
continuations, so the figure mixed two clocks and came out negative — which is how it announced itself.

Each assembly is now attributed to the phase it actually ran in, by its own timestamp:

- `ms_handler_sync` — the synchronous task, wall clock
- `ms_data_in_handler` / `calls_in_handler` — a SUBSET of the above
- `ms_data_after_handler` / `calls_after_handler` — a different clock, never subtracted from the first
- `ms_click_to_paint`, `ms_click_to_real_panel`, `ms_click_to_exec_resolved`

## The call COUNT is not the metric

The callers still call: `getReplenishmentData()` is still invoked about nine times per expand, and the
capture still records ~60 invocations. What changed is what a REPEAT costs inside one synchronous render.
Every assertion about the historical redundancy reads the CP2P baseline captures and is labelled BASELINE;
none of them asks the shipped page to keep rebuilding.

## What the share is bounded to

Released by a **microtask**, so it is gone before any later task, timer or promise continuation. Rebuilt
whenever scope, LTS filter, Search generation, workspace model identity, exposure entry identity or exposure
readiness has moved — identity, not deep equality, so an equal-looking new model is a different source.
There is no station cache, no expiry to tune and nothing persisted.

## What this does NOT show

- **Nothing about production.** 100 SKUs, one machine, loopback. The ~1 s the Owner reports was not
  reproduced here before the change either; the worst baseline first paint measured is about 106 ms.
- Nothing about the gap read, which is answered by a local stub in microseconds.
