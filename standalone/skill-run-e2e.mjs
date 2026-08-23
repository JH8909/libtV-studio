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
const run = createSkillRunRecord({ projectId: 'project-1', skill, result: built });
tagWorkflowNodesWithSkillRun(built.nodes.filter((node) => built.createdNodeIds.includes(node.id)), run.runId);
assert(run.runId && run.steps.length === 6, 'planned SkillRun should expose all TVC stages before media nodes exist');
assert(!Object.hasOwn(run, 'confirmMode') && !Object.hasOwn(run, 'pauseAt'), 'SkillRun should not carry confirmation state');
assert(run.status === 'queued', 'SkillRun should start queued');
assert(run.steps.some((step) => step.id === 'keyframes' && step.nodeIds.length === 0), 'keyframes must not exist before the storyboard is approved');
const storyboardNode = built.nodes.find((node) => node.data?.workflowStage === 'storyboard');
assert(storyboardNode?.data?.skillRunId === run.runId && storyboardNode.data?.skillRules?.shotCount === 5, 'approved storyboard source should retain SkillRun identity and rules');
assert(!built.nodes.some((node) => node.type === 'imageGen' || node.type === 'videoGen'), 'media nodes must wait for approved storyboard compilation');
assert(publicSkillRun(run).inputValues.sellingPoints.includes('玉石'), 'public skill run should expose inputValues');
assert(skillRunStepsFromNodes(built.nodes, skill).some((step) => step.id === 'timeline'), 'timeline step present');
console.log('PASS skill-run local model');

const appSource = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
assert(appSource.includes('resumePersistedSkillRuns(projectId)'), 'project reopen should restore persisted SkillRuns');
assert(appSource.includes('waitForNodeJobAndApply'), 'active generation nodes should be awaited instead of counted as failures');
assert(appSource.includes("if(phase==='keyframes'&&!nodes.length&&skillRun.skillId==='new-chinese-tvc')"), 'SkillRun should compile the approved storyboard before automatic media generation');
assert(appSource.includes('compileApprovedSkillStoryboard') && appSource.includes('validateSkillStoryboardPlan'), 'approved storyboard should be validated and compiled into Skill media nodes');
assert(appSource.includes('Skill 固定规则（必须逐镜遵守）'), 'compiled media prompts should include the Skill rules');
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

  const optionalInput = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '' }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  assert(optionalInput.status === 201 && optionalInput.body.skillRun?.runId, `empty selling points should still create a plan, got ${JSON.stringify(optionalInput.body)}`);
  console.log('PASS skill apply accepts empty optional inputs');

  const applied = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '天然玉石、牡丹雕花' }),
  }).then((response) => response.json());
  assert(applied.skillRun?.runId, 'apply should return skillRun.runId');
  assert(!Object.hasOwn(applied.skillRun || {}, 'confirmMode') && !Object.hasOwn(applied.skillRun || {}, 'pauseAt'), 'apply should not expose confirmation state');
  assert(applied.skillRun?.steps?.some((step) => step.id === 'anchor'), 'apply should return step list');
  assert(applied.skillRun?.status === 'queued', 'apply should create a queued run');
  assert(applied.workflow?.nodes?.some((node) => node.data?.skillRunId === applied.skillRun.runId), 'workflow nodes tagged with skillRunId');
  assert(!applied.workflow?.nodes?.some((node) => ['imageGen', 'videoGen'].includes(node.type)), 'apply must not create media nodes before storyboard approval');
  console.log('PASS skill apply creates SkillRun runtime');

  const listed = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skill-runs`).then((response) => response.json());
  assert(listed.skillRuns?.some((runItem) => runItem.runId === applied.skillRun.runId), 'skill runs list includes created run');

  const cancelApply = await fetch(`http://127.0.0.1:${studioPort}/api/projects/${project.id}/skills/new-chinese-tvc/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productAssetId: asset.id, sellingPoints: '天然玉石、牡丹雕花' }),
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
