const api = process.env.SMOKE_API_BASE ?? "http://localhost:3001";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function waitFor(id: string) {
  for (let i = 0; i < 30; i += 1) {
    const job = await json<any>(`${api}/generations/${id}`);
    console.log(id, job.status);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(job.error || "generation failed");
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("smoke timeout");
}

const project = await json<{ id: string }>(`${api}/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Smoke Project" }),
});
console.log("project", project.id);

const image = await json<{ id: string }>(`${api}/generations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: project.id,
    capability: "image.generate",
    providerId: "mock",
    modelId: "mock-image-v1",
    prompt: "cinematic product shot",
    references: [],
    params: { aspectRatio: "16:9" },
  }),
});
const imageDone = await waitFor(image.id);
console.log("image output", imageDone.outputs?.[0]);

const video = await json<{ id: string }>(`${api}/generations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: project.id,
    capability: "video.image_to_video",
    providerId: "mock",
    modelId: "mock-video-v1",
    prompt: "slow dolly in",
    references: imageDone.outputs?.[0]?.id ? [{ role: "first-frame", assetId: imageDone.outputs[0].id }] : [],
    params: { duration: 5, aspectRatio: "16:9" },
  }),
});
const videoDone = await waitFor(video.id);
console.log("video output", videoDone.outputs?.[0]);
console.log("SMOKE OK");

export {};
