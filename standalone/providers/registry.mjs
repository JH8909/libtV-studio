import { AgnesProvider } from "./agnes.mjs";
import { ApimartProvider } from "./apimart.mjs";
import { BailianMediaProvider } from "./bailian.mjs";
import { OpenAICompatibleTextProvider } from "./openai-compatible.mjs";
import { sanitizeProviderMessage } from "./http.mjs";

/**
 * Standalone provider registry implementing the same resolve boundary as
 * packages/media-gateway ProviderRegistry (capability + model + validate).
 */
export class StandaloneProviderRegistry {
  /**
   * @param {{
   *   getRuntimeConfig: () => object,
   *   media: object,
   *   getProviderSettings: () => object,
   *   persistProviderSettings: () => Promise<void>,
   *   fetchImpl?: typeof fetch,
   * }} deps
   */
  constructor(deps) {
    this.getRuntimeConfig = deps.getRuntimeConfig;
    this.media = deps.media;
    this.getProviderSettings = deps.getProviderSettings;
    this.persistProviderSettings = deps.persistProviderSettings;
    this.fetchImpl = deps.fetchImpl;
    this.providers = new Map();
    this.#rebuild();
  }

  #rebuild() {
    const fetchImpl = this.fetchImpl;
    const media = this.media;
    const getRuntime = this.getRuntimeConfig;

    const agnes = new AgnesProvider({
      getConfig: () => {
        const c = getRuntime();
        return {
          apiKey: c.AGNES_API_KEY,
          baseUrl: c.AGNES_BASE_URL,
          textModel: c.AGNES_TEXT_MODEL,
          imageModel: c.AGNES_IMAGE_MODEL,
          videoModel: c.AGNES_VIDEO_MODEL,
          publicBaseUrl: c.PUBLIC_BASE_URL,
        };
      },
      media,
      fetchImpl,
    });

    const apimart = new ApimartProvider({
      getConfig: () => {
        const c = getRuntime();
        const settings = this.getProviderSettings();
        return {
          apiKey: c.APIMART_API_KEY,
          baseUrl: c.APIMART_BASE_URL,
          chatBaseUrl: c.APIMART_CHAT_BASE_URL,
          publicBaseUrl: c.PUBLIC_BASE_URL,
          enabledModelIds: Object.hasOwn(settings, "APIMART_ENABLED_MODELS") ? settings.APIMART_ENABLED_MODELS : null,
          cachedModels: settings.APIMART_MODELS,
        };
      },
      media,
      fetchImpl,
      onModelsCached: async (items) => {
        const settings = this.getProviderSettings();
        settings.APIMART_MODELS = items;
        await this.persistProviderSettings();
      },
    });

    const deepseek = new OpenAICompatibleTextProvider({
      providerId: "deepseek",
      label: "DeepSeek text",
      getConfig: () => {
        const c = getRuntime();
        return {
          apiKey: c.DEEPSEEK_API_KEY,
          baseUrl: c.DEEPSEEK_BASE_URL,
          modelId: c.DEEPSEEK_TEXT_MODEL,
          displayLabel: "DeepSeek",
        };
      },
      fetchImpl,
    });

    const bailianText = new OpenAICompatibleTextProvider({
      providerId: "bailian",
      label: "百炼 text",
      getConfig: () => {
        const c = getRuntime();
        return {
          apiKey: c.BAILIAN_API_KEY,
          baseUrl: c.BAILIAN_BASE_URL,
          modelId: c.BAILIAN_TEXT_MODEL,
          displayLabel: "百炼",
        };
      },
      fetchImpl,
    });

    const bailianMedia = new BailianMediaProvider({
      getConfig: () => {
        const c = getRuntime();
        return {
          apiKey: c.BAILIAN_API_KEY,
          mediaBaseUrl: c.BAILIAN_MEDIA_BASE_URL,
          imageModel: c.BAILIAN_IMAGE_MODEL,
          videoModel: c.BAILIAN_VIDEO_MODEL,
        };
      },
      fetchImpl,
    });

    this.providers.clear();
    this.providers.set("agnes", agnes);
    this.providers.set("apimart", apimart);
    this.providers.set("deepseek", deepseek);
    this.providers.set("bailian-text", bailianText);
    this.providers.set("bailian-media", bailianMedia);
    this.apimart = apimart;
    this.agnes = agnes;
  }

  refresh() {
    this.#rebuild();
  }

  get(providerId) {
    if (providerId === "bailian") {
      return {
        providerId: "bailian",
        models: () => [...this.providers.get("bailian-text").models(), ...this.providers.get("bailian-media").models()],
        validate: (request) => {
          if (request.capability === "text.generate") return this.providers.get("bailian-text").validate(request);
          return this.providers.get("bailian-media").validate(request);
        },
        submit: (request, options) => {
          if (request.capability === "text.generate") return this.providers.get("bailian-text").submit(request, options);
          return this.providers.get("bailian-media").submit(request, options);
        },
        query: (taskId, options) => {
          const text = this.providers.get("bailian-text");
          if (text.tasks.has(taskId)) return text.query(taskId, options);
          return this.providers.get("bailian-media").query(taskId, options);
        },
      };
    }
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`provider not found: ${providerId}`);
    return provider;
  }

  listModels() {
    const models = [];
    for (const provider of this.providers.values()) {
      if (provider.providerId === "bailian" || provider.providerId === "bailian-text" || provider.providerId === "bailian-media") {
        continue;
      }
      models.push(...provider.models());
    }
    models.push(...this.get("bailian").models());
    return models;
  }

  resolve(request) {
    const provider = this.get(request.providerId);
    const model = provider.models().find((candidate) => candidate.modelId === request.modelId);
    if (!model) throw new Error(`model not found: ${request.providerId}/${request.modelId}`);
    if (!model.capabilities.includes(request.capability)) {
      throw new Error(`${request.providerId}/${request.modelId} does not support ${request.capability}`);
    }
    const issues = provider.validate(request) || [];
    if (issues.length) {
      const error = new Error(issues.map((issue) => issue.message).join("; "));
      Object.assign(error, { code: "provider_validation", issues });
      throw error;
    }
    return { provider, model };
  }

  async availableApimartModels(strict = false) {
    try {
      return await this.apimart.discoverModels(strict);
    } catch (error) {
      const detail =
        error.message === "fetch failed"
          ? "无法连接 APIMart，请检查网络或代理设置"
          : sanitizeProviderMessage(error.message);
      throw Object.assign(
        new Error(
          `APIMart 模型拉取失败：${error.status === 402 ? "余额不足，请先在 APIMart 充值或确认额度。" : ""}${detail}`,
        ),
        { status: error.status || 502 },
      );
    }
  }

  enabledApimartModels(models) {
    const settings = this.getProviderSettings();
    if (!Object.hasOwn(settings, "APIMART_ENABLED_MODELS")) return models;
    const enabled = new Set(String(settings.APIMART_ENABLED_MODELS || "").split(",").map((id) => id.trim()).filter(Boolean));
    return models.filter((model) => enabled.has(model.modelId));
  }

  apimartSettingsPayload(models) {
    const enabled = this.enabledApimartModels(models);
    return { apimartModels: models, enabledApimartModelIds: enabled.map((model) => model.modelId) };
  }
}
