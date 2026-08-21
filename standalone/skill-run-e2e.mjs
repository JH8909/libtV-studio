import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createSkillRunRecord, publicSkillRun, skillRunStepsFromNodes, tagWorkflowNodesWithSkillRun } from './skill-run.mjs';
import { buildSkillWorkflow, skillById } from './skill-catalog.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-skill-run-'));
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await writeFile(join(dataDir, 'fixture.png'), pngBytes);

function listenAsync(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

async function freePort() {
  const probe = http.createServer();
  const port = await listenAsync(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const skill = skillById('new-chinese-tvc');
assert(skill, 'new-chinese-tvc skill missing');
const built = buildSkillWorkflow({
  skill,
  existingWorkflow: { version: 2, nodes: [], edges: [] },
  productAssetId: 'asset-product',
  sellingPoints: '天然玉石、牡丹雕花',
  brandName: '示例品牌',
});
const run = createSkillRunRecord({ projectId: 'project-1', skill, result: built, confirmMode: 'manual' });
tagWorkflowNodesWithSkillRun(built.nodes.filter((node) => built.createdNodeIds.includes(node.id)), run.runId);
assert(run.runId && run.steps.length >= 5, 'skill run should include TVC steps');
assert(run.confirmMode === 'manual', 'confirm mode should be manual');
assert(run.steps.some((step) => step.id === 'keyframes' && step.nodeIds.length === 5), 'keyframes step should track 5 shots');
assert(built.nodes.some((node) => node.data?.skillRunId === run.runId && node.data?.stepId === 'videos' && node.data?.shotId === 'S1'), 'nodes should carry skillRunId/stepId/shotId');
assert(publicSkillRun(run).inputValues.sellingPoints.includes('玉石'), 'public skill run should expose inputValues');
assert(skillRunStepsFromNodes(built.nodes, skill).some((step) => step.id === 'timeline'), 'timeline step present');
console.log('PASS skill-run local model');

const appSource = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
assert(appSource.includes('resumePersistedSkillRuns(projectId)'), 'project reopen should restore persisted SkillRuns');
assert(appSource.includes('waitForNodeJobAndApply'), 'active generation nodes should be awaited instead of counted as failures');
assert(appSource.includes("const manual=skillRun.confirmMode==='manual';"), 'SkillRun confirmation mode should survive Agent preference changes');
assert(appSource.includes('cancelSkillRun') && appSource.includes('data-agent-skill-cancel'), 'SkillRun should expose a user cancellation control');
assert(appSource.includes('showSkillRunAssets') && appSource.includes('data-agent-skill-assets'), 'SkillRun should expose its generated assets');
console.log('PASS SkillRun reload recovery contract');

const studioPort = await freePort();
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(studioPort), DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

async function waitHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${studioPort}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(logs || 'studio did not start');
}

try {
  await waitHealth();
  const project = await fetch(`http://127.0.0.1:${studioPort}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'SkillRun E2E' }),
  }).then((response) => response.json());
  const asset = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/assets/upload`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-filename': encodeURIComponent('fixture.png') },
    body: pngBytes,
  }).then((response) => response.json());

  const missing = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '' }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  assert(missing.status === 400 && /产品卖点/.test(missing.body.message || ''), `missing selling points should 400, got ${JSON.stringify(missing.body)}`);
  console.log('PASS skill apply validates required selling points');

  const applied = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '天然玉石、牡丹雕花', confirmMode: 'manual' }),
  }).then((response) => response.json());
  assert(applied.skillRun?.runId, 'apply should return skillRun.runId');
  assert(applied.skillRun?.confirmMode === 'manual', 'apply should preserve confirmMode');
  assert(applied.skillRun?.steps?.some((step) => step.id === 'anchor'), 'apply should return step list');
  assert(applied.workflow?.nodes?.some((node) => node.data?.skillRunId === applied.skillRun.runId), 'workflow nodes tagged with skillRunId');
  console.log('PASS skill apply creates SkillRun runtime');

  const listed = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs`).then((response) => response.json());
  assert(listed.skillRuns?.some((runItem) => runItem.runId === applied.skillRun.runId), 'skill runs list includes created run');

  const patched = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs/${applied.skillRun.runId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pauseAt: 'keyframes', status: 'awaiting_confirmation' }),
  }).then((response) => response.json());
  assert(patched.pauseAt === 'keyframes' && patched.status === 'awaiting_confirmation', 'skill run patch should update pause gate');
  console.log('PASS skill run pause gate patch');

  const shotNode = applied.workflow.nodes.find((node) => node.type === 'imageGen' && node.data?.shotId === 'S3');
  assert(shotNode, 'S3 keyframe node exists');
  const retry = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs/${applied.skillRun.runId}/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shotId: 'S3', stepId: 'keyframes' }),
  }).then((response) => response.json());
  assert(retry.nodeIds?.includes(shotNode.id), 'retry should target failed shot node');
  console.log('PASS skill run single-shot retry');

  const cancelApply = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '天然玉石、牡丹雕花', confirmMode: 'auto' }),
  }).then((response) => response.json());
  const canceled = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs/${cancelApply.skillRun.runId}/cancel`, { method: 'POST' }).then((response) => response.json());
  assert(canceled.status === 'canceled' && canceled.error === '用户取消', 'skill run cancel should stop and persist terminal state');
  const canceledReload = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs/${cancelApply.skillRun.runId}`).then((response) => response.json());
  assert(canceledReload.status === 'canceled', 'canceled skill run should remain canceled after reload');
  console.log('PASS skill run cancel control');
} finally {
  child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
