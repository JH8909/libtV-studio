import { randomUUID } from "node:crypto";
import { createProviderHttp } from "./http.mjs";

/** OpenAI-compatible chat completions MediaProvider (DeepSeek / Bailian text). */
export class OpenAICompatibleTextProvider {
  /**
   * @param {{
   *   providerId: string,
   *   label: string,
   *   getConfig: () => { apiKey: string, baseUrl: string, modelId: string, displayLabel?: string },
   *   fetchImpl?: typeof fetch,
   * }} deps
   */
  constructor(deps) {
    this.providerId = deps.providerId;
    this.label = deps.label;
    this.getConfig = deps.getConfig;
    this.http = createProviderHttp({ fetchImpl: deps.fetchImpl });
    this.tasks = new Map();
  }

  models() {
    const cfg = this.getConfig();
    if (!cfg.apiKey || !cfg.modelId) return [];
    return [
      {
        providerId: this.providerId,
        modelId: cfg.modelId,
        displayName: `${cfg.displayLabel || this.label} · ${cfg.modelId}`,
        capabilities: ["text.generate"],
        constraints: {},
        configured: true,
      },
    ];
  }

  validate() {
    return [];
  }

  async submit(request, options = {}) {
    const { signal, onProgress } = options;
    const cfg = this.getConfig();
    if (!cfg.apiKey) throw new Error(`${this.label} API key is not configured`);
    await onProgress?.({ progress: 12 });
    const timeoutEnv = `${this.providerId.toUpperCase()}_TEXT_TIMEOUT_MS`;
    const defaultTimeoutMs = this.providerId === "deepseek" ? 90_000 : 120_000;
    const timeoutMs = Math.max(1_000, Number(request.params?.timeoutMs || process.env[timeoutEnv] || defaultTimeoutMs));
    const combinedSignal = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
    const maxTokens = Math.max(256, Math.min(8_192, Number(request.params?.maxTokens || 4_096)));
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 5_000);
      void Promise.resolve(onProgress?.({
        progress: Math.min(90, 12 + elapsed * 2),
        progressMode: "heartbeat",
        phase: "generating",
      })).catch(() => {});
    }, 5_000);
    const body = {
      model: request.modelId,
      stream: false,
      messages: [
        { role: "system", content: String(request.params?.system || "You are a professional video creative assistant.") },
        { role: "user", content: request.prompt },
      ],
      temperature: Number(request.params?.temperature ?? 0.7),
      max_tokens: maxTokens,
    };
    let data;
    try {
      data = await this.http.providerJson(
        `${cfg.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        this.label,
        combinedSignal,
      );
    } catch (error) {
      if (error?.name === "TimeoutError") throw new Error(`${this.label} text timed out after ${Math.round(timeoutMs / 1000)} seconds`);
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
    const content = (data.data || data).choices?.[0]?.message?.content;
    let outputText = "";
    if (typeof content === "string" && content.trim()) outputText = content.trim();
    else if (Array.isArray(content)) outputText = content.map((item) => item?.text || item?.content || "").join("\n").trim();
    if (!outputText) throw new Error(`${this.label} returned no content`);
    const taskId = `${this.providerId}-text:${randomUUID()}`;
    const result = { taskId, status: "succeeded", progress: 100, outputText };
    this.tasks.set(taskId, { result });
    return result;
  }

  async query(taskId) {
    const task = this.tasks.get(taskId);
    if (!task?.result) throw new Error(`unknown ${this.providerId} task: ${taskId}`);
    return task.result;
  }
}
