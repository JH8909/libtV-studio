"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiAsset, TimelineItemSnapshot, TimelineSnapshot } from "@libtv/shared";
import { TRACKS } from "./domain";
import { useTimeline } from "./store";

export interface TimelinePanelProps {
  apiBase: string;
  projectId: string;
  assets: ApiAsset[];
  onUseAsReference?: (asset: ApiAsset, item: TimelineItemSnapshot) => void;
}

export function TimelinePanel({ apiBase, projectId, assets, onUseAsReference }: TimelinePanelProps) {
  const timeline = useTimeline();
  const [saveState, setSaveState] = useState("loading");
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  useEffect(() => {
    fetch(`${apiBase}/projects/${projectId}/timeline`).then(async (response) => {
      if (!response.ok) throw new Error(`timeline load failed: ${response.status}`);
      const body = await response.json() as TimelineSnapshot;
      useTimeline.getState().hydrate(body);
      setSaveState("saved");
    }).catch((error) => setSaveState(error instanceof Error ? error.message : String(error)));
  }, [apiBase, projectId]);

  useEffect(() => {
    if (!timeline.hydrated) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      fetch(`${apiBase}/projects/${projectId}/timeline`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fps: timeline.fps, width: timeline.width, height: timeline.height, items: timeline.items }) })
        .then((response) => { if (!response.ok) throw new Error(`timeline save failed: ${response.status}`); setSaveState("saved"); })
        .catch((error) => setSaveState(error instanceof Error ? error.message : String(error)));
    }, 700);
    return () => clearTimeout(timer);
  }, [apiBase, projectId, timeline.hydrated, timeline.fps, timeline.width, timeline.height, timeline.items]);

  const duration = Math.max(timeline.fps * 10, ...timeline.items.map((item) => item.startFrame + item.durationInFrames));
  const selected = timeline.items.find((item) => item.id === timeline.selectedItemId);
  const selectedAsset = selected?.sourceAssetId ? assetsById.get(selected.sourceAssetId) : undefined;

  return <div style={{ height: "100%", display: "grid", gridTemplateRows: "40px 1fr", background: "#101217", color: "#e8ebef", borderTop: "1px solid #2c313b" }}>
    <div style={{ display: "flex", alignItems: "center", padding: "0 12px", gap: 10, borderBottom: "1px solid #252a33" }}>
      <strong style={{ fontSize: 12 }}>TIMELINE</strong><span style={{ fontSize: 11, opacity: .55 }}>{timeline.fps} fps · {saveState}</span><span style={{ flex: 1 }} />
      {selectedAsset && selected && <button onClick={() => onUseAsReference?.(selectedAsset, selected)}>Use clip as AI reference</button>}
      {selected && <button onClick={() => useTimeline.getState().removeItem(selected.id)}>Remove</button>}
    </div>
    <div style={{ overflow: "auto", padding: "10px 12px" }}>
      {TRACKS.map((trackId) => <div key={trackId} style={{ display: "grid", gridTemplateColumns: "44px 1fr", minHeight: 48, borderBottom: "1px solid #1f242c" }}>
        <div style={{ fontSize: 11, opacity: .55, paddingTop: 15 }}>{trackId}</div>
        <div style={{ position: "relative", minWidth: 760, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: `${Math.max(30, 120 * timeline.fps / duration)}px 100%` }}>
          {timeline.items.filter((item) => item.trackId === trackId).map((item) => {
            const left = `${item.startFrame / duration * 100}%`;
            const width = `${Math.max(2, item.durationInFrames / duration * 100)}%`;
            const active = timeline.selectedItemId === item.id;
            return <button key={item.id} onClick={() => useTimeline.getState().setSelected(item.id)} title={item.name} style={{ position: "absolute", left, width, top: 7, height: 34, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", padding: "0 8px", borderRadius: 6, border: active ? "1px solid #fff" : "1px solid #454d5b", background: active ? "#3c4656" : "#252b35", color: "inherit", fontSize: 11 }}>{item.name}</button>;
          })}
        </div>
      </div>)}
    </div>
  </div>;
}
