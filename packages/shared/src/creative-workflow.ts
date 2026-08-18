import { z } from "zod";

export const ContinuityEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["character", "location", "prop", "style"]),
  description: z.string().default(""),
  referenceAssetIds: z.array(z.string().min(1)).default([]),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const ShotSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  purpose: z.string().default(""),
  visual: z.string().min(1),
  motion: z.string().default(""),
  dialogue: z.string().default(""),
  durationSec: z.number().finite().positive().default(4),
  shotSize: z.string().default("medium shot"),
  camera: z.string().default("static"),
  characters: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  continuityEntityIds: z.array(z.string()).default([]),
  imagePrompt: z.string().default(""),
  videoPrompt: z.string().default(""),
});

export const SceneSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  purpose: z.string().default(""),
  description: z.string().default(""),
  location: z.string().default(""),
  time: z.string().default(""),
  characters: z.array(z.string()).default([]),
  continuityEntityIds: z.array(z.string()).default([]),
  shots: z.array(ShotSpecSchema).min(1),
});

export const StoryboardSpecSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  logline: z.string().default(""),
  format: z.string().default("短视频"),
  aspectRatio: z.string().default("9:16"),
  entities: z.array(ContinuityEntitySchema).default([]),
  scenes: z.array(SceneSpecSchema).min(1),
});

export type ContinuityEntity = z.infer<typeof ContinuityEntitySchema>;
export type ShotSpec = z.infer<typeof ShotSpecSchema>;
export type SceneSpec = z.infer<typeof SceneSpecSchema>;
export type StoryboardSpec = z.infer<typeof StoryboardSpecSchema>;

export interface CreativeWorkflowContracts {
  schemaVersion: 1;
  storyboard: {
    sourceId: string;
    sceneCount: number;
    shotCount: number;
    totalDurationSec: number;
  };
  continuity: {
    entityCount: number;
    unboundEntityIds: string[];
    conflicts: string[];
  };
  batch: {
    candidateShotIds: string[];
    blockedShotIds: string[];
    duplicateRequestIds: string[];
  };
  review: {
    blockers: number;
    warnings: number;
    findings: string[];
  };
}
