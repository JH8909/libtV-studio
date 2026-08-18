import assert from "node:assert/strict";
import test from "node:test";
import { applyCanvasOperations, CanvasOperationRequestSchema, canvasOperationsRequireApproval } from "./agent";

test("canvas operations are atomic from the caller's perspective", () => {
  const nodes = [{ id: "a", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "keep" } }];
  assert.throws(() => applyCanvasOperations(nodes, [], [
    { op: "create-node", node: { id: "b", type: "prompt", position: { x: 1, y: 1 }, data: {} } },
    { op: "create-edge", edge: { id: "broken", source: "b", target: "missing" } },
  ]), /endpoint not found/);
  assert.equal(nodes.length, 1);
});

test("replaying identical create operations is idempotent", () => {
  const node = { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: {} };
  const result = applyCanvasOperations([node], [], [{ op: "create-node", node }]);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.applied.length, 0);
});

test("canvas request supports a non-mutating preview contract", () => {
  const parsed = CanvasOperationRequestSchema.parse({
    projectId: "project-1",
    expectedVersion: 3,
    operations: [{ op: "create-node", node: { id: "preview", type: "imageGen" } }],
    dryRun: true,
    actor: "agent",
  });
  assert.equal(parsed.dryRun, true);
});

test("deleting a node also removes connected edges and requires approval", () => {
  const operation = { op: "delete-node", nodeId: "a" } as const;
  const result = applyCanvasOperations(
    [{ id: "a" }, { id: "b" }],
    [{ id: "e", source: "a", target: "b" }],
    [operation],
  );
  assert.deepEqual(result.nodes, [{ id: "b" }]);
  assert.deepEqual(result.edges, []);
  assert.equal(canvasOperationsRequireApproval([operation]), true);
});
