# Changelog

## 2.4.0 - 2026-08-08
- Added **节点内进度可视化**：生成任务新增 `phase`（queued → preparing → generating → finalizing → succeeded/failed），节点标题徽标与进度条显示"准备中/生成中/下载中/收尾中 · N%"，SSE 自动推送。
- Added **素材标签 + 智能文件夹**：素材自动打标签（kind + generated/uploaded + provider），素材抽屉新增过滤 chips（全部/生成/上传/图片/视频/音频），`GET /assets?tag=&kind=` 支持服务端过滤，素材属性面板可添加/移除自定义标签（新增 `PATCH /assets/:id` 端点）。
- Added **节点 drop-target 视觉反馈**：拖动节点到可连接目标上时，目标节点绿色发光+虚线高亮，松手自动连线。
- Added **全屏预览**：预览控制栏新增 ⛶ 按钮，弹出全屏 modal（视频/图片/字幕），Esc/点击背景关闭。
- 新增 `standalone/wave1-e2e.mjs`（`pnpm test:wave1`）：覆盖 phase 流转、标签自动生成、标签过滤、PATCH 增删标签、UI guards。

## 2.3.0 - 2026-08-08
- Added ComfyUI/QUill-style node connection interactions:
  - **拖节点到节点自动连线**：拖动一个节点松手时，若其中心落在另一节点上，自动创建连线并按源类型分配角色（图片→视频 = `first-frame`，图片→图片 = `reference-image`，视频→视频 = `reference-video`），无需找端口。
  - **连线光效**：连线分三层渲染（光晕 + 主线 + 点击层）；依赖满足变绿色发光流动线，未满足灰色虚线，失败红色；选中加粗高亮。
  - **连线可选中/断开**：点击连线选中（再点取消），`Delete`/Backspace 或属性面板"删除连线"断开。
  - **端口 hover 高亮** + tooltip，端口拖线保留。
- Added **节点状态徽标**：生成节点标题栏显示 排队中/生成中 x%/成功/失败。
- Added **意图驱动的视频模式推断**：视频节点只要连了图片节点，即使图片尚未生成也按"首帧视频"显示（而不是回退到文生视频），并提示"已连接图片，等待生成"。
- Added **点生成自动补跑上游依赖**：点视频节点"生成"时，若首帧图片未生成，自动先跑图片节点、等它成功后再自动跑视频节点；图片失败则停止并提示（等价 ComfyUI 的排队执行；整图可用 ▶ 运行全部）。
- UI guards 扩展到 21 项，`standalone/node-interaction-e2e.mjs` 全量通过。

## 2.2.0 - 2026-08-08
- Added QUill-style in-node reference management for Image and Video nodes: a 参考素材 panel that adds assets from the library directly into the node, auto-assigns reference roles by kind and video mode, lets you switch roles (first-frame / last-frame / reference-image / reference-video / reference-audio) and remove references without touching edges.
- Added best-of-N image generation (`params.variants`, 1-4): one job produces multiple candidates; the node shows a variant filmstrip to pick the keeper, and the selected image is what flows downstream and onto the Timeline. Out-of-range variants are rejected with 400.
- Added "添加到时间线" on Image nodes (parity with Video nodes) and double-click-to-open on image/video node previews.
- Added ComfyUI-style whole-workflow execution: the ▶ 运行全部 toolbar button runs all generation nodes in dependency order (text → image → video) and waits for each step, so a connected Image node automatically produces the first-frame for a Video node.
- Connected downstream nodes now re-render immediately when an upstream node completes, so a Video node linked to an Image node switches to 首帧视频 mode and shows the reference as soon as the image is ready.
- Added `standalone/node-interaction-e2e.mjs` (`pnpm test:nodes`) covering variants, validation, single-output video, presetReferences persistence, and the flow-execution UI surface.

## 2.1.0 - 2026-08-08
- Added QUill-style professional editing layer on the Timeline.
- Added **片段重拍 (anchor-locked segment reshoot)**: a selected video/image clip is re-generated with its source boundary frames extracted as anchor references (`first-frame` + `last-frame`), and the new output replaces the clip in place, keeping timing, track, transform and fades.
- Added **尾帧续写 (tail-frame continuation)**: the last source frame of a clip becomes the first frame of a continuation segment that is appended right after the clip, the long-video primitive toward `video.extend`.
- Anchor/tail keyframes are materialized as project image assets (`source: keyframe`) and served through the existing asset pipeline.
- Added `POST /api/projects/:id/timeline/reshoot` and `POST /api/projects/:id/timeline/extend`, both validated through the existing generation invariants and auto-applied to the Timeline on job success.
- Added the professional editing controls to the clip inspector (prompt + model + 重拍此段 / 续写接片) and an E2E regression suite (`standalone/editing-e2e.mjs`, `pnpm test:editing`).

## 2.0.0 - 2026-08-08
- Replaced the Agent placeholder with a project-persistent creative planning panel.
- Added normalized creative briefs, style bibles, story arcs and 3–12 shot proposals.
- Added native structured-output adapters for OpenAI Responses and Gemini plus validated Agnes JSON output.
- Added one same-provider repair attempt for invalid Agent output, cancellation and a 90-second timeout.
- Added review-before-apply proposals that atomically append idle Text → Image → Video node groups without running paid generation or editing the Timeline.
- Added lazy v1 database migration, bounded Agent history and idempotent proposal application.
- Added Agent provider/E2E coverage and restored cross-platform source validation.

## 1.3.0 - 2026-08-07
- Rebuilt the Standalone Canvas around the QUill-style spatial workflow: full-screen dotted board, compact top bar, floating mouse tools and bottom-center canvas controls.
- Added blank-canvas double-click node catalog and right-click canvas/node context menus.
- Added explicit Select / Hand / Connect mouse modes with V/H/C shortcuts.
- Split generic generation nodes into manual Text, AI Text, Image and Video node families.
- Added AI text presets for storyboard, video script, image prompt expansion and rewrite; text outputs can feed image/video nodes.
- Added image generate/edit capability switching based on image references.
- Added video presets for text-to-video, first-frame, first+last-frame and reference generation.
- Added in-app server-side Provider Settings for OpenAI-compatible text, Seedream, Seedance, Kling, Veo and fal. Secrets are not stored in workflows.
- Added OpenAI-compatible Chat Completions text adapter.
- Added Volcengine Ark Seedream image generation/edit adapter with image reference normalization.
- Retained and regression-tested Seedance, Kling, Veo and fal adapters.
- Expanded provider contract tests to include OpenAI-compatible text and Seedream.
- Preserved v1.2 professional Timeline editing, multi-track FFmpeg export and HTTP Range media serving.

## 1.2.0 - 2026-08-07
- Stabilized Pointer Event node dragging and drag-to-connect edges.
- Added edge selection/delete/reference roles and graph cycle checks.
- Added professional Timeline operations: trim, split, slip, ripple, captions, zoom, snapping and multi-track editing.
- Added multi-track H.264/AAC FFmpeg export and Range media serving.
- Added Seedance, Kling and Veo adapters plus provider contract regression.

## 0.2.0 - 2026-08-07
- Added the original React/Node product skeleton, generation gateway, Asset/Timeline contracts and upstream reference pins.
