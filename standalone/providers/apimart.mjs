import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { createProviderHttp, sleep } from "./http.mjs";
import { imagePromptWithNegativeFallback, recursivelyFindUrl, seedancePrompt } from "./prompts.mjs";

/**
 * APIMart MediaProvider — implements packages/shared MediaProvider:
 *   providerId, models(), validate(), submit(), query()
 */
export class ApimartProvider {
  /**
   * @param {{
   *   getConfig: () => { apiKey: string, baseUrl: string, chatBaseUrl: string, publicBaseUrl?: string, enabledModelIds?: string|null, cachedModels?: object[] },
   *   media: { normalizeImage: Function, readBytes: Function, publicUrlFor: Function },
   *   fetchImpl?: typeof fetch,
   *   retryBaseMs?: number,
   *   onModelsCached?: (items: object[]) => Promise<void>|void,
   * }} deps
   */
  constructor(deps) {
    this.providerId = "apimart";
    this.getConfig = deps.getConfig;
    this.media = deps.media;
    this.onModelsCached = deps.onModelsCached;
    this.http = createProviderHttp({
      fetchImpl: deps.fetchImpl,
      retryBaseMs: deps.retryBaseMs ?? Number(process.env.PROVIDER_RETRY_BASE_MS || 1000),
    });
    this.tasks = new Map();
    this.imageUploads = new Map();
    this.modelCache = { expiresAt: 0, models: [] };
  }

  models() {
    const cfg = this.getConfig();
    if (!cfg.apiKey) return [];
    const all = this.#cachedDescriptors(cfg.cachedModels);
    return this.#enabled(all, cfg.enabledModelIds);
  }

  validate(_request) {
    return [];
  }

  async submit(request, options = {}) {
    const { signal, onProgress } = options;
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("APIMART_API_KEY is not configured");

    if (request.capability === "text.generate") {
      return this.#textGenerate(request, signal, onProgress);
    }
    if (request.capability.startsWith("image.") || request.capability.startsWith("video.")) {
      return this.#mediaSubmit(request, signal, onProgress);
    }
    throw new Error(`APIMart does not support ${request.capability}`);
  }

  async query(taskId, options = {}) {
    const { signal, onProgress } = options;
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown APIMart task: ${taskId}`);
    if (task.kind === "text") {
      return task.result || { taskId, status: "succeeded", progress: 100, outputText: "" };
    }
    return this.#mediaQuery(taskId, task, signal, onProgress);
  }

  modelDescriptor(item) {
    const modelId = String(typeof item === "string" ? item : item?.id || item?.name || "").trim();
    if (!modelId) return null;
    const declared = [item?.type, item?.category, item?.modality, item?.model_type, ...(Array.isArray(item?.capabilities) ? item.capabilities : [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const id = modelId.toLowerCase();
    if (/(?:audio|speech|tts|whisper|embedding|moderation)/.test(declared) || /(?:^|[-_.])(?:tts|whisper|embedding|moderation)(?:$|[-_.])/.test(id)) {
      return null;
    }
    const video =
      declared.includes("video") ||
      /(?:video|seedance|sora|veo|hailuo|minimax-h3|flux-3-video|skyreels|happyhorse|kling|vidu|pixverse|omni-flash)/.test(id) ||
      (/wan2[.-][567]/.test(id) && !id.includes("image"));
    const image =
      !video && (declared.includes("image") || /(?:image|imagen|seedream|flux|qwen-image|midjourney|nano-banana|z-image)/.test(id));
    if (video) {
      return {
        providerId: this.providerId,
        modelId,
        displayName: `APIMart · ${modelId}`,
        capabilities: ["video.generate", "video.image_to_video", "video.first_last_frame", "video.reference"],
        constraints: {
          durations: [4, 5, 6, 8, 10, 12, 15],
          aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
          resolutions: ["480p", "720p", "1080p", "4k"],
          audioModes: ["ambient", "silent", "music", "voiceover", "full"],
          maxImageRefs: 9,
          maxVideoRefs: 3,
          maxAudioRefs: 3,
        },
        configured: true,
      };
    }
    if (image) {
      return {
        providerId: this.providerId,
        modelId,
        displayName: `APIMart · ${modelId}`,
        capabilities: ["image.generate", "image.edit"],
        constraints: {
          aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
          resolutions: ["1K", "2K", "4K"],
          maxImageRefs: 16,
        },
        configured: true,
      };
    }
    return {
      providerId: this.providerId,
      modelId,
      displayName: `APIMart · ${modelId}`,
      capabilities: ["text.generate"],
      constraints: {},
      configured: true,
    };
  }

  async discoverModels(strict = false) {
    const cfg = this.getConfig();
    if (!cfg.apiKey) return [];
    if (!strict) return this.#cachedDescriptors(cfg.cachedModels);
    if (this.modelCache.expiresAt > Date.now()) return this.modelCache.models;
    try {
      const response = await this.http.fetchImpl(`${cfg.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const { providerHttpError } = await import("./http.mjs");
        throw providerHttpError("APIMart models", response, body);
      }
      const items = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : Array.isArray(body) ? body : [];
      const models = items.map((item) => this.modelDescriptor(item)).filter(Boolean);
      if (!models.length) throw new Error("APIMart models returned an empty list");
      await this.onModelsCached?.(items);
      this.modelCache = { expiresAt: Date.now() + 300_000, models };
      return models;
    } catch (error) {
      this.modelCache = { expiresAt: 0, models: [] };
      throw error;
    }
  }

  #cachedDescriptors(raw) {
    try {
      const items = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw || "[]") : [];
      return items.map((item) => this.modelDescriptor(item)).filter(Boolean);
    } catch {
      return [];
    }
  }

  #enabled(models, enabledRaw) {
    if (enabledRaw == null) return models;
    const enabled = new Set(String(enabledRaw || "").split(",").map((id) => id.trim()).filter(Boolean));
    return models.filter((model) => enabled.has(model.modelId));
  }

  #payload(data, label) {
    if (Number(data?.code || 200) >= 400) {
      throw new Error(`${label} failed: ${data?.error?.message || data?.message || data.code}`);
    }
    return data?.data && typeof data.data === "object" ? data.data : data;
  }

  async #textGenerate(request, signal, onProgress) {
    const cfg = this.getConfig();
    await onProgress?.({ progress: 12 });
    const body = {
      model: request.modelId,
      stream: false,
      messages: [
        { role: "system", content: String(request.params?.system || "You are a professional video creative assistant.") },
        { role: "user", content: request.prompt },
      ],
      temperature: Number(request.params?.temperature ?? 0.7),
    };
    const data = this.#payload(
      await this.http.providerJson(
        `${cfg.chatBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        "APIMart text",
        signal,
      ),
      "APIMart text",
    );
    const content = data.choices?.[0]?.message?.content;
    let outputText = "";
    if (typeof content === "string" && content.trim()) outputText = content.trim();
    else if (Array.isArray(content)) outputText = content.map((item) => item?.text || item?.content || "").join("\n").trim();
    if (!outputText) throw new Error("APIMart text returned no content");
    const taskId = `apimart-text:${randomUUID()}`;
    const result = { taskId, status: "succeeded", progress: 100, outputText };
    this.tasks.set(taskId, { kind: "text", result });
    return result;
  }

  async #uploadImage(ref, signal) {
    if (ref.url && /^https:\/\//i.test(ref.url) && !ref.url.includes("/media/assets/")) return ref.url;
    const cached = this.imageUploads.get(ref.storageKey || ref.assetId);
    if (cached?.expiresAt > Date.now()) return cached.url;
    const cfg = this.getConfig();
    const normalized = await this.media.normalizeImage(ref.storageKey, ref.mime);
    const bytes = await this.media.readBytes(normalized.storageKey);
    if (bytes.length > 20 * 1024 * 1024) throw new Error("APIMart reference image exceeds 20 MB");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: normalized.mime }), basename(normalized.storageKey));
    const data = await this.http.providerJson(
      `${cfg.baseUrl}/uploads/images`,
      { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}` }, body: form },
      "APIMart image upload",
      signal,
    );
    const url = data.url || data.data?.url;
    if (!url) throw new Error("APIMart image upload returned no URL");
    const key = ref.storageKey || ref.assetId;
    this.imageUploads.set(key, { url, expiresAt: Date.now() + 70 * 60 * 60 * 1000 });
    return url;
  }

  #publicAssetUrl(ref) {
    const cfg = this.getConfig();
    if (ref.url && /^https:\/\//i.test(ref.url) && !ref.url.startsWith("data:")) return ref.url;
    if (cfg.publicBaseUrl && ref.storageKey) {
      return `${cfg.publicBaseUrl.replace(/\/$/, "")}/media/assets/${encodeURIComponent(ref.storageKey)}`;
    }
    if (typeof ref.metadata?.providerUrl === "string" && /^https:\/\//i.test(ref.metadata.providerUrl)) {
      return ref.metadata.providerUrl;
    }
    throw Object.assign(new Error("APIMart 视频/音频参考需要公网素材地址，请在“模型/API”中配置素材公网地址。"), {
      status: 422,
      code: "reference_not_public",
    });
  }

  async #mediaSubmit(request, signal, onProgress) {
    const cfg = this.getConfig();
    const params = request.params || {};
    const kind = request.capability.startsWith("image.") ? "image" : "video";
    const body = {
      model: request.modelId,
      prompt: kind === "video" ? seedancePrompt(request) : imagePromptWithNegativeFallback(request),
    };
    if (kind === "image") {
      body.n = 1;
      body.size = params.aspectRatio || "1:1";
      body.resolution = String(params.resolution || params.quality || "2K").toLowerCase();
      const imageUrls = [];
      for (const ref of request.references || []) {
        if (ref.kind === "image") imageUrls.push(await this.#uploadImage(ref, signal));
      }
      if (imageUrls.length) body.image_urls = imageUrls;
    } else {
      body.resolution = params.resolution || "720p";
      body.size = params.aspectRatio || "16:9";
      body.duration = Math.max(4, Math.min(15, Number(params.duration || 5)));
      body.generate_audio = params.audioMode !== "silent" || params.generateAudio === true;
      if (params.seed !== undefined && params.seed !== "") body.seed = Number(params.seed);
      if (params.returnLastFrame === true) body.return_last_frame = true;
      const images = [];
      const roleImages = [];
      const videos = [];
      const audios = [];
      for (const ref of request.references || []) {
        if (ref.kind === "image") {
          const url = await this.#uploadImage(ref, signal);
          if (request.capability === "video.first_last_frame") {
            roleImages.push({ url, role: ref.role === "last-frame" ? "last_frame" : "first_frame" });
          } else images.push(url);
        } else if (ref.kind === "video") videos.push(this.#publicAssetUrl(ref));
        else if (ref.kind === "audio") audios.push(this.#publicAssetUrl(ref));
      }
      if (roleImages.length) body.image_with_roles = roleImages;
      else if (images.length) body.image_urls = images;
      if (videos.length) body.video_urls = videos;
      if (audios.length) body.audio_urls = audios;
    }
    const endpoint = kind === "image" ? "images/generations" : "videos/generations";
    const created = this.#payload(
      await this.http.providerJson(
        `${cfg.baseUrl}/${endpoint}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        `APIMart ${kind} submit`,
        signal,
      ),
      `APIMart ${kind} submit`,
    );
    const ticket = Array.isArray(created) ? created[0] : created;
    const taskId = ticket?.task_id || ticket?.id;
    if (!taskId) throw new Error(`APIMart ${kind} did not return task_id`);
    this.tasks.set(String(taskId), { kind, request });
    await onProgress?.({ progress: 5 });
    return { taskId: String(taskId), status: "processing", progress: 5, raw: created };
  }

  async #mediaQuery(taskId, task, signal, onProgress) {
    const cfg = this.getConfig();
    const kind = task.kind;
    const payload = this.#payload(
      await this.http.providerPollJson(
        `${cfg.baseUrl}/tasks/${encodeURIComponent(taskId)}?language=en`,
        { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
        `APIMart ${kind} status`,
        signal,
      ),
      `APIMart ${kind} status`,
    );
    const status = String(payload.status || "").toLowerCase();
    if (status === "completed") {
      const url = recursivelyFindUrl(payload.result || payload, kind);
      if (!url) throw new Error(`APIMart ${kind} completed without a result URL`);
      await onProgress?.({ progress: 95, progressMode: "provider" });
      const result = {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [
          {
            kind,
            source: { type: "url", url },
            mime: kind === "image" ? "image/png" : "video/mp4",
            metadata: {
              provider: "apimart",
              providerUrl: url,
              model: task.request?.modelId,
              prompt: task.request?.prompt,
              apimartResult: payload,
            },
          },
        ],
      };
      task.result = result;
      return result;
    }
    if (["failed", "cancelled", "canceled"].includes(status)) {
      return {
        taskId,
        status: "failed",
        error: `APIMart ${kind} failed: ${payload.error?.message || payload.message || status}`,
        raw: payload,
      };
    }
    const progress = Number.isFinite(Number(payload.progress))
      ? Math.max(5, Math.min(90, Number(payload.progress)))
      : 5;
    await onProgress?.({ progressMode: "provider", progress });
    return { taskId, status: "processing", progress, raw: payload };
  }
}
