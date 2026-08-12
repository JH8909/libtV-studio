# LibTV Studio Complete v2.0

A local-first AI video creation workspace inspired by the current LibTV product interaction model: a full-screen spatial canvas, direct text/image/video nodes, third-party model APIs, reusable Assets and a professional frame Timeline.

**No ComfyUI. No local GPU runtime.** The Standalone version runs on Node.js 22+ without `npm install`, PostgreSQL, Redis, MinIO or Docker. Generation uses the third-party providers configured in the local model settings.

## Start

Requirements:
- Node.js **22+**
- FFmpeg for Timeline → MP4 export
- A system font/fontconfig for caption export; optionally set `FFMPEG_FONT_FILE`

macOS / Linux:

```bash
./start-local.sh
```

Windows:

```bat
start-local.cmd
```

Open `http://127.0.0.1:3000`.

中文功能介绍、画布操作、生成流程与快捷键请见 [操作指南](操作指南.md)。

## v2.0 creative planning Agent

The top-right **Agent** button opens a project-persistent planning workspace:
- Start from one idea and receive a creative brief, style bible, story arc and 3–12 shot plan.
- Continue the conversation to revise the pending proposal.
- Review the exact node impact, then apply the whole plan once.
- Applying appends one brief node plus a Text → Image → Video group for every shot. Nodes remain idle: Agent never starts paid generation, changes the Timeline or exports media.
- Agnes and enabled APIMart planning models are supported through server-side settings. Conversation content is sent to the selected provider; credentials and project history remain local.

Agent model output is strictly validated and converted to graph data by the local server. Models never return executable patches or arbitrary node objects.

## Canvas interaction

- Full-screen spatial canvas: double-click blank space or use the bottom **+** button to create nodes.
- Drag node headers to move nodes; drag output port → input port to connect. Duplicate links and cycles are rejected.
- Generated image/video nodes are preview-first: click the preview to show its composer and top toolbar; click it again, another node, or blank canvas to collapse only that active composer while preserving the media preview.
- The expanded result toolbar provides Copy, Properties, image enlargement, Download and Delete. Empty nodes have no result toolbar.
- The bottom bar provides pan, Undo/Redo, Run All, Fit, Zoom and Help. `V`, `H`, `F`, `Space`, `Delete` and `Esc` are supported; details are in [操作指南](操作指南.md).
- Generation state lives in the node header. A failed task creates a canvas-top informational notice that disappears after five seconds; the node retains its retry action and all settings.

## Text nodes

Two different concepts are intentionally separated:

**Manual Text**
- Creative idea
- Prompt
- Existing script
- Notes/instructions
- Can feed AI Text, Image or Video nodes

**AI Text** (`text.generate`)
- Storyboard / 分镜脚本
- Video Script / 视频脚本
- Image Prompt expansion / 图片提示词
- Rewrite / 改写润色
- Uses an enabled Agnes or APIMart text model
- Native textual `outputText` can flow into downstream text/image/video nodes; text is not faked as a media Asset

## Image nodes

One image node automatically selects the correct capability from its inputs:
- No image reference → `image.generate`
- Connected image reference → `image.edit`

Current providers:
- Agnes
- APIMart models discovered from the account

Image nodes expose prompt, model, aspect ratio/quality controls and show generated output inline. Provider results are downloaded into the project Asset Library before reuse.

Node workflow highlights:
- **Reference panel** — Image and Video nodes can attach references directly from the Asset Library. Roles are assigned by asset kind and selected video mode (`first-frame` / `last-frame` / `reference-image` / `reference-video` / `reference-audio`) and can be switched or removed inside the node.
- **Best-of-N variants** — set quantity to 2 or 4; select the keeper on the result filmstrip. The selected image flows downstream and to the Timeline.
- **Run All** — the bottom toolbar play button runs generation nodes in dependency order. A Video node can first produce its required upstream image; if a dependency fails, the downstream job stops.
- **Ports and status** — drag output → input for an explicit connection. Connections are selectable and removable; node headers show queued, processing percentage, success, failure or cancellation.
- **Failure feedback** — generation settings stay on the node. A short canvas-top failure notice disappears after five seconds; retry from the failed node.
- **Full-screen preview** — the ⛶ button opens the timeline preview full-screen (`Esc` closes it).



## Video nodes

Video creation is represented by explicit presets instead of one overloaded generic node:
- Text-to-Video — `video.generate`
- First-frame Video — `video.image_to_video`
- First + Last Frame — `video.first_last_frame`
- Reference Video — `video.reference`

Each video node can switch explicitly between these four modes. Reference roles are normalized for the selected mode, missing required frames are rejected before submission, model duration/aspect/resolution controls follow registry constraints, and completed videos can be played or sent directly to the Timeline. Active jobs reconnect after a page reload; interrupted jobs become retryable instead of remaining stuck.

Current providers:
- Agnes
- APIMart models discovered from the account

Duration/aspect/resolution choices are driven from Provider Registry metadata. References preserve roles such as `first-frame`, `last-frame`, `reference-image`, `reference-video` and `reference-audio`.

## In-app third-party API configuration

Click **模型/API** in the top bar. The modal currently supports:
- Agnes AI text, image and video
- APIMart: enter one API Key, then enable models grouped by text/Agent, image and video

Credentials are sent only to the local Standalone server and saved in:

```text
standalone/data/provider-settings.json
```

Secret fields are masked when read back and are never persisted in Workflow JSON. Environment variables remain supported as an alternative; start from `standalone/.env.example`.

### Agnes AI

```bash
AGNES_API_KEY=...
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
AGNES_TEXT_MODEL=agnes-2.5-flash
AGNES_IMAGE_MODEL=agnes-image-2.1-flash
AGNES_VIDEO_MODEL=agnes-video-v2.0
```

The adapter supports `text.generate`, `image.generate`, `image.edit`, `video.generate`, `video.image_to_video` and `video.first_last_frame`. Agnes image references may use local Data URIs. Agnes-generated images retain their provider URL for video references; uploaded/local-only images require `PUBLIC_BASE_URL` because the video API requires publicly accessible image URLs.

### APIMart

```bash
APIMART_API_KEY=...
```

The server calls `GET /v1/models`, classifies the returned models for the Canvas and Agent selectors, uploads reference images, and uses APIMart's asynchronous image/video task API.

### DeepSeek / Alibaba Cloud Bailian

```bash
DEEPSEEK_API_KEY=...
BAILIAN_API_KEY=...
BAILIAN_MEDIA_BASE_URL=https://dashscope.aliyuncs.com/api/v1
```

DeepSeek uses OpenAI-compatible Chat Completions for `text.generate` and Agent planning. 百炼 uses compatible Chat Completions for text/Agent, plus native DashScope media endpoints for `image.generate` and `video.generate`; configure Base URL and category models from **模型/API** when defaults do not match your workspace.

## Asset pipeline

Vendor result URLs never become the permanent project source. The runtime uses:

`Provider result → download/normalize → local Asset → Canvas/Timeline`

Local/reference images in formats supported by the installed FFmpeg build are normalized to PNG before being sent inline or by public URL. PNG, JPEG, and WebP references are used directly.

Assets are auto-tagged (kind + `generated`/`uploaded` + provider). The Asset drawer has filter chips (全部 / 生成 / 上传 / 图片 / 视频 / 音频), and the asset inspector can add/remove custom tags. Server filtering: `GET /api/projects/:id/assets?tag=X&kind=image` and `PATCH /api/projects/:id/assets/:id` (`{add:[],remove:[]}`).

## Timeline editor

The existing v1.2 OpenChatCut-style editing surface remains intact:
- Tracks: `C1`, `V2`, `V1`, `A1`, `A2`
- Move and compatible cross-track move
- Left/right Trim
- Alt + drag Slip Edit
- Split at playhead
- Duplicate
- Delete / Ripple Delete
- Clip/playhead/boundary snapping
- Timeline Undo/Redo
- Timeline zoom
- Track mute/hide
- Source In / playback rate / volume / opacity / X/Y / scale / fades
- Caption/Text clips with font size/color/position
- Selected clip → AI Reference with `timelineItemId`, `sourceInFrame`, `sourceOutFrame`
- HTTP Range (`206`) media serving for stable video seek/preview

### Professional editing (LibTV-style)

The clip inspector adds a **专业编辑** section for two LibTV-style controllable regeneration flows. Both reuse the existing generation invariants (references, constraints, job state) and both require FFmpeg for keyframe extraction:

- **重拍此段 (anchor-locked reshoot)** — `POST /api/projects/:id/timeline/reshoot`. The server extracts the clip's source boundary frames (`anchor-in` at `sourceInFrame`, `anchor-out` at `sourceOutFrame`) into image assets and submits a `video.first_last_frame` generation with those anchors as references. On success the new video **replaces the clip in place**, preserving timing, track, transform and fades.
- **续写接片 (tail-frame continuation)** — `POST /api/projects/:id/timeline/extend`. The last source frame of the selected clip becomes the `first-frame` of a `video.image_to_video` generation; on success a new clip is **appended right after** the selected one. Chain it repeatedly to build long sequences.

Anchor/tail keyframes are materialized in the project Asset Library (`source: keyframe`) and are reusable as references elsewhere.

## FFmpeg export

Timeline → MP4 supports:
- V1/V2 visual compositing
- Position, scale, opacity
- Fade/crossfade-style alpha transitions
- Video-source audio + A1/A2 audio
- Volume, speed, fade and Timeline delay
- Multi-source audio mixing
- UTF-8 captions through drawtext
- H.264 video + AAC audio

## Regression tests

Creative planning Agent, provider contracts, proposal revision and graph application:

```bash
node standalone/agent-e2e.mjs
```

Provider contracts using local fake vendor endpoints — no paid request:

```bash
node standalone/provider-contract-e2e.mjs
```

v1.3 Provider Contract coverage:
- APIMart model discovery and categorized selection
- APIMart text/Agent, image upload, asynchronous image/video tasks and first/last frames

See `TEST_REPORT_v2.0.md` for the final regression results.

## Persistence

Standalone data:

```text
standalone/data/
├── db.json
├── provider-settings.json
├── assets/
└── exports/
```

## Scalable service path

The repository still contains `apps/` + `packages/` for eventual multi-user deployment:
- `apps/web` — React/Next product shell
- `apps/api` — Fastify API
- `apps/worker` — BullMQ jobs
- `packages/canvas` — ReactFlow/Zustand path
- `packages/editor` — frame editor path
- `packages/media-gateway` — provider registry / validation
- `packages/storage` — S3/MinIO
- `packages/db` — PostgreSQL/Drizzle

Standalone and service architecture share the same domain boundary:

`Project → Workflow → GenerationJob → Asset → TimelineItem → GenerationReference`

`UPSTREAM_COMPONENTS.md` records the pinned TongFlow, OpenChatCut and mcp-video-gen reference snapshots.
