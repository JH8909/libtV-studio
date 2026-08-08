import type { GenerationRequest, MediaProvider, ProviderGenerationRequest, ProviderModel, ProviderTaskResult, ProviderValidationIssue } from "@libtv/shared";

/** API adapter shell. Provider-specific auth and request mapping are isolated here. */
export class KlingProvider implements MediaProvider {
  readonly providerId = "kling";

  models(): ProviderModel[] {
    return [{
      providerId: this.providerId,
      modelId: process.env.KLING_VIDEO_MODEL || "kling-video-configure-me",
      displayName: "Kling Video (configure model ID)",
      capabilities: ["video.generate", "video.image_to_video", "video.first_last_frame", "video.reference", "video.extend"],
      constraints: { maxVideoRefs: 1, maxAudioRefs: 0, supportsFirstLastFrame: true },
      defaults: { aspectRatio: "16:9" },
    }];
  }

  validate(request: GenerationRequest): ProviderValidationIssue[] {
    const videoRefs = request.references.filter((ref) => ref.role === "reference-video" || ref.role === "source-video").length;
    const imageRefs = request.references.filter((ref) => ref.role === "reference-image" || ref.role.includes("frame")).length;
    const limit = videoRefs ? 4 : 7;
    return imageRefs > limit ? [{ code: "image_reference_limit", field: "references", message: `Kling adapter policy: maximum ${limit} image references for this request` }] : [];
  }

  async submit(_request: ProviderGenerationRequest): Promise<ProviderTaskResult> {
    throw new Error("Kling adapter shell is not wired yet. Add official API request/response mapping in this provider only.");
  }

  async query(_taskId: string): Promise<ProviderTaskResult> {
    throw new Error("Kling adapter shell is not wired yet.");
  }
}
