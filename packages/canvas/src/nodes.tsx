"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMemo, useState, type CSSProperties } from "react";
import type { ApiAsset, GenerationRequest } from "@libtv/shared";
import { refsFromAssets, submitGeneration, watchGeneration } from "./api";
import { useCanvasRuntime } from "./runtime";
import { useStudioFlow } from "./store";
import type { StudioNode } from "./types";

const box: CSSProperties = { minWidth: 260, maxWidth: 320, border: "1px solid #2e3440", borderRadius: 14, background: "#111318", color: "#f4f5f7", boxShadow: "0 10px 30px rgba(0,0,0,.22)" };
const header: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #292d35", fontSize: 12, fontWeight: 700, letterSpacing: ".04em" };
const body: CSSProperties = { padding: 12, display: "grid", gap: 9 };

export function PromptNode({ id, data }: NodeProps<StudioNode>) {
  const patch = useStudioFlow((state) => state.patchNode);
  return <div style={box}>
    <div style={header}>PROMPT</div>
    <div style={body}><textarea className="nodrag" value={String(data.prompt ?? "")} onChange={(event) => patch(id, { prompt: event.target.value })} rows={5} style={{ resize: "vertical", width: "100%", boxSizing: "border-box", borderRadius: 8, padding: 9, background: "#191c22", border: "1px solid #303640", color: "inherit" }} /></div>
    <Handle type="source" position={Position.Right} />
  </div>;
}

function incomingContext(nodeId: string): { prompt?: string; assets: ApiAsset[] } {
  const { nodes, edges } = useStudioFlow.getState();
  const sources = edges.filter((edge) => edge.target === nodeId).map((edge) => nodes.find((node) => node.id === edge.source)).filter(Boolean) as StudioNode[];
  const prompts = sources.filter((node) => node.data.kind === "prompt").map((node) => String(node.data.prompt ?? "")).filter(Boolean);
  const assets: ApiAsset[] = [];
  for (const source of sources) {
    if (source.data.asset) assets.push(source.data.asset);
    if (source.data.outputs) assets.push(...source.data.outputs);
  }
  return { prompt: prompts.at(-1), assets };
}

export function GenerationNode({ id, data, type }: NodeProps<StudioNode>) {
  const runtime = useCanvasRuntime();
  const patch = useStudioFlow((state) => state.patchNode);
  const [running, setRunning] = useState(false);
  const capability = data.capability ?? data.forcedCapability ?? (type === "videoGen" ? "video.generate" : type === "textGen" ? "text.generate" : "image.generate");
  const models = useMemo(() => runtime.models.filter((model) => model.capabilities.includes(capability)), [runtime.models, capability]);
  const [storedProviderId, storedModelId] = String(data.modelKey || "").split("::");
  const selected = models.find((model) => model.providerId === (data.providerId || storedProviderId) && model.modelId === (data.modelId || storedModelId)) ?? models[0];

  const run = async () => {
    if (!selected) return patch(id, { error: `No model supports ${capability}` });
    setRunning(true);
    const context = incomingContext(id);
    const request: GenerationRequest = {
      projectId: runtime.projectId,
      capability,
      providerId: selected.providerId,
      modelId: selected.modelId,
      prompt: String(data.prompt || context.prompt || ""),
      references: [...refsFromAssets(context.assets, capability), ...(data.explicitReferences ?? [])],
      params: { ...(selected.defaults ?? {}), ...(data.params ?? {}) },
    };
    try {
      patch(id, { providerId: selected.providerId, modelId: selected.modelId, status: "queued", progress: 0, error: undefined, outputs: [] });
      const { id: jobId } = await submitGeneration(runtime.apiBase, request);
      patch(id, { jobId });
      watchGeneration(runtime.apiBase, jobId, (view) => {
        patch(id, { status: view.status, progress: view.progress ?? 0, error: view.error ?? undefined, outputs: view.outputs });
        if (view.status === "succeeded") { setRunning(false); runtime.onAssetProduced?.(view.outputs); }
        if (view.status === "failed" || view.status === "canceled") setRunning(false);
      }, (error) => { setRunning(false); patch(id, { status: "failed", error: error.message }); });
    } catch (error) {
      setRunning(false);
      patch(id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };

  const output = data.outputs?.[0] ?? runtime.assets.find((asset) => data.outputAssetIds?.includes(asset.id));
  return <div style={box}>
    <Handle type="target" position={Position.Left} />
    <div style={header}>{String(data.title ?? capability).toUpperCase()}</div>
    <div style={body}>
      <select className="nodrag" value={selected ? `${selected.providerId}::${selected.modelId}` : ""} onChange={(event) => { const [providerId, modelId] = event.target.value.split("::"); patch(id, { providerId, modelId, modelKey: event.target.value }); }} style={{ padding: 8, borderRadius: 8, background: "#191c22", color: "inherit", border: "1px solid #303640" }}>
        {models.map((model) => <option key={`${model.providerId}/${model.modelId}`} value={`${model.providerId}::${model.modelId}`}>{model.displayName}</option>)}
      </select>
      <textarea className="nodrag" placeholder="Optional node-specific prompt; empty = use connected Prompt" value={String(data.prompt ?? "")} onChange={(event) => patch(id, { prompt: event.target.value })} rows={3} style={{ resize: "vertical", width: "100%", boxSizing: "border-box", borderRadius: 8, padding: 9, background: "#191c22", border: "1px solid #303640", color: "inherit" }} />
      {output?.kind === "image" && <img src={output.publicUrl} alt="generated" style={{ width: "100%", borderRadius: 8, maxHeight: 180, objectFit: "cover" }} />}
      {output?.kind === "video" && <video src={output.publicUrl} controls className="nodrag" style={{ width: "100%", borderRadius: 8, maxHeight: 180 }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><button className="nodrag" onClick={run} disabled={running || !selected} style={{ padding: "8px 12px", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>{running ? "Running…" : "Generate"}</button><span style={{ fontSize: 12, opacity: .72 }}>{data.status ?? "idle"}{typeof data.progress === "number" ? ` · ${data.progress}%` : ""}</span></div>
      {data.error && <div style={{ fontSize: 12, color: "#ff8a8a" }}>{data.error}</div>}
    </div>
    <Handle type="source" position={Position.Right} />
  </div>;
}

export function AssetNode({ data }: NodeProps<StudioNode>) {
  const runtime = useCanvasRuntime();
  const asset = data.asset ?? runtime.assets.find((candidate) => candidate.id === data.assetId);
  return <div style={{ ...box, minWidth: 220 }}>
    <div style={header}>ASSET · {asset?.kind?.toUpperCase()}</div>
    <div style={body}>
      {asset?.kind === "image" && <img src={asset.publicUrl} alt={asset.filename ?? "asset"} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8 }} />}
      {asset?.kind === "video" && <video src={asset.publicUrl} controls className="nodrag" style={{ width: "100%", maxHeight: 180, borderRadius: 8 }} />}
      <div style={{ fontSize: 12, opacity: .8, overflow: "hidden", textOverflow: "ellipsis" }}>{asset?.filename ?? asset?.id}</div>
    </div>
    <Handle type="source" position={Position.Right} />
  </div>;
}
