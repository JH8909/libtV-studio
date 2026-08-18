export type CreativeIssueLevel = "blocker" | "warning" | "info";

export interface CreativeIssue {
  level: CreativeIssueLevel;
  code: string;
  message: string;
  nodeIds?: string[];
  assetIds?: string[];
  timelineItemIds?: string[];
}

export interface CreativeContext {
  schemaVersion: 1;
  mission: Record<string, unknown>;
  bible: {
    characters: string[];
    locations: string[];
    styles: string[];
    continuityGroups: string[];
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
    scenes: string[];
    shots: string[];
    unconnectedNodeIds: string[];
    incompleteNodeIds: string[];
    failedNodeIds: string[];
  };
  assets: {
    total: number;
    byKind: Record<string, number>;
    referenceCount: number;
  };
  timeline: {
    fps: number;
    width: number;
    height: number;
    itemCount: number;
    durationFrames: number;
    missingAssetItemIds: string[];
  };
  readiness: {
    score: number;
    blockers: number;
    warnings: number;
  };
  issues: CreativeIssue[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function listText(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

function nodeMeta(node: unknown): JsonRecord {
  const root = record(node);
  return { ...root, ...record(root.data), ...record(root.data && record(root.data).creative) };
}

function nodeId(node: unknown): string | undefined {
  return text(record(node).id);
}

function nodeStatus(node: unknown): string {
  const meta = nodeMeta(node);
  return text(meta.status)?.toLowerCase() || "idle";
}

export function buildCreativeContext(input: {
  project?: unknown;
  workflow?: { nodes?: unknown[]; edges?: unknown[] } | null;
  timeline?: { fps?: number; width?: number; height?: number; items?: unknown[] } | null;
  assets?: unknown[];
  generations?: unknown[];
}): CreativeContext {
  const project = record(input.project);
  const settings = record(project.settings);
  const creative = record(settings.creative);
  const nodes = input.workflow?.nodes || [];
  const edges = input.workflow?.edges || [];
  const timelineItems = input.timeline?.items || [];
  const assets = input.assets || [];
  const generations = input.generations || [];
  const connected = new Set<string>();
  for (const edge of edges) {
    const value = record(edge);
    if (text(value.source)) connected.add(text(value.source)!);
    if (text(value.target)) connected.add(text(value.target)!);
  }

  const scenes = new Set<string>();
  const shots = new Set<string>();
  const characters = new Set<string>(listText(creative.characters));
  const locations = new Set<string>(listText(creative.locations));
  const styles = new Set<string>(listText(creative.styles));
  const continuityGroups = new Set<string>(listText(creative.continuityGroups));
  const incompleteNodeIds: string[] = [];
  const failedNodeIds: string[] = [];
  const unconnectedNodeIds: string[] = [];
  const issues: CreativeIssue[] = [];

  for (const node of nodes) {
    const id = nodeId(node);
    const root = record(node);
    const meta = nodeMeta(node);
    const nodeType = text(root.type) || "unknown";
    for (const value of [meta.sceneId, meta.scene, meta.sceneName]) if (text(value)) scenes.add(text(value)!);
    for (const value of [meta.shotId, meta.shot, meta.shotName]) if (text(value)) shots.add(text(value)!);
    for (const value of [meta.characters, meta.characterIds]) for (const item of listText(value)) characters.add(item);
    for (const value of [meta.location, meta.locationId]) if (text(value)) locations.add(text(value)!);
    for (const value of [meta.style, meta.stylePreset]) if (text(value)) styles.add(text(value)!);
    if (text(meta.continuityGroup)) continuityGroups.add(text(meta.continuityGroup)!);
    if (id && nodes.length > 1 && !connected.has(id)) unconnectedNodeIds.push(id);
    const status = nodeStatus(node);
    if (id && ["queued", "processing", "running", "pending"].includes(status)) incompleteNodeIds.push(id);
    if (id && ["failed", "error"].includes(status)) failedNodeIds.push(id);
    if (id && ["imageGen", "videoGen", "textGen"].includes(nodeType) && !text(meta.prompt)) {
      issues.push({ level: "warning", code: "missing-prompt", message: "生成节点缺少提示词", nodeIds: [id] });
    }
  }

  const byKind: Record<string, number> = {};
  let referenceCount = 0;
  const assetIds = new Set<string>();
  for (const asset of assets) {
    const value = record(asset);
    const kind = text(value.kind) || "unknown";
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (text(value.id)) assetIds.add(text(value.id)!);
    const metadata = record(value.metadata);
    if (metadata.reference === true || metadata.isReference === true || text(metadata.role) === "reference") referenceCount += 1;
  }

  const missingAssetItemIds: string[] = [];
  let durationFrames = 0;
  for (const item of timelineItems) {
    const value = record(item);
    const id = text(value.id);
    const sourceAssetId = text(value.sourceAssetId);
    durationFrames = Math.max(durationFrames, Number(value.startFrame || 0) + Number(value.durationInFrames || 0));
    if (id && sourceAssetId && !assetIds.has(sourceAssetId)) missingAssetItemIds.push(id);
  }

  if (unconnectedNodeIds.length) issues.push({ level: "info", code: "unconnected-nodes", message: "画布存在未连接节点，可检查是否为素材或废弃节点", nodeIds: unconnectedNodeIds });
  if (failedNodeIds.length) issues.push({ level: "blocker", code: "failed-generation", message: "存在失败的生成节点", nodeIds: failedNodeIds });
  if (missingAssetItemIds.length) issues.push({ level: "blocker", code: "missing-timeline-assets", message: "Timeline 引用了不存在的素材", timelineItemIds: missingAssetItemIds });
  if (generations.some((job) => ["failed", "error"].includes(text(record(job).status)?.toLowerCase() || ""))) {
    issues.push({ level: "warning", code: "failed-generation-job", message: "最近生成任务中存在失败记录" });
  }

  const blockers = issues.filter((issue) => issue.level === "blocker").length;
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - blockers * 30 - warnings * 10 - (incompleteNodeIds.length ? 5 : 0)));
  return {
    schemaVersion: 1,
    mission: { name: text(project.name) || "未命名项目", ...creative },
    bible: { characters: [...characters], locations: [...locations], styles: [...styles], continuityGroups: [...continuityGroups] },
    graph: { nodeCount: nodes.length, edgeCount: edges.length, scenes: [...scenes], shots: [...shots], unconnectedNodeIds, incompleteNodeIds, failedNodeIds },
    assets: { total: assets.length, byKind, referenceCount },
    timeline: {
      fps: Number(input.timeline?.fps || 30), width: Number(input.timeline?.width || 1920), height: Number(input.timeline?.height || 1080),
      itemCount: timelineItems.length, durationFrames, missingAssetItemIds,
    },
    readiness: { score, blockers, warnings },
    issues,
  };
}
