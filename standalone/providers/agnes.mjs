import { randomUUID } from "node:crypto";
import { abortError, createProviderHttp, isTransientFetchError, providerHttpError, sleep } from "./http.mjs";
import { firstResolvedRef, imagePromptWithNegativeFallback, recursivelyFindUrl } from "./prompts.mjs";

/**
 * Agnes MediaProvider — implements packages/shared MediaProvider:
 *   providerId, models(), validate(), submit(), query()
 */
export class AgnesProvider {
  /**
   * @param {{
   *   getConfig: () => { apiKey: string, baseUrl: string, textModel: string, imageModel: string, videoModel: string, publicBaseUrl?: string },
   *   media: { imageReferenceValue: Function, publicUrlFor: Function },
   *   fetchImpl?: typeof fetch,
   *   retryBaseMs?: number,
   * }} deps
   */
  constructor(deps) {
    this.providerId = "agnes";
    this.getConfig = deps.getConfig;
    this.media = deps.media;
    this.http = createProviderHttp({
      fetchImpl: deps.fetchImpl,
      retryBaseMs: deps.retryBaseMs ?? Number(process.env.PROVIDER_RETRY_BASE_MS || 1000),
    });
    /** @type {Map<string, object>} */
    this.tasks = new Map();
  }

  models() {
    const cfg = this.getConfig();
    if (!cfg.apiKey) return [];
    return [cfg.textModel, cfg.imageModel, cfg.videoModel]
      .map((modelId) => this.#modelFromId(modelId))
      .filter(Boolean);
  }

  validate(_request) {
    return [];
  }

  /**
   * @param {import('../lib/shared-contract.mjs') extends never ? any : object} request ProviderGenerationRequest
   * @param {{ signal?: AbortSignal, onProgress?: (p: object) => Promise<void>|void }} [options]
   */
  async submit(request, options = {}) {
    const { signal, onProgress } = options;
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("AGNES_API_KEY is not configured");

    if (request.capability === "text.generate") {
      return this.#textGenerate(request, signal, onProgress);
    }
    if (request.capability.startsWith("image.")) {
      return this.#imageGenerate(request, signal, onProgress);
    }
    if (request.capability.startsWith("video.")) {
      return this.#videoSubmit(request, signal, onProgress);
    }
    throw new Error(`Agnes does not support ${request.capability}`);
  }

  async query(taskId, options = {}) {
    const { signal, onProgress } = options;
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown Agnes task: ${taskId}`);
    if (task.kind === "video") return this.#videoQuery(taskId, task, signal, onProgress);
    return {
      taskId,
      status: task.result?.status || "succeeded",
      progress: task.result?.progress ?? 100,
      outputs: task.result?.outputs,
      outputText: task.result?.outputText,
      error: task.result?.error,
    };
  }

  #modelFromId(modelId) {
    const id = String(modelId || "").trim();
    if (!id) return null;
    const capabilities = this.#capabilitiesFor(id);
    return {
      providerId: this.providerId,
      modelId: id,
      displayName: `Agnes · ${id}`,
      capabilities,
      constraints: this.#constraintsFor(capabilities),
      configured: true,
    };
  }

  #capabilitiesFor(modelId) {
    const id = String(modelId || "").toLowerCase();
    const image = /image|img|seedream|flux|qwen-image|gpt-image|nano-banana/.test(id);
    const video = /video|seedance|veo|kling|sora|wan|hailuo/.test(id);
    const unsupported = /embedding|moderation|rerank|speech|audio|tts|asr/.test(id);
    if (video) return ["video.generate", "video.image_to_video", "video.first_last_frame"];
    if (image) return ["image.generate", "image.edit"];
    if (!unsupported) return ["text.generate"];
    return [];
  }

  #constraintsFor(capabilities) {
    if (capabilities.includes("image.generate")) {
      return { aspectRatios: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"], resolutions: ["1K", "2K"] };
    }
    if (capabilities.includes("video.generate")) {
      return {
        durations: [3, 5, 10, 18],
        aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        resolutions: ["480p", "720p", "1080p"],
        maxImageRefs: 2,
      };
    }
    return {};
  }

  async #agnesRequest(url, options, label, signal, timeoutMs = Number(process.env.AGNES_REQUEST_TIMEOUT_MS || 180_000)) {
    const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(Math.max(1, timeoutMs))]);
    let response;
    try {
      response = await this.http.fetchImpl(url, { ...options, signal: combined });
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error?.name === "TimeoutError") throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerHttpError(label, response, data);
    return data;
  }

  async #textGenerate(request, signal, onProgress) {
    const cfg = this.getConfig();
    const maxAttempts = Math.max(1, Number(process.env.AGNES_TEXT_NETWORK_ATTEMPTS || 2));
    const timeoutMs = Math.max(1, Number(process.env.AGNES_TEXT_TIMEOUT_MS || 180_000));
    const body = {
      model: request.modelId,
      stream: true,
      messages: [
        { role: "system", content: String(request.params?.system || "You are a professional video creative assistant.") },
        { role: "user", content: request.prompt },
      ],
      temperature: Number(request.params?.temperature ?? 0.7),
    };
    const contentText = (content) =>
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((item) => item?.text || item?.content || "").join("\n")
          : "";

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await onProgress?.({
        providerAttempt: attempt,
        providerMaxAttempts: maxAttempts,
        outputText: "",
        progress: 12,
        phase: "generating",
      });
      const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
      try {
        const response = await this.http.fetchImpl(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: combined,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw providerHttpError("Agnes text", response, data);
        }
        if (!response.headers.get("content-type")?.includes("text/event-stream")) {
          const data = await response.json().catch(() => ({}));
          const result = contentText(data.choices?.[0]?.message?.content).trim();
          if (result) {
            const taskId = `agnes-text:${randomUUID()}`;
            const out = { taskId, status: "succeeded", progress: 100, outputText: result };
            this.tasks.set(taskId, { kind: "text", result: out });
            return out;
          }
          throw new Error("Agnes text returned no content");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Agnes text returned no stream");
        const decoder = new TextDecoder();
        let buffer = "";
        let result = "";
        let mode = "unknown";
        let lastSave = 0;
        const consume = (line) => {
          if (!line.startsWith("data:")) return;
          const value = line.slice(5).trim();
          if (!value || value === "[DONE]") return;
          let data;
          try {
            data = JSON.parse(value);
          } catch {
            return;
          }
          const delta = contentText(data.choices?.[0]?.delta?.content);
          if (!delta) return;
          if (result && mode === "unknown") mode = delta.startsWith(result) ? "cumulative" : "incremental";
          result = mode === "cumulative" && delta.startsWith(result) ? delta : result + delta;
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) consume(line);
          if (Date.now() - lastSave >= 1000) {
            lastSave = Date.now();
            await onProgress?.({
              outputText: result,
              progressMode: "stream",
              progress: Math.min(90, 12 + Math.floor(result.length / 300)),
            });
          }
        }
        buffer += decoder.decode();
        if (buffer) consume(buffer);
        if (result.trim()) {
          const taskId = `agnes-text:${randomUUID()}`;
          const out = { taskId, status: "succeeded", progress: 100, outputText: result.trim() };
          this.tasks.set(taskId, { kind: "text", result: out });
          return out;
        }
        throw new Error("Agnes text returned no streamed content");
      } catch (error) {
        if (signal?.aborted) throw abortError();
        let err = error;
        const timedOut = error?.name === "TimeoutError";
        if (timedOut) err = new Error(`Agnes text timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        const retryable = timedOut || isTransientFetchError(err);
        if (!retryable || attempt >= maxAttempts) throw err;
        await onProgress?.({
          phase: "retrying",
          error: `网络波动，准备第 ${attempt + 1}/${maxAttempts} 次请求`,
        });
        await sleep(Math.min(2000, 500 * 2 ** (attempt - 1)), signal);
        await onProgress?.({ phase: "generating", error: "" });
      }
    }
    throw new Error("Agnes text failed");
  }

  async #imageReferenceUrls(request) {
    const refs = [];
    for (const reference of request.references || []) {
      if (reference.kind !== "image") continue;
      if (reference.url && (reference.url.startsWith("data:") || /^https?:\/\//i.test(reference.url))) {
        refs.push(reference.url);
        continue;
      }
      refs.push(
        await this.media.imageReferenceValue(reference.storageKey, reference.mime, {
          providerUrl: reference.metadata?.providerUrl,
        }),
      );
    }
    return refs;
  }

  async #imageGenerate(request, signal, onProgress) {
    const cfg = this.getConfig();
    const refs = await this.#imageReferenceUrls(request);
    const extra_body = { response_format: "url" };
    if (refs.length) extra_body.image = refs;
    const requestedSize = String(request.params?.quality || request.params?.resolution || "2K").toUpperCase();
    const size = ["1K", "2K"].includes(requestedSize) ? requestedSize : "2K";
    const timeoutMs = Math.max(1, Number(process.env.AGNES_IMAGE_TIMEOUT_MS || 600_000));
    const body = {
      model: request.modelId,
      prompt: imagePromptWithNegativeFallback(request),
      size,
      ratio: request.params?.aspectRatio || "1:1",
      extra_body,
    };
    await onProgress?.({ progress: 20 });
    const data = await this.#agnesRequest(
      `${cfg.baseUrl}/images/generations`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "Agnes image",
      signal,
      timeoutMs,
    );
    const output = data.data?.[0];
    if (!output) throw new Error("Agnes image returned no output");
    const taskId = `agnes-image:${randomUUID()}`;
    let result;
    if (output.b64_json) {
      result = {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [
          {
            kind: "image",
            source: { type: "bytes", dataBase64: output.b64_json },
            mime: "image/png",
            filename: `${taskId}.png`,
            metadata: {
              provider: "agnes",
              providerUrl: typeof output.url === "string" ? output.url : undefined,
              localOnly: !output.url,
              model: request.modelId,
              prompt: request.prompt,
            },
          },
        ],
      };
    } else if (output.url) {
      result = {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [
          {
            kind: "image",
            source: { type: "url", url: output.url },
            mime: "image/png",
            metadata: { provider: "agnes", providerUrl: output.url, model: request.modelId, prompt: request.prompt, agnesResult: data },
          },
        ],
      };
    } else {
      throw new Error("Agnes image returned neither b64_json nor url");
    }
    this.tasks.set(taskId, { kind: "image", result });
    return result;
  }

  #videoDimensions(resolution = "720p", ratio = "16:9") {
    const sizes = {
      "480p": { "16:9": [832, 448], "9:16": [448, 832], "1:1": [640, 640], "4:3": [768, 576], "3:4": [576, 768] },
      "720p": { "16:9": [1280, 704], "9:16": [704, 1280], "1:1": [768, 768], "4:3": [1024, 768], "3:4": [768, 1024] },
      "1080p": { "16:9": [1920, 1088], "9:16": [1088, 1920], "1:1": [1088, 1088], "4:3": [1472, 1088], "3:4": [1088, 1472] },
    };
    const [width, height] = (sizes[resolution] || sizes["720p"])[ratio] || sizes["720p"]["16:9"];
    return { width, height };
  }

  async #resolveImageUrl(ref) {
    if (ref?.url && (ref.url.startsWith("data:") || /^https?:\/\//i.test(ref.url))) return ref.url;
    if (!ref?.storageKey) return null;
    return this.media.imageReferenceValue(ref.storageKey, ref.mime, { providerUrl: ref.metadata?.providerUrl });
  }

  async #videoSubmit(request, signal, onProgress) {
    const cfg = this.getConfig();
    const duration = Number(request.params?.duration || 5);
    const numFrames = ({ 3: 81, 5: 121, 10: 241, 18: 441 })[duration] || 121;
    const frameRate = 24;
    const { width, height } = this.#videoDimensions(
      String(request.params?.resolution || "720p"),
      String(request.params?.aspectRatio || "16:9"),
    );
    const body = { model: request.modelId, prompt: request.prompt, width, height, num_frames: numFrames, frame_rate: frameRate };
    if (request.params?.seed !== undefined && request.params?.seed !== "") body.seed = Number(request.params.seed);
    if (request.params?.negativePrompt) body.negative_prompt = request.params.negativePrompt;
    const first = firstResolvedRef(request.references, ["first-frame"], "image");
    const last = firstResolvedRef(request.references, ["last-frame"], "image");
    if (request.capability === "video.image_to_video" && first) {
      body.image = await this.#resolveImageUrl(first);
    }
    if (request.capability === "video.first_last_frame" && first && last) {
      const refs = [];
      if (first) refs.push(await this.#resolveImageUrl(first));
      if (last) refs.push(await this.#resolveImageUrl(last));
      body.extra_body = { image: refs, mode: "keyframes" };
    }
    const created = await this.#agnesRequest(
      `${cfg.baseUrl}/videos`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "Agnes video submit",
      signal,
    );
    const videoId = created.video_id || created.task_id || created.id;
    if (!videoId) throw new Error("Agnes video did not return video_id");
    const taskId = String(videoId);
    this.tasks.set(taskId, { kind: "video", request, modelId: request.modelId });
    await onProgress?.({ progress: Number(created.progress || 5) });
    return { taskId, status: "processing", progress: Number(created.progress || 5), raw: created };
  }

  async #videoQuery(taskId, task, signal, onProgress) {
    const cfg = this.getConfig();
    const root = cfg.baseUrl.replace(/\/v1$/, "");
    const query = new URL(`${root}/agnesapi`);
    query.searchParams.set("video_id", String(taskId));
    query.searchParams.set("model_name", task.modelId || task.request?.modelId);
    let data;
    try {
      data = await this.#agnesRequest(query, { headers: { Authorization: `Bearer ${cfg.apiKey}` } }, "Agnes video status", signal);
    } catch (error) {
      if (error?.status === 429) {
        return { taskId, status: "processing", progress: task.lastProgress || 5, error: "rate_limited", raw: { retryAfterMs: error.retryAfterMs } };
      }
      throw error;
    }
    const status = String(data.status || "").toLowerCase();
    if (status === "completed") {
      const url = data.metadata?.url || data.url || recursivelyFindUrl(data, "video");
      if (!url) throw new Error("Agnes video completed without a result URL");
      const result = {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [
          {
            kind: "video",
            source: { type: "url", url },
            mime: "video/mp4",
            metadata: {
              provider: "agnes",
              model: task.request?.modelId,
              prompt: task.request?.prompt,
              seconds: data.seconds,
              size: data.size,
              agnesResult: data,
            },
          },
        ],
      };
      task.result = result;
      return result;
    }
    if (status === "failed") {
      return {
        taskId,
        status: "failed",
        error: `Agnes video failed: ${data.error?.message || data.error || "unknown error"}`,
        raw: data,
      };
    }
    const progress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : task.lastProgress || 5;
    task.lastProgress = progress;
    await onProgress?.({ progressMode: "provider", progress });
    return { taskId, status: "processing", progress, raw: data };
  }
}
