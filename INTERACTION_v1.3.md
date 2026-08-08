# Canvas Interaction Contract — v1.3

This document defines the interaction rules for the Standalone spatial canvas. The goal is to keep node actions predictable and prevent drag/pan/connect handlers from competing for the same pointer sequence.

## Blank canvas
- Double click: open the Add Node catalog at the clicked world coordinate.
- Right click: open Canvas Context Menu with Add Node, Fit, Select/Hand tool, Assets and Timeline actions.
- Mouse wheel: zoom around the cursor.
- Hand mode or Space + drag: pan the canvas.
- Select mode + click blank space: clear node/edge selection.

## Nodes
- Drag node header in Select mode: move node using pointer capture; graph data is committed after pointer-up.
- Right click node: Run/Re-run, Duplicate, Disconnect, Inspect, Delete.
- Right output handle → left input handle: create an edge with live preview.
- Self-links, duplicate links and graph cycles are rejected.
- Text output can feed AI Text, Image and Video nodes.
- Image output can feed Image Edit or Video reference inputs.
- Video/Audio Assets can feed compatible Video reference inputs.

## Mouse modes
- V — Select: select/move nodes and clips.
- H — Hand: pan the canvas without selecting nodes.
- C — Connect: prioritizes connection handles and link authoring.
- Space (held) — temporary Hand mode.
- F — fit all nodes into view.

## Node families
- Manual Text — hand-authored creative text/Prompt.
- AI Text — storyboard, video-script, image-prompt and rewrite presets.
- Image — text-to-image or image-edit depending on connected references.
- Video — text-to-video, first-frame, first+last-frame or reference generation.
- Asset — uploaded/generated image, video or audio media.

## Provider boundary
Canvas nodes persist `capability + providerId + modelId + params + references`, never API secrets. Provider secrets live only in the Standalone server-side provider settings file or environment variables.
