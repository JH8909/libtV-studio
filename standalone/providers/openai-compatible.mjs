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
    const body = {
      model: request.modelId,
      stream: false,
      messages: [
        { role: "system", content: String(request.params?.system || "You are a professional video creative assistant.") },
        { role: "user", content: request.prompt },
      ],
      temperature: Number(request.params?.temperature ?? 0.7),
    };
    const data = await this.http.providerJson(
      `${cfg.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      this.label,
      signal,
    );
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
