# Design QA — Video node closure

## Evidence

- Annotated source: `C:\Users\JH4AEF~1.DES\AppData\Local\Temp\codex-clipboard-db03ad3c-033d-4880-a7fc-8ab7fa9ee9f3.png`.
- Final layout: `artifacts/design-qa/video-node-final.jpg`.
- Expanded completed node: `artifacts/design-qa/video-node-completed-expanded.jpg`.
- Real regeneration progress: `artifacts/design-qa/video-node-regenerate-progress-1.jpg`.
- Advanced parameters: `artifacts/design-qa/video-node-advanced-open.jpg`.
- Desktop viewport: `1280 x 720`, DPR `1`.

## Product issues found and resolved

1. Completed previews swallowed the card click, so the input area could no longer be reached. The header now owns an explicit expand/collapse button with `aria-expanded`; clicking the video only controls playback.
2. Preview width, composer width, port position, collision detection, and persisted layout used different dimensions. Generation nodes now share one size model, and legacy layouts migrate once while preserving order and a 30 px minimum gap.
3. Full-canvas rendering recreated every `<video>` element during progress updates. Progress now patches only the active node; terminal updates replace only that node.
4. Success refreshed assets before attaching output IDs. Output state is now committed first, so preview, timeline action, and inspector read the same result.
5. Progress and actions used absolute offsets and fixed pixel widths. The composer now uses a normal-flow grid; progress stays inside the card, and the lower controls keep one aligned row.
6. Redundant success text and node-level cancel UI were removed. A finished preview is the success signal; regeneration keeps the existing preview visible and reports progress below the controls.
7. Advanced parameters and video mode menus could overflow or cover input content. Both menus now open below their trigger, raise only the owning node, and remain inside the viewport.
8. Mock image generation produced SVG files that Windows FFmpeg could not decode during timeline export. Mock output now uses PNG, restoring the end-to-end export path.

## Browser checks

- Three persisted video nodes migrated into non-overlapping columns.
- Completed-node header expanded the composer from 2 to 3 open cards and collapsed it again successfully.
- Clicking the completed video left the expanded-card count unchanged (`2 -> 2`); there was no accidental enlargement.
- Expanded composers measured consistently and remained aligned.
- Advanced-parameter popover: `250 x 118`, fully inside the viewport.
- Video-mode popover: `170 x 145`, fully inside the viewport.
- Node cancel buttons: `0`.
- Progress elements using absolute positioning: `0`.
- Horizontal page overflow: `false`.
- Page-level console errors during the tested flow: none.

## Automated verification

- `node --check standalone/public/app.js`: passed.
- `node --check standalone/server.mjs`: passed.
- `npm run test:standalone`: passed, including upload, mock image/video generation, and FFmpeg timeline export.
- `npm run test:video-node`: passed for four generation modes, cancellation backend behavior, validation cases, and six UI guards.
- `npm run test:agnes`: passed for Agnes text, image-edit, and three video request modes.

## Visual result

- Typography and icons follow the shared monochrome outline system.
- Preview remains compact; the composer is wider only where the control row needs space.
- Prompt, parameter row, secondary actions, generate button, and progress feedback have a stable hierarchy.
- No P0, P1, or P2 visual or interaction defect remains in the inspected video-node flow.

final result: passed
