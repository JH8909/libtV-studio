import { z } from "zod";

const RecordSchema = z.record(z.string(), z.unknown());
const PositionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const CanvasOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create-node"), node: RecordSchema }),
  z.object({ op: z.literal("update-node"), nodeId: z.string().min(1), patch: RecordSchema }),
  z.object({ op: z.literal("move-node"), nodeId: z.string().min(1), position: PositionSchema }),
  z.object({ op: z.literal("delete-node"), nodeId: z.string().min(1) }),
  z.object({ op: z.literal("create-edge"), edge: RecordSchema }),
  z.object({ op: z.literal("delete-edge"), edgeId: z.string().min(1) }),
  z.object({ op: z.literal("replace-graph"), nodes: z.array(RecordSchema), edges: z.array(RecordSchema) }),
]);

export type CanvasOperation = z.infer<typeof CanvasOperationSchema>;

export const CanvasOperationRequestSchema = z.object({
  projectId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  operations: z.array(CanvasOperationSchema).min(1).max(100),
  dryRun: z.boolean().default(false),
  actor: z.literal("agent"),
});

export type CanvasOperationRequest = z.infer<typeof CanvasOperationRequestSchema>;

export const CanvasOperationResultSchema = z.object({
  version: z.number().int().positive(),
  applied: z.array(CanvasOperationSchema),
  previousSnapshot: z.object({ version: z.number().int().positive(), nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }),
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

export type CanvasOperationResult = z.infer<typeof CanvasOperationResultSchema>;

export const TimelineOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add-item"), item: RecordSchema }),
  z.object({ op: z.literal("update-item"), itemId: z.string().min(1), patch: RecordSchema }),
  z.object({ op: z.literal("remove-item"), itemId: z.string().min(1) }),
  z.object({ op: z.literal("replace-items"), items: z.array(RecordSchema) }),
]);

export type TimelineOperation = z.infer<typeof TimelineOperationSchema>;

export const TimelineOperationRequestSchema = z.object({
  projectId: z.string().min(1),
  expectedUpdatedAt: z.string().datetime().optional(),
  operations: z.array(TimelineOperationSchema).min(1).max(100),
  actor: z.literal("agent"),
});

export type TimelineOperationRequest = z.infer<typeof TimelineOperationRequestSchema>;

type JsonRecord = Record<string, unknown>;

function idOf(value: JsonRecord, kind: string): string {
  if (typeof value.id !== "string" || value.id.length === 0) throw new Error(`${kind} id is required`);
  return value.id;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRecord(current: JsonRecord, patch: JsonRecord): JsonRecord {
  const next = { ...current, ...patch };
  if (current.data && patch.data && typeof current.data === "object" && typeof patch.data === "object"
    && !Array.isArray(current.data) && !Array.isArray(patch.data)) {
    next.data = { ...(current.data as JsonRecord), ...(patch.data as JsonRecord) };
  }
  return next;
}

export function applyCanvasOperations(
  sourceNodes: readonly unknown[],
  sourceEdges: readonly unknown[],
  operations: readonly CanvasOperation[],
): { nodes: JsonRecord[]; edges: JsonRecord[]; applied: CanvasOperation[] } {
  let nodes = sourceNodes.map((node) => RecordSchema.parse(node));
  let edges = sourceEdges.map((edge) => RecordSchema.parse(edge));
  const applied: CanvasOperation[] = [];

  for (const operation of operations) {
    switch (operation.op) {
      case "create-node": {
        const id = idOf(operation.node, "node");
        const existing = nodes.find((node) => node.id === id);
        if (existing) {
          if (!sameJson(existing, operation.node)) throw new Error(`node already exists: ${id}`);
          break;
        }
        nodes = [...nodes, structuredClone(operation.node)];
        applied.push(operation);
        break;
      }
      case "update-node": {
        const index = nodes.findIndex((node) => node.id === operation.nodeId);
        if (index < 0) throw new Error(`node not found: ${operation.nodeId}`);
        const current = nodes[index]!;
        const next = mergeRecord(current, operation.patch);
        if (!sameJson(current, next)) {
          nodes = nodes.with(index, next);
          applied.push(operation);
        }
        break;
      }
      case "move-node": {
        const index = nodes.findIndex((node) => node.id === operation.nodeId);
        if (index < 0) throw new Error(`node not found: ${operation.nodeId}`);
        const current = nodes[index]!;
        const next = { ...current, position: operation.position };
        if (!sameJson(current, next)) {
          nodes = nodes.with(index, next);
          applied.push(operation);
        }
        break;
      }
      case "delete-node": {
        if (!nodes.some((node) => node.id === operation.nodeId)) break;
        nodes = nodes.filter((node) => node.id !== operation.nodeId);
        edges = edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId);
        applied.push(operation);
        break;
      }
      case "create-edge": {
        const id = idOf(operation.edge, "edge");
        const source = operation.edge.source;
        const target = operation.edge.target;
        if (typeof source !== "string" || typeof target !== "string") throw new Error(`edge endpoints are required: ${id}`);
        if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) {
          throw new Error(`edge endpoint not found: ${id}`);
        }
        const existing = edges.find((edge) => edge.id === id);
        if (existing) {
          if (!sameJson(existing, operation.edge)) throw new Error(`edge already exists: ${id}`);
          break;
        }
        edges = [...edges, structuredClone(operation.edge)];
        applied.push(operation);
        break;
      }
      case "delete-edge": {
        if (!edges.some((edge) => edge.id === operation.edgeId)) break;
        edges = edges.filter((edge) => edge.id !== operation.edgeId);
        applied.push(operation);
        break;
      }
      case "replace-graph": {
        const nextNodes = operation.nodes.map((node) => RecordSchema.parse(node));
        const nextEdges = operation.edges.map((edge) => RecordSchema.parse(edge));
        const nodeIds = new Set(nextNodes.map((node) => idOf(node, "node")));
        if (nodeIds.size !== nextNodes.length) throw new Error("replacement graph contains duplicate node ids");
        const edgeIds = new Set(nextEdges.map((edge) => idOf(edge, "edge")));
        if (edgeIds.size !== nextEdges.length) throw new Error("replacement graph contains duplicate edge ids");
        for (const edge of nextEdges) {
          if (typeof edge.source !== "string" || typeof edge.target !== "string"
            || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`replacement edge has a missing endpoint: ${String(edge.id)}`);
        }
        if (!sameJson(nodes, nextNodes) || !sameJson(edges, nextEdges)) {
          nodes = nextNodes;
          edges = nextEdges;
          applied.push(operation);
        }
        break;
      }
    }
  }

  return { nodes, edges, applied };
}

export function canvasOperationsRequireApproval(operations: readonly CanvasOperation[]): boolean {
  return operations.some((operation) => operation.op === "delete-node" || operation.op === "replace-graph")
    || operations.length > 20;
}

export function timelineOperationsRequireApproval(operations: readonly TimelineOperation[]): boolean {
  return operations.some((operation) => operation.op === "remove-item" || operation.op === "replace-items")
    || operations.length > 10;
}
