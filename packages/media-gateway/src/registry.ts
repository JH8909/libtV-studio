import type { GenerationRequest, MediaProvider, ProviderModel } from "@libtv/shared";
import { validateModelConstraints } from "./model-validation";

export class ProviderRegistry {
  private readonly providers = new Map<string, MediaProvider>();

  register(provider: MediaProvider): this {
    if (this.providers.has(provider.providerId)) throw new Error(`provider already registered: ${provider.providerId}`);
    this.providers.set(provider.providerId, provider);
    return this;
  }

  get(providerId: string): MediaProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`provider not found: ${providerId}`);
    return provider;
  }

  listModels(): ProviderModel[] {
    return [...this.providers.values()].flatMap((provider) => provider.models());
  }

  resolve(request: GenerationRequest): { provider: MediaProvider; model: ProviderModel } {
    const provider = this.get(request.providerId);
    const model = provider.models().find((candidate) => candidate.modelId === request.modelId);
    if (!model) throw new Error(`model not found: ${request.providerId}/${request.modelId}`);
    if (!model.capabilities.includes(request.capability)) throw new Error(`${request.providerId}/${request.modelId} does not support ${request.capability}`);
    const issues = [...validateModelConstraints(model, request), ...provider.validate(request)];
    if (issues.length) {
      const error = new Error(issues.map((issue) => issue.message).join("; "));
      Object.assign(error, { code: "provider_validation", issues });
      throw error;
    }
    return { provider, model };
  }
}
