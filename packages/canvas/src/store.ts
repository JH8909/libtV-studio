"use client";

import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type OnEdgesChange, type OnNodesChange, type XYPosition } from "@xyflow/react";
import { create } from "zustand";
import type { ApiAsset, Capability } from "@libtv/shared";
import type { StudioNode, StudioNodeData } from "./types";

interface StudioFlowState {
  nodes: StudioNode[];
  edges: Edge[];
  hydrated: boolean;
  setGraph(nodes: StudioNode[], edges: Edge[]): void;
  setHydrated(value: boolean): void;
  onNodesChange: OnNodesChange<StudioNode>;
  onEdgesChange: OnEdgesChange;
  onConnect(connection: Connection): void;
  patchNode(id: string, patch: Partial<StudioNodeData>): void;
  addPromptNode(position?: XYPosition): string;
  addGenerationNode(capability: Capability, position?: XYPosition): string;
  addAssetNode(asset: ApiAsset, position?: XYPosition): string;
  seedStarterGraph(): void;
}

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export const useStudioFlow = create<StudioFlowState>((set, get) => ({
  nodes: [],
  edges: [],
  hydrated: false,
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setHydrated: (value) => set({ hydrated: value }),
  onNodesChange: (changes) => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection) => set((state) => ({ edges: addEdge({ ...connection, animated: true }, state.edges) })),
  patchNode: (nodeId, patch) => set((state) => ({
    nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node),
  })),
  addPromptNode: (position = { x: 80, y: 120 }) => {
    const nodeId = id("prompt");
    set((state) => ({ nodes: [...state.nodes, { id: nodeId, type: "prompt", position, data: { kind: "prompt", title: "Prompt", prompt: "" } }] }));
    return nodeId;
  },
  addGenerationNode: (capability, position = { x: 440, y: 120 }) => {
    const nodeId = id("gen");
    set((state) => ({ nodes: [...state.nodes, { id: nodeId, type: "generation", position, data: { kind: "generation", title: capability, capability, status: "idle", params: {} } }] }));
    return nodeId;
  },
  addAssetNode: (asset, position = { x: 800, y: 120 }) => {
    const nodeId = id("asset");
    set((state) => ({ nodes: [...state.nodes, { id: nodeId, type: "asset", position, data: { kind: "asset", title: asset.filename || asset.kind, asset } }] }));
    return nodeId;
  },
  seedStarterGraph: () => {
    if (get().nodes.length) return;
    const promptId = id("prompt");
    const imageId = id("gen");
    const videoId = id("gen");
    set({
      nodes: [
        { id: promptId, type: "prompt", position: { x: 80, y: 180 }, data: { kind: "prompt", title: "Creative Prompt", prompt: "A cinematic product shot, controlled studio lighting" } },
        { id: imageId, type: "generation", position: { x: 420, y: 130 }, data: { kind: "generation", title: "Generate Image", capability: "image.generate", status: "idle", params: { aspectRatio: "16:9" } } },
        { id: videoId, type: "generation", position: { x: 800, y: 130 }, data: { kind: "generation", title: "Animate Image", capability: "video.image_to_video", status: "idle", params: { duration: 5, aspectRatio: "16:9", resolution: "720p" } } },
      ],
      edges: [
        { id: `e-${promptId}-${imageId}`, source: promptId, target: imageId, animated: true },
        { id: `e-${imageId}-${videoId}`, source: imageId, target: videoId, animated: true },
      ],
    });
  },
}));
