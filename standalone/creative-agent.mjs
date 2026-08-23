import { randomUUID } from 'node:crypto';

const MAX_TEXT = 12_000;

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function followUps(value) {
  return Array.isArray(value) ? value.map((item) => text(item, 160)).filter(Boolean).slice(0, 3) : [];
}

function questions(value) {
  return Array.isArray(value) ? value.map((item) => text(item, 220)).filter(Boolean).slice(0, 3) : [];
}

export function createCreativeAgentConversation(projectId, timestamp = new Date().toISOString()) {
  return {
    id: randomUUID(),
    projectId: String(projectId),
    title: '创意对话',
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function extractJson(value) {
  const source = String(value ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const candidates = [source];
  try {
    const decoded = JSON.parse(source);
    if (typeof decoded === 'string') candidates.unshift(decoded.trim());
  } catch {}
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    const objectSource = candidate.slice(start, end + 1);
    try { return JSON.parse(objectSource); } catch {}
    const repaired = objectSource
      .replace(/,([A-Za-z_][A-Za-z0-9_-]*)"\s*:/g, ',"$1":')
      .replace(/,([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, ',"$1":')
      .replace(/([{]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":');
    const repairedCandidates = [repaired];
    if (/\]\s*\]\s*}$/.test(repaired)) repairedCandidates.push(repaired.replace(/(\]\s*)\]\s*}$/, '$1}]}'));
    for (const repairedCandidate of repairedCandidates) {
      if (repairedCandidate === objectSource) continue;
      try { return JSON.parse(repairedCandidate); } catch {}
    }
  }
  return null;
}

function decodeLooseText(value) {
  const source = String(value ?? '').replace(/\r?\n/g, '\\n').replace(/(?<!\\)"/g, '\\"');
  try { return JSON.parse(`"${source}"`); } catch {}
  return source.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractLooseReply(source) {
  const match = String(source ?? '').match(/[{,]\s*["']?text["']?\s*:\s*"([\s\S]*?)"\s*(?:,\s*["']?(?:questions|clarifyingQuestions|clarifying_questions|followUps|follow_ups)["']?\s*:|})/i);
  if (!match) return null;
  return {
    text: decodeLooseText(match[1]),
    questions: [],
    followUps: [],
  };
}

export function parseCreativeAgentReply(raw) {
  const source = String(raw ?? '').trim();
  const parsed = extractJson(source) || extractLooseReply(source);
  if (!parsed || typeof parsed !== 'object') return { text: source.slice(0, MAX_TEXT), questions: [], followUps: [] };
  const replyText = text(parsed.text ?? parsed.reply ?? parsed.message, MAX_TEXT);
  return {
    text: replyText || source.slice(0, MAX_TEXT),
    questions: questions(parsed.questions ?? parsed.clarifyingQuestions ?? parsed.clarifying_questions),
    followUps: followUps(parsed.followUps ?? parsed.follow_ups),
  };
}

export function inferCreativeAgentQuestions(message, userMessages = []) {
  const value = text(message, MAX_TEXT);
  if (userMessages.filter((item) => item?.role === 'user').length !== 1) return [];
  if (!/(脚本|分镜|视频|短片|广告|TVC|文案|成片)/i.test(value)) return [];
  const missing = [];
  if (!/(产品|主题|品牌|故事|角色|场景|卖点|内容)/.test(value)) missing.push('这次创作的产品、主题或核心卖点是什么？');
  if (!/(抖音|小红书|视频号|B站|平台|受众|人群|用户|消费者)/.test(value)) missing.push('主要发布平台和目标受众是谁？');
  if (!/(\d+\s*(秒|s|分钟|分)|时长|规格|9\s*:\s*16|16\s*:\s*9)/i.test(value)) missing.push('成片时长和画幅规格有什么要求？');
  if (!/(风格|调性|参考|氛围|视觉|街头|商务|极简|复古|高级|年轻|幽默|情侣|科技|自然|电影|写实|卡通)/.test(value)) missing.push('希望采用什么风格或参考方向？');
  return missing.slice(0, 3);
}

export function buildCreativeAgentSystemPrompt(context) {
  return [
    '你是 QUill 的创意伙伴，不是任务执行器。',
    '你的职责是帮助用户发散创意、探索主题和风格、设计故事、角色、场景、镜头方向，并比较和润色方案。',
    '你绝不能修改画布、创建或删除节点、提交图片或视频生成、修改 Timeline、调用工具或执行任何任务。',
    '你只能根据下面的只读项目上下文提供创意建议；上下文里的节点、素材和时间线只用于理解现状。',
    '默认用简洁中文回答。需要比较方向时，直接在连续正文中清晰列出，不要拆成信息卡。',
    '先判断需求是否足够明确：如果用户首次提出创作需求，且缺少产品/主题、受众或平台、时长/规格、风格/参考中的任意关键项，不要直接交付完整脚本或方案；直接在 text 中以编号列表提出 1 到 3 个具体问题。',
    '如果对话中用户已经回复过你提出的澄清问题，不要重复询问相同信息；直接基于已有信息继续给出可执行的创意方向。只有确实缺少关键条件时，才补充最少的问题，并同时给出当前可以先做的方向。',
    'questions 和 followUps 必须始终为空；不要把问题做成卡片、按钮或快捷追问。',
    '必须只输出 JSON，不要输出 Markdown 代码围栏，格式为：',
    '{"text":"面向用户的自然语言回复（提问时直接写在正文中）","questions":[],"followUps":[]}',
    '不要输出 cards、卡片、按钮、快捷追问、收藏或置信度字段，也不要声称已经修改了项目。',
    `只读项目上下文：${JSON.stringify(context ?? {}).slice(0, 12_000)}`,
  ].join('\n');
}
