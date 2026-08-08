# v1.2 Regression Report

Executed before packaging in the provided runtime environment.

| Test | Result |
|---|---|
| Browser interaction regression | PASS — node drag, non-overlap placement, drag-connect, edge role, clip move/trim/slip, caption, zoom, split; 0 page errors |
| `standalone/e2e.mjs` | PASS — project → upload → mock image → mock I2V → workflow → Timeline → MP4 |
| `standalone/e2e-pro.mjs` | PASS — V1/V2 composition + A1 audio mix + UTF-8 caption; output contains video + audio streams |
| `standalone/provider-contract-e2e.mjs` | PASS — Seedance submit/poll + normalized first frame; Kling JWT/I2V/first-last; Veo predictLongRunning/inline frames/operation poll |
| HTTP media Range | PASS — `Range: bytes=0-99` returns HTTP 206 + exactly 100 bytes |
| JavaScript/MJS syntax | PASS — `server.mjs`, `app.js`, E2E scripts |

`e2e-pro.mjs` and `provider-contract-e2e.mjs` are included in the package and can be rerun without paid model requests. Provider Contract E2E uses local fake vendor endpoints.
