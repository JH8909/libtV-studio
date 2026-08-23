import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { promises as fsp } from "node:fs";
import { ingestProviderOutput } from "../lib/ingest.mjs";
import { abortError, sleep } from "./http.mjs";

/**
 * Resolve GenerationRequest references into ProviderGenerationRequest shape
 * (packages/shared ProviderGenerationReference).
 */
export async function resolveProviderRequest(request, { getAsset, media, providerId }) {
  const references = [];
  for (const ref of request.references || []) {
    const asset = getAsset(ref.assetId);
    if (!asset || asset.projectId !== request.projectId) {
      throw new Error(`reference asset not found in project: ${ref.assetId}`);
    }
    if (!["image", "video", "audio", "document"].includes(asset.kind)) {
      throw new Error(`unsupported asset kind: ${asset.kind}`);
    }
    let url = asset.publicUrl;
    if (asset.kind === "image" && (providerId === "agnes" || media)) {
      try {
        url = await media.imageReferenceValue(asset.localPath, asset.mime, {
          providerUrl: asset.metadata?.providerUrl,
        });
      } catch {
        url = asset.publicUrl;
      }
    }
    references.push({
      ...ref,
      kind: asset.kind,
      url,
      storageKey: asset.localPath,
      mime: asset.mime,
      metadata: asset.metadata,
    });
  }
  return { ...request, references };
}

/**
 * Execute one generation using MediaProvider submit/query + local ingest.
 * Matches apps/worker flow without BullMQ.
 */
export async function runMediaProviderGeneration({
  job,
  registry,
  getAsset,
  media,
  assetsDir,
  addAsset,
  maxRemoteBytes,
  fetchImpl,
  signal,
  onProgress,
  pollIntervalMs,
  maxPollMs,
}) {
  const { provider } = registry.resolve(job.request);
  const resolved = await resolveProviderRequest(job.request, {
    getAsset,
    media,
    providerId: job.providerId,
  });

  const progress = async (patch) => {
    await onProgress?.(patch);
  };

  let result;
  if (!job.providerTaskId) {
    result = await provider.submit(resolved, { signal, onProgress: progress });
    if (result.taskId) job.providerTaskId = result.taskId;
  } else {
    // Restore poll context after rate-limit requeue without creating a new vendor task.
    if (provider.tasks && !provider.tasks.has(job.providerTaskId)) {
      const kind = job.capability.startsWith("image.") ? "image" : job.capability.startsWith("video.") ? "video" : "text";
      provider.tasks.set(job.providerTaskId, { kind, request: resolved, modelId: job.modelId });
    }
    result = await provider.query(job.providerTaskId, { signal, onProgress: progress, request: resolved });
  }

  const deadline = Date.now() + (maxPollMs || Number(process.env.GENERATION_MAX_POLL_MS || 20 * 60 * 1000));
  const interval = Math.max(20, pollIntervalMs || Number(process.env.GENERATION_POLL_INTERVAL_MS || 2000));

  while (!["succeeded", "failed", "canceled"].includes(result.status)) {
    if (signal?.aborted) throw abortError();
    if (Date.now() >= deadline) throw new Error(`provider polling timeout; last status=${result.status}`);
    if (result.raw?.retryAfterMs) await sleep(Math.max(interval, result.raw.retryAfterMs), signal);
    else await sleep(interval, signal);
    if (job.status === "canceled") throw abortError();
    result = await provider.query(job.providerTaskId, { signal, onProgress: progress, request: resolved });
  }

  if (result.status === "failed") throw new Error(result.error || "provider generation failed");
  if (result.status === "canceled") throw abortError();

  const assets = [];
  for (const output of result.outputs || []) {
    if (output.source.type === "bytes") {
      const filename = `${job.id}-${output.filename || `${randomUUID()}.png`}`;
      const target = join(assetsDir, filename);
      await fsp.writeFile(target, Buffer.from(output.source.dataBase64, "base64"));
      assets.push(
        addAsset({
          projectId: job.projectId,
          kind: output.kind,
          filename,
          mime: output.mime || "image/png",
          localPath: target,
          metadata: { ...(output.metadata || {}), generationId: job.id },
          source: "external",
        }),
      );
      continue;
    }
    if (output.source.type === "file") {
      assets.push(
        addAsset({
          projectId: job.projectId,
          kind: output.kind,
          filename: basename(output.source.path),
          mime: output.mime,
          localPath: output.source.path,
          metadata: { ...(output.metadata || {}), generationId: job.id },
          source: "external",
        }),
      );
      continue;
    }
    const stored = await ingestProviderOutput({
      projectId: job.projectId,
      jobId: job.id,
      output,
      assetsDir,
      maxRemoteBytes,
      fetchImpl,
      signal,
    });
    assets.push(
      addAsset({
        projectId: job.projectId,
        kind: output.kind,
        filename: stored.filename,
        mime: stored.mime,
        localPath: stored.localPath,
        metadata: stored.metadata,
        source: "external",
      }),
    );
  }

  return { assets, outputText: result.outputText ?? null, result };
}
