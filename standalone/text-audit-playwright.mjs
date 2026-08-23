/**
 * Playwright UI text audit — walks major surfaces and collects visible copy.
 * Run: node standalone/text-audit-playwright.mjs
 */
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-text-audit-'));
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

async function visibleTexts(page, root = 'body') {
  return page.locator(root).evaluate((el) => {
    const skip = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT']);
    const out = [];
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (skip.has(node.tagName)) return;
      if (node.matches('.hidden, [hidden], [aria-hidden="true"]')) return;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      for (const child of node.childNodes) walk(child);
    };
    walk(el);
    return [...new Set(out)];
  });
}

async function ariaLabels(page) {
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach((el) => {
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : el.className?.toString().split(' ')[0] ? `.${el.className.toString().split(' ')[0]}` : tag;
      if (label.trim()) items.push({ id, tag, label: label.trim() });
    });
    return items;
  });
}

const fake = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: '{"text":"审计占位回复","cards":[]}' } }] }));
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
const report = { surfaces: {}, aria: [], issues: [], errors: [] };

async function safeStep(name, fn) {
  try {
    await fn();
  } catch (err) {
    report.errors.push({ step: name, message: String(err.message || err) });
  }
}

try {
  const project = await (await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Text Audit Project' }),
  })).json();

  await page.goto(`${base}/?project=${project.id}`, { waitUntil: 'networkidle' });
  await sleep(800);

  report.surfaces.topbar = await visibleTexts(page, '.topbar');
  report.surfaces.welcome = await visibleTexts(page, '#welcomeCards');
  report.surfaces.canvasToolbar = await visibleTexts(page, '.canvas-bottom-toolbar');

  await safeStep('assetDrawer', async () => {
    await page.locator('#assetDrawerBtn').click();
    await sleep(400);
    report.surfaces.assetDrawer = await visibleTexts(page, '#assetDrawer');
    await page.locator('[data-close-drawer="assetDrawer"]').click();
    await sleep(200);
  });

  await safeStep('skillDrawer', async () => {
    await page.locator('#skillDrawerBtn').click();
    await sleep(600);
    report.surfaces.skillDrawer = await visibleTexts(page, '#skillDrawer');
    const firstSkill = page.locator('[data-skill-id]').first();
    if (await firstSkill.count()) {
      await firstSkill.click();
      await sleep(500);
      report.surfaces.skillDetailModal = await visibleTexts(page, '#skillDetailModal');
      await page.locator('.skill-detail-close').click();
      await sleep(300);
    }
    await page.locator('[data-close-drawer="skillDrawer"]').click();
    await sleep(200);
  });

  await safeStep('agent', async () => {
    await page.locator('#agentBtn').click();
    await sleep(500);
    report.surfaces.agent = await visibleTexts(page, '#agentOverlay');
    await page.locator('#agentSkillBtn').click();
    await sleep(300);
    report.surfaces.agentSkillMenu = await visibleTexts(page, '#agentPromptSourceMenu');
    await page.locator('#agentCloseBtn').click();
    await sleep(300);
  });

  await safeStep('timeline', async () => {
    await page.locator('#timelineToggleBtn').click();
    await sleep(400);
    report.surfaces.timeline = await visibleTexts(page, '#timelineShell');
    await page.locator('#timelineCloseBtn').click();
    await sleep(300);
  });

  await safeStep('helpModal', async () => {
    await page.locator('#helpBtn').click({ force: true });
    await sleep(300);
    report.surfaces.helpModal = await visibleTexts(page, '#helpModal');
    await page.keyboard.press('Escape');
    await sleep(200);
  });

  await safeStep('imageNode', async () => {
    const welcomeImage = page.locator('[data-welcome-action="image"]');
    if (await welcomeImage.isVisible()) {
      await welcomeImage.click();
    } else {
      await page.locator('#addNodeBtn').click();
      await sleep(300);
      await page.locator('[data-node-menu-id="image.generate"]').click();
    }
    await sleep(600);
    report.surfaces.imageNode = await visibleTexts(page, '.node-imageGen, .node-generation').catch(() => []);
    const nodeEl = page.locator('.node-generation, .node-imageGen').first();
    if (await nodeEl.count()) {
      await nodeEl.click();
      await sleep(300);
      report.surfaces.imageNodeExpanded = await visibleTexts(page, '.node.selected');
      report.surfaces.inspector = await visibleTexts(page, '#inspector');
    }
  });

  report.aria = await ariaLabels(page);

  // Heuristic issue detection
  const allText = Object.values(report.surfaces).flat().join('\n');
  const checks = [
    { re: /\bSkill\b/g, label: '英文 Skill 裸露（非代码上下文）' },
    { re: /\bAgent\b/g, label: '英文 Agent 裸露' },
    { re: /API/g, label: '英文 API' },
    { re: /Timeline|Clip|Connection|Inspector/g, label: '英文界面词（Timeline/Clip 等）' },
    { re: /模型\/API/g, label: '模型/API 混排标签' },
    { re: /技能|Skill/g, label: '技能 vs Skill 混用' },
  ];
  for (const { re, label } of checks) {
    const matches = [...new Set(allText.match(re) || [])];
    if (matches.length) report.issues.push({ type: label, samples: matches });
  }

  const mixedLangButtons = report.aria.filter((a) =>
    /[A-Za-z]{3,}/.test(a.label) && /[\u4e00-\u9fff]/.test(a.label) && !a.label.includes('API') && !a.label.includes('Skill')
  );

  report.mixedLangAria = mixedLangButtons.slice(0, 30);
  const outPath = join(ROOT, `text-audit-report-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
} finally {
  await browser.close();
  child.kill('SIGTERM');
  await sleep(300);
}
