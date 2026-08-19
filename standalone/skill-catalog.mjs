import { readFileSync, readdirSync } from 'node:fs';
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

const SKILLS = loadSkills();

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

export function buildSkillWorkflow({ skill, existingWorkflow, productAssetId, sellingPoints, brandName, durationSec, aspectRatio }) {
  if (!skill) throw Object.assign(new Error('skill_not_found'), { status: 404 });
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
