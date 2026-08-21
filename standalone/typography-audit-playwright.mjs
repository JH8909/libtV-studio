/**
 * Playwright typography audit — samples computed font-size across major UI surfaces.
 */
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listenAsync(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}
async function freePort() {
  const probe = http.createServer();
  const port = await listenAsync(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function sampleTypography(page, selectors) {
  return page.evaluate((list) => {
    const out = [];
    for (const { surface, selector, label } of list) {
      const el = document.querySelector(selector);
      if (!el) {
        out.push({ surface, label, selector, missing: true });
        continue;
      }
      const cs = getComputedStyle(el);
      out.push({
        surface,
        label,
        selector,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontWeight: cs.fontWeight,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      });
    }
    return out;
  }, selectors);
}

const SELECTORS = [
  { surface: 'global', selector: 'html', label: 'html root' },
  { surface: 'global', selector: 'button', label: 'button default' },
  { surface: 'topbar', selector: '.compact-topbar', label: 'topbar' },
  { surface: 'topbar', selector: '#skillDrawerBtn span', label: 'top chip text' },
  { surface: 'topbar', selector: '#saveState span', label: 'save state' },
  { surface: 'topbar', selector: '.project-select .app-select>summary', label: 'project select' },
  { surface: 'welcome', selector: '.canvas-welcome p', label: 'welcome hint' },
  { surface: 'welcome', selector: '.welcome-card-list strong', label: 'welcome card title' },
  { surface: 'welcome', selector: '.welcome-card-list small', label: 'welcome card subtitle' },
  { surface: 'canvas', selector: '.zoom-label', label: 'zoom label' },
  { surface: 'canvas', selector: '.node-title strong', label: 'node title' },
  { surface: 'canvas', selector: '.node-kind', label: 'node kind meta' },
  { surface: 'canvas', selector: '.generator-prompt', label: 'node prompt input' },
  { surface: 'canvas', selector: '.generator-suggestions strong', label: 'node suggestions' },
  { surface: 'asset', selector: '.drawer-header strong', label: 'drawer title' },
  { surface: 'asset', selector: '.asset-card-lead', label: 'asset card lead' },
  { surface: 'asset', selector: '.asset-card-meta', label: 'asset card meta' },
  { surface: 'skill', selector: '.skill-card-heading h3', label: 'skill card title' },
  { surface: 'skill', selector: '.skill-card-blurb', label: 'skill card blurb' },
  { surface: 'skill', selector: '.skill-card-specs', label: 'skill card specs' },
  { surface: 'skill', selector: '.skill-use-button', label: 'skill use button' },
  { surface: 'skill', selector: '#skillSearchInput', label: 'skill search' },
  { surface: 'agent', selector: '.agent-empty-copy h2', label: 'agent empty title' },
  { surface: 'agent', selector: '.agent-empty-copy p', label: 'agent empty body' },
  { surface: 'agent', selector: '.agent-starter-copy strong', label: 'agent starter title' },
  { surface: 'agent', selector: '.agent-starter-copy small', label: 'agent starter meta' },
  { surface: 'agent', selector: '#agentPromptInput', label: 'agent prompt input' },
  { surface: 'agent', selector: '.agent-prompt-model-trigger', label: 'agent model trigger' },
  { surface: 'timeline', selector: '.timeline-header strong', label: 'timeline title' },
  { surface: 'timeline', selector: '.timeline-hint', label: 'timeline hint' },
  { surface: 'timeline', selector: '.timeline-actions button span', label: 'timeline action' },
  { surface: 'timeline', selector: '.clip', label: 'timeline clip' },
  { surface: 'inspector', selector: '#inspector', label: 'inspector empty' },
  { surface: 'inspector', selector: '.inspector h3', label: 'inspector heading' },
  { surface: 'inspector', selector: '.inspector dl', label: 'inspector dl' },
  { surface: 'modal', selector: '.help-modal .modal-header strong', label: 'help modal title' },
  { surface: 'modal', selector: '.help-grid span', label: 'help grid label' },
  { surface: 'modal', selector: '.help-grid kbd', label: 'help grid kbd' },
  { surface: 'job', selector: '.job-filters button', label: 'job filter' },
  { surface: 'job', selector: '.job', label: 'job item' },
];

const dataDir = await mkdtemp(join(tmpdir(), 'libtv-type-audit-'));
const fake = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: '{"text":"ok","cards":[]}' } }] }));
});
const fakePort = await listenAsync(fake);
const studioPort = await freePort();
const base = `http://127.0.0.1:${studioPort}`;

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(studioPort),
    DATA_DIR: dataDir,
    DEEPSEEK_API_KEY: 'deepseek-test',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${fakePort}/deepseek`,
    DEEPSEEK_TEXT_MODEL: 'fake-deepseek-text',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await sleep(250);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(8000);

const report = { samples: [], bySize: {}, issues: [] };

try {
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Type Audit' }),
  })).json();

  await page.goto(`${base}/?project=${project.id}`, { waitUntil: 'networkidle' });
  await sleep(800);

  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => ['global', 'topbar', 'welcome', 'canvas'].includes(s.surface))));

  await page.locator('#assetDrawerBtn').click();
  await sleep(400);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => s.surface === 'asset')));

  await page.locator('#skillDrawerBtn').click();
  await sleep(500);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => s.surface === 'skill')));
  const firstSkill = page.locator('[data-skill-id]').first();
  if (await firstSkill.count()) {
    await firstSkill.click();
    await sleep(400);
    report.samples.push(...await sampleTypography(page, [
      { surface: 'skillDetail', selector: '.skill-detail-heading h2', label: 'skill detail title' },
      { surface: 'skillDetail', selector: '.skill-detail-use span', label: 'skill detail CTA' },
      { surface: 'skillDetail', selector: '.skill-detail-section p', label: 'skill detail body' },
    ]));
    await page.locator('.skill-detail-close').click();
    await sleep(200);
  }

  await page.locator('#agentBtn').click();
  await sleep(400);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => s.surface === 'agent')));

  await page.locator('#timelineToggleBtn').click();
  await sleep(400);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => s.surface === 'timeline')));

  await page.locator('[data-welcome-action="image"]').click().catch(async () => {
    await page.locator('#addNodeBtn').click();
    await page.locator('[data-node-menu-id="image.generate"]').click();
  });
  await sleep(600);
  await page.locator('.node-generation, .node-imageGen').first().click();
  await sleep(300);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => ['canvas', 'inspector'].includes(s.surface))));

  await page.locator('#helpBtn').click({ force: true });
  await sleep(300);
  report.samples.push(...await sampleTypography(page, SELECTORS.filter((s) => s.surface === 'modal')));

  for (const s of report.samples) {
    if (s.missing) continue;
    report.bySize[s.fontSize] ??= [];
    report.bySize[s.fontSize].push(`${s.surface}/${s.label}`);
  }

  const sizes = Object.keys(report.bySize).map((k) => parseFloat(k)).sort((a, b) => a - b);
  report.uniqueSizes = sizes.map((n) => `${n}px`);
  report.sizeCount = sizes.length;

  // Heuristic issues
  if (sizes.length > 8) {
    report.issues.push({ type: '字号种类过多', detail: `${sizes.length} 种不同 computed 字号`, sizes: report.uniqueSizes });
  }
  const agentTitle = report.samples.find((s) => s.label === 'agent empty title');
  const agentPanelLater = report.samples.find((s) => s.label === 'agent empty title');
  if (agentTitle && agentTitle.fontSize !== '22px') {
    report.issues.push({ type: 'Agent 空状态标题偏离 token', expected: '22px (--text-title-lg)', actual: agentTitle.fontSize });
  }
  const skillTitle = report.samples.find((s) => s.label === 'skill card title');
  if (skillTitle && skillTitle.fontSize !== '16px') {
    report.issues.push({ type: 'Skill 卡片标题偏离 token', expected: '16px (--text-title-sm)', actual: skillTitle.fontSize });
  }
  const timelineHint = report.samples.find((s) => s.label === 'timeline hint');
  if (timelineHint && parseFloat(timelineHint.fontSize) < 11) {
    report.issues.push({ type: '时间线提示过小', actual: timelineHint.fontSize, note: '低于 11px 网页可读下限' });
  }
  const clip = report.samples.find((s) => s.label === 'timeline clip');
  if (clip && parseFloat(clip.fontSize) <= 10) {
    report.issues.push({ type: '时间线片段标签过小', actual: clip.fontSize });
  }

  const outPath = join(ROOT, `typography-audit-report-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Unique sizes: ${report.uniqueSizes.join(', ')}`);
} finally {
  await browser.close();
  child.kill('SIGTERM');
  await sleep(300);
}
