import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { capturePage } from '../browser-capture.mjs';
import { analyzeHar, diffDom, runPipeline } from '../core.mjs';

function harEntry({ method = 'GET', url, time, request, response, status = 200 }) {
  return {
    startedDateTime: time,
    request: { method, url, postData: request === undefined ? undefined : { mimeType: 'application/json', text: JSON.stringify(request) } },
    response: { status, content: { mimeType: 'application/json', text: JSON.stringify(response) } },
  };
}

test('HAR analyzer normalizes endpoints and detects generation polling', () => {
  const entries = [
    harEntry({ method: 'POST', url: 'https://example.test/api/generations', time: '2026-01-01T00:00:00.000Z', request: { prompt: 'x', modelId: 'm1' }, response: { taskId: 'abc', status: 'queued' } }),
    ...[1, 2, 3].map((second) => harEntry({ url: 'https://example.test/api/tasks/1234567890123456/status', time: `2026-01-01T00:00:0${second}.000Z`, response: { status: second === 3 ? 'success' : 'processing', progress: second * 30 } })),
  ];
  const map = analyzeHar({ log: { entries } });
  const generation = map.endpoints.find((item) => item.method === 'POST');
  const status = map.endpoints.find((item) => item.method === 'GET');
  assert.equal(generation.path, '/api/generations');
  assert.equal(generation.signals.generation, true);
  assert.equal(status.path, '/api/tasks/:id/status');
  assert.equal(status.polling, true);
  assert.equal(status.signals.status_task, true);
});

test('DOM diff reports state transition and controls', () => {
  const before = { elements: [{ tag: 'button', text: '生成', disabled: false, visible: true }] };
  const after = { elements: [
    { tag: 'button', text: '生成', disabled: true, loading: true, visible: true },
    { tag: 'button', text: '取消', visible: true },
    { tag: 'div', role: 'progressbar', text: '生成中', visible: true },
  ] };
  const diff = diffDom(before, after);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.added.length, 2);
  assert.ok(diff.after_states.includes('loading'));
  assert.ok(diff.after_states.includes('processing'));
});

test('page capture works without raw CDP DOM access', async () => {
  const tab = {
    url: async () => 'https://example.test/canvas?token=secret',
    playwright: {
      evaluate: async (expression) => {
        assert.match(expression, /querySelectorAll/);
        return { elements: [{ tag: 'button', text: '生成', visible: true }], truncated: false };
      },
    },
  };
  const page = await capturePage({ tab });
  assert.equal(page.url, 'https://example.test/canvas?token=%5BREDACTED%5D');
  assert.equal(page.semantic.counts.button, 1);
  assert.equal(page.dom_snapshot.captured, false);
  assert.equal(page.storage.captured, false);
});

test('pipeline generates API, capability, and PASS/FAIL benchmark maps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'libtv-probe-'));
  const session = join(root, 'session');
  const actionDir = join(session, 'actions', 'A001');
  await Promise.all([
    mkdir(join(actionDir, 'before'), { recursive: true }),
    mkdir(join(actionDir, 'after'), { recursive: true }),
    mkdir(join(actionDir, 'diff'), { recursive: true }),
    mkdir(join(actionDir, 'network'), { recursive: true }),
  ]);
  const before = { semantic: { elements: [{ tag: 'button', text: '生成', visible: true }] } };
  const after = { semantic: { elements: [{ tag: 'button', text: '生成', disabled: true, loading: true, visible: true }] } };
  const domDiff = diffDom(before, after);
  const network = [{ method: 'POST', url: 'https://example.test/api/generations', status: 202, request_schema: { type: 'object' }, response_schema: { type: 'object' } }];
  await Promise.all([
    writeFile(join(actionDir, 'action.json'), JSON.stringify({ action_id: 'A001', name: 'Generate image', category: 'image', priority: 'P0', trigger: 'Click Generate', inputs: { prompt: 'text' }, outputs: { result: 'image' }, evidence: ['after/screenshot.png'] })),
    writeFile(join(actionDir, 'before', 'page.json'), JSON.stringify(before)),
    writeFile(join(actionDir, 'after', 'page.json'), JSON.stringify(after)),
    writeFile(join(actionDir, 'diff', 'dom.json'), JSON.stringify(domDiff)),
    writeFile(join(actionDir, 'network', 'requests.json'), JSON.stringify(network)),
    writeFile(join(actionDir, 'after', 'screenshot.png'), ''),
  ]);
  const result = await runPipeline(session, root);
  assert.equal(result.apiMap.endpoints.length, 1);
  assert.equal(result.capabilityMap.capabilities.length, 2);
  assert.ok(result.benchmark.benchmarks.every((item) => item.pass_if.length && item.fail_if.length));
  const apiYaml = await readFile(join(root, 'reverse-engineering', 'libtv', 'spec', 'API_MAP.yaml'), 'utf8');
  const benchmarkYaml = await readFile(join(root, 'reverse-engineering', 'libtv', 'benchmark', 'PARITY_BENCHMARK.yaml'), 'utf8');
  assert.match(apiYaml, /\/api\/generations/);
  assert.match(benchmarkYaml, /pass_if:/);
  assert.match(benchmarkYaml, /fail_if:/);
});
