# Test Report — v2.2 / v2.3

Date: 2026-08-08  
Environment: Node.js 24.18.0, FFmpeg 8.1.2

## Node interaction (LibTV-style) acceptance

`node standalone/node-interaction-e2e.mjs` — PASS

- **Best-of-N variants**: one `image.generate` job with `params.variants: 3` produced 3 distinct image outputs; the node keeps them all as selectable candidates and the selected one flows downstream.
- **Validation**: `variants: 9` is rejected with `400` (`variants must be between 1 and 4`).
- **Video single-output**: `variants` is ignored for video capabilities (exactly one output).
- **In-node references persist**: `presetReferences` (assetId + role) round-trip through the workflow API and are consumed by the existing reference pipeline (edges remain supported).
- **Image → Video chain (ComfyUI-style)**: verified end-to-end — generate the Image node, then submit `video.image_to_video` with its output as `first-frame` succeeds and produces a video; a `video.image_to_video` request with no first-frame is rejected with `400`. The ▶ 运行全部 flow executes nodes in dependency order and downstream nodes re-render on upstream completion.
- **UI guards**: 21 node-interaction surfaces present (`nodeReferenceChips`, `variantFilmstrip`, `pickReferenceAsset`, `selectVariant`, variants control, `refAdd` action, per-reference role controls, `runAllNodes`, `topoOrderGenerationNodes`, downstream re-render, `missingDepNodes`, `pendingReferenceKinds`, `edgeState`, `dropTargetForNode`, `canAutoConnect`, `nodeStatusBadge`, edge glow/select classes).

## v2.3 node-connection acceptance (all 8 e2e suites green)

- Drag-node-to-node auto-connect, edge glow/status rendering, edge select/delete, node status badges, intent-driven video mode inference (`pendingReferenceKinds`), and auto-run of missing upstream dependencies are present in the shipped UI (guarded in `node-interaction-e2e.mjs`).
- Full regression: `e2e`, `e2e-pro`, `video-node`, `editing`, `node-interaction`, `agnes-provider`, `provider-contract`, `agent-e2e` — all PASS.

## Release gates (unchanged from v2.0/v2.1)

- `node standalone/e2e.mjs` — PASS
- `node standalone/e2e-pro.mjs` — PASS (H.264/AAC export with video and audio streams)
- `node standalone/video-node-e2e.mjs` — PASS (4 modes, cancel, constraints, UI guards)
- `node standalone/editing-e2e.mjs` — PASS (anchor-locked reshoot + tail-frame extend)
- `node standalone/agnes-provider-e2e.mjs` — PASS
- `node standalone/provider-contract-e2e.mjs` — PASS (all contracts use local fake endpoints; no paid request)
- `node standalone/agent-e2e.mjs` — PASS
- `python scripts/validate-source.py` — PASS (42 TypeScript/TSX files and package JSON)

Note: variants > 1 on paid image providers (Seedream/Agnes/fal) run the provider call once per variant sequentially; cap is 4.
