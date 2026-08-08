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
] as const;

export type Capability = (typeof CAPABILITIES)[number];
