import type { ApiAsset, Capability, GenerationReference, GenerationStatus } from "@libtv/shared";
import type { Node } from "@xyflow/react";

export type StudioNodeKind = "prompt" | "generation" | "asset";

export interface StudioNodeData extends Record<string, unknown> {
  kind: StudioNodeKind;
  title?: string;
  prompt?: string;
  capability?: Capability;
  forcedCapability?: Capability;
  providerId?: string;
  modelId?: string;
  modelKey?: string;
  params?: Record<string, unknown>;
  jobId?: string;
  status?: GenerationStatus | "idle";
  progress?: number;
  error?: string;
  outputs?: ApiAsset[];
  outputAssetIds?: string[];
  explicitReferences?: GenerationReference[];
  asset?: ApiAsset;
  assetId?: string;
}

export type StudioNode = Node<StudioNodeData>;
