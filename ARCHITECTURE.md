# Architecture Decisions

## 1. Core invariant
UI nodes select a **capability**. Provider and model are execution choices. No Canvas, Timeline or Agent component may call a vendor API directly.

## 2. Durable asset invariant
Every generated/uploaded image, video, or audio object becomes an `asset` stored in S3-compatible storage. Vendor result URLs are temporary ingestion sources only. Canvas outputs and Timeline clips both reference the resulting `assetId`.

## 3. Async job invariant
Normalized states are `queued -> processing -> succeeded | failed | canceled`. Vendor states and progress are normalized inside Provider adapters and Worker updates.

## 4. Canvas / Timeline boundary
Canvas and Timeline keep independent Zustand stores. Shared data crosses the boundary as durable assets or explicit `GenerationReference` values, never through cross-imported UI state.

## 5. Timeline reference invariant
A Timeline clip can create a Generation Reference carrying `assetId`, `timelineItemId`, `sourceInFrame`, and `sourceOutFrame`. The Worker validates project ownership and resolves the durable media object before a Provider request is made.

## 6. Model constraint invariant
Reference limits, durations, aspect ratios and resolutions belong to `ProviderModel.constraints`. Generic preflight lives in `packages/media-gateway/src/model-validation.ts`; only exceptional vendor policies remain inside individual adapters.

## 7. Current request flow
`Canvas Node -> POST /generations -> PostgreSQL Job -> BullMQ -> Worker -> Provider submit/query -> S3 ingest -> Asset row -> SSE -> Canvas output -> Asset Library -> Timeline`.

## 8. Upstream roles
- TongFlow: ReactFlow workspace + Zustand state pattern, workflow/capability separation and typed graph direction.
- OpenChatCut: frame-based media/timeline semantics, source asset identity and generation-reference direction.
- mcp-video-gen: compact provider registry plus submit/query adapter boundary; not a runtime dependency.
