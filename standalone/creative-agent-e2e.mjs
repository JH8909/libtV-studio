import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseCreativeAgentReply } from './creative-agent.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-creative-agent-e2e-'));
const fakePort = 3331;
const studioPort = 3332;
const captures = [];
const fake = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
  captures.push({ method: req.method, url: req.url, body });
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/deepseek/chat/completions') {
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: '可以从冷静的夜行者、霓虹追逐和城市余温三个方向继续推演。', followUps: ['先展开冷静的夜行者', '比较三个方向的制作成本'] }) } }] }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found' }));
});
await new Promise((resolve) => fake.listen(fakePort, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(studioPort), DATA_DIR: dataDir, DEEPSEEK_API_KEY: 'deepseek-test', DEEPSEEK_BASE_URL: `http://127.0.0.1:${fakePort}/deepseek`, DEEPSEEK_TEXT_MODEL: 'fake-deepseek-text' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });
const base = `http://127.0.0.1:${studioPort}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const looseReply = String.raw`{"text":"两个出其不意的创意方案供你选择：\n\n方案A：时间逆转喜剧\n开场：包的\"脸部\"表情（3秒）","questions":[],"followUps":[]}`;
const parsedLooseReply = parseCreativeAgentReply(looseReply);
if (!parsedLooseReply.text.includes('方案A：时间逆转喜剧') || !parsedLooseReply.text.includes('\n\n') || parsedLooseReply.text.includes('{"text"')) throw new Error('loose JSON creative reply was not normalized');
async function waitHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(logs || 'studio did not start');
}
async function jsonRequest(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}
function jsonBody(value) { return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }; }

try {
  await waitHealth();
  const project = await jsonRequest('/api/projects', { method: 'POST', ...jsonBody({ name: 'Creative Agent contract' }) });
  const workflow = { version: 1, nodes: [{ id: 'node-1', type: 'text', position: { x: 0, y: 0 }, data: { text: 'keep' } }], edges: [] };
  await jsonRequest(`/api/projects/${project.id}/workflow`, { method: 'PUT', ...jsonBody(workflow) });
  const beforeWorkflow = await jsonRequest(`/api/projects/${project.id}/workflow`);
  const beforeJobs = await jsonRequest(`/api/projects/${project.id}/generations`);
  const models = await jsonRequest('/api/models');
  if (!models.models.some((model) => model.providerId === 'deepseek' && model.modelId === 'fake-deepseek-text')) throw new Error('direct DeepSeek API model missing');
  const created = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations`, { method: 'POST' });
  const stream = await fetch(`${base}/api/projects/${project.id}/creative-agent/conversations/${created.id}/messages`, { method: 'POST', ...jsonBody({ message: '帮我发散一个夜行主题', providerId: 'deepseek', modelId: 'fake-deepseek-text' }) });
  if (!stream.ok) throw new Error(await stream.text());
  const streamText = await stream.text();
  if (!streamText.includes('event: thinking') || !streamText.includes('event: delta') || !streamText.includes('event: done') || streamText.includes('event: cards')) throw new Error(`creative SSE contract mismatch: ${streamText}`);
  const detail = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${created.id}`);
  const assistant = detail.messages.at(-1);
  if (!assistant?.text.includes('冷静的夜行者') || assistant.cards || assistant.followUps?.length !== 2) throw new Error('continuous creative output was not persisted');
  const clarificationConversation = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations`, { method: 'POST' });
  const clarificationStream = await fetch(`${base}/api/projects/${project.id}/creative-agent/conversations/${clarificationConversation.id}/messages`, { method: 'POST', ...jsonBody({ message: '帮我写一个15秒短视频脚本，产品是男士包', providerId: 'deepseek', modelId: 'fake-deepseek-text' }) });
  if (!clarificationStream.ok) throw new Error(await clarificationStream.text());
  await clarificationStream.text();
  const clarificationDetail = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${clarificationConversation.id}`);
  const clarification = clarificationDetail.messages.at(-1);
  if (!clarification?.questions?.length || clarification.followUps?.length) throw new Error('underspecified script request did not ask clarifying questions');
  await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${created.id}/messages/${assistant.id}`, { method: 'PATCH', ...jsonBody({ feedback: 'up' }) });
  const reloaded = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${created.id}`);
  if (reloaded.messages.at(-1)?.feedback !== 'up') throw new Error('message feedback was not persisted');
  const renamed = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${created.id}`, { method: 'PATCH', ...jsonBody({ title: '夜行主题会话' }) });
  if (renamed.title !== '夜行主题会话') throw new Error('conversation rename failed');
  const listed = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations`);
  if (!listed.conversations.some((item) => item.id === created.id && item.title === '夜行主题会话')) throw new Error('renamed conversation missing from list');
  const extra = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations`, { method: 'POST' });
  await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations/${extra.id}`, { method: 'DELETE' });
  const afterDelete = await jsonRequest(`/api/projects/${project.id}/creative-agent/conversations`);
  if (afterDelete.conversations.some((item) => item.id === extra.id)) throw new Error('conversation delete failed');
  const afterWorkflow = await jsonRequest(`/api/projects/${project.id}/workflow`);
  const afterJobs = await jsonRequest(`/api/projects/${project.id}/generations`);
  if (JSON.stringify(beforeWorkflow) !== JSON.stringify(afterWorkflow)) throw new Error('creative agent changed workflow');
  if (JSON.stringify(beforeJobs) !== JSON.stringify(afterJobs)) throw new Error('creative agent created a generation job');
  const request = captures.find((item) => item.url === '/deepseek/chat/completions');
  if (request?.body?.model !== 'fake-deepseek-text' || request.body.stream !== false || request.body.messages?.[0]?.content?.includes('修改画布') !== true) throw new Error('creative provider payload missing read-only system prompt');
  const source = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
  const html = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
  const server = await readFile(join(ROOT, 'server.mjs'), 'utf8');
  if (/harness|DeepSeek Harness|harnessFrame|harnessPort|3002/i.test(`${source}\n${html}`)) throw new Error('legacy Harness runtime reference remains in Standalone UI');
  if (!server.includes('CREATIVE_AGENT_TIMEOUT_MS || 180_000')) throw new Error('creative Agent timeout default is still too short');
  if (!html.includes('对话只给建议；使用技能才会改画布') || !html.includes('id="agentCloseBtn"') || !source.includes("event==='error'") || !source.includes('renameAgentConversation')) throw new Error('agent UX polish markers missing');
  console.log(JSON.stringify({ ok: true, directApi: true, persistedConversation: true, continuousOutput: true, persistedFeedback: true, renamedConversation: true, deletedConversation: true, canvasUnchanged: true, generationJobsUnchanged: true }, null, 2));
} finally {
  child.kill('SIGTERM');
  fake.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1000)]);
  await rm(dataDir, { recursive: true, force: true });
}
