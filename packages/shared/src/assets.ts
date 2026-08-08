export type AssetKind = "image" | "video" | "audio" | "document";

export interface AssetRecord {
  id: string;
  projectId: string;
  kind: AssetKind;
  storageKey: string;
  publicUrl: string;
  mime?: string | null;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export type GenerationReferenceRole =
  | "first-frame"
  | "last-frame"
  | "reference-image"
  | "reference-video"
  | "reference-audio"
  | "source-video";

export interface GenerationReference {
  role: GenerationReferenceRole;
  assetId: string;
  timelineItemId?: string;
  sourceInFrame?: number;
  sourceOutFrame?: number;
}
