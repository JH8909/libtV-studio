/**
 * Locks packages/shared MediaProvider submit/query + local ingestProviderOutput
 * without booting the full HTTP studio.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { AgnesProvider } from "./providers/agnes.mjs";
import { ApimartProvider } from "./providers/apimart.mjs";
import { createMediaAccess } from "./lib/media.mjs";
import { ingestProviderOutput } from "./lib/ingest.mjs";
import { GENERATION_STATUSES, GENERATION_REFERENCE_ROLES } from "./lib/shared-contract.mjs";

const dir = await mkdtemp(join(tmpdir(), "libtv-mp-contract-"));
const assetsDir = join(dir, "assets");
await writeFile(join(dir, ".keep"), "");
const { mkdirSync } = await import("node:fs");
mkdirSync(assetsDir, { recursive: true });

const fixture = join(assetsDir, "ref.png");
const made = spawnSync("ffmpeg", [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=0x121826:s=64x64",
  "-frames:v",
  "1",
  fixture,
]);
if (made.status !== 0) throw new Error("ffmpeg fixture failed");

const captures = [];
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zb9sAAAAASUVORK5CYII=";
const fake = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  let body = null;
  if (raw.length && String(req.headers["content-type"] || "").includes("application/json")) {
    body = JSON.parse(raw.toString("utf8"));
  }
  captures.push({ method: req.method, url: req.url, body });
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && req.url === "/apimart-chat/chat/completions") {
    return res.end(JSON.stringify({ code: 200, data: { choices: [{ message: { content: "mp-contract text" } }] } }));
  }
  if (req.method === "POST" && req.url === "/apimart/images/generations") {
    return res.end(JSON.stringify({ code: 200, data: [{ status: "submitted", task_id: "mp-image-1" }] }));
  }
  if (req.method === "GET" && req.url?.startsWith("/apimart/tasks/mp-image-1")) {
    return res.end(
      JSON.stringify({
        code: 200,
        data: { status: "completed", result: { images: [`http://127.0.0.1:${fakePort}/out.png`] } },
      }),
    );
  }
  if (req.method === "POST" && req.url === "/agnes/v1/chat/completions") {
    res.setHeader("content-type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`);
    return res.end("data: [DONE]\n\n");
  }
  if (req.method === "POST" && req.url === "/agnes/v1/images/generations") {
    return res.end(JSON.stringify({ data: [{ b64_json: pngBase64 }] }));
  }
  if (req.url === "/out.png") {
    res.setHeader("content-type", "image/png");
    return res.end(Buffer.from(pngBase64, "base64"));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not_found" }));
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
const fakePort = fake.address().port;

const media = createMediaAccess({
  assetsDir,
  hasFfmpeg: true,
  publicBaseUrl: "",
  externalReferenceMode: "data-uri",
});

try {
  assert.deepEqual(GENERATION_STATUSES, ["queued", "processing", "succeeded", "failed", "canceled"]);
  assert.ok(GENERATION_REFERENCE_ROLES.includes("first-frame"));

  const agnes = new AgnesProvider({
    getConfig: () => ({
      apiKey: "k",
      baseUrl: `http://127.0.0.1:${fakePort}/agnes/v1`,
      textModel: "agnes-text",
      imageModel: "agnes-image",
      videoModel: "agnes-video",
    }),
    media,
  });
  assert.equal(agnes.providerId, "agnes");
  assert.ok(typeof agnes.models === "function");
  assert.ok(typeof agnes.validate === "function");
  assert.ok(typeof agnes.submit === "function");
  assert.ok(typeof agnes.query === "function");

  const text = await agnes.submit({
    projectId: "p1",
    capability: "text.generate",
    providerId: "agnes",
    modelId: "agnes-text",
    prompt: "hi",
    params: {},
    references: [],
  });
  assert.equal(text.status, "succeeded");
  assert.equal(text.outputText, "hello");
  assert.ok(text.taskId);
  const textQuery = await agnes.query(text.taskId);
  assert.equal(textQuery.status, "succeeded");

  const image = await agnes.submit({
    projectId: "p1",
    capability: "image.generate",
    providerId: "agnes",
    modelId: "agnes-image",
    prompt: "cat",
    params: { aspectRatio: "1:1" },
    references: [],
  });
  assert.equal(image.status, "succeeded");
  assert.equal(image.outputs?.[0]?.source?.type, "bytes");
  const ingested = await ingestProviderOutput({
    projectId: "p1",
    jobId: "job-1",
    output: image.outputs[0],
    assetsDir,
  });
  assert.ok(ingested.storageKey);
  assert.ok(ingested.publicUrl.startsWith("/media/assets/"));
  assert.equal(ingested.mime, "image/png");
  assert.ok(ingested.size > 0);

  const apimart = new ApimartProvider({
    getConfig: () => ({
      apiKey: "k",
      baseUrl: `http://127.0.0.1:${fakePort}/apimart`,
      chatBaseUrl: `http://127.0.0.1:${fakePort}/apimart-chat`,
      enabledModelIds: null,
      cachedModels: [{ id: "fake-image", type: "image" }, { id: "fake-text", type: "text" }],
    }),
    media,
  });
  assert.equal(apimart.providerId, "apimart");
  const submitted = await apimart.submit({
    projectId: "p1",
    capability: "image.generate",
    providerId: "apimart",
    modelId: "fake-image",
    prompt: "dog",
    params: { aspectRatio: "1:1", resolution: "2K" },
    references: [],
  });
  assert.equal(submitted.status, "processing");
  assert.equal(submitted.taskId, "mp-image-1");
  const polled = await apimart.query("mp-image-1");
  assert.equal(polled.status, "succeeded");
  assert.equal(polled.outputs?.[0]?.source?.type, "url");
  // SSRF guard blocks 127.0.0.1 downloads; ingest contract is covered via ProviderOutput bytes above.
  // Full HTTP studio e2e still exercises remote ingest against fake terminals.
  assert.ok(String(polled.outputs[0].source.url).includes("/out.png"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        mediaProviderShape: true,
        agnesSubmitQuery: true,
        apimartSubmitQuery: true,
        ingestBytes: true,
        apimartQueryUrl: true,
        sharedContractMirror: true,
      },
      null,
      2,
    ),
  );
} finally {
  fake.close();
  await rm(dir, { recursive: true, force: true });
}
