# Map acceptance captures — TEXTURE-3-R2 §I / §L5

Produced by `node tools/geo/capture-views.js --tag <before|after>`, which drives the **real** WebGL globe in
headless Chrome and writes one PNG plus a `captures.json` sidecar per run.

## What is committed here, and why not all of it

The harness produces **14 views** (§I's eight acceptance views plus §L5's Canada comparison set, de-duplicated
where they share a camera). Two full runs — before and after the July texture swap — come to **36.8 MB of PNG**.

This repository's own standard rejects that. `assets/img/earth/PROVENANCE.md` §6 declines a 29.9 MB upstream
image on the grounds that "~30 MB is an unacceptable page and repository weight", and it would be inconsistent
to commit 36.8 MB of screenshots one file later. Screenshots of a photographic globe also compress poorly, and
there is no image codec in this toolchain to re-encode them.

So what is committed is:

| | |
| --- | --- |
| `before/captures.json`, `after/captures.json` | **all 14 views, both runs** — the per-capture facts §L5 requires reported: imagery source and version, active tier, mipmaps/anisotropy, GPU estimate, camera position, whether the high-resolution or fallback asset was used, and the zh-TW font probe |
| `before/na-globe.png`, `after/na-globe.png` | the reported view — §I.1 / §L5-1, whole globe over North America |
| `before/canada-prairies.png`, `after/canada-prairies.png` | the regional detail — §L5-3, Alberta / Saskatchewan / Manitoba |

The other 24 PNGs are **deterministically regenerable in one command** (see below); they are evidence, not
artefacts anything depends on. If a reviewer wants the full set committed, that is a one-line decision — say so
and it will be.

## Regenerating the full set

```sh
node tools/geo/capture-views.js --tag before     # (from a checkout with the December asset)
node tools/geo/capture-views.js --tag after
```

Determinism is pinned in the harness rather than hoped for: `reducedMotion: true` makes the camera placement
instant instead of an eased tween, `--virtual-time-budget` drains timers and rAF before the capture,
`--use-angle=swiftshader` uses the same software rasteriser on every machine rather than the local GPU, and the
window size and device scale factor are fixed. Two runs of the same commit produce the same pixels.

## Honest limits of this evidence

- The rasteriser is **SwiftShader**, not a real GPU. Geometry, texture sampling, mipmapping and the shader maths
  are the shipped ones; what these captures cannot measure is real-hardware **frame timing**.
- The capture host is Windows 11, so `Microsoft JhengHei` is present and the Traditional Chinese labels render
  for real — `captures.json` records the measured font probe per view rather than assuming it.
- These are captures of the **globe engine mounted directly**, not of the full Shipment Runtime page. The
  camera, the asset ladder, the border layers and the label layer are the real ones; the surrounding page
  chrome, the shipment data and the control panel are not in frame.
