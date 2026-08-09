# Unified Generation Nodes — Design QA

- Source visual truth: the existing video node shown in `design-qa-unified-generation-nodes.png`.
- Implementation screenshot: `design-qa-unified-generation-nodes.png`.
- Viewport and pixels: 659 × 916 CSS px, 659 × 916 screenshot px, density 1×.
- State: dark canvas; image, text, and video generation nodes expanded; generated image/video content present.

**Findings**

- No actionable P0, P1, or P2 differences remain between the shared image/text structure and the video-node visual baseline.
- Typography uses the same generation-node title, prompt, menu, and parameter styles across all three node types.
- Spacing and layout rhythm match: 500px composer width, joined header/preview panels, 14px outer radii, top action menu, and fixed-width parameter controls.
- Colors and tokens match because all three nodes now use the same panel, border, selected, text, and muted token rules.
- Image quality is unchanged; the update only changes node chrome and preserves existing generated assets and crop behavior.
- Copy remains capability-specific while placement is consistent: text/image/video action labels occupy the same top menu position.

**Full-view comparison evidence**

- The implementation screenshot places video, image, and temporary text nodes on the same canvas at the same scale. Their title/preview silhouette, composer width, footer alignment, and panel hierarchy are visibly consistent.

**Focused region comparison evidence**

- Separate crops were unnecessary because the fidelity differences were geometric and were verified directly in the rendered DOM: all three headers use `14px 14px 0 0`, previews use `0 0 14px 14px`, the joining borders are 0px, composer width is 500px, advanced controls are absent, footer mode menus are absent, and one top mode menu is present.

**Interaction verification**

- Image composer collapse and re-expand passed.
- Image action menu opened with 文生图、图片编辑、区域聚焦.
- Text action menu opened with 分镜脚本、视频脚本、图片提示词、改写/润色.
- Temporary QA text nodes were removed after verification; no persistent test node remains.
- Browser console errors: none.

**Comparison history**

- Initial mismatch: image/text headers were visually separate from preview; image/text retained different action placement and advanced controls.
- Fix: promoted the video header/preview rules to the shared generation-node system, moved image/text actions to the top menu, removed duplicate footer/advanced controls, and fixed image parameter widths.
- Post-fix evidence: `design-qa-unified-generation-nodes.png` plus the rendered-state checks listed above.

**Implementation Checklist**

- [x] Shared header/preview panel
- [x] Shared composer width and hierarchy
- [x] Shared top action-menu placement
- [x] Fixed parameter widths
- [x] Expand/collapse and menu interactions
- [x] No console errors

**Follow-up Polish**

- None required for this scope.

final result: passed
