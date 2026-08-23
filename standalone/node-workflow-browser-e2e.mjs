import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'quill-node-browser-'));
const studioPort = 3468;
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zb9sAAAAASUVORK5CYII=';
const providerCalls = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJson = async request => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

const fake = http.createServer(async (request, response) => {
  const body = request.method === 'POST' ? await readJson(request) : null;
  response.setHeader('content-type', 'application/json');
  if (request.method === 'POST' && request.url === '/agnes/v1/chat/completions') {
    providerCalls.push('text');
    return response.end(JSON.stringify({ choices: [{ message: { content: '上游文本结果' } }] }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/images/generations') {
    providerCalls.push('image');
    return response.end(JSON.stringify({ data: [{ b64_json: pngBase64 }] }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/videos') {
    providerCalls.push('video');
    return response.end(JSON.stringify({ video_id: 'browser-flow-video', status: 'queued' }));
  }
  if (request.method === 'GET' && request.url?.startsWith('/agnes/agnesapi?')) {
    return response.end(JSON.stringify({ status: 'failed', error: { message: 'browser flow terminal' } }));
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
const fakePort = fake.address().port;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(studioPort),
    DATA_DIR: dataDir,
    AGNES_API_KEY: 'test-key',
    AGNES_BASE_URL: `http://127.0.0.1:${fakePort}/agnes/v1`,
    AGNES_POLL_INTERVAL_MS: '20',
    AGNES_VIDEO_TIMEOUT_MS: '1200',
    PROVIDER_RETRY_BASE_MS: '20',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => logs += chunk);
child.stderr.on('data', chunk => logs += chunk);
const base = `http://127.0.0.1:${studioPort}`;

async function request(path, options = {}, expected = 200) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function waitHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Studio did not start\n${logs}`);
}

let browser;
try {
  await waitHealth();
  const project = await request('/api/projects', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Node browser regression' }),
  }, 201);
  const reference = await request(`/api/projects/${project.id}/assets/upload`, {
    method: 'POST', headers: { 'content-type': 'image/png', 'x-filename': 'focus-reference.png' }, body: Buffer.from(pngBase64, 'base64'),
  }, 201);
  const models = (await request('/api/models')).models.filter(model => model.providerId === 'agnes');
  const textModel = models.find(model => model.capabilities.includes('text.generate'));
  const imageModel = models.find(model => model.capabilities.includes('image.edit'));
  const videoModel = models.find(model => model.capabilities.includes('video.image_to_video'));
  if (!textModel || !imageModel || !videoModel) throw new Error('required Agnes test models are unavailable');

  const workflow = {
    version: project.workflow.version,
    nodes: [
      { id: 'text-node', type: 'textGen', position: { x: 0, y: 0 }, data: { modelKey: `agnes::${textModel.modelId}`, prompt: '基础文本', preset: 'rewrite', status: 'idle', progress: 0, outputText: '', params: { temperature: 0.7 }, expanded: false, layoutWidth: 500 } },
      { id: 'image-node', type: 'imageGen', position: { x: 540, y: 0 }, data: { modelKey: `agnes::${imageModel.modelId}`, prompt: '图片提示词', actionId: 'image.region_focus', status: 'idle', progress: 0, params: { aspectRatio: '1:1', quality: '1K', variants: 1 }, presetReferences: [{ referenceId: 'focus-ref', assetId: reference.id, role: 'reference-image', semanticRole: 'subject', source: 'asset', region: { x: .2, y: .2, width: .5, height: .5 } }], expanded: false, layoutWidth: 500 } },
      { id: 'video-node', type: 'videoGen', position: { x: 1080, y: 0 }, data: { modelKey: `agnes::${videoModel.modelId}`, prompt: '视频提示词', actionId: 'video.image_to_video', forcedCapability: 'video.image_to_video', status: 'idle', progress: 0, params: { duration: 3, aspectRatio: '1:1', resolution: '480p' }, presetReferences: [{ referenceId: 'video-ref', assetId: reference.id, role: 'first-frame', semanticRole: 'subject', source: 'asset' }], expanded: false, layoutWidth: 500 } },
    ],
    edges: [
      { id: 'text-image', source: 'text-node', target: 'image-node' },
      { id: 'image-video', source: 'image-node', target: 'video-node', role: 'first-frame' },
    ],
  };
  await request(`/api/projects/${project.id}/workflow`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow),
  });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${base}/?projectId=${project.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.node-textgen');
  if (await page.locator('.node').count() !== 3) throw new Error('seeded nodes were not rendered');
  if (await page.locator('.node-image .node-ref-region-box').count() !== 1) throw new Error('focus region editor was not rendered');
  if (await page.locator('.node-video [data-ref-role]').inputValue() !== 'first-frame') throw new Error('video structural reference role is unavailable');
  if (await page.locator('.generator-advanced-menu,[data-param="temperature"],[data-param="seed"],[data-param="negativePrompt"]').count() !== 0) throw new Error('advanced generation controls are still visible');
  if ((await page.locator('.node-video .param-section').allInnerTexts()).some(text => text.includes('声音'))) throw new Error('unsupported Agnes audio controls are visible');

  await page.locator('#runAllBtn').click();
  for (let attempt = 0; attempt < 200 && providerCalls.length < 3; attempt += 1) await sleep(25);
  if (providerCalls.slice(0, 3).join(',') !== 'text,image,video') throw new Error(`run-all dependency order is wrong: ${providerCalls.join(',')}`);
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('.node-generation')].every(node => !node.classList.contains('is-busy')), null, { timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(item => item.textContent?.includes('工作流运行完成')), null, { timeout: 10000 });
  } catch {
    const nodeClasses = await page.locator('.node-generation').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.id, className: node.className })));
    const persisted = await request(`/api/projects/${project.id}/workflow`);
    throw new Error(`run-all left busy nodes: ${JSON.stringify({ providerCalls, nodeClasses, statuses: persisted.nodes.map(node => [node.id, node.data.status, node.data.jobId]) })}`);
  }

  await page.locator('.node-image [data-action="togglePreview"]').click();
  const imagePrompt = page.locator('.node-image [data-field="prompt"]');
  await imagePrompt.fill('更新图片@');
  await page.waitForSelector('#assetDrawer:not(.hidden)');
  if (await imagePrompt.inputValue() !== '更新图片') throw new Error('@ reference trigger was not consumed');
  await page.keyboard.press('Escape');

  await page.locator('.node-textgen [data-action="togglePreview"]').focus();
  await page.keyboard.press('Enter');
  await sleep(100);
  const textExpansion = await page.locator('.node-textgen').evaluate(node => ({ className: node.className, expanded: node.querySelector('[data-action="togglePreview"]')?.getAttribute('aria-expanded') }));
  if (!textExpansion.className.includes('is-expanded')) throw new Error(`text composer did not expand: ${JSON.stringify(textExpansion)}`);
  await page.locator('.node-textgen [data-field="prompt"]').fill('更新后的上游文本');
  try {
    await page.waitForFunction(() => ['saved','error'].includes(document.querySelector('#saveState')?.dataset.state), null, { timeout: 10000 });
    if (await page.locator('#saveState').getAttribute('data-state') !== 'saved') throw new Error('save state reported an error');
  } catch {
    const saveState = await page.locator('#saveState').evaluate(node => ({ state: node.dataset.state, text: node.textContent }));
    const toasts = await page.locator('.toast').allInnerTexts();
    const persisted = await request(`/api/projects/${project.id}/workflow`);
    throw new Error(`workflow did not reach saved state: ${JSON.stringify({ saveState, toasts, statuses: persisted.nodes.map(node => [node.id, node.data.status, node.data.stale, node.data.prompt]) })}`);
  }
  if (await page.locator('.is-stale').count() !== 0 || (await page.locator('.generator-submit').allInnerTexts()).some(text => /待更新|生成|失败|重试/.test(text))) throw new Error('internal stale state leaked into the node UI');

  const saved = await request(`/api/projects/${project.id}/workflow`);
  if (saved.nodes.length !== 3) throw new Error('workflow node persistence failed');
  if (saved.nodes.find(node => node.id === 'text-node')?.data.prompt !== '更新后的上游文本') throw new Error('edited prompt was not persisted');
  if (!saved.nodes.find(node => node.id === 'image-node')?.data.stale) throw new Error('stale state was not persisted');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.node-textgen');
  if (await page.locator('.node').count() !== 3 || await page.locator('.is-stale').count() !== 0) throw new Error('refresh round-trip exposed internal stale state');

  console.log(JSON.stringify({ ok: true, sourceFirstRunAll: providerCalls.slice(0, 3), persistedNodes: saved.nodes.length, refreshRoundTrip: true, stalePropagation: true, regionEditor: true, structuralRoles: true, providerAwareAudio: true, advancedControlsRemoved: true, atReferencePicker: true }, null, 2));
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  fake.close();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
  await rm(dataDir, { recursive: true, force: true });
}
