import type { ApiAsset, Capability, GenerationReference, GenerationStatus } from "@libtv/shared";
import type { Node } from "@xyflow/react";

export type StudioNodeKind = "prompt" | "generation" | "asset";

export interface StudioNodeData extends Record<string, unknown> {
  kind: StudioNodeKind;
  title?: string;
  prompt?: string;
  capability?: Capability;
  providerId?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  jobId?: string;
  status?: GenerationStatus | "idle";
  progress?: number;
  error?: string;
  outputs?: ApiAsset[];
  explicitReferences?: GenerationReference[];
  asset?: ApiAsset;
}

export type StudioNode = Node<StudioNodeData>;
