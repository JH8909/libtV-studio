# Next Integration Pass: Canvas + Timeline

## A. Bring upstream source into a disposable staging directory
Run `bash scripts/pull-upstreams.sh`. Keep `.upstream/` out of commits. The goal is selective migration, not a permanent nested runtime dependency.

## B. TongFlow migration order
1. Copy/adapt `src/components/workspace/` into `packages/canvas/src/workspace/`.
2. Copy/adapt `src/hooks/use-flow*` into `packages/canvas/src/state/`.
3. Copy/adapt `src/lib/workflow/` into `packages/canvas/src/workflow/`.
4. Replace TongFlow plugin-execution calls with an app client that submits `GenerationRequest` to `POST /generations`.
5. Replace durable `file_key`/base64 output assumptions with `assetId` returned by the generation API.

## C. OpenChatCut migration order
1. Move pure domain code from `src/editor/types.ts` and reducers/utilities into `packages/editor/src/domain/`.
2. Move timeline components after the pure domain compiles independently.
3. Port generation-reference preflight from `src/generate/video.ts`, but read limits from Provider Model metadata instead of hardcoded model names.
4. Replace `src` media paths with an `AssetResolver` that consumes `assetId` and returns project-scoped storage metadata.
5. Only then port selected Agent tools and Remotion/FFmpeg export code.

## D. First cross-surface contract
Canvas output:
- generation completes -> API returns `assetId`
- node stores `assetId`
- context action: `Add to timeline`

Timeline reference:
- selected clip -> build `GenerationReference`
- reference stores `assetId` plus optional source frame range
- generation worker resolves the reference before calling a provider

## E. Provider work after UI migration starts
Implement one real image provider and one real video provider before adding more vendors. Recommended first pair:
- Image: Seedream or another API already available to you.
- Video: Seedance or Kling, depending on the account/API access you already have.

Do not add provider-specific fields to Canvas node types. Put them in Provider Model metadata + `params` schemas.
