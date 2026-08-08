import type { GenerationRequest, MediaProvider, ProviderGenerationRequest, ProviderModel, ProviderTaskResult, ProviderValidationIssue } from "@libtv/shared";

/** API adapter shell. Product code only sees capability/model metadata; official endpoint mapping stays here. */
export class VolcengineProvider implements MediaProvider {
  readonly providerId = "volcengine";

  models(): ProviderModel[] {
    const imageModel = process.env.VOLCENGINE_IMAGE_MODEL || "seedream-configure-me";
    const videoModel = process.env.VOLCENGINE_VIDEO_MODEL || "seedance-configure-me";
    return [
      {
        providerId: this.providerId,
        modelId: imageModel,
        displayName: "Seedream (configure model ID)",
        capabilities: ["image.generate", "image.edit", "image.reference"],
        constraints: { aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
      },
      {
        providerId: this.providerId,
        modelId: videoModel,
        displayName: "Seedance (configure model ID)",
        capabilities: ["video.generate", "video.image_to_video", "video.first_last_frame", "video.reference", "video.extend"],
        constraints: { maxImageRefs: 9, maxVideoRefs: 3, maxAudioRefs: 3, supportsFirstLastFrame: true },
        defaults: { aspectRatio: "16:9" },
      },
    ];
  }

  validate(_request: GenerationRequest): ProviderValidationIssue[] { return []; }

  async submit(_request: ProviderGenerationRequest): Promise<ProviderTaskResult> {
    throw new Error("Volcengine adapter shell is not wired yet. Add official API request/response mapping in this provider only.");
  }

  async query(_taskId: string): Promise<ProviderTaskResult> {
    throw new Error("Volcengine adapter shell is not wired yet.");
  }
}
