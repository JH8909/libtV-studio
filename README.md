# LibTV Studio Complete v2.0

A local-first AI video creation workspace inspired by the current LibTV product interaction model: a full-screen spatial canvas, direct text/image/video nodes, third-party model APIs, reusable Assets and a professional frame Timeline.

**No ComfyUI. No local GPU runtime.** The Standalone version runs on Node.js 22+ without `npm install`, PostgreSQL, Redis, MinIO or Docker. Mock text/image/video models are always available, so the complete workflow can be tested offline.

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

## v2.0 creative planning Agent

The top-right **Agent** button opens a project-persistent planning workspace:
- Start from one idea and receive a creative brief, style bible, story arc and 3–12 shot plan.
- Continue the conversation to revise the pending proposal.
- Review the exact node impact, then apply the whole plan once.
- Applying appends one brief node plus a Text → Image → Video group for every shot. Nodes remain idle: Agent never starts paid generation, changes the Timeline or exports media.
- OpenAI Responses, Gemini and Agnes planning models are supported through server-side settings. Conversation content is sent to the selected provider; credentials and project history remain local.

Agent model output is strictly validated and converted to graph data by the local server. Models never return executable patches or arbitrary node objects.

## Canvas interaction

The Standalone UI was rebuilt around the LibTV-style spatial interaction requested for this project:
- Full-screen dark dotted infinite workspace instead of permanent sidebars.
- **Double-click blank canvas** → Add Node catalog at the clicked world coordinate.
- **Right-click blank canvas** → Add Node / Fit / mouse mode / Assets / Timeline actions.
- **Right-click node** → Run/Re-run / Duplicate / Disconnect / Inspect / Delete.
- Top-right compact mouse tools: **Select / Hand / Connect**.
- `V` / `H` / `C` switch mouse mode; hold `Space` for temporary Hand mode.
- Drag node headers using pointer capture; pointer-down does not rerender/replace the dragged DOM node.
- Drag an output port directly to an input port with a live connection preview.
- Self-links, duplicate edges and graph cycles are rejected.
- Edges remain selectable/deletable and media-reference roles remain inspectable.
- Bottom-center canvas bar contains Add / Undo / Redo / Fit / Zoom / Help.

See `INTERACTION_v1.3.md` for the interaction contract.

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
- Uses a configurable OpenAI-compatible `/chat/completions` provider
- Native textual `outputText` can flow into downstream text/image/video nodes; text is not faked as a media Asset

## Image nodes

One image node automatically selects the correct capability from its inputs:
- No image reference → `image.generate`
- Connected image reference → `image.edit`

Current providers:
- Mock Image — always available
- Seedream through Volcengine Ark
- fal image models

Image nodes expose prompt, model, aspect ratio/quality controls and show generated output inline. Provider results are downloaded into the project Asset Library before reuse.

## Video nodes

Video creation is represented by explicit presets instead of one overloaded generic node:
- Text-to-Video — `video.generate`
- First-frame Video — `video.image_to_video`
- First + Last Frame — `video.first_last_frame`
- Reference Video — `video.reference`

Each video node can switch explicitly between these four modes. Reference roles are normalized for the selected mode, missing required frames are rejected before submission, model duration/aspect/resolution controls follow registry constraints, and completed videos can be played or sent directly to the Timeline. Active jobs reconnect after a page reload; interrupted jobs become retryable instead of remaining stuck.

Current providers:
- Mock Video
- Seedance / Volcengine Ark
- Kling
- Google Veo
- fal

Duration/aspect/resolution choices are driven from Provider Registry metadata. References preserve roles such as `first-frame`, `last-frame`, `reference-image`, `reference-video` and `reference-audio`.

## In-app third-party API configuration

Click **模型/API** in the top bar. The modal currently supports:
- OpenAI-compatible text
- Agnes AI text, image and video
- Seedream
- Seedance
- Kling
- Google Veo
- fal

Credentials are sent only to the local Standalone server and saved in:

```text
standalone/data/provider-settings.json
```

Secret fields are masked when read back and are never persisted in Workflow JSON. Environment variables remain supported as an alternative; start from `standalone/.env.example`.

### OpenAI-compatible text

```bash
OPENAI_COMPAT_API_KEY=...
OPENAI_COMPAT_BASE_URL=https://api.openai.com/v1
OPENAI_COMPAT_TEXT_MODEL=gpt-5-mini
```

### Agnes AI

```bash
AGNES_API_KEY=...
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
AGNES_TEXT_MODEL=agnes-2.5-flash
AGNES_IMAGE_MODEL=agnes-image-2.1-flash
AGNES_VIDEO_MODEL=agnes-video-v2.0
```

The adapter supports `text.generate`, `image.generate`, `image.edit`, `video.generate`, `video.image_to_video` and `video.first_last_frame`. Agnes image references may use local Data URIs. Agnes-generated images retain their provider URL for video references; uploaded/local-only images require `PUBLIC_BASE_URL` because the video API requires publicly accessible image URLs.

### Seedream + Seedance / Ark

```bash
ARK_API_KEY=...
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_IMAGE_MODEL=doubao-seedream-4-0-250828
ARK_VIDEO_MODEL=doubao-seedance-2-0-fast-260128
```

Seedream supports both image generation and image edit/reference flows in this adapter. Seedance uses the Ark asynchronous content-generation task path.

### Kling

```bash
KLING_ACCESS_KEY=...
KLING_SECRET_KEY=...
KLING_VIDEO_MODEL=kling-v3
```

The server signs the HS256 bearer JWT and supports text-to-video, image-to-video and first/last-frame requests.

### Google Veo

```bash
GEMINI_API_KEY=...
VEO_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VEO_MODEL=veo-3.1-generate-preview
```

The adapter uses long-running video generation operations and supports inline first/last-frame media.

### fal

```bash
FAL_KEY=...
FAL_IMAGE_MODEL=fal-ai/qwen-image
FAL_VIDEO_MODEL=fal-ai/wan/v2.7/text-to-video
FAL_VIDEO_IMAGE_MODEL=fal-ai/wan/v2.7/image-to-video
```

## Asset pipeline

Vendor result URLs never become the permanent project source. The runtime uses:

`Provider result → download/normalize → local Asset → Canvas/Timeline`

Local/reference images in formats supported by the installed FFmpeg build are normalized to PNG before being sent inline or by public URL. PNG, JPEG, and WebP references are used directly.

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

Product loop:

```bash
node standalone/e2e.mjs
```

Creative planning Agent, provider contracts, proposal revision and graph application:

```bash
node standalone/agent-e2e.mjs
```

Professional Timeline/export:

```bash
node standalone/e2e-pro.mjs
```

Provider contracts using local fake vendor endpoints — no paid request:

```bash
node standalone/provider-contract-e2e.mjs
```

Video node modes, validation, cancellation and persistence:

```bash
node standalone/video-node-e2e.mjs
```

v1.3 Provider Contract coverage:
- OpenAI-compatible text request/output
- Seedream image edit + PNG reference normalization
- Seedance asynchronous task + first frame
- Kling JWT + image2video + last frame
- Veo long-running operation + inline first/last frames

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
