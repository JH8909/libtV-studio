import { randomUUID } from "node:crypto";
import { createProviderHttp } from "./http.mjs";
import { recursivelyFindUrl, seedancePrompt } from "./prompts.mjs";

function bailianImageSize(modelId, params = {}) {
  const ratio = String(params.aspectRatio || "1:1");
  const hi = /qwen-image-(?:2|3)\./.test(modelId);
  const sizes = hi
    ? { "16:9": "2688*1536", "9:16": "1536*2688", "1:1": "2048*2048", "4:3": "2368*1728", "3:4": "1728*2368" }
    : { "16:9": "1664*928", "9:16": "928*1664", "1:1": "1328*1328", "4:3": "1472*1104", "3:4": "1104*1472" };
  return sizes[ratio] || sizes["1:1"];
}

/** Bailian (DashScope) MediaProvider for image + video. Text uses OpenAICompatibleTextProvider. */
export class BailianMediaProvider {
  /**
   * @param {{
   *   getConfig: () => { apiKey: string, mediaBaseUrl: string, imageModel: string, videoModel: string },
   *   fetchImpl?: typeof fetch,
   *   retryBaseMs?: number,
   * }} deps
   */
  constructor(deps) {
    this.providerId = "bailian";
    this.getConfig = deps.getConfig;
    this.http = createProviderHttp({
      fetchImpl: deps.fetchImpl,
      retryBaseMs: deps.retryBaseMs ?? Number(process.env.PROVIDER_RETRY_BASE_MS || 1000),
    });
    this.tasks = new Map();
  }

  models() {
    const cfg = this.getConfig();
    if (!cfg.apiKey) return [];
    const models = [];
    if (cfg.imageModel) {
      models.push({
        providerId: this.providerId,
        modelId: cfg.imageModel,
        displayName: `百炼 · ${cfg.imageModel}`,
        capabilities: ["image.generate"],
        constraints: { aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], resolutions: ["1K", "2K"], maxImageRefs: 0 },
        configured: true,
      });
    }
    if (cfg.videoModel) {
      models.push({
        providerId: this.providerId,
        modelId: cfg.videoModel,
        displayName: `百炼 · ${cfg.videoModel}`,
        capabilities: ["video.generate"],
        constraints: {
          durations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
          resolutions: ["720P", "1080P"],
          maxImageRefs: 0,
        },
        configured: true,
      });
    }
    return models;
  }

  validate() {
    return [];
  }

  async submit(request, options = {}) {
    const { signal, onProgress } = options;
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error("BAILIAN_API_KEY is not configured");
    if (request.capability.startsWith("image.")) return this.#image(request, signal, onProgress);
    if (request.capability.startsWith("video.")) return this.#videoSubmit(request, signal, onProgress);
    throw new Error(`Bailian media provider does not support ${request.capability}`);
  }

  async query(taskId, options = {}) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown Bailian task: ${taskId}`);
    if (task.kind === "image") return task.result;
    return this.#videoQuery(taskId, task, options.signal, options.onProgress);
  }

  async #image(request, signal, onProgress) {
    const cfg = this.getConfig();
    const params = request.params || {};
    const body = {
      model: request.modelId,
      input: { messages: [{ role: "user", content: [{ text: request.prompt }] }] },
      parameters: { size: bailianImageSize(request.modelId, params), prompt_extend: true, watermark: false, n: 1 },
    };
    if (params.negativePrompt) body.parameters.negative_prompt = params.negativePrompt;
    await onProgress?.({ progress: 20 });
    const data = await this.http.providerJson(
      `${cfg.mediaBaseUrl}/services/aigc/multimodal-generation/generation`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "百炼 image",
      signal,
    );
    const url = recursivelyFindUrl(data.output || data, "image");
    if (!url) throw new Error(`百炼 image returned no result URL: ${data.message || data.code || "empty output"}`);
    const taskId = `bailian-image:${randomUUID()}`;
    const result = {
      taskId,
      status: "succeeded",
      progress: 100,
      outputs: [
        {
          kind: "image",
          source: { type: "url", url },
          mime: "image/png",
          metadata: { provider: "bailian", providerUrl: url, model: request.modelId, prompt: request.prompt, bailianResult: data },
        },
      ],
    };
    this.tasks.set(taskId, { kind: "image", result });
    return result;
  }

  async #videoSubmit(request, signal, onProgress) {
    const cfg = this.getConfig();
    const params = request.params || {};
    const body = {
      model: request.modelId,
      input: { prompt: seedancePrompt(request) },
      parameters: {
        resolution: params.resolution || "720P",
        ratio: params.aspectRatio || "16:9",
        duration: Math.max(2, Math.min(15, Number(params.duration || 5))),
        prompt_extend: true,
        watermark: false,
      },
    };
    if (params.negativePrompt) body.input.negative_prompt = params.negativePrompt;
    const created = await this.http.providerJson(
      `${cfg.mediaBaseUrl}/services/aigc/video-generation/video-synthesis`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(body),
      },
      "百炼 video submit",
      signal,
    );
    const taskId = created.output?.task_id || created.task_id || created.id;
    if (!taskId) throw new Error(`百炼 video did not return task_id: ${created.message || created.code || "empty output"}`);
    this.tasks.set(String(taskId), { kind: "video", request });
    await onProgress?.({ progress: 5 });
    return { taskId: String(taskId), status: "processing", progress: 5, raw: created };
  }

  async #videoQuery(taskId, task, signal, onProgress) {
    const cfg = this.getConfig();
    const data = await this.http.providerPollJson(
      `${cfg.mediaBaseUrl}/tasks/${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
      "百炼 video status",
      signal,
    );
    const output = data.output || data;
    const status = String(output.task_status || output.status || "").toLowerCase();
    if (["succeeded", "success", "completed"].includes(status)) {
      const url = recursivelyFindUrl(output, "video");
      if (!url) throw new Error("百炼 video completed without a result URL");
      await onProgress?.({ progress: 95, progressMode: "provider" });
      return {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [
          {
            kind: "video",
            source: { type: "url", url },
            mime: "video/mp4",
            metadata: {
              provider: "bailian",
              providerUrl: url,
              model: task.request?.modelId,
              prompt: task.request?.prompt,
              bailianResult: data,
            },
          },
        ],
      };
    }
    if (["failed", "fail", "canceled", "cancelled"].includes(status)) {
      return {
        taskId,
        status: "failed",
        error: `百炼 video failed: ${output.message || output.error_message || output.code || status}`,
        raw: data,
      };
    }
    const progress = Number.isFinite(Number(output.progress))
      ? Math.max(5, Math.min(90, Number(output.progress)))
      : 5;
    await onProgress?.({ progressMode: "provider", progress });
    return { taskId, status: "processing", progress, raw: data };
  }
}


export { bailianImageSize };
