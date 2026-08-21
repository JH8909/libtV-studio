/**
 * Standalone runtime context: persistence, assets, job queue, MediaProvider registry.
 * HTTP routing stays in server.mjs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { imagePresetLibrarySnapshot, normalizeImagePreset } from "./public/image-presets.js";
import { createMediaAccess, execFile, mediaMetadata } from "./lib/media.mjs";
import { normalizeGenerationReference, validateGenerationRequest } from "./domain/generation.mjs";
import { StandaloneProviderRegistry } from "./providers/registry.mjs";
import { runMediaProviderGeneration } from "./providers/run-generation.mjs";
import { abortError, sleep, sanitizeProviderMessage } from "./providers/http.mjs";

export { abortError, sleep, sanitizeProviderMessage, normalizeGenerationReference, validateGenerationRequest, execFile, mediaMetadata };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
export { ROOT };

for (const envFile of [join(ROOT, ".env"), join(dirname(ROOT), ".env")]) {
  try {
    if (existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  } catch (error) {
    console.warn(`Could not load ${envFile}:`, error.message);
  }
}

export const PUBLIC = join(ROOT, "public");
export const TABLER_ICONS = join(dirname(ROOT), "node_modules", "@tabler", "icons", "icons", "outline");
export const DATA = resolve(process.env.DATA_DIR || join(ROOT, "data"));
export const ASSETS_DIR = join(DATA, "assets");
export const EXPORTS_DIR = join(DATA, "exports");
export const DB_FILE = join(DATA, "db.json");
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || "127.0.0.1";
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 512 * 1024 * 1024);
export const MAX_REMOTE_BYTES = Number(process.env.MAX_REMOTE_BYTES || 1024 * 1024 * 1024);
export const MAX_PROVIDER_ATTEMPTS = 3;
export const PROVIDER_RETRY_BASE_MS = Math.max(20, Number(process.env.PROVIDER_RETRY_BASE_MS || 1000));
export const MAX_PROVIDER_BUSY_ATTEMPTS = Math.max(1, Number(process.env.MAX_PROVIDER_BUSY_ATTEMPTS || 5));
export const PROVIDER_BUSY_RETRY_BASE_MS = Math.max(20, Number(process.env.PROVIDER_BUSY_RETRY_BASE_MS || 10_000));
export const MAX_PROVIDER_RETRY_DELAY_MS = 60_000;
export const PROVIDER_SETTINGS_FILE = join(DATA, "provider-settings.json");

export let providerSettings = {};
try {
  if (existsSync(PROVIDER_SETTINGS_FILE)) providerSettings = JSON.parse(readFileSync(PROVIDER_SETTINGS_FILE, "utf8"));
} catch {
  providerSettings = {};
}

const retiredProviderKeys = Object.keys(providerSettings).filter(
  (key) =>
    /^(?:OPENAI|OPENAI_COMPAT|ARK|VOLCENGINE|KLING|GEMINI|VEO|FAL)_/.test(key) ||
    /^APIMART_(?:TEXT|AGENT|IMAGE|VIDEO)_MODEL$/.test(key) ||
    /^APIMART_(?:BASE|CHAT_BASE)_URL$/.test(key),
);
if (retiredProviderKeys.length) {
  for (const key of retiredProviderKeys) delete providerSettings[key];
  writeFileSync(PROVIDER_SETTINGS_FILE, JSON.stringify(providerSettings, null, 2));
}

const cfg = (key, fallback = "") => String(providerSettings[key] || process.env[key] || fallback);

export const runtimeConfig = {
  AGNES_API_KEY: "",
  AGNES_BASE_URL: "",
  AGNES_TEXT_MODEL: "",
  AGNES_IMAGE_MODEL: "",
  AGNES_VIDEO_MODEL: "",
  APIMART_API_KEY: "",
  APIMART_BASE_URL: "",
  APIMART_CHAT_BASE_URL: "",
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_BASE_URL: "",
  DEEPSEEK_TEXT_MODEL: "",
  BAILIAN_API_KEY: "",
  BAILIAN_BASE_URL: "",
  BAILIAN_MEDIA_BASE_URL: "",
  BAILIAN_TEXT_MODEL: "",
  BAILIAN_IMAGE_MODEL: "",
  BAILIAN_VIDEO_MODEL: "",
  PUBLIC_BASE_URL: "",
};

export function refreshProviderRuntime() {
  runtimeConfig.AGNES_API_KEY = cfg("AGNES_API_KEY");
  runtimeConfig.AGNES_BASE_URL = cfg("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
  runtimeConfig.AGNES_TEXT_MODEL = cfg("AGNES_TEXT_MODEL", "agnes-2.5-flash");
  runtimeConfig.AGNES_IMAGE_MODEL = cfg("AGNES_IMAGE_MODEL", "agnes-image-2.1-flash");
  runtimeConfig.AGNES_VIDEO_MODEL = cfg("AGNES_VIDEO_MODEL", "agnes-video-v2.0");
  runtimeConfig.APIMART_API_KEY = cfg("APIMART_API_KEY");
  runtimeConfig.APIMART_BASE_URL = cfg("APIMART_BASE_URL", "https://api.apimart.ai/v1").replace(/\/$/, "");
  runtimeConfig.APIMART_CHAT_BASE_URL = cfg("APIMART_CHAT_BASE_URL", "https://api.apimart.ai/api/v1").replace(/\/$/, "");
  runtimeConfig.DEEPSEEK_API_KEY = cfg("DEEPSEEK_API_KEY");
  runtimeConfig.DEEPSEEK_BASE_URL = cfg("DEEPSEEK_BASE_URL", "https://api.deepseek.com").replace(/\/$/, "");
  runtimeConfig.DEEPSEEK_TEXT_MODEL = cfg("DEEPSEEK_TEXT_MODEL", "deepseek-v4-pro");
  runtimeConfig.BAILIAN_API_KEY = cfg("BAILIAN_API_KEY");
  runtimeConfig.BAILIAN_BASE_URL = cfg("BAILIAN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  runtimeConfig.BAILIAN_MEDIA_BASE_URL = cfg("BAILIAN_MEDIA_BASE_URL", "https://dashscope.aliyuncs.com/api/v1").replace(/\/$/, "");
  runtimeConfig.BAILIAN_TEXT_MODEL = cfg("BAILIAN_TEXT_MODEL", "qwen-plus");
  runtimeConfig.BAILIAN_IMAGE_MODEL = cfg("BAILIAN_IMAGE_MODEL", "qwen-image-2.0");
  runtimeConfig.BAILIAN_VIDEO_MODEL = cfg("BAILIAN_VIDEO_MODEL", "wan2.7-t2v-2026-06-12");
  runtimeConfig.PUBLIC_BASE_URL = cfg("PUBLIC_BASE_URL").replace(/\/$/, "");
}
refreshProviderRuntime();

export const EXTERNAL_REFERENCE_MODE = process.env.EXTERNAL_REFERENCE_MODE || "data-uri";
export const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
export const FFMPEG_FONT_FILE = (() => {
  if (process.env.FFMPEG_FONT_FILE && existsSync(process.env.FFMPEG_FONT_FILE)) return process.env.FFMPEG_FONT_FILE;
  const r = spawnSync("fc-match", ["-f", "%{file}", "Noto Sans CJK SC"], { encoding: "utf8" });
  const f = String(r.stdout || "").trim();
  if (f && existsSync(f)) return f;
  const win = process.env.WINDIR || process.env.SystemRoot;
  for (const name of ["msyh.ttc", "simhei.ttf", "arial.ttf"]) {
    const candidate = win && join(win, "Fonts", name);
    if (candidate && existsSync(candidate)) return candidate;
  }
  return "";
})();

for (const dir of [DATA, ASSETS_DIR, EXPORTS_DIR]) mkdirSync(dir, { recursive: true });

function emptyDb() {
  return {
    version: 4,
    projects: {},
    jobs: {},
    assets: {},
    creativeAgent: { conversations: {} },
    skillRuns: {},
    promptLibrary: imagePresetLibrarySnapshot(),
  };
}

export const ASSET_CATEGORY_OPTIONS = Object.freeze([
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
  { id: "style", label: "风格" },
  { id: "sound", label: "音效" },
]);
const ASSET_CATEGORY_IDS = new Set(ASSET_CATEGORY_OPTIONS.map((item) => item.id));

export function normalizeAssetCategory(value, { kind = "", tags = [], metadata = {} } = {}) {
  const explicit = String(value || metadata?.category || "").trim().toLowerCase();
  if (ASSET_CATEGORY_IDS.has(explicit)) return explicit;
  const hints = [explicit, ...(Array.isArray(tags) ? tags : []), metadata?.role, metadata?.assetType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/character|role|person|人物|角色/.test(hints)) return "character";
  if (/scene|environment|location|场景|环境|地点/.test(hints)) return "scene";
  if (/prop|object|product|道具|物品|产品/.test(hints)) return "prop";
  if (/style|mood|visual|风格|视觉|色彩/.test(hints)) return "style";
  if (kind === "audio" || /sound|sfx|audio|音效|声音/.test(hints)) return "sound";
  return "";
}

export let state = emptyDb();
if (existsSync(DB_FILE)) {
  try {
    state = JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch {
    state = emptyDb();
  }
}
state.version = 5;
state.projects ||= {};
state.jobs ||= {};
state.assets ||= {};
state.creativeAgent ||= { conversations: {} };
state.creativeAgent.conversations ||= {};
state.skillRuns ||= {};
for (const asset of Object.values(state.assets)) {
  asset.metadata ||= {};
  asset.tags ||= computeInitialTags({ kind: asset.kind, metadata: asset.metadata, source: asset.metadata.source || "upload" });
  asset.category = normalizeAssetCategory(asset.category, asset);
  if (asset.library === undefined) asset.library = asset.metadata.source === "upload" || asset.tags.includes("uploaded");
  if (asset.material === undefined) asset.material = true;
}
if (!Array.isArray(state.promptLibrary?.presets) || !state.promptLibrary.presets.length) {
  state.promptLibrary = imagePresetLibrarySnapshot();
}
state.promptLibrary.categories ||= imagePresetLibrarySnapshot().categories;
state.promptLibrary.presets = state.promptLibrary.presets.map(normalizeImagePreset);

export function now() {
  return new Date().toISOString();
}

function syncGenerationJobToCanvas(job) {
  const sourceNodeId = String(job?.sourceNodeId || "");
  if (!sourceNodeId) return false;
  const project = state.projects[job.projectId];
  const node = project?.workflow?.nodes?.find((candidate) => candidate?.id === sourceNodeId);
  if (!node || !["imageGen", "videoGen", "textGen"].includes(node.type)) return false;
  const data = node.data || (node.data = {});
  const next = {
    jobId: ["succeeded", "failed", "canceled"].includes(job.status) ? "" : job.id,
    generationId: job.id,
    status: job.status || "queued",
    phase: job.phase || job.status || "queued",
    progressMode: job.progressMode || "phase",
    progress: Number(job.progress || 0),
    error: job.error || "",
    nextAttemptAt: job.nextAttemptAt || null,
    providerAttempt: Number(job.providerAttempt || 0),
    providerMaxAttempts: Number(job.providerMaxAttempts || 0),
  };
  let changed = false;
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(data[key]) !== JSON.stringify(value)) {
      data[key] = value;
      changed = true;
    }
  }
  if (job.status === "succeeded") {
    const outputAssetIds = Array.isArray(job.outputAssetIds) ? job.outputAssetIds.map(String).filter(Boolean) : [];
    const variantAssetIds = outputAssetIds.length > 1 ? outputAssetIds : [];
    for (const [key, value] of [
      ["outputAssetIds", outputAssetIds],
      ["variantAssetIds", variantAssetIds],
      ["selectedVariantIndex", 0],
    ]) {
      if (JSON.stringify(data[key]) !== JSON.stringify(value)) {
        data[key] = value;
        changed = true;
      }
    }
  }
  if (changed) {
    project.workflowRevision = Number(project.workflowRevision || 1) + 1;
    project.updatedAt = now();
  }
  return changed;
}

let saveChain = Promise.resolve();
export function saveDb() {
  saveChain = saveChain.then(async () => {
    for (const job of Object.values(state.jobs)) syncGenerationJobToCanvas(job);
    const tmp = `${DB_FILE}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
    await fsp.rename(tmp, DB_FILE);
  });
  return saveChain;
}

export async function persistProviderSettings() {
  await fsp.writeFile(PROVIDER_SETTINGS_FILE, JSON.stringify(providerSettings, null, 2));
  try {
    await fsp.chmod(PROVIDER_SETTINGS_FILE, 0o600);
  } catch {
    /* ignore */
  }
}

export function computeInitialTags({ kind, metadata, source }) {
  const tags = [kind];
  if (source === "upload") tags.push("uploaded");
  else tags.push("generated");
  if (metadata?.provider) tags.push(String(metadata.provider).toLowerCase());
  return [...new Set(tags)];
}

export function addAsset({ projectId, kind, filename, mime, localPath, metadata = {}, source = "upload", category = "", library = source === "upload" }) {
  const id = randomUUID();
  const rel = basename(localPath);
  const tags = computeInitialTags({ kind, metadata, source });
  const asset = {
    id,
    projectId,
    kind,
    library: Boolean(library),
    material: true,
    category: normalizeAssetCategory(category, { kind, tags, metadata }),
    filename,
    mime,
    localPath: rel,
    publicUrl: `/media/assets/${encodeURIComponent(rel)}`,
    width: metadata.width,
    height: metadata.height,
    durationMs: metadata.durationMs,
    metadata: { ...metadata, source },
    tags,
    createdAt: now(),
    updatedAt: now(),
  };
  state.assets[id] = asset;
  return asset;
}

export function projectOr404(id) {
  return state.projects[id];
}

export function projectAssets(projectId, { tag, kind, category, q } = {}) {
  const all = Object.values(state.assets)
    .filter((a) => a.projectId === projectId)
    .map((a) => ({
      ...a,
      library: Boolean(a.library),
      material: a.material !== false,
      tags: a.tags || computeInitialTags({ kind: a.kind, metadata: a.metadata, source: a.metadata?.source || "upload" }),
      category: normalizeAssetCategory(a.category, a),
    }));
  let filtered = all;
  if (tag) filtered = filtered.filter((a) => a.tags.includes(tag));
  if (kind) filtered = filtered.filter((a) => a.kind === kind);
  if (category) filtered = filtered.filter((a) => a.category === category);
  if (q) {
    const query = String(q).trim().toLowerCase();
    if (query) filtered = filtered.filter((a) => [a.filename, a.category, a.metadata?.prompt, ...(a.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(query));
  }
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function projectJobs(projectId) {
  return Object.values(state.jobs)
    .filter((j) => j.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

let mediaAccess = createMediaAccess({
  assetsDir: ASSETS_DIR,
  hasFfmpeg: HAS_FFMPEG,
  publicBaseUrl: runtimeConfig.PUBLIC_BASE_URL,
  externalReferenceMode: EXTERNAL_REFERENCE_MODE,
});

export function getMediaAccess() {
  return mediaAccess;
}

export const registry = new StandaloneProviderRegistry({
  getRuntimeConfig: () => runtimeConfig,
  media: {
    get normalizeImage() {
      return mediaAccess.normalizeImage.bind(mediaAccess);
    },
    get readBytes() {
      return mediaAccess.readBytes.bind(mediaAccess);
    },
    get publicUrlFor() {
      return mediaAccess.publicUrlFor.bind(mediaAccess);
    },
    get imageReferenceValue() {
      return mediaAccess.imageReferenceValue.bind(mediaAccess);
    },
  },
  getProviderSettings: () => providerSettings,
  persistProviderSettings,
});

export function refreshMediaAndRegistry() {
  refreshProviderRuntime();
  mediaAccess = createMediaAccess({
    assetsDir: ASSETS_DIR,
    hasFfmpeg: HAS_FFMPEG,
    publicBaseUrl: runtimeConfig.PUBLIC_BASE_URL,
    externalReferenceMode: EXTERNAL_REFERENCE_MODE,
  });
  registry.refresh();
}

export async function listModels() {
  const models = [];
  if (runtimeConfig.AGNES_API_KEY) models.push(...registry.get("agnes").models());
  if (runtimeConfig.APIMART_API_KEY) {
    models.push(...registry.enabledApimartModels(await registry.availableApimartModels()));
  }
  if (runtimeConfig.DEEPSEEK_API_KEY) models.push(...registry.get("deepseek").models());
  if (runtimeConfig.BAILIAN_API_KEY) models.push(...registry.get("bailian").models());
  return models;
}

export async function availableAgnesModels() {
  const fallback = registry.get("agnes").models();
  if (!runtimeConfig.AGNES_API_KEY) return fallback;
  try {
    const response = await fetch(`${runtimeConfig.AGNES_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${runtimeConfig.AGNES_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Agnes models failed ${response.status}`);
    const body = await response.json();
    const items = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : Array.isArray(body) ? body : [];
    const merged = new Map(fallback.map((model) => [model.modelId, model]));
    for (const item of items) {
      const modelId = String(typeof item === "string" ? item : item?.id || item?.name || "").trim();
      if (!modelId) continue;
      const image = /image|img|seedream|flux|qwen-image|gpt-image|nano-banana/i.test(modelId);
      const video = /video|seedance|veo|kling|sora|wan|hailuo/i.test(modelId);
      const unsupported = /embedding|moderation|rerank|speech|audio|tts|asr/i.test(modelId);
      const capabilities = video
        ? ["video.generate", "video.image_to_video", "video.first_last_frame"]
        : image
          ? ["image.generate", "image.edit"]
          : unsupported
            ? []
            : ["text.generate"];
      if (!capabilities.length) continue;
      const constraints = capabilities.includes("image.generate")
        ? { aspectRatios: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"], resolutions: ["1K", "2K"] }
        : capabilities.includes("video.generate")
          ? {
              durations: [3, 5, 10, 18],
              aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
              resolutions: ["480p", "720p", "1080p"],
              maxImageRefs: 2,
            }
          : {};
      merged.set(modelId, {
        providerId: "agnes",
        modelId,
        displayName: `Agnes · ${modelId}`,
        capabilities,
        constraints,
        configured: true,
      });
    }
    return [...merged.values()];
  } catch {
    return fallback;
  }
}

export async function prepareStandaloneGeneration(body) {
  const project = projectOr404(body.projectId);
  if (!project) throw Object.assign(new Error("project_not_found"), { status: 404 });
  const model = (await listModels()).find(
    (item) => item.providerId === body.providerId && item.modelId === body.modelId && item.capabilities.includes(body.capability),
  );
  if (!model) throw Object.assign(new Error("model_not_available"), { status: 400 });
  const references = Array.isArray(body.references) ? body.references.map(normalizeGenerationReference) : [];
  const jobRequest = {
    projectId: project.id,
    capability: String(body.capability),
    providerId: String(body.providerId),
    modelId: String(body.modelId),
    prompt: String(body.prompt || ""),
    params: body.params || {},
    references,
  };
  validateGenerationRequest(model, jobRequest, references, (id) => state.assets[id]);
  return { project, model, jobRequest };
}

export const providerRunning = new Set();
export const jobControllers = new Map();
export const canvasSelections = new Map();
let schedulerTimer = null;

function serializedMediaLane(job) {
  const kind = String(job.capability || "").match(/^(image|video|audio)\./)?.[1];
  return kind ? `${job.providerId}:${kind}` : "";
}

export function retryDelay(error, attempt, baseMs = PROVIDER_RETRY_BASE_MS) {
  const hinted = Number(error?.retryAfterMs);
  const message = String(error?.message || "");
  const windowMatch = message.match(/allows\s+\d+\s+requests?\s+per\s+(\d+)\s+minute/i);
  const providerWindow = windowMatch ? Math.max(1, Number(windowMatch[1])) * 60_000 : 0;
  return Math.min(
    MAX_PROVIDER_RETRY_DELAY_MS,
    hinted > 0 ? hinted : providerWindow || baseMs * 2 ** Math.max(0, attempt - 1),
  );
}

export function providerRetryPhase(error) {
  if (error?.status === 429) return "rate_limited";
  if (
    error?.status === 503 &&
    /queue\s+(?:is\s+)?full|capacity|overloaded|server\s+busy|temporar(?:ily)?\s+unavailable|队列.*满|服务.*繁忙|稍后重试/i.test(
      String(error?.message || ""),
    )
  ) {
    return "provider_busy";
  }
  return "";
}

export function findExistingJob(projectId, requestId, sourceKey) {
  const jobs = Object.values(state.jobs).filter((job) => job.projectId === projectId);
  if (requestId) {
    const exact = jobs.find((job) => job.requestId === requestId);
    if (exact) return exact;
  }
  return sourceKey ? jobs.find((job) => job.sourceKey === sourceKey && ["queued", "processing"].includes(job.status)) : null;
}

export async function enqueueGeneration(jobRequest, { requestId, sourceNodeId, sourceKey } = {}) {
  const stableRequestId = String(requestId || randomUUID());
  const key = String(sourceKey || (sourceNodeId ? `node:${sourceNodeId}` : ""));
  const existing = findExistingJob(jobRequest.projectId, stableRequestId, key);
  if (existing) return existing;
  const id = randomUUID();
  const ts = now();
  const job = {
    id,
    projectId: jobRequest.projectId,
    capability: jobRequest.capability,
    providerId: jobRequest.providerId,
    modelId: jobRequest.modelId,
    status: "queued",
    phase: "queued",
    progress: 0,
    progressMode: "phase",
    attempt: 0,
    nextAttemptAt: null,
    requestId: stableRequestId,
    sourceNodeId: String(sourceNodeId || ""),
    sourceKey: key,
    request: jobRequest,
    outputAssetIds: [],
    createdAt: ts,
    updatedAt: ts,
  };
  state.jobs[id] = job;
  await saveDb();
  setImmediate(scheduleJobs);
  return job;
}

export function scheduleJobs() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  const current = Date.now();
  let nextAt = Infinity;
  const queued = Object.values(state.jobs)
    .filter((job) => job.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of queued) {
    const due = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : 0;
    if (due > current) {
      nextAt = Math.min(nextAt, due);
      continue;
    }
    const lane = serializedMediaLane(job);
    if (lane && providerRunning.has(lane)) continue;
    startJob(job);
  }
  if (Number.isFinite(nextAt)) schedulerTimer = setTimeout(scheduleJobs, Math.max(1, nextAt - Date.now()));
}

function startJob(job) {
  if (job.status !== "queued") return;
  const lane = serializedMediaLane(job);
  if (lane) providerRunning.add(lane);
  job.status = "processing";
  job.phase = "preparing";
  job.nextAttemptAt = null;
  job.attempt = Number(job.attempt || 0) + 1;
  job.updatedAt = now();
  const controller = new AbortController();
  jobControllers.set(job.id, controller);
  void runJob(job.id, controller.signal).finally(() => {
    jobControllers.delete(job.id);
    if (lane) providerRunning.delete(lane);
    scheduleJobs();
  });
}

export function applyReshootToTimeline(job, asset) {
  const pr = state.projects[job.projectId];
  if (!pr) return;
  const item = (pr.timeline?.items || []).find((i) => i.id === job.request?.params?.reshootItemId);
  if (!item) return;
  Object.assign(item, {
    sourceAssetId: asset.id,
    kind: "video",
    name: `${String(item.name || "片段")} · 重拍`,
    sourceInFrame: 0,
    sourceOutFrame: Number(item.durationInFrames || 1),
    playbackRate: 1,
  });
  pr.updatedAt = now();
}

export function applyExtendToTimeline(job, asset) {
  const pr = state.projects[job.projectId];
  if (!pr) return;
  const item = (pr.timeline?.items || []).find((i) => i.id === job.request?.params?.extendAfterItemId);
  if (!item) return;
  const fps = Math.max(1, Number(pr.timeline?.fps || 30));
  const dur = Math.max(1, Math.round((asset.durationMs || 3000) / 1000 * fps));
  pr.timeline.items.push({
    id: randomUUID(),
    track: item.track,
    startFrame: Number(item.startFrame || 0) + Number(item.durationInFrames || 1),
    durationInFrames: dur,
    name: `${String(item.name || "片段")} · 续写`,
    kind: "video",
    sourceAssetId: asset.id,
    sourceInFrame: 0,
    sourceOutFrame: dur,
    playbackRate: 1,
    volume: 1,
    opacity: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    transform: { x: 0, y: 0, scale: 1 },
  });
  pr.updatedAt = now();
}

export async function runJob(id, signal) {
  const job = state.jobs[id];
  if (!job || job.status === "canceled") return;
  try {
    signal?.throwIfAborted();
    job.progress = Math.max(3, Number(job.progress || 0));
    job.updatedAt = now();
    await saveDb();
    const variants = job.capability.startsWith("image.")
      ? Math.max(1, Math.min(4, Math.round(Number(job.request.params?.variants || 1) || 1)))
      : 1;
    const assets = [];
    let outputText = null;
    job.phase = "submitting";
    await saveDb();
    job.phase = "generating";
    await saveDb();

    for (let i = 0; i < variants; i++) {
      const variantJob = i === 0 ? job : { ...job, id: `${job.id}-v${i}`, providerTaskId: undefined, outputAssetIds: [] };
      const { assets: produced, outputText: text } = await runMediaProviderGeneration({
        job: variantJob,
        registry,
        getAsset: (assetId) => state.assets[assetId],
        media: mediaAccess,
        assetsDir: ASSETS_DIR,
        addAsset,
        maxRemoteBytes: MAX_REMOTE_BYTES,
        signal,
        onProgress: async (patch) => {
          if (patch.progress != null) job.progress = patch.progress;
          if (patch.progressMode) job.progressMode = patch.progressMode;
          if (patch.phase) job.phase = patch.phase;
          if (patch.outputText != null) job.outputText = patch.outputText;
          if (patch.providerAttempt != null) job.providerAttempt = patch.providerAttempt;
          if (patch.providerMaxAttempts != null) job.providerMaxAttempts = patch.providerMaxAttempts;
          if (patch.error != null) job.error = patch.error;
          job.updatedAt = now();
          await saveDb();
        },
        pollIntervalMs: Number(
          process.env[`${job.providerId.toUpperCase()}_POLL_INTERVAL_MS`] ||
            process.env.APIMART_POLL_INTERVAL_MS ||
            process.env.AGNES_POLL_INTERVAL_MS ||
            process.env.BAILIAN_POLL_INTERVAL_MS ||
            2000,
        ),
        maxPollMs: Number(
          process.env[`${job.providerId.toUpperCase()}_TIMEOUT_MS`] ||
            process.env.APIMART_TIMEOUT_MS ||
            process.env.AGNES_VIDEO_TIMEOUT_MS ||
            process.env.BAILIAN_TIMEOUT_MS ||
            20 * 60 * 1000,
        ),
      });
      if (i === 0 && variantJob.providerTaskId) job.providerTaskId = variantJob.providerTaskId;
      assets.push(...produced);
      if (text) outputText = text;
    }

    if (job.status === "canceled") return;
    job.phase = "finalizing";
    await saveDb();
    job.outputAssetIds = assets.map((a) => a.id);
    job.outputText = outputText;
    job.status = "succeeded";
    job.phase = "succeeded";
    job.progress = 100;
    job.updatedAt = now();
    if (assets[0] && job.request?.params?.reshootItemId) applyReshootToTimeline(job, assets[0]);
    if (assets[0] && job.request?.params?.extendAfterItemId) applyExtendToTimeline(job, assets[0]);
    await saveDb();
  } catch (error) {
    if (job.status === "canceled" || error?.name === "AbortError") {
      job.status = "canceled";
      job.phase = "canceled";
      job.updatedAt = now();
      await saveDb();
      return;
    }
    const retryPhase = providerRetryPhase(error);
    const maxAttempts = retryPhase === "provider_busy" ? MAX_PROVIDER_BUSY_ATTEMPTS : MAX_PROVIDER_ATTEMPTS;
    if (retryPhase && Number(job.attempt || 0) < maxAttempts) {
      const delay = retryDelay(error, job.attempt, retryPhase === "provider_busy" ? PROVIDER_BUSY_RETRY_BASE_MS : PROVIDER_RETRY_BASE_MS);
      job.status = "queued";
      job.phase = retryPhase;
      job.nextAttemptAt = new Date(Date.now() + delay).toISOString();
      job.progress = 0;
      job.error = "";
      job.updatedAt = now();
      await saveDb();
      return;
    }
    job.status = "failed";
    job.phase = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = now();
    await saveDb();
  }
}

const interruptedJobs = Object.values(state.jobs).filter((job) => ["queued", "processing"].includes(job.status));
if (interruptedJobs.length) {
  const interruptedAt = new Date().toISOString();
  for (const job of interruptedJobs) {
    job.status = "failed";
    job.error = "Studio restarted before this generation finished. Retry from the node.";
    job.updatedAt = interruptedAt;
  }
  await saveDb();
}

export async function extractFrameAsset(project, jobId, asset, frameIndex, fps, label) {
  if (asset.kind === "image") return asset;
  if (!HAS_FFMPEG) throw Object.assign(new Error(`锚点帧提取需要 ffmpeg（${label}）`), { status: 503 });
  const known = asset.durationMs ? Math.floor((asset.durationMs / 1000) * fps) - 1 : Number.POSITIVE_INFINITY;
  const frame = Math.max(0, Math.min(known, Math.floor(Number(frameIndex) || 0)));
  const filename = `${jobId}-${label}.png`;
  const target = join(ASSETS_DIR, filename);
  await execFile(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(frame / fps), "-i", join(ASSETS_DIR, asset.localPath), "-frames:v", "1", target],
    { timeout: 30000 },
  );
  return addAsset({
    projectId: project.id,
    kind: "image",
    filename,
    mime: "image/png",
    localPath: target,
    metadata: { sourceAssetId: asset.id, frameIndex: frame, source: "keyframe", label },
    source: "keyframe",
    category: asset.category || "",
  });
}

export function pickDuration(model, wanted) {
  const nums = (model.constraints?.durations || []).map(Number);
  if (!nums.length) return undefined;
  let best = nums[0];
  for (const d of nums) if (Math.abs(d - wanted) < Math.abs(best - wanted)) best = d;
  return best;
}

export async function timelineItemOrThrow(project, itemId) {
  const item = (project.timeline?.items || []).find((i) => i.id === itemId);
  if (!item) throw Object.assign(new Error("timeline item not found"), { status: 404 });
  return item;
}
