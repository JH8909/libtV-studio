import { z } from "zod";
import { CAPABILITIES } from "./capabilities";

export const GENERATION_STATUSES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const GenerationReferenceSchema = z.object({
  role: z.enum([
    "first-frame",
    "last-frame",
    "reference-image",
    "reference-video",
    "reference-audio",
    "source-video",
  ]),
  assetId: z.string().min(1),
  timelineItemId: z.string().optional(),
  sourceInFrame: z.number().int().nonnegative().optional(),
  sourceOutFrame: z.number().int().positive().optional(),
});

export const GenerationRequestSchema = z.object({
  projectId: z.string().min(1),
  requestId: z.string().min(1).max(200).optional(),
  capability: z.enum(CAPABILITIES),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  prompt: z.string().optional(),
  references: z.array(GenerationReferenceSchema).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
