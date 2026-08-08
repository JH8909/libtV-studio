# Changelog

## 2.0.0 - 2026-08-08
- Replaced the Agent placeholder with a project-persistent creative planning panel.
- Added normalized creative briefs, style bibles, story arcs and 3–12 shot proposals.
- Added native structured-output adapters for OpenAI Responses and Gemini plus validated Agnes JSON output.
- Added one same-provider repair attempt for invalid Agent output, cancellation and a 90-second timeout.
- Added review-before-apply proposals that atomically append idle Text → Image → Video node groups without running paid generation or editing the Timeline.
- Added lazy v1 database migration, bounded Agent history and idempotent proposal application.
- Added Agent provider/E2E coverage and restored cross-platform source validation.

## 1.3.0 - 2026-08-07
- Rebuilt the Standalone Canvas around the LibTV-style spatial workflow: full-screen dotted board, compact top bar, floating mouse tools and bottom-center canvas controls.
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
