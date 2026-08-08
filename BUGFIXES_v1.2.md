# v1.2 Stabilization Notes

## Canvas bugs fixed
- Removed DOM-replacing rerender from node drag start.
- Replaced click-to-connect state with pointer-drag connection state.
- Added live edge preview and hit testing.
- Fixed edge cycle detection to test `target → source` reachability correctly.
- Prevented node self-links and duplicate edges.
- Added visible/free node placement and selected-node-relative placement.
- Added selected/dragging z-order.
- Added media Reference Role editing on edges.
- Added Canvas history around structural edits.

## Media / preview bugs fixed
- Added proper HTTP Range support for local media.
- Preview no longer destroys/recreates active video elements every playback tick.
- Video preview synchronizes currentTime to Source In / playback rate with drift correction.

## Timeline bugs fixed / features added
- Synchronized horizontal Timeline ruler scrolling.
- Sticky track labels.
- Move, cross-track move, Trim, Slip, Split, Duplicate, Ripple Delete.
- Snapping, Timeline Undo/Redo, zoom, mute/hide.
- Crossfade helper and per-clip fades.
- Caption track and UTF-8 caption export.
- Multi-track visual compositing and audio mixing in FFmpeg export.

## Provider layer
- Direct Seedance/Ark async adapter.
- Direct Kling JWT text/image video adapter.
- Direct Veo long-running operation adapter.
- Server-side model constraints and media-reference validation.
- Cancellation status is preserved instead of being overwritten as `failed` by a late provider poll.
