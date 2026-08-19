import http from "node:http";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { promises as fsp } from "node:fs";
import { basename, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { buildStandaloneCreativeContext } from "./creative-context.mjs";
import {
  buildCreativeAgentSystemPrompt,
  createCreativeAgentConversation,
  parseCreativeAgentReply,
} from "./creative-agent.mjs";
import { normalizeImagePreset } from "./public/image-presets.js";
import { buildSkillWorkflow, listSkills, skillById } from "./skill-catalog.mjs";
import { cleanFilename, contentTypeOnly, kindFromMime, mimeFromExt } from "./lib/media.mjs";
import { createProviderHttp } from "./providers/http.mjs";
import {
  PUBLIC,
  TABLER_ICONS,
  DATA,
  ASSETS_DIR,
  EXPORTS_DIR,
  PORT,
  HOST,
  MAX_UPLOAD_BYTES,
  HAS_FFMPEG,
  FFMPEG_FONT_FILE,
  state,
  saveDb,
  now,
  addAsset,
  projectOr404,
  projectAssets,
  projectJobs,
  runtimeConfig,
  providerSettings,
  persistProviderSettings,
  refreshMediaAndRegistry,
  registry,
  listModels,
  availableAgnesModels,
  prepareStandaloneGeneration,
  enqueueGeneration,
  findExistingJob,
  scheduleJobs,
  jobControllers,
  canvasSelections,
  validateGenerationRequest,
  extractFrameAsset,
  pickDuration,
  timelineItemOrThrow,
  mediaMetadata,
  execFile,
  sleep,
  sanitizeProviderMessage,
} from "./app-context.mjs";

const providerHttp = createProviderHttp();
const { providerJson } = providerHttp;

{
  const apimartProxyBase = String(
    providerSettings.APIMART_BASE_URL || process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1",
  );
  let agnesDirectHost = "";
  try {
    agnesDirectHost = new URL(
      String(providerSettings.AGNES_BASE_URL || process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1"),
    ).hostname;
  } catch {
    /* ignore */
  }
  if (
    process.env.ALL_PROXY &&
    !process.env.HTTPS_PROXY &&
    !process.env.HTTP_PROXY &&
    process.env.LIBTV_PROXY_BOOTSTRAPPED !== "1" &&
    !process.execArgv.includes("--use-env-proxy") &&
    (providerSettings.APIMART_API_KEY || process.env.APIMART_API_KEY) &&
    /^https:\/\//i.test(apimartProxyBase)
  ) {
    const noProxy = [process.env.NO_PROXY, agnesDirectHost].filter(Boolean).join(",");
    const child = spawn(
      process.execPath,
      ["--use-env-proxy", ...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          HTTPS_PROXY: process.env.ALL_PROXY,
          HTTP_PROXY: process.env.ALL_PROXY,
          NO_PROXY: noProxy,
          LIBTV_PROXY_BOOTSTRAPPED: "1",
        },
      },
    );
    const code = await new Promise((resolve) => child.on("exit", resolve));
    process.exit(typeof code === "number" ? code : 0);
  }
}

function json(res, status, body, extra = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
    "cache-control": "no-store",
    ...extra,
  });
  res.end(data);
}
function notFound(res) {
  json(res, 404, { error: "not_found" });
}
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
async function readJson(req, max = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error("request_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function creativeAgentConversationList(projectId) {
  return Object.values(state.creativeAgent?.conversations || {})
    .filter((conversation) => conversation.projectId === projectId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function creativeAgentConversation(projectId, conversationId) {
  const conversation = state.creativeAgent?.conversations?.[conversationId];
  return conversation?.projectId === projectId ? conversation : null;
}
function creativeAgentContext(project) {
  const workflow = { ...project.workflow, version: Number(project.workflowRevision || project.workflow?.version || 1) };
  const timeline = { ...project.timeline, updatedAt: project.timelineUpdatedAt || project.updatedAt };
  return {
    project: { id: project.id, name: project.name, settings: project.settings || {} },
    creative: buildStandaloneCreativeContext({
      project,
      workflow,
      timeline,
      assets: projectAssets(project.id),
      generations: projectJobs(project.id).slice(0, 50),
    }),
  };
}
function creativeAgentMessageView(message) {
  return {
    id: message.id,
    role: message.role,
    text: message.text || "",
    cards: message.cards || [],
    attachments: message.attachments || [],
    createdAt: message.createdAt,
    error: message.error || "",
    ...(message.skillRun ? { skillRun: message.skillRun } : {}),
  };
}
function creativeAgentAttachments(project, rawAttachments) {
  const requested = Array.isArray(rawAttachments) ? rawAttachments : [];
  const seen = new Set();
  return requested
    .map((item) => state.assets[String(item?.id || item?.assetId || "")])
    .filter((asset) => {
      if (!asset || asset.projectId !== project.id || seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    })
    .map((asset) => ({ id: asset.id, filename: asset.filename, kind: asset.kind, publicUrl: asset.publicUrl }));
}
function creativeAgentHistoryContent(message) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const referenceText = attachments.length
    ? `[参考素材：${attachments.map((asset) => asset.filename || asset.kind || "文件").join("、")}]`
    : "";
  return [message.text || "", referenceText].filter(Boolean).join("\n\n");
}
function creativeAgentConversationView(conversation) {
  return {
    ...conversation,
    messages: (conversation.messages || []).map((message) => {
      if (message.role !== "assistant" || (message.cards || []).length) return creativeAgentMessageView(message);
      const parsed = parseCreativeAgentReply(message.text || "");
      return parsed.cards.length
        ? { ...creativeAgentMessageView(message), text: parsed.text, cards: parsed.cards }
        : creativeAgentMessageView(message);
    }),
  };
}
async function createCreativeAgentConversationForProject(projectId) {
  const project = projectOr404(projectId);
  if (!project) throw Object.assign(new Error("project_not_found"), { status: 404 });
  const conversation = createCreativeAgentConversation(projectId, now());
  state.creativeAgent.conversations[conversation.id] = conversation;
  await saveDb();
  return conversation;
}
function applySkillToProject(project, body = {}) {
  const skillId = String(body.skillId || "").trim();
  const skill = skillById(skillId);
  if (!skill) throw Object.assign(new Error("skill_not_found"), { status: 404 });
  const selectedAsset =
    String(body.productAssetId || "").trim() || projectAssets(project.id, { kind: "image" })[0]?.id;
  if (!selectedAsset) {
    throw Object.assign(new Error("product_image_required"), {
      status: 400,
      message: "请先在素材库上传一张产品图片。",
    });
  }
  const asset = state.assets[selectedAsset];
  if (!asset || asset.projectId !== project.id || asset.kind !== "image") {
    throw Object.assign(new Error("invalid_product_image"), {
      status: 400,
      message: "Skill 需要当前画布中的图片素材作为产品参考。",
    });
  }
  const result = buildSkillWorkflow({
    skill,
    existingWorkflow: project.workflow,
    productAssetId: selectedAsset,
    sellingPoints: body.sellingPoints || body.message,
    brandName: body.brandName,
    durationSec: body.durationSec,
    aspectRatio: body.aspectRatio,
  });
  const nextVersion = Number(project.workflowRevision || project.workflow?.version || 1) + 1;
  project.workflow = { version: nextVersion, nodes: result.nodes, edges: result.edges };
  project.workflowRevision = nextVersion;
  project.updatedAt = now();
  return { skill, result, workflow: project.workflow };
}
async function completeCreativeAgent(providerId, modelId, messages, signal) {
  const models = await listModels();
  const model = models.find(
    (item) => item.providerId === providerId && item.modelId === modelId && item.capabilities?.includes("text.generate"),
  );
  if (!model) throw Object.assign(new Error("model_not_available"), { status: 400 });
  let apiKey = "";
  let baseUrl = "";
  let label = "";
  if (providerId === "apimart") {
    apiKey = runtimeConfig.APIMART_API_KEY;
    baseUrl = runtimeConfig.APIMART_CHAT_BASE_URL;
    label = "APIMart creative agent";
  } else if (providerId === "agnes") {
    apiKey = runtimeConfig.AGNES_API_KEY;
    baseUrl = runtimeConfig.AGNES_BASE_URL;
    label = "Agnes creative agent";
  } else if (providerId === "deepseek") {
    apiKey = runtimeConfig.DEEPSEEK_API_KEY;
    baseUrl = runtimeConfig.DEEPSEEK_BASE_URL;
    label = "DeepSeek API creative agent";
  } else if (providerId === "bailian") {
    apiKey = runtimeConfig.BAILIAN_API_KEY;
    baseUrl = runtimeConfig.BAILIAN_BASE_URL;
    label = "百炼 creative agent";
  } else throw Object.assign(new Error(`unknown_provider: ${providerId}`), { status: 400 });
  if (!apiKey) throw Object.assign(new Error(`${label} API key is not configured`), { status: 422 });
  const body = { model: modelId, stream: false, messages, temperature: 0.75 };
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const timeoutMs = Math.max(1_000, Number(process.env.CREATIVE_AGENT_TIMEOUT_MS || 60_000));
  const combinedSignal = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
  let response;
  try {
    const raw = await providerJson(
      `${baseUrl}/chat/completions`,
      { method: "POST", headers, body: JSON.stringify(body) },
      label,
      combinedSignal,
    );
    if (providerId === "apimart") {
      if (Number(raw?.code || 200) >= 400) {
        throw new Error(`${label} failed: ${raw?.error?.message || raw?.message || raw.code}`);
      }
      response = raw?.data && typeof raw.data === "object" ? raw.data : raw;
    } else response = raw;
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    throw error;
  }
  const content = (response.data || response).choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) return content.map((item) => item?.text || item?.content || "").join("\n").trim();
  throw new Error(`${label} returned no content`);
}
async function sendCreativeAgentMessage(project, conversation, body, signal) {
  const message = String(body.message || "").trim();
  if (!message) throw Object.assign(new Error("message is required"), { status: 400 });
  const attachments = creativeAgentAttachments(project, body.attachments);
  if (body.skillId) {
    const skillBody = { ...body };
    if (!skillBody.productAssetId) skillBody.productAssetId = attachments.find((asset) => asset.kind === "image")?.id || "";
    const applied = applySkillToProject(project, skillBody);
    const assistantMessage = {
      id: randomUUID(),
      role: "assistant",
      text: `已启用「${applied.skill.name}」Skill。已绑定产品图并创建创意锚点、五镜头分镜、关键帧、首帧视频、旁白方案和BGM方案节点；接下来按依赖顺序生成并把成功镜头加入 Timeline。`,
      cards: [],
      skillRun: {
        id: randomUUID(),
        skillId: applied.skill.id,
        skillVersion: applied.skill.version,
        createdNodeIds: applied.result.createdNodeIds,
        videoNodeIds: applied.result.videoNodeIds,
        audioPlanNodeIds: applied.result.audioPlanNodeIds,
        input: applied.result.input,
        autoRun: applied.skill.execution?.autoRun === true,
      },
      createdAt: now(),
    };
    conversation.messages ||= [];
    conversation.messages.push({
      id: randomUUID(),
      role: "user",
      text: message.slice(0, 12_000),
      cards: [],
      attachments,
      skillId: applied.skill.id,
      createdAt: now(),
    });
    conversation.messages.push(assistantMessage);
    conversation.updatedAt = now();
    if (conversation.messages.filter((item) => item.role === "user").length === 1) conversation.title = applied.skill.name;
    await saveDb();
    return {
      message: creativeAgentMessageView(assistantMessage),
      workflow: project.workflow,
      skillRun: assistantMessage.skillRun,
      conversation,
    };
  }
  const providerId = String(body.providerId || "").trim();
  const modelId = String(body.modelId || "").trim();
  const userMessage = {
    id: randomUUID(),
    role: "user",
    text: message.slice(0, 12_000),
    cards: [],
    attachments,
    createdAt: now(),
  };
  conversation.messages ||= [];
  conversation.messages.push(userMessage);
  conversation.updatedAt = now();
  if (conversation.messages.filter((item) => item.role === "user").length === 1) conversation.title = message.slice(0, 48);
  await saveDb();
  const history = conversation.messages.slice(-24).map((item) => ({ role: item.role, content: creativeAgentHistoryContent(item) }));
  const system = buildCreativeAgentSystemPrompt(creativeAgentContext(project));
  const raw = await completeCreativeAgent(providerId, modelId, [{ role: "system", content: system }, ...history], signal);
  const reply = parseCreativeAgentReply(raw);
  const assistantMessage = { id: randomUUID(), role: "assistant", text: reply.text, cards: reply.cards, createdAt: now() };
  conversation.messages.push(assistantMessage);
  conversation.updatedAt = now();
  await saveDb();
  return { message: creativeAgentMessageView(assistantMessage), conversation };
}

function maskedProviderSettingsView() {
  return {
    AGNES_API_KEY: "",
    AGNES_BASE_URL: runtimeConfig.AGNES_BASE_URL,
    AGNES_TEXT_MODEL: runtimeConfig.AGNES_TEXT_MODEL,
    AGNES_IMAGE_MODEL: runtimeConfig.AGNES_IMAGE_MODEL,
    AGNES_VIDEO_MODEL: runtimeConfig.AGNES_VIDEO_MODEL,
    APIMART_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_BASE_URL: runtimeConfig.DEEPSEEK_BASE_URL,
    DEEPSEEK_TEXT_MODEL: runtimeConfig.DEEPSEEK_TEXT_MODEL,
    BAILIAN_API_KEY: "",
    BAILIAN_BASE_URL: runtimeConfig.BAILIAN_BASE_URL,
    BAILIAN_MEDIA_BASE_URL: runtimeConfig.BAILIAN_MEDIA_BASE_URL,
    BAILIAN_TEXT_MODEL: runtimeConfig.BAILIAN_TEXT_MODEL,
    BAILIAN_IMAGE_MODEL: runtimeConfig.BAILIAN_IMAGE_MODEL,
    BAILIAN_VIDEO_MODEL: runtimeConfig.BAILIAN_VIDEO_MODEL,
    PUBLIC_BASE_URL: runtimeConfig.PUBLIC_BASE_URL,
  };
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
  if (p.startsWith('/internal/')) return notFound(res);
  if (p === '/api/health' && method === 'GET') return json(res, 200, { ok: true, version: '2.0.0-standalone', node: process.version, providers: { agnes:Boolean(runtimeConfig.AGNES_API_KEY), apimart:Boolean(runtimeConfig.APIMART_API_KEY), deepseek:Boolean(runtimeConfig.DEEPSEEK_API_KEY), bailian:Boolean(runtimeConfig.BAILIAN_API_KEY) }, ffmpeg: HAS_FFMPEG, captionFont: Boolean(FFMPEG_FONT_FILE) });
  if (p === '/api/prompt-library' && method === 'GET') return json(res,200,state.promptLibrary);
  let promptMatch = p.match(/^\/api\/prompt-library\/([^/]+)$/);
  if (promptMatch && method === 'PUT') {
    const preset = state.promptLibrary.presets.find(item => item.id === safeDecode(promptMatch[1]));
    if (!preset) return notFound(res);
    const body = await readJson(req), allowed = ['label','scene','positive','negative','aspectRatio','quality','aspectPolicy','subjectPolicy','promptPlaceholder','enabled'];
    for (const key of allowed) if (Object.hasOwn(body,key)) preset[key] = key === 'enabled' ? body[key] !== false : String(body[key] ?? '').trim();
    preset.version = Number(preset.version || 1) + 1; preset.updatedAt = now();
    await saveDb(); return json(res,200,normalizeImagePreset(preset));
  }
  if (p === '/api/provider-settings' && method === 'GET') {
    const settings=maskedProviderSettingsView(),apimartModels=await registry.availableApimartModels(),agnesModels=await availableAgnesModels();
    return json(res,200,{settings,configured:{agnes:Boolean(runtimeConfig.AGNES_API_KEY),apimart:Boolean(runtimeConfig.APIMART_API_KEY),deepseek:Boolean(runtimeConfig.DEEPSEEK_API_KEY),bailian:Boolean(runtimeConfig.BAILIAN_API_KEY)},agnesModels,...registry.apimartSettingsPayload(apimartModels)});
  }
  if (p === '/api/provider-settings' && method === 'PUT') {
    const body=await readJson(req); const allowed=new Set(['AGNES_API_KEY','AGNES_BASE_URL','AGNES_TEXT_MODEL','AGNES_IMAGE_MODEL','AGNES_VIDEO_MODEL','APIMART_API_KEY','APIMART_ENABLED_MODELS','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','DEEPSEEK_TEXT_MODEL','BAILIAN_API_KEY','BAILIAN_BASE_URL','BAILIAN_MEDIA_BASE_URL','BAILIAN_TEXT_MODEL','BAILIAN_IMAGE_MODEL','BAILIAN_VIDEO_MODEL','PUBLIC_BASE_URL']);
    for(const [key,value] of Object.entries(body||{})){if(!allowed.has(key))continue;const v=String(value||'').trim();if(key==='APIMART_ENABLED_MODELS')providerSettings[key]=v;else if(v)providerSettings[key]=v;}if(body?.APIMART_API_KEY&&!Object.hasOwn(body,'APIMART_ENABLED_MODELS'))delete providerSettings.APIMART_ENABLED_MODELS;
    await persistProviderSettings(); refreshMediaAndRegistry();
    const pullApimart=runtimeConfig.APIMART_API_KEY&&(Object.hasOwn(body||{},'APIMART_API_KEY')||body?.APIMART_REFRESH_MODELS==='1');const apimartModels=pullApimart?await registry.availableApimartModels(true):await registry.availableApimartModels();
    const settings=maskedProviderSettingsView(),agnesModels=await availableAgnesModels();
    return json(res,200,{ok:true,settings,models:await listModels(),configured:{agnes:Boolean(runtimeConfig.AGNES_API_KEY),apimart:Boolean(runtimeConfig.APIMART_API_KEY),deepseek:Boolean(runtimeConfig.DEEPSEEK_API_KEY),bailian:Boolean(runtimeConfig.BAILIAN_API_KEY)},agnesModels,...registry.apimartSettingsPayload(apimartModels)});
  }
  if (p === '/api/models' && method === 'GET') return json(res, 200, { models: await listModels() });
  if (p === '/api/skills' && method === 'GET') return json(res, 200, { skills: listSkills() });
  let skillMatch = p.match(/^\/api\/projects\/([^/]+)\/skills\/([^/]+)\/apply$/);
  if (skillMatch && method === 'POST') {
    const project = projectOr404(safeDecode(skillMatch[1]));
    if (!project) return notFound(res);
    const body = await readJson(req);
    const result = applySkillToProject(project, { ...body, skillId: safeDecode(skillMatch[2]) });
    await saveDb();
    return json(res, 201, {
      skill: listSkills().find((skill) => skill.id === result.skill.id),
      workflow: result.workflow,
      skillRun: { skillId: result.skill.id, skillVersion: result.skill.version, createdNodeIds: result.result.createdNodeIds, videoNodeIds: result.result.videoNodeIds, audioPlanNodeIds: result.result.audioPlanNodeIds, input: result.result.input, autoRun: result.skill.execution?.autoRun === true },
    });
  }
  let creativeMatch = p.match(/^\/api\/projects\/([^/]+)\/creative-agent\/conversations$/);
  if (creativeMatch && method === 'GET') {
    const projectId = safeDecode(creativeMatch[1]);
    if (!projectOr404(projectId)) return notFound(res);
    return json(res, 200, { conversations: creativeAgentConversationList(projectId).map((conversation) => ({ ...conversation, messages: undefined })) });
  }
  if (creativeMatch && method === 'POST') {
    const conversation = await createCreativeAgentConversationForProject(safeDecode(creativeMatch[1]));
    return json(res, 201, conversation);
  }
  creativeMatch = p.match(/^\/api\/projects\/([^/]+)\/creative-agent\/conversations\/([^/]+)$/);
  if (creativeMatch && method === 'GET') {
    const conversation = creativeAgentConversation(safeDecode(creativeMatch[1]), safeDecode(creativeMatch[2]));
    return conversation ? json(res, 200, creativeAgentConversationView(conversation)) : notFound(res);
  }
  if (creativeMatch && method === 'PATCH') {
    const conversation = creativeAgentConversation(safeDecode(creativeMatch[1]), safeDecode(creativeMatch[2]));
    if (!conversation) return notFound(res);
    const body = await readJson(req);
    const title = String(body?.title ?? '').trim().slice(0, 80);
    if (!title) throw Object.assign(new Error('title_required'), { status: 400 });
    conversation.title = title;
    conversation.updatedAt = now();
    await saveDb();
    return json(res, 200, { ...conversation, messages: undefined });
  }
  if (creativeMatch && method === 'DELETE') {
    const conversation = creativeAgentConversation(safeDecode(creativeMatch[1]), safeDecode(creativeMatch[2]));
    if (!conversation) return notFound(res);
    delete state.creativeAgent.conversations[conversation.id];
    await saveDb();
    return json(res, 200, { ok: true, id: conversation.id });
  }
  creativeMatch = p.match(/^\/api\/projects\/([^/]+)\/creative-agent\/conversations\/([^/]+)\/messages$/);
  if (creativeMatch && method === 'POST') {
    const projectId = safeDecode(creativeMatch[1]);
    const conversation = creativeAgentConversation(projectId, safeDecode(creativeMatch[2]));
    const project = projectOr404(projectId);
    if (!project || !conversation) return notFound(res);
    const body = await readJson(req);
    const controller = new AbortController();
    let closed = false;
    res.on('close', () => { closed = true; controller.abort(); });
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const sendEvent = (event, data) => { if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    try {
      sendEvent('thinking', { message: '正在整理创意…' });
      const result = await sendCreativeAgentMessage(project, conversation, body, controller.signal);
      sendEvent('delta', { text: result.message.text });
      sendEvent('cards', { cards: result.message.cards });
      sendEvent('done', { conversationId: conversation.id, message: result.message, ...(result.workflow ? { workflow: result.workflow } : {}), ...(result.skillRun ? { skillRun: result.skillRun } : {}) });
    } catch (error) {
      if (!closed) sendEvent('error', { error: sanitizeProviderMessage(error?.message || error), retryable: ![400, 404, 422].includes(Number(error?.status)) });
    } finally {
      if (!closed) res.end();
    }
    return;
  }
  creativeMatch = p.match(/^\/api\/projects\/([^/]+)\/creative-agent\/conversations\/([^/]+)\/cards\/([^/]+)$/);
  if (creativeMatch && method === 'PATCH') {
    const conversation = creativeAgentConversation(safeDecode(creativeMatch[1]), safeDecode(creativeMatch[2]));
    if (!conversation) return notFound(res);
    const body = await readJson(req);
    const card = (conversation.messages || []).flatMap((message) => message.cards || []).find((item) => item.id === safeDecode(creativeMatch[3]));
    if (!card) return notFound(res);
    card.favorite = body.favorite === true;
    conversation.updatedAt = now();
    await saveDb();
    return json(res, 200, card);
  }
  if (p === '/api/projects' && method === 'GET') return json(res, 200, { projects: Object.values(state.projects).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) });
  if (p === '/api/projects' && method === 'POST') {
    const body = await readJson(req); const id = randomUUID(); const ts = now();
    const project = { id, name: String(body.name || 'Untitled Project').slice(0,120), settings: {}, workflow: { version: 2, nodes: [], edges: [] }, workflowRevision:1, timeline: { fps: 30, width: 1280, height: 720, items: [], tracks: { C1:{muted:false,hidden:false}, V2:{muted:false,hidden:false}, V1:{muted:false,hidden:false}, A1:{muted:false,hidden:false}, A2:{muted:false,hidden:false} } }, timelineUpdatedAt:ts, createdAt: ts, updatedAt: ts };
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
  m = p.match(/^\/api\/projects\/([^/]+)\/canvas\/selection$/);
  if (m && method === 'PUT') {
    const pr=projectOr404(m[1]);if(!pr)return notFound(res);const body=await readJson(req),nodeIds=Array.isArray(body.nodeIds)?body.nodeIds.map(String).filter(id=>pr.workflow.nodes.some(node=>node.id===id)):[],edgeIds=Array.isArray(body.edgeIds)?body.edgeIds.map(String).filter(id=>pr.workflow.edges.some(edge=>edge.id===id)):[];
    const selection={nodeIds:[...new Set(nodeIds)],edgeIds:[...new Set(edgeIds)]};canvasSelections.set(pr.id,selection);return json(res,200,selection);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,{ ...pr.workflow, version:Number(pr.workflowRevision || pr.workflow?.version || 1) }) : notFound(res); }
  if (m && method === 'PUT') {
    const pr = projectOr404(m[1]); if (!pr) return notFound(res);
    const body = await readJson(req); const version = Number(pr.workflowRevision || pr.workflow?.version || 1);
    if (Number(body.version) !== version) return json(res,409,{error:'workflow_version_conflict',expectedVersion:Number(body.version),actualVersion:version});
    const nextVersion = version + 1;
    pr.workflow = { version: nextVersion, nodes: Array.isArray(body.nodes) ? body.nodes : [], edges: Array.isArray(body.edges) ? body.edges : [] };
    pr.workflowRevision = nextVersion; pr.updatedAt = now(); await saveDb(); return json(res,200,pr.workflow);
  }
  m = p.match(/^\/api\/projects\/([^/]+)\/timeline$/);
  if (m && method === 'GET') { const pr = projectOr404(m[1]); return pr ? json(res,200,pr.timeline) : notFound(res); }
  if (m && method === 'PUT') { const pr = projectOr404(m[1]); if (!pr) return notFound(res); const body = await readJson(req); pr.timeline = { fps: Number(body.fps || 30), width: Number(body.width || 1280), height: Number(body.height || 720), items: Array.isArray(body.items) ? body.items : [], tracks: body.tracks && typeof body.tracks === 'object' ? body.tracks : (pr.timeline.tracks || {}) }; pr.timelineUpdatedAt=now();pr.updatedAt = pr.timelineUpdatedAt; await saveDb(); return json(res,200,pr.timeline); }
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
    if(model.providerId==='agnes'&&!runtimeConfig.PUBLIC_BASE_URL)throw Object.assign(new Error('Agnes 锚定重拍需要先配置素材公网地址。'),{status:422,code:'reference_not_public'});
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
    validateGenerationRequest(model, jobRequest, jobRequest.references, (id) => state.assets[id]);
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
    if(model.providerId==='agnes'&&!runtimeConfig.PUBLIC_BASE_URL)throw Object.assign(new Error('Agnes 续写接片需要先配置素材公网地址。'),{status:422,code:'reference_not_public'});
    const fps = Math.max(1, Number(pr.timeline?.fps || 30));
    const tailIdx = item.kind === 'image' ? 0 : Math.max(0, Number(item.sourceOutFrame || (Number(item.sourceInFrame || 0) + Number(item.durationInFrames || 1))) - 1);
    const tail = await extractFrameAsset(pr, randomUUID(), asset, tailIdx, fps, 'tail-frame');
    const prompt = String(body.prompt || '').trim() || '延续上一镜头的画面、主体与光线，继续生成';
    const params = { ...(body.params || {}) };
    if (params.duration == null) { const picked = pickDuration(model, Math.max(1, Math.round(Number(item.durationInFrames || 1) / fps))); if (picked) params.duration = picked; }
    const jobRequest = { projectId: pr.id, capability: 'video.image_to_video', providerId: model.providerId, modelId: model.modelId, prompt, params: { ...params, extendAfterItemId: item.id, timelineItemId: item.id }, references: [{ assetId: tail.id, role: 'first-frame', timelineItemId: item.id, sourceInFrame: tailIdx, sourceOutFrame: tailIdx + 1 }] };
    validateGenerationRequest(model, jobRequest, jobRequest.references, (id) => state.assets[id]);
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
    const body = await readJson(req); const { jobRequest } = await prepareStandaloneGeneration(body);
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
    const openedAt=Date.now(), EVENT_MAX_LIFETIME_MS=10*60*1000; let lastPing=0;
    while (!closed) {
      if (Date.now()-openedAt>EVENT_MAX_LIFETIME_MS) break;
      const job=state.jobs[m[1]]; if (!job) break;
      res.write(`event: generation\ndata: ${JSON.stringify({...job,outputs:(job.outputAssetIds||[]).map(id=>state.assets[id]).filter(Boolean)})}\n\n`);
      if (['succeeded','failed','canceled'].includes(job.status)) break;
      if (Date.now()-lastPing>=25_000) { res.write(': ping\n\n'); lastPing=Date.now(); }
      await sleep(500);
    } return res.end();
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
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')) return await handleApi(req,res,url);
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
  console.log(`Providers: apimart=${Boolean(runtimeConfig.APIMART_API_KEY)} agnes=${Boolean(runtimeConfig.AGNES_API_KEY)} deepseek=${Boolean(runtimeConfig.DEEPSEEK_API_KEY)} bailian=${Boolean(runtimeConfig.BAILIAN_API_KEY)}`);
  console.log(`FFmpeg: ${HAS_FFMPEG} · Caption font: ${Boolean(FFMPEG_FONT_FILE)}`);
});
