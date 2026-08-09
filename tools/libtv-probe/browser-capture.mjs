import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeDom, diffDom, inferSchema, parseMaybeJson } from './core.mjs';

export const NETWORK_METHODS = [
  'Network.requestWillBeSent',
  'Network.responseReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
];

const SEMANTIC_DOM_EXPRESSION = `(() => {
  const selector = 'button,input,textarea,select,a,form,[role],[aria-label],[aria-selected],[aria-disabled],[aria-busy],[aria-checked],[aria-expanded]';
  const elements = [];
  for (const el of document.querySelectorAll(selector)) {
    if (elements.length >= 1000) break;
    if (!el.getClientRects().length) continue;
    elements.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      label: el.getAttribute('aria-label') || el.labels?.[0]?.innerText?.trim() || '',
      text: ['INPUT', 'TEXTAREA'].includes(el.tagName) ? '' : (el.innerText || '').trim().slice(0, 300),
      disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
      selected: el.matches('[aria-selected="true"],[aria-pressed="true"]'),
      checked: el.getAttribute('aria-checked'),
      expanded: el.getAttribute('aria-expanded'),
      loading: el.getAttribute('aria-busy') === 'true' || /loading|spinner|progress/i.test(el.className || ''),
      visible: true
    });
  }
  return {
    url: location.href,
    title: document.title,
    elements,
    truncated: elements.length >= 1000
  };
})()`;

function redactSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.strings)) return snapshot;
  return {
    ...snapshot,
    strings: snapshot.strings.map((value) => /authorization|bearer|cookie|password|secret|api[-_ ]?key|token/i.test(value) ? '[REDACTED]' : value),
  };
}

function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const key of url.searchParams.keys()) {
      if (/auth|code|credential|key|password|secret|session|signature|token/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
  ]).finally(() => clearTimeout(timeout));
}

async function semanticSnapshot(tab) {
  return await tab.playwright.evaluate(SEMANTIC_DOM_EXPRESSION, undefined, { timeoutMs: 10_000 }) ?? { elements: [] };
}

export async function capturePage({ tab, cdp, includeRawDom = false }) {
  const [url, semantic] = await Promise.all([tab.url(), semanticSnapshot(tab)]);
  let raw = { captured: false, reason: 'Semantic DOM is the default snapshot; full CDP DOMSnapshot is opt-in for targeted verification.' };
  if (includeRawDom && cdp) {
    try {
      raw = redactSnapshot(await withTimeout(cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: [], includeDOMRects: false, includePaintOrder: false }), 15_000, 'DOMSnapshot.captureSnapshot'));
    } catch (error) {
      raw = { captured: false, reason: error.message };
    }
  }
  const timestamp = new Date().toISOString();
  const safeUrl = sanitizeUrl(url);
  return {
    url: safeUrl,
    timestamp,
    semantic: analyzeDom({ ...semantic, timestamp, url: safeUrl }),
    dom_snapshot: raw,
    storage: {
      captured: false,
      reason: 'Browser storage, cookies, credentials, and session stores are intentionally not inspected.',
    },
  };
}

async function readEvents(cdp, afterSequence) {
  const events = [];
  let cursor = afterSequence;
  do {
    const page = await cdp.readEvents({ afterSequence: cursor, methods: NETWORK_METHODS, limit: 1000, timeoutMs: 100 });
    events.push(...(page.events ?? []));
    cursor = page.cursor;
    if (!page.hasMore) return { cursor, events, truncated: page.truncated };
  } while (true);
}

function requestSchema(request) {
  const parsed = parseMaybeJson(request?.postData);
  return parsed === undefined ? undefined : inferSchema(parsed);
}

export async function sanitizeNetworkEvents(cdp, events) {
  const requests = new Map();
  for (const event of events) {
    const params = event.params ?? {};
    if (event.method === 'Network.requestWillBeSent') {
      requests.set(params.requestId, {
        request_id: params.requestId,
        method: params.request?.method,
        url: sanitizeUrl(params.request?.url),
        started_at: params.wallTime ? new Date(params.wallTime * 1000).toISOString() : new Date().toISOString(),
        request_mime: params.request?.headers?.['Content-Type'] ?? params.request?.headers?.['content-type'],
        request_schema: requestSchema(params.request),
      });
    }
    if (event.method === 'Network.responseReceived') {
      const record = requests.get(params.requestId) ?? { request_id: params.requestId, method: 'GET', url: sanitizeUrl(params.response?.url) };
      record.status = params.response?.status;
      record.response_mime = params.response?.mimeType;
      if (/json/i.test(record.response_mime ?? '')) {
        try {
          const body = await withTimeout(cdp.send('Network.getResponseBody', { requestId: params.requestId }), 5_000, 'Network.getResponseBody');
          const parsed = parseMaybeJson(body?.body);
          if (parsed !== undefined) record.response_schema = inferSchema(parsed);
        } catch {
          record.response_schema_unavailable = true;
        }
      }
      requests.set(params.requestId, record);
    }
    if (event.method === 'Network.loadingFailed') {
      const record = requests.get(params.requestId) ?? { request_id: params.requestId };
      record.failed = true;
      record.error_text = params.errorText;
      record.cancelled = Boolean(params.canceled);
      requests.set(params.requestId, record);
    }
  }
  return [...requests.values()].filter((record) => record.url).map(({ request_id, ...record }) => record);
}

async function savePage(dir, page, screenshot) {
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, 'page.json'), `${JSON.stringify(page, null, 2)}\n`),
    writeFile(join(dir, 'screenshot.png'), screenshot),
  ]);
}

export async function startAction({ tab, cdp, outputDir, actionId, name, trigger, inputs = {}, category, priority, includeRawDom = false }) {
  let networkCapture;
  try {
    await withTimeout(cdp.send('Network.enable'), 10_000, 'Network.enable');
    const baseline = await cdp.readEvents({ methods: NETWORK_METHODS, limit: 1, timeoutMs: 0 });
    networkCapture = { enabled: true, cursor: baseline.cursor };
  } catch (error) {
    networkCapture = { enabled: false, reason: error.message };
  }
  const actionDir = join(outputDir, actionId);
  const [before, screenshot] = await Promise.all([capturePage({ tab, cdp, includeRawDom }), tab.screenshot({ fullPage: false })]);
  await savePage(join(actionDir, 'before'), before, screenshot);
  return { tab, cdp, actionDir, actionId, name, trigger, inputs, category, priority, before, includeRawDom, networkCapture };
}

export async function finishAction(context, { outputs = {}, persistence = 'not yet verified', knownEdgeCases = [] } = {}) {
  const { tab, cdp, actionDir } = context;
  const [after, screenshot, eventPage] = await Promise.all([
    capturePage({ tab, cdp, includeRawDom: context.includeRawDom }),
    tab.screenshot({ fullPage: false }),
    context.networkCapture.enabled
      ? readEvents(cdp, context.networkCapture.cursor)
      : { events: [], truncated: false, reason: context.networkCapture.reason },
  ]);
  const network = await sanitizeNetworkEvents(cdp, eventPage.events);
  const domDiff = diffDom(context.before.semantic, after.semantic);
  const visibleStateTransition = { before: domDiff.before_states, after: domDiff.after_states };
  const action = {
    action_id: context.actionId,
    name: context.name,
    category: context.category,
    priority: context.priority,
    trigger: context.trigger,
    inputs: context.inputs,
    outputs,
    persistence,
    known_edge_cases: knownEdgeCases,
    timestamp: after.timestamp,
    url: after.url,
    visible_state_transition: visibleStateTransition,
    evidence: [
      `before/page.json`,
      `after/page.json`,
      `diff/dom.json`,
      `network/requests.json`,
      `before/screenshot.png`,
      `after/screenshot.png`,
    ],
  };
  await Promise.all([
    savePage(join(actionDir, 'after'), after, screenshot),
    mkdir(join(actionDir, 'diff'), { recursive: true }),
    mkdir(join(actionDir, 'network'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(actionDir, 'action.json'), `${JSON.stringify(action, null, 2)}\n`),
    writeFile(join(actionDir, 'diff', 'dom.json'), `${JSON.stringify(domDiff, null, 2)}\n`),
    writeFile(join(actionDir, 'diff', 'storage.json'), `${JSON.stringify({ captured: false, reason: context.before.storage.reason }, null, 2)}\n`),
    writeFile(join(actionDir, 'network', 'requests.json'), `${JSON.stringify(network, null, 2)}\n`),
    writeFile(join(actionDir, 'network', 'events-meta.json'), `${JSON.stringify({ enabled: context.networkCapture.enabled, reason: eventPage.reason, cursor: eventPage.cursor, truncated: eventPage.truncated, count: eventPage.events.length }, null, 2)}\n`),
  ]);
  return { action, before: context.before, after, domDiff, network };
}
