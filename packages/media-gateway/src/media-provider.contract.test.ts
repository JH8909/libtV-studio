import assert from "node:assert/strict";
import test from "node:test";
import type { MediaProvider, ProviderTaskResult } from "@libtv/shared";
import { CAPABILITIES, GENERATION_STATUSES, GenerationRequestSchema } from "@libtv/shared";
import { KlingProvider } from "./providers/kling";
import { VolcengineProvider } from "./providers/volcengine";
import { ProviderRegistry } from "./registry";
import { validateModelConstraints } from "./model-validation";

function assertMediaProviderShape(provider: MediaProvider) {
  assert.equal(typeof provider.providerId, "string");
  assert.equal(typeof provider.models, "function");
  assert.equal(typeof provider.validate, "function");
  assert.equal(typeof provider.submit, "function");
  assert.equal(typeof provider.query, "function");
}

test("shared capability and status catalogs stay stable for MediaProvider jobs", () => {
  assert.ok(CAPABILITIES.includes("text.generate"));
  assert.ok(CAPABILITIES.includes("video.image_to_video"));
  assert.deepEqual([...GENERATION_STATUSES], ["queued", "processing", "succeeded", "failed", "canceled"]);
});

test("GenerationRequestSchema matches MediaProvider submit input", () => {
  const parsed = GenerationRequestSchema.parse({
    projectId: "p1",
    capability: "image.generate",
    providerId: "volcengine",
    modelId: "seedream",
    prompt: "x",
    references: [{ role: "reference-image", assetId: "a1" }],
    params: { aspectRatio: "1:1" },
  });
  assert.equal(parsed.references[0]?.role, "reference-image");
});

test("registry adapters implement MediaProvider submit/query shape", () => {
  const registry = new ProviderRegistry();
  registry.register(new VolcengineProvider());
  registry.register(new KlingProvider());
  for (const model of registry.listModels()) {
    const provider = registry.get(model.providerId);
    assertMediaProviderShape(provider);
  }
});

test("unwired shells fail inside submit/query only (contract boundary)", async () => {
  const provider = new VolcengineProvider();
  const request = {
    projectId: "p1",
    capability: "image.generate" as const,
    providerId: "volcengine",
    modelId: process.env.VOLCENGINE_IMAGE_MODEL || "seedream-configure-me",
    prompt: "x",
    references: [],
    params: {},
  };
  await assert.rejects(() => provider.submit(request), /not wired yet/);
  await assert.rejects(() => provider.query("task"), /not wired yet/);
});

test("validateModelConstraints returns ProviderValidationIssue objects", () => {
  const model = new KlingProvider().models()[0]!;
  const issues = validateModelConstraints(model, {
    projectId: "p1",
    capability: "video.generate",
    providerId: "kling",
    modelId: model.modelId,
    prompt: "x",
    references: [
      { role: "last-frame", assetId: "a" },
      { role: "reference-image", assetId: "b" },
      { role: "reference-image", assetId: "c" },
      { role: "reference-image", assetId: "d" },
      { role: "reference-image", assetId: "e" },
      { role: "reference-image", assetId: "f" },
      { role: "reference-image", assetId: "g" },
      { role: "reference-image", assetId: "h" },
      { role: "reference-image", assetId: "i" },
    ],
    params: {},
  });
  assert.ok(issues.some((issue) => issue.code === "last_frame_requires_first"));
});

test("ProviderTaskResult terminal statuses match generation statuses", () => {
  const sample: ProviderTaskResult = { taskId: "t1", status: "succeeded", progress: 100, outputs: [] };
  assert.ok(GENERATION_STATUSES.includes(sample.status));
});
