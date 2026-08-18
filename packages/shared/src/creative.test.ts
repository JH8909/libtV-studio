import assert from "node:assert/strict";
import test from "node:test";
import { buildCreativeContext } from "./creative";

test("creative context summarizes media graph, references and timeline readiness", () => {
  const context = buildCreativeContext({
    project: { name: "短片", settings: { creative: { styles: ["暖色电影感"] } } },
    workflow: {
      nodes: [
        { id: "shot-1", type: "imageGen", position: { x: 0, y: 0 }, data: { sceneId: "scene-1", shotId: "shot-1", prompt: "客厅" } },
        { id: "shot-2", type: "videoGen", position: { x: 300, y: 0 }, data: { sceneId: "scene-1", shotId: "shot-2", status: "failed" } },
        { id: "unused", type: "upload", position: { x: 600, y: 0 }, data: {} },
      ],
      edges: [{ id: "edge-1", source: "shot-1", target: "shot-2" }],
    },
    timeline: { fps: 30, width: 1920, height: 1080, items: [{ id: "clip-1", sourceAssetId: "missing", startFrame: 0, durationInFrames: 30 }] },
    assets: [{ id: "asset-1", kind: "image", metadata: { reference: true } }],
    generations: [{ id: "job-1", status: "failed" }],
  });

  assert.deepEqual(context.bible.styles, ["暖色电影感"]);
  assert.deepEqual(context.graph.scenes, ["scene-1"]);
  assert.deepEqual(context.graph.shots, ["shot-1", "shot-2"]);
  assert.deepEqual(context.graph.failedNodeIds, ["shot-2"]);
  assert.deepEqual(context.assets.byKind, { image: 1 });
  assert.equal(context.assets.referenceCount, 1);
  assert.deepEqual(context.timeline.missingAssetItemIds, ["clip-1"]);
  assert.equal(context.readiness.blockers, 2);
});

test("creative context tolerates incomplete legacy project data", () => {
  const context = buildCreativeContext({ project: {}, workflow: null, timeline: null, assets: [] });
  assert.equal(context.graph.nodeCount, 0);
  assert.equal(context.timeline.fps, 30);
  assert.equal(context.readiness.score, 100);
});
