# Test Report — v2.0

Date: 2026-08-08  
Environment: Windows 10.0.19045, Node.js 24.18.0, pnpm 11.16.0, FFmpeg 8.1.2

## Release gates

- `python scripts/validate-source.py` — PASS (42 TypeScript/TSX files and package JSON)
- `npm run typecheck` — PASS (all 9 typed workspace projects)
- `pnpm --filter @libtv/web build` — PASS (optimized Next.js production build)
- `npm run test:standalone` — PASS
- `npm run test:standalone:pro` — PASS (H.264/AAC export with video and audio streams)
- `npm run test:video-node` — PASS (4 modes, cancel, constraints, UI guards)
- `npm run test:agnes` — PASS (text, image edit, and 3 video modes)
- `npm run test:providers` — PASS (OpenAI-compatible, Seedream, Seedance, Kling, Veo contracts)
- `npm run test:agent` — PASS

All provider and Agent contract tests use local fake endpoints and make no paid API request.

## Agent acceptance

- OpenAI Responses, Gemini `generateContent`, and Agnes Chat Completions mappings pass.
- Question and proposal replies pass strict local validation.
- Invalid provider output is repaired once by the same provider; success and failure paths are covered.
- Provider refusal, rate limiting, 90-second timeout wiring, and client-to-provider cancellation propagation are covered.
- Proposal revisions supersede the prior pending proposal.
- Applying a proposal creates 10 idle nodes for the 3-shot fixture and no generation job.
- Reapplying the same proposal is idempotent; a superseded proposal is rejected.
- Existing workflow data is preserved and v1 data lazily migrates to database version 2.
- Clearing the Agent session leaves the canvas unchanged.

## Browser regression

Real in-app browser QA against the local Standalone server — PASS:

- Agent drawer opens without obscuring the document viewport at desktop width.
- Configured model and pending proposal render correctly.
- Applying the 3-shot proposal appends the brief and 9 shot nodes in aligned columns.
- The applied proposal cannot be applied again.
- Drawer scrolling and canvas fit behavior work; browser console errors and warnings: 0.

## Notes

The first recursive workspace build attempt exited during Next.js build-trace collection without an emitted diagnostic. An immediate isolated rerun completed successfully and produced the expected static routes. Cross-platform timeline/provider fixtures use PNG because SVG decoding depends on the installed FFmpeg build.
