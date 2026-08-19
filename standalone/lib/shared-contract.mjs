/**
 * Zero-dependency mirror of packages/shared generation/provider contracts.
 * Keep arrays and field names in lockstep with:
 *   packages/shared/src/capabilities.ts
 *   packages/shared/src/generation.ts
 *   packages/shared/src/assets.ts
 *   packages/shared/src/provider.ts
 */

export const CAPABILITIES = [
  "text.generate",
  "image.generate",
  "image.edit",
  "image.reference",
  "video.generate",
  "video.image_to_video",
  "video.first_last_frame",
  "video.reference",
  "video.extend",
  "video.edit",
  "audio.tts",
  "audio.music",
  "audio.sfx",
  "audio.transcribe",
];

export const GENERATION_STATUSES = ["queued", "processing", "succeeded", "failed", "canceled"];

export const GENERATION_REFERENCE_ROLES = [
  "first-frame",
  "last-frame",
  "reference-image",
  "reference-video",
  "reference-audio",
  "source-video",
];

export const PROVIDER_JOB_STATES = GENERATION_STATUSES;
