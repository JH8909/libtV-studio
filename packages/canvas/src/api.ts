import type { ApiAsset, GenerationReference, GenerationRequest, GenerationView, ProviderModel } from "@libtv/shared";

export async function getModels(apiBase: string): Promise<ProviderModel[]> {
  const response = await fetch(`${apiBase}/models`);
  if (!response.ok) throw new Error(`models request failed: ${response.status}`);
  return (await response.json() as { models: ProviderModel[] }).models;
}

export async function getWorkflow(apiBase: string, projectId: string) {
  const response = await fetch(`${apiBase}/projects/${projectId}/workflow`);
  if (!response.ok) throw new Error(`workflow request failed: ${response.status}`);
  return response.json() as Promise<{ version: number; nodes: unknown[]; edges: unknown[] }>;
}

export async function saveWorkflow(apiBase: string, projectId: string, body: { version: number; nodes: unknown[]; edges: unknown[] }) {
  const response = await fetch(`${apiBase}/projects/${projectId}/workflow`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`workflow save failed: ${response.status}`);
}

export async function submitGeneration(apiBase: string, request: GenerationRequest): Promise<{ id: string }> {
  const response = await fetch(`${apiBase}/generations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string; issues?: Array<{ message?: string }> };
  if (!response.ok || !body.id) throw new Error(body.issues?.map((x) => x.message).filter(Boolean).join("; ") || body.message || `generation failed: ${response.status}`);
  return { id: body.id };
}

export function watchGeneration(apiBase: string, jobId: string, onUpdate: (view: GenerationView) => void, onError: (error: Error) => void): () => void {
  const source = new EventSource(`${apiBase}/generations/${jobId}/events`);
  source.addEventListener("generation", (event) => {
    const view = JSON.parse((event as MessageEvent).data) as GenerationView;
    onUpdate(view);
    if (["succeeded", "failed", "canceled"].includes(view.status)) source.close();
  });
  source.onerror = () => { source.close(); onError(new Error("generation event stream disconnected")); };
  return () => source.close();
}

export function refsFromAssets(assets: ApiAsset[], capability: string): GenerationReference[] {
  if (!assets.length) return [];
  if (capability === "video.image_to_video" || capability === "video.first_last_frame") {
    const images = assets.filter((asset) => asset.kind === "image");
    return images.slice(0, 2).map((asset, index) => ({ assetId: asset.id, role: index === 0 ? "first-frame" : "last-frame" }));
  }
  return assets.map((asset) => ({
    assetId: asset.id,
    role: asset.kind === "image" ? "reference-image" : asset.kind === "video" ? "reference-video" : asset.kind === "audio" ? "reference-audio" : "reference-image",
  }));
}
