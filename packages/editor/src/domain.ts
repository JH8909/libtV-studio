import type { ApiAsset, TimelineItemSnapshot, TimelineSnapshot } from "@libtv/shared";

export type TrackKind = "video" | "audio";
export const TRACKS = ["V2", "V1", "A1", "A2"] as const;

export function assetDurationInFrames(asset: ApiAsset, fps: number): number {
  if (asset.durationMs && asset.durationMs > 0) return Math.max(1, Math.round(asset.durationMs / 1000 * fps));
  return asset.kind === "image" ? fps * 3 : fps * 5;
}

export function itemFromAsset(asset: ApiAsset, fps: number, trackId?: string, startFrame = 0): TimelineItemSnapshot {
  const audio = asset.kind === "audio";
  return {
    id: `clip-${crypto.randomUUID()}`,
    sourceAssetId: asset.id,
    trackId: trackId ?? (audio ? "A1" : "V1"),
    kind: audio ? "audio" : asset.kind === "image" ? "image" : "video",
    startFrame,
    durationInFrames: assetDurationInFrames(asset, fps),
    name: asset.filename || `${asset.kind}-${asset.id.slice(0, 6)}`,
    data: { src: asset.publicUrl },
  };
}

export function normalizeTimeline(input?: Partial<TimelineSnapshot>): TimelineSnapshot {
  return { fps: input?.fps ?? 30, width: input?.width ?? 1920, height: input?.height ?? 1080, items: input?.items ?? [] };
}
