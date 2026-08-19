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

## 8. Upstream 参考与集成状态

本仓库是**选择性集成**脚手架，非整库 fork。上游快照通过 `scripts/pull-upstreams.sh` 拉取到 `.upstream/`（不入库）。

| 上游 | 复用方向 |
|------|----------|
| **TongFlow** | ReactFlow 工作区、Zustand 图状态、capability/实现分离 |
| **OpenChatCut** | 帧级时间线、`sourceAssetId`、GenerationReference、导出 |
| **mcp-video-gen** | Provider registry + submit/query 适配器边界 |

**Standalone 现状**

- Canvas：Pointer Events 实现平移/缩放/拖线/环检测，无 ComfyUI/GPU 本地运行时
- Timeline：trim/slip/split/ripple、多轨合成、FFmpeg 导出
- Provider：Seedance/Ark、Kling、Veo、fal 等直连适配器

**Monorepo 迁移顺序**（若继续拆 `apps/` + `packages/`）

1. TongFlow → `packages/canvas`（workspace、hooks、workflow）
2. OpenChatCut → `packages/editor`（domain、timeline 组件）
3. 生成 API 统一为 `POST /generations` → `assetId`，禁止节点类型耦合 vendor 字段

升级策略：对比 pin commit 与上游新版本，**只移植改进现有契约的表面**，不整库替换。

## 9. Standalone 数据路径

```text
standalone/data/
├── db.json
├── provider-settings.json
├── assets/
└── exports/
```

Standalone 与服务版共享领域边界：

`Project → Workflow → GenerationJob → Asset → TimelineItem → GenerationReference`
