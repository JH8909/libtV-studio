# Canvas Interaction Contract — v1.3

This document defines the interaction rules for the Standalone spatial canvas. The goal is to keep node actions predictable and prevent drag/pan/connect handlers from competing for the same pointer sequence.

The target under the pointer owns the interaction. A stale selection must never change a blank-canvas or edge command into a node command.

## Blank canvas
- Double click: open the Add Node catalog at the clicked world coordinate.
- Right click: clear node/edge selection and open Canvas Context Menu with Add Node, Auto Layout, Run All (when available), Fit, Select/Hand tool, Assets and Timeline actions. It must not contain Duplicate, Disconnect, Inspect or Delete.
- Mouse wheel: zoom around the cursor.
- Hand mode or Space + drag: pan the canvas.
- Select mode + click blank space: clear node/edge selection.

## Nodes
- Drag node header in Select mode: move node using pointer capture; graph data is committed after pointer-up.
- Right click node: select the target under the pointer, then show only Run/Re-run, Duplicate, Disconnect, Inspect, Expand/Collapse input and Delete for that node.
- Click a collapsed generation preview: select the node and expand its input. If the expanded node leaves the canvas safe area, pan it fully into view.
- Click an expanded generation preview outside an actionable child: collapse it. Controls inside the preview/composer do not toggle collapse.
- Right output handle → left input handle: create an edge with live preview.
- Self-links, duplicate links and graph cycles are rejected.
- Text output can feed AI Text, Image and Video nodes.
- Image output can feed Image Edit or Video reference inputs.
- Video/Audio Assets can feed compatible Video reference inputs.

## Edges
- Click: select the edge without selecting either endpoint.
- Right click: select the edge and show Disconnect/Delete only.
- Delete/Backspace removes the selected edge when focus is not in a text-editing control.

## Event priority
Resolve a pointer or keyboard event in this order; once handled, it must not fall through to a lower layer:

1. Modal or full-screen surface.
2. Open menu, Popover, drawer form or Timeline control.
3. Text input, textarea, select-like control or editable content.
4. Connection handle and edge hit target.
5. Node action, preview or header.
6. Canvas selection, marquee, pan and zoom.

- Wheel events inside scrollable text, menus, Popovers, drawers and Timeline scroll their owner and never zoom the canvas.
- Pointer sequences are decided on pointer-down and keep that owner until pointer-up/cancel; a drag must not become a click after crossing the movement threshold.
- `Space` temporarily enters Hand mode only when focus is not in text entry. Releasing `Space` restores the prior tool.

## Mouse modes
- V — Select: select/move nodes and clips.
- H — Hand: pan the canvas without selecting nodes.
- C — Connect: prioritizes connection handles and link authoring.
- Space (held) — temporary Hand mode.
- F — fit all nodes into view.

## Zoom and safe area
- 75% or above: full edit behavior.
- 50–74%: node controls are compact; opening a node menu first centers the target and raises zoom to at least 75%.
- Below 50%: overview behavior only. Double-clicking a node centers it at 100% before exposing edit controls.
- The safe area excludes the top bar, bottom canvas toolbar, open drawers and expanded Timeline. Expand, reveal, fit and auto-layout operations keep the full active node at least 16px inside that area.
- Menus and Popovers use viewport coordinates and remain at readable screen size; they flip or shift to remain at least 8px inside the safe area.

## Menus, overlays and Escape
- Only one menu/Popover in the active trigger chain may be open. Opening another closes the previous peer.
- Outside click closes the top menu/Popover without changing canvas selection unless the click continues as an intentional canvas action.
- `Escape` closes exactly one highest layer in this order: modal/full-screen → menu/Popover → active drag/connect → drawer/Timeline → selection. It must not close several layers or abort an unrelated generation in one press.
- Modal focus is trapped inside the modal and restored to its trigger on close. Menu focus starts on the active/first item and returns to its trigger on close.

## Destructive actions and undo
- Delete/Backspace never deletes nodes, edges or clips while focus is in text entry.
- A context-menu delete applies only to the object that opened the menu, not an earlier selection.
- Node, edge and clip deletion must create an undo snapshot before mutation and announce the affected object.

## Node families
- Manual Text — hand-authored creative text/Prompt.
- AI Text — storyboard, video-script, image-prompt and rewrite presets.
- Image — text-to-image or image-edit depending on connected references.
- Video — text-to-video, first-frame, first+last-frame or reference generation.
- Asset — uploaded/generated image, video or audio media.

## Provider boundary
Canvas nodes persist `capability + providerId + modelId + params + references`, never API secrets. Provider secrets live only in the Standalone server-side provider settings file or environment variables.
