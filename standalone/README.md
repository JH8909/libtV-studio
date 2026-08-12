# Standalone v2.0

Run from the repository root with `./start-local.sh` (macOS/Linux) or `start-local.cmd` (Windows), then open `http://127.0.0.1:3000`.

The runtime uses Node.js built-ins only; no npm install, database, Redis or Docker is required. FFmpeg is required for Timeline → MP4 export.

完整中文操作与功能介绍见仓库根目录的 [操作指南](../操作指南.md)。

## Canvas

- Double-click blank canvas or use the bottom **+** button to add nodes.
- Drag a node header to move it; drag right output port to left input port to connect it.
- Generated image/video nodes are preview-first. Click a preview to expand its prompt and parameters; click the same preview, another node, or blank canvas to collapse the active composer without hiding the media.
- Image/video result toolbars appear only after a result exists and its preview is active. They contain Copy, Properties, image enlargement, Download and Delete.
- A job's state is shown in the node header. Failure creates a non-interactive canvas-top notice for five seconds; use the retry control on the failed node to submit again.
- Mouse wheel zooms; `H` or `Space` pans; `V` selects; `F` fits; `Delete` removes the current selected item.

## AI nodes
- Manual Text
- AI Text: Storyboard / Video Script / Image Prompt / Rewrite
- Image Generate / Image Edit
- Text-to-Video / First-frame Video / First+Last-frame Video / Reference Video
- Asset nodes for uploaded/generated image/video/audio

Open **模型/API** in the top bar to configure Agnes, APIMart, DeepSeek and 阿里云百炼. APIMart fetches the account's model list; DeepSeek uses OpenAI-compatible Chat Completions, and 百炼 uses compatible Chat Completions for text/Agent plus native DashScope media endpoints for image/video. Secrets remain server-side in `standalone/data/provider-settings.json` and do not enter workflow JSON.

You can also copy `standalone/.env.example` to `standalone/.env`.

## Timeline shortcuts
- S: split selected clip at playhead.
- Alt + drag video/audio clip: Slip Edit.
- Delete/Backspace: delete selected node/edge/clip.
- Cmd/Ctrl+Z / Cmd/Ctrl+Y: Canvas undo/redo; Timeline also has independent undo/redo controls.

## Regression commands

```bash
node standalone/provider-contract-e2e.mjs
node standalone/agnes-provider-e2e.mjs
```

## Creative planning Agent

Open **Agent** in the top bar to create and revise a project-level short-film plan. A confirmed proposal appends a brief node and one Text → Image → Video group per shot. It does not run generation, modify the Timeline or export.

Configure an Agnes, APIMart, DeepSeek or 百炼 Agent model under **模型/API**. Conversations and proposals persist in the local project; prompts are sent only to the provider selected in the Agent panel.

```bash
node standalone/agent-e2e.mjs
```
