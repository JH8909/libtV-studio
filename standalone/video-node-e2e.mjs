import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-video-node-'));
const port = 3223;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => logs += chunk);
child.stderr.on('data', chunk => logs += chunk);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, options = {}, expected = 200) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function waitHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`server did not start\n${logs}`);
}

async function upload(projectId, filename, mime) {
  return request(`/api/projects/${projectId}/assets/upload`, {
    method: 'POST',
    headers: { 'content-type': mime, 'x-filename': filename },
    body: await readFile(join(ROOT, 'fixtures', filename)),
  }, 201);
}

async function submit(projectId, capability, references = []) {
  return request('/api/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, capability, providerId: 'mock', modelId: 'mock-video', prompt: capability, params: { duration: 2, aspectRatio: '16:9' }, references }),
  }, 202);
}

async function waitSucceeded(id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const job = await request(`/api/generations/${id}`);
    if (job.status === 'succeeded') {
      if (job.outputs.length !== 1 || job.outputs[0].kind !== 'video') throw new Error(`${id}: video output missing`);
      return job;
    }
    if (['failed', 'canceled'].includes(job.status)) throw new Error(`${id}: ${job.error || job.status}`);
    await sleep(100);
  }
  throw new Error(`${id}: timed out`);
}

try {
  await waitHealth();
  const project = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Video node E2E' }) }, 201);
  const image = await upload(project.id, 'mock-image.svg', 'image/svg+xml');
  const sourceVideo = await upload(project.id, 'mock-video.mp4', 'video/mp4');
  const first = { assetId: image.id, role: 'first-frame' };
  const last = { assetId: image.id, role: 'last-frame' };

  await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, capability: 'video.generate', providerId: 'mock', modelId: 'mock-video', prompt: 'invalid', references: [first] }) }, 400);
  await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, capability: 'video.image_to_video', providerId: 'mock', modelId: 'mock-video', prompt: 'invalid', references: [] }) }, 400);
  await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, capability: 'video.first_last_frame', providerId: 'mock', modelId: 'mock-video', prompt: 'invalid', references: [first] }) }, 400);
  await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, capability: 'video.reference', providerId: 'mock', modelId: 'mock-video', prompt: 'invalid', references: [] }) }, 400);

  const jobs = [
    await submit(project.id, 'video.generate'),
    await submit(project.id, 'video.image_to_video', [first]),
    await submit(project.id, 'video.first_last_frame', [first, last]),
    await submit(project.id, 'video.reference', [{ assetId: image.id, role: 'reference-image' }, { assetId: sourceVideo.id, role: 'reference-video' }]),
  ];
  const outputs = await Promise.all(jobs.map(job => waitSucceeded(job.id)));

  const canceled = await submit(project.id, 'video.generate');
  await request(`/api/generations/${canceled.id}/cancel`, { method: 'POST' });
  const canceledView = await request(`/api/generations/${canceled.id}`);
  if (canceledView.status !== 'canceled') throw new Error(`cancel expected canceled, got ${canceledView.status}`);

  const nodes = ['video.generate', 'video.image_to_video', 'video.first_last_frame', 'video.reference'].map((forcedCapability, index) => ({ id: `v${index}`, type: 'videoGen', position: { x: index * 360, y: 0 }, data: { forcedCapability } }));
  await request(`/api/projects/${project.id}/workflow`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 2, nodes, edges: [] }) });
  const workflow = await request(`/api/projects/${project.id}/workflow`);
  if (workflow.nodes.map(node => node.data.forcedCapability).join(',') !== nodes.map(node => node.data.forcedCapability).join(',')) throw new Error('video modes did not persist');

  const appSource = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
  const styleSource = await readFile(join(ROOT, 'public', 'styles.css'), 'utf8');
  if (appSource.includes('data-action="cancel"')) throw new Error('generation cancel action should not be rendered');
  if (!appSource.includes('if(!terminal.includes(job.status)){updateGenerationProgressDom(n);return false;}')) throw new Error('non-terminal progress must update in place');
  if (!appSource.includes('function renderNode(n)')) throw new Error('node-scoped rendering is required');
  if (!appSource.includes('function generationPreviewSize(n)')) throw new Error('generation previews must share aspect-ratio sizing');
  if (appSource.includes('controls muted playsinline')) throw new Error('generated video previews must default to sound on');
  if (!appSource.includes('aria-expanded="${expanded}"')) throw new Error('composer toggle must expose expanded state');
  if (appSource.includes("toast('生成完成')")) throw new Error('completed jobs should not show a redundant completion toast');
  if (!styleSource.includes('.generation-progress{grid-column:1/-1;position:relative')) throw new Error('generation progress must participate in node layout');
  if (!styleSource.includes("background:#fff;pointer-events:none;-webkit-mask:url('/vendor/icons/chevron-down.svg')")) throw new Error('generation select arrows must be white');
  if (styleSource.includes('bottom:-18px') || styleSource.includes('left:233px')) throw new Error('generation controls must not rely on negative or fixed absolute positioning');

  console.log(JSON.stringify({ ok: true, modes: nodes.map(node => node.data.forcedCapability), successfulJobs: outputs.length, canceled: true, validationCases: 4, uiGuards: 9 }, null, 2));
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1200)]);
  await rm(dataDir, { recursive: true, force: true });
}
