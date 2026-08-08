import type { AssetKind, GenerationReference } from "./assets";
import type { Capability } from "./capabilities";
import type { GenerationRequest } from "./generation";

export interface ProviderModelConstraints {
  durations?: number[];
  aspectRatios?: string[];
  resolutions?: string[];
  maxImageRefs?: number;
  maxVideoRefs?: number;
  maxAudioRefs?: number;
  supportsFirstLastFrame?: boolean;
  supportsSourceVideo?: boolean;
}

export interface ProviderModel {
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: Capability[];
  constraints?: ProviderModelConstraints;
  defaults?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface ProviderGenerationReference extends GenerationReference {
  kind: AssetKind;
  url: string;
  storageKey: string;
  mime?: string | null;
}

export type ProviderGenerationRequest = Omit<GenerationRequest, "references"> & {
  references: ProviderGenerationReference[];
};

export type ProviderJobState =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type ProviderOutputSource =
  | { type: "url"; url: string; headers?: Record<string, string> }
  | { type: "file"; path: string }
  | { type: "bytes"; dataBase64: string };

export interface ProviderOutput {
  kind: AssetKind;
  source: ProviderOutputSource;
  mime?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderTaskResult {
  taskId: string;
  status: ProviderJobState;
  progress?: number;
  outputs?: ProviderOutput[];
  error?: string;
  raw?: unknown;
}

export interface ProviderValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export interface MediaProvider {
  readonly providerId: string;
  models(): ProviderModel[];
  validate(request: GenerationRequest): ProviderValidationIssue[];
  submit(request: ProviderGenerationRequest): Promise<ProviderTaskResult>;
  query(taskId: string): Promise<ProviderTaskResult>;
  cancel?(taskId: string): Promise<void>;
}
