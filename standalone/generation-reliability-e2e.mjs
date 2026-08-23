import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-generation-reliability-'));
const studioPort = 3462;
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zb9sAAAAASUVORK5CYII=';
const captures = [];
const polls = new Map();
const submitAttempts = new Map();
const imageAttempts = new Map();
const textAttempts = new Map();
const taskPrompts = new Map();
let activeVideoTask = '';
let providerOverlap = false;
let canceledPollClosed = false;
let sequence = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readJson = async request => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

const fake = http.createServer(async (request, response) => {
  const body = request.method === 'POST' ? await readJson(request) : null;
  captures.push({ method: request.method, url: request.url, body, at: Date.now() });
  response.setHeader('content-type', 'application/json');
  if (request.method === 'POST' && request.url === '/agnes/v1/images/generations') {
    const remote = String(body.prompt || '').includes('remote-source');
    const prompt = String(body.prompt || '');
    const attempt = (imageAttempts.get(prompt) || 0) + 1;
    imageAttempts.set(prompt, attempt);
    if (prompt === 'service-busy-image' && attempt < 3) {
      response.statusCode = 503;
      return response.end(JSON.stringify({ message: 'Service busy: ServiceUnavailableError' }));
    }
    return response.end(JSON.stringify({ data: [{ b64_json: pngBase64, ...(remote ? { url: 'https://cdn.agnes.test/reference.png' } : {}) }] }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/videos') {
    const prompt = String(body.prompt || '');
    const attempt = (submitAttempts.get(prompt) || 0) + 1;
    submitAttempts.set(prompt, attempt);
    if (prompt.includes('rate-limit-submit') && attempt < 3) {
      response.statusCode = 429;
      response.setHeader('retry-after', '0');
      return response.end(JSON.stringify({ message: 'slow down' }));
    }
    if (prompt.includes('queue-full-submit') && attempt < 3) {
      response.statusCode = 503;
      return response.end(JSON.stringify({ message: 'video queue is full, please retry later' }));
    }
    if (activeVideoTask) providerOverlap = true;
    const videoId = prompt.includes('cancel-running') ? 'cancel-running' : `video-${++sequence}`;
    taskPrompts.set(videoId,prompt);
    activeVideoTask = videoId;
    return response.end(JSON.stringify({ video_id: videoId, status: 'queued' }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/chat/completions') {
    const prompt = String(body.messages?.at(-1)?.content || '');
    const attempt = (textAttempts.get(prompt) || 0) + 1;
    textAttempts.set(prompt, attempt);
    if (prompt === 'network-retry' && attempt === 1) return request.socket.destroy();
    return response.end(JSON.stringify({ choices: [{ message: { content: '| ok |' } }] }));
  }
  if (request.method === 'GET' && request.url?.startsWith('/agnes/agnesapi?')) {
    const videoId = new URL(request.url, 'http://agnes.test').searchParams.get('video_id');
    polls.set(videoId, (polls.get(videoId) || 0) + 1);
    if (videoId === 'cancel-running') {
      request.once('close', () => { canceledPollClosed = true; activeVideoTask = ''; });
      return;
    }
    await sleep(80);
    activeVideoTask = '';
    if (taskPrompts.get(videoId) === 'nested-url') {
      return response.end(JSON.stringify({ status: 'completed', result: { output: { video_url: `http://127.0.0.1:${fakePort}/result.mp4` } } }));
    }
    return response.end(JSON.stringify({ status: 'failed', error: { message: 'fake terminal' } }));
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
    AGNES_VIDEO_TIMEOUT_MS: '1500',
    PROVIDER_RETRY_BASE_MS: '20',
    PROVIDER_BUSY_RETRY_BASE_MS: '80',
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Studio did not start\n${logs}`);
}
async function waitTerminal(id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await request(`/api/generations/${id}`);
    if (['succeeded', 'failed', 'canceled'].includes(job.status)) return job;
    await sleep(30);
  }
  throw new Error(`${id}: timed out`);
}
async function submit(projectId, modelId, prompt, references = [], extra = {}, expected = 202) {
  return request('/api/generations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, providerId: 'agnes', modelId, capability: references.length ? 'video.image_to_video' : 'video.generate', prompt, params: { duration: 3, resolution: '480p', aspectRatio: '16:9' }, references, ...extra }),
  }, expected);
}

try {
  await waitHealth();
  const project = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Reliability' }) }, 201);
  const longName = `${'dragged-asset-'.repeat(9)}source.png`;
  const longAsset = await request(`/api/projects/${project.id}/assets/upload`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-filename': longName }, body: Buffer.from(pngBase64, 'base64') }, 201);
  const longMedia = await fetch(base + longAsset.publicUrl);
  if (!longMedia.ok || !(await longMedia.arrayBuffer()).byteLength) throw new Error('long asset URL was truncated while serving media');
  await request(`/api/projects/${project.id}/assets/${longAsset.id}`, { method: 'DELETE' });
  if ((await fetch(base + longAsset.publicUrl)).status !== 404) throw new Error('deleted asset media is still available');
  const local = await request(`/api/projects/${project.id}/assets/upload`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-filename': 'local.png' }, body: Buffer.from(pngBase64, 'base64') }, 201);
  const models = (await request('/api/models')).models.filter(model => model.providerId === 'agnes');
  const imageModel = models.find(model => model.capabilities.includes('image.generate'));
  const videoModel = models.find(model => model.capabilities.includes('video.generate'));

  const before = (await request(`/api/projects/${project.id}/generations`)).generations.length;
  const localJob = await submit(project.id, videoModel.modelId, 'blocked-local', [{ assetId: local.id, role: 'first-frame' }], { requestId: 'blocked-1', sourceNodeId: 'node-blocked' });
  await waitTerminal(localJob.id);
  const localRequest = captures.find(capture => capture.url === '/agnes/v1/videos' && capture.body?.prompt === 'blocked-local');
  if (!String(localRequest?.body?.image || '').startsWith('data:image/png;base64,')) throw new Error('local image reference was not inlined as a data URI');
  if ((await request(`/api/projects/${project.id}/generations`)).generations.length <= before) throw new Error('local reference job was not created');

  async function generateImage(prompt) {
    const job = await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, providerId: 'agnes', modelId: imageModel.modelId, capability: 'image.generate', prompt, params: { aspectRatio: '1:1', quality: '1K' }, references: [], requestId: `image-${prompt}`, sourceNodeId: `image-${prompt}` }) }, 202);
    return waitTerminal(job.id);
  }
  const localImage = await generateImage('local-only');
  if (!localImage.outputs[0]?.metadata?.localOnly) throw new Error('Base64 Agnes image was not marked local-only');
  const generatedLocal = await submit(project.id, videoModel.modelId, 'blocked-generated-local', [{ assetId: localImage.outputs[0].id, role: 'first-frame' }], { requestId: 'blocked-2', sourceNodeId: 'node-blocked-2' });
  await waitTerminal(generatedLocal.id);
  const generatedLocalRequest = captures.find(capture => capture.url === '/agnes/v1/videos' && capture.body?.prompt === 'blocked-generated-local');
  if (!String(generatedLocalRequest?.body?.image || '').startsWith('data:image/png;base64,')) throw new Error('local-only generated image reference was not inlined as a data URI');

  const remoteImage = await generateImage('remote-source');
  if (remoteImage.outputs[0]?.metadata?.providerUrl !== 'https://cdn.agnes.test/reference.png') throw new Error('Agnes provider URL was not retained');
  const busyImage = await generateImage('service-busy-image');
  if (busyImage.status !== 'succeeded' || imageAttempts.get('service-busy-image') !== 3) throw new Error(`image Service busy retry failed: ${JSON.stringify(busyImage)}`);
  const first = await submit(project.id, videoModel.modelId, 'serial-first', [{ assetId: remoteImage.outputs[0].id, role: 'first-frame' }], { requestId: 'same-request', sourceNodeId: 'same-node' });
  const duplicateRequest = await submit(project.id, videoModel.modelId, 'serial-first', [{ assetId: remoteImage.outputs[0].id, role: 'first-frame' }], { requestId: 'same-request', sourceNodeId: 'same-node' });
  const duplicateNode = await submit(project.id, videoModel.modelId, 'serial-first', [{ assetId: remoteImage.outputs[0].id, role: 'first-frame' }], { requestId: 'different-request', sourceNodeId: 'same-node' });
  if (first.id !== duplicateRequest.id || first.id !== duplicateNode.id) throw new Error('generation idempotency failed');
  const second = await submit(project.id, videoModel.modelId, 'serial-second', [{ assetId: remoteImage.outputs[0].id, role: 'first-frame' }], { requestId: 'serial-second', sourceNodeId: 'serial-second' });
  await Promise.all([waitTerminal(first.id), waitTerminal(second.id)]);
  if (providerOverlap) throw new Error('same-provider media jobs overlapped');

  const rateLimited = await submit(project.id, videoModel.modelId, 'rate-limit-submit', [], { requestId: 'rate-limit', sourceNodeId: 'rate-limit' });
  const rateTerminal = await waitTerminal(rateLimited.id);
  if (rateTerminal.attempt !== 3 || submitAttempts.get('rate-limit-submit') !== 3) throw new Error(`429 submit retry failed: ${JSON.stringify(rateTerminal)}`);

  const queueFull = await submit(project.id, videoModel.modelId, 'queue-full-submit', [], { requestId: 'queue-full', sourceNodeId: 'queue-full' });
  let queueWaitObserved = false;
  for (let attempt = 0; attempt < 50 && !queueWaitObserved; attempt += 1) {
    const current = await request(`/api/generations/${queueFull.id}`);
    queueWaitObserved = current.status === 'queued' && current.phase === 'provider_busy' && Boolean(current.nextAttemptAt);
    if (!queueWaitObserved) await sleep(10);
  }
  const queueTerminal = await waitTerminal(queueFull.id);
  if (!queueWaitObserved || queueTerminal.attempt !== 3 || submitAttempts.get('queue-full-submit') !== 3) throw new Error(`503 queue retry failed: ${JSON.stringify(queueTerminal)}`);

  const textModel = models.find(model => model.capabilities.includes('text.generate'));
  const textJob = await request('/api/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, providerId: 'agnes', modelId: textModel.modelId, capability: 'text.generate', prompt: 'network-retry', params: {}, requestId: 'network-retry', sourceNodeId: 'network-retry' }) }, 202);
  const textTerminal = await waitTerminal(textJob.id);
  if (textTerminal.status !== 'succeeded' || textAttempts.get('network-retry') !== 2) throw new Error(`text network retry failed: ${JSON.stringify(textTerminal)}`);

  const nested = await submit(project.id, videoModel.modelId, 'nested-url', [], { requestId: 'nested-url', sourceNodeId: 'nested-url' });
  const nestedTerminal = await waitTerminal(nested.id);
  if (!String(nestedTerminal.error).includes('blocked private remote IP') || String(nestedTerminal.error).includes('without a result URL')) throw new Error(`nested Agnes result URL was not extracted: ${nestedTerminal.error}`);

  const running = await submit(project.id, videoModel.modelId, 'cancel-running', [], { requestId: 'cancel-running', sourceNodeId: 'cancel-running' });
  for (let attempt = 0; attempt < 50 && !polls.has('cancel-running'); attempt += 1) await sleep(20);
  const queued = await submit(project.id, videoModel.modelId, 'cancel-queued', [], { requestId: 'cancel-queued', sourceNodeId: 'cancel-queued' });
  await request(`/api/generations/${queued.id}/cancel`, { method: 'POST' });
  await request(`/api/generations/${running.id}/cancel`, { method: 'POST' });
  const [runningCanceled, queuedCanceled] = await Promise.all([waitTerminal(running.id), waitTerminal(queued.id)]);
  for (let attempt = 0; attempt < 50 && !canceledPollClosed; attempt += 1) await sleep(20);
  if (runningCanceled.status !== 'canceled' || queuedCanceled.status !== 'canceled' || !canceledPollClosed) throw new Error('queued/running cancellation failed');
  if (captures.some(capture => capture.url === '/agnes/v1/videos' && capture.body?.prompt === 'cancel-queued')) throw new Error('canceled queued job reached provider');

  await request('/api/provider-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ PUBLIC_BASE_URL: base }) });
  const publicJob = await submit(project.id, videoModel.modelId, 'public-local', [{ assetId: local.id, role: 'first-frame' }], { requestId: 'public-local', sourceNodeId: 'public-local' });
  await waitTerminal(publicJob.id);
  const publicRequest = captures.find(capture => capture.url === '/agnes/v1/videos' && capture.body?.prompt === 'public-local');
  if (!String(publicRequest?.body?.image || '').startsWith(`${base}/media/assets/`)) throw new Error('PUBLIC_BASE_URL was not used for local image');

  console.log(JSON.stringify({ ok: true, longAssetServed: true, assetDelete: true, preflight: true, localOnly: true, providerUrl: true, idempotent: true, providerSerial: true, retryAttempts: rateTerminal.attempt, queueBusyRetries: queueTerminal.attempt, imageBusyRetries: imageAttempts.get('service-busy-image'), textNetworkRetries: textAttempts.get('network-retry'), runningCanceled: true, queuedCanceled: true }, null, 2));
} finally {
  child.kill('SIGTERM');
  fake.close();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
  await rm(dataDir, { recursive: true, force: true });
}
