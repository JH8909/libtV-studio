import http from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import { applyAgentProposal, configuredAgentModels, createAgentReply, ensureAgentSession, reviewSequenceClip } from './agent.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
for (const envFile of [join(ROOT,'.env'), join(dirname(ROOT),'.env')]) { try { if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile); } catch (error) { console.warn(`Could not load ${envFile}:`, error.message); } }
const PUBLIC = join(ROOT, 'public');
const TABLER_ICONS = join(dirname(ROOT), 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const ASSETS_DIR = join(DATA, 'assets');
const EXPORTS_DIR = join(DATA, 'exports');
const DB_FILE = join(DATA, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 512 * 1024 * 1024);
const MAX_REMOTE_BYTES = Number(process.env.MAX_REMOTE_BYTES || 1024 * 1024 * 1024);
const MAX_PROVIDER_ATTEMPTS = 3;
const PROVIDER_RETRY_BASE_MS = Math.max(20, Number(process.env.PROVIDER_RETRY_BASE_MS || 1000));
const MAX_PROVIDER_BUSY_ATTEMPTS = Math.max(1, Number(process.env.MAX_PROVIDER_BUSY_ATTEMPTS || 5));
const PROVIDER_BUSY_RETRY_BASE_MS = Math.max(20, Number(process.env.PROVIDER_BUSY_RETRY_BASE_MS || 10_000));
const MAX_PROVIDER_RETRY_DELAY_MS = 60_000;
const PROVIDER_SETTINGS_FILE = join(DATA, 'provider-settings.json');
let providerSettings = {};
try { if (existsSync(PROVIDER_SETTINGS_FILE)) providerSettings = JSON.parse(readFileSync(PROVIDER_SETTINGS_FILE,'utf8')); } catch { providerSettings = {}; }
const apimartProxyBase=String(providerSettings.APIMART_BASE_URL||process.env.APIMART_BASE_URL||'https://api.apimart.ai/v1');
const agnesDirectHost=(()=>{try{return new URL(String(providerSettings.AGNES_BASE_URL||process.env.AGNES_BASE_URL||'https://apihub.agnes-ai.com/v1')).hostname;}catch{return'';}})();
if(process.env.ALL_PROXY&&!process.env.HTTPS_PROXY&&!process.env.HTTP_PROXY&&process.env.LIBTV_PROXY_BOOTSTRAPPED!=='1'&&!process.execArgv.includes('--use-env-proxy')&&(providerSettings.APIMART_API_KEY||process.env.APIMART_API_KEY)&&/^https:\/\//i.test(apimartProxyBase)){
  const noProxy=[process.env.NO_PROXY,agnesDirectHost].filter(Boolean).join(',');
  const child=spawn(process.execPath,['--use-env-proxy',...process.execArgv,fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,HTTPS_PROXY:process.env.ALL_PROXY,HTTP_PROXY:process.env.ALL_PROXY,NO_PROXY:noProxy,LIBTV_PROXY_BOOTSTRAPPED:'1'}});
  const code=await new Promise(resolve=>child.on('exit',resolve));process.exit(typeof code==='number'?code:0);
}
const retiredProviderKeys=Object.keys(providerSettings).filter(key=>/^(?:OPENAI|OPENAI_COMPAT|ARK|VOLCENGINE|KLING|GEMINI|VEO|FAL)_/.test(key)||/^APIMART_(?:TEXT|AGENT|IMAGE|VIDEO)_MODEL$/.test(key)||/^APIMART_(?:BASE|CHAT_BASE)_URL$/.test(key));
if(retiredProviderKeys.length){for(const key of retiredProviderKeys)delete providerSettings[key];writeFileSync(PROVIDER_SETTINGS_FILE,JSON.stringify(providerSettings,null,2));}
const cfg = (key, fallback='') => String(providerSettings[key] || process.env[key] || fallback);
let AGNES_API_KEY, AGNES_BASE_URL, AGNES_TEXT_MODEL, AGNES_AGENT_MODEL, AGNES_IMAGE_MODEL, AGNES_VIDEO_MODEL, APIMART_API_KEY, APIMART_BASE_URL, APIMART_CHAT_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_TEXT_MODEL, DEEPSEEK_AGENT_MODEL, BAILIAN_API_KEY, BAILIAN_BASE_URL, BAILIAN_MEDIA_BASE_URL, BAILIAN_TEXT_MODEL, BAILIAN_AGENT_MODEL, BAILIAN_IMAGE_MODEL, BAILIAN_VIDEO_MODEL, PUBLIC_BASE_URL;
function refreshProviderRuntime(){
  AGNES_API_KEY = cfg('AGNES_API_KEY');
  AGNES_BASE_URL = cfg('AGNES_BASE_URL','https://apihub.agnes-ai.com/v1').replace(/\/$/,'');
  AGNES_TEXT_MODEL = cfg('AGNES_TEXT_MODEL','agnes-2.5-flash');
  AGNES_AGENT_MODEL = cfg('AGNES_AGENT_MODEL',AGNES_TEXT_MODEL);
  AGNES_IMAGE_MODEL = cfg('AGNES_IMAGE_MODEL','agnes-image-2.1-flash');
  AGNES_VIDEO_MODEL = cfg('AGNES_VIDEO_MODEL','agnes-video-v2.0');
  APIMART_API_KEY = cfg('APIMART_API_KEY');
  APIMART_BASE_URL = cfg('APIMART_BASE_URL','https://api.apimart.ai/v1').replace(/\/$/,'');
  APIMART_CHAT_BASE_URL = cfg('APIMART_CHAT_BASE_URL','https://api.apimart.ai/api/v1').replace(/\/$/,'');
  DEEPSEEK_API_KEY = cfg('DEEPSEEK_API_KEY');
  DEEPSEEK_BASE_URL = cfg('DEEPSEEK_BASE_URL','https://api.deepseek.com').replace(/\/$/,'');
  DEEPSEEK_TEXT_MODEL = cfg('DEEPSEEK_TEXT_MODEL','deepseek-v4-pro');
  DEEPSEEK_AGENT_MODEL = cfg('DEEPSEEK_AGENT_MODEL',DEEPSEEK_TEXT_MODEL);
  BAILIAN_API_KEY = cfg('BAILIAN_API_KEY');
  BAILIAN_BASE_URL = cfg('BAILIAN_BASE_URL','https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/,'');
  BAILIAN_MEDIA_BASE_URL = cfg('BAILIAN_MEDIA_BASE_URL','https://dashscope.aliyuncs.com/api/v1').replace(/\/$/,'');
  BAILIAN_TEXT_MODEL = cfg('BAILIAN_TEXT_MODEL','qwen-plus');
  BAILIAN_AGENT_MODEL = cfg('BAILIAN_AGENT_MODEL',BAILIAN_TEXT_MODEL);
  BAILIAN_IMAGE_MODEL = cfg('BAILIAN_IMAGE_MODEL','qwen-image-2.0');
  BAILIAN_VIDEO_MODEL = cfg('BAILIAN_VIDEO_MODEL','wan2.7-t2v-2026-06-12');
  PUBLIC_BASE_URL = cfg('PUBLIC_BASE_URL').replace(/\/$/,'');
}
refreshProviderRuntime();
const EXTERNAL_REFERENCE_MODE = process.env.EXTERNAL_REFERENCE_MODE || 'data-uri';
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const FFMPEG_FONT_FILE = (() => { if (process.env.FFMPEG_FONT_FILE && existsSync(process.env.FFMPEG_FONT_FILE)) return process.env.FFMPEG_FONT_FILE; const r=spawnSync('fc-match',['-f','%{file}','Noto Sans CJK SC'],{encoding:'utf8'}),f=String(r.stdout||'').trim(); if(f&&existsSync(f))return f; const win=process.env.WINDIR||process.env.SystemRoot; for(const name of ['msyh.ttc','simhei.ttf','arial.ttf']){const candidate=win&&join(win,'Fonts',name);if(candidate&&existsSync(candidate))return candidate;} return ''; })();

for (const dir of [DATA, ASSETS_DIR, EXPORTS_DIR]) mkdirSync(dir, { recursive: true });

function emptyDb() {
  return { version: 2, projects: {}, jobs: {}, assets: {} };
}

let state = emptyDb();
if (existsSync(DB_FILE)) {
  try { state = JSON.parse(readFileSync(DB_FILE, 'utf8')); } catch { state = emptyDb(); }
}
state.version = 2; state.projects ||= {}; state.jobs ||= {}; state.assets ||= {};

let saveChain = Promise.resolve();
function saveDb() {
  saveChain = saveChain.then(async () => {
    const tmp = `${DB_FILE}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
    await fsp.rename(tmp, DB_FILE);
  });
  return saveChain;
}

const providerRunning = new Set();
const jobControllers = new Map();
let schedulerTimer = null;

function abortError() { return Object.assign(new Error('canceled'), { name: 'AbortError' }); }
function sleep(ms, signal) {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
function serializedMediaLane(job) { const kind=String(job.capability||'').match(/^(image|video|audio)\./)?.[1];return kind?`${job.providerId}:${kind}`:''; }
function retryDelay(error, attempt, baseMs = PROVIDER_RETRY_BASE_MS) {
  const hinted = Number(error?.retryAfterMs);
  const message = String(error?.message || '');
  const windowMatch = message.match(/allows\s+\d+\s+requests?\s+per\s+(\d+)\s+minute/i);
  const providerWindow = windowMatch ? Math.max(1, Number(windowMatch[1])) * 60_000 : 0;
  return Math.min(MAX_PROVIDER_RETRY_DELAY_MS, hinted > 0 ? hinted : providerWindow || baseMs * 2 ** Math.max(0, attempt - 1));
}
function providerRetryPhase(error) {
  if (error?.status === 429) return 'rate_limited';
  if (error?.status === 503 && /queue\s+(?:is\s+)?full|capacity|overloaded|server\s+busy|temporar(?:ily)?\s+unavailable|队列.*满|服务.*繁忙|稍后重试/i.test(String(error?.message || ''))) return 'provider_busy';
  return '';
}
function findExistingJob(projectId, requestId, sourceKey) {
  const jobs = Object.values(state.jobs).filter(job => job.projectId === projectId);
  if (requestId) {
    const exact = jobs.find(job => job.requestId === requestId);
    if (exact) return exact;
  }
  return sourceKey ? jobs.find(job => job.sourceKey === sourceKey && ['queued','processing'].includes(job.status)) : null;
}
async function enqueueGeneration(jobRequest, { requestId, sourceNodeId, sourceKey } = {}) {
  const stableRequestId = String(requestId || randomUUID());
  const key = String(sourceKey || (sourceNodeId ? `node:${sourceNodeId}` : ''));
  const existing = findExistingJob(jobRequest.projectId, stableRequestId, key);
  if (existing) return existing;
  const id = randomUUID(); const ts = now();
  const job = { id, projectId:jobRequest.projectId, capability:jobRequest.capability, providerId:jobRequest.providerId, modelId:jobRequest.modelId, status:'queued', phase:'queued', progress:0, attempt:0, nextAttemptAt:null, requestId:stableRequestId, sourceNodeId:String(sourceNodeId || ''), sourceKey:key, request:jobRequest, outputAssetIds:[], createdAt:ts, updatedAt:ts };
  state.jobs[id] = job; await saveDb(); setImmediate(scheduleJobs); return job;
}
function scheduleJobs() {
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
  const current = Date.now(); let nextAt = Infinity;
  const queued = Object.values(state.jobs).filter(job => job.status === 'queued').sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of queued) {
    const due = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : 0;
    if (due > current) { nextAt = Math.min(nextAt, due); continue; }
    const lane=serializedMediaLane(job);if (lane && providerRunning.has(lane)) continue;
    startJob(job);
  }
  if (Number.isFinite(nextAt)) schedulerTimer = setTimeout(scheduleJobs, Math.max(1, nextAt - Date.now()));
}
function startJob(job) {
  if (job.status !== 'queued') return;
  const lane=serializedMediaLane(job);if (lane) providerRunning.add(lane);
  job.status = 'processing'; job.phase = 'preparing'; job.nextAttemptAt = null; job.attempt = Number(job.attempt || 0) + 1; job.updatedAt = now();
  const controller = new AbortController(); jobControllers.set(job.id, controller);
  void runJob(job.id, controller.signal).finally(() => {
    jobControllers.delete(job.id); if (lane) providerRunning.delete(lane); scheduleJobs();
  });
}

const interruptedJobs = Object.values(state.jobs).filter(job => ['queued','processing'].includes(job.status));
if (interruptedJobs.length) {
  const interruptedAt = new Date().toISOString();
  for (const job of interruptedJobs) {
    job.status = 'failed';
    job.error = 'Studio restarted before this generation finished. Retry from the node.';
    job.updatedAt = interruptedAt;
  }
  await saveDb();
}

function now() { return new Date().toISOString(); }
function json(res, status, body, extra = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store', ...extra });
  res.end(data);
}
function text(res, status, body, type = 'text/plain; charset=utf-8') {
  const data = Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'content-length': data.length });
  res.end(data);
}
function notFound(res) { json(res, 404, { error: 'not_found' }); }
function safeDecode(value) { try { return decodeURIComponent(value); } catch { return value; } }
function cleanFilename(name = 'asset.bin') {
  return basename(name).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]+/g, '_').slice(0, 120) || 'asset.bin';
}
function mimeFromExt(file) {
  const ext = extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' })[ext] || 'application/octet-stream';
}
function kindFromMime(mime, filename = '') {
  if ((mime || '').startsWith('image/')) return 'image';
  if ((mime || '').startsWith('video/')) return 'video';
  if ((mime || '').startsWith('audio/')) return 'audio';
  const ext = extname(filename).toLowerCase();
  if (['.png','.jpg','.jpeg','.webp','.gif','.svg'].includes(ext)) return 'image';
  if (['.mp4','.webm','.mov','.mkv'].includes(ext)) return 'video';
  if (['.mp3','.wav','.aac','.m4a','.ogg'].includes(ext)) return 'audio';
  return 'document';
}
function contentTypeOnly(value = '') { return value.split(';')[0].trim().toLowerCase(); }

async function readJson(req, max = 4 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw Object.assign(new Error('request_too_large'), { status: 413 }); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function projectOr404(id) { return state.projects[id]; }
function projectAssets(projectId, { tag, kind } = {}) {
  const all = Object.values(state.assets)
    .filter(a => a.projectId === projectId)
    .map(a => (a.tags ? a : { ...a, tags: computeInitialTags({kind:a.kind, metadata:a.metadata, source:a.metadata?.source||'upload'}) }));
  let filtered = all;
  if (tag) filtered = filtered.filter(a => a.tags.includes(tag));
  if (kind) filtered = filtered.filter(a => a.kind === kind);
  return filtered.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
function projectJobs(projectId) { return Object.values(state.jobs).filter(j => j.projectId === projectId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }

function agentRunFor(project) {
  const run = project.agentRun;
  if (!run) return null;
  const nodes = new Map((project.workflow?.nodes || []).map(node => [node.id, node]));
  const tasks = run.tasks.map(task => {
    const node = nodes.get(task.nodeId), status = node?.data?.status === 'succeeded' ? 'succeeded' : node?.data?.status === 'failed' ? 'failed' : task.status;
    return { ...task, status };
  });
  const completed = tasks.filter(task => task.status === 'succeeded').length;
  return { ...run, tasks, completed, total: tasks.length, progress: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}

function createAgentRun(project, mode) {
  const sequence = project.workflow?.sequence;
  if (!sequence?.clips?.length) throw Object.assign(new Error('请先应用一个连续项目方案'), { status: 409 });
  if (project.agentRun && ['queued','running','paused'].includes(project.agentRun.status)) throw Object.assign(new Error('已有 Agent Run 正在执行'), { status: 409 });
  const clips = mode === 'first-shot' ? sequence.clips.filter(clip => clip.id === sequence.activeClipId).slice(0, 1) : sequence.clips;
  if (!clips.length) throw Object.assign(new Error('当前没有可执行镜头'), { status: 409 });
  const tasks = [
    ...clips.map(clip => ({ id: randomUUID(), clipId: clip.id, nodeId: clip.imageNodeId, type: 'image', status: 'queued', error: '' })),
    ...clips.map(clip => ({ id: randomUUID(), clipId: clip.id, nodeId: clip.videoNodeId, type: 'video', status: 'queued', error: '' })),
  ];
  project.agentRun = { id: randomUUID(), mode: mode === 'all' ? 'all' : 'first-shot', status: 'queued', tasks, createdAt: now(), updatedAt: now() };
  return agentRunFor(project);
}

function agentQuality(project) {
  const sequence = project.workflow?.sequence, nodes = project.workflow?.nodes || [];
  if (!sequence?.clips?.length) return { status: 'empty', score: 0, issues: ['尚未创建连续项目'], suggestions: ['先生成一个脚本方案并应用为连续项目'] };
  const issues = [], suggestions = [], imageNodes = new Map(nodes.filter(node => node.type === 'imageGen').map(node => [node.id, node])), videoNodes = new Map(nodes.filter(node => node.type === 'videoGen').map(node => [node.id, node]));
  for (const clip of sequence.clips) {
    const shot = sequence.plan?.shots?.[clip.index], image = imageNodes.get(clip.imageNodeId), video = videoNodes.get(clip.videoNodeId);
    if (!shot?.imagePrompt || !shot?.videoPrompt) issues.push(`S${clip.index + 1} 缺少完整提示词`);
    if (clip.status === 'accepted' && !clip.observedEndState) issues.push(`S${clip.index + 1} 缺少结尾状态记录`);
    if (image?.data?.status === 'failed' || video?.data?.status === 'failed') issues.push(`S${clip.index + 1} 存在失败生成任务`);
  }
  if (issues.length) suggestions.push('优先修复失败镜头和缺失的连续性记录');
  suggestions.push('字幕建议：按镜头旁白和对白字段生成逐镜头字幕草稿');
  suggestions.push('音频建议：为每个镜头保留环境音、对白和音乐节拍三条轨道');
  return { status: issues.length ? 'warning' : 'ready', score: Math.max(0, 100 - issues.length * 12), issues, suggestions };
}

let agnesModelCache={expiresAt:0,models:[]};

function agnesModelCapabilities(item, modelId) {
  const raw=JSON.stringify(item||{}).toLowerCase();
  const id=String(modelId||'').toLowerCase();
  const image=/image|img|seedream|flux|qwen-image|gpt-image|nano-banana/.test(`${id} ${raw}`);
  const video=/video|seedance|veo|kling|sora|wan|hailuo/.test(`${id} ${raw}`);
  const unsupported=/embedding|moderation|rerank|speech|audio|tts|asr/.test(`${id} ${raw}`);
  const capabilities=[];
  if (video) capabilities.push('video.generate','video.image_to_video','video.first_last_frame');
  else if (image) capabilities.push('image.generate','image.edit');
  else if (!unsupported) capabilities.push('text.generate');
  return capabilities;
}

function agnesModelConstraints(capabilities) {
  if (capabilities.includes('image.generate')) return {aspectRatios:['1:1','3:4','4:3','16:9','9:16','2:3','3:2','21:9'],resolutions:['1K','2K']};
  if (capabilities.includes('video.generate')) return {durations:[3,5,10,18],aspectRatios:['16:9','9:16','1:1','4:3','3:4'],resolutions:['480p','720p','1080p'],maxImageRefs:2};
  return {};
}

function agnesModelFromItem(item) {
  const modelId=String(typeof item==='string'?item:item?.id||item?.name||'').trim();
  if (!modelId) return null;
  const capabilities=agnesModelCapabilities(item,modelId);
  return {providerId:'agnes',modelId,displayName:`Agnes · ${modelId}`,capabilities,constraints:agnesModelConstraints(capabilities),configured:true};
}

function agnesConfiguredModels() {
  return [
    agnesModelFromItem({id:AGNES_TEXT_MODEL}),
    agnesModelFromItem({id:AGNES_IMAGE_MODEL}),
    agnesModelFromItem({id:AGNES_VIDEO_MODEL}),
  ].filter(Boolean);
}

async function availableAgnesModels() {
  const fallback=agnesConfiguredModels();
  if (!AGNES_API_KEY) return fallback;
  if (agnesModelCache.expiresAt>Date.now()) return agnesModelCache.models;
  try {
    const response=await fetch(`${AGNES_BASE_URL}/models`,{headers:{Authorization:`Bearer ${AGNES_API_KEY}`},signal:AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`Agnes models failed ${response.status}`);
    const body=await response.json();
    const items=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:Array.isArray(body)?body:[];
    const discovered=items.map(agnesModelFromItem).filter(Boolean);
    const merged=new Map(fallback.map(model=>[model.modelId,model]));
    for (const model of discovered) merged.set(model.modelId,{...merged.get(model.modelId),...model});
    agnesModelCache={expiresAt:Date.now()+300_000,models:[...merged.values()]};
    return agnesModelCache.models;
  } catch { return fallback; }
}

let apimartModelCache={expiresAt:0,models:[]};
function cachedApimartModels() {
  const raw=providerSettings.APIMART_MODELS;
  try{const items=Array.isArray(raw)?raw:(typeof raw==='string'?JSON.parse(raw||'[]'):[]);return items.map(apimartModelDescriptor).filter(Boolean);}catch{return[];}
}
async function persistProviderSettings() {
  await fsp.writeFile(PROVIDER_SETTINGS_FILE,JSON.stringify(providerSettings,null,2));try{await fsp.chmod(PROVIDER_SETTINGS_FILE,0o600);}catch{}
}
function apimartModelDescriptor(item) {
  const modelId=String(typeof item==='string'?item:item?.id||item?.name||'').trim();if(!modelId)return null;
  const declared=[item?.type,item?.category,item?.modality,item?.model_type,...(Array.isArray(item?.capabilities)?item.capabilities:[])].filter(Boolean).join(' ').toLowerCase(),id=modelId.toLowerCase();
  if(/(?:audio|speech|tts|whisper|embedding|moderation)/.test(declared)||/(?:^|[-_.])(?:tts|whisper|embedding|moderation)(?:$|[-_.])/.test(id))return null;
  const video=declared.includes('video')||/(?:video|seedance|sora|veo|hailuo|minimax-h3|flux-3-video|skyreels|happyhorse|kling|vidu|pixverse|omni-flash)/.test(id)||(/wan2[.-][567]/.test(id)&&!id.includes('image'));
  const image=!video&&(declared.includes('image')||/(?:image|imagen|seedream|flux|qwen-image|midjourney|nano-banana|z-image)/.test(id));
  if(video)return {providerId:'apimart',modelId,displayName:`APIMart · ${modelId}`,capabilities:['video.generate','video.image_to_video','video.first_last_frame','video.reference'],constraints:{durations:[4,5,6,8,10,12,15],aspectRatios:['16:9','9:16','1:1','4:3','3:4','21:9','adaptive'],resolutions:['480p','720p','1080p','4k'],audioModes:['ambient','silent','music','voiceover','full'],maxImageRefs:9,maxVideoRefs:3,maxAudioRefs:3},configured:true};
  if(image)return {providerId:'apimart',modelId,displayName:`APIMart · ${modelId}`,capabilities:['image.generate','image.edit'],constraints:{aspectRatios:['1:1','16:9','9:16','4:3','3:4','3:2','2:3','5:4','4:5','2:1','1:2','3:1','1:3','21:9','9:21'],resolutions:['1K','2K','4K'],maxImageRefs:16},configured:true};
  return {providerId:'apimart',modelId,displayName:`APIMart · ${modelId}`,capabilities:['text.generate'],constraints:{},configured:true};
}
async function availableApimartModels(strict=false) {
  if(!APIMART_API_KEY)return[];if(!strict)return cachedApimartModels();if(apimartModelCache.expiresAt>Date.now())return apimartModelCache.models;
  try{const response=await fetch(`${APIMART_BASE_URL}/models`,{headers:{Authorization:`Bearer ${APIMART_API_KEY}`},signal:AbortSignal.timeout(8_000)}),body=await response.json().catch(()=>({}));if(!response.ok)throw providerHttpError('APIMart models',response,body);const items=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:Array.isArray(body)?body:[];const models=items.map(apimartModelDescriptor).filter(Boolean);if(!models.length)throw new Error('APIMart models returned an empty list');providerSettings.APIMART_MODELS=items;await persistProviderSettings();apimartModelCache={expiresAt:Date.now()+300_000,models};return models;}catch(error){apimartModelCache={expiresAt:0,models:[]};const detail=error.message==='fetch failed'?'无法连接 APIMart，请检查网络或代理设置':sanitizeProviderMessage(error.message);throw Object.assign(new Error(`APIMart 模型拉取失败：${error.status===402?'余额不足，请先在 APIMart 充值或确认额度。':''}${detail}`),{status:error.status||502});}
}
function enabledApimartModels(models) {
  if(!Object.hasOwn(providerSettings,'APIMART_ENABLED_MODELS'))return models;const enabled=new Set(String(providerSettings.APIMART_ENABLED_MODELS||'').split(',').map(id=>id.trim()).filter(Boolean));return models.filter(model=>enabled.has(model.modelId));
}
function apimartSettingsPayload(models) {
  const enabled=enabledApimartModels(models);return {apimartModels:models,enabledApimartModelIds:enabled.map(model=>model.modelId)};
}
function textProviderModel(providerId, label, modelId) {
  return modelId&&{providerId,modelId,displayName:`${label} · ${modelId}`,capabilities:['text.generate'],constraints:{},configured:true};
}
function bailianImageProviderModel() {
  return BAILIAN_IMAGE_MODEL&&{providerId:'bailian',modelId:BAILIAN_IMAGE_MODEL,displayName:`百炼 · ${BAILIAN_IMAGE_MODEL}`,capabilities:['image.generate'],constraints:{aspectRatios:['1:1','16:9','9:16','4:3','3:4'],resolutions:['1K','2K'],maxImageRefs:0},configured:true};
}
function bailianVideoProviderModel() {
  return BAILIAN_VIDEO_MODEL&&{providerId:'bailian',modelId:BAILIAN_VIDEO_MODEL,displayName:`百炼 · ${BAILIAN_VIDEO_MODEL}`,capabilities:['video.generate'],constraints:{durations:[2,3,4,5,6,7,8,9,10,11,12,13,14,15],aspectRatios:['16:9','9:16','1:1','4:3','3:4'],resolutions:['720P','1080P'],maxImageRefs:0},configured:true};
}

async function listModels() {
  const models = [];
  if (AGNES_API_KEY) models.push(...agnesConfiguredModels());
  if (APIMART_API_KEY) models.push(...enabledApimartModels(await availableApimartModels()));
  if (DEEPSEEK_API_KEY) models.push(textProviderModel('deepseek','DeepSeek',DEEPSEEK_TEXT_MODEL));
  if (BAILIAN_API_KEY) models.push(textProviderModel('bailian','百炼',BAILIAN_TEXT_MODEL),bailianImageProviderModel(),bailianVideoProviderModel());
  return models;
}

function agentConfig() {
  return {
    agnesKey:AGNES_API_KEY, agnesBase:AGNES_BASE_URL, agnesModel:AGNES_AGENT_MODEL,
    apimartKey:APIMART_API_KEY, apimartBase:APIMART_CHAT_BASE_URL,
    deepseekKey:DEEPSEEK_API_KEY, deepseekBase:DEEPSEEK_BASE_URL, deepseekModel:DEEPSEEK_AGENT_MODEL,
    bailianKey:BAILIAN_API_KEY, bailianBase:BAILIAN_BASE_URL, bailianModel:BAILIAN_AGENT_MODEL,
  };
}

let agentModelCache={expiresAt:0,models:[]};
async function availableAgentModels() {
  const configured=configuredAgentModels(agentConfig()),apimart=enabledApimartModels(await availableApimartModels()).filter(model=>model.capabilities.includes('text.generate')).map(({providerId,modelId,displayName,configured})=>({providerId,modelId,displayName,configured}));if(!AGNES_API_KEY)return[...configured,...apimart];
  if(agentModelCache.expiresAt>Date.now())return agentModelCache.models;
  try{
    const response=await fetch(`${AGNES_BASE_URL}/models`,{headers:{Authorization:`Bearer ${AGNES_API_KEY}`},signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error(`Agnes models failed ${response.status}`);const body=await response.json();const items=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:Array.isArray(body)?body:[];const ids=[...new Set(items.map(item=>typeof item==='string'?item:item?.id||item?.name).filter(id=>typeof id==='string'&&id.trim()&&!/(?:image|video)/i.test(id)).map(id=>id.trim()))];const models=[AGNES_AGENT_MODEL,...ids.filter(id=>id!==AGNES_AGENT_MODEL)].map(modelId=>({providerId:'agnes',modelId,displayName:`Agnes · ${modelId}`,configured:true}));agentModelCache={expiresAt:Date.now()+300_000,models:[...configured.filter(model=>model.providerId!=='agnes'),...apimart,...models]};return agentModelCache.models;
  }catch{return [...configured,...apimart];}
}

const GENERATION_REFERENCE_ROLES = new Set(['first-frame','last-frame','reference-image','reference-video','reference-audio']);
const SEMANTIC_REFERENCE_ROLES = new Set(['subject','style','composition','content','motion','audio','continuity']);
function normalizeGenerationReference(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const ref = { ...raw, assetId: String(raw.assetId || ''), role: String(raw.role || '') };
  ref.source = raw.source || (raw.timelineItemId ? 'timeline' : raw.sourceNodeId ? 'node' : 'asset');
  if (!['asset','node','timeline'].includes(ref.source)) throw Object.assign(new Error(`unsupported reference source: ${ref.source}`), { status: 400 });
  ref.semanticRole = raw.semanticRole || (['first-frame','last-frame'].includes(ref.role) ? 'continuity' : ref.role === 'reference-video' ? 'motion' : ref.role === 'reference-audio' ? 'audio' : 'subject');
  if (!SEMANTIC_REFERENCE_ROLES.has(ref.semanticRole)) throw Object.assign(new Error(`unsupported semantic reference role: ${ref.semanticRole}`), { status: 400 });
  if (raw.label != null) ref.label = String(raw.label).slice(0, 240);
  if (raw.region != null) {
    const region = Object.fromEntries(['x','y','width','height'].map(key => [key, Number(raw.region?.[key])]));
    if (!Object.values(region).every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) throw Object.assign(new Error('reference region must fit within normalized 0..1 bounds'), { status: 400 });
    ref.region = region;
  }
  const range = raw.timelineRange || (raw.timelineItemId ? { startFrame: raw.sourceInFrame, endFrame: raw.sourceOutFrame } : null);
  if (range) {
    const startFrame = Number(range.startFrame), endFrame = Number(range.endFrame);
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || startFrame < 0 || endFrame <= startFrame) throw Object.assign(new Error('timeline reference has an empty source range'), { status: 400 });
    ref.timelineRange = { startFrame, endFrame };
  }
  return ref;
}

function validateGenerationRequest(model, body, references) {
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { status: 400 });
  const params = body.params && typeof body.params === 'object' ? body.params : {};
  const c = model.constraints || {};
  if (c.durations?.length && params.duration != null && !c.durations.map(Number).includes(Number(params.duration))) {
    throw Object.assign(new Error(`duration must be one of: ${c.durations.join(', ')}`), { status: 400 });
  }
  if (c.aspectRatios?.length && params.aspectRatio && !c.aspectRatios.includes(params.aspectRatio)) {
    throw Object.assign(new Error(`aspectRatio must be one of: ${c.aspectRatios.join(', ')}`), { status: 400 });
  }
  const legacyAgnesImage4K = model.providerId === 'agnes' && body.capability.startsWith('image.') && String(params.resolution || params.quality || '').toUpperCase() === '4K';
  if (c.resolutions?.length && params.resolution && !c.resolutions.includes(params.resolution) && !legacyAgnesImage4K) {
    throw Object.assign(new Error(`resolution must be one of: ${c.resolutions.join(', ')}`), { status: 400 });
  }
  if (body.capability.startsWith('image.')) {
    const variants = Math.round(Number(params.variants || 1) || 1);
    if (variants < 1 || variants > 4) throw Object.assign(new Error('variants must be between 1 and 4'), { status: 400 });
  }
  const counts = { image: 0, video: 0, audio: 0 };
  let first = 0, last = 0;
  for (const ref of references) {
    const asset = state.assets[ref.assetId];
    if (!asset || asset.projectId !== body.projectId) throw Object.assign(new Error(`invalid reference: ${ref.assetId}`), { status: 400 });
    counts[asset.kind] = (counts[asset.kind] || 0) + 1;
    if (ref.role === 'first-frame') first++;
    if (ref.role === 'last-frame') last++;
    if (['first-frame','last-frame','reference-image'].includes(ref.role) && asset.kind !== 'image') throw Object.assign(new Error(`${ref.role} requires an image asset`), { status: 400 });
    if (ref.role === 'reference-video' && asset.kind !== 'video') throw Object.assign(new Error('reference-video requires a video asset'), { status: 400 });
    if (ref.role === 'reference-audio' && asset.kind !== 'audio') throw Object.assign(new Error('reference-audio requires an audio asset'), { status: 400 });
    if (!GENERATION_REFERENCE_ROLES.has(ref.role)) throw Object.assign(new Error(`unsupported reference role: ${ref.role}`), { status: 400 });
    if (ref.timelineItemId && !ref.timelineRange && Number(ref.sourceOutFrame || 0) <= Number(ref.sourceInFrame || 0)) throw Object.assign(new Error('timeline reference has an empty source range'), { status: 400 });
    if (ref.timelineRange && Number(ref.timelineRange.endFrame) <= Number(ref.timelineRange.startFrame)) throw Object.assign(new Error('timeline reference has an empty source range'), { status: 400 });
  }
  if (body.capability === 'image.edit' && !counts.image) throw Object.assign(new Error('image.edit requires an image reference'), { status: 400 });
  if (last && !first) throw Object.assign(new Error('last-frame requires first-frame'), { status: 400 });
  if (body.capability === 'video.generate' && references.length) throw Object.assign(new Error('text-to-video does not accept media references'), { status: 400 });
  if (body.capability === 'video.image_to_video' && first !== 1) throw Object.assign(new Error('image-to-video requires exactly one first-frame image'), { status: 400 });
  if (body.capability === 'video.first_last_frame' && (first !== 1 || last !== 1)) throw Object.assign(new Error('first/last-frame generation requires exactly one first-frame and one last-frame'), { status: 400 });
  if (body.capability === 'video.reference' && !(counts.image || counts.video || counts.audio)) throw Object.assign(new Error('reference generation requires at least one reference asset'), { status: 400 });
  if (c.maxImageRefs != null && counts.image > c.maxImageRefs) throw Object.assign(new Error(`too many image references; maximum is ${c.maxImageRefs}`), { status: 400 });
  if (c.maxVideoRefs != null && counts.video > c.maxVideoRefs) throw Object.assign(new Error(`too many video references; maximum is ${c.maxVideoRefs}`), { status: 400 });
  if (c.maxAudioRefs != null && counts.audio > c.maxAudioRefs) throw Object.assign(new Error(`too many audio references; maximum is ${c.maxAudioRefs}`), { status: 400 });
}

function preflightProviderRequest(model, request) {
  // No longer enforce PUBLIC_BASE_URL for Agnes video - providerImageReferenceValue supports data-uri fallback
}

function computeInitialTags({kind, metadata, source}) {
  const tags = [kind];
  if (source === 'upload') tags.push('uploaded');
  else tags.push('generated');
  if (metadata?.provider) tags.push(String(metadata.provider).toLowerCase());
  return [...new Set(tags)];
}

function addAsset({ projectId, kind, filename, mime, localPath, metadata = {}, source = 'upload' }) {
  const id = randomUUID();
  const rel = basename(localPath);
  const tags = computeInitialTags({ kind, metadata, source });
  const asset = { id, projectId, kind, filename, mime, localPath: rel, publicUrl: `/media/assets/${encodeURIComponent(rel)}`, width: metadata.width, height: metadata.height, durationMs: metadata.durationMs, metadata: { ...metadata, source }, tags, createdAt: now(), updatedAt: now() };
  state.assets[id] = asset;
  return asset;
}

function execFile(command, args, { cwd, timeout = 120000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command} timeout`)); }, timeout);
    child.stdout.on('data', c => stdout += c);
    child.stderr.on('data', c => stderr += c);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`)); });
  });
}

async function mediaMetadata(file) {
  try {
    const { stdout } = await execFile('ffprobe', ['-v','error','-print_format','json','-show_streams','-show_format', file], { timeout: 15000 });
    const data = JSON.parse(stdout); const video = data.streams?.find(s => s.codec_type === 'video');
    const audio = data.streams?.find(s => s.codec_type === 'audio');
    return { width: video?.width, height: video?.height, hasAudio: Boolean(audio), durationMs: data.format?.duration ? Math.round(Number(data.format.duration) * 1000) : undefined };
  } catch { return {}; }
}

function sanitizeProviderMessage(value){return String(value||'').replace(/sk-[A-Za-z0-9*_-]+/g,'sk-***');}
function providerHttpError(label, response, data) {
  const error = new Error(sanitizeProviderMessage(`${label} failed ${response.status}: ${data?.error?.message || data?.message || String(data || '').slice(0,500)}`));
  error.status = response.status;
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    error.retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now());
  }
  return error;
}

async function agnesRequest(url, options, label, signal, timeoutMs=Number(process.env.AGNES_REQUEST_TIMEOUT_MS||180_000)) {
  const combined=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(Math.max(1,timeoutMs))]);
  let response;try{response=await fetch(url,{...options,signal:combined});}catch(error){if(signal?.aborted)throw abortError();if(error?.name==='TimeoutError')throw new Error(`${label} timed out after ${Math.round(timeoutMs/1000)} seconds`);throw error;}
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerHttpError(label, response, data);
  return data;
}
function isTransientFetchError(error) { return !error?.status && /fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(String(error?.message || error)); }
async function providerJson(url, options, label, signal) {
  const response=await fetch(url,{...options,signal});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw providerHttpError(label,response,data);return data;
}
async function providerPollJson(url, options, label, signal) {
  let delay=PROVIDER_RETRY_BASE_MS;
  while(true){try{return await providerJson(url,options,label,signal);}catch(error){if(error?.status!==429)throw error;await sleep(Math.min(MAX_PROVIDER_RETRY_DELAY_MS,Math.max(delay,error.retryAfterMs||0)),signal);delay=Math.min(MAX_PROVIDER_RETRY_DELAY_MS,delay*2);}}
}

function apimartPayload(data, label) {
  if (Number(data?.code || 200) >= 400) throw new Error(`${label} failed: ${data?.error?.message || data?.message || data.code}`);
  return data?.data && typeof data.data === 'object' ? data.data : data;
}

async function apimartTextGenerate(job, signal) {
  if(!APIMART_API_KEY)throw new Error('APIMART_API_KEY is not configured');const req=job.request;job.progress=12;await saveDb();
  const body={model:job.modelId,stream:false,messages:[{role:'system',content:String(req.params?.system||'You are a professional video creative assistant.')},{role:'user',content:req.prompt}],temperature:Number(req.params?.temperature??0.7)};
  const data=apimartPayload(await providerJson(`${APIMART_CHAT_BASE_URL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${APIMART_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'APIMart text',signal),'APIMart text');
  const content=data.choices?.[0]?.message?.content;
  if(typeof content==='string'&&content.trim())return content.trim();
  if(Array.isArray(content))return content.map(item=>item?.text||item?.content||'').join('\n').trim();
  throw new Error('APIMart text returned no content');
}
async function openAICompatibleTextGenerate(job, apiKey, baseUrl, label, signal) {
  if(!apiKey)throw new Error(`${label} API key is not configured`);const req=job.request;job.progress=12;await saveDb();
  const body={model:job.modelId,stream:false,messages:[{role:'system',content:String(req.params?.system||'You are a professional video creative assistant.')},{role:'user',content:req.prompt}],temperature:Number(req.params?.temperature??0.7)};
  const data=await providerJson(`${baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)},label,signal);
  const content=(data.data||data).choices?.[0]?.message?.content;
  if(typeof content==='string'&&content.trim())return content.trim();
  if(Array.isArray(content))return content.map(item=>item?.text||item?.content||'').join('\n').trim();
  throw new Error(`${label} returned no content`);
}
function bailianImageSize(modelId, params={}) {
  const ratio=String(params.aspectRatio||'1:1'),hi=/qwen-image-(?:2|3)\./.test(modelId),sizes=hi?{'16:9':'2688*1536','9:16':'1536*2688','1:1':'2048*2048','4:3':'2368*1728','3:4':'1728*2368'}:{'16:9':'1664*928','9:16':'928*1664','1:1':'1328*1328','4:3':'1472*1104','3:4':'1104*1472'};
  return sizes[ratio]||sizes['1:1'];
}
function imagePromptWithNegativeFallback(req) {
  const prompt=String(req.prompt||'').trim(),negative=String(req.params?.negativePrompt||'').trim();
  return negative?`${prompt}\n\nNegative constraints — do not generate any of the following:\n${negative}`:prompt;
}
async function bailianImageGenerate(job, signal) {
  if(!BAILIAN_API_KEY)throw new Error('BAILIAN_API_KEY is not configured');const req=job.request,params=req.params||{};
  const body={model:job.modelId,input:{messages:[{role:'user',content:[{text:req.prompt}]}]},parameters:{size:bailianImageSize(job.modelId,params),prompt_extend:true,watermark:false,n:1}};
  if(params.negativePrompt)body.parameters.negative_prompt=params.negativePrompt;job.progress=20;await saveDb();
  const data=await providerJson(`${BAILIAN_MEDIA_BASE_URL}/services/aigc/multimodal-generation/generation`,{method:'POST',headers:{Authorization:`Bearer ${BAILIAN_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'百炼 image',signal);
  const url=recursivelyFindUrl(data.output||data,'image');if(!url)throw new Error(`百炼 image returned no result URL: ${sanitizeProviderMessage(data.message||data.code||'empty output')}`);
  return ingestRemoteAsset(job.projectId,job.id,'image',url,{provider:'bailian',providerUrl:url,model:job.modelId,prompt:req.prompt,bailianResult:data},{},signal);
}
async function bailianVideoGenerate(job, signal) {
  if(!BAILIAN_API_KEY)throw new Error('BAILIAN_API_KEY is not configured');const req=job.request,params=req.params||{};let taskId=job.providerTaskId;
  if(!taskId){
    const body={model:job.modelId,input:{prompt:seedancePrompt(req)},parameters:{resolution:params.resolution||'720P',ratio:params.aspectRatio||'16:9',duration:Math.max(2,Math.min(15,Number(params.duration||5))),prompt_extend:true,watermark:false}};
    if(params.negativePrompt)body.input.negative_prompt=params.negativePrompt;
    const created=await providerJson(`${BAILIAN_MEDIA_BASE_URL}/services/aigc/video-generation/video-synthesis`,{method:'POST',headers:{Authorization:`Bearer ${BAILIAN_API_KEY}`,'Content-Type':'application/json','X-DashScope-Async':'enable'},body:JSON.stringify(body)},'百炼 video submit',signal);
    taskId=created.output?.task_id||created.task_id||created.id;if(!taskId)throw new Error(`百炼 video did not return task_id: ${sanitizeProviderMessage(created.message||created.code||'empty output')}`);job.providerTaskId=String(taskId);job.progress=5;await saveDb();
  }
  const deadline=Date.now()+Number(process.env.BAILIAN_TIMEOUT_MS||20*60*1000),interval=Math.max(20,Number(process.env.BAILIAN_POLL_INTERVAL_MS||2000));
  while(Date.now()<deadline){await sleep(interval,signal);if(job.status==='canceled')throw abortError();const data=await providerPollJson(`${BAILIAN_MEDIA_BASE_URL}/tasks/${encodeURIComponent(taskId)}`,{headers:{Authorization:`Bearer ${BAILIAN_API_KEY}`}},'百炼 video status',signal),output=data.output||data,status=String(output.task_status||output.status||'').toLowerCase();if(['succeeded','success','completed'].includes(status)){const url=recursivelyFindUrl(output,'video');if(!url)throw new Error('百炼 video completed without a result URL');job.progress=95;await saveDb();return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'bailian',providerUrl:url,model:job.modelId,prompt:req.prompt,bailianResult:data},{},signal);}if(['failed','fail','canceled','cancelled'].includes(status))throw new Error(`百炼 video failed: ${sanitizeProviderMessage(output.message||output.error_message||output.code||status)}`);job.progress=Math.max(job.progress||5,Math.min(90,Number(output.progress||job.progress||5)));await saveDb();}
  throw new Error('百炼 video generation timed out');
}

async function agnesTextGenerate(job, signal) {
  const req=job.request,maxAttempts=Math.max(1,Number(process.env.AGNES_TEXT_NETWORK_ATTEMPTS||2)),timeoutMs=Math.max(1,Number(process.env.AGNES_TEXT_TIMEOUT_MS||180_000));
  const body={model:job.modelId,stream:true,messages:[{role:'system',content:String(req.params?.system||'You are a professional video creative assistant.')},{role:'user',content:req.prompt}],temperature:Number(req.params?.temperature??0.7)};
  const contentText=content=>typeof content==='string'?content:Array.isArray(content)?content.map(item=>item?.text||item?.content||'').join('\n'):'';
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    job.providerAttempt=attempt;job.providerMaxAttempts=maxAttempts;job.outputText='';job.progress=12;job.updatedAt=now();await saveDb();
    const combined=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(timeoutMs)]);
    try{
      const response=await fetch(`${AGNES_BASE_URL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw providerHttpError('Agnes text',response,data);}
      if(!response.headers.get('content-type')?.includes('text/event-stream')){const data=await response.json().catch(()=>({})),result=contentText(data.choices?.[0]?.message?.content).trim();if(result)return result;throw new Error('Agnes text returned no content');}
      const reader=response.body?.getReader();if(!reader)throw new Error('Agnes text returned no stream');
      const decoder=new TextDecoder();let buffer='',result='',mode='unknown',lastSave=0;
      const consume=line=>{if(!line.startsWith('data:'))return;const value=line.slice(5).trim();if(!value||value==='[DONE]')return;let data;try{data=JSON.parse(value);}catch{return;}const delta=contentText(data.choices?.[0]?.delta?.content);if(!delta)return;if(result&&mode==='unknown')mode=delta.startsWith(result)?'cumulative':'incremental';result=mode==='cumulative'&&delta.startsWith(result)?delta:result+delta;job.outputText=result;job.progress=Math.min(90,12+Math.floor(result.length/300));job.updatedAt=now();};
      while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines)consume(line);if(Date.now()-lastSave>=1000){lastSave=Date.now();await saveDb();}}
      buffer+=decoder.decode();if(buffer)consume(buffer);if(result.trim())return result.trim();throw new Error('Agnes text returned no streamed content');
    }catch(error){
      if(signal?.aborted)throw abortError();const timedOut=error?.name==='TimeoutError';if(timedOut)error=new Error(`Agnes text timed out after ${Math.round(timeoutMs/1000)} seconds`);const retryable=timedOut||isTransientFetchError(error);if(!retryable||attempt>=maxAttempts)throw error;job.phase='retrying';job.error=`网络波动，准备第 ${attempt+1}/${maxAttempts} 次请求`;job.updatedAt=now();await saveDb();await sleep(Math.min(2000,500*2**(attempt-1)),signal);job.phase='generating';job.error='';
    }
  }
  throw new Error('Agnes text failed');
}

async function agnesImageGenerate(job, signal) {
  const req=job.request,refs=[];
  for(const reference of req.references||[]){const asset=state.assets[reference.assetId];if(asset?.projectId===job.projectId&&asset.kind==='image')refs.push(await providerImageReferenceValue(asset));}
  const extra_body={response_format:'url'};if(refs.length)extra_body.image=refs;
  const requestedSize=String(req.params?.quality||req.params?.resolution||'2K').toUpperCase();
  const size=['1K','2K'].includes(requestedSize)?requestedSize:'2K';
  const timeoutMs=Math.max(1,Number(process.env.AGNES_IMAGE_TIMEOUT_MS||600_000));
  const body={model:job.modelId,prompt:imagePromptWithNegativeFallback(req),size,ratio:req.params?.aspectRatio||'1:1',extra_body};
  job.progress=20;await saveDb();
  const data=await agnesRequest(`${AGNES_BASE_URL}/images/generations`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'Agnes image',signal,timeoutMs);
  const output=data.data?.[0];if(!output)throw new Error('Agnes image returned no output');
  if(output.b64_json){const filename=`${job.id}-agnes.png`,target=join(ASSETS_DIR,filename);await fsp.writeFile(target,Buffer.from(output.b64_json,'base64'));return addAsset({projectId:job.projectId,kind:'image',filename,mime:'image/png',localPath:target,metadata:{...(await mediaMetadata(target)),provider:'agnes',providerUrl:typeof output.url==='string'?output.url:undefined,localOnly:!output.url,model:job.modelId,prompt:req.prompt},source:'external'});}
  if(output.url)return ingestRemoteAsset(job.projectId,job.id,'image',output.url,{provider:'agnes',providerUrl:output.url,model:job.modelId,prompt:req.prompt,agnesResult:data},{},signal);
  throw new Error('Agnes image returned neither b64_json nor url');
}

function agnesVideoDimensions(resolution='720p',ratio='16:9') {
  const sizes={
    '480p':{'16:9':[832,448],'9:16':[448,832],'1:1':[640,640],'4:3':[768,576],'3:4':[576,768]},
    '720p':{'16:9':[1280,704],'9:16':[704,1280],'1:1':[768,768],'4:3':[1024,768],'3:4':[768,1024]},
    '1080p':{'16:9':[1920,1088],'9:16':[1088,1920],'1:1':[1088,1088],'4:3':[1472,1088],'3:4':[1088,1472]},
  };
  const [width,height]=(sizes[resolution]||sizes['720p'])[ratio]||sizes['720p']['16:9'];return{width,height};
}

function agnesPublicAssetUrl(asset) {
  if(PUBLIC_BASE_URL)return `${PUBLIC_BASE_URL}/media/assets/${encodeURIComponent(basename(asset.localPath))}`;
  if(typeof asset.metadata?.providerUrl==='string'&&/^https:\/\//i.test(asset.metadata.providerUrl))return asset.metadata.providerUrl;
  throw Object.assign(new Error('该图片没有 Agnes 可访问的公网地址。请在“模型/API → Agnes AI”配置素材公网地址，或改用支持内联图片的模型。'),{status:422,code:'reference_not_public'});
}

async function agnesVideoGenerate(job, signal) {
  const req=job.request;
  let videoId=job.providerTaskId;
  if(!videoId){
    const duration=Number(req.params?.duration||5),numFrames=({3:81,5:121,10:241,18:441})[duration]||121,frameRate=24,{width,height}=agnesVideoDimensions(String(req.params?.resolution||'720p'),String(req.params?.aspectRatio||'16:9'));
    const body={model:job.modelId,prompt:req.prompt,width,height,num_frames:numFrames,frame_rate:frameRate};
    if(req.params?.seed!==undefined&&req.params?.seed!=='')body.seed=Number(req.params.seed);if(req.params?.negativePrompt)body.negative_prompt=req.params.negativePrompt;
    const first=firstRef(job,['first-frame'],'image'),last=firstRef(job,['last-frame'],'image');
    if(req.capability==='video.image_to_video'&&first)body.image=await providerImageReferenceValue(first.asset);
    if(req.capability==='video.first_last_frame'&&first&&last){
      const refs=[];
      if(first)refs.push(await providerImageReferenceValue(first.asset));
      if(last)refs.push(await providerImageReferenceValue(last.asset));
      body.extra_body={image:refs,mode:'keyframes'};
    }
    const created=await agnesRequest(`${AGNES_BASE_URL}/videos`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'Agnes video submit',signal);
    videoId=created.video_id||created.task_id||created.id;if(!videoId)throw new Error('Agnes video did not return video_id');job.providerTaskId=String(videoId);job.progress=Number(created.progress||5);await saveDb();
  }
  const root=AGNES_BASE_URL.replace(/\/v1$/,'');const deadline=Date.now()+Number(process.env.AGNES_VIDEO_TIMEOUT_MS||20*60*1000),baseInterval=Math.max(20,Number(process.env.AGNES_POLL_INTERVAL_MS||5000));let interval=baseInterval;
  while(Date.now()<deadline){await sleep(interval,signal);if(job.status==='canceled')throw abortError();const query=new URL(`${root}/agnesapi`);query.searchParams.set('video_id',String(videoId));query.searchParams.set('model_name',job.modelId);let data;try{data=await agnesRequest(query,{headers:{Authorization:`Bearer ${AGNES_API_KEY}`}},'Agnes video status',signal);interval=baseInterval;}catch(error){if(error?.status===429){interval=Math.min(60000,Math.max(interval*2,error.retryAfterMs||0));continue;}throw error;}const status=String(data.status||'').toLowerCase();if(status==='completed'){const url=data.metadata?.url||data.url||recursivelyFindUrl(data,'video');if(!url)throw new Error('Agnes video completed without a result URL');return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'agnes',model:job.modelId,prompt:req.prompt,seconds:data.seconds,size:data.size,agnesResult:data},{},signal);}if(status==='failed')throw new Error(`Agnes video failed: ${data.error?.message||data.error||'unknown error'}`);job.progress=Math.max(job.progress||5,Number(data.progress||0));await saveDb();}
  throw new Error('Agnes video generation timed out');
}

async function safeRemoteUrl(raw) {
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('unsupported remote URL protocol');
  if (['localhost','0.0.0.0','::1'].includes(url.hostname)) throw new Error('blocked remote URL host');
  if (net.isIP(url.hostname)) {
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) throw new Error('blocked private remote IP');
  } else {
    const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    for (const a of addresses) if (a.family === 4 && (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(a.address) || /^172\.(1[6-9]|2\d|3[01])\./.test(a.address))) throw new Error('blocked private remote address');
  }
  return url;
}

async function normalizedProviderImage(asset) {
  const src=join(ASSETS_DIR,asset.localPath); const mime=contentTypeOnly(asset.mime||mimeFromExt(src));
  if (['image/png','image/jpeg','image/webp'].includes(mime)) return { path:src, mime };
  if (!HAS_FFMPEG) throw new Error(`reference image ${asset.filename} (${mime}) must be PNG/JPEG/WebP; install ffmpeg to normalize it`);
  const filename=`provider-${asset.id}.png`,target=join(ASSETS_DIR,filename);
  if (!existsSync(target)) await execFile('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',src,'-frames:v','1',target],{timeout:30000});
  return { path:target, mime:'image/png' };
}
async function providerImageReferenceValue(asset) {
  const normalized=await normalizedProviderImage(asset); const filename=basename(normalized.path);
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/media/assets/${encodeURIComponent(filename)}`;
  if (EXTERNAL_REFERENCE_MODE === 'data-uri') { const bytes=await fsp.readFile(normalized.path); if(bytes.length>20*1024*1024)throw new Error('reference image too large for data-uri; set PUBLIC_BASE_URL'); return `data:${normalized.mime};base64,${bytes.toString('base64')}`; }
  throw new Error('cloud image reference requires PUBLIC_BASE_URL or EXTERNAL_REFERENCE_MODE=data-uri');
}
function recursivelyFindUrl(value, kind) {
  const candidates = [];
  const walk = (v, key = '') => {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) candidates.push({ url: v, key: key.toLowerCase() });
    else if (Array.isArray(v)) v.forEach((x,i) => walk(x, `${key}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k,x]) => walk(x, k));
  };
  walk(value);
  const preferred = kind === 'image' ? /(image|images|png|jpg|jpeg|webp)/ : /(video|mp4|webm|mov)/;
  return candidates.find(c => preferred.test(c.key) || preferred.test(c.url.toLowerCase()))?.url || candidates[0]?.url;
}

const apimartImageUploads=new Map();
async function apimartImageUrl(asset, signal) {
  const cached=apimartImageUploads.get(asset.id);if(cached?.expiresAt>Date.now())return cached.url;
  const normalized=await normalizedProviderImage(asset),bytes=await fsp.readFile(normalized.path);if(bytes.length>20*1024*1024)throw new Error('APIMart reference image exceeds 20 MB');
  const form=new FormData();form.append('file',new Blob([bytes],{type:normalized.mime}),basename(normalized.path));
  const data=await providerJson(`${APIMART_BASE_URL}/uploads/images`,{method:'POST',headers:{Authorization:`Bearer ${APIMART_API_KEY}`},body:form},'APIMart image upload',signal);const url=data.url||data.data?.url;
  if(!url)throw new Error('APIMart image upload returned no URL');apimartImageUploads.set(asset.id,{url,expiresAt:Date.now()+70*60*60*1000});return url;
}
function apimartPublicAssetUrl(asset) {
  if(PUBLIC_BASE_URL)return `${PUBLIC_BASE_URL}${asset.publicUrl}`;
  if(typeof asset.metadata?.providerUrl==='string'&&/^https:\/\//i.test(asset.metadata.providerUrl))return asset.metadata.providerUrl;
  throw Object.assign(new Error('APIMart 视频/音频参考需要公网素材地址，请在“模型/API”中配置素材公网地址。'),{status:422,code:'reference_not_public'});
}
async function apimartGenerate(job, signal) {
  if(!APIMART_API_KEY)throw new Error('APIMART_API_KEY is not configured');const req=job.request,params=req.params||{},kind=req.capability.startsWith('image.')?'image':'video';let taskId=job.providerTaskId;
  if(!taskId){
    const body={model:job.modelId,prompt:kind==='video'?seedancePrompt(req):imagePromptWithNegativeFallback(req)};
    if(kind==='image'){
      body.n=1;body.size=params.aspectRatio||'1:1';body.resolution=String(params.resolution||params.quality||'2K').toLowerCase();
      const imageUrls=[];for(const ref of req.references||[]){const asset=state.assets[ref.assetId];if(asset?.projectId===job.projectId&&asset.kind==='image')imageUrls.push(await apimartImageUrl(asset,signal));}if(imageUrls.length)body.image_urls=imageUrls;
    }else{
      body.resolution=params.resolution||'720p';body.size=params.aspectRatio||'16:9';body.duration=Math.max(4,Math.min(15,Number(params.duration||5)));body.generate_audio=params.audioMode!=='silent'||params.generateAudio===true;
      if(params.seed!==undefined&&params.seed!=='')body.seed=Number(params.seed);if(params.returnLastFrame===true)body.return_last_frame=true;
      const images=[],roleImages=[],videos=[],audios=[];
      for(const ref of req.references||[]){const asset=state.assets[ref.assetId];if(!asset||asset.projectId!==job.projectId)continue;if(asset.kind==='image'){const url=await apimartImageUrl(asset,signal);if(req.capability==='video.first_last_frame')roleImages.push({url,role:ref.role==='last-frame'?'last_frame':'first_frame'});else images.push(url);}else if(asset.kind==='video')videos.push(apimartPublicAssetUrl(asset));else if(asset.kind==='audio')audios.push(apimartPublicAssetUrl(asset));}
      if(roleImages.length)body.image_with_roles=roleImages;else if(images.length)body.image_urls=images;if(videos.length)body.video_urls=videos;if(audios.length)body.audio_urls=audios;
    }
    const endpoint=kind==='image'?'images/generations':'videos/generations';const created=apimartPayload(await providerJson(`${APIMART_BASE_URL}/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${APIMART_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},`APIMart ${kind} submit`,signal),`APIMart ${kind} submit`);
    const ticket=Array.isArray(created)?created[0]:created;taskId=ticket?.task_id||ticket?.id;if(!taskId)throw new Error(`APIMart ${kind} did not return task_id`);job.providerTaskId=String(taskId);job.progress=5;await saveDb();
  }
  const deadline=Date.now()+Number(process.env.APIMART_TIMEOUT_MS||20*60*1000),interval=Math.max(20,Number(process.env.APIMART_POLL_INTERVAL_MS||2000));
  while(Date.now()<deadline){await sleep(interval,signal);if(job.status==='canceled')throw abortError();const payload=apimartPayload(await providerPollJson(`${APIMART_BASE_URL}/tasks/${encodeURIComponent(taskId)}?language=en`,{headers:{Authorization:`Bearer ${APIMART_API_KEY}`}},`APIMart ${kind} status`,signal),`APIMart ${kind} status`);const status=String(payload.status||'').toLowerCase();if(status==='completed'){const url=recursivelyFindUrl(payload.result||payload,kind);if(!url)throw new Error(`APIMart ${kind} completed without a result URL`);job.progress=95;await saveDb();return ingestRemoteAsset(job.projectId,job.id,kind,url,{provider:'apimart',providerUrl:url,model:job.modelId,prompt:req.prompt,apimartResult:payload},{},signal);}if(['failed','cancelled','canceled'].includes(status))throw new Error(`APIMart ${kind} failed: ${payload.error?.message||payload.message||status}`);job.progress=Math.max(job.progress||5,Math.min(90,Number(payload.progress||0)));await saveDb();}
  throw new Error(`APIMart ${kind} generation timed out`);
}

async function ingestRemoteAsset(projectId, jobId, kind, rawUrl, metadata = {}, downloadHeaders = {}, signal) {
  const url = await safeRemoteUrl(rawUrl);
  const response = await fetch(url, { redirect: 'follow', headers: downloadHeaders, signal });
  if (!response.ok || !response.body) throw new Error(`output download failed ${response.status}`);
  const mime = contentTypeOnly(response.headers.get('content-type') || '') || (kind === 'image' ? 'image/png' : 'video/mp4');
  const remoteName = cleanFilename(basename(url.pathname) || `${jobId}.${kind === 'image' ? 'png' : 'mp4'}`);
  const filename = `${jobId}-${remoteName}`;
  const target = join(ASSETS_DIR, filename);
  const file = createWriteStream(target, { flags: 'wx' });
  let size = 0;
  try {
    for await (const chunk of response.body) { size += chunk.length; if (size > MAX_REMOTE_BYTES) throw new Error('remote output exceeds MAX_REMOTE_BYTES'); if (!file.write(chunk)) await new Promise(r => file.once('drain', r)); }
    await new Promise((r,j) => file.end(err => err ? j(err) : r()));
  } catch (error) { file.destroy(); await fsp.rm(target, { force: true }); throw error; }
  return addAsset({ projectId, kind, filename, mime, localPath: target, metadata: { ...metadata, ...(await mediaMetadata(target)), size }, source: 'external' });
}


function firstRef(job, roles, kind) { for (const r of job.request.references||[]) { if (!roles.includes(r.role)) continue; const a=state.assets[r.assetId]; if(a&&a.projectId===job.projectId&&(!kind||a.kind===kind)) return {ref:r,asset:a}; } return null; }
const SEEDANCE_AUDIO_PREFIXES={
  silent:'【声音配置】静音模式。不要生成环境音、动作音效、背景音乐、人声口播或旁白。',
  ambient:'【声音配置】保留真实环境音和动作音效，例如脚步声、倒水声、开盖声、包装摩擦声、产品接触声和空间氛围声；不要人声口播，不要背景音乐。',
  music:'【声音配置】生成真实环境音、动作音效和轻快背景音乐；不要人声口播或旁白。背景音乐不能盖过关键动作音效。',
  voiceover:'【声音配置】生成真实环境音、动作音效和人声口播/旁白；背景音乐不生成或仅保留极轻的铺底音乐。口播节奏必须贴合画面动作。',
  full:'【声音配置】环境音、动作音效、背景音乐和人声口播全部允许。环境音要贴合画面动作，背景音乐要符合广告节奏，人声口播要清晰自然。'
};
const SEEDANCE_PRODUCT_LOCK_PREFIX='【通用产品外观硬约束】\n产品外观唯一以产品参考图和本次产品专属约束为准。分镜图只用于参考镜头顺序、构图、人物/手部/身体局部动作、场景、光线和画面节奏，不用于参考或覆盖产品外观。所有镜头中的产品必须保持产品参考图里的真实品类、轮廓、结构、颜色、材质、纹理、比例、包装/组合关系和可见关键识别细节。禁止把 logo、标识、文字、图案、标签或结构细节移动到错误物理位置，禁止为了规避生成难度而删除、弱化、放大、缩小或强行摆正。';
const SEEDANCE_GRID_PREFIX='【九宫格分镜直出规则】\n输入的3x3九宫格分镜图锁定9个镜头的读取顺序、构图、主体位置、场景、光线、人物/手部/产品动作、画面节奏和整体视觉风格。读取顺序固定为从上到下、从左到右。不得跳格、重排、合并成不可辨认的新镜头，也不得新增九宫格和脚本中不存在的场景、道具、人物动作或产品呈现方式。所有镜头必须符合真实物理世界逻辑。';
function seedancePrompt(req){
  const params=req.params||{},audioMode=SEEDANCE_AUDIO_PREFIXES[params.audioMode]?params.audioMode:'ambient',blocks=[SEEDANCE_AUDIO_PREFIXES[audioMode]];
  if(params.referenceMode==='grid-storyboard')blocks.push(SEEDANCE_GRID_PREFIX);
  if(params.injectProductLock===true||params.productLock)blocks.push(SEEDANCE_PRODUCT_LOCK_PREFIX);
  if(params.productLock)blocks.push(`【本次产品专属约束】\n${String(params.productLock).trim()}`);
  if(params.referenceNote)blocks.push(String(params.referenceNote).trim());
  blocks.push(req.prompt);
  return blocks.filter(Boolean).join('\n\n');
}
async function timelineItemOrThrow(project, itemId) {
  const item = (project.timeline?.items || []).find(i => i.id === itemId);
  if (!item) throw Object.assign(new Error('timeline item not found'), { status: 404 });
  return item;
}
function pickDuration(model, wanted) {
  const nums = (model.constraints?.durations || []).map(Number);
  if (!nums.length) return undefined;
  let best = nums[0];
  for (const d of nums) if (Math.abs(d - wanted) < Math.abs(best - wanted)) best = d;
  return best;
}
async function extractFrameAsset(project, jobId, asset, frameIndex, fps, label) {
  if (asset.kind === 'image') return asset;
  if (!HAS_FFMPEG) throw Object.assign(new Error(`锚点帧提取需要 ffmpeg（${label}）`), { status: 503 });
  const known = asset.durationMs ? Math.floor(asset.durationMs / 1000 * fps) - 1 : Number.POSITIVE_INFINITY;
  const frame = Math.max(0, Math.min(known, Math.floor(Number(frameIndex) || 0)));
  const filename = `${jobId}-${label}.png`, target = join(ASSETS_DIR, filename);
  await execFile('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(frame / fps), '-i', join(ASSETS_DIR, asset.localPath), '-frames:v', '1', target], { timeout: 30000 });
  return addAsset({ projectId: project.id, kind: 'image', filename, mime: 'image/png', localPath: target, metadata: { sourceAssetId: asset.id, frameIndex: frame, source: 'keyframe', label }, source: 'keyframe' });
}
function applyReshootToTimeline(job, asset) {
  const pr = state.projects[job.projectId]; if (!pr) return;
  const item = (pr.timeline?.items || []).find(i => i.id === job.request?.params?.reshootItemId);
  if (!item) return;
  Object.assign(item, { sourceAssetId: asset.id, kind: 'video', name: `${String(item.name || '片段')} · 重拍`, sourceInFrame: 0, sourceOutFrame: Number(item.durationInFrames || 1), playbackRate: 1 });
  pr.updatedAt = now();
}
function applyExtendToTimeline(job, asset) {
  const pr = state.projects[job.projectId]; if (!pr) return;
  const item = (pr.timeline?.items || []).find(i => i.id === job.request?.params?.extendAfterItemId);
  if (!item) return;
  const fps = Math.max(1, Number(pr.timeline?.fps || 30));
  const dur = Math.max(1, Math.round((asset.durationMs || 3000) / 1000 * fps));
  pr.timeline.items.push({
    id: randomUUID(), track: item.track, startFrame: Number(item.startFrame || 0) + Number(item.durationInFrames || 1),
    durationInFrames: dur, name: `${String(item.name || '片段')} · 续写`, kind: 'video', sourceAssetId: asset.id,
    sourceInFrame: 0, sourceOutFrame: dur, playbackRate: 1, volume: 1, opacity: 1, fadeInFrames: 0, fadeOutFrames: 0, transform: { x: 0, y: 0, scale: 1 },
  });
  pr.updatedAt = now();
}

async function runJob(id, signal) {
  const job = state.jobs[id]; if (!job || job.status === 'canceled') return;
  try {
    signal?.throwIfAborted(); job.progress = Math.max(3,Number(job.progress||0)); job.updatedAt = now(); await saveDb();
    const variants = job.capability.startsWith('image.') ? Math.max(1, Math.min(4, Math.round(Number(job.request.params?.variants || 1) || 1))) : 1;
    const assets = []; let outputText = null;
    job.phase = 'generating'; await saveDb();
    if (job.providerId === 'deepseek' && job.capability === 'text.generate') outputText = await openAICompatibleTextGenerate(job,DEEPSEEK_API_KEY,DEEPSEEK_BASE_URL,'DeepSeek text',signal);
    else if (job.providerId === 'bailian' && job.capability === 'text.generate') outputText = await openAICompatibleTextGenerate(job,BAILIAN_API_KEY,BAILIAN_BASE_URL,'百炼 text',signal);
    else if (job.providerId === 'bailian' && job.capability.startsWith('image.')) { for (let i = 0; i < variants; i++) assets.push(await bailianImageGenerate(job,signal)); }
    else if (job.providerId === 'bailian' && job.capability.startsWith('video.')) assets.push(await bailianVideoGenerate(job,signal));
    else if (job.providerId === 'apimart' && job.capability === 'text.generate') outputText = await apimartTextGenerate(job,signal);
    else if (job.providerId === 'apimart' && job.capability.startsWith('image.')) { for (let i = 0; i < variants; i++) assets.push(await apimartGenerate(job,signal)); }
    else if (job.providerId === 'apimart') assets.push(await apimartGenerate(job,signal));
    else if (job.providerId === 'agnes' && job.capability === 'text.generate') outputText = await agnesTextGenerate(job,signal);
    else if (job.providerId === 'agnes' && job.capability.startsWith('image.')) { for (let i = 0; i < variants; i++) assets.push(await agnesImageGenerate(job,signal)); }
    else if (job.providerId === 'agnes') assets.push(await agnesVideoGenerate(job,signal));
    else throw new Error(`unknown provider: ${job.providerId}`);
    if (job.status === 'canceled') return;
    job.phase = 'finalizing'; await saveDb();
    job.outputAssetIds = assets.map(a => a.id); job.outputText = outputText; job.status = 'succeeded'; job.phase = 'succeeded'; job.progress = 100; job.updatedAt = now();
    if (assets[0] && job.request?.params?.reshootItemId) applyReshootToTimeline(job, assets[0]);
    if (assets[0] && job.request?.params?.extendAfterItemId) applyExtendToTimeline(job, assets[0]);
    await saveDb();
  } catch (error) {
    if (job.status === 'canceled' || error?.name === 'AbortError') { job.status='canceled'; job.phase='canceled'; job.updatedAt = now(); await saveDb(); return; }
    const retryPhase = providerRetryPhase(error), maxAttempts = retryPhase === 'provider_busy' ? MAX_PROVIDER_BUSY_ATTEMPTS : MAX_PROVIDER_ATTEMPTS;
    // Resuming an already-submitted task is safe: adapters skip submit when providerTaskId is set and continue polling the same provider task, so requeue no longer risks a duplicate charge.
    if (retryPhase && Number(job.attempt||0) < maxAttempts) {
      const delay = retryDelay(error, job.attempt, retryPhase === 'provider_busy' ? PROVIDER_BUSY_RETRY_BASE_MS : PROVIDER_RETRY_BASE_MS); job.status='queued'; job.phase=retryPhase; job.nextAttemptAt=new Date(Date.now()+delay).toISOString(); job.progress=0; job.error=''; job.updatedAt=now(); await saveDb(); return;
    }
    job.status = 'failed'; job.phase = 'failed'; job.error = error instanceof Error ? error.message : String(error); job.updatedAt = now(); await saveDb();
  }
}

async function createExport(project) {
  if (!HAS_FFMPEG) throw Object.assign(new Error('ffmpeg is required for Timeline MP4 export'), { status: 503 });
  const timeline = project.timeline || { fps:30,width:1280,height:720,items:[],tracks:{} };
  const fps=Math.max(1,Number(timeline.fps||30)), width=Math.max(2,Number(timeline.width||1280)), height=Math.max(2,Number(timeline.height||720));
  const trackState=timeline.tracks||{}; const items=(timeline.items||[]).filter(i=>i.kind==='text'||state.assets[i.sourceAssetId]);
  const totalFrames=Math.max(1,...items.map(i=>Number(i.startFrame||0)+Number(i.durationInFrames||1))); const totalSec=totalFrames/fps;
  if(!items.some(i=>['image','video','text'].includes(i.kind)&&!trackState[i.track]?.hidden)) throw Object.assign(new Error('timeline has no visible image/video clips to export'),{status:400});
  const exportId=randomUUID(), work=join(EXPORTS_DIR,exportId); mkdirSync(work,{recursive:true});
  try {
    const args=['-hide_banner','-loglevel','error','-f','lavfi','-i',`color=c=black:s=${width}x${height}:r=${fps}:d=${totalSec}`];
    const inputInfo=[];
    for(const item of items){if(item.kind==='text')continue;const asset=state.assets[item.sourceAssetId], source=join(ASSETS_DIR,asset.localPath),rate=Math.max(.25,Math.min(4,Number(item.playbackRate||1))),outDur=Math.max(1/fps,Number(item.durationInFrames||1)/fps),sourceDur=asset.kind==='image'?outDur:outDur*rate,sourceIn=Math.max(0,Number(item.sourceInFrame||0)/fps);const index=inputInfo.length+1;if(asset.kind==='image')args.push('-loop','1','-t',String(sourceDur),'-i',source);else args.push('-ss',String(sourceIn),'-t',String(sourceDur),'-i',source);inputInfo.push({index,item,asset,rate,outDur,sourceDur,meta:asset.metadata?.hasAudio!==undefined?asset.metadata:await mediaMetadata(source)});}
    const filters=[]; let base='[0:v]'; let vstep=0;
    filters.push(`[0:v]format=rgba[base0]`); base='[base0]';
    const visualOrder={V1:1,V2:2}; const visuals=inputInfo.filter(x=>['image','video'].includes(x.item.kind)&&!trackState[x.item.track]?.hidden).sort((a,b)=>(visualOrder[a.item.track]||0)-(visualOrder[b.item.track]||0)||a.item.startFrame-b.item.startFrame);
    for(const info of visuals){const {index,item,rate,outDur}=info,start=Number(item.startFrame||0)/fps,opacity=Math.max(0,Math.min(1,Number(item.opacity??1))),fadeIn=Math.min(outDur,Math.max(0,Number(item.fadeInFrames||0)/fps)),fadeOut=Math.min(outDur,Math.max(0,Number(item.fadeOutFrames||0)/fps)),tr=item.transform||{},scale=Math.max(.1,Math.min(4,Number(tr.scale||1))),tx=Number(tr.x||0),ty=Number(tr.y||0);let chain=`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,fps=${fps}`;if(Math.abs(scale-1)>.001)chain+=`,scale=iw*${scale}:ih*${scale}`;if(info.asset.kind==='video'&&Math.abs(rate-1)>.001)chain+=`,setpts=PTS/${rate}`;else chain+=`,setpts=PTS`;chain+=`-STARTPTS+${start}/TB,colorchannelmixer=aa=${opacity}`;if(fadeIn>0)chain+=`,fade=t=in:st=${start}:d=${fadeIn}:alpha=1`;if(fadeOut>0)chain+=`,fade=t=out:st=${Math.max(start,start+outDur-fadeOut)}:d=${fadeOut}:alpha=1`;const vl=`v${vstep}`;filters.push(`${chain}[${vl}]`);const next=`base${vstep+1}`;filters.push(`${base}[${vl}]overlay=x='(W-w)/2+(${tx}/100)*W':y='(H-h)/2+(${ty}/100)*H':eof_action=pass:shortest=0[${next}]`);base=`[${next}]`;vstep++;}
    const captions=items.filter(i=>i.kind==='text'&&!trackState[i.track]?.hidden);let cstep=0;for(const item of captions){if(!FFMPEG_FONT_FILE)throw Object.assign(new Error('caption export requires a system font or FFMPEG_FONT_FILE'),{status:503});const textFile=join(work,`caption-${cstep}.txt`);await fsp.writeFile(textFile,String(item.text||item.name||''));const st=item.textStyle||{},start=Math.max(0,Number(item.startFrame||0)/fps),end=start+Math.max(1/fps,Number(item.durationInFrames||1)/fps),size=Math.max(12,Math.min(160,Number(st.fontSize||44))),x=Math.max(0,Math.min(100,Number(st.x??50))),y=Math.max(0,Math.min(100,Number(st.y??84))),color=/^#[0-9a-fA-F]{6}$/.test(st.color||'')?st.color:'#ffffff',opacity=Math.max(0,Math.min(1,Number(item.opacity??1))),next=`cap${cstep}`;const ep=v=>String(v).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'");filters.push(`${base}drawtext=fontfile='${ep(FFMPEG_FONT_FILE)}':textfile='${ep(textFile)}':fontcolor='${color}@${opacity}':fontsize=${size}:x='(w-text_w)*${x/100}':y='h*${y/100}-text_h/2':enable='between(t,${start},${end})'[${next}]`);base=`[${next}]`;cstep++;}
    filters.push(`${base}format=yuv420p[vout]`);
    const audios=[]; let ai=0;
    function atempo(rate){const parts=[];let r=rate;while(r>2){parts.push('atempo=2');r/=2;}while(r<.5){parts.push('atempo=0.5');r*=2;}parts.push(`atempo=${r.toFixed(5)}`);return parts.join(',');}
    for(const info of inputInfo){const {index,item,rate,outDur,meta}=info;if(trackState[item.track]?.muted)continue;const has=info.asset.kind==='audio'||(info.asset.kind==='video'&&meta?.hasAudio);if(!has)continue;const vol=Math.max(0,Math.min(4,Number(item.volume??1))),delay=Math.max(0,Math.round(Number(item.startFrame||0)/fps*1000)),fadeIn=Math.min(outDur,Math.max(0,Number(item.fadeInFrames||0)/fps)),fadeOut=Math.min(outDur,Math.max(0,Number(item.fadeOutFrames||0)/fps));let ch=`[${index}:a]asetpts=PTS-STARTPTS`;if(Math.abs(rate-1)>.001)ch+=`,${atempo(rate)}`;ch+=`,atrim=duration=${outDur},volume=${vol}`;if(fadeIn>0)ch+=`,afade=t=in:st=0:d=${fadeIn}`;if(fadeOut>0)ch+=`,afade=t=out:st=${Math.max(0,outDur-fadeOut)}:d=${fadeOut}`;ch+=`,adelay=${delay}|${delay}[a${ai}]`;filters.push(ch);audios.push(`[a${ai}]`);ai++;}
    if(audios.length)filters.push(`${audios.join('')}amix=inputs=${audios.length}:duration=longest:dropout_transition=0,atrim=duration=${totalSec}[aout]`);
    const filename=`export-${exportId}.mp4`,target=join(ASSETS_DIR,filename);args.push('-filter_complex',filters.join(';'),'-map','[vout]');if(audios.length)args.push('-map','[aout]','-c:a','aac','-b:a','192k');args.push('-t',String(totalSec),'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart','-y',target);
    await execFile('ffmpeg',args,{timeout:300000}); const asset=addAsset({projectId:project.id,kind:'video',filename,mime:'video/mp4',localPath:target,metadata:{...(await mediaMetadata(target)),exportedFromTimeline:true,composited:true},source:'timeline-export'}); await saveDb(); return asset;
  } finally { rmSync(work,{recursive:true,force:true}); }
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET'; const p = url.pathname;
  if (p === '/api/health' && method === 'GET') return json(res, 200, { ok: true, version: '2.0.0-standalone', node: process.version, providers: { agnes:Boolean(AGNES_API_KEY), apimart:Boolean(APIMART_API_KEY), deepseek:Boolean(DEEPSEEK_API_KEY), bailian:Boolean(BAILIAN_API_KEY) }, ffmpeg: HAS_FFMPEG, captionFont: Boolean(FFMPEG_FONT_FILE) });
  if (p === '/api/agent/models' && method === 'GET') return json(res,200,{models:await availableAgentModels()});
  if (p === '/api/provider-settings' && method === 'GET') {
    const settings={AGNES_API_KEY:'',AGNES_BASE_URL,AGNES_TEXT_MODEL,AGNES_AGENT_MODEL,AGNES_IMAGE_MODEL,AGNES_VIDEO_MODEL,APIMART_API_KEY:'',DEEPSEEK_API_KEY:'',DEEPSEEK_BASE_URL,DEEPSEEK_TEXT_MODEL,DEEPSEEK_AGENT_MODEL,BAILIAN_API_KEY:'',BAILIAN_BASE_URL,BAILIAN_MEDIA_BASE_URL,BAILIAN_TEXT_MODEL,BAILIAN_AGENT_MODEL,BAILIAN_IMAGE_MODEL,BAILIAN_VIDEO_MODEL,PUBLIC_BASE_URL},apimartModels=await availableApimartModels(),agnesModels=await availableAgnesModels();
    return json(res,200,{settings,configured:{agnes:Boolean(AGNES_API_KEY),apimart:Boolean(APIMART_API_KEY),deepseek:Boolean(DEEPSEEK_API_KEY),bailian:Boolean(BAILIAN_API_KEY)},agnesModels,...apimartSettingsPayload(apimartModels)});
  }
  if (p === '/api/provider-settings' && method === 'PUT') {
    const body=await readJson(req); const allowed=new Set(['AGNES_API_KEY','AGNES_BASE_URL','AGNES_TEXT_MODEL','AGNES_AGENT_MODEL','AGNES_IMAGE_MODEL','AGNES_VIDEO_MODEL','APIMART_API_KEY','APIMART_ENABLED_MODELS','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_TEXT_MODEL','DEEPSEEK_AGENT_MODEL','BAILIAN_API_KEY','BAILIAN_BASE_URL','BAILIAN_MEDIA_BASE_URL','BAILIAN_TEXT_MODEL','BAILIAN_AGENT_MODEL','BAILIAN_IMAGE_MODEL','BAILIAN_VIDEO_MODEL','PUBLIC_BASE_URL']);
    for(const [key,value] of Object.entries(body||{})){if(!allowed.has(key))continue;const v=String(value||'').trim();if(key==='APIMART_ENABLED_MODELS')providerSettings[key]=v;else if(v)providerSettings[key]=v;}if(body?.APIMART_API_KEY&&!Object.hasOwn(body,'APIMART_ENABLED_MODELS'))delete providerSettings.APIMART_ENABLED_MODELS;
    await persistProviderSettings(); refreshProviderRuntime();agentModelCache={expiresAt:0,models:[]};agnesModelCache={expiresAt:0,models:[]};apimartModelCache={expiresAt:0,models:[]};const pullApimart=APIMART_API_KEY&&(Object.hasOwn(body||{},'APIMART_API_KEY')||body?.APIMART_REFRESH_MODELS==='1');const apimartModels=pullApimart?await availableApimartModels(true):await availableApimartModels();
    const settings={AGNES_API_KEY:'',AGNES_BASE_URL,AGNES_TEXT_MODEL,AGNES_AGENT_MODEL,AGNES_IMAGE_MODEL,AGNES_VIDEO_MODEL,APIMART_API_KEY:'',DEEPSEEK_API_KEY:'',DEEPSEEK_BASE_URL,DEEPSEEK_TEXT_MODEL,DEEPSEEK_AGENT_MODEL,BAILIAN_API_KEY:'',BAILIAN_BASE_URL,BAILIAN_MEDIA_BASE_URL,BAILIAN_TEXT_MODEL,BAILIAN_AGENT_MODEL,BAILIAN_IMAGE_MODEL,BAILIAN_VIDEO_MODEL,PUBLIC_BASE_URL},agnesModels=await availableAgnesModels();
    return json(res,200,{ok:true,settings,models:await listModels(),configured:{agnes:Boolean(AGNES_API_KEY),apimart:Boolean(APIMART_API_KEY),deepseek:Boolean(DEEPSEEK_API_KEY),bailian:Boolean(BAILIAN_API_KEY)},agnesModels,...apimartSettingsPayload(apimartModels)});
  }
  if (p === '/api/models' && method === 'GET') return json(res, 200, { models: await listModels() });
  if (p === '/api/projects' && method === 'GET') return json(res, 200, { projects: Object.values(state.projects).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) });
  if (p === '/api/projects' && method === 'POST') {
    const body = await readJson(req); const id = randomUUID(); const ts = now();
    const project = { id, name: String(body.name || 'Untitled Project').slice(0,120), settings: {}, workflow: { version: 2, nodes: [], edges: [], sequence:null }, timeline: { fps: 30, width: 1280, height: 720, items: [], tracks: { C1:{muted:false,hidden:false}, V2:{muted:false,hidden:false}, V1:{muted:false,hidden:false}, A1:{muted:false,hidden:false}, A2:{muted:false,hidden:false} } }, agentRun:null, createdAt: ts, updatedAt: ts };
    state.projects[id] = project; await saveDb(); return json(res, 201, project);
  }
  let m = p.match(/^\/api\/projects\/([^/]+)$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr) : notFound(res); }
  if (m && method === 'DELETE') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    delete state.projects[m[1]];
    for (const key of Object.keys(state.jobs)) if (state.jobs[key].projectId === m[1]) delete state.jobs[key];
    for (const key of Object.keys(state.assets)) if (state.assets[key].projectId === m[1]) delete state.assets[key];
    await saveDb(); return json(res, 200, { ok: true });
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent$/);
  if (m && method === 'GET') { const pr=projectOr404(m[1]); if(!pr)return notFound(res); return json(res,200,ensureAgentSession(pr)); }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent\/run$/);
  if (m && method === 'GET') { const pr=projectOr404(m[1]); if(!pr)return notFound(res); return json(res,200,{run:agentRunFor(pr),quality:agentQuality(pr)}); }
  if (m && method === 'POST') { const pr=projectOr404(m[1]); if(!pr)return notFound(res); const body=await readJson(req); const run=createAgentRun(pr,String(body.mode||'first-shot'));pr.updatedAt=now();await saveDb();return json(res,201,{run}); }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent\/run\/([^/]+)$/);
  if (m && method === 'PATCH') { const pr=projectOr404(m[1]);if(!pr)return notFound(res);const run=pr.agentRun;if(!run||run.id!==m[2])return notFound(res);const body=await readJson(req),task=run.tasks.find(item=>item.id===body.taskId);if(!task)return json(res,404,{error:'task_not_found'});if(['succeeded','failed','canceled'].includes(body.status))task.status=body.status;task.error=String(body.error||'');if(run.tasks.every(item=>item.status==='succeeded'))run.status='completed';else if(run.tasks.some(item=>item.status==='failed'))run.status='failed';run.updatedAt=now();pr.updatedAt=now();await saveDb();return json(res,200,{run:agentRunFor(pr)}); }
  if (m && method === 'POST') { const pr=projectOr404(m[1]);if(!pr)return notFound(res);const run=pr.agentRun;if(!run||run.id!==m[2])return notFound(res);const action=url.searchParams.get('action');if(action==='pause'&&['queued','running'].includes(run.status))run.status='paused';else if(action==='resume'&&run.status==='paused')run.status='running';else if(action==='cancel'&&!['completed','failed','canceled'].includes(run.status)){run.status='canceled';run.tasks=run.tasks.map(task=>task.status==='queued'?{...task,status:'canceled'}:task);}else return json(res,409,{error:'invalid_run_action',message:'当前 Run 状态不支持此操作'});run.updatedAt=now();pr.updatedAt=now();await saveDb();return json(res,200,{run:agentRunFor(pr)}); }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent\/quality$/);
  if (m && method === 'GET') { const pr=projectOr404(m[1]);if(!pr)return notFound(res);return json(res,200,agentQuality(pr)); }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent$/);
  if (m && method === 'DELETE') {
    const pr=projectOr404(m[1]); if(!pr)return notFound(res); const mode=url.searchParams.get('mode');
    if(mode==='chat'){const session=ensureAgentSession(pr);session.messages=[];pr.updatedAt=now();await saveDb();return json(res,200,session);}
     pr.agentSession={version:1,selectedProviderId:'',selectedModelId:'',messages:[],proposals:[]};
     if(mode==='project')pr.agentRun=null;
    if(mode==='project'&&pr.workflow?.sequence)pr.workflow.sequence=null;
    pr.updatedAt=now(); await saveDb(); return json(res,200,mode==='project'?{session:pr.agentSession,workflow:pr.workflow}:pr.agentSession);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent\/messages$/);
  if (m && method === 'POST') {
    const pr=projectOr404(m[1]); if(!pr)return notFound(res); const body=await readJson(req); const content=String(body.content||'').trim();
    if(!content||content.length>12000)throw Object.assign(new Error('Agent message must be 1-12000 characters'),{status:400});
    const available=await availableAgentModels(), chosen=available.find(model=>model.providerId===body.providerId&&model.modelId===body.modelId);
    if(!chosen)throw Object.assign(new Error('Agent model is not configured'),{status:400});
    const session=ensureAgentSession(pr), userMessage={id:randomUUID(),role:'user',content,createdAt:now()};
    session.selectedProviderId=chosen.providerId;session.selectedModelId=chosen.modelId;session.messages.push(userMessage);session.messages=session.messages.slice(-100);pr.updatedAt=now();await saveDb();
    const streaming=String(req.headers.accept||'').includes('application/x-ndjson'),writeEvent=event=>{if(!res.writableEnded)res.write(`${JSON.stringify(event)}\n`);};if(streaming)res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'});
    const controller=new AbortController(),abort=()=>controller.abort();req.once('aborted',abort);res.once('close',abort);
    let reply;try{reply=await createAgentReply({project:pr,messages:session.messages,models:await listModels(),providerId:chosen.providerId,modelId:chosen.modelId,config:agentConfig(),signal:controller.signal,onMessageEvent:streaming?writeEvent:null});}catch(error){if(streaming){writeEvent({type:'error',message:error.message});res.end();return;}throw error;}finally{req.off('aborted',abort);res.off('close',abort);}
    let proposal=null;
    if(reply.kind==='proposal'){
      for(const item of session.proposals)if(item.status==='pending')item.status='superseded';
      proposal={id:randomUUID(),status:'pending',providerId:chosen.providerId,modelId:chosen.modelId,plan:reply.plan,appliedNodeIds:[],createdAt:now(),appliedAt:null};
      session.proposals.push(proposal);session.proposals=session.proposals.slice(-20);
    }
    const assistantMessage={id:randomUUID(),role:'assistant',content:reply.message,questions:reply.questions,proposalId:proposal?.id||null,createdAt:now()};
    session.messages.push(assistantMessage);session.messages=session.messages.slice(-100);pr.updatedAt=now();await saveDb();
    if(streaming){writeEvent({type:'final',message:assistantMessage,proposal,session});return res.end();}return json(res,201,{message:assistantMessage,proposal,session});
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent\/proposals\/([^/]+)\/apply$/);
  if (m && method === 'POST') {
    const pr=projectOr404(m[1]);if(!pr)return notFound(res);const session=ensureAgentSession(pr),proposal=session.proposals.find(item=>item.id===m[2]);if(!proposal)return notFound(res);
    const result=applyAgentProposal(pr,proposal,await listModels());pr.updatedAt=now();await saveDb();return json(res,200,{...result,proposal});
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/sequence\/clips\/([^/]+)\/review$/);
  if (m && method === 'POST') {
    const pr=projectOr404(m[1]);if(!pr)return notFound(res);const body=await readJson(req);
    const result=reviewSequenceClip(pr,m[2],String(body.decision||''),String(body.observedEndState||''),String(body.revisionNote||''),await listModels());pr.updatedAt=now();await saveDb();return json(res,200,result);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr.workflow) : notFound(res); }
  if (m && method === 'PUT') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const body = await readJson(req); pr.workflow = { version: Number(body.version || 1), nodes: Array.isArray(body.nodes) ? body.nodes : [], edges: Array.isArray(body.edges) ? body.edges : [], sequence:body.sequence&&typeof body.sequence==='object'?body.sequence:null }; pr.updatedAt = now(); await saveDb(); return json(res,200,pr.workflow); }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr.timeline) : notFound(res); }
  if (m && method === 'PUT') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const body = await readJson(req); pr.timeline = { fps: Number(body.fps || 30), width: Number(body.width || 1280), height: Number(body.height || 720), items: Array.isArray(body.items) ? body.items : [], tracks: body.tracks && typeof body.tracks === 'object' ? body.tracks : (pr.timeline.tracks || {}) }; pr.updatedAt = now(); await saveDb(); return json(res,200,pr.timeline); }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline\/reshoot$/);
  if (m && method === 'POST') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const body = await readJson(req);
    const item = await timelineItemOrThrow(pr, String(body.itemId || ''));
    const sourceKey=`timeline:reshoot:${item.id}`,existing=findExistingJob(pr.id,String(body.requestId||''),sourceKey);if(existing)return json(res,202,existing);
    if (!['video','image'].includes(item.kind)) return json(res,400,{error:'reshoot_requires_visual_clip',message:'重拍仅支持视频 / 图片片段'});
    const asset = state.assets[item.sourceAssetId]; if (!asset || asset.projectId !== pr.id) return json(res,400,{error:'invalid_asset'});
    const model = (await listModels()).find(x => x.providerId === body.providerId && x.modelId === body.modelId && x.capabilities.includes('video.first_last_frame'));
    if (!model) return json(res,400,{error:'model_not_available',message:'该模型不支持首尾帧锚定重拍'});
    if(model.providerId==='agnes'&&!PUBLIC_BASE_URL)throw Object.assign(new Error('Agnes 锚定重拍需要先配置素材公网地址。'),{status:422,code:'reference_not_public'});
    const fps = Math.max(1, Number(pr.timeline?.fps || 30));
    const sourceIn = Number(item.sourceInFrame || 0);
    const sourceOut = Math.max(sourceIn + 1, Number(item.sourceOutFrame || (sourceIn + Number(item.durationInFrames || 1) * Number(item.playbackRate || 1))) - 1);
    const anchorIn = await extractFrameAsset(pr, randomUUID(), asset, sourceIn, fps, 'anchor-in');
    const anchorOut = await extractFrameAsset(pr, randomUUID(), asset, sourceOut, fps, 'anchor-out');
    const prompt = String(body.prompt || '').trim() || '保持画面主体、光线与风格一致，重新生成此片段';
    const params = { ...(body.params || {}) };
    if (params.duration == null) { const picked = pickDuration(model, Math.max(1, Math.round(Number(item.durationInFrames || 1) / fps))); if (picked) params.duration = picked; }
    const jobRequest = { projectId: pr.id, capability: 'video.first_last_frame', providerId: model.providerId, modelId: model.modelId, prompt, params: { ...params, reshootItemId: item.id, timelineItemId: item.id, sourceInFrame: sourceIn, sourceOutFrame: sourceOut }, references: [
      { assetId: anchorIn.id, role: 'first-frame', timelineItemId: item.id, sourceInFrame: sourceIn, sourceOutFrame: sourceOut },
      { assetId: anchorOut.id, role: 'last-frame', timelineItemId: item.id, sourceInFrame: sourceIn, sourceOutFrame: sourceOut },
    ] };
    validateGenerationRequest(model, jobRequest, jobRequest.references);preflightProviderRequest(model,jobRequest);
    const job=await enqueueGeneration(jobRequest,{requestId:body.requestId,sourceKey});return json(res,202,job);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline\/extend$/);
  if (m && method === 'POST') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const body = await readJson(req);
    const item = await timelineItemOrThrow(pr, String(body.itemId || ''));
    const sourceKey=`timeline:extend:${item.id}`,existing=findExistingJob(pr.id,String(body.requestId||''),sourceKey);if(existing)return json(res,202,existing);
    if (item.kind === 'text') return json(res,400,{error:'extend_requires_visual_clip',message:'续写仅支持视频 / 图片片段'});
    const asset = state.assets[item.sourceAssetId]; if (!asset || asset.projectId !== pr.id) return json(res,400,{error:'invalid_asset'});
    const model = (await listModels()).find(x => x.providerId === body.providerId && x.modelId === body.modelId && x.capabilities.includes('video.image_to_video'));
    if (!model) return json(res,400,{error:'model_not_available',message:'该模型不支持首帧续写'});
    if(model.providerId==='agnes'&&!PUBLIC_BASE_URL)throw Object.assign(new Error('Agnes 续写接片需要先配置素材公网地址。'),{status:422,code:'reference_not_public'});
    const fps = Math.max(1, Number(pr.timeline?.fps || 30));
    const tailIdx = item.kind === 'image' ? 0 : Math.max(0, Number(item.sourceOutFrame || (Number(item.sourceInFrame || 0) + Number(item.durationInFrames || 1))) - 1);
    const tail = await extractFrameAsset(pr, randomUUID(), asset, tailIdx, fps, 'tail-frame');
    const prompt = String(body.prompt || '').trim() || '延续上一镜头的画面、主体与光线，继续生成';
    const params = { ...(body.params || {}) };
    if (params.duration == null) { const picked = pickDuration(model, Math.max(1, Math.round(Number(item.durationInFrames || 1) / fps))); if (picked) params.duration = picked; }
    const jobRequest = { projectId: pr.id, capability: 'video.image_to_video', providerId: model.providerId, modelId: model.modelId, prompt, params: { ...params, extendAfterItemId: item.id, timelineItemId: item.id }, references: [{ assetId: tail.id, role: 'first-frame', timelineItemId: item.id, sourceInFrame: tailIdx, sourceOutFrame: tailIdx + 1 }] };
    validateGenerationRequest(model, jobRequest, jobRequest.references);preflightProviderRequest(model,jobRequest);
    const job=await enqueueGeneration(jobRequest,{requestId:body.requestId,sourceKey});return json(res,202,job);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (m && method === 'GET') { if (!projectOr404(m[1])) return notFound(res); const tag=url.searchParams.get('tag'),kind=url.searchParams.get('kind'); return json(res,200,{ assets: projectAssets(m[1],{tag,kind}) }); }
  m = p.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const asset = state.assets[m[2]]; if (!asset || asset.projectId !== pr.id) return notFound(res);
    const removedNodeIds = new Set((pr.workflow?.nodes || []).filter(node => ['asset','upload'].includes(node.type) && node.data?.assetId === asset.id).map(node => node.id));
    pr.workflow.nodes = (pr.workflow?.nodes || []).filter(node => !removedNodeIds.has(node.id));
    pr.workflow.edges = (pr.workflow?.edges || []).filter(edge => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));
    for (const node of pr.workflow.nodes) { const data=node.data??={};data.outputAssetIds=(data.outputAssetIds||[]).filter(id=>id!==asset.id);data.variantAssetIds=(data.variantAssetIds||[]).filter(id=>id!==asset.id);data.presetReferences=(data.presetReferences||[]).filter(ref=>ref.assetId!==asset.id);if(['imageGen','videoGen'].includes(node.type)&&data.status==='succeeded'&&!data.outputAssetIds.length){data.status='idle';data.progress=0;} }
    pr.timeline.items = (pr.timeline?.items || []).filter(item => item.sourceAssetId !== asset.id);
    for (const job of Object.values(state.jobs)) if (job.projectId === pr.id) job.outputAssetIds=(job.outputAssetIds||[]).filter(id=>id!==asset.id);
    delete state.assets[asset.id]; await fsp.rm(join(ASSETS_DIR,basename(asset.localPath)),{force:true}); pr.updatedAt=now(); await saveDb();
    return json(res,200,{ok:true,workflow:pr.workflow,timeline:pr.timeline});
  }
  if (m && method === 'PATCH') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const asset = state.assets[m[2]]; if (!asset || asset.projectId !== pr.id) return notFound(res);
    const body = await readJson(req);
    const add = Array.isArray(body.add) ? body.add.map(String) : [];
    const remove = Array.isArray(body.remove) ? body.remove.map(String) : [];
    const current = Array.isArray(asset.tags) ? asset.tags : [];
    asset.tags = [...new Set([...current.filter(t => !remove.includes(t)), ...add])];
    asset.updatedAt = now();
    await saveDb();
    return json(res,200,asset);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/generations$/);
  if (m && method === 'GET') { if (!projectOr404(m[1])) return notFound(res); return json(res,200,{ generations: projectJobs(m[1]) }); }
  m = p.match(/^\/api\/projects\/([^/]+)\/assets\/upload$/);
  if (m && method === 'POST') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const rawName = safeDecode(req.headers['x-filename'] || url.searchParams.get('filename') || 'upload.bin'); const original = cleanFilename(rawName); const id = randomUUID(); const filename = `${id}-${original}`; const target = join(ASSETS_DIR, filename);
    let size = 0; const out = createWriteStream(target, { flags: 'wx' });
    try { for await (const chunk of req) { size += chunk.length; if (size > MAX_UPLOAD_BYTES) throw Object.assign(new Error('upload exceeds MAX_UPLOAD_BYTES'), { status: 413 }); if (!out.write(chunk)) await new Promise(r => out.once('drain', r)); } await new Promise((r,j) => out.end(e => e ? j(e) : r())); }
    catch (e) { out.destroy(); await fsp.rm(target,{force:true}); throw e; }
    const mime = contentTypeOnly(req.headers['content-type'] || '') || mimeFromExt(original); const kind = kindFromMime(mime, original); const asset = addAsset({ projectId: pr.id, kind, filename: original, mime, localPath: target, metadata: { size, ...(await mediaMetadata(target)) }, source: 'upload' }); await saveDb(); return json(res,201,asset);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline\/export$/);
  if (m && method === 'POST') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const asset = await createExport(pr); return json(res,201,asset); }
  if (p === '/api/generations' && method === 'POST') {
    const body = await readJson(req); const pr = projectOr404(body.projectId); if (!pr) return json(res,404,{error:'project_not_found'});
  const model = (await listModels()).find(x => x.providerId === body.providerId && x.modelId === body.modelId && x.capabilities.includes(body.capability)); if (!model) return json(res,400,{error:'model_not_available'});
    const references = Array.isArray(body.references) ? body.references.map(normalizeGenerationReference) : [];
    for (const ref of references) { const a = state.assets[ref.assetId]; if (!a || a.projectId !== pr.id) return json(res,400,{error:'invalid_reference',assetId:ref.assetId}); }
    const jobRequest = { projectId:pr.id, capability:String(body.capability), providerId:String(body.providerId), modelId:String(body.modelId), prompt:String(body.prompt||''), params:body.params||{}, references };
    validateGenerationRequest(model, jobRequest, references); preflightProviderRequest(model, jobRequest);
    const job = await enqueueGeneration(jobRequest,{requestId:body.requestId,sourceNodeId:body.sourceNodeId}); return json(res,202,job);
  }
  m = p.match(/^\/api\/generations\/([^/]+)$/);
  if (m && method === 'GET') { const job = state.jobs[m[1]]; if (!job) return notFound(res); return json(res,200,{...job, outputs:(job.outputAssetIds||[]).map(id=>state.assets[id]).filter(Boolean)}); }
  m = p.match(/^\/api\/generations\/([^/]+)\/cancel$/);
  if (m && method === 'POST') { const job = state.jobs[m[1]]; if (!job) return notFound(res); if (!['succeeded','failed','canceled'].includes(job.status)) { job.status='canceled'; job.phase='canceled'; job.nextAttemptAt=null; job.error=job.providerTaskId?'已停止本地等待；厂商任务可能继续运行。':''; job.updatedAt=now(); jobControllers.get(job.id)?.abort(); await saveDb(); scheduleJobs(); } return json(res,200,job); }
  m = p.match(/^\/api\/generations\/([^/]+)\/events$/);
  if (m && method === 'GET') {
    if (!state.jobs[m[1]]) return notFound(res);
    res.writeHead(200, { 'content-type':'text/event-stream', 'cache-control':'no-cache, no-transform', connection:'keep-alive' }); let closed=false; req.on('close',()=>closed=true);
    while (!closed) { const job=state.jobs[m[1]]; if (!job) break; res.write(`event: generation\ndata: ${JSON.stringify({...job,outputs:(job.outputAssetIds||[]).map(id=>state.assets[id]).filter(Boolean)})}\n\n`); if (['succeeded','failed','canceled'].includes(job.status)) break; await sleep(500); } return res.end();
  }
  return notFound(res);
}

function serveFile(req, res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return notFound(res);
  const stat = statSync(file); const type=mimeFromExt(file); const isMedia=file.startsWith(ASSETS_DIR)||file.startsWith(EXPORTS_DIR); const range=req.headers.range;
  if (isMedia && range) {
    const m=/bytes=(\d*)-(\d*)/.exec(range); if(!m){res.writeHead(416,{'content-range':`bytes */${stat.size}`});return res.end();}
    let start=m[1]?Number(m[1]):0,end=m[2]?Number(m[2]):stat.size-1;if(!m[1]&&m[2]){const suffix=Number(m[2]);start=Math.max(0,stat.size-suffix);end=stat.size-1;}start=Math.max(0,Math.min(stat.size-1,start));end=Math.max(start,Math.min(stat.size-1,end));
    res.writeHead(206,{'content-type':type,'content-length':end-start+1,'content-range':`bytes ${start}-${end}/${stat.size}`,'accept-ranges':'bytes','cache-control':'public, max-age=3600'});return createReadStream(file,{start,end}).pipe(res);
  }
  res.writeHead(200,{ 'content-type':type,'content-length':stat.size,'accept-ranges':isMedia?'bytes':'none','cache-control':isMedia?'public, max-age=3600':'no-cache' }); createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    if (url.pathname.startsWith('/media/assets/')) { const name = basename(safeDecode(url.pathname.slice('/media/assets/'.length))); return name&&name!=='.'?serveFile(req,res,join(ASSETS_DIR,name)):notFound(res); }
    if (url.pathname.startsWith('/vendor/icons/')) { const name=cleanFilename(safeDecode(url.pathname.slice('/vendor/icons/'.length))); if (/^[a-z0-9-]+\.svg$/.test(name)) return serveFile(req,res,join(TABLER_ICONS,name)); return notFound(res); }
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(req, res, join(PUBLIC,'index.html'));
    const rel = normalize(url.pathname).replace(/^[/\\]+/, ''); if (rel.includes('..')) return notFound(res); const file = join(PUBLIC, rel); if (file.startsWith(PUBLIC)) return serveFile(req,res,file); return notFound(res);
  } catch (error) {
    const status = error?.status || 500; console.error(error); return json(res,status,{ error: error?.code || (status >= 500 ? 'internal_error' : error.message), message: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LibTV Studio Standalone running at http://${HOST}:${PORT}`);
  console.log(`Data: ${DATA}`);
  console.log(`Providers: apimart=${Boolean(APIMART_API_KEY)} agnes=${Boolean(AGNES_API_KEY)} deepseek=${Boolean(DEEPSEEK_API_KEY)} bailian=${Boolean(BAILIAN_API_KEY)}`);
  console.log(`FFmpeg: ${HAS_FFMPEG} · Caption font: ${Boolean(FFMPEG_FONT_FILE)}`);
});
