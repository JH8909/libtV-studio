import { GENERATION_REFERENCE_ROLES } from "../lib/shared-contract.mjs";

const SEMANTIC_REFERENCE_ROLES = new Set([
  "subject",
  "style",
  "composition",
  "content",
  "motion",
  "audio",
  "continuity",
]);

const ROLE_SET = new Set(GENERATION_REFERENCE_ROLES);

/**
 * Normalize a generation reference toward packages/shared GenerationReference
 * plus standalone extensions (source, semanticRole, region, timelineRange).
 */
export function normalizeGenerationReference(value) {
  const raw = value && typeof value === "object" ? value : {};
  const ref = { ...raw, assetId: String(raw.assetId || ""), role: String(raw.role || "") };
  ref.source = raw.source || (raw.timelineItemId ? "timeline" : raw.sourceNodeId ? "node" : "asset");
  if (!["asset", "node", "timeline"].includes(ref.source)) {
    throw Object.assign(new Error(`unsupported reference source: ${ref.source}`), { status: 400 });
  }
  ref.semanticRole =
    raw.semanticRole ||
    (["first-frame", "last-frame"].includes(ref.role)
      ? "continuity"
      : ref.role === "reference-video"
        ? "motion"
        : ref.role === "reference-audio"
          ? "audio"
          : "subject");
  if (!SEMANTIC_REFERENCE_ROLES.has(ref.semanticRole)) {
    throw Object.assign(new Error(`unsupported semantic reference role: ${ref.semanticRole}`), { status: 400 });
  }
  if (raw.label != null) ref.label = String(raw.label).slice(0, 240);
  if (raw.region != null) {
    const region = Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(raw.region?.[key])]));
    if (
      !Object.values(region).every(Number.isFinite) ||
      region.x < 0 ||
      region.y < 0 ||
      region.width <= 0 ||
      region.height <= 0 ||
      region.x + region.width > 1 ||
      region.y + region.height > 1
    ) {
      throw Object.assign(new Error("reference region must fit within normalized 0..1 bounds"), { status: 400 });
    }
    ref.region = region;
  }
  const range = raw.timelineRange || (raw.timelineItemId ? { startFrame: raw.sourceInFrame, endFrame: raw.sourceOutFrame } : null);
  if (range) {
    const startFrame = Number(range.startFrame);
    const endFrame = Number(range.endFrame);
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || startFrame < 0 || endFrame <= startFrame) {
      throw Object.assign(new Error("timeline reference has an empty source range"), { status: 400 });
    }
    ref.timelineRange = { startFrame, endFrame };
  }
  return ref;
}

/**
 * Preflight aligned with packages/media-gateway model-validation + standalone asset checks.
 * @param {object} model ProviderModel
 * @param {object} body GenerationRequest-shaped
 * @param {object[]} references normalized refs
 * @param {(assetId: string) => object | undefined} getAsset
 */
export function validateGenerationRequest(model, body, references, getAsset) {
  const prompt = String(body.prompt || "").trim();
  if (!prompt) throw Object.assign(new Error("prompt is required"), { status: 400 });
  const params = body.params && typeof body.params === "object" ? body.params : {};
  const c = model.constraints || {};
  if (c.durations?.length && params.duration != null && !c.durations.map(Number).includes(Number(params.duration))) {
    throw Object.assign(new Error(`duration must be one of: ${c.durations.join(", ")}`), { status: 400 });
  }
  if (c.aspectRatios?.length && params.aspectRatio && !c.aspectRatios.includes(params.aspectRatio)) {
    throw Object.assign(new Error(`aspectRatio must be one of: ${c.aspectRatios.join(", ")}`), { status: 400 });
  }
  const legacyAgnesImage4K =
    model.providerId === "agnes" &&
    body.capability.startsWith("image.") &&
    String(params.resolution || params.quality || "").toUpperCase() === "4K";
  if (c.resolutions?.length && params.resolution && !c.resolutions.includes(params.resolution) && !legacyAgnesImage4K) {
    throw Object.assign(new Error(`resolution must be one of: ${c.resolutions.join(", ")}`), { status: 400 });
  }
  if (body.capability.startsWith("image.")) {
    const variants = Math.round(Number(params.variants || 1) || 1);
    if (variants < 1 || variants > 4) throw Object.assign(new Error("variants must be between 1 and 4"), { status: 400 });
  }
  const counts = { image: 0, video: 0, audio: 0 };
  let first = 0;
  let last = 0;
  for (const ref of references) {
    const asset = getAsset(ref.assetId);
    if (!asset || asset.projectId !== body.projectId) {
      throw Object.assign(new Error(`invalid reference: ${ref.assetId}`), { status: 400 });
    }
    counts[asset.kind] = (counts[asset.kind] || 0) + 1;
    if (ref.role === "first-frame") first++;
    if (ref.role === "last-frame") last++;
    if (["first-frame", "last-frame", "reference-image"].includes(ref.role) && asset.kind !== "image") {
      throw Object.assign(new Error(`${ref.role} requires an image asset`), { status: 400 });
    }
    if (ref.role === "reference-video" && asset.kind !== "video") {
      throw Object.assign(new Error("reference-video requires a video asset"), { status: 400 });
    }
    if (ref.role === "reference-audio" && asset.kind !== "audio") {
      throw Object.assign(new Error("reference-audio requires an audio asset"), { status: 400 });
    }
    if (ref.role === "source-video" && asset.kind !== "video") {
      throw Object.assign(new Error("source-video requires a video asset"), { status: 400 });
    }
    if (!ROLE_SET.has(ref.role)) {
      throw Object.assign(new Error(`unsupported reference role: ${ref.role}`), { status: 400 });
    }
    if (ref.timelineItemId && !ref.timelineRange && Number(ref.sourceOutFrame || 0) <= Number(ref.sourceInFrame || 0)) {
      throw Object.assign(new Error("timeline reference has an empty source range"), { status: 400 });
    }
    if (ref.timelineRange && Number(ref.timelineRange.endFrame) <= Number(ref.timelineRange.startFrame)) {
      throw Object.assign(new Error("timeline reference has an empty source range"), { status: 400 });
    }
  }
  if (body.capability === "image.edit" && !counts.image) {
    throw Object.assign(new Error("image.edit requires an image reference"), { status: 400 });
  }
  if (last && !first) throw Object.assign(new Error("last-frame requires first-frame"), { status: 400 });
  if (body.capability === "video.generate" && references.length) {
    throw Object.assign(new Error("text-to-video does not accept media references"), { status: 400 });
  }
  if (body.capability === "video.image_to_video" && first !== 1) {
    throw Object.assign(new Error("image-to-video requires exactly one first-frame image"), { status: 400 });
  }
  if (body.capability === "video.first_last_frame" && (first !== 1 || last !== 1)) {
    throw Object.assign(new Error("first/last-frame generation requires exactly one first-frame and one last-frame"), {
      status: 400,
    });
  }
  if (body.capability === "video.reference" && !(counts.image || counts.video || counts.audio)) {
    throw Object.assign(new Error("reference generation requires at least one reference asset"), { status: 400 });
  }
  if (c.maxImageRefs != null && counts.image > c.maxImageRefs) {
    throw Object.assign(new Error(`too many image references; maximum is ${c.maxImageRefs}`), { status: 400 });
  }
  if (c.maxVideoRefs != null && counts.video > c.maxVideoRefs) {
    throw Object.assign(new Error(`too many video references; maximum is ${c.maxVideoRefs}`), { status: 400 });
  }
  if (c.maxAudioRefs != null && counts.audio > c.maxAudioRefs) {
    throw Object.assign(new Error(`too many audio references; maximum is ${c.maxAudioRefs}`), { status: 400 });
  }
}
