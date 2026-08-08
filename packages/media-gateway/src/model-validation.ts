import type { GenerationRequest, ProviderModel, ProviderValidationIssue } from "@libtv/shared";

export function validateModelConstraints(model: ProviderModel, request: GenerationRequest): ProviderValidationIssue[] {
  const constraints = model.constraints;
  if (!constraints) return [];
  const issues: ProviderValidationIssue[] = [];
  const count = (role: string) => request.references.filter((ref) => ref.role === role).length;
  const imageRefs = count("reference-image") + count("first-frame") + count("last-frame");
  const videoRefs = count("reference-video") + count("source-video");
  const audioRefs = count("reference-audio");

  if (constraints.maxImageRefs !== undefined && imageRefs > constraints.maxImageRefs) {
    issues.push({ code: "image_reference_limit", field: "references", message: `Maximum ${constraints.maxImageRefs} image references for ${model.displayName}` });
  }
  if (constraints.maxVideoRefs !== undefined && videoRefs > constraints.maxVideoRefs) {
    issues.push({ code: "video_reference_limit", field: "references", message: `Maximum ${constraints.maxVideoRefs} video references for ${model.displayName}` });
  }
  if (constraints.maxAudioRefs !== undefined && audioRefs > constraints.maxAudioRefs) {
    issues.push({ code: "audio_reference_limit", field: "references", message: `Maximum ${constraints.maxAudioRefs} audio references for ${model.displayName}` });
  }
  if (count("last-frame") > 0 && count("first-frame") === 0) {
    issues.push({ code: "last_frame_requires_first", field: "references", message: "A last frame requires a first frame" });
  }
  if (count("last-frame") > 0 && constraints.supportsFirstLastFrame === false) {
    issues.push({ code: "first_last_frame_unsupported", field: "references", message: `${model.displayName} does not support first/last frame generation` });
  }
  if (count("source-video") > 0 && constraints.supportsSourceVideo === false) {
    issues.push({ code: "source_video_unsupported", field: "references", message: `${model.displayName} does not support source-video editing` });
  }

  const duration = request.params.duration;
  if (typeof duration === "number" && constraints.durations?.length && !constraints.durations.includes(duration)) {
    issues.push({ code: "duration_unsupported", field: "params.duration", message: `Duration ${duration}s is not supported by ${model.displayName}` });
  }
  const aspectRatio = request.params.aspectRatio;
  if (typeof aspectRatio === "string" && constraints.aspectRatios?.length && !constraints.aspectRatios.includes(aspectRatio)) {
    issues.push({ code: "aspect_ratio_unsupported", field: "params.aspectRatio", message: `Aspect ratio ${aspectRatio} is not supported by ${model.displayName}` });
  }
  const resolution = request.params.resolution;
  if (typeof resolution === "string" && constraints.resolutions?.length && !constraints.resolutions.includes(resolution)) {
    issues.push({ code: "resolution_unsupported", field: "params.resolution", message: `Resolution ${resolution} is not supported by ${model.displayName}` });
  }
  return issues;
}
