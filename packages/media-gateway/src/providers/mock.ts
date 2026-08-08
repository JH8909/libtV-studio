import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  GenerationRequest,
  MediaProvider,
  ProviderGenerationRequest,
  ProviderModel,
  ProviderTaskResult,
  ProviderValidationIssue,
} from "@libtv/shared";

const tasks = new Map<string, { media: "image" | "video"; polls: number }>();

export class MockProvider implements MediaProvider {
  readonly providerId = "mock";

  models(): ProviderModel[] {
    return [
      {
        providerId: this.providerId,
        modelId: "mock-image-v1",
        displayName: "Mock Image",
        capabilities: ["image.generate", "image.edit", "image.reference"],
        constraints: { aspectRatios: ["1:1", "16:9", "9:16"] },
        defaults: { aspectRatio: "16:9" },
      },
      {
        providerId: this.providerId,
        modelId: "mock-video-v1",
        displayName: "Mock Video",
        capabilities: ["video.generate", "video.image_to_video", "video.first_last_frame", "video.reference"],
        constraints: {
          durations: [2, 5, 10],
          aspectRatios: ["16:9", "9:16", "1:1"],
          resolutions: ["720p", "1080p"],
          maxImageRefs: 9,
          maxVideoRefs: 3,
          maxAudioRefs: 3,
          supportsFirstLastFrame: true,
        },
        defaults: { duration: 5, aspectRatio: "16:9", resolution: "720p" },
      },
    ];
  }

  validate(_request: GenerationRequest): ProviderValidationIssue[] {
    return [];
  }

  async submit(request: ProviderGenerationRequest): Promise<ProviderTaskResult> {
    const media = request.capability.startsWith("image.") ? "image" : "video";
    const taskId = `mock:${media}:${randomUUID()}`;
    tasks.set(taskId, { media, polls: 0 });
    return { taskId, status: "queued", progress: 5 };
  }

  async query(taskId: string): Promise<ProviderTaskResult> {
    const task = tasks.get(taskId);
    if (!task) return { taskId, status: "failed", error: "mock task not found" };
    task.polls += 1;
    if (task.polls < 2) return { taskId, status: "processing", progress: 55 };
    const fixtureDir = path.resolve(process.env.MOCK_FIXTURE_DIR ?? path.join(process.cwd(), "../../fixtures"));
    tasks.delete(taskId);
    if (task.media === "image") {
      return {
        taskId,
        status: "succeeded",
        progress: 100,
        outputs: [{
          kind: "image",
          mime: "image/svg+xml",
          filename: "mock-image.svg",
          source: { type: "file", path: path.join(fixtureDir, "mock-image.svg") },
          metadata: { width: 1280, height: 720, mock: true },
        }],
      };
    }
    return {
      taskId,
      status: "succeeded",
      progress: 100,
      outputs: [{
        kind: "video",
        mime: "video/mp4",
        filename: "mock-video.mp4",
        source: { type: "file", path: path.join(fixtureDir, "mock-video.mp4") },
        metadata: { width: 1280, height: 720, durationMs: 2000, mock: true },
      }],
    };
  }

  async cancel(taskId: string): Promise<void> {
    tasks.delete(taskId);
  }
}
