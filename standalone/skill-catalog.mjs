import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(ROOT, 'skills');

function loadSkills() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(SKILLS_DIR, entry.name, 'skill.json'))
    .map((file) => {
      try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
    })
    .filter((skill) => skill && typeof skill.id === 'string' && typeof skill.name === 'string');
}

let SKILLS = loadSkills();

function publicSkill(skill) {
  const { promptTemplates: _promptTemplates, ...metadata } = skill;
  return metadata;
}

export function listSkills() {
  return SKILLS.map(publicSkill);
}

export function skillById(id) {
  return SKILLS.find((skill) => skill.id === String(id));
}

export function reloadSkills() {
  SKILLS = loadSkills();
  return listSkills();
}

function importError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, message, status });
}

function extractLiblibTemplateUuid(input) {
  const raw = String(input || '').trim();
  if (/^[a-f0-9]{32}$/i.test(raw)) return raw.toLowerCase();
  let url;
  try { url = new URL(raw); } catch { throw importError('invalid_liblib_url', '请输入有效的 Liblib Skill 分享链接。'); }
  const host = url.hostname.toLowerCase();
  if (!['liblib.tv', 'www.liblib.tv'].includes(host)) throw importError('invalid_liblib_url', '只支持 liblib.tv 的 Skill 分享链接。');
  const uuid = url.searchParams.get('uuid') || '';
  if (!/^[a-f0-9]{32}$/i.test(uuid)) throw importError('invalid_liblib_uuid', '分享链接中没有有效的 Skill UUID。');
  return uuid.toLowerCase();
}

function parseSnapshotData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function mediaTypeFromUrl(url) {
  const path = String(url || '').split('?')[0].toLowerCase();
  if (/\.(jpe?g|png|webp|gif|avif)$/.test(path)) return 'image';
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
  return '';
}

function importedExamples(remote, snapshot) {
  const cases = Array.isArray(remote?.caseItems) ? remote.caseItems : Array.isArray(snapshot?.caseItems) ? snapshot.caseItems : [];
  const examples = cases.map((item, index) => {
    const url = String(item?.productionCaseUrl || item?.imageUrl || item?.url || item?.coverUrl || '').trim();
    const type = mediaTypeFromUrl(url) || (String(item?.type || '').toLowerCase() === 'image' ? 'image' : String(item?.type || '').toLowerCase() === 'video' ? 'video' : '');
    return { type, url, label: `案例 ${index + 1}`, ...(item?.canvasCaseUrl ? { canvasUrl: item.canvasCaseUrl } : {}) };
  }).filter((item) => item.url && item.type);
  if (!examples.length && remote?.coverUrl) examples.push({ type: 'image', url: String(remote.coverUrl), label: 'Skill 封面' });
  return examples;
}

function importedKind(remote) {
  const resultType = Number(remote?.resultType);
  // Liblib SkillResultType: Text=1, Image=2, Video=3, Audio=4.
  if (resultType === 1) return '文本';
  if (resultType === 2) return '图片';
  if (resultType === 3) return '视频';
  if (resultType === 4) return '音频';
  return /图片|海报|画面/.test(`${remote?.outputContent || ''}${remote?.description || ''}`) ? '图片' : '视频';
}

function importedDuration(remote) {
  const values = [...String(remote?.outputContent || '').matchAll(/\d+/g)].map((match) => Number(match[0])).filter((value) => value > 0 && value <= 120);
  return { duration: values[0] || 15, options: [...new Set(values)].slice(0, 4).length ? [...new Set(values)].slice(0, 4) : [15] };
}

function importedFormat(remote) {
  const text = `${remote?.outputContent || ''}${remote?.inputType || ''}`;
  if (/竖/.test(text) && /横/.test(text)) return { format: '9:16 / 16:9', options: ['9:16', '16:9'], default: '9:16' };
  if (/竖/.test(text)) return { format: '9:16', options: ['9:16'], default: '9:16' };
  return { format: '16:9', options: ['16:9'], default: '16:9' };
}

function importedCardSummary(remote) {
  const source = safeText(remote?.description || remote?.outputContent || remote?.name || 'Liblib Skill', 96)
    .replace(/\d+\s*秒/g, '').replace(/v\d+(?:\.\d+)*/gi, '').replace(/\d+\s*镜/g, '').replace(/\s+/g, ' ').trim();
  return (source || `一键生成${remote?.name || '创作内容'}`).slice(0, 72);
}

function importedPromptTemplates(kind) {
  if (kind === '图片') return {
    videoPlanSystem: '你是视觉创意总监。把用户的图片需求拆成主体、场景、构图、风格、光线和连续性约束，输出简洁可执行的生成计划。不要新增未指定的主体。',
    videoPlanPrompt: '请拆解以下图片生成需求：{{INSTRUCTION}}。输出主体、场景、构图、风格、光线、参考素材使用方式和负面约束。',
    imagePrompt: '图片生成指令：{{INSTRUCTION}}。保持主体身份、结构、材质和风格稳定，画面清晰，避免随机新增主体、变形、文字和水印。画幅 {{ASPECT_RATIO}}。',
  };
  return {
    videoPlanSystem: '你是视频导演和提示词工程师。把用户一句话拆成主体、动作、场景、镜头、风格、情绪和连续性约束，输出简洁可执行的生成计划。不要新增未指定的主体或剧情。',
    videoPlanPrompt: '请拆解以下视频生成需求：{{INSTRUCTION}}。输出主体、动作链、场景与光线、镜头运动、风格与情绪、连续性约束和负面约束。',
    videoPrompt: '视频生成指令：{{INSTRUCTION}}。保持主体身份、服装、场景和镜头连续，动作清晰可追踪；不得随机增加主体、变脸、换装、肢体变形、穿模、无指令切镜或画面文字。目标时长 {{DURATION_SEC}} 秒，画幅 {{ASPECT_RATIO}}。',
  };
}

function importedSkillMarkdown(skill) {
  return `---\nname: ${skill.id}\ndescription: ${String(skill.description || 'Imported Liblib Skill').replace(/\r?\n/g, ' ')}\nmetadata:\n  short-description: Imported from LiblibTV\n---\n\n# ${skill.name}\n\nThis project-local Skill was imported from LiblibTV. Select it in the Agent, provide the requested instruction and optional reference material, then run the generated canvas workflow.\n\nSource: ${skill.source?.url || ''}\n`;
}

function normalizedImportedSkill(remote, snapshot, templateUuid, shareUrl, existing) {
  const kind = importedKind(remote);
  const duration = importedDuration(remote);
  const format = importedFormat(remote);
  const examples = importedExamples(remote, snapshot);
  const tags = (Array.isArray(remote?.tags) ? remote.tags.map((tag) => tag?.tagLabel || tag?.name || tag).filter(Boolean) : []);
  const description = safeText(remote?.description || `${remote?.name || 'Liblib Skill'} 创作预设。`, 280);
  const instruction = kind === '图片' ? '输入主体、场景、风格和构图需求。' : '输入主体、动作、场景和风格需求。';
  const id = existing?.id || `liblib-skill-${templateUuid.slice(0, 12)}`;
  const genericWorkflow = kind === '图片' ? 'generic-image' : 'generic-video';
  return {
    id,
    version: Number(existing?.version || 1),
    sourceVersion: String(remote?.version || '1'),
    name: safeText(remote?.name || `Liblib Skill ${templateUuid.slice(0, 8)}`, 40),
    category: tags[0] || 'Liblib Skill',
    kind,
    cover: String(remote?.coverUrl || ''),
    author: String(remote?.ownerName || remote?.nickname || 'LiblibTV'),
    description,
    cardSummary: importedCardSummary(remote),
    usage: String(remote?.useScenario || ''),
    howToUse: `在 Agent 中选择该 Skill，${kind === '图片' ? '输入图片需求' : '输入视频需求'}，按需添加参考素材；发送后执行工作流。`,
    tags: [...new Set([...tags, 'LiblibTV'])].slice(0, 8),
    source: { provider: 'LiblibTV', templateUuid, skillUuid: remote?.skillUuid || '', skillKey: remote?.skillKey || '', inputType: String(remote?.inputType || ''), outputContent: String(remote?.outputContent || ''), url: shareUrl, importedAt: new Date().toISOString() },
    inputs: [
      { id: 'instruction', label: '创作描述', type: 'text', required: true, placeholder: instruction || '输入你的创作描述' },
      { id: 'referenceAsset', label: '参考素材', type: 'asset', required: false, accept: kind === '图片' ? ['image'] : ['image', 'video'] },
      ...(kind === '视频' ? [{ id: 'durationSec', label: '目标时长', type: 'select', required: true, default: duration.duration, options: duration.options }] : []),
      { id: 'aspectRatio', label: '画幅', type: 'select', required: true, default: format.default, options: format.options },
    ],
    outputs: [String(remote?.outputContent || `${kind}生成结果`).trim(), '自动加入画布的生成节点', ...(kind === '视频' ? ['自动加入 Timeline 的视频成片草稿'] : [])],
    fixedSteps: kind === '图片'
      ? ['提取主体、场景、构图、风格和光线约束', '有参考素材时锁定主体身份与视觉连续性', '按目标画幅生成图片节点', '保留结果并回到画布继续创作']
      : ['提取主体、动作、场景、镜头、风格和情绪约束', '有参考图或视频时锁定主体与动作连续性', '按目标画幅与时长生成视频节点', '将成功的视频结果自动加入 Timeline'],
    rules: { format: format.format, ...(kind === '视频' ? { durationSec: duration.duration, durationOptions: duration.options, shotDurationSec: duration.duration } : {}), shotCount: 1, continuity: '保持主体身份、服装、材质、场景和光线连续。', safety: '禁止随机新增主体、变脸、换装、肢体变形、穿模、无指令切镜和画面文字。' },
    promptTemplates: importedPromptTemplates(kind),
    examples,
    execution: { workflow: genericWorkflow, adapter: kind === '图片' ? 'single-image' : 'single-video', requiresExplicitSelection: true, autoRun: true, generateKeyframes: false, generateShotVideos: kind === '视频', appendVideosToTimeline: kind === '视频', audioMode: 'full' },
  };
}

export async function importLiblibSkill(input) {
  const templateUuid = extractLiblibTemplateUuid(input);
  const shareUrl = /^[a-f0-9]{32}$/i.test(String(input || '').trim()) ? `https://www.liblib.tv/skill/share?uuid=${templateUuid}` : String(input).trim();
  const endpoint = `https://api.liblib.tv/api/community/skill/template/detail?templateUuid=${encodeURIComponent(templateUuid)}`;
  let response;
  try {
    response = await fetch(endpoint, { headers: { accept: 'application/json', 'x-language': 'zh', origin: 'https://www.liblib.tv', referer: shareUrl }, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw importError('liblib_fetch_failed', `无法连接 Liblib Skill 接口：${error.message}`, 502);
  }
  if (!response.ok) throw importError('liblib_fetch_failed', `Liblib Skill 接口返回 ${response.status}。`, 502);
  const payload = await response.json();
  const remote = payload?.data?.skill || payload?.data?.template || payload?.skill;
  if (!remote?.name) throw importError('liblib_skill_invalid', 'Liblib 返回的数据中没有可导入的 Skill。', 422);
  const kind = importedKind(remote);
  if (!['图片', '视频'].includes(kind)) throw importError('unsupported_liblib_kind', '当前只支持图片和视频类型 Skill 导入。', 422);
  const snapshot = parseSnapshotData(remote.snapshotData);
  const existing = SKILLS.find((skill) => skill.source?.templateUuid === templateUuid);
  const generated = normalizedImportedSkill(remote, snapshot, templateUuid, shareUrl, existing);
  const skill = existing
    ? { ...existing, ...generated, id: existing.id, promptTemplates: existing.promptTemplates, execution: existing.execution, fixedSteps: existing.fixedSteps, rules: existing.rules, inputs: existing.inputs, outputs: existing.outputs }
    : generated;
  const skillDir = join(SKILLS_DIR, skill.id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'skill.json'), `${JSON.stringify(skill, null, 2)}\n`, 'utf8');
  const skillReadme = join(skillDir, 'SKILL.md');
  if (!existsSync(skillReadme)) writeFileSync(skillReadme, importedSkillMarkdown(skill), 'utf8');
  reloadSkills();
  return { skill: publicSkill(skillById(skill.id)), created: !existing, updated: Boolean(existing), sourceUrl: shareUrl };
}

function replaceTokens(value, tokens) {
  return String(value ?? '').replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => String(tokens[key] ?? ''));
}

function safeText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function positionForExistingWorkflow(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  if (!nodes.length) return { x: -100, y: 0 };
  const maxX = Math.max(...nodes.map((node) => Number(node?.position?.x || 0) + 520));
  return { x: Math.ceil((maxX + 80) / 10) * 10, y: 0 };
}

function makeTextNode({ id, title, preset, prompt, system, position, skillId, workflowStage, extra = {} }) {
  return {
    id,
    type: 'textGen',
    position,
    data: {
      title,
      modelKey: '',
      prompt,
      system,
      preset,
      status: 'idle',
      progress: 0,
      outputText: '',
      params: { temperature: 0.55 },
      skillId,
      workflowStage,
      ...extra,
    },
  };
}

function makeImageNode({ id, prompt, position, skillId, shot, sourceId, aspectRatio, productAssetId }) {
  return {
    id,
    type: 'imageGen',
    position,
    data: {
      title: `${shot} · 关键帧`,
      modelKey: '',
      prompt,
      status: 'idle',
      progress: 0,
      params: { aspectRatio, quality: '1K', variants: 1 },
      expanded: false,
      actionId: productAssetId ? 'image.edit' : 'image.generate',
      skillId,
      workflowStage: 'skill-keyframe',
      storyboardShot: shot,
      storyboardShotIndex: Number(shot.slice(1)) - 1,
      storyboardDurationSec: 3,
      storyboardSourceId: sourceId,
      storyboardStatus: 'approved',
      layoutWidth: 500,
    },
  };
}

function makeVideoNode({ id, prompt, position, skillId, shot, sourceId, aspectRatio, audioMode }) {
  return {
    id,
    type: 'videoGen',
    position,
    data: {
      title: `${shot} · 首帧视频`,
      modelKey: '',
      prompt,
      status: 'idle',
      progress: 0,
      params: { duration: 3, aspectRatio, resolution: '720p', audioMode },
      expanded: false,
      forcedCapability: 'video.image_to_video',
      actionId: 'video.image_to_video',
      skillId,
      workflowStage: 'skill-video',
      storyboardShot: shot,
      storyboardShotIndex: Number(shot.slice(1)) - 1,
      storyboardDurationSec: 3,
      storyboardSourceId: sourceId,
      storyboardStatus: 'approved',
      layoutWidth: 500,
    },
  };
}

function buildCinematicVfxWorkflow({ skill, existingWorkflow, referenceAssetId, referenceKind, instruction, durationSec, aspectRatio }) {
  const creativeInstruction = safeText(instruction, 4000);
  if (!creativeInstruction) throw Object.assign(new Error('instruction_required'), { status: 400 });
  const reference = safeText(referenceAssetId, 160);
  const ratio = String(aspectRatio || skill.inputs?.find((input) => input.id === 'aspectRatio')?.default || '9:16');
  const requestedDuration = Math.max(1, Number(durationSec || skill.rules?.durationSec || 15));
  const segmentDuration = Math.min(10, requestedDuration);
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = { INSTRUCTION: creativeInstruction, DURATION_SEC: requestedDuration, ASPECT_RATIO: ratio };
  const planPrompt = skill.promptTemplates.vfxPlanPrompt || skill.promptTemplates.videoPlanPrompt;
  const planSystem = skill.promptTemplates.vfxPlanSystem || skill.promptTemplates.videoPlanSystem;
  const videoPrompt = skill.promptTemplates.vfxVideoPrompt || skill.promptTemplates.videoPrompt;
  const isVfx = skill.execution?.workflow === 'cinematic-vfx';
  const nodes = [];
  const edges = [];
  const addEdge = (source, target, role) => edges.push({ id: `e-${randomUUID()}`, source, target, ...(role ? { role } : {}) });

  const planId = `skill-vfx-plan-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: planId,
    title: isVfx ? '影视特效 · 动作拆解' : `${skill.name} · 生成计划`,
    preset: 'video_script',
    prompt: replaceTokens(planPrompt, tokens),
    system: planSystem,
    position: { x: base.x, y: base.y },
    skillId: skill.id,
    workflowStage: 'vfx-plan',
    extra: { skillGate: 'vfx-plan', requestedDurationSec: requestedDuration },
  }));

  const videoId = `skill-vfx-video-${randomUUID()}`;
  const referenceAsset = reference ? String(referenceKind || '') : '';
  const capability = referenceAsset === 'image'
    ? 'video.image_to_video'
    : referenceAsset === 'video'
      ? 'video.reference'
      : 'video.generate';
  nodes.push({
    id: videoId,
    type: 'videoGen',
    position: { x: base.x + 540, y: base.y },
    data: {
      title: isVfx ? '影视特效 · 成片' : `${skill.name} · 视频生成`,
      modelKey: '',
      prompt: replaceTokens(videoPrompt, tokens),
      status: 'idle',
      progress: 0,
      params: { duration: segmentDuration, aspectRatio: ratio, resolution: '720p', audioMode: skill.execution?.audioMode || 'full' },
      expanded: false,
      forcedCapability: capability,
      actionId: capability,
      skillId: skill.id,
      workflowStage: 'skill-video',
      storyboardShot: 'S1',
      storyboardShotIndex: 0,
      storyboardDurationSec: requestedDuration,
      requestedDurationSec: requestedDuration,
      segmentDurationSec: segmentDuration,
      storyboardStatus: 'approved',
      layoutWidth: 500,
    },
  });

  if (reference) {
    const assetId = `skill-vfx-asset-${randomUUID()}`;
    nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: reference, skillId: skill.id, workflowStage: 'reference-material' } });
    addEdge(assetId, videoId, referenceAsset === 'image' ? 'first-frame' : 'reference-video');
  }

  const currentNodes = Array.isArray(existingWorkflow?.nodes) ? existingWorkflow.nodes : [];
  const currentEdges = Array.isArray(existingWorkflow?.edges) ? existingWorkflow.edges : [];
  return {
    skillId: skill.id,
    skillVersion: skill.version,
    mode: 'production',
    nodes: [...currentNodes, ...nodes],
    edges: [...currentEdges, ...edges],
    createdNodeIds: nodes.map((node) => node.id),
    videoNodeIds: [videoId],
    audioPlanNodeIds: [],
    input: { referenceAssetId: reference, instruction: creativeInstruction, durationSec: requestedDuration, segmentDurationSec: segmentDuration, aspectRatio: ratio },
  };
}

function buildGenericImageWorkflow({ skill, existingWorkflow, referenceAssetId, instruction, aspectRatio }) {
  const creativeInstruction = safeText(instruction, 4000);
  if (!creativeInstruction) throw Object.assign(new Error('instruction_required'), { status: 400 });
  const reference = safeText(referenceAssetId, 160);
  const ratio = String(aspectRatio || skill.inputs?.find((input) => input.id === 'aspectRatio')?.default || '16:9');
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = { INSTRUCTION: creativeInstruction, ASPECT_RATIO: ratio };
  const nodes = [];
  const edges = [];
  const planId = `skill-image-plan-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: planId,
    title: `${skill.name} · 生成计划`,
    preset: 'rewrite',
    prompt: replaceTokens(skill.promptTemplates.videoPlanPrompt, tokens),
    system: skill.promptTemplates.videoPlanSystem,
    position: { x: base.x, y: base.y },
    skillId: skill.id,
    workflowStage: 'image-plan',
  }));
  const imageId = `skill-image-${randomUUID()}`;
  const capability = reference ? 'image.edit' : 'image.generate';
  nodes.push({
    id: imageId,
    type: 'imageGen',
    position: { x: base.x + 540, y: base.y },
    data: {
      title: `${skill.name} · 图片生成`,
      modelKey: '',
      prompt: replaceTokens(skill.promptTemplates.imagePrompt, tokens),
      status: 'idle',
      progress: 0,
      params: { aspectRatio: ratio, quality: '1K', variants: 1 },
      expanded: false,
      actionId: capability,
      skillId: skill.id,
      workflowStage: 'skill-image',
      storyboardShot: 'S1',
      storyboardShotIndex: 0,
      storyboardStatus: 'approved',
      layoutWidth: 500,
    },
  });
  if (reference) {
    const assetId = `skill-image-asset-${randomUUID()}`;
    nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: reference, skillId: skill.id, workflowStage: 'reference-material' } });
    edges.push({ id: `e-${randomUUID()}`, source: assetId, target: imageId, role: 'reference-image' });
  }
  const currentNodes = Array.isArray(existingWorkflow?.nodes) ? existingWorkflow.nodes : [];
  const currentEdges = Array.isArray(existingWorkflow?.edges) ? existingWorkflow.edges : [];
  return {
    skillId: skill.id,
    skillVersion: skill.version,
    mode: 'production',
    nodes: [...currentNodes, ...nodes],
    edges: [...currentEdges, ...edges],
    createdNodeIds: nodes.map((node) => node.id),
    videoNodeIds: [],
    audioPlanNodeIds: [],
    input: { referenceAssetId: reference, instruction: creativeInstruction, aspectRatio: ratio },
  };
}

export function buildSkillWorkflow({ skill, existingWorkflow, productAssetId, sellingPoints, brandName, durationSec, aspectRatio, referenceAssetId, referenceKind, instruction }) {
  if (!skill) throw Object.assign(new Error('skill_not_found'), { status: 404 });
  if (skill.execution?.workflow === 'cinematic-vfx' || skill.execution?.workflow === 'generic-video') {
    return buildCinematicVfxWorkflow({ skill, existingWorkflow, referenceAssetId, referenceKind, instruction: instruction || sellingPoints, durationSec, aspectRatio });
  }
  if (skill.execution?.workflow === 'generic-image') {
    return buildGenericImageWorkflow({ skill, existingWorkflow, referenceAssetId, instruction: instruction || sellingPoints, aspectRatio });
  }
  const product = safeText(productAssetId, 160);
  const points = safeText(sellingPoints, 2000);
  if (!product) throw Object.assign(new Error('product_image_required'), { status: 400 });
  if (!points) throw Object.assign(new Error('selling_points_required'), { status: 400 });
  const ratio = String(aspectRatio || skill.inputs.find((input) => input.id === 'aspectRatio')?.default || '16:9');
  const duration = Number(durationSec || skill.rules.durationSec || 15);
  const brand = safeText(brandName, 120) || '品牌产品';
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = {
    BRAND: brand,
    SELLING_POINTS: points,
    DURATION_SEC: duration,
    ASPECT_RATIO: ratio,
    PRODUCT_BINDING: '产品图片已作为主体参考绑定到每个关键帧节点',
  };
  const nodes = [];
  const edges = [];
  const addEdge = (source, target, role) => edges.push({ id: `e-${randomUUID()}`, source, target, ...(role ? { role } : {}) });

  const assetId = `skill-asset-${randomUUID()}`;
  nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: product, skillId: skill.id, workflowStage: 'product-reference' } });

  const anchorId = `skill-anchor-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: anchorId,
    title: 'TVC · 创意锚点',
    preset: 'video_script',
    prompt: replaceTokens(skill.promptTemplates.anchorPrompt, tokens),
    system: skill.promptTemplates.anchorSystem,
    position: { x: base.x, y: base.y },
    skillId: skill.id,
    workflowStage: 'creative-anchor',
    extra: { skillGate: 'anchor' },
  }));

  const storyboardId = `skill-storyboard-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: storyboardId,
    title: 'TVC · 五镜头分镜',
    preset: 'storyboard',
    prompt: replaceTokens(skill.promptTemplates.storyboardPrompt, tokens),
    system: skill.promptTemplates.storyboardSystem,
    position: { x: base.x + 540, y: base.y },
    skillId: skill.id,
    workflowStage: 'storyboard',
    extra: { skillGate: 'storyboard', requiresApproval: false },
  }));
  addEdge(anchorId, storyboardId, 'script');

  const shots = skill.promptTemplates.shotImages || [];
  const motions = skill.promptTemplates.shotVideos || [];
  shots.forEach((imagePrompt, index) => {
    const shot = `S${index + 1}`;
    const rowY = base.y + 430 + index * 420;
    const imageId = `skill-image-${shot.toLowerCase()}-${randomUUID()}`;
    const videoId = `skill-video-${shot.toLowerCase()}-${randomUUID()}`;
    const filledImage = replaceTokens(imagePrompt, tokens);
    const filledVideo = replaceTokens(motions[index] || '', tokens);
    nodes.push(makeImageNode({ id: imageId, prompt: filledImage, position: { x: base.x, y: rowY }, skillId: skill.id, shot, sourceId: storyboardId, aspectRatio: ratio, productAssetId: product }));
    nodes.push(makeVideoNode({ id: videoId, prompt: filledVideo, position: { x: base.x + 520, y: rowY }, skillId: skill.id, shot, sourceId: storyboardId, aspectRatio: ratio, audioMode: skill.execution.audioMode || 'full' }));
    addEdge(storyboardId, imageId, 'script');
    addEdge(assetId, imageId, 'reference-image');
    addEdge(imageId, videoId, 'first-frame');
  });

  const voiceId = `skill-voice-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: voiceId,
    title: 'TVC · 旁白 VO 方案',
    preset: 'rewrite',
    prompt: replaceTokens(skill.promptTemplates.voiceoverPrompt, tokens),
    system: skill.promptTemplates.voiceoverSystem,
    position: { x: base.x + 1080, y: base.y + 20 },
    skillId: skill.id,
    workflowStage: 'voiceover-plan',
    extra: { audioCapability: 'audio.tts', audioStatus: 'plan-ready' },
  }));
  addEdge(storyboardId, voiceId, 'script');

  const musicId = `skill-music-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: musicId,
    title: 'TVC · 国风电子 BGM 方案',
    preset: 'rewrite',
    prompt: replaceTokens(skill.promptTemplates.musicPrompt, tokens),
    system: skill.promptTemplates.musicSystem,
    position: { x: base.x + 1080, y: base.y + 320 },
    skillId: skill.id,
    workflowStage: 'music-plan',
    extra: { audioCapability: 'audio.music', audioStatus: 'plan-ready' },
  }));
  addEdge(storyboardId, musicId, 'script');

  const currentNodes = Array.isArray(existingWorkflow?.nodes) ? existingWorkflow.nodes : [];
  const currentEdges = Array.isArray(existingWorkflow?.edges) ? existingWorkflow.edges : [];
  return {
    skillId: skill.id,
    skillVersion: skill.version,
    mode: 'production',
    nodes: [...currentNodes, ...nodes],
    edges: [...currentEdges, ...edges],
    createdNodeIds: nodes.map((node) => node.id),
    videoNodeIds: nodes.filter((node) => node.type === 'videoGen').map((node) => node.id),
    audioPlanNodeIds: [voiceId, musicId],
    input: { productAssetId: product, sellingPoints: points, brandName: brand, durationSec: duration, aspectRatio: ratio },
  };
}
