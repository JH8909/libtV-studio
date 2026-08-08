"use client";

import { StudioCanvas, useStudioFlow } from "@libtv/canvas";
import { TimelinePanel, useTimeline } from "@libtv/editor";
import type { ApiAsset, TimelineItemSnapshot } from "@libtv/shared";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

async function createProject(): Promise<string> {
  const response = await fetch(`${API}/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "My AI Film" }) });
  if (!response.ok) throw new Error(`project creation failed: ${response.status}`);
  return (await response.json() as { id: string }).id;
}

export function StudioShell() {
  const [projectId, setProjectId] = useState<string>();
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [error, setError] = useState<string>();
  const [timelineOpen, setTimelineOpen] = useState(true);

  const refreshAssets = async (id = projectId) => {
    if (!id) return;
    const response = await fetch(`${API}/projects/${id}/assets`);
    if (!response.ok) throw new Error(`asset request failed: ${response.status}`);
    setAssets((await response.json() as { assets: ApiAsset[] }).assets);
  };

  useEffect(() => {
    const previous = localStorage.getItem("libtv.projectId");
    (previous ? Promise.resolve(previous) : createProject()).then((id) => {
      localStorage.setItem("libtv.projectId", id);
      setProjectId(id);
      return refreshAssets(id);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <main style={{ padding: 32 }}><h2>Studio failed to start</h2><p>{error}</p><button onClick={() => { localStorage.removeItem("libtv.projectId"); location.reload(); }}>Create a new local project</button></main>;
  if (!projectId) return <main style={{ padding: 32 }}>Creating project…</main>;

  const placeOnTimeline = (asset: ApiAsset) => useTimeline.getState().addAsset(asset);
  const useAsReference = (asset: ApiAsset, item?: TimelineItemSnapshot) => {
    const assetNodeId = useStudioFlow.getState().addAssetNode(asset, { x: 240 + Math.random() * 180, y: 420 + Math.random() * 100 });
    const capability = asset.kind === "image" ? "video.image_to_video" : "video.reference";
    const generationNode = useStudioFlow.getState().addGenerationNode(capability, { x: 650 + Math.random() * 100, y: 430 });
    if (item) {
      useStudioFlow.getState().patchNode(generationNode, { explicitReferences: [{
        assetId: asset.id,
        role: asset.kind === "video" ? "source-video" : asset.kind === "audio" ? "reference-audio" : "first-frame",
        timelineItemId: item.id,
        sourceInFrame: 0,
        sourceOutFrame: item.durationInFrames,
      }] });
    } else {
      useStudioFlow.getState().onConnect({ source: assetNodeId, target: generationNode, sourceHandle: null, targetHandle: null });
    }
  };

  return <div style={{ height: "100vh", display: "grid", gridTemplateRows: `52px 1fr ${timelineOpen ? "260px" : "0px"}`, overflow: "hidden" }}>
    <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderBottom: "1px solid #252a33", background: "#111318" }}>
      <strong>LibTV Studio</strong><span style={{ fontSize: 11, opacity: .45 }}>API-first · Project {projectId.slice(0, 8)}</span><span style={{ flex: 1 }} />
      <button onClick={() => refreshAssets()}>Refresh assets</button><button onClick={() => setTimelineOpen((x) => !x)}>{timelineOpen ? "Hide" : "Show"} timeline</button>
    </header>
    <section style={{ minHeight: 0, display: "grid", gridTemplateColumns: "210px 1fr" }}>
      <aside style={{ overflow: "auto", padding: 10, background: "#0f1116", borderRight: "1px solid #252a33" }}>
        <div style={{ fontSize: 11, fontWeight: 800, margin: "4px 4px 10px" }}>ASSET LIBRARY</div>
        <div style={{ display: "grid", gap: 8 }}>
          {assets.map((asset) => <div key={asset.id} style={{ border: "1px solid #2c323c", borderRadius: 9, padding: 7, background: "#15181e" }}>
            {asset.kind === "image" && <img src={asset.publicUrl} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} />}
            {asset.kind === "video" && <video src={asset.publicUrl} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} />}
            <div style={{ fontSize: 11, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.filename || asset.id}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 6 }}><button onClick={() => useAsReference(asset)} style={{ fontSize: 10, padding: "4px 6px" }}>Canvas</button>{asset.kind !== "document" && <button onClick={() => placeOnTimeline(asset)} style={{ fontSize: 10, padding: "4px 6px" }}>Timeline</button>}</div>
          </div>)}
          {!assets.length && <div style={{ fontSize: 12, opacity: .5 }}>Generate something on the canvas. Completed outputs appear here.</div>}
        </div>
      </aside>
      <main style={{ minWidth: 0, minHeight: 0 }}><StudioCanvas apiBase={API} projectId={projectId} onAssetProduced={() => refreshAssets()} /></main>
    </section>
    {timelineOpen && <section style={{ minHeight: 0 }}><TimelinePanel apiBase={API} projectId={projectId} assets={assets} onUseAsReference={useAsReference} /></section>}
  </div>;
}
