import { randomUUID } from 'node:crypto';

export const CREATIVE_AGENT_CARD_TYPES = new Set([
  'idea',
  'direction',
  'scene',
  'character',
  'style',
  'follow-up',
]);

const MAX_TEXT = 12_000;
const MAX_CARD_TEXT = 2_000;

function text(value, max = MAX_CARD_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item, 120)).filter(Boolean).slice(0, 12) : [];
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

export function normalizeCreativeAgentCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = text(raw.type, 32);
  const title = text(raw.title, 160);
  const summary = text(raw.summary, MAX_CARD_TEXT);
  if (!CREATIVE_AGENT_CARD_TYPES.has(type) || !title || !summary) return null;
  return {
    id: text(raw.id, 80) || randomUUID(),
    type,
    title,
    summary,
    body: text(raw.body, MAX_CARD_TEXT),
    bullets: list(raw.bullets),
    tags: list(raw.tags),
    favorite: raw.favorite === true,
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

export function parseCreativeAgentReply(raw) {
  const source = String(raw ?? '').trim();
  const parsed = extractJson(source);
  if (!parsed || typeof parsed !== 'object') return { text: source.slice(0, MAX_TEXT), cards: [] };
  const replyText = text(parsed.text ?? parsed.reply ?? parsed.message, MAX_TEXT);
  const cards = Array.isArray(parsed.cards) ? parsed.cards.map(normalizeCreativeAgentCard).filter(Boolean).slice(0, 8) : [];
  return { text: replyText || source.slice(0, MAX_TEXT), cards };
}

export function buildCreativeAgentSystemPrompt(context) {
  return [
    '你是 libtv Studio 的创意伙伴，不是任务执行器。',
    '你的职责是帮助用户发散创意、探索主题和风格、设计故事、角色、场景、镜头方向，并比较和润色方案。',
    '你绝不能修改画布、创建或删除节点、提交图片或视频生成、修改 Timeline、调用工具或执行任何任务。',
    '你只能根据下面的只读项目上下文提供创意建议；上下文里的节点、素材和时间线只用于理解现状。',
    '默认用简洁中文回答。除非用户明确要求，否则给出 2 到 4 个可比较的方向，而不是泛泛而谈。',
    '必须只输出 JSON，不要输出 Markdown 代码围栏，格式为：',
    '{"text":"面向用户的自然语言回复","cards":[{"type":"idea|direction|scene|character|style|follow-up","title":"卡片标题","summary":"一句摘要","body":"可选的详细内容","bullets":["可选要点"],"tags":["可选标签"]}]}',
    '卡片只用于展示、复制和收藏，不要在内容中声称已经修改了项目。',
    `只读项目上下文：${JSON.stringify(context ?? {}).slice(0, 18_000)}`,
  ].join('\n');
}
