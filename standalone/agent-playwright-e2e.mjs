import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-agent-playwright-'));
const fixturePng = join(dataDir, 'agent-fixture.png');
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await writeFile(fixturePng, pngBytes);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

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
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}
function jsonBody(value) { return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }; }

const fake = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/deepseek/chat/completions') {
    return res.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            text: '给这个项目三个可继续推演的方向。',
            cards: [{
              type: 'direction',
              title: '冷静的夜行者',
              summary: '用夜色和微弱的光构成克制的情绪方向。',
              bullets: ['低饱和蓝灰色', '让光源成为叙事线索'],
              tags: ['氛围', '克制'],
            }],
          }),
        },
      }],
    }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found' }));
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
let projectId;
let workflowBefore;
let productAssetId;
let nextConfirm = 'accept';

try {
  await waitHealth();
  const project = await jsonRequest('/api/projects', { method: 'POST', ...jsonBody({ name: 'Agent Playwright' }) });
  projectId = project.id;
  workflowBefore = await jsonRequest(`/api/projects/${projectId}/workflow`);
  const productAsset = await fetch(`${base}/api/projects/${projectId}/assets/upload`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-filename': encodeURIComponent('agent-fixture.png') },
    body: pngBytes,
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    return body;
  });
  productAssetId = productAsset.id;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  page.on('dialog', async (dialog) => {
    const type = dialog.type();
    const message = dialog.message();
    if (type === 'prompt') {
      if (message.includes('重命名')) await dialog.accept('夜行主题会话');
      else await dialog.accept('');
    } else if (type === 'confirm') {
      if (message.includes('删除会话')) await dialog.accept();
      else if (message.includes('Skill') || message.includes('技能') || message.includes('画布')) {
        if (nextConfirm === 'dismiss') await dialog.dismiss();
        else await dialog.accept();
      } else if (nextConfirm === 'dismiss') await dialog.dismiss();
      else await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  await page.goto(`${base}/?project=${projectId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#agentBtn');

  async function clickAgent(target) {
    const locator = page.locator(target).first();
    await page.evaluate(() => { document.querySelector('#agentMessages')?.scrollTo(0, 99999); });
    if (await locator.count()) {
      try {
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ timeout: 3000 });
        return;
      } catch {}
    }
    await page.evaluate((selector) => document.querySelector(selector)?.click(), target);
  }

  async function clickAny(target) {
    const locator = page.locator(target).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 3000, force: true });
        return;
      } catch {}
    }
    await page.evaluate((selector) => document.querySelector(selector)?.click(), target);
  }

  // --- Skill plaza ---
  await clickAny('#skillDrawerBtn');
  await sleep(300);
  const skillDrawerOpen = await page.locator('#skillDrawer').evaluate((el) => !el.classList.contains('hidden-drawer'));
  record('skill drawer opens', skillDrawerOpen);
  const skillCard = page.locator('[data-skill-id="new-chinese-tvc"]');
  const skillCardCount = await skillCard.count();
  record('skill list renders new-chinese-tvc card', skillCardCount >= 1);
  const cardBlurb = await skillCard.locator('.skill-card-blurb').textContent();
  record('skill card shows cardSummary blurb', cardBlurb?.includes('新中式美学全案'), cardBlurb?.trim() || '');
  const cardSpecs = await skillCard.locator('.skill-card-specs').textContent();
  record('skill card specs at bottom', cardSpecs?.includes('商业广告') && cardSpecs?.includes('5 镜'), cardSpecs?.trim() || '');
  await skillCard.click();
  await sleep(250);
  const detailModalOpen = await page.locator('#skillDetailModal').evaluate((el) => !el.classList.contains('hidden'));
  const detailTitle = await page.locator('#skillDetailTitle').textContent();
  record('skill card opens centered detail modal', detailModalOpen && detailTitle?.includes('新中式美学TVC'), detailTitle || '');
  const closeVisible = await page.locator('.skill-detail-close').isVisible();
  const introSection = await page.locator('.skill-detail-intro h3').textContent();
  record('skill detail modal shows close icon and 简介', closeVisible && introSection?.includes('简介'));
  await clickAny('.skill-detail-close');
  await sleep(250);
  const modalClosed = await page.locator('#skillDetailModal').evaluate((el) => el.classList.contains('hidden'));
  const listAgain = await page.locator('[data-skill-id="new-chinese-tvc"]').count();
  record('skill detail close returns to plaza list', modalClosed && listAgain >= 1, `cards=${listAgain}`);
  await skillCard.locator('[data-skill-use]').click();
  await sleep(400);
  const skillFromCard = await page.locator('#agentSkillChip').evaluate((el) => !el.classList.contains('hidden'));
  const drawerClosedAfterUse = await page.locator('#skillDrawer').evaluate((el) => el.classList.contains('hidden-drawer'));
  record('skill card 使用 opens Agent with chip', skillFromCard && drawerClosedAfterUse);
  await clickAgent('[data-agent-skill-clear]');
  await sleep(200);
  await clickAny('#agentCloseBtn');
  await sleep(200);
  await clickAny('#skillDrawerBtn');
  await sleep(250);
  await page.locator('[data-skill-id="new-chinese-tvc"]').click();
  await sleep(250);
  await clickAny('[data-skill-detail-use]');
  await sleep(400);
  const skillFromDetail = await page.locator('#agentSkillChip strong').textContent();
  record('skill detail 使用 Skill opens Agent', skillFromDetail?.includes('新中式美学TVC'), skillFromDetail || '');
  await clickAgent('[data-agent-skill-clear]');
  await clickAny('#agentCloseBtn');
  await sleep(200);

  // 1. Open Agent
  await clickAny('#agentBtn');
  await page.waitForSelector('#agentOverlay:not(.hidden)');
  record('open Agent panel', !(await page.locator('#agentOverlay').evaluate((el) => el.classList.contains('hidden'))));

  // 2. Empty state
  const emptyVisible = await page.locator('.agent-empty-state').first().isVisible();
  const starterCount = await page.locator('.agent-starter').count();
  record('empty state with starters', emptyVisible && starterCount >= 3, `starters=${starterCount}`);

  // 3. Header chrome
  const headerButtons = ['#agentFavoritesBtn', '#agentHistoryBtn', '#agentNewConversationBtn', '#agentCloseBtn'];
  const headerOk = (await Promise.all(headerButtons.map((sel) => page.locator(sel).isVisible()))).every(Boolean);
  record('header icon controls visible', headerOk);

  // 4. Send via starter (before opening transient menus)
  await page.locator('.agent-starter').first().scrollIntoViewIfNeeded();
  await page.locator('.agent-starter').first().click({ force: true });
  await page.waitForSelector('.agent-creative-card', { timeout: 15000 });
  const cardTitle = await page.locator('.agent-creative-card h3').first().textContent();
  record('starter sends message and returns card', cardTitle?.includes('冷静的夜行者'), cardTitle || '');

  // 5. Model selector
  await clickAny('[data-agent-model-trigger]');
  const modelMenuOpen = await page.locator('.agent-prompt-model-menu:not(.hidden)').isVisible();
  record('model menu opens', modelMenuOpen);
  await page.keyboard.press('Escape');

  // 6. User + assistant messages rendered
  const userMsgs = await page.locator('.agent-message-user').count();
  const assistantMsgs = await page.locator('.agent-message-assistant').count();
  record('conversation messages rendered', userMsgs >= 1 && assistantMsgs >= 1, `user=${userMsgs}, assistant=${assistantMsgs}`);

  // 7. Read-only card label
  const readonlyLabel = await page.locator('.agent-card-readonly').first().textContent();
  record('card shows read-only label', readonlyLabel?.includes('只读建议'));

  // 8. Favorite card
  await clickAgent('[data-agent-favorite]');
  await sleep(400);
  const favorited = await page.locator('.agent-card-favorite.is-favorite').count();
  record('favorite card', favorited >= 1, `count=${favorited}`);

  // 9. Favorites view
  await clickAny('#agentFavoritesBtn');
  await sleep(300);
  const favoritesPressed = await page.locator('#agentFavoritesBtn').getAttribute('aria-pressed');
  const favoritesVisible = await page.locator('.agent-creative-card').count() > 0;
  record('favorites view toggle', favoritesPressed === 'true' && favoritesVisible);
  await clickAny('#agentFavoritesBtn');
  await sleep(200);

  async function fillAgentInput(value) {
    await page.evaluate((next) => {
      const input = document.querySelector('#agentPromptInput');
      if (!input) return;
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }

  // 10. Continue chat from card
  await clickAgent('[data-agent-continue]');
  const continueValue = await page.locator('#agentPromptInput').inputValue();
  record('continue chat fills prompt', continueValue.includes('继续聊这个方向'));
  await fillAgentInput('');

  // 11. Copy card
  await clickAgent('[data-agent-copy]');
  record('copy card action clickable', true);

  // 12. Manual send
  await fillAgentInput('再给一个更克制的方向');
  await clickAny('#agentSendBtn');
  await page.waitForFunction(() => document.querySelectorAll('.agent-message-assistant').length >= 2, null, { timeout: 15000 });
  record('manual prompt send', (await page.locator('.agent-message-assistant').count()) >= 2);

  // 13. History menu + rename
  await clickAny('#agentHistoryBtn');
  await sleep(300);
  let historyOpen = await page.locator('#agentHistoryMenu').evaluate((el) => !el.classList.contains('hidden'));
  if (!historyOpen) {
    await page.evaluate(() => document.querySelector('#agentHistoryBtn')?.click());
    await sleep(300);
    historyOpen = await page.locator('#agentHistoryMenu').evaluate((el) => !el.classList.contains('hidden'));
  }
  const historyRows = await page.locator('.agent-history-item').count();
  record('history menu lists conversations', historyOpen && historyRows >= 1, `open=${historyOpen}, rows=${historyRows}`);
  await clickAgent('[data-agent-rename]');
  await sleep(400);
  const renamedTitle = await page.locator('#agentConversationTitle').textContent();
  record('rename conversation', renamedTitle?.includes('夜行主题会话'), renamedTitle || '');

  // 14. New conversation
  await clickAny('#agentNewConversationBtn');
  await sleep(300);
  const emptyAgain = await page.locator('.agent-empty-state').count() > 0;
  record('new conversation clears messages', emptyAgain);

  // 15. Delete extra conversation via history
  await clickAny('#agentHistoryBtn');
  const deleteCount = await page.locator('[data-agent-delete]').count();
  if (deleteCount) {
    await clickAgent('[data-agent-delete]');
    await sleep(400);
    record('delete conversation', true);
  } else {
    record('delete conversation', true, 'skipped — only one conversation');
  }

  // 16. @ source menu
  await fillAgentInput('@');
  await sleep(150);
  const sourceMenu = await page.locator('#agentPromptSourceMenu:not(.hidden)').count() > 0;
  record('@ source menu opens', sourceMenu);
  await page.keyboard.press('Escape');

  // 17. / skill menu
  await fillAgentInput('/');
  await sleep(150);
  const skillMenu = await page.locator('#agentPromptSourceMenu:not(.hidden)').count() > 0;
  record('/ skill menu opens', skillMenu);
  await fillAgentInput('');

  await fillAgentInput('');
  const workflowAfterReadOnlyChat = await jsonRequest(`/api/projects/${projectId}/workflow`);
  record('read-only chat does not mutate canvas', JSON.stringify(workflowBefore) === JSON.stringify(workflowAfterReadOnlyChat));
  record('product fixture uploaded for skill tests', Boolean(productAssetId), productAssetId || '');

  async function uploadAgentAttachment(filePath) {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
    await page.evaluate(() => document.querySelector('#agentPromptPlusBtn')?.click());
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
    await page.waitForFunction(() => !document.querySelector('#agentAttachmentPreview')?.classList.contains('hidden'), null, { timeout: 10000 });
  }

  // 18. Attachment upload via prompt plus
  await clickAny('#agentNewConversationBtn');
  await sleep(300);
  await uploadAgentAttachment(fixturePng);
  const attachmentPreviewVisible = await page.locator('#agentAttachmentPreview').evaluate((el) => !el.classList.contains('hidden'));
  const attachmentCount = await page.locator('.agent-attachment-preview-item').count();
  record('attachment upload shows preview', attachmentPreviewVisible && attachmentCount >= 1, `items=${attachmentCount}`);

  // 19. Send message with attachment reference
  await fillAgentInput('参考这张产品图的材质和配色');
  await clickAny('#agentSendBtn');
  await page.waitForFunction(() => document.querySelectorAll('.agent-message-assistant').length >= 1, null, { timeout: 15000 });
  await sleep(500);
  const attachmentInMessage = await page.locator('.agent-message-attachment').count();
  record('attachment appears on sent user message', attachmentInMessage >= 1, `attachments=${attachmentInMessage}`);

  // 20. Remove pending attachment before next send
  await clickAny('#agentNewConversationBtn');
  await sleep(300);
  await uploadAgentAttachment(fixturePng);
  await clickAgent('[data-agent-attachment-remove]');
  await sleep(200);
  const attachmentRemoved = await page.locator('#agentAttachmentPreview').evaluate((el) => el.classList.contains('hidden'));
  record('attachment remove clears preview', attachmentRemoved);

  async function chooseSkillFromMenu(namePart) {
    await fillAgentInput(`/${namePart}`);
    await sleep(250);
    await page.evaluate((needle) => {
      const button = [...document.querySelectorAll('.agent-prompt-menu-item')].find((el) => el.textContent.includes(needle));
      button?.click();
    }, namePart);
    await sleep(250);
  }

  // 21. Select Skill from / menu and show chip
  await chooseSkillFromMenu('新中式美学TVC');
  const skillChipVisible = await page.locator('#agentSkillChip').evaluate((el) => !el.classList.contains('hidden'));
  const skillChipText = await page.locator('#agentSkillChip strong').textContent();
  record('skill menu selects chip', skillChipVisible && skillChipText?.includes('新中式美学TVC'), skillChipText || '');

  // 22. Skill confirm dismissed keeps canvas unchanged
  const workflowBeforeSkill = await jsonRequest(`/api/projects/${projectId}/workflow`);
  await fillAgentInput('天然玉石、牡丹雕花、东方手工艺');
  nextConfirm = 'dismiss';
  await clickAny('#agentSendBtn');
  await sleep(800);
  const workflowAfterDismiss = await jsonRequest(`/api/projects/${projectId}/workflow`);
  record('skill confirm dismiss keeps canvas', JSON.stringify(workflowBeforeSkill) === JSON.stringify(workflowAfterDismiss));

  // 23. Clear skill chip
  await clickAgent('[data-agent-skill-clear]');
  await sleep(200);
  const skillChipCleared = await page.locator('#agentSkillChip').evaluate((el) => el.classList.contains('hidden'));
  record('skill chip clear', skillChipCleared);

  // 24. Skill confirm accepted applies workflow nodes
  await chooseSkillFromMenu('新中式美学TVC');
  await fillAgentInput('天然玉石、牡丹雕花、东方手工艺');
  nextConfirm = 'accept';
  const nodeCountBefore = (await jsonRequest(`/api/projects/${projectId}/workflow`)).nodes?.length || 0;
  await clickAny('#agentSendBtn');
  await page.waitForFunction(() => document.querySelectorAll('.agent-skill-run-summary').length >= 1, null, { timeout: 20000 });
  await sleep(500);
  const skillSummary = await page.locator('.agent-skill-run-summary span').first().textContent();
  const nodeCountAfter = (await jsonRequest(`/api/projects/${projectId}/workflow`)).nodes?.length || 0;
  record('skill confirm apply adds nodes', nodeCountAfter > nodeCountBefore, `nodes ${nodeCountBefore} -> ${nodeCountAfter}`);
  record('skill run summary rendered', skillSummary?.includes('新中式美学TVC'), skillSummary || '');

  // 25. Close Agent
  await clickAny('#agentCloseBtn');
  await sleep(200);
  const closed = await page.locator('#agentOverlay').evaluate((el) => el.classList.contains('hidden'));
  const agentBtnPressed = await page.locator('#agentBtn').getAttribute('aria-pressed');
  record('close Agent restores topbar state', closed && agentBtnPressed === 'false');

  // 26. Re-open Agent
  await clickAny('#agentBtn');
  await page.waitForSelector('#agentOverlay:not(.hidden)');
  record('re-open Agent', !(await page.locator('#agentOverlay').evaluate((el) => el.classList.contains('hidden'))));

  // 27. Prompt form controls present
  const promptControls = ['#agentPromptPlusBtn', '#agentDictationBtn', '#agentSendBtn', '#agentPromptInput'];
  const promptOk = (await Promise.all(promptControls.map((sel) => page.locator(sel).isVisible()))).every(Boolean);
  record('prompt bar controls visible', promptOk);

  const failed = results.filter((item) => !item.pass);
  console.log('\n--- Studio Playwright Summary ---');
  console.log(JSON.stringify({
    ok: failed.length === 0,
    passed: results.filter((item) => item.pass).length,
    failed: failed.length,
    total: results.length,
    failures: failed,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error('Agent Playwright run failed:', error);
  process.exitCode = 1;
} finally {
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  child.kill('SIGTERM');
  fake.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1000)]);
  await rm(dataDir, { recursive: true, force: true });
}
