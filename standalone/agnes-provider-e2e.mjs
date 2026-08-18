import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-agnes-e2e-'));
const studioPort = 3422;
const captures = [];
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zb9sAAAAASUVORK5CYII=';
const readJson = async request => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

let videoSequence = 0;
const videoPolls = new Map();
const fake = http.createServer(async (request, response) => {
  const body = request.method === 'POST' ? await readJson(request) : null;
  captures.push({ method: request.method, url: request.url, headers: request.headers, body });
  response.setHeader('content-type', 'application/json');
  if (request.method === 'POST' && request.url === '/agnes/v1/chat/completions') {
    response.setHeader('content-type','text/event-stream');
    response.write(`data: ${JSON.stringify({choices:[{delta:{content:'Agnes contract '}}]})}\n\n`);
    await new Promise(resolve=>setTimeout(resolve,20));
    return response.end(`data: ${JSON.stringify({choices:[{delta:{content:'text'}}]})}\n\ndata: [DONE]\n\n`);
  }
  if (request.method === 'GET' && request.url === '/agnes/v1/models') {
    return response.end(JSON.stringify({ object: 'list', data: [
      { id: 'agnes-2.0-flash' }, { id: 'agnes-2.5-flash' }, { id: 'agnes-2.5-pro' }, { id: 'agnes-2.5-pro-alpha' },
      { id: 'agnes-image-2.0-flash' }, { id: 'agnes-image-2.1-flash' }, { id: 'agnes-video-v2.0' },
    ] }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/images/generations') {
    return response.end(JSON.stringify({ data: [{ b64_json: pngBase64 }] }));
  }
  if (request.method === 'POST' && request.url === '/agnes/v1/videos') {
    videoSequence += 1;
    return response.end(JSON.stringify({ video_id: `agnes-video-${videoSequence}`, status: 'queued' }));
  }
  if (request.method === 'GET' && request.url?.startsWith('/agnes/agnesapi?')) {
    const videoId = new URL(request.url, 'http://agnes.test').searchParams.get('video_id');
    const attempt = (videoPolls.get(videoId) || 0) + 1;
    videoPolls.set(videoId, attempt);
    if (attempt === 1) {
      response.statusCode = 429;
      response.setHeader('retry-after', '0');
      return response.end(JSON.stringify({ message: 'video status query rate limit exceeded' }));
    }
    if (videoId === 'agnes-video-1') return response.end(JSON.stringify({ status: 'completed', url: `http://127.0.0.1:${fakePort}/output.mp4`, seconds: '3.4', size: '832x448' }));
    return response.end(JSON.stringify({ status: 'failed', error: { message: 'fake Agnes terminal' } }));
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
    AGNES_API_KEY: 'agnes-test-key',
    AGNES_BASE_URL: `http://127.0.0.1:${fakePort}/agnes/v1`,
    PUBLIC_BASE_URL: `http://127.0.0.1:${studioPort}`,
    AGNES_POLL_INTERVAL_MS: '20',
    AGNES_VIDEO_TIMEOUT_MS: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => logs += chunk);
child.stderr.on('data', chunk => logs += chunk);
const base = `http://127.0.0.1:${studioPort}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await request(`/api/generations/${id}`);
    if (['succeeded', 'failed', 'canceled'].includes(job.status)) return job;
    await sleep(50);
  }
  throw new Error(`${id}: timed out`);
}

try {
  await waitHealth();
  const project = await request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Agnes provider contract' }),
  }, 201);
  const image = await request(`/api/projects/${project.id}/assets/upload`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-filename': 'reference.png' },
    body: Buffer.from(pngBase64, 'base64'),
  }, 201);
  const discovered=(await request('/api/provider-settings')).agnesModels;
  if (discovered.length !== 7) throw new Error(`expected 7 discovered Agnes models, got ${discovered.length}`);
  const models = (await request('/api/models')).models.filter(model => model.providerId === 'agnes');
  if (models.length !== 3) throw new Error(`expected 3 configured Agnes generation models, got ${models.length}`);
  if (!models.some(model => model.capabilities.includes('text.generate')) || !models.some(model => model.capabilities.includes('image.generate')) || !models.some(model => model.capabilities.includes('video.generate'))) throw new Error('configured Agnes capabilities are incomplete');

  async function submit(capability, params, references = [], expected = 'failed') {
    const model = models.find(candidate => candidate.capabilities.includes(capability));
    if (!model) throw new Error(`Agnes model missing for ${capability}`);
    const job = await request('/api/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, providerId: 'agnes', modelId: model.modelId, capability, prompt: `${capability} contract`, params, references }),
    }, 202);
    const terminal = await waitTerminal(job.id);
    if (terminal.status !== expected) throw new Error(`${capability}: expected ${expected}, got ${terminal.status}: ${terminal.error || ''}`);
    return terminal;
  }

  const text = await submit('text.generate', { system: 'System contract', temperature: 0.2 }, [], 'succeeded');
  if (text.outputText !== 'Agnes contract text') throw new Error('Agnes text output missing');
  const imageJob = await submit('image.edit', { resolution: '4K', aspectRatio: '3:4' }, [{ assetId: image.id, role: 'reference-image' }], 'succeeded');
  if (imageJob.outputs.length !== 1 || imageJob.outputs[0].kind !== 'image') throw new Error('Agnes image output missing');
  const videoJobs = [];
  videoJobs.push(await submit('video.generate', { duration: 5, resolution: '720p', aspectRatio: '16:9' }));
  videoJobs.push(await submit('video.image_to_video', { duration: 3, resolution: '480p', aspectRatio: '9:16' }, [{ assetId: image.id, role: 'first-frame' }]));
  videoJobs.push(await submit('video.first_last_frame', { duration: 10, resolution: '1080p', aspectRatio: '4:3', seed: 42, negativePrompt: 'blur' }, [
    { assetId: image.id, role: 'first-frame' },
    { assetId: image.id, role: 'last-frame' },
  ]));
  if (!String(videoJobs[0].error).includes('blocked private remote IP')) throw new Error('Agnes top-level video URL was not extracted');
  if (videoJobs.slice(1).some(job => !String(job.error).includes('fake Agnes terminal'))) throw new Error('Agnes 429 polling retry did not reach the terminal status response');

  const authRequests = captures.filter(capture => capture.url?.startsWith('/agnes/'));
  if (authRequests.some(capture => capture.headers.authorization !== 'Bearer agnes-test-key')) throw new Error('Agnes bearer header missing');
  const textRequest = captures.find(capture => capture.url === '/agnes/v1/chat/completions');
  if (textRequest?.body?.model !== 'agnes-2.5-flash' || textRequest.body.messages?.[0]?.role !== 'system' || textRequest.body.stream !== true) throw new Error('Agnes streaming text payload invalid');
  const imageRequest = captures.find(capture => capture.url === '/agnes/v1/images/generations');
  if (imageRequest?.body?.model !== 'agnes-image-2.1-flash' || imageRequest.body.size !== '2K' || imageRequest.body.ratio !== '3:4') throw new Error('Agnes image parameters invalid');
  if (imageRequest.body.extra_body?.response_format !== 'url' || imageRequest.body.return_base64 !== undefined || !String(imageRequest.body.extra_body?.image?.[0] || '').startsWith(`${base}/media/assets/`)) throw new Error('Agnes image reference payload invalid');
  const videoRequests = captures.filter(capture => capture.url === '/agnes/v1/videos');
  if (videoRequests.length !== 3) throw new Error(`expected 3 Agnes video requests, got ${videoRequests.length}`);
  const textToVideo = videoRequests.find(capture => !capture.body.image && !capture.body.extra_body);
  if (textToVideo?.body?.num_frames !== 121 || textToVideo.body.frame_rate !== 24 || textToVideo.body.width !== 1280 || textToVideo.body.height !== 704) throw new Error('Agnes text-to-video payload invalid');
  const imageToVideo = videoRequests.find(capture => capture.body.image);
  if (!String(imageToVideo?.body?.image || '').startsWith(`${base}/media/assets/`) || imageToVideo.body.num_frames !== 81 || imageToVideo.body.width !== 448 || imageToVideo.body.height !== 832) throw new Error('Agnes image-to-video payload invalid');
  const keyframes = videoRequests.find(capture => capture.body.extra_body?.mode === 'keyframes');
  if (keyframes?.body?.extra_body?.image?.length !== 2 || keyframes.body.num_frames !== 241 || keyframes.body.seed !== 42 || keyframes.body.negative_prompt !== 'blur') throw new Error('Agnes keyframes payload invalid');
  if (keyframes.body.extra_body.image.some(url => !String(url).startsWith(`${base}/media/assets/`))) throw new Error('Agnes keyframes must use public URLs');
  const polls = captures.filter(capture => capture.method === 'GET' && capture.url?.startsWith('/agnes/agnesapi?'));
  if (polls.length !== 6 || polls.some(capture => !capture.url.includes('video_id=agnes-video-') || !capture.url.includes('model_name=agnes-video-v2.0'))) throw new Error('Agnes video polling query invalid');

  console.log(JSON.stringify({ ok: true, models: models.map(model => model.modelId), text: true, imageEdit: true, videoModes: ['text-to-video', 'image-to-video', 'first-last-frame'], capturedRequests: captures.length }, null, 2));
} finally {
  child.kill('SIGTERM');
  fake.close();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
  await rm(dataDir, { recursive: true, force: true });
}
