import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_PRESETS, imagePresetById, imagePresetLibrarySnapshot,
  composeImagePresetPrompt, setImagePresetLibrary,
} from './public/image-presets.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const app = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
const server = await readFile(join(ROOT, 'server.mjs'), 'utf8');
const context = await readFile(join(ROOT, 'app-context.mjs'), 'utf8');
const providerSources = (await Promise.all(['agnes.mjs', 'apimart.mjs', 'bailian.mjs'].map(name => readFile(join(ROOT, 'providers', name), 'utf8')))).join('\n');
const index = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
const css = await readFile(join(ROOT, 'public', 'styles.css'), 'utf8');
const original = imagePresetLibrarySnapshot();
const required = ['id','category','label','positive','negative','aspectRatio','quality','version','aspectPolicy','subjectPolicy','validation'];
const checks = [
  ['all presets have complete library fields', IMAGE_PRESETS.every(item => required.every(key => imagePresetById(item.id)?.[key] != null))],
  ['layout presets lock their recommended aspect ratio', ['multi-camera-nine-grid','story-four-grid','storyboard-twenty-five-grid','face-three-view','product-three-view','panorama-360'].every(id => imagePresetById(id).aspectPolicy === 'locked')],
  ['packaging master permits redesign without copying brands', /允许按当前预设重新设计包装/.test(composeImagePresetPrompt(imagePresetById('packaging-master'),'参考包装')) && !/严格锁定参考产品/.test(composeImagePresetPrompt(imagePresetById('packaging-master'),'参考包装'))],
  ['character presets use identity-specific locking', /严格锁定参考角色的身份/.test(composeImagePresetPrompt(imagePresetById('character-expression-sheet'),'参考角色'))],
  ['narrative presets expose structured guidance', /起因、发展、转折和结果/.test(imagePresetById('story-four-grid').promptPlaceholder) && /剧情目标、关键动作、转折和结尾/.test(imagePresetById('storyboard-twenty-five-grid').promptPlaceholder)],
  ['server exposes a persistent prompt library API', /state\.promptLibrary/.test(server) && /p === '\/api\/prompt-library'/.test(server) && /promptMatch = p\.match/.test(server) && /method === 'PUT'/.test(server)],
  ['asset management exposes the prompt library', /id="assetLibraryTabs"/.test(index) && /id="promptLibraryList"/.test(index) && /function renderPromptLibrary/.test(app)],
  ['prompt library supports versioned positive and negative edits', /function savePromptLibraryPreset/.test(app) && /data-prompt-field="positive"/.test(app) && /data-prompt-field="negative"/.test(app) && /data-prompt-save/.test(app)],
  ['preset nodes do not automatically generate', /function applyImagePreset/.test(app) && !/function applyImagePreset[\s\S]*?generateNode\(derived\.id\)/.test(app.match(/function applyImagePreset[\s\S]*?function addVideo/)?.[0] || '')],
  ['preset nodes use explicit aspect policies', /n\.data\?\.aspectPolicy==='locked'/.test(app) && /presetAspectRatio:preset\.aspectRatio/.test(app)],
  ['saved preset nodes migrate to current prompt versions and policies', /function migrateImagePresetPrompts/.test(app) && /presetVersion:preset\.version/.test(app) && /n\.data\.params\.negativePrompt!==preset\.negative/.test(app)],
  ['progress distinguishes provider percentages from live phases', /job\.progressMode\s*\|\|\s*["']phase["']/.test(context) && /progressMode:\s*["']phase["']/.test(context) && /progressMode:\s*["']provider["']/.test(providerSources) && /progressMode:\s*["']stream["']/.test(providerSources) && /is-indeterminate/.test(app + css)],
  ['completed presets keep system validation text out of the node surface', /function imagePresetReview\(n\)\{\s*return ''/.test(app) && /\.preset-review\{display:none!important\}/.test(css)],
  ['accessibility announcements and reduced motion are supported', /aria-live="polite"/.test(index) && /prefers-reduced-motion:reduce/.test(css)],
];

setImagePresetLibrary(original);
const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`image preset regression: ${failed.join(', ')}`);
console.log(JSON.stringify({ok:true,checks:checks.map(([name])=>name)},null,2));
