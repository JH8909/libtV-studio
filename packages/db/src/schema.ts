import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps(),
});

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  nodes: jsonb("nodes").$type<unknown[]>().default([]).notNull(),
  edges: jsonb("edges").$type<unknown[]>().default([]).notNull(),
  ...timestamps(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  publicUrl: text("public_url").notNull(),
  mime: text("mime"),
  filename: text("filename"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps(),
});

export const generationJobs = pgTable("generation_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  capability: text("capability").notNull(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id").notNull(),
  status: text("status").default("queued").notNull(),
  progress: integer("progress").default(0).notNull(),
  request: jsonb("request").$type<Record<string, unknown>>().notNull(),
  providerTaskId: text("provider_task_id"),
  error: text("error"),
  ...timestamps(),
});

export const generationOutputs = pgTable("generation_outputs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => generationJobs.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const timelines = pgTable("timelines", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fps: integer("fps").default(30).notNull(),
  width: integer("width").default(1920).notNull(),
  height: integer("height").default(1080).notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps(),
});

export const timelineItems = pgTable("timeline_items", {
  id: text("id").primaryKey(),
  timelineId: text("timeline_id").notNull().references(() => timelines.id, { onDelete: "cascade" }),
  sourceAssetId: text("source_asset_id").references(() => assets.id, { onDelete: "set null" }),
  trackId: text("track_id").notNull(),
  kind: text("kind").notNull(),
  startFrame: integer("start_frame").notNull(),
  durationInFrames: integer("duration_in_frames").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps(),
});
