import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const ID_PARENTS = new Set(['assets', 'canvas', 'canvases', 'generations', 'jobs', 'projects', 'spaces', 'tasks', 'users', 'workflows']);
const STATE_WORDS = {
  cancelled: /cancel(?:led)?|取消|已取消/i,
  error: /error|failed|失败|出错/i,
  loading: /loading|载入|加载/i,
  processing: /processing|generating|生成中|处理中/i,
  queued: /queued|排队/i,
  retry: /retry|重试/i,
  success: /success|succeeded|完成|成功/i,
};

export function stableId(prefix, value) {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 10)}`;
}

export function normalizeEndpoint(rawUrl) {
  const url = new URL(rawUrl, 'https://local.invalid');
  const parts = url.pathname.split('/').filter(Boolean);
  const normalized = parts.map((part, index) => {
    const previous = parts[index - 1]?.toLowerCase();
    if (/^\d+$/.test(part) || /^[0-9a-f]{16,}$/i.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part)) return ':id';
    if (ID_PARENTS.has(previous) && !/^(batch|cancel|create|history|list|metadata|models|retry|search|status|upload)$/i.test(part)) return ':id';
    return part;
  });
  return `/${normalized.join('/')}` || '/';
}

export function inferSchema(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.reduce((schema, item) => mergeSchemas(schema, inferSchema(item)), null) ?? {} };
  if (typeof value === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(Object.keys(value).sort().map((key) => [key, inferSchema(value[key])])),
    };
  }
  if (typeof value === 'string') {
    const format = /^https?:\/\//.test(value) ? 'uri' : /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? 'uuid' : /^\d{4}-\d\d-\d\dT/.test(value) ? 'date-time' : undefined;
    return format ? { type: 'string', format } : { type: 'string' };
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: typeof value };
}

export function mergeSchemas(left, right) {
  if (!left) return right;
  if (!right || JSON.stringify(left) === JSON.stringify(right)) return left;
  if (left.type === 'object' && right.type === 'object') {
    const keys = new Set([...Object.keys(left.properties ?? {}), ...Object.keys(right.properties ?? {})]);
    return { type: 'object', properties: Object.fromEntries([...keys].sort().map((key) => [key, mergeSchemas(left.properties?.[key], right.properties?.[key])])) };
  }
  if (left.type === 'array' && right.type === 'array') return { type: 'array', items: mergeSchemas(left.items, right.items) };
  const variants = [...(left.anyOf ?? [left]), ...(right.anyOf ?? [right])];
  return { anyOf: [...new Map(variants.map((item) => [JSON.stringify(item), item])).values()] };
}

export function parseMaybeJson(text) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function flagsFor(record) {
  const haystack = `${record.method} ${record.path}`;
  const responseKeys = JSON.stringify(record.response_schema ?? {});
  return {
    generation: /generat|predict|render|submit/i.test(haystack),
    model_metadata: /model|provider|registry/i.test(haystack),
    polling: Boolean(record.polling),
    status_task: /task|job|status|progress/i.test(haystack) || /status|state|progress|phase/i.test(responseKeys),
    upload: /upload|multipart|presign/i.test(haystack) || /multipart/i.test(record.request_mime ?? ''),
  };
}

function entitiesFor(path) {
  return ['asset', 'canvas', 'generation', 'model', 'project', 'task', 'workflow'].filter((name) => new RegExp(`${name}s?`, 'i').test(path));
}

export function harEntries(har) {
  return har?.log?.entries ?? [];
}

export function recordsFromHar(har) {
  return harEntries(har).map((entry) => {
    const requestBody = parseMaybeJson(entry.request?.postData?.text);
    const responseBody = parseMaybeJson(entry.response?.content?.text);
    return {
      method: entry.request?.method ?? 'GET',
      url: entry.request?.url ?? '',
      started_at: entry.startedDateTime,
      status: entry.response?.status,
      request_mime: entry.request?.postData?.mimeType,
      response_mime: entry.response?.content?.mimeType,
      request_schema: requestBody === undefined ? undefined : inferSchema(requestBody),
      response_schema: responseBody === undefined ? undefined : inferSchema(responseBody),
    };
  });
}

export function analyzeNetworkRecords(records) {
  const groups = new Map();
  for (const record of records) {
    if (!record.url) continue;
    const path = normalizeEndpoint(record.url);
    const key = `${record.method ?? 'GET'} ${path}`;
    const group = groups.get(key) ?? { method: record.method ?? 'GET', path, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  const endpoints = [...groups.values()].map((group) => {
    const times = group.records.map((item) => Date.parse(item.started_at)).filter(Number.isFinite).sort();
    const intervals = times.slice(1).map((time, index) => time - times[index]);
    const polling = group.records.length >= 3 && intervals.length > 1 && intervals.every((interval) => interval > 0 && interval <= 60_000);
    const endpoint = {
      endpoint_id: stableId('API', `${group.method} ${group.path}`),
      method: group.method,
      path: group.path,
      samples: group.records.length,
      statuses: [...new Set(group.records.map((item) => item.status).filter((item) => item !== undefined))].sort(),
      request_schema: group.records.reduce((schema, item) => mergeSchemas(schema, item.request_schema), null),
      response_schema: group.records.reduce((schema, item) => mergeSchemas(schema, item.response_schema), null),
      polling,
      entities: entitiesFor(group.path),
    };
    endpoint.signals = flagsFor({ ...endpoint, request_mime: group.records.find((item) => item.request_mime)?.request_mime });
    return endpoint;
  }).sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
  return { generated_at: new Date().toISOString(), evidence_role: 'observable transport evidence only; not an API design target', endpoints };
}

export function analyzeHar(har) {
  return analyzeNetworkRecords(recordsFromHar(har));
}

export function analyzeDom(snapshot) {
  const elements = (snapshot?.elements ?? snapshot?.semantic?.elements ?? []).filter((item) => item.visible !== false).map((item) => ({
    tag: item.tag ?? '',
    role: item.role ?? '',
    label: item.label ?? item.name ?? '',
    text: item.text ?? '',
    disabled: Boolean(item.disabled),
    selected: Boolean(item.selected),
    checked: item.checked ?? null,
    expanded: item.expanded ?? null,
    loading: Boolean(item.loading),
  }));
  const kinds = ['button', 'input', 'select', 'tab', 'menu', 'dialog', 'link', 'form'];
  return {
    url: snapshot?.url,
    timestamp: snapshot?.timestamp,
    truncated: Boolean(snapshot?.truncated ?? snapshot?.semantic?.truncated),
    counts: Object.fromEntries(kinds.map((kind) => [kind, elements.filter((item) => item.tag === kind || item.role === kind).length])),
    elements,
  };
}

function indexed(elements) {
  const seen = new Map();
  return new Map(elements.map((item) => {
    const base = `${item.tag}|${item.role}|${item.label || item.text}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return [`${base}|${count}`, item];
  }));
}

export function visibleStates(elements) {
  const states = new Set(elements.length ? ['default'] : ['empty']);
  for (const item of elements) {
    const text = `${item.label} ${item.text}`;
    if (item.disabled) states.add('disabled');
    if (item.selected) states.add('selected');
    if (item.loading) states.add('loading');
    for (const [state, pattern] of Object.entries(STATE_WORDS)) if (pattern.test(text)) states.add(state);
  }
  return [...states].sort();
}

export function diffDom(beforeInput, afterInput) {
  const before = analyzeDom(beforeInput);
  const after = analyzeDom(afterInput);
  const left = indexed(before.elements);
  const right = indexed(after.elements);
  const added = [...right].filter(([key]) => !left.has(key)).map(([, value]) => value);
  const removed = [...left].filter(([key]) => !right.has(key)).map(([, value]) => value);
  const changed = [...right].filter(([key, value]) => left.has(key) && JSON.stringify(left.get(key)) !== JSON.stringify(value)).map(([key, value]) => ({ key, before: left.get(key), after: value }));
  return {
    before_states: visibleStates(before.elements),
    after_states: visibleStates(after.elements),
    added,
    removed,
    changed,
  };
}

function capabilityPriority(text) {
  return /text|image|video|generate|edit|node|upload|retry|文本|图片|视频|生成|节点|重试/i.test(text) ? 'P0' : 'P1';
}

function endpointCapability(endpoint) {
  if (endpoint.signals.generation && endpoint.signals.status_task) return ['Submit and track generation job', 'generation'];
  if (endpoint.signals.generation) return ['Submit generation request', 'generation'];
  if (endpoint.signals.upload) return ['Upload reusable asset', 'asset'];
  if (endpoint.signals.model_metadata) return ['Select model from observable metadata', 'model'];
  if (endpoint.entities.includes('canvas')) return ['Persist canvas state', 'canvas'];
  if (endpoint.entities.includes('project')) return ['Persist project workspace', 'project'];
  if (endpoint.entities.includes('asset')) return ['Manage reusable assets', 'asset'];
  return null;
}

export function inferCapabilities(apiMap, actions = []) {
  const capabilities = [];
  for (const action of actions) {
    const name = action.name ?? action.action_id;
    const evidence = [action.action_path, ...(action.evidence ?? [])].filter(Boolean);
    const sources = [action.dom_diff && 'DOM diff', action.network?.length && 'Network', action.screenshot && 'Screenshot'].filter(Boolean);
    capabilities.push({
      capability_id: stableId('CAP', name),
      name,
      category: action.category ?? 'interaction',
      priority: action.priority ?? capabilityPriority(name),
      evidence,
      trigger: action.trigger ?? 'not recorded',
      inputs: action.inputs ?? {},
      observable_behavior: action.visible_state_transition ?? action.dom_diff ?? {},
      outputs: action.outputs ?? {},
      states: [...new Set([...(action.dom_diff?.before_states ?? []), ...(action.dom_diff?.after_states ?? [])])],
      persistence: action.persistence ?? 'not yet verified',
      known_edge_cases: action.known_edge_cases ?? [],
      confidence: sources.length >= 3 ? 0.95 : sources.length === 2 ? 0.8 : 0.6,
    });
  }
  const observedNames = new Set(capabilities.map((item) => item.name));
  for (const endpoint of apiMap.endpoints ?? []) {
    const inferred = endpointCapability(endpoint);
    if (!inferred || observedNames.has(inferred[0])) continue;
    observedNames.add(inferred[0]);
    capabilities.push({
      capability_id: stableId('CAP', inferred[0]),
      name: inferred[0],
      category: inferred[1],
      priority: capabilityPriority(inferred[0]),
      evidence: [`API_MAP.yaml#${endpoint.endpoint_id}`],
      trigger: 'Requires targeted UI verification',
      inputs: endpoint.request_schema ?? {},
      observable_behavior: { transport_signal: `${endpoint.method} ${endpoint.path}`, polling: endpoint.polling },
      outputs: endpoint.response_schema ?? {},
      states: endpoint.signals.status_task ? ['queued', 'processing', 'success', 'error'] : ['default', 'success'],
      persistence: endpoint.entities.length ? `observable entities: ${endpoint.entities.join(', ')}` : 'not yet verified',
      known_edge_cases: ['UI trigger and recovery behavior require targeted verification'],
      confidence: 0.55,
    });
  }
  return { generated_at: new Date().toISOString(), capabilities: capabilities.sort((a, b) => a.capability_id.localeCompare(b.capability_id)) };
}

export function generateBenchmarks(capabilityMap) {
  return {
    generated_at: new Date().toISOString(),
    scoring: { P0_target_percent: 95, P1_target_percent: 90, result_values: ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'] },
    benchmarks: (capabilityMap.capabilities ?? []).map((capability) => ({
      benchmark_id: stableId('BENCH', capability.capability_id),
      capability_id: capability.capability_id,
      priority: capability.priority,
      result: 'NOT_RUN',
      preconditions: ['Authorized test account', 'Known starting project state'],
      steps: [capability.trigger],
      pass_if: [
        `Observed behavior matches: ${compact(capability.observable_behavior)}`,
        `Outputs match: ${compact(capability.outputs)}`,
        `Expected states are observable: ${(capability.states ?? []).join(', ')}`,
      ],
      fail_if: ['Any pass condition is not met', 'Unexpected irreversible side effect or unreported credit consumption occurs'],
      evidence_required: capability.evidence,
    })),
  };
}

function compact(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const rendered = toYaml(item, indent + 2).split('\n');
        return `${pad}- ${rendered[0].trimStart()}${rendered.length > 1 ? `\n${rendered.slice(1).join('\n')}` : ''}`;
      }
      return `${pad}- ${toYaml(item, 0)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return '{}';
    return entries.map(([key, item]) => {
      if (item && typeof item === 'object' && (Array.isArray(item) ? item.length : Object.keys(item).length)) return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      return `${pad}${key}: ${toYaml(item, 0)}`;
    }).join('\n');
  }
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

export async function writeYaml(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${toYaml(value)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

export async function loadActions(sessionDir) {
  const root = await exists(join(sessionDir, 'actions')) ? join(sessionDir, 'actions') : sessionDir;
  const actions = [];
  for (const name of await readdir(root)) {
    const dir = join(root, name);
    if (!(await stat(dir)).isDirectory() || !(await exists(join(dir, 'action.json')))) continue;
    const action = await readJson(join(dir, 'action.json'));
    const before = await readJson(join(dir, 'before', 'page.json'));
    const after = await readJson(join(dir, 'after', 'page.json'));
    const domDiff = await exists(join(dir, 'diff', 'dom.json')) ? await readJson(join(dir, 'diff', 'dom.json')) : diffDom(before, after);
    const network = await exists(join(dir, 'network', 'requests.json')) ? await readJson(join(dir, 'network', 'requests.json')) : [];
    actions.push({ ...action, action_path: `actions/${basename(dir)}`, dom_diff: domDiff, network, screenshot: await exists(join(dir, 'after', 'screenshot.png')) });
  }
  return actions;
}

export async function runPipeline(sessionDir, repoRoot) {
  const actions = await loadActions(sessionDir);
  let records = actions.flatMap((action) => action.network ?? []);
  for (const candidate of [join(sessionDir, 'session.har'), join(sessionDir, 'network.har')]) if (await exists(candidate)) records = [...records, ...recordsFromHar(await readJson(candidate))];
  const apiMap = analyzeNetworkRecords(records);
  const capabilityMap = inferCapabilities(apiMap, actions);
  const benchmark = generateBenchmarks(capabilityMap);
  const specDir = join(repoRoot, 'reverse-engineering', 'libtv', 'spec');
  const benchmarkDir = join(repoRoot, 'reverse-engineering', 'libtv', 'benchmark');
  await mkdir(specDir, { recursive: true });
  await mkdir(benchmarkDir, { recursive: true });
  await writeFile(join(specDir, 'API_MAP.yaml'), `${toYaml(apiMap)}\n`);
  await writeFile(join(specDir, 'CAPABILITY_MAP.yaml'), `${toYaml(capabilityMap)}\n`);
  await writeFile(join(benchmarkDir, 'PARITY_BENCHMARK.yaml'), `${toYaml(benchmark)}\n`);
  return { apiMap, capabilityMap, benchmark };
}
