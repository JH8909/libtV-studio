"use client";

import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { ApiAsset, Capability, ProviderModel } from "@libtv/shared";
import { getModels, getWorkflow, saveWorkflow } from "./api";
import { AssetNode, GenerationNode, PromptNode } from "./nodes";
import { CanvasRuntimeProvider } from "./runtime";
import { useStudioFlow } from "./store";
import type { StudioNode } from "./types";

export interface StudioCanvasProps {
  apiBase: string;
  projectId: string;
  onAssetProduced?: (assets: ApiAsset[]) => void;
}

function Inner({ apiBase, projectId, onAssetProduced }: StudioCanvasProps) {
  const nodes = useStudioFlow((state) => state.nodes);
  const edges = useStudioFlow((state) => state.edges);
  const hydrated = useStudioFlow((state) => state.hydrated);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [saveState, setSaveState] = useState("loading");
  const nodeTypes = useMemo(() => ({ prompt: PromptNode, generation: GenerationNode, asset: AssetNode }), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getModels(apiBase), getWorkflow(apiBase, projectId)]).then(([nextModels, workflow]) => {
      if (cancelled) return;
      setModels(nextModels);
      useStudioFlow.getState().setGraph(workflow.nodes as StudioNode[], workflow.edges as Edge[]);
      if (!workflow.nodes.length) useStudioFlow.getState().seedStarterGraph();
      useStudioFlow.getState().setHydrated(true);
      setSaveState("saved");
    }).catch((error) => setSaveState(error instanceof Error ? error.message : String(error)));
    return () => { cancelled = true; };
  }, [apiBase, projectId]);

  useEffect(() => {
    if (!hydrated) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveWorkflow(apiBase, projectId, { version: 1, nodes, edges }).then(() => setSaveState("saved")).catch((error) => setSaveState(error instanceof Error ? error.message : "save failed"));
    }, 700);
    return () => clearTimeout(timer);
  }, [apiBase, projectId, hydrated, nodes, edges]);

  const add = (capability: Capability) => useStudioFlow.getState().addGenerationNode(capability, { x: 420 + Math.random() * 100, y: 180 + Math.random() * 140 });
  return <CanvasRuntimeProvider value={{ apiBase, projectId, models, onAssetProduced }}>
    <div style={{ height: "100%", width: "100%", position: "relative", background: "#0b0d11" }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5, display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button onClick={() => useStudioFlow.getState().addPromptNode()}>+ Prompt</button>
        <button onClick={() => add("image.generate")}>+ Image</button>
        <button onClick={() => add("video.image_to_video")}>+ Video</button>
        <span style={{ color: "#9aa1ad", fontSize: 12, alignSelf: "center", marginLeft: 8 }}>{saveState}</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={useStudioFlow.getState().onNodesChange} onEdgesChange={useStudioFlow.getState().onEdgesChange} onConnect={useStudioFlow.getState().onConnect} fitView minZoom={0.15} maxZoom={2.2} deleteKeyCode={["Backspace", "Delete"]}>
        <Background gap={24} size={1} color="#262b35" />
        <Controls />
        <MiniMap pannable zoomable nodeColor="#606a7a" maskColor="rgba(0,0,0,.5)" />
      </ReactFlow>
    </div>
  </CanvasRuntimeProvider>;
}

export function StudioCanvas(props: StudioCanvasProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
