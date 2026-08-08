import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { desc, eq } from "drizzle-orm";
import { assets, db, generationJobs, generationOutputs, projects, timelines, workflows } from "@libtv/db";
import { createGenerationQueue, getProviderRegistry } from "@libtv/media-gateway";
import { GenerationRequestSchema } from "@libtv/shared";
import { z, ZodError } from "zod";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const registry = getProviderRegistry();
const queue = createGenerationQueue();

const WorkflowBody = z.object({ version: z.number().int().positive().default(1), nodes: z.array(z.unknown()).default([]), edges: z.array(z.unknown()).default([]) });
const TimelineBody = z.object({ fps: z.number().int().positive().default(30), width: z.number().int().positive().default(1920), height: z.number().int().positive().default(1080), items: z.array(z.unknown()).default([]) });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: "invalid_request", issues: error.issues });
  const typed = error as Error & { code?: string; issues?: unknown };
  if (typed.code === "provider_validation") return reply.code(400).send({ error: typed.code, issues: typed.issues });
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error", message: typed.message });
});

app.get("/health", async () => ({ ok: true }));
app.get("/models", async () => ({ models: registry.listModels() }));

app.post("/projects", async (request, reply) => {
  const body = z.object({ name: z.string().min(1).default("Untitled") }).parse(request.body ?? {});
  const projectId = randomUUID();
  const now = new Date();
  const project = { id: projectId, name: body.name, settings: {}, createdAt: now, updatedAt: now };
  await db.transaction(async (tx) => {
    await tx.insert(projects).values(project);
    await tx.insert(workflows).values({ id: randomUUID(), projectId, version: 1, nodes: [], edges: [], createdAt: now, updatedAt: now });
    await tx.insert(timelines).values({ id: randomUUID(), projectId, fps: 30, width: 1920, height: 1080, data: { items: [] }, createdAt: now, updatedAt: now });
  });
  return reply.code(201).send(project);
});

app.get("/projects/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) return reply.code(404).send({ error: "project_not_found" });
  return project;
});

app.get("/projects/:id/workflow", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const [workflow] = await db.select().from(workflows).where(eq(workflows.projectId, id)).orderBy(desc(workflows.updatedAt)).limit(1);
  if (!workflow) return reply.code(404).send({ error: "workflow_not_found" });
  return workflow;
});

app.put("/projects/:id/workflow", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = WorkflowBody.parse(request.body ?? {});
  const [existing] = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.projectId, id)).orderBy(desc(workflows.updatedAt)).limit(1);
  if (!existing) {
    const workflow = { id: randomUUID(), projectId: id, ...body, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(workflows).values(workflow);
    return reply.code(201).send(workflow);
  }
  await db.update(workflows).set({ ...body, updatedAt: new Date() }).where(eq(workflows.id, existing.id));
  return { id: existing.id, projectId: id, ...body };
});

app.get("/projects/:id/assets", async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  return { assets: await db.select().from(assets).where(eq(assets.projectId, id)).orderBy(desc(assets.createdAt)) };
});

app.get("/projects/:id/timeline", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const [timeline] = await db.select().from(timelines).where(eq(timelines.projectId, id)).orderBy(desc(timelines.updatedAt)).limit(1);
  if (!timeline) return reply.code(404).send({ error: "timeline_not_found" });
  return { ...timeline, items: Array.isArray((timeline.data as { items?: unknown[] }).items) ? (timeline.data as { items: unknown[] }).items : [] };
});

app.put("/projects/:id/timeline", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const body = TimelineBody.parse(request.body ?? {});
  const [existing] = await db.select({ id: timelines.id }).from(timelines).where(eq(timelines.projectId, id)).orderBy(desc(timelines.updatedAt)).limit(1);
  const data = { items: body.items };
  if (!existing) {
    const timeline = { id: randomUUID(), projectId: id, fps: body.fps, width: body.width, height: body.height, data, createdAt: new Date(), updatedAt: new Date() };
    await db.insert(timelines).values(timeline);
    return reply.code(201).send({ ...timeline, items: body.items });
  }
  await db.update(timelines).set({ fps: body.fps, width: body.width, height: body.height, data, updatedAt: new Date() }).where(eq(timelines.id, existing.id));
  return { id: existing.id, projectId: id, ...body };
});

app.get("/projects/:id/generations", async (request) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  return { generations: await db.select().from(generationJobs).where(eq(generationJobs.projectId, id)).orderBy(desc(generationJobs.createdAt)).limit(50) };
});

app.post("/generations", async (request, reply) => {
  const parsed = GenerationRequestSchema.parse(request.body);
  registry.resolve(parsed);
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, parsed.projectId)).limit(1);
  if (!project) return reply.code(404).send({ error: "project_not_found" });
  const id = randomUUID();
  const now = new Date();
  await db.insert(generationJobs).values({ id, projectId: parsed.projectId, capability: parsed.capability, providerId: parsed.providerId, modelId: parsed.modelId, status: "queued", progress: 0, request: parsed as Record<string, unknown>, createdAt: now, updatedAt: now });
  await queue.add("run", { generationJobId: id }, { jobId: id, removeOnComplete: 100, removeOnFail: 100 });
  return reply.code(202).send({ id, status: "queued", progress: 0 });
});

async function generationView(id: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  if (!job) return undefined;
  const outputs = await db.select({ id: assets.id, projectId: assets.projectId, kind: assets.kind, publicUrl: assets.publicUrl, mime: assets.mime, filename: assets.filename, width: assets.width, height: assets.height, durationMs: assets.durationMs, metadata: assets.metadata }).from(generationOutputs).innerJoin(assets, eq(generationOutputs.assetId, assets.id)).where(eq(generationOutputs.jobId, id));
  return { ...job, outputs };
}

app.get("/generations/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const view = await generationView(id);
  if (!view) return reply.code(404).send({ error: "generation_not_found" });
  return view;
});

app.get("/generations/:id/events", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  if (!(await generationView(id))) return reply.code(404).send({ error: "generation_not_found" });
  reply.hijack();
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  let closed = false;
  request.raw.on("close", () => { closed = true; });
  while (!closed) {
    const view = await generationView(id);
    if (!view) break;
    reply.raw.write(`event: generation\ndata: ${JSON.stringify(view)}\n\n`);
    if (["succeeded", "failed", "canceled"].includes(view.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  reply.raw.end();
});

app.post("/generations/:id/cancel", async (request, reply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  if (!job) return reply.code(404).send({ error: "generation_not_found" });
  if (["succeeded", "failed", "canceled"].includes(job.status)) return { id, status: job.status };
  const provider = registry.get(job.providerId);
  if (job.providerTaskId && provider.cancel) await provider.cancel(job.providerTaskId);
  await db.update(generationJobs).set({ status: "canceled", updatedAt: new Date() }).where(eq(generationJobs.id, id));
  return { id, status: "canceled" };
});

const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
