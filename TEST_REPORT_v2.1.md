# Test Report — v2.1

Date: 2026-08-08  
Environment: Node.js 24.18.0, FFmpeg 8.1.2

## Professional editing (LibTV-style) acceptance

`node standalone/editing-e2e.mjs` — PASS

- **Anchor-locked segment reshoot** (`POST /api/projects/:id/timeline/reshoot`):
  - Source boundary frames are extracted (`anchor-in` at `sourceInFrame`, `anchor-out` at `sourceOutFrame`) and materialized as `source: keyframe` image assets.
  - A `video.first_last_frame` generation is submitted with those anchors as references and validated through the shared generation invariants.
  - On success the new video **replaces the clip in place**: `sourceAssetId` points to the reshoot output, while `startFrame`/`durationInFrames`/`track` are preserved.
- **Tail-frame continuation** (`POST /api/projects/:id/timeline/extend`):
  - The last source frame of the selected clip becomes the `first-frame` of a `video.image_to_video` generation.
  - On success a new clip is **appended right after** the selected clip at the correct `startFrame` on the same track.
- **Regression:** the reshoot+extend composed timeline still exports a valid H.264 MP4 (bytes verified; >5 KB).
- **UI guards:** the clip inspector renders the 专业编辑 section (`editSectionHtml`), and 重拍此段 / 续写接片 are wired to the two endpoints.

## Release gates (unchanged from v2.0)

- `node standalone/e2e.mjs` — PASS
- `node standalone/e2e-pro.mjs` — PASS (H.264/AAC export with video and audio streams)
- `node standalone/video-node-e2e.mjs` — PASS
- `node standalone/agnes-provider-e2e.mjs` — PASS
- `node standalone/provider-contract-e2e.mjs` — PASS (all contracts use local fake endpoints; no paid request)
- `node standalone/agent-e2e.mjs` — PASS
- `python scripts/validate-source.py` — PASS

All keyframe extraction in the new endpoints requires FFmpeg; PNG/JPEG/WebP image clips skip extraction and use the image itself as the anchor.
