# Upstream Integration Map

This repository is an integration scaffold, not a blind source merge. Upstream snapshots are pinned so selective migrations can be reviewed and repeated.

| Upstream | Pinned commit | What we reuse / mirror |
|---|---|---|
| `tong-io/tongflow` | `ff4fa3285fadcb69788abc29dbbc6de148185901` | ReactFlow workspace pattern, Zustand graph state, capability/implementation separation, workflow persistence concepts |
| `0xsline/OpenChatCut` | `8b01756dbb97e4dd4327020e13dac6a8454656ec` | frame-based timeline domain, `sourceAssetId` media identity, generation references, Agent/Skill and export direction |
| `kevinten-ai/mcp-video-gen` | `2a841acc67e48a3004c10e6cd67a54dcf9198a95` | small provider registry and submit/query adapter boundary |

## Current integration status
- Standalone Canvas mirrors the stable TongFlow interaction model but uses a dependency-free Pointer Events implementation: pan/zoom, node drag, drag-to-connect, edge roles, cycle prevention and project persistence.
- Standalone Timeline now carries the OpenChatCut-style frame/source identity concepts and core NLE operations: move, trim, slip, split, ripple delete, crossfade/fades, track state, caption track, transform/speed/volume controls, preview and FFmpeg multitrack export.
- Direct Standalone adapters implement the same submit/query boundary validated against `mcp-video-gen`: Seedance/Ark, Kling and Veo, plus fal routing.
- The code intentionally does not copy TongFlow's Python plugin runtime or local GPU execution path.
- The scalable Monorepo still isolates provider-specific request/response mapping in `packages/media-gateway/src/providers`.

## Upgrade policy
Run `scripts/pull-upstreams.sh`, compare the pinned snapshot to a newer commit, and port only the surfaces that improve the existing contracts. Do not replace the application wholesale unless there is an explicit migration decision.
