import http from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import { applyAgentProposal, configuredAgentModels, createAgentReply, ensureAgentSession } from './agent.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
for (const envFile of [join(ROOT,'.env'), join(dirname(ROOT),'.env')]) { try { if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile); } catch (error) { console.warn(`Could not load ${envFile}:`, error.message); } }
const PUBLIC = join(ROOT, 'public');
const TABLER_ICONS = join(dirname(ROOT), 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const DATA = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const ASSETS_DIR = join(DATA, 'assets');
const EXPORTS_DIR = join(DATA, 'exports');
const DB_FILE = join(DATA, 'db.json');
const FIXTURES = join(ROOT, 'fixtures');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 512 * 1024 * 1024);
const MAX_REMOTE_BYTES = Number(process.env.MAX_REMOTE_BYTES || 1024 * 1024 * 1024);
const PROVIDER_SETTINGS_FILE = join(DATA, 'provider-settings.json');
let providerSettings = {};
try { if (existsSync(PROVIDER_SETTINGS_FILE)) providerSettings = JSON.parse(readFileSync(PROVIDER_SETTINGS_FILE,'utf8')); } catch { providerSettings = {}; }
const cfg = (key, fallback='') => String(providerSettings[key] || process.env[key] || fallback);
let FAL_KEY, ARK_API_KEY, ARK_BASE_URL, ARK_VIDEO_MODEL, ARK_IMAGE_MODEL, KLING_ACCESS_KEY, KLING_SECRET_KEY, KLING_BASE_URL, KLING_VIDEO_MODEL, GEMINI_API_KEY, GEMINI_AGENT_BASE_URL, GEMINI_AGENT_MODEL, VEO_BASE_URL, VEO_MODEL, FAL_IMAGE_MODEL, FAL_VIDEO_MODEL, FAL_VIDEO_IMAGE_MODEL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_TEXT_MODEL, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_AGENT_MODEL, AGNES_API_KEY, AGNES_BASE_URL, AGNES_TEXT_MODEL, AGNES_AGENT_MODEL, AGNES_IMAGE_MODEL, AGNES_VIDEO_MODEL, PUBLIC_BASE_URL;
function refreshProviderRuntime(){
  FAL_KEY = cfg('FAL_KEY');
  ARK_API_KEY = cfg('ARK_API_KEY', cfg('VOLCENGINE_API_KEY'));
  ARK_BASE_URL = cfg('ARK_BASE_URL','https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/,'');
  ARK_VIDEO_MODEL = cfg('ARK_VIDEO_MODEL',cfg('VOLCENGINE_VIDEO_MODEL','doubao-seedance-2-0-fast-260128'));
  ARK_IMAGE_MODEL = cfg('ARK_IMAGE_MODEL','doubao-seedream-4-0-250828');
  KLING_ACCESS_KEY = cfg('KLING_ACCESS_KEY');
  KLING_SECRET_KEY = cfg('KLING_SECRET_KEY');
  KLING_BASE_URL = cfg('KLING_BASE_URL','https://api.klingai.com').replace(/\/$/,'');
  KLING_VIDEO_MODEL = cfg('KLING_VIDEO_MODEL','kling-v3');
  GEMINI_API_KEY = cfg('GEMINI_API_KEY');
  GEMINI_AGENT_BASE_URL = cfg('GEMINI_AGENT_BASE_URL','https://generativelanguage.googleapis.com/v1beta').replace(/\/$/,'');
  GEMINI_AGENT_MODEL = cfg('GEMINI_AGENT_MODEL','gemini-2.5-flash');
  VEO_BASE_URL = cfg('VEO_BASE_URL','https://generativelanguage.googleapis.com/v1beta').replace(/\/$/,'');
  VEO_MODEL = cfg('VEO_MODEL','veo-3.1-generate-preview');
  FAL_IMAGE_MODEL = cfg('FAL_IMAGE_MODEL','fal-ai/qwen-image');
  FAL_VIDEO_MODEL = cfg('FAL_VIDEO_MODEL','fal-ai/wan/v2.7/text-to-video');
  FAL_VIDEO_IMAGE_MODEL = cfg('FAL_VIDEO_IMAGE_MODEL',FAL_VIDEO_MODEL);
  OPENAI_COMPAT_API_KEY = cfg('OPENAI_COMPAT_API_KEY');
  OPENAI_COMPAT_BASE_URL = cfg('OPENAI_COMPAT_BASE_URL','https://api.openai.com/v1').replace(/\/$/,'');
  OPENAI_COMPAT_TEXT_MODEL = cfg('OPENAI_COMPAT_TEXT_MODEL','gpt-5-mini');
  OPENAI_API_KEY = cfg('OPENAI_API_KEY',OPENAI_COMPAT_API_KEY);
  OPENAI_BASE_URL = cfg('OPENAI_BASE_URL',OPENAI_COMPAT_BASE_URL).replace(/\/$/,'');
  OPENAI_AGENT_MODEL = cfg('OPENAI_AGENT_MODEL',OPENAI_COMPAT_TEXT_MODEL);
  AGNES_API_KEY = cfg('AGNES_API_KEY');
  AGNES_BASE_URL = cfg('AGNES_BASE_URL','https://apihub.agnes-ai.com/v1').replace(/\/$/,'');
  AGNES_TEXT_MODEL = cfg('AGNES_TEXT_MODEL','agnes-2.5-flash');
  AGNES_AGENT_MODEL = cfg('AGNES_AGENT_MODEL',AGNES_TEXT_MODEL);
  AGNES_IMAGE_MODEL = cfg('AGNES_IMAGE_MODEL','agnes-image-2.1-flash');
  AGNES_VIDEO_MODEL = cfg('AGNES_VIDEO_MODEL','agnes-video-v2.0');
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
function projectAssets(projectId) { return Object.values(state.assets).filter(a => a.projectId === projectId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
function projectJobs(projectId) { return Object.values(state.jobs).filter(j => j.projectId === projectId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }

function listModels() {
  const models = [
    { providerId:'mock', modelId:'mock-text', displayName:'Mock Text', capabilities:['text.generate'], constraints:{}, configured:true },
    { providerId:'mock', modelId:'mock-image', displayName:'Mock Image', capabilities:['image.generate','image.edit'], constraints:{aspectRatios:['1:1','16:9','9:16','4:3','3:4']}, configured:true },
    { providerId:'mock', modelId:'mock-video', displayName:'Mock Video', capabilities:['video.generate','video.image_to_video','video.first_last_frame','video.reference'], constraints:{durations:[2],aspectRatios:['16:9','9:16']}, configured:true },
  ];
  if (OPENAI_COMPAT_API_KEY) models.push({providerId:'openai-compatible',modelId:OPENAI_COMPAT_TEXT_MODEL,displayName:`Text · ${OPENAI_COMPAT_TEXT_MODEL}`,capabilities:['text.generate'],constraints:{},configured:true});
  if (AGNES_API_KEY) models.push(
    {providerId:'agnes',modelId:AGNES_TEXT_MODEL,displayName:`Agnes Text · ${AGNES_TEXT_MODEL}`,capabilities:['text.generate'],constraints:{},configured:true},
    {providerId:'agnes',modelId:AGNES_IMAGE_MODEL,displayName:`Agnes Image · ${AGNES_IMAGE_MODEL}`,capabilities:['image.generate','image.edit'],constraints:{aspectRatios:['1:1','3:4','4:3','16:9','9:16','2:3','3:2','21:9'],resolutions:['1K','2K','3K','4K']},configured:true},
    {providerId:'agnes',modelId:AGNES_VIDEO_MODEL,displayName:`Agnes Video · ${AGNES_VIDEO_MODEL}`,capabilities:['video.generate','video.image_to_video','video.first_last_frame'],constraints:{durations:[3,5,10,18],aspectRatios:['16:9','9:16','1:1','4:3','3:4'],resolutions:['480p','720p','1080p'],maxImageRefs:2},configured:true},
  );
  if (ARK_API_KEY) {
    models.push({providerId:'seedream',modelId:ARK_IMAGE_MODEL,displayName:`Seedream · ${ARK_IMAGE_MODEL}`,capabilities:['image.generate','image.edit'],constraints:{aspectRatios:['1:1','16:9','9:16','4:3','3:4'],resolutions:['1K','2K','4K'],maxImageRefs:10},configured:true});
    models.push({providerId:'seedance',modelId:ARK_VIDEO_MODEL,displayName:`Seedance · ${ARK_VIDEO_MODEL}`,capabilities:['video.generate','video.image_to_video'],constraints:{durations:[5,10],aspectRatios:['16:9','9:16']},configured:true});
  }
  if (FAL_KEY) models.push(
    {providerId:'fal',modelId:FAL_IMAGE_MODEL,displayName:`fal · ${FAL_IMAGE_MODEL}`,capabilities:['image.generate'],constraints:{},configured:true},
    {providerId:'fal',modelId:FAL_VIDEO_MODEL,displayName:`fal · ${FAL_VIDEO_MODEL}`,capabilities:['video.generate'],constraints:{},configured:true},
    {providerId:'fal',modelId:FAL_VIDEO_IMAGE_MODEL,displayName:`fal · ${FAL_VIDEO_IMAGE_MODEL} · I2V`,capabilities:['video.image_to_video'],constraints:{},configured:true},
  );
  if (KLING_ACCESS_KEY && KLING_SECRET_KEY) models.push({providerId:'kling',modelId:KLING_VIDEO_MODEL,displayName:`Kling · ${KLING_VIDEO_MODEL}`,capabilities:['video.generate','video.image_to_video','video.first_last_frame'],constraints:{durations:[5,10],aspectRatios:['16:9','9:16']},configured:true});
  if (GEMINI_API_KEY) models.push({providerId:'veo',modelId:VEO_MODEL,displayName:`Google Veo · ${VEO_MODEL}`,capabilities:['video.generate','video.image_to_video','video.first_last_frame','video.reference'],constraints:{durations:[4,6,8],aspectRatios:['16:9','9:16'],resolutions:['720p','1080p','4k'],maxImageRefs:3,maxVideoRefs:1},configured:true});
  return models;
}

function agentConfig() {
  return {
    openaiKey:OPENAI_API_KEY, openaiBase:OPENAI_BASE_URL, openaiModel:OPENAI_AGENT_MODEL,
    geminiKey:GEMINI_API_KEY, geminiBase:GEMINI_AGENT_BASE_URL, geminiModel:GEMINI_AGENT_MODEL,
    agnesKey:AGNES_API_KEY, agnesBase:AGNES_BASE_URL, agnesModel:AGNES_AGENT_MODEL,
  };
}

let agentModelCache={expiresAt:0,models:[]};
async function availableAgentModels() {
  const configured=configuredAgentModels(agentConfig());if(!AGNES_API_KEY)return configured;
  if(agentModelCache.expiresAt>Date.now())return agentModelCache.models;
  try{
    const response=await fetch(`${AGNES_BASE_URL}/models`,{headers:{Authorization:`Bearer ${AGNES_API_KEY}`},signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error(`Agnes models failed ${response.status}`);const body=await response.json();const items=Array.isArray(body?.data)?body.data:Array.isArray(body?.models)?body.models:Array.isArray(body)?body:[];const ids=[...new Set(items.map(item=>typeof item==='string'?item:item?.id||item?.name).filter(id=>typeof id==='string'&&id.trim()&&!/(?:image|video)/i.test(id)).map(id=>id.trim()))];const models=[AGNES_AGENT_MODEL,...ids.filter(id=>id!==AGNES_AGENT_MODEL)].map(modelId=>({providerId:'agnes',modelId,displayName:`Agnes · ${modelId}`,configured:true}));agentModelCache={expiresAt:Date.now()+300_000,models:[...configured.filter(model=>model.providerId!=='agnes'),...models]};return agentModelCache.models;
  }catch{return configured;}
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
  if (c.resolutions?.length && params.resolution && !c.resolutions.includes(params.resolution)) {
    throw Object.assign(new Error(`resolution must be one of: ${c.resolutions.join(', ')}`), { status: 400 });
  }
  const counts = { image: 0, video: 0, audio: 0 };
  let first = 0, last = 0, refVideo = 0;
  for (const ref of references) {
    const asset = state.assets[ref.assetId];
    if (!asset || asset.projectId !== body.projectId) throw Object.assign(new Error(`invalid reference: ${ref.assetId}`), { status: 400 });
    counts[asset.kind] = (counts[asset.kind] || 0) + 1;
    if (ref.role === 'first-frame') first++;
    if (ref.role === 'last-frame') last++;
    if (ref.role === 'reference-video') refVideo++;
    if (['first-frame','last-frame','reference-image'].includes(ref.role) && asset.kind !== 'image') throw Object.assign(new Error(`${ref.role} requires an image asset`), { status: 400 });
    if (ref.role === 'reference-video' && asset.kind !== 'video') throw Object.assign(new Error('reference-video requires a video asset'), { status: 400 });
    if (ref.role === 'reference-audio' && asset.kind !== 'audio') throw Object.assign(new Error('reference-audio requires an audio asset'), { status: 400 });
    if (!['first-frame','last-frame','reference-image','reference-video','reference-audio'].includes(ref.role)) throw Object.assign(new Error(`unsupported reference role: ${ref.role}`), { status: 400 });
    if (ref.timelineItemId && Number(ref.sourceOutFrame || 0) <= Number(ref.sourceInFrame || 0)) throw Object.assign(new Error('timeline reference has an empty source range'), { status: 400 });
  }
  if (body.capability === 'image.edit' && !counts.image) throw Object.assign(new Error('image.edit requires an image reference'), { status: 400 });
  if (last && !first) throw Object.assign(new Error('last-frame requires first-frame'), { status: 400 });
  if (body.capability === 'video.generate' && references.length) throw Object.assign(new Error('text-to-video does not accept media references'), { status: 400 });
  if (body.capability === 'video.image_to_video' && first !== 1) throw Object.assign(new Error('image-to-video requires exactly one first-frame image'), { status: 400 });
  if (body.capability === 'video.first_last_frame' && (first !== 1 || last !== 1)) throw Object.assign(new Error('first/last-frame generation requires exactly one first-frame and one last-frame'), { status: 400 });
  if (body.capability === 'video.reference' && !(counts.image || counts.video || counts.audio)) throw Object.assign(new Error('reference generation requires at least one reference asset'), { status: 400 });
  if (model.providerId === 'veo') {
    const duration=Number(params.duration||8), resolution=String(params.resolution||'720p').toLowerCase();
    const guidedImageCount=counts.image;
    if ((resolution==='1080p'||resolution==='4k'||guidedImageCount>0||refVideo>0) && duration!==8) throw Object.assign(new Error('Veo requires 8s when using image/video references or 1080p/4k output'), { status: 400 });
  }
  if (c.maxImageRefs != null && counts.image > c.maxImageRefs) throw Object.assign(new Error(`too many image references; maximum is ${c.maxImageRefs}`), { status: 400 });
  if (c.maxVideoRefs != null && counts.video > c.maxVideoRefs) throw Object.assign(new Error(`too many video references; maximum is ${c.maxVideoRefs}`), { status: 400 });
  if (c.maxAudioRefs != null && counts.audio > c.maxAudioRefs) throw Object.assign(new Error(`too many audio references; maximum is ${c.maxAudioRefs}`), { status: 400 });
}

function addAsset({ projectId, kind, filename, mime, localPath, metadata = {}, source = 'upload' }) {
  const id = randomUUID();
  const rel = basename(localPath);
  const asset = { id, projectId, kind, filename, mime, localPath: rel, publicUrl: `/media/assets/${encodeURIComponent(rel)}`, width: metadata.width, height: metadata.height, durationMs: metadata.durationMs, metadata: { ...metadata, source }, createdAt: now(), updatedAt: now() };
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

async function mockImage(job) {
  job.progress = 25; await saveDb(); await sleep(350);
  const file = `${job.id}.png`; const target = join(ASSETS_DIR, file);
  if (HAS_FFMPEG) await execFile('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x121826:s=1280x720','-frames:v','1',target],{timeout:30000});
  else await fsp.writeFile(target,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
  job.progress = 80; await saveDb(); await sleep(250);
  return addAsset({ projectId: job.projectId, kind: 'image', filename: file, mime: 'image/png', localPath: target, metadata: { width: HAS_FFMPEG?1280:1, height: HAS_FFMPEG?720:1, prompt: job.request.prompt }, source: 'mock' });
}

async function mockVideo(job) {
  job.progress = 20; await saveDb(); await sleep(500);
  const file = `${job.id}.mp4`; const target = join(ASSETS_DIR, file);
  copyFileSync(join(FIXTURES, 'mock-video.mp4'), target);
  job.progress = 75; await saveDb(); await sleep(350);
  return addAsset({ projectId: job.projectId, kind: 'video', filename: file, mime: 'video/mp4', localPath: target, metadata: { ...(await mediaMetadata(target)), prompt: job.request.prompt }, source: 'mock' });
}

async function mockText(job) {
  job.progress=35; await saveDb(); await sleep(180);
  const preset=job.request.params?.system||'AI 文本';
  job.progress=80; await saveDb(); await sleep(180);
  return `【Mock Text】\n${preset}\n\n输入：${job.request.prompt}\n\n1. 建立清晰主题与视觉目标\n2. 拆分主体动作、场景、镜头与声音\n3. 输出可继续连接到图片或视频节点的文本结果`;
}

async function openAICompatibleText(job) {
  if(!OPENAI_COMPAT_API_KEY) throw new Error('OPENAI_COMPAT_API_KEY is not configured');
  const req=job.request; job.progress=12; await saveDb();
  const body={model:job.modelId,messages:[{role:'system',content:String(req.params?.system||'You are a professional video creative assistant.')},{role:'user',content:req.prompt}],temperature:Number(req.params?.temperature??0.7)};
  const r=await fetch(`${OPENAI_COMPAT_BASE_URL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${OPENAI_COMPAT_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Text API failed ${r.status}: ${data.error?.message||data.message||JSON.stringify(data).slice(0,500)}`);
  const content=data.choices?.[0]?.message?.content ?? data.output_text ?? data.text;
  if(typeof content==='string'&&content.trim()) return content.trim();
  if(Array.isArray(content)) return content.map(x=>x?.text||x?.content||'').join('\n').trim();
  throw new Error('Text API returned no text content');
}

async function agnesRequest(url, options, label) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${label} failed ${response.status}: ${data.error?.message || data.message || JSON.stringify(data).slice(0,500)}`);
    error.status = response.status;
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      error.retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now());
    }
    throw error;
  }
  return data;
}

async function agnesTextGenerate(job) {
  const req=job.request; job.progress=12; await saveDb();
  const body={model:job.modelId,messages:[{role:'system',content:String(req.params?.system||'You are a professional video creative assistant.')},{role:'user',content:req.prompt}],temperature:Number(req.params?.temperature??0.7)};
  const data=await agnesRequest(`${AGNES_BASE_URL}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'Agnes text');
  const content=data.choices?.[0]?.message?.content;
  if(typeof content==='string'&&content.trim())return content.trim();
  if(Array.isArray(content))return content.map(x=>x?.text||x?.content||'').join('\n').trim();
  throw new Error('Agnes text returned no content');
}

async function agnesImageGenerate(job) {
  const req=job.request,refs=[];
  for(const reference of req.references||[]){const asset=state.assets[reference.assetId];if(asset?.projectId===job.projectId&&asset.kind==='image')refs.push(await providerImageReferenceValue(asset));}
  const extra_body={response_format:'url'};if(refs.length)extra_body.image=refs;
  const body={model:job.modelId,prompt:req.prompt,size:req.params?.quality||req.params?.resolution||'2K',ratio:req.params?.aspectRatio||'1:1',extra_body};
  job.progress=20;await saveDb();
  const data=await agnesRequest(`${AGNES_BASE_URL}/images/generations`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'Agnes image');
  const output=data.data?.[0];if(!output)throw new Error('Agnes image returned no output');
  if(output.b64_json){const filename=`${job.id}-agnes.png`,target=join(ASSETS_DIR,filename);await fsp.writeFile(target,Buffer.from(output.b64_json,'base64'));return addAsset({projectId:job.projectId,kind:'image',filename,mime:'image/png',localPath:target,metadata:{...(await mediaMetadata(target)),provider:'agnes',model:job.modelId,prompt:req.prompt},source:'external'});}
  if(output.url)return ingestRemoteAsset(job.projectId,job.id,'image',output.url,{provider:'agnes',providerUrl:output.url,model:job.modelId,prompt:req.prompt,agnesResult:data});
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
  throw new Error('当前图片仅保存在本机，Agnes 视频无法访问。请重新运行 Agnes 图片节点后再生成视频；本地上传图片需在“模型/API → Agnes AI”配置素材公网地址');
}

async function agnesVideoGenerate(job) {
  const req=job.request,duration=Number(req.params?.duration||5),numFrames=({3:81,5:121,10:241,18:441})[duration]||121,frameRate=24,{width,height}=agnesVideoDimensions(String(req.params?.resolution||'720p'),String(req.params?.aspectRatio||'16:9'));
  const body={model:job.modelId,prompt:req.prompt,width,height,num_frames:numFrames,frame_rate:frameRate};
  if(req.params?.seed!==undefined&&req.params?.seed!=='')body.seed=Number(req.params.seed);if(req.params?.negativePrompt)body.negative_prompt=req.params.negativePrompt;
  const first=firstRef(job,['first-frame'],'image'),last=firstRef(job,['last-frame'],'image');
  if(req.capability==='video.image_to_video'&&first)body.image=agnesPublicAssetUrl(first.asset);
  if(req.capability==='video.first_last_frame'&&first&&last)body.extra_body={image:[agnesPublicAssetUrl(first.asset),agnesPublicAssetUrl(last.asset)],mode:'keyframes'};
  const created=await agnesRequest(`${AGNES_BASE_URL}/videos`,{method:'POST',headers:{Authorization:`Bearer ${AGNES_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)},'Agnes video submit');
  const videoId=created.video_id||created.task_id||created.id;if(!videoId)throw new Error('Agnes video did not return video_id');job.providerTaskId=String(videoId);job.progress=Number(created.progress||5);await saveDb();
  const root=AGNES_BASE_URL.replace(/\/v1$/,'');const deadline=Date.now()+Number(process.env.AGNES_VIDEO_TIMEOUT_MS||20*60*1000),baseInterval=Math.max(20,Number(process.env.AGNES_POLL_INTERVAL_MS||5000));let interval=baseInterval;
  while(Date.now()<deadline){await sleep(interval);if(job.status==='canceled')throw new Error('canceled');const query=new URL(`${root}/agnesapi`);query.searchParams.set('video_id',String(videoId));query.searchParams.set('model_name',job.modelId);let data;try{data=await agnesRequest(query,{headers:{Authorization:`Bearer ${AGNES_API_KEY}`}},'Agnes video status');interval=baseInterval;}catch(error){if(error?.status===429){interval=Math.min(60000,Math.max(interval*2,error.retryAfterMs||0));continue;}throw error;}const status=String(data.status||'').toLowerCase();if(status==='completed'){const url=data.metadata?.url||data.url;if(!url)throw new Error('Agnes video completed without a result URL');return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'agnes',model:job.modelId,prompt:req.prompt,seconds:data.seconds,size:data.size,agnesResult:data});}if(status==='failed')throw new Error(`Agnes video failed: ${data.error?.message||data.error||'unknown error'}`);job.progress=Math.max(job.progress||5,Number(data.progress||0));await saveDb();}
  throw new Error('Agnes video generation timed out');
}

async function seedreamGenerate(job) {
  if(!ARK_API_KEY) throw new Error('ARK_API_KEY is not configured');
  const req=job.request; const ratio=req.params?.aspectRatio; const body={model:job.modelId,prompt:ratio?`${req.prompt}\n画面比例：${ratio}`:req.prompt,size:req.params?.quality||req.params?.resolution||'2K',sequential_image_generation:'disabled',stream:false,response_format:'url',watermark:false}; if(req.params?.seed!==undefined&&req.params?.seed!=='')body.seed=Number(req.params.seed);
  if(req.capability==='image.edit'){
    const refs=(req.references||[]).map(r=>({ref:r,asset:state.assets[r.assetId]})).filter(x=>x.asset?.kind==='image'); if(!refs.length) throw new Error('Seedream image.edit requires an image reference');
    const images=[]; for(const x of refs.slice(0,10)) images.push(await providerImageReferenceValue(x.asset)); body.image=images.length===1?images[0]:images;
  }
  job.progress=15; await saveDb();
  const r=await fetch(`${ARK_BASE_URL}/images/generations`,{method:'POST',headers:{Authorization:`Bearer ${ARK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`Seedream failed ${r.status}: ${data.error?.message||data.message||JSON.stringify(data).slice(0,600)}`);
  const url=data.data?.[0]?.url||recursivelyFindUrl(data,'image'); if(!url) throw new Error('Seedream result contains no image URL');
  job.progress=90; await saveDb(); return ingestRemoteAsset(job.projectId,job.id,'image',url,{provider:'seedream',model:job.modelId,prompt:req.prompt,seedreamResult:data});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
async function providerImageBase64(asset) { const normalized=await normalizedProviderImage(asset); return (await fsp.readFile(normalized.path)).toString('base64'); }

async function assetReferenceValue(asset) {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}${asset.publicUrl}`;
  const path = join(ASSETS_DIR, asset.localPath);
  if (EXTERNAL_REFERENCE_MODE === 'data-uri') {
    const bytes = await fsp.readFile(path);
    if (bytes.length > 20 * 1024 * 1024) throw new Error('reference too large for data-uri; set PUBLIC_BASE_URL to a tunnel/public origin');
    return `data:${asset.mime || mimeFromExt(path)};base64,${bytes.toString('base64')}`;
  }
  throw new Error('cloud reference requires PUBLIC_BASE_URL or EXTERNAL_REFERENCE_MODE=data-uri');
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

async function falGenerate(job) {
  if (!FAL_KEY) throw new Error('FAL_KEY is not configured');
  const req = job.request;
  const input = { prompt: req.prompt || '' }; const fp=req.params||{}; if(fp.seed!==undefined&&fp.seed!=='')input.seed=Number(fp.seed); if(req.capability.startsWith('image.')){const map={'1:1':'square_hd','16:9':'landscape_16_9','9:16':'portrait_16_9','4:3':'landscape_4_3','3:4':'portrait_4_3'};if(fp.aspectRatio)input.image_size=map[fp.aspectRatio]||fp.aspectRatio;}else{if(fp.aspectRatio)input.aspect_ratio=fp.aspectRatio;if(fp.duration!=null)input.duration=fp.duration;if(fp.resolution)input.resolution=fp.resolution;if(fp.negativePrompt)input.negative_prompt=fp.negativePrompt;}
  if (req.capability.includes('image_to_video') || req.capability === 'video.reference') {
    const ref = (req.references || []).find(r => ['first-frame','reference-image'].includes(r.role)) || (req.references || [])[0];
    if (!ref) throw new Error('image-to-video requires an image reference');
    const asset = state.assets[ref.assetId];
    if (!asset || asset.projectId !== job.projectId || asset.kind !== 'image') throw new Error('reference image not found in project');
    input.image_url = await providerImageReferenceValue(asset);
  }
  const queueUrl = `https://queue.fal.run/${job.modelId}`;
  job.progress = 8; await saveDb();
  const submit = await fetch(queueUrl, { method: 'POST', headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!submit.ok) throw new Error(`fal submit failed ${submit.status}: ${(await submit.text()).slice(0,800)}`);
  const ticket = await submit.json();
  job.providerTaskId = ticket.request_id || ticket.requestId || job.id;
  const statusUrl = ticket.status_url || ticket.statusUrl || `${queueUrl}/requests/${job.providerTaskId}/status`;
  const resultUrl = ticket.response_url || ticket.responseUrl || `${queueUrl}/requests/${job.providerTaskId}`;
  const deadline = Date.now() + Number(process.env.FAL_TIMEOUT_MS || 10 * 60 * 1000);
  while (Date.now() < deadline) {
    await sleep(1200);
    const statusResp = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!statusResp.ok) throw new Error(`fal status failed ${statusResp.status}`);
    const status = await statusResp.json();
    const s = String(status.status || '').toUpperCase();
    if (s.includes('COMPLETED') || s.includes('SUCCEEDED') || s === 'OK') break;
    if (s.includes('FAILED') || s.includes('ERROR') || s.includes('CANCEL')) throw new Error(`fal job ${s}: ${JSON.stringify(status).slice(0,600)}`);
    job.progress = Math.min(88, (job.progress || 8) + 4); await saveDb();
  }
  if (Date.now() >= deadline) throw new Error('fal generation timed out');
  const resultResp = await fetch(resultUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
  if (!resultResp.ok) throw new Error(`fal result failed ${resultResp.status}: ${(await resultResp.text()).slice(0,800)}`);
  const result = await resultResp.json();
  const kind = req.capability.startsWith('image.') ? 'image' : 'video';
  const url = recursivelyFindUrl(result, kind);
  if (!url) throw new Error(`fal result contains no ${kind} URL`);
  job.progress = 92; await saveDb();
  return await ingestRemoteAsset(job.projectId, job.id, kind, url, { provider: 'fal', model: job.modelId, prompt: req.prompt, falResult: result });
}

async function ingestRemoteAsset(projectId, jobId, kind, rawUrl, metadata = {}, downloadHeaders = {}) {
  const url = await safeRemoteUrl(rawUrl);
  const response = await fetch(url, { redirect: 'follow', headers: downloadHeaders });
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


function base64url(value) { return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url'); }
function klingToken() {
  const ts = Math.floor(Date.now()/1000); const header = base64url({alg:'HS256',typ:'JWT'}); const payload = base64url({iss:KLING_ACCESS_KEY,exp:ts+1800,nbf:ts-5});
  const sig = createHmac('sha256', KLING_SECRET_KEY).update(`${header}.${payload}`).digest('base64url'); return `${header}.${payload}.${sig}`;
}
async function assetBase64(asset, stripDataPrefix=false) {
  const bytes = await fsp.readFile(join(ASSETS_DIR, asset.localPath)); const b64=bytes.toString('base64'); return stripDataPrefix?b64:`data:${asset.mime||mimeFromExt(asset.localPath)};base64,${b64}`;
}
function firstRef(job, roles, kind) { for (const r of job.request.references||[]) { if (!roles.includes(r.role)) continue; const a=state.assets[r.assetId]; if(a&&a.projectId===job.projectId&&(!kind||a.kind===kind)) return {ref:r,asset:a}; } return null; }
async function seedanceGenerate(job) {
  if(!ARK_API_KEY) throw new Error('ARK_API_KEY is not configured'); const req=job.request; const duration=Math.max(1,Math.min(10,Number(req.params?.duration||5))); const resolution=req.params?.resolution||'720p';
  const content=[{type:'text',text:`${req.prompt} --resolution ${resolution} --duration ${duration}`}]; const first=firstRef(job,['first-frame','reference-image'],'image');
  if(first) content.push({type:'image_url',image_url:{url:await providerImageReferenceValue(first.asset)},role:'first_frame'});
  const submit=await fetch(`${ARK_BASE_URL}/contents/generations/tasks`,{method:'POST',headers:{Authorization:`Bearer ${ARK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:job.modelId,content})}); const data=await submit.json().catch(()=>({}));
  if(!submit.ok) throw new Error(`Seedance submit failed ${submit.status}: ${data?.error?.message||data?.message||JSON.stringify(data).slice(0,500)}`); const taskId=data.id||data.task_id||data.data?.id||data.data?.task_id; if(!taskId) throw new Error('Seedance did not return task id'); job.providerTaskId=String(taskId); job.progress=10; await saveDb();
  const deadline=Date.now()+Number(process.env.ARK_TIMEOUT_MS||15*60*1000); while(Date.now()<deadline){await sleep(1800);if(job.status==='canceled')return Promise.reject(new Error('canceled'));const r=await fetch(`${ARK_BASE_URL}/contents/generations/tasks/${taskId}`,{headers:{Authorization:`Bearer ${ARK_API_KEY}`}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Seedance status failed ${r.status}`);const payload=d.data&&typeof d.data==='object'?d.data:d;const st=String(payload.status||payload.task_status||'').toLowerCase();if(['succeeded','success','done','completed'].includes(st)){const url=recursivelyFindUrl(payload,'video');if(!url)throw new Error('Seedance result contains no video URL');return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'seedance',model:job.modelId,prompt:req.prompt});}if(['failed','fail','error','cancelled','canceled'].includes(st))throw new Error(`Seedance failed: ${payload.message||payload.error||st}`);job.progress=Math.min(90,(job.progress||10)+5);await saveDb();}throw new Error('Seedance generation timed out');
}
async function klingGenerate(job) {
  if(!KLING_ACCESS_KEY||!KLING_SECRET_KEY) throw new Error('KLING_ACCESS_KEY / KLING_SECRET_KEY not configured'); const req=job.request,duration=String(req.params?.duration||5),aspect=req.params?.aspectRatio||'16:9'; const first=firstRef(job,['first-frame','reference-image'],'image'); const last=firstRef(job,['last-frame'],'image');
  const mode=first?'image2video':'text2video'; const body={model_name:job.modelId,prompt:req.prompt,mode:req.params?.mode||'std',duration,aspect_ratio:aspect}; if(first)body.image=await providerImageBase64(first.asset); if(last)body.image_tail=await providerImageBase64(last.asset); if(req.params?.negativePrompt)body.negative_prompt=req.params.negativePrompt;
  const headers={Authorization:`Bearer ${klingToken()}`,'Content-Type':'application/json'};const submit=await fetch(`${KLING_BASE_URL}/v1/videos/${mode}`,{method:'POST',headers,body:JSON.stringify(body)});const data=await submit.json().catch(()=>({}));if(!submit.ok||data.code!==0)throw new Error(`Kling submit failed: ${data.message||submit.status}`);const taskId=data.data?.task_id;if(!taskId)throw new Error('Kling did not return task id');job.providerTaskId=taskId;job.progress=10;await saveDb();
  const deadline=Date.now()+Number(process.env.KLING_TIMEOUT_MS||15*60*1000);while(Date.now()<deadline){await sleep(1800);if(job.status==='canceled')return Promise.reject(new Error('canceled'));const r=await fetch(`${KLING_BASE_URL}/v1/videos/${mode}/${taskId}`,{headers:{Authorization:`Bearer ${klingToken()}`}});const d=await r.json().catch(()=>({}));if(!r.ok||d.code!==0)throw new Error(`Kling status failed: ${d.message||r.status}`);const td=d.data||{},st=String(td.task_status||'').toLowerCase();if(st==='succeed'){const url=td.task_result?.videos?.[0]?.url||recursivelyFindUrl(td,'video');if(!url)throw new Error('Kling result contains no video URL');return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'kling',model:job.modelId,prompt:req.prompt});}if(st==='failed')throw new Error(td.task_status_msg||'Kling generation failed');job.progress=Math.min(90,(job.progress||10)+5);await saveDb();}throw new Error('Kling generation timed out');
}
async function veoGenerate(job) {
  if(!GEMINI_API_KEY)throw new Error('GEMINI_API_KEY is not configured');const req=job.request;const instance={prompt:req.prompt};const first=firstRef(job,['first-frame'],'image'),last=firstRef(job,['last-frame'],'image'),video=firstRef(job,['reference-video'],'video');
  if(first){const img=await normalizedProviderImage(first.asset);instance.image={inlineData:{mimeType:img.mime,data:(await fsp.readFile(img.path)).toString('base64')}};}if(last){const img=await normalizedProviderImage(last.asset);instance.lastFrame={inlineData:{mimeType:img.mime,data:(await fsp.readFile(img.path)).toString('base64')}};}if(video)instance.video={inlineData:{mimeType:video.asset.mime||'video/mp4',data:await assetBase64(video.asset,true)}};
  const referenceImages=[];for(const ref of (req.references||[]).filter(r=>r.role==='reference-image').slice(0,3)){const asset=state.assets[ref.assetId];if(!asset||asset.projectId!==job.projectId||asset.kind!=='image')continue;const img=await normalizedProviderImage(asset);referenceImages.push({image:{inlineData:{mimeType:img.mime,data:(await fsp.readFile(img.path)).toString('base64')}},referenceType:'asset'});}if(referenceImages.length)instance.referenceImages=referenceImages;
  const parameters={numberOfVideos:1,durationSeconds:Number(req.params?.duration||8),aspectRatio:req.params?.aspectRatio||'16:9',resolution:req.params?.resolution||'720p'};if(req.params?.seed!==undefined&&req.params?.seed!=='')parameters.seed=Number(req.params.seed);const submit=await fetch(`${VEO_BASE_URL}/models/${encodeURIComponent(job.modelId)}:predictLongRunning`,{method:'POST',headers:{'x-goog-api-key':GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({instances:[instance],parameters})});const data=await submit.json().catch(()=>({}));if(!submit.ok)throw new Error(`Veo submit failed ${submit.status}: ${data.error?.message||JSON.stringify(data).slice(0,500)}`);const op=data.name;if(!op)throw new Error('Veo did not return operation name');job.providerTaskId=op;job.progress=8;await saveDb();
  const deadline=Date.now()+Number(process.env.VEO_TIMEOUT_MS||20*60*1000);while(Date.now()<deadline){await sleep(2500);if(job.status==='canceled')return Promise.reject(new Error('canceled'));const r=await fetch(`${VEO_BASE_URL}/${op}`,{headers:{'x-goog-api-key':GEMINI_API_KEY}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Veo status failed ${r.status}: ${d.error?.message||''}`);if(d.done){if(d.error)throw new Error(`Veo failed: ${d.error.message||JSON.stringify(d.error)}`);const url=d.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri||recursivelyFindUrl(d.response,'video');if(!url)throw new Error('Veo result contains no video URI');return ingestRemoteAsset(job.projectId,job.id,'video',url,{provider:'veo',model:job.modelId,prompt:req.prompt},{'x-goog-api-key':GEMINI_API_KEY});}job.progress=Math.min(90,(job.progress||8)+4);await saveDb();}throw new Error('Veo generation timed out');
}

async function runJob(id) {
  const job = state.jobs[id]; if (!job || job.status === 'canceled') return;
  try {
    job.status = 'processing'; job.progress = 3; job.updatedAt = now(); await saveDb();
    let asset=null, outputText=null;
    if (job.providerId === 'mock' && job.capability === 'text.generate') outputText = await mockText(job);
    else if (job.providerId === 'mock') asset = job.capability.startsWith('image.') ? await mockImage(job) : await mockVideo(job);
    else if (job.providerId === 'openai-compatible') outputText = await openAICompatibleText(job);
    else if (job.providerId === 'agnes' && job.capability === 'text.generate') outputText = await agnesTextGenerate(job);
    else if (job.providerId === 'agnes' && job.capability.startsWith('image.')) asset = await agnesImageGenerate(job);
    else if (job.providerId === 'agnes') asset = await agnesVideoGenerate(job);
    else if (job.providerId === 'seedream') asset = await seedreamGenerate(job);
    else if (job.providerId === 'fal') asset = await falGenerate(job);
    else if (job.providerId === 'seedance') asset = await seedanceGenerate(job);
    else if (job.providerId === 'kling') asset = await klingGenerate(job);
    else if (job.providerId === 'veo') asset = await veoGenerate(job);
    else throw new Error(`unknown provider: ${job.providerId}`);
    if (job.status === 'canceled') return;
    job.outputAssetIds = asset ? [asset.id] : []; job.outputText = outputText; job.status = 'succeeded'; job.progress = 100; job.updatedAt = now(); await saveDb();
  } catch (error) {
    if (job.status === 'canceled') { job.updatedAt = now(); await saveDb(); return; }
    job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error); job.updatedAt = now(); await saveDb();
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
  if (p === '/api/health' && method === 'GET') return json(res, 200, { ok: true, version: '2.0.0-standalone', node: process.version, providers: { text:Boolean(OPENAI_COMPAT_API_KEY), openaiAgent:Boolean(OPENAI_API_KEY), geminiAgent:Boolean(GEMINI_API_KEY), agnes:Boolean(AGNES_API_KEY), seedream:Boolean(ARK_API_KEY), fal:Boolean(FAL_KEY), seedance:Boolean(ARK_API_KEY), kling:Boolean(KLING_ACCESS_KEY&&KLING_SECRET_KEY), veo:Boolean(GEMINI_API_KEY) }, ffmpeg: HAS_FFMPEG, captionFont: Boolean(FFMPEG_FONT_FILE) });
  if (p === '/api/agent/models' && method === 'GET') return json(res,200,{models:await availableAgentModels()});
  if (p === '/api/provider-settings' && method === 'GET') {
    const settings={OPENAI_COMPAT_API_KEY:'',OPENAI_COMPAT_BASE_URL,OPENAI_COMPAT_TEXT_MODEL,OPENAI_API_KEY:'',OPENAI_BASE_URL,OPENAI_AGENT_MODEL,AGNES_API_KEY:'',AGNES_BASE_URL,AGNES_TEXT_MODEL,AGNES_AGENT_MODEL,AGNES_IMAGE_MODEL,AGNES_VIDEO_MODEL,PUBLIC_BASE_URL,ARK_API_KEY:'',ARK_IMAGE_MODEL,ARK_VIDEO_MODEL,KLING_ACCESS_KEY:'',KLING_SECRET_KEY:'',KLING_VIDEO_MODEL,GEMINI_API_KEY:'',GEMINI_AGENT_BASE_URL,GEMINI_AGENT_MODEL,VEO_MODEL,FAL_KEY:'',FAL_IMAGE_MODEL,FAL_VIDEO_MODEL};
    return json(res,200,{settings,configured:{text:Boolean(OPENAI_COMPAT_API_KEY),openaiAgent:Boolean(OPENAI_API_KEY),geminiAgent:Boolean(GEMINI_API_KEY),agnes:Boolean(AGNES_API_KEY),arkImage:Boolean(ARK_API_KEY),seedance:Boolean(ARK_API_KEY),kling:Boolean(KLING_ACCESS_KEY&&KLING_SECRET_KEY),veo:Boolean(GEMINI_API_KEY),fal:Boolean(FAL_KEY)}});
  }
  if (p === '/api/provider-settings' && method === 'PUT') {
    const body=await readJson(req); const allowed=new Set(['OPENAI_COMPAT_API_KEY','OPENAI_COMPAT_BASE_URL','OPENAI_COMPAT_TEXT_MODEL','OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_AGENT_MODEL','AGNES_API_KEY','AGNES_BASE_URL','AGNES_TEXT_MODEL','AGNES_AGENT_MODEL','AGNES_IMAGE_MODEL','AGNES_VIDEO_MODEL','PUBLIC_BASE_URL','ARK_API_KEY','ARK_IMAGE_MODEL','ARK_VIDEO_MODEL','KLING_ACCESS_KEY','KLING_SECRET_KEY','KLING_VIDEO_MODEL','GEMINI_API_KEY','GEMINI_AGENT_BASE_URL','GEMINI_AGENT_MODEL','VEO_MODEL','FAL_KEY','FAL_IMAGE_MODEL','FAL_VIDEO_MODEL']);
    for(const [key,value] of Object.entries(body||{})){if(!allowed.has(key))continue;const v=String(value||'').trim();if(v)providerSettings[key]=v;}
    await fsp.writeFile(PROVIDER_SETTINGS_FILE,JSON.stringify(providerSettings,null,2)); try{await fsp.chmod(PROVIDER_SETTINGS_FILE,0o600);}catch{} refreshProviderRuntime();agentModelCache={expiresAt:0,models:[]};
    return json(res,200,{ok:true,models:listModels()});
  }
  if (p === '/api/models' && method === 'GET') return json(res, 200, { models: listModels() });
  if (p === '/api/projects' && method === 'GET') return json(res, 200, { projects: Object.values(state.projects).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) });
  if (p === '/api/projects' && method === 'POST') {
    const body = await readJson(req); const id = randomUUID(); const ts = now();
    const project = { id, name: String(body.name || 'Untitled Project').slice(0,120), settings: {}, workflow: { version: 1, nodes: [], edges: [] }, timeline: { fps: 30, width: 1280, height: 720, items: [], tracks: { C1:{muted:false,hidden:false}, V2:{muted:false,hidden:false}, V1:{muted:false,hidden:false}, A1:{muted:false,hidden:false}, A2:{muted:false,hidden:false} } }, createdAt: ts, updatedAt: ts };
    state.projects[id] = project; await saveDb(); return json(res, 201, project);
  }
  let m = p.match(/^\/api\/projects\/([^/]+)$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr) : notFound(res); }
  m = p.match(/^\/api\/projects\/([^/]+)\/agent$/);
  if (m && method === 'GET') { const pr=projectOr404(m[1]); if(!pr)return notFound(res); return json(res,200,ensureAgentSession(pr)); }
  if (m && method === 'DELETE') { const pr=projectOr404(m[1]); if(!pr)return notFound(res); pr.agentSession={version:1,selectedProviderId:'',selectedModelId:'',messages:[],proposals:[]}; pr.updatedAt=now(); await saveDb(); return json(res,200,pr.agentSession); }
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
    let reply;try{reply=await createAgentReply({project:pr,messages:session.messages,models:listModels(),providerId:chosen.providerId,modelId:chosen.modelId,config:agentConfig(),signal:controller.signal,onMessageEvent:streaming?writeEvent:null});}catch(error){if(streaming){writeEvent({type:'error',message:error.message});res.end();return;}throw error;}finally{req.off('aborted',abort);res.off('close',abort);}
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
    const result=applyAgentProposal(pr,proposal,listModels());pr.updatedAt=now();await saveDb();return json(res,200,{...result,proposal});
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr.workflow) : notFound(res); }
  if (m && method === 'PUT') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const body = await readJson(req); pr.workflow = { version: Number(body.version || 1), nodes: Array.isArray(body.nodes) ? body.nodes : [], edges: Array.isArray(body.edges) ? body.edges : [] }; pr.updatedAt = now(); await saveDb(); return json(res,200,pr.workflow); }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr.timeline) : notFound(res); }
  if (m && method === 'PUT') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const body = await readJson(req); pr.timeline = { fps: Number(body.fps || 30), width: Number(body.width || 1280), height: Number(body.height || 720), items: Array.isArray(body.items) ? body.items : [], tracks: body.tracks && typeof body.tracks === 'object' ? body.tracks : (pr.timeline.tracks || {}) }; pr.updatedAt = now(); await saveDb(); return json(res,200,pr.timeline); }
  m = p.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (m && method === 'GET') { if (!projectOr404(m[1])) return notFound(res); return json(res,200,{ assets: projectAssets(m[1]) }); }
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
    const model = listModels().find(x => x.providerId === body.providerId && x.modelId === body.modelId && x.capabilities.includes(body.capability)); if (!model) return json(res,400,{error:'model_not_available'});
    const references = Array.isArray(body.references) ? body.references : [];
    for (const ref of references) { const a = state.assets[ref.assetId]; if (!a || a.projectId !== pr.id) return json(res,400,{error:'invalid_reference',assetId:ref.assetId}); }
    validateGenerationRequest(model, body, references);
    const id = randomUUID(); const ts = now(); const job = { id, projectId: pr.id, capability: String(body.capability), providerId: String(body.providerId), modelId: String(body.modelId), status: 'queued', progress: 0, request: { projectId: pr.id, capability: String(body.capability), providerId: String(body.providerId), modelId: String(body.modelId), prompt: String(body.prompt || ''), params: body.params || {}, references }, outputAssetIds: [], createdAt: ts, updatedAt: ts };
    state.jobs[id] = job; await saveDb(); setImmediate(() => runJob(id)); return json(res,202,job);
  }
  m = p.match(/^\/api\/generations\/([^/]+)$/);
  if (m && method === 'GET') { const job = state.jobs[m[1]]; if (!job) return notFound(res); return json(res,200,{...job, outputs:(job.outputAssetIds||[]).map(id=>state.assets[id]).filter(Boolean)}); }
  m = p.match(/^\/api\/generations\/([^/]+)\/cancel$/);
  if (m && method === 'POST') { const job = state.jobs[m[1]]; if (!job) return notFound(res); if (!['succeeded','failed'].includes(job.status)) { job.status='canceled'; job.updatedAt=now(); await saveDb(); } return json(res,200,job); }
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
    if (url.pathname.startsWith('/media/assets/')) { const name = cleanFilename(safeDecode(url.pathname.slice('/media/assets/'.length))); return serveFile(req, res, join(ASSETS_DIR, name)); }
    if (url.pathname.startsWith('/vendor/icons/')) { const name=cleanFilename(safeDecode(url.pathname.slice('/vendor/icons/'.length))); if (/^[a-z0-9-]+\.svg$/.test(name)) return serveFile(req,res,join(TABLER_ICONS,name)); return notFound(res); }
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(req, res, join(PUBLIC,'index.html'));
    const rel = normalize(url.pathname).replace(/^[/\\]+/, ''); if (rel.includes('..')) return notFound(res); const file = join(PUBLIC, rel); if (file.startsWith(PUBLIC)) return serveFile(req,res,file); return notFound(res);
  } catch (error) {
    const status = error?.status || 500; console.error(error); return json(res,status,{ error: status >= 500 ? 'internal_error' : error.message, message: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LibTV Studio Standalone running at http://${HOST}:${PORT}`);
  console.log(`Data: ${DATA}`);
  console.log(`Providers: fal=${Boolean(FAL_KEY)} seedance=${Boolean(ARK_API_KEY)} kling=${Boolean(KLING_ACCESS_KEY&&KLING_SECRET_KEY)} veo=${Boolean(GEMINI_API_KEY)}`);
  console.log(`FFmpeg: ${HAS_FFMPEG} · Caption font: ${Boolean(FFMPEG_FONT_FILE)}`);
});
