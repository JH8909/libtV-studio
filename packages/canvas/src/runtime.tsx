"use client";

import { createContext, useContext } from "react";
import type { ApiAsset, ProviderModel } from "@libtv/shared";

export interface CanvasRuntime {
  apiBase: string;
  projectId: string;
  models: ProviderModel[];
  onAssetProduced?: (assets: ApiAsset[]) => void;
}

const Context = createContext<CanvasRuntime | null>(null);
export const CanvasRuntimeProvider = Context.Provider;
export function useCanvasRuntime(): CanvasRuntime {
  const value = useContext(Context);
  if (!value) throw new Error("CanvasRuntimeProvider is missing");
  return value;
}
