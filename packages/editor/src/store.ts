"use client";

import { create } from "zustand";
import type { ApiAsset, TimelineItemSnapshot, TimelineSnapshot } from "@libtv/shared";
import { itemFromAsset, normalizeTimeline } from "./domain";

interface TimelineState extends TimelineSnapshot {
  hydrated: boolean;
  selectedItemId?: string;
  hydrate(snapshot: TimelineSnapshot): void;
  setSelected(id?: string): void;
  addAsset(asset: ApiAsset): string;
  removeItem(id: string): void;
  moveItem(id: string, startFrame: number, trackId?: string): void;
}

export const useTimeline = create<TimelineState>((set, get) => ({
  ...normalizeTimeline(),
  hydrated: false,
  hydrate: (snapshot) => set({ ...normalizeTimeline(snapshot), hydrated: true }),
  setSelected: (selectedItemId) => set({ selectedItemId }),
  addAsset: (asset) => {
    const current = get();
    const sameTrack = current.items.filter((item) => item.trackId === (asset.kind === "audio" ? "A1" : "V1"));
    const start = sameTrack.reduce((max, item) => Math.max(max, item.startFrame + item.durationInFrames), 0);
    const item = itemFromAsset(asset, current.fps, undefined, start);
    set({ items: [...current.items, item], selectedItemId: item.id });
    return item.id;
  },
  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id), selectedItemId: state.selectedItemId === id ? undefined : state.selectedItemId })),
  moveItem: (id, startFrame, trackId) => set((state) => ({ items: state.items.map((item) => item.id === id ? { ...item, startFrame: Math.max(0, Math.round(startFrame)), trackId: trackId ?? item.trackId } : item) })),
}));
