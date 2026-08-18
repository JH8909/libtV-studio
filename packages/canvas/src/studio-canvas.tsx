"use client";

import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Edge } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiAsset, Capability, ProviderModel } from "@libtv/shared";
import { getAssets, getModels, getWorkflow, saveWorkflow } from "./api";
import { AssetNode, GenerationNode, PromptNode } from "./nodes";
import { CanvasRuntimeProvider } from "./runtime";
import { useStudioFlow } from "./store";
import type { StudioNode } from "./types";

export interface StudioCanvasProps {
  apiBase: string;
  projectId: string;
  onAssetProduced?: (assets: ApiAsset[]) => void;
  refreshKey?: number;
}

function Inner({ apiBase, projectId, onAssetProduced, refreshKey = 0 }: StudioCanvasProps) {
  const nodes = useStudioFlow((state) => state.nodes);
  const edges = useStudioFlow((state) => state.edges);
  const hydrated = useStudioFlow((state) => state.hydrated);
  const onNodesChange = useStudioFlow((state) => state.onNodesChange);
  const onEdgesChange = useStudioFlow((state) => state.onEdgesChange);
  const onConnect = useStudioFlow((state) => state.onConnect);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [saveState, setSaveState] = useState("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const versionRef = useRef(1);
  const savedGraphRef = useRef("");
  const nodeTypes = useMemo(() => ({
    prompt: PromptNode,
    textGen: GenerationNode,
    generation: GenerationNode,
    imageGen: GenerationNode,
    videoGen: GenerationNode,
    asset: AssetNode,
    image: AssetNode,
    video: AssetNode,
    upload: AssetNode,
  }), []);

  useEffect(() => {
    let cancelled = false;
    useStudioFlow.getState().setHydrated(false);
    Promise.all([getModels(apiBase), getWorkflow(apiBase, projectId), getAssets(apiBase, projectId)]).then(([nextModels, workflow, nextAssets]) => {
      if (cancelled) return;
      setModels(nextModels);
      setAssets(nextAssets);
      useStudioFlow.getState().setGraph(workflow.nodes as StudioNode[], workflow.edges as Edge[]);
      if (!workflow.nodes.length) useStudioFlow.getState().seedStarterGraph();
      versionRef.current = workflow.version;
      const graph = useStudioFlow.getState();
      savedGraphRef.current = JSON.stringify({ nodes: graph.nodes, edges: graph.edges });
      useStudioFlow.getState().setHydrated(true);
      setSaveState("saved");
    }).catch((error) => setSaveState(error instanceof Error ? error.message : String(error)));
    return () => { cancelled = true; };
  }, [apiBase, projectId, refreshKey, reloadKey]);

  useEffect(() => {
    if (!hydrated) return;
    const graph = JSON.stringify({ nodes, edges });
    if (graph === savedGraphRef.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveWorkflow(apiBase, projectId, { version: versionRef.current, nodes, edges }).then((saved) => {
        versionRef.current = saved.version;
        savedGraphRef.current = graph;
        setSaveState("saved");
      }).catch((error: Error & { status?: number }) => {
        setSaveState(error.status === 409 ? "changed by Agent — reloading" : error.message);
        if (error.status === 409) setReloadKey((value) => value + 1);
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [apiBase, projectId, hydrated, nodes, edges]);

  const add = (capability: Capability) => useStudioFlow.getState().addGenerationNode(capability, { x: 420 + Math.random() * 100, y: 180 + Math.random() * 140 });
  const handleAssetProduced = (produced: ApiAsset[]) => {
    setAssets((current) => [...produced, ...current.filter((asset) => !produced.some((next) => next.id === asset.id))]);
    onAssetProduced?.(produced);
  };
  return <CanvasRuntimeProvider value={{ apiBase, projectId, models, assets, onAssetProduced: handleAssetProduced }}>
    <div style={{ height: "100%", width: "100%", position: "relative", background: "#0b0d11" }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5, display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button onClick={() => useStudioFlow.getState().addPromptNode()}>+ Prompt</button>
        <button onClick={() => add("image.generate")}>+ Image</button>
        <button onClick={() => add("video.image_to_video")}>+ Video</button>
        <span style={{ color: "#9aa1ad", fontSize: 12, alignSelf: "center", marginLeft: 8 }}>{saveState}</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
        void fetch(`${apiBase}/projects/${projectId}/canvas/selection`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeIds: selectedNodes.map((node) => node.id), edgeIds: selectedEdges.map((edge) => edge.id) }) }).catch(() => undefined);
      }} fitView minZoom={0.15} maxZoom={2.2} deleteKeyCode={["Backspace", "Delete"]}>
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
