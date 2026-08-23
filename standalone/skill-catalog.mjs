import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  if (!['liblib.tv', 'www.liblib.tv', 'liblib.art', 'www.liblib.art'].includes(host)) throw importError('invalid_liblib_url', '只支持 Liblib Skill 分享链接。');
  const uuid = url.searchParams.get('uuid') || url.searchParams.get('templateUuid') || '';
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
  const values = [...String(remote?.outputContent || '').matchAll(/(\d+)\s*(?:秒|s\b|sec(?:ond)?s?\b)/gi)].map((match) => Number(match[1])).filter((value) => value > 0 && value <= 120);
  const options = [...new Set(values)].slice(0, 4);
  return { duration: options[0] || null, options };
}

function extractJimengSkillId(input) {
  const raw = String(input || '').trim();
  if (/^\d{8,32}$/.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { throw importError('invalid_skill_url', '请输入有效的 Skill 详情或分享链接。'); }
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)jimeng\.jianying\.com$/.test(host)) return '';
  const candidates = [
    url.searchParams.get('skill_id'),
    url.searchParams.get('skillId'),
    url.searchParams.get('id'),
    ...url.pathname.split('/').filter(Boolean).reverse(),
  ];
  return candidates.map((value) => String(value || '').trim()).find((value) => /^\d{8,32}$/.test(value)) || '';
}

function isJimengInput(input) {
  const raw = String(input || '').trim();
  if (/^\d{8,32}$/.test(raw)) return true;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return /(^|\.)jimeng\.jianying\.com$/.test(host);
  } catch { return false; }
}

function importedFormat(remote) {
  const text = `${remote?.outputContent || ''}${remote?.inputType || ''}`;
  if (/竖/.test(text) && /横/.test(text)) return { format: '9:16 / 16:9', options: ['9:16', '16:9'], default: '9:16' };
  if (/竖/.test(text)) return { format: '9:16', options: ['9:16'], default: '9:16' };
  if (/16\s*[:：]\s*9|横版/.test(text)) return { format: '16:9', options: ['16:9'], default: '16:9' };
  if (/1\s*[:：]\s*1|方图/.test(text)) return { format: '1:1', options: ['1:1'], default: '1:1' };
  return { format: '未指定', options: [], default: '' };
}

function importedCardSummary(remote) {
  const source = safeText(remote?.description || remote?.outputContent || remote?.name || 'Liblib Skill', 96)
    .replace(/\d+\s*秒/g, '').replace(/v\d+(?:\.\d+)*/gi, '').replace(/\d+\s*镜/g, '').replace(/\s+/g, ' ').trim();
  return (source || `一键生成${remote?.name || '创作内容'}`).slice(0, 72);
}

function splitSourceOutputs(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  // Chinese commas are commonly used inside a prose description. Only treat
  // them as separators when the source did not publish sentence-like prose.
  const separator = /、|[；;\n]/.test(text)
    ? /[、；;\n]/
    : !/[。.!！？?]/.test(text) && /[，,]/.test(text)
      ? /[，,]/
      : null;
  return (separator ? text.split(separator) : [text]).map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function importedSourceContract(remote, snapshot) {
  const value = (key) => safeText(remote?.[key] || snapshot?.[key] || '', 1200);
  const inputType = value('inputType');
  const outputContent = value('outputContent');
  return {
    name: value('name'),
    description: value('description'),
    useScenario: value('useScenario'),
    inputType,
    outputContent,
    outputItems: splitSourceOutputs(outputContent),
    sourceVersion: value('version'),
    resultType: Number(remote?.resultType || snapshot?.resultType || 0) || null,
    sourceType: Number(remote?.sourceType || snapshot?.sourceType || 0) || null,
    showMarkdown: Boolean(remote?.showMarkdown ?? snapshot?.showMarkdown),
  };
}

function sourceContractPrompt(contract) {
  const lines = [
    '【来源 Skill 的公开执行契约】',
    `名称：${contract.name || '未命名 Skill'}`,
    contract.description ? `说明：${contract.description}` : '',
    contract.useScenario ? `使用场景：${contract.useScenario}` : '',
    contract.inputType ? `输入：${contract.inputType}` : '输入：来源未公开具体字段；以用户创作描述和已附素材为准。',
    contract.outputContent ? `交付物：${contract.outputContent}` : '交付物：来源未公开具体条目；按 Skill 的结果类型交付。',
    contract.sourceVersion ? `来源版本：${contract.sourceVersion}` : '',
    '仅把以上内容当作该 Skill 的公开配置；不得声称或编造来源未公开的私有画布、隐藏提示词或模型参数。',
  ];
  return lines.filter(Boolean).join('\n');
}

function importedPromptTemplates(kind, contract) {
  const sourceRules = sourceContractPrompt(contract);
  const planSystem = `你是 Skill 执行导演。必须先遵守下列来源公开执行契约，再补全用户提供的变量；每项已声明交付物都要在计划中有对应步骤。来源没有公开的规则不能臆造。\n\n${sourceRules}`;
  const planPrompt = `根据来源公开执行契约和用户当前需求制定可编辑执行计划。\n\n用户需求：{{INSTRUCTION}}\n\n请按“输入核对 → 来源声明的交付物逐项制作 → 验收”输出；对缺失输入只标明待补，不自行虚构。`;
  if (kind === '图片') return {
    videoPlanSystem: planSystem,
    videoPlanPrompt: planPrompt,
    imagePrompt: `${sourceRules}\n\n图片执行：{{INSTRUCTION}}。请严格遵守来源的输入和交付物定义，并采用上游已确认的计划；未声明的主体、文字、品牌和风格不可擅自新增。画幅 {{ASPECT_RATIO}}。`,
  };
  if (kind === '音频') return {
    videoPlanSystem: planSystem,
    videoPlanPrompt: planPrompt,
    videoPrompt: `${sourceRules}\n\n音频执行：{{INSTRUCTION}}。请严格按来源公开交付物制作，并采用上游已确认的计划；时长 {{DURATION_SEC}} 秒。`,
  };
  if (kind === '文本') return {
    videoPlanSystem: planSystem,
    videoPlanPrompt: planPrompt,
    videoPrompt: `${sourceRules}\n\n文本执行：{{INSTRUCTION}}。请严格按来源公开交付物制作，并采用上游已确认的计划。`,
  };
  return {
    videoPlanSystem: planSystem,
    videoPlanPrompt: planPrompt,
    videoPrompt: `${sourceRules}\n\n视频执行：{{INSTRUCTION}}。请严格按来源公开交付物制作，并采用上游已确认的计划；来源未声明的主体、剧情、文字和风格不可擅自新增。目标时长 {{DURATION_SEC}} 秒，画幅 {{ASPECT_RATIO}}。`,
  };
}

function importedSkillMarkdown(skill) {
  const definition = skill.source?.definition || {};
  if (skill.source?.provider === '即梦AI' && skill.source?.rawInstruction) {
    return `---\nname: ${skill.id}\ndescription: ${String(skill.description || 'Imported Jimeng Skill').replace(/\r?\n/g, ' ')}\nmetadata:\n  short-description: Imported from Jimeng\n---\n\n# ${skill.name}\n\n${skill.source.rawInstruction}\n\n来源：${skill.source?.url || ''}\n`;
  }
  return `---\nname: ${skill.id}\ndescription: ${String(skill.description || 'Imported Liblib Skill').replace(/\r?\n/g, ' ')}\nmetadata:\n  short-description: Imported from LiblibTV\n---\n\n# ${skill.name}\n\nThis project-local Skill was imported from LiblibTV. Its execution plan must preserve the source's publicly available input and output contract; it must not invent unexposed private prompts or canvas logic.\n\n## Public source contract\n\n- Input: ${definition.inputType || skill.source?.inputType || 'Not published'}\n- Outputs: ${definition.outputContent || skill.source?.outputContent || 'Not published'}\n- Use scenario: ${definition.useScenario || skill.usage || 'Not published'}\n- Source version: ${definition.sourceVersion || skill.sourceVersion || 'Not published'}\n\nSource: ${skill.source?.url || ''}\n`;
}

function jimengShowcaseExamples(remote) {
  return (Array.isArray(remote?.showcaseMedia) ? remote.showcaseMedia : [])
    .map((item, index) => {
      const url = String(item?.showcaseUrl || '').trim();
      const type = String(item?.type || '').toLowerCase();
      return url && (type === 'image' || type === 'video') ? { type, url, label: `案例 ${index + 1}` } : null;
    })
    .filter(Boolean);
}

export function normalizeImportedJimengSkill(remote, shareUrl, existing) {
  const skillId = String(remote?.skillId || remote?.id || '').trim();
  const instruction = String(remote?.instruction || '');
  if (!skillId || !instruction) throw importError('jimeng_skill_invalid', '即梦返回的数据中没有完整的 Skill instruction。', 422);
  const tags = String(remote?.tag || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const id = existing?.id || `jimeng-skill-${skillId}`;
  const name = String(remote?.skillName || remote?.name || `即梦 Skill ${skillId}`).trim();
  const description = String(remote?.description || '').trim();
  const promptSuffix = '\n\n【用户当前需求】\n{{INSTRUCTION}}';
  const definition = {
    name,
    description,
    instruction,
    tags,
    sourceId: skillId,
    sourceVersion: remote?.updateTime ? new Date(Number(remote.updateTime)).toISOString() : '',
  };
  return {
    id,
    version: Number(existing?.version || 1),
    sourceVersion: String(remote?.updateTime || '1'),
    name: name.slice(0, 80),
    category: tags[0] || '即梦AI Skill',
    kind: '文本',
    cover: String(remote?.showcaseMedia?.find((item) => item?.type === 'image')?.showcaseUrl || ''),
    author: String(remote?.effectiveUser?.name || '即梦AI'),
    description: description.slice(0, 4000),
    cardSummary: description.slice(0, 160) || '按即梦AI原始 instruction 执行',
    usage: description,
    howToUse: '在 Agent 中选择该 Skill，提供创作需求；执行时以保存的原始 instruction 为唯一规则源。',
    tags: [...new Set([...tags, '即梦AI'])].slice(0, 8),
    source: {
      provider: '即梦AI',
      skillId,
      url: shareUrl,
      importedAt: new Date().toISOString(),
      importerVersion: 1,
      rawInstruction: instruction,
      raw: remote,
      definition,
    },
    inputs: [
      { id: 'instruction', label: '创作需求', type: 'text', required: false, placeholder: '按来源 Skill instruction 提供创作需求' },
      { id: 'referenceAsset', label: '参考素材', type: 'asset', required: false, accept: ['image', 'video', 'audio'] },
    ],
    outputs: ['来源 Skill instruction 定义的全部产物'],
    fixedSteps: ['完整读取并遵守来源 Skill instruction', '按来源 instruction 的阶段和工具顺序执行', '对照来源 instruction 的硬约束验收'],
    rules: { instruction, source: '即梦AI', sourceId: skillId, disclosure: '执行规则完整保留自来源 Skill instruction。' },
    promptTemplates: {
      videoPlanSystem: instruction,
      videoPlanPrompt: `${instruction}${promptSuffix}`,
      videoPrompt: `${instruction}${promptSuffix}`,
      imagePrompt: `${instruction}${promptSuffix}`,
    },
    examples: jimengShowcaseExamples(remote),
    execution: { workflow: 'generic-plan', adapter: 'single-plan', requiresExplicitSelection: true, autoRun: true, sourceFaithful: true },
  };
}

async function fetchJimengSkill(skillId, shareUrl) {
  const endpoint = 'https://jimeng.jianying.com/mweb/v1/creation_agent/v2/skill/market/list';
  const categories = ['drama', 'ecommerce', 'creative', 'social', 'others'];
  try {
    const responses = await Promise.all(categories.map(async (tag) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', origin: 'https://jimeng.jianying.com', referer: shareUrl },
        body: JSON.stringify({ source: 3, tag_list: [tag], is_active: true, is_test: false }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }));
    const skill = responses.flatMap((payload) => payload?.data?.skills || []).find((item) => String(item?.skill_id || '') === skillId);
    if (!skill) throw importError('jimeng_skill_not_found', '即梦技能不存在、未公开，或链接不是具体技能详情链接。', 404);
    return skill;
  } catch (error) {
    if (error?.code) throw error;
    throw importError('jimeng_fetch_failed', `无法读取即梦 Skill：${error.message}`, 502);
  }
}

export async function importJimengSkill(input) {
  const skillId = extractJimengSkillId(input);
  if (!skillId) throw importError('jimeng_skill_id_required', '请粘贴即梦具体技能的详情/分享链接；技能广场首页不包含单个 Skill 的规则。');
  const shareUrl = /^\d{8,32}$/.test(String(input || '').trim()) ? `https://jimeng.jianying.com/ai-tool/home?activeTab=skill&skill_id=${skillId}` : String(input).trim();
  const remote = await fetchJimengSkill(skillId, shareUrl);
  const existing = SKILLS.find((skill) => skill.source?.provider === '即梦AI' && skill.source?.skillId === skillId);
  const generated = normalizeImportedJimengSkill(remote, shareUrl, existing);
  const skill = existing ? { ...existing, ...generated, id: existing.id } : generated;
  const skillDir = join(SKILLS_DIR, skill.id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'skill.json'), `${JSON.stringify(skill, null, 2)}\n`, 'utf8');
  writeFileSync(join(skillDir, 'SKILL.md'), importedSkillMarkdown(skill), 'utf8');
  reloadSkills();
  return { skill: publicSkill(skillById(skill.id)), created: !existing, updated: Boolean(existing), sourceUrl: shareUrl };
}

export async function importSkill(input) {
  return isJimengInput(input) ? importJimengSkill(input) : importLiblibSkill(input);
}

export function normalizeImportedLiblibSkill(remote, snapshot, templateUuid, shareUrl, existing) {
  const kind = importedKind(remote);
  const duration = importedDuration(remote);
  const format = importedFormat(remote);
  const examples = importedExamples(remote, snapshot);
  const contract = importedSourceContract(remote, snapshot);
  const tags = (Array.isArray(remote?.tags) ? remote.tags.map((tag) => tag?.tagLabel || tag?.name || tag).filter(Boolean) : []);
  const description = safeText(contract.description || `${remote?.name || 'Liblib Skill'} 创作预设。`, 280);
  const inputHint = contract.inputType || (kind === '图片' ? '输入图片创作需求。' : kind === '音频' ? '输入音频创作需求。' : kind === '文本' ? '输入文本创作需求。' : '输入视频创作需求。');
  const id = existing?.id || `liblib-skill-${templateUuid.slice(0, 12)}`;
  const genericWorkflow = kind === '图片' ? 'generic-image' : kind === '音频' || kind === '文本' ? 'generic-plan' : 'generic-video';
  const fixedSteps = [
    contract.inputType ? `核对来源要求的输入：${contract.inputType}` : '核对用户创作描述与已附素材',
    '依据来源公开说明生成可编辑执行计划',
    ...contract.outputItems.map((item) => `制作并核对来源声明的交付物：${item}`),
    '仅在全部公开交付物完成后结束本次 Skill 运行',
  ];
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
    usage: contract.useScenario,
    howToUse: `在 Agent 中选择该 Skill，按来源要求提供“${contract.inputType || '创作描述'}”；先确认执行计划，再生成来源声明的交付物。`,
    tags: [...new Set([...tags, 'LiblibTV'])].slice(0, 8),
    source: { provider: 'LiblibTV', templateUuid, skillUuid: remote?.skillUuid || '', skillKey: remote?.skillKey || '', inputType: contract.inputType, outputContent: contract.outputContent, url: shareUrl, importedAt: new Date().toISOString(), importerVersion: 2, definition: contract },
    inputs: [
      { id: 'instruction', label: contract.inputType || '创作描述', type: 'text', required: false, placeholder: inputHint },
      { id: 'referenceAsset', label: '参考素材', type: 'asset', required: false, accept: kind === '图片' ? ['image'] : kind === '音频' ? ['audio', 'image', 'video'] : ['image', 'video'] },
      ...(duration.duration ? [{ id: 'durationSec', label: '目标时长', type: 'select', required: false, default: duration.duration, options: duration.options }] : []),
      ...(kind !== '文本' && format.default ? [{ id: 'aspectRatio', label: '画幅', type: 'select', required: false, default: format.default, options: format.options }] : []),
    ],
    outputs: contract.outputItems.length ? contract.outputItems : [String(remote?.outputContent || `${kind}生成结果`).trim()],
    fixedSteps: fixedSteps.slice(0, 12),
    rules: {
      inputContract: contract.inputType || '来源未公开具体输入字段',
      outputContract: contract.outputItems.length ? contract.outputItems : contract.outputContent || '来源未公开具体交付物',
      ...(contract.useScenario ? { useScenario: contract.useScenario } : {}),
      ...(contract.sourceVersion ? { sourceVersion: contract.sourceVersion } : {}),
      ...(format.default ? { format: format.format } : {}),
      ...(duration.duration ? { durationSec: duration.duration, durationOptions: duration.options } : {}),
      disclosure: '仅执行来源公开的输入、输出和说明；来源未公开的私有画布、提示词或参数不会被臆造。',
    },
    promptTemplates: importedPromptTemplates(kind, contract),
    examples,
    execution: { workflow: genericWorkflow, adapter: kind === '图片' ? 'single-image' : kind === '音频' || kind === '文本' ? 'single-plan' : 'single-video', requiresExplicitSelection: true, autoRun: true, generateKeyframes: false, generateShotVideos: kind === '视频', appendVideosToTimeline: kind === '视频', audioMode: 'full', sourceFaithful: true },
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
  if (!['图片', '视频', '音频', '文本'].includes(kind)) throw importError('unsupported_liblib_kind', '当前只支持文本、图片、视频和音频类型 Skill 导入。', 422);
  const snapshot = parseSnapshotData(remote.snapshotData);
  const existing = SKILLS.find((skill) => skill.source?.templateUuid === templateUuid);
  const generated = normalizeImportedLiblibSkill(remote, snapshot, templateUuid, shareUrl, existing);
  // Re-import is a repair/update operation. Keeping the prior generated fields
  // here made old generic prompts permanent even when Liblib data was refreshed.
  const skill = existing ? { ...existing, ...generated, id: existing.id } : generated;
  const skillDir = join(SKILLS_DIR, skill.id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'skill.json'), `${JSON.stringify(skill, null, 2)}\n`, 'utf8');
  const skillReadme = join(skillDir, 'SKILL.md');
  writeFileSync(skillReadme, importedSkillMarkdown(skill), 'utf8');
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

function stepIdForStage(workflowStage) {
  const value = String(workflowStage || '');
  if (value === 'creative-anchor' || value === 'vfx-plan' || value === 'image-plan') return 'anchor';
  if (value === 'storyboard') return 'storyboard';
  if (value === 'skill-keyframe' || value === 'skill-image') return 'keyframes';
  if (value === 'skill-video') return 'videos';
  if (value === 'voiceover-plan' || value === 'music-plan') return 'audio';
  return '';
}

function makeTextNode({ id, title, preset, prompt, system, position, skillId, workflowStage, extra = {} }) {
  const stepId = stepIdForStage(workflowStage);
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
      ...(stepId ? { stepId } : {}),
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
      stepId: 'keyframes',
      shotId: shot,
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
      stepId: 'videos',
      shotId: shot,
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
  const creativeInstruction = safeText(instruction, 4000) || '请先生成可编辑的创作计划，缺失的信息由用户在计划中补充。';
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
      stepId: 'videos',
      shotId: 'S1',
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
    nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: reference, skillId: skill.id, workflowStage: 'reference-material', stepId: 'anchor' } });
    addEdge(assetId, videoId, referenceAsset === 'image' ? 'first-frame' : 'reference-video');
  }
  // The approved plan is part of the final provider prompt, so edits to the
  // planning node are not silently discarded before media generation.
  addEdge(planId, videoId, 'script');

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
  const creativeInstruction = safeText(instruction, 4000) || '请先生成可编辑的创作计划，缺失的信息由用户在计划中补充。';
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
      stepId: 'keyframes',
      shotId: 'S1',
      storyboardShot: 'S1',
      storyboardShotIndex: 0,
      storyboardStatus: 'approved',
      layoutWidth: 500,
    },
  });
  if (reference) {
    const assetId = `skill-image-asset-${randomUUID()}`;
    nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: reference, skillId: skill.id, workflowStage: 'reference-material', stepId: 'anchor' } });
    edges.push({ id: `e-${randomUUID()}`, source: assetId, target: imageId, role: 'reference-image' });
  }
  edges.push({ id: `e-${randomUUID()}`, source: planId, target: imageId, role: 'script' });
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

function buildPlanOnlyWorkflow({ skill, existingWorkflow, instruction, durationSec, aspectRatio }) {
  const creativeInstruction = safeText(instruction, 4000) || '请先生成可编辑的创作计划，缺失的信息由用户在计划中补充。';
  const ratio = String(aspectRatio || skill.inputs?.find((input) => input.id === 'aspectRatio')?.default || '16:9');
  const requestedDuration = Math.max(1, Number(durationSec || skill.rules?.durationSec || 15));
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = { INSTRUCTION: creativeInstruction, DURATION_SEC: requestedDuration, ASPECT_RATIO: ratio };
  const planId = `skill-plan-${randomUUID()}`;
  const nodes = [makeTextNode({
    id: planId,
    title: `${skill.name} · 制作方案`,
    preset: 'rewrite',
    prompt: replaceTokens(skill.promptTemplates.videoPlanPrompt || skill.promptTemplates.voiceoverPrompt || '{{INSTRUCTION}}', tokens),
    system: skill.promptTemplates.videoPlanSystem || skill.promptTemplates.voiceoverSystem || '你是创意制作导演，输出可执行方案。',
    position: { x: base.x, y: base.y },
    skillId: skill.id,
    workflowStage: 'vfx-plan',
  })];
  const currentNodes = Array.isArray(existingWorkflow?.nodes) ? existingWorkflow.nodes : [];
  const currentEdges = Array.isArray(existingWorkflow?.edges) ? existingWorkflow.edges : [];
  return {
    skillId: skill.id,
    skillVersion: skill.version,
    mode: 'production',
    nodes: [...currentNodes, ...nodes],
    edges: [...currentEdges],
    createdNodeIds: nodes.map((node) => node.id),
    videoNodeIds: [],
    audioPlanNodeIds: [planId],
    input: { instruction: creativeInstruction, durationSec: requestedDuration, aspectRatio: ratio },
  };
}

function sourceOutputType(output, fallbackKind) {
  const value = String(output || '');
  if (/成片|视频|短片|动画/.test(value)) return 'video';
  if (/三视图|静帧|场景图|画面|图像|图片|海报|封面/.test(value)) return 'image';
  if (/旁白|配音|BGM|音乐|音效/.test(value)) return 'audio-plan';
  if (/脚本|分镜|文案|方案|描述|提示词/.test(value)) return 'text-plan';
  return fallbackKind === '图片' ? 'image' : fallbackKind === '视频' ? 'video' : 'text-plan';
}

function buildSourceFaithfulWorkflow({ skill, existingWorkflow, referenceAssetId, referenceKind, instruction, durationSec, aspectRatio }) {
  const creativeInstruction = safeText(instruction, 4000) || '请先生成可编辑的创作计划，缺失的信息由用户在计划中补充。';
  const reference = safeText(referenceAssetId, 160);
  const ratio = String(aspectRatio || skill.inputs?.find((input) => input.id === 'aspectRatio')?.default || '16:9');
  const requestedDuration = Math.max(1, Number(durationSec || skill.rules?.durationSec || 15));
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = { INSTRUCTION: creativeInstruction, DURATION_SEC: requestedDuration, ASPECT_RATIO: ratio };
  const outputs = Array.isArray(skill.source?.definition?.outputItems) && skill.source.definition.outputItems.length
    ? skill.source.definition.outputItems
    : splitSourceOutputs(skill.source?.outputContent || skill.outputs?.join('、'));
  const nodes = [];
  const edges = [];
  const addEdge = (source, target, role) => edges.push({ id: `e-${randomUUID()}`, source, target, ...(role ? { role } : {}) });
  const planId = `skill-source-plan-${randomUUID()}`;
  nodes.push(makeTextNode({
    id: planId,
    title: `${skill.name} · 来源执行计划`,
    preset: 'video_script',
    prompt: replaceTokens(skill.promptTemplates.videoPlanPrompt, tokens),
    system: skill.promptTemplates.videoPlanSystem,
    position: { x: base.x, y: base.y },
    skillId: skill.id,
    workflowStage: 'vfx-plan',
    extra: { skillGate: 'source-plan', sourceContract: skill.source?.definition || {} },
  }));

  let imageIndex = 0;
  let videoIndex = 0;
  let textIndex = 0;
  let audioIndex = 0;
  let lastImageId = '';
  const videoNodeIds = [];
  const audioPlanNodeIds = [];
  const refAssetId = reference ? `skill-source-asset-${randomUUID()}` : '';
  if (refAssetId) {
    nodes.push({ id: refAssetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: reference, skillId: skill.id, workflowStage: 'reference-material', stepId: 'anchor' } });
  }

  for (const output of outputs.length ? outputs : [`${skill.kind}生成结果`]) {
    const outputType = sourceOutputType(output, skill.kind);
    const outputPrompt = `${replaceTokens(skill.promptTemplates.videoPlanPrompt, tokens)}\n\n本节点只交付来源声明的内容：${output}。`;
    if (outputType === 'text-plan' || outputType === 'audio-plan') {
      const isAudio = outputType === 'audio-plan';
      const nodeId = `skill-source-${isAudio ? 'audio' : 'text'}-${randomUUID()}`;
      nodes.push(makeTextNode({
        id: nodeId,
        title: `${skill.name} · ${output}`,
        preset: 'rewrite',
        prompt: outputPrompt,
        system: skill.promptTemplates.videoPlanSystem,
        position: { x: base.x + 540, y: base.y + (isAudio ? 360 + audioIndex++ * 260 : textIndex++ * 260) },
        skillId: skill.id,
        workflowStage: isAudio ? 'music-plan' : 'vfx-plan',
        extra: isAudio ? { audioStatus: 'plan-ready' } : {},
      }));
      addEdge(planId, nodeId, 'script');
      if (isAudio) audioPlanNodeIds.push(nodeId);
      continue;
    }
    if (outputType === 'image') {
      const nodeId = `skill-source-image-${randomUUID()}`;
      nodes.push({
        id: nodeId,
        type: 'imageGen',
        position: { x: base.x + 540, y: base.y + 360 + imageIndex++ * 420 },
        data: {
          title: `${skill.name} · ${output}`,
          modelKey: '',
          prompt: `${replaceTokens(skill.promptTemplates.imagePrompt || skill.promptTemplates.videoPrompt, tokens)}\n\n本节点只交付来源声明的内容：${output}。`,
          status: 'idle', progress: 0,
          params: { aspectRatio: ratio, quality: '1K', variants: 1 },
          expanded: false,
          actionId: reference && referenceKind === 'image' ? 'image.edit' : 'image.generate',
          skillId: skill.id, workflowStage: 'skill-image', stepId: 'keyframes', shotId: `O${imageIndex}`, storyboardShot: `O${imageIndex}`, storyboardStatus: 'approved', layoutWidth: 500,
        },
      });
      addEdge(planId, nodeId, 'script');
      if (refAssetId && referenceKind === 'image') addEdge(refAssetId, nodeId, 'reference-image');
      lastImageId = nodeId;
      continue;
    }
    const nodeId = `skill-source-video-${randomUUID()}`;
    const capability = lastImageId || referenceKind === 'image' ? 'video.image_to_video' : referenceKind === 'video' ? 'video.reference' : 'video.generate';
    nodes.push({
      id: nodeId,
      type: 'videoGen',
      position: { x: base.x + 1080, y: base.y + 360 + videoIndex * 420 },
      data: {
        title: `${skill.name} · ${output}`,
        modelKey: '',
        prompt: `${replaceTokens(skill.promptTemplates.videoPrompt, tokens)}\n\n本节点只交付来源声明的内容：${output}。`,
        status: 'idle', progress: 0,
        params: { duration: requestedDuration, aspectRatio: ratio, resolution: '720p', audioMode: skill.execution?.audioMode || 'full' },
        expanded: false, forcedCapability: capability, actionId: capability,
        skillId: skill.id, workflowStage: 'skill-video', stepId: 'videos', shotId: `O${++videoIndex}`, storyboardShot: `O${videoIndex}`, storyboardDurationSec: requestedDuration, storyboardStatus: 'approved', layoutWidth: 500,
      },
    });
    addEdge(planId, nodeId, 'script');
    if (lastImageId) addEdge(lastImageId, nodeId, 'first-frame');
    else if (refAssetId) addEdge(refAssetId, nodeId, referenceKind === 'image' ? 'first-frame' : 'reference-video');
    videoNodeIds.push(nodeId);
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
    videoNodeIds,
    audioPlanNodeIds,
    input: { referenceAssetId: reference, instruction: creativeInstruction, durationSec: requestedDuration, aspectRatio: ratio },
  };
}

export function buildSkillWorkflow({ skill, existingWorkflow, productAssetId, sellingPoints, brandName, durationSec, aspectRatio, referenceAssetId, referenceKind, instruction }) {
  if (!skill) throw Object.assign(new Error('skill_not_found'), { status: 404 });
  if (skill.execution?.sourceFaithful) {
    return buildSourceFaithfulWorkflow({ skill, existingWorkflow, referenceAssetId, referenceKind, instruction: instruction || sellingPoints, durationSec, aspectRatio });
  }
  if (skill.execution?.adapter === 'single-plan' || skill.execution?.workflow === 'generic-plan') {
    return buildPlanOnlyWorkflow({ skill, existingWorkflow, instruction: instruction || sellingPoints, durationSec, aspectRatio });
  }
  if (skill.execution?.workflow === 'cinematic-vfx' || skill.execution?.workflow === 'generic-video') {
    return buildCinematicVfxWorkflow({ skill, existingWorkflow, referenceAssetId, referenceKind, instruction: instruction || sellingPoints, durationSec, aspectRatio });
  }
  if (skill.execution?.workflow === 'generic-image') {
    return buildGenericImageWorkflow({ skill, existingWorkflow, referenceAssetId, instruction: instruction || sellingPoints, aspectRatio });
  }
  const product = safeText(productAssetId, 160);
  const points = safeText(sellingPoints, 2000);
  const planningPoints = points || '产品卖点待用户在创意锚点与分镜中补充。';
  const ratio = String(aspectRatio || skill.inputs.find((input) => input.id === 'aspectRatio')?.default || '16:9');
  const duration = Number(durationSec || skill.rules.durationSec || 15);
  const brand = safeText(brandName, 120) || '品牌产品';
  const base = positionForExistingWorkflow(existingWorkflow);
  const tokens = {
    BRAND: brand,
    SELLING_POINTS: planningPoints,
    DURATION_SEC: duration,
    ASPECT_RATIO: ratio,
    PRODUCT_BINDING: '产品图片已作为主体参考绑定到每个关键帧节点',
  };
  const nodes = [];
  const edges = [];
  const addEdge = (source, target, role) => edges.push({ id: `e-${randomUUID()}`, source, target, ...(role ? { role } : {}) });

  const assetId = product ? `skill-asset-${randomUUID()}` : '';
  if (assetId) nodes.push({ id: assetId, type: 'asset', position: { x: base.x - 570, y: base.y }, data: { assetId: product, skillId: skill.id, workflowStage: 'product-reference', stepId: 'anchor' } });

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
    extra: {
      skillGate: 'storyboard',
      requiresApproval: true,
      skillRules: skill.rules || {},
      skillProductAssetId: product,
      skillProductAssetNodeId: assetId,
      aspectRatio: ratio,
    },
  }));
  addEdge(anchorId, storyboardId, 'script');

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
    // Media nodes are compiled from the approved storyboard, never from static templates.
    videoNodeIds: [],
    audioPlanNodeIds: [voiceId, musicId],
    input: { productAssetId: product, sellingPoints: points, brandName: brand, durationSec: duration, aspectRatio: ratio },
  };
}
