# Upstream integration map

## TongFlow
Repository: `tong-io/tongflow`
Use as source for the Canvas/workflow layer. Target areas:
- `src/components/workspace/`
- `src/hooks/use-flow*`
- `src/lib/workflow/`
- `src/lib/abi/`
- `config/tongflow.abi.json` as a design reference

Exclude from the target architecture:
- local/Modal GPU execution
- Python plugin process model as the product's provider runtime
- base64 as the durable media transport

## OpenChatCut
Repository: `0xsline/OpenChatCut`
Use as source for:
- `src/editor/`
- timeline UI components
- `src/generate/video.ts` reference-preflight behavior
- selected `src/agent/`
- selected `src/export/`

Keep its frame-based `MediaAsset` / `TimelineItem` concepts, but map media sources to this repo's durable `assetId` + storage URL.

## mcp-video-gen
Repository: `kevinten-ai/mcp-video-gen`
Use only as an adapter-reference library. Its `providers/` directory and `BaseProvider.generate/query` abstraction are conceptually mapped to `packages/media-gateway`.
