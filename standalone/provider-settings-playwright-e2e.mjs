import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-provider-playwright-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const issues = [];
const checks = [];

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
function record(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function issue(severity, title, detail = '', extra = {}) {
  issues.push({ severity, title, detail, ...extra });
  console.log(`ISSUE [${severity}] ${title}${detail ? ` — ${detail}` : ''}`);
}

const studioPort = await freePort();
const fakePort = await freePort();
const fake = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && req.url === '/apimart/models') {
    return res.end(JSON.stringify({
      object: 'list',
      data: [
        { id: 'deepseek-v4-flash', type: 'text' },
        { id: 'deepseek-v4-pro', type: 'text' },
        { id: 'gpt-image-2', type: 'image' },
        { id: 'qwen-image-plus', type: 'image' },
        { id: 'doubao-seedance-2.0-mini', type: 'video' },
        { id: 'sora-2', type: 'video' },
      ],
    }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found' }));
});
await new Promise((resolve) => fake.listen(fakePort, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${studioPort}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(studioPort),
    DATA_DIR: dataDir,
    APIMART_API_KEY: 'apimart-test',
    APIMART_BASE_URL: `http://127.0.0.1:${fakePort}/apimart`,
    APIMART_CHAT_BASE_URL: `http://127.0.0.1:${fakePort}/apimart-chat`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

async function waitHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(logs || 'studio did not start');
}

let browser;
let page;
const consoleErrors = [];

try {
  await waitHealth();
  await fetch(`${base}/api/provider-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      APIMART_REFRESH_MODELS: '1',
      APIMART_ENABLED_MODELS: 'deepseek-v4-flash,gpt-image-2,doubao-seedance-2.0-mini',
    }),
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#providerSettingsBtn');

  // Open modal
  await page.locator('#providerSettingsBtn').click();
  await sleep(400);
  const modalOpen = await page.locator('#providerModal').evaluate((el) => !el.classList.contains('hidden'));
  record('模型/API 按钮打开弹窗', modalOpen);
  if (!modalOpen) issue('critical', '点击「模型/API」后弹窗未打开');

  const header = await page.locator('#providerModal strong').first().textContent();
  record('弹窗标题正确', header?.includes('模型'), header || '');

  const providers = ['agnes', 'apimart', 'deepseek', 'bailian'];
  const providerNames = { agnes: 'Agnes AI', apimart: 'APIMart', deepseek: 'DeepSeek', bailian: '阿里云百炼' };

  for (const id of providers) {
    const row = page.locator(`[data-action="providerEdit"][data-provider-id="${id}"]`).first();
    const rowCount = await row.count();
    record(`概览页显示 ${providerNames[id]}`, rowCount >= 1);
    if (!rowCount) {
      issue('high', `概览页缺少 ${providerNames[id]} 入口`);
      continue;
    }
    await row.click();
    await sleep(300);
    const inDetail = await page.locator('#providerSettingsForm').evaluate((el) => el.classList.contains('is-detail'));
    record(`${providerNames[id]} 可进入详情页`, inDetail);
    if (!inDetail) {
      issue('high', `${providerNames[id]} 详情页无法打开`);
      continue;
    }
    const title = await page.locator('.provider-editor-title').textContent();
    record(`${providerNames[id]} 详情标题匹配`, title?.includes(providerNames[id].split(' ')[0]), title || '');
    const fields = await page.locator('[data-provider-key]').count();
    record(`${providerNames[id]} 连接字段可见`, fields > 0, `fields=${fields}`);
    if (!fields) issue('medium', `${providerNames[id]} 详情页没有连接字段`);
    const navActive = await page.locator(`.provider-nav-item[data-provider-id="${id}"].active`).count();
    record(`${providerNames[id]} 侧栏高亮正确`, navActive >= 1);
    if (!navActive) issue('low', `${providerNames[id]} 侧栏未高亮当前服务商`);
    await page.locator('[data-action="providerOverview"]').click();
    await sleep(250);
  }

  // Sidebar switching
  await page.locator('[data-provider-id="deepseek"]').first().click();
  await sleep(250);
  await page.locator('.provider-nav-item[data-provider-id="bailian"]').click();
  await sleep(250);
  const bailianTitle = await page.locator('.provider-editor-title').textContent();
  record('侧栏可在服务商间切换', bailianTitle?.includes('百炼'), bailianTitle || '');

  // Model dropdown in DeepSeek detail
  await page.locator('.provider-nav-item[data-provider-id="deepseek"]').click();
  await sleep(250);
  const modelSelect = page.locator('#providerSettingsForm .provider-model-control .provider-app-select summary').first();
  if (await modelSelect.count()) {
    await modelSelect.click();
    await sleep(400);
    const dropdownState = await page.evaluate(() => {
      const menu = document.querySelector('#providerSettingsForm .provider-app-select[open]');
      const pop = menu?.querySelector('.app-select-popover') || document.querySelector('.app-select-popover.is-fixed');
      if (!menu || !pop) return { open: false };
      const style = getComputedStyle(pop);
      const rect = pop.getBoundingClientRect();
      return {
        open: menu.open,
        portaled: pop.classList.contains('is-fixed'),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      };
    });
    const popoverVisible = dropdownState.open && dropdownState.width > 0 && dropdownState.height > 0 && dropdownState.visibility !== 'hidden' && Number(dropdownState.opacity) > 0;
    record('DeepSeek 模型下拉可展开', popoverVisible, JSON.stringify(dropdownState));
    if (!popoverVisible) {
      issue('high', 'DeepSeek 默认模型下拉展开后不可见', `state=${JSON.stringify(dropdownState)}`);
    }
    const clipped = await page.evaluate(() => {
      const pop = document.querySelector('.app-select-popover.is-fixed') || document.querySelector('#providerSettingsForm .provider-app-select[open] .app-select-popover');
      const modal = document.querySelector('.provider-modal');
      if (!pop || !modal) return false;
      const pr = pop.getBoundingClientRect();
      const mr = modal.getBoundingClientRect();
      return pr.bottom > mr.bottom + 2 || pr.right > window.innerWidth || pr.top < 0;
    });
    if (clipped) issue('medium', '模型下拉菜单可能被弹窗或视口裁剪', 'popover 超出 modal/viewport 边界');
    const option = page.locator('#providerSettingsForm .provider-app-select[open] [data-app-select-option], .app-select-popover.is-fixed [data-app-select-option]').nth(1);
    if (await option.count()) {
      const before = await page.locator('#providerSettingsForm .provider-model-control .app-select-value').first().textContent();
      const target = await option.textContent();
      await option.click({ force: true });
      await sleep(200);
      const after = await page.locator('#providerSettingsForm .provider-model-control .app-select-value').first().textContent();
      record('模型下拉选项可选择', before?.trim() !== after?.trim(), `${before?.trim()} -> ${after?.trim()} (picked ${target?.trim()})`);
      if (before?.trim() === after?.trim()) issue('medium', '模型下拉选项点击后值未变化', `${before} -> ${after}`);
    } else if (popoverVisible) {
      issue('medium', '模型下拉已展开但没有可点击选项');
    }
  } else {
    record('DeepSeek 模型下拉存在', false);
    issue('medium', 'DeepSeek 详情页缺少默认模型下拉');
  }

  // Bailian has 3 model dropdowns
  await page.locator('.provider-nav-item[data-provider-id="bailian"]').click();
  await sleep(300);
  const bailianSelectCount = await page.locator('#providerSettingsForm .provider-app-select').count();
  record('百炼详情页有 3 个模型下拉', bailianSelectCount === 3, `count=${bailianSelectCount}`);
  if (bailianSelectCount !== 3) issue('medium', '阿里云百炼详情页模型下拉数量不正确', `期望 3，实际 ${bailianSelectCount}`);

  // Switch DeepSeek model to a different preset (covered above if already switched)
  await page.locator('.provider-nav-item[data-provider-id="deepseek"]').click();
  await sleep(250);
  const currentModel = await page.locator('#providerSettingsForm .provider-app-select .app-select-value').first().textContent();
  record('DeepSeek 模型下拉保留所选值', Boolean(currentModel?.trim()), currentModel?.trim() || '');

  // Save button copy adapts to context
  const saveBtnLabel = await page.locator('#providerSaveBtn').textContent();
  record('DeepSeek 详情保存按钮文案', /保存配置|保存选择/.test(saveBtnLabel || ''), saveBtnLabel?.trim() || '');

  // Overview hints for unconfigured providers
  await page.locator('[data-action="providerOverview"]').click();
  await sleep(250);
  const hintCount = await page.locator('.provider-overview-hint').count();
  record('未配置服务商概览有引导文案', hintCount >= 3, `hints=${hintCount}`);

  // Agnes model rows exist but may have empty dropdowns before API key
  await page.locator('[data-provider-id="agnes"]').first().click();
  await sleep(300);
  const agnesModelRows = await page.locator('#providerSettingsForm .provider-model-row').count();
  record('Agnes 详情页显示模型行', agnesModelRows >= 3, `rows=${agnesModelRows}`);
  const agnesHint = await page.locator('#providerSettingsForm .provider-model-hint').textContent().catch(() => '');
  record('Agnes 未配置时有引导文案', /保存 API Key/.test(agnesHint || ''), agnesHint?.trim() || '');
  if (!/保存 API Key/.test(agnesHint || '')) {
    issue('medium', 'Agnes 未配置时缺少模型下拉引导文案');
  }

  // APIMart multi-select works through portaled popovers
  await page.locator('.provider-nav-item[data-provider-id="apimart"]').click();
  await sleep(300);
  const textSummary = page.locator('[data-apimart-group="text"] summary').first();
  await textSummary.click();
  await sleep(300);
  const altText = page.locator('[data-apimart-model-id="deepseek-v4-pro"]').first();
  const beforeApimart = await page.locator('[data-apimart-group="text"] .app-select-value').first().textContent();
  if (await altText.count()) {
    await altText.click({ force: true });
    await sleep(250);
  }
  const afterApimart = await page.locator('[data-apimart-group="text"] .app-select-value').first().textContent();
  record('APIMart 文本模型可多选切换', beforeApimart?.trim() !== afterApimart?.trim() || /2 个已选|deepseek-v4-pro/.test(afterApimart || ''), `${beforeApimart?.trim()} -> ${afterApimart?.trim()}`);
  if (beforeApimart?.trim() === afterApimart?.trim() && !/2 个已选/.test(afterApimart || '')) {
    issue('high', 'APIMart 多选下拉点击无效', `${beforeApimart} -> ${afterApimart}`);
  }

  // Overview hint link
  await page.locator('[data-action="providerOverview"]').click();
  await sleep(250);
  const hintLink = page.locator('.provider-overview-hint [data-action="providerEdit"]').first();
  if (await hintLink.count()) {
    await hintLink.click();
    await sleep(250);
    const fromHint = await page.locator('#providerSettingsForm').evaluate((el) => el.classList.contains('is-detail'));
    record('概览页「去配置」可进入详情', fromHint);
    if (!fromHint) issue('medium', '概览页「去配置」链接无法进入详情');
    await page.locator('[data-action="providerOverview"]').click();
    await sleep(250);
  }

  // Save without changes
  try {
    await page.locator('#providerSaveBtn').click();
    await sleep(800);
    const saveStatus = await page.locator('#providerSaveStatus').textContent();
    record('空保存不报错', !/失败|error/i.test(saveStatus || ''), saveStatus?.trim() || '');
    if (/APIMart 已拉取 0 个/.test(saveStatus || '')) {
      issue('medium', '未配置 APIMart 时空保存仍显示拉取计数', saveStatus?.trim() || '');
    }
  } catch (error) {
    record('空保存不报错', false, String(error));
    issue('high', '点击保存按钮失败', String(error));
  }

  // Close via X
  try {
    await page.locator('#providerModalClose').click();
    await sleep(200);
    const closed = await page.locator('#providerModal').evaluate((el) => el.classList.contains('hidden'));
    record('关闭按钮可关闭弹窗', closed);
    if (!closed) issue('medium', '关闭按钮无法关闭弹窗');
  } catch (error) {
    record('关闭按钮可关闭弹窗', false, String(error));
  }

  // Reopen and test backdrop close
  try {
    await page.locator('#providerSettingsBtn').click();
    await sleep(300);
    await page.locator('#providerModal').click({ position: { x: 8, y: 8 } });
    await sleep(200);
    const backdropClosed = await page.locator('#providerModal').evaluate((el) => el.classList.contains('hidden'));
    record('点击遮罩可关闭弹窗', backdropClosed);
    if (!backdropClosed) issue('low', '点击遮罩无法关闭弹窗');
  } catch (error) {
    record('点击遮罩可关闭弹窗', false, String(error));
  }

  // Keyboard: Escape
  try {
    await page.locator('#providerSettingsBtn').click();
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(200);
    const escClosed = await page.locator('#providerModal').evaluate((el) => el.classList.contains('hidden'));
    record('Esc 可关闭弹窗', escClosed);
    if (!escClosed) issue('medium', '按 Esc 无法关闭模型/API 弹窗');
  } catch (error) {
    record('Esc 可关闭弹窗', false, String(error));
  }

  // Focus trap / scroll on small viewport
  try {
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.locator('#providerSettingsBtn').click();
    await sleep(300);
    await page.locator('[data-provider-id="bailian"]').first().click();
    await sleep(300);
    const footerVisible = await page.locator('#providerSaveBtn').isVisible();
    record('小屏下保存按钮仍可见', footerVisible);
    if (!footerVisible) issue('medium', '1024×640 视口下保存按钮被遮挡，需滚动但可能不易发现');
    const modalScrollable = await page.locator('.provider-modal').evaluate((el) => el.scrollHeight > el.clientHeight);
    if (modalScrollable) {
      const saveInView = await page.locator('#providerSaveBtn').evaluate((btn) => {
        const rect = btn.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      if (!saveInView) issue('low', '弹窗内容可滚动但保存按钮不在首屏', '小屏用户可能不知道要滚动到底部保存');
    }
  } catch (error) {
    record('小屏下保存按钮仍可见', false, String(error));
  }

  // Console errors
  record('页面无 console.error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  if (consoleErrors.length) {
    issue('high', '模型/API 交互过程中出现控制台错误', consoleErrors.slice(0, 5).join(' | '));
  }

  const failed = checks.filter((item) => !item.pass);
  console.log('\n--- Summary ---');
  console.log(`Checks: ${checks.length}, passed: ${checks.length - failed.length}, failed: ${failed.length}`);
  console.log(`Issues: ${issues.length}`);
  if (issues.length) {
    console.log('\nIssues list:');
    for (const item of issues) console.log(`- [${item.severity}] ${item.title}: ${item.detail}`);
  }
  process.exitCode = failed.length || issues.some((item) => item.severity === 'critical' || item.severity === 'high') ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  child.kill('SIGTERM');
  fake.close();
  await sleep(200);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
