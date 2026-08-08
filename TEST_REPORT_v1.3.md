# Test Report — v1.3

Date: 2026-08-07

## Server / product loop
`node standalone/e2e.mjs` — PASS
- Project creation
- Upload
- Mock image generation
- Image-to-video
- Workflow save
- Timeline save
- MP4 export

## Professional Timeline/export
`node standalone/e2e-pro.mjs` — PASS
- Visual overlay tracks
- Audio mix
- UTF-8 caption rendering
- H.264/AAC export
- ffprobe confirms video + audio streams

## Provider contracts
`node standalone/provider-contract-e2e.mjs` — PASS
- OpenAI-compatible Chat Completions request + textual output
- Seedream image-edit request + PNG reference normalization
- Seedance async task submit + first-frame payload
- Kling JWT + image2video + image_tail
- Veo long-running operation + inline first/last-frame media + `referenceImages` + duration/seed mapping

All provider contract tests use local fake vendor endpoints and make no paid API request.

## Canvas interaction regression
Headless Chromium / Playwright DOM regression — PASS
- Seed welcome graph: 3 nodes
- Double-click blank canvas opens node catalog
- Catalog contains Text / Image / Video / Assets groups
- Storyboard node creation
- Node right-click context menu
- Node header drag changes node position
- Drag output handle → input handle creates an edge
- Select / Hand / Connect modes activate independently
- Blank-canvas right-click context menu
- Provider Settings modal renders 6 provider cards
- JavaScript page errors: 0

Browser navigation to localhost is restricted in the execution sandbox, so the UI regression loads the final HTML/CSS/JS directly and mocks API responses. Server E2E tests run separately against the real Node HTTP server.

## Source validation
`python3 scripts/validate-source.py` — PASS
- 36 TypeScript/TSX source files: no parser diagnostics
- package JSON files: parse successfully
- Full monorepo dependency typecheck still requires installing pnpm dependencies; Standalone runtime itself has no npm dependency.
