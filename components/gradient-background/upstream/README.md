# Feral gradient engine adaptation

`feral-gradient-runtime.jsx` is generated from the reviewed source snapshot by:

```sh
node components/gradient-background/upstream/adapt-feral-gradient-runtime.mjs
```

The script reads the owned deterministic gzip fixture by default, rejects any decompressed input whose SHA-256 differs from the recorded snapshot, applies exact source-seam replacements, and prints the source and adapted hashes. `feral-gradient-source.json` records provenance and the bounded patch. The user explicitly selected export adaptation; this directory does not assert that the captured runtime is MIT licensed.

`fixtures/feral-css-generator.js.txt` is the exact dependency-closed helper slice immediately before builder function `b6`. Focused tests execute that captured `y6` generator and compare all four CSS recipe types with the authored sibling module.

`feral-gradient-engine.tsx` is the import boundary. It dispatches `LINEAR`, `IOS`, `CIRCLE`, and `ANGULAR` recipes to the CSS path reproduced from builder function `b6`; other supported recipes use the generated Canvas/WebGL runtime. Background recipes must keep line labels empty so no external font or asset is required.

Sky uses its original CPU renderer while the shared WebGL context is lost, recreates GPU state after restoration, and releases its cached GPU resources after the last runtime instance unmounts. Shared CPU/raster caches keep their upstream module lifetime: they are single latest-size canvases, weak context entries, a 256×256 grain tile, a 12,000,000-pixel edge-cache budget, or at most 49 fixed color tables. They schedule no active work; lifecycle cleanup still returns renderer RAF, listeners, and observers to zero.

Still paints its final grained frame in one layout pass. The overlay noise initializes before browser paint, and the engine reports Still readiness so consumers can avoid showing the unrelated CSS fallback during startup.
