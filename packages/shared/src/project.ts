import type { AssetKind } from "./assets";
import type { GenerationStatus } from "./generation";

export interface WorkflowSnapshot {
  id?: string;
  version: number;
  nodes: unknown[];
  edges: unknown[];
}

export interface TimelineItemSnapshot {
  id: string;
  sourceAssetId?: string;
  trackId: string;
  kind: "video" | "image" | "audio" | "text";
  startFrame: number;
  durationInFrames: number;
  name: string;
  data?: Record<string, unknown>;
}

export interface TimelineSnapshot {
  id?: string;
  fps: number;
  width: number;
  height: number;
  items: TimelineItemSnapshot[];
}

export interface ApiAsset {
  id: string;
  projectId: string;
  kind: AssetKind;
  publicUrl: string;
  mime?: string | null;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface GenerationView {
  id: string;
  projectId: string;
  capability: string;
  providerId: string;
  modelId: string;
  status: GenerationStatus;
  progress?: number | null;
  providerTaskId?: string | null;
  error?: string | null;
  outputs: ApiAsset[];
}
