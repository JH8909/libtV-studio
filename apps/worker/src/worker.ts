import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { assets, db, generationJobs, generationOutputs } from "@libtv/db";
import { GENERATION_QUEUE, getProviderRegistry, redisConnectionOptions } from "@libtv/media-gateway";
import { GenerationRequestSchema, type GenerationRequest, type ProviderGenerationRequest, type ProviderTaskResult } from "@libtv/shared";
import { ingestProviderOutput } from "@libtv/storage";

const registry = getProviderRegistry();
const pollInterval = Number(process.env.GENERATION_POLL_INTERVAL_MS ?? 1000);
const maxPolls = Number(process.env.GENERATION_MAX_POLLS ?? 120);

async function resolveProviderRequest(request: GenerationRequest): Promise<ProviderGenerationRequest> {
  const ids = [...new Set(request.references.map((reference) => reference.assetId))];
  if (!ids.length) return { ...request, references: [] };
  const rows = await db.select({
    id: assets.id,
    projectId: assets.projectId,
    kind: assets.kind,
    publicUrl: assets.publicUrl,
    storageKey: assets.storageKey,
    mime: assets.mime,
  }).from(assets).where(and(eq(assets.projectId, request.projectId), inArray(assets.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const references = request.references.map((reference) => {
    const asset = byId.get(reference.assetId);
    if (!asset) throw new Error(`reference asset not found in project: ${reference.assetId}`);
    if (!["image", "video", "audio", "document"].includes(asset.kind)) throw new Error(`unsupported asset kind: ${asset.kind}`);
    return { ...reference, kind: asset.kind as "image" | "video" | "audio" | "document", url: asset.publicUrl, storageKey: asset.storageKey, mime: asset.mime };
  });
  return { ...request, references };
}

function numberMeta(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

async function persistResult(jobId: string, projectId: string, result: ProviderTaskResult) {
  for (const output of result.outputs ?? []) {
    const stored = await ingestProviderOutput({ projectId, jobId, output });
    const assetId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        id: assetId,
        projectId,
        kind: output.kind,
        storageKey: stored.storageKey,
        publicUrl: stored.publicUrl,
        mime: stored.mime,
        filename: stored.filename,
        width: numberMeta(output.metadata, "width"),
        height: numberMeta(output.metadata, "height"),
        durationMs: numberMeta(output.metadata, "durationMs"),
        metadata: { ...(output.metadata ?? {}), size: stored.size },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await tx.insert(generationOutputs).values({ id: randomUUID(), jobId, assetId, metadata: output.metadata ?? {} });
    });
  }
}

new Worker(
  GENERATION_QUEUE,
  async (queueJob) => {
    const generationJobId = String(queueJob.data.generationJobId);
    const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, generationJobId)).limit(1);
    if (!job) throw new Error(`generation job not found: ${generationJobId}`);
    if (job.status === "canceled") return;

    const request = GenerationRequestSchema.parse(job.request);
    const { provider } = registry.resolve(request);
    try {
      await db.update(generationJobs).set({ status: "processing", progress: 1, updatedAt: new Date() }).where(eq(generationJobs.id, generationJobId));
      const providerRequest = await resolveProviderRequest(request);
      let result = await provider.submit(providerRequest);
      await db.update(generationJobs).set({ providerTaskId: result.taskId, progress: result.progress ?? 5, updatedAt: new Date() }).where(eq(generationJobs.id, generationJobId));

      for (let attempt = 0; attempt < maxPolls && !["succeeded", "failed", "canceled"].includes(result.status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        const [latest] = await db.select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, generationJobId)).limit(1);
        if (latest?.status === "canceled") {
          if (provider.cancel) await provider.cancel(result.taskId);
          return;
        }
        result = await provider.query(result.taskId);
        await db.update(generationJobs).set({ progress: result.progress ?? Math.min(95, 10 + attempt), updatedAt: new Date() }).where(eq(generationJobs.id, generationJobId));
      }

      if (result.status === "failed") throw new Error(result.error || "provider generation failed");
      if (result.status !== "succeeded") throw new Error(`provider polling timeout; last status=${result.status}`);
      await persistResult(generationJobId, job.projectId, result);
      await db.update(generationJobs).set({ status: "succeeded", progress: 100, error: null, updatedAt: new Date() }).where(eq(generationJobs.id, generationJobId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(generationJobs).set({ status: "failed", error: message, updatedAt: new Date() }).where(eq(generationJobs.id, generationJobId));
      throw error;
    }
  },
  { connection: redisConnectionOptions(), concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY ?? 4) },
).on("failed", (job, error) => console.error("generation worker failed", job?.id, error));

console.log("generation worker started");
