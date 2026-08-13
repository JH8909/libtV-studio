import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('standalone/public/app.js');
const html = read('standalone/public/index.html');
const css = read('standalone/public/styles.css');
const design = read('design.md');

const checks = [
  ['design.md defines the four radius tokens', ['--radius-control', '--radius-surface', '--radius-container', '--radius-pill'].every((token) => design.includes(token))],
  ['all source dropdowns use app-select', !/<select\b/i.test(app) && !/<select\b/i.test(html) && app.includes('function appSelectMarkup')],
  ['project and Agent model controls are app-selects', html.includes('id="projectSelect" class="project-select"') && html.includes('id="agentModelSelect" class="app-select')],
  ['secondary controls use the documented geometry tokens', css.includes('.app-select>summary') && css.includes('.app-select-popover') && css.includes('.app-select-option')],
  ['legacy high-specificity controls are normalized', css.includes('.generator-chips .generator-mode-menu summary{border-radius:var(--radius-control)}') && css.includes('.node-generation .node-ref-role-badge{border-radius:var(--radius-pill)}') && css.includes('.welcome-card-list button{border-radius:var(--radius-container)}')],
  ['system prompt review text is not rendered in nodes', /function imagePresetReview\(n\)\s*\{\s*return ''\s*;?\s*\}/.test(app) && css.includes('.preset-review{display:none!important}')],
  ['generation header and preview form one continuous shell', css.includes('.node-generation .generator-preview{border-radius:0 0 var(--radius-container) var(--radius-container)}') && css.includes('.node-generation .generator-preview .node-media{border-radius:0 0 var(--radius-surface) var(--radius-surface)}') && /\.node-generation \.generator-preview\{border-top:0/.test(css)],
  ['determinate progress does not use an infinite animation', /\.node-generation \.node-progress\.is-determinate>span\{[^}]*max-width:100%;[^}]*transition:width \.32s ease-out\}/.test(css) && !/\.node-generation \.node-progress\.is-determinate>span\{[^}]*animation:/.test(css)],
  ['elapsed progress updates do not rebuild the node', /function updateNodeProgressDom\(n\)/.test(app) && /ticker=setInterval\(\(\)=>\{[^}]*updateNodeProgressDom\(n\)/.test(app) && !/ticker=setInterval\(\(\)=>\{[^}]*renderNode\(n\)/.test(app)],
  ['job list only shows percentages backed by provider progress', /function jobProgressMarkup\(job\)\{const determinate=job\.progressMode==='provider'\|\|job\.progressMode==='stream'/.test(app) && /\$\{determinate\?` · \$\{progress\}%`:/ .test(app)],
  ['progress paint is clipped to the node width', /\.node-generation \.node-progress\{[^}]*width:var\(--preview-width,430px\);max-width:var\(--preview-width,430px\);[^}]*overflow:hidden;contain:paint;clip-path:inset\(0\)/.test(css) && /@keyframes node-progress-indeterminate\{0%\{left:-30%\}100%\{left:100%\}\}/.test(css)],
  ['reduced motion keeps an understandable static progress state', /prefers-reduced-motion:reduce[\s\S]*\.node-generation \.node-progress\.is-indeterminate>span\{left:0;width:100%;opacity:\.45\}/.test(css)],
  ['video generation nodes use the shared custom player', /customVideoPlayerMarkup\(out\.publicUrl/.test(app) && !/node-current-preview[^`]*<video[^>]*controls/.test(app) && app.includes('function bindCustomVideoPlayers')],
  ['custom player controls isolate playback from node expansion', /\$\$\('button,input',player\)\.forEach\(control=>\['pointerdown','click','dblclick'\]/.test(app) && app.includes("data-video-action=\"fullscreen\"")],
  ['transient menus share one exclusive interaction group', app.includes("const INTERACTION_DETAILS_SELECTOR='.app-select,.generator-mode-menu") && /menu\.open\)\{closeControlDropdowns\(menu\);positionOpenDetails\(menu\);\}/.test(app)],
  ['top-level surfaces collapse expanded node composers', /function preparePrimarySurface\(\)\{closeControlDropdowns\(\);hideMenus\(\);collapseExpandedNodeComposers\(\);\}/.test(app) && /async function openProviderSettings\(\)\{prepareModalOpen/.test(app)],
  ['preview expansion is keyboard accessible and restores focus', /function generationPreviewToggleAttrs\(n\).*tabindex="0".*aria-expanded/.test(app) && /\['Enter',' '\]\.includes\(e\.key\).*toggleComposerFromPreview\(n\);requestAnimationFrame/.test(app)],
  ['video controls stay thin and shrinkable', /custom-video-controls input\[type=range\]\{[^}]*width:0;max-width:100%;min-width:0;[^}]*flex:1 1 0/.test(css) && /::-webkit-slider-runnable-track\{height:2px/.test(css)],
  ['node and lightbox players use one control standard', !app.includes("compact:previewSize.width<320") && !css.includes('.custom-video-player.is-compact') && css.includes('.media-lightbox-player .custom-video-controls{left:8px;right:8px;bottom:8px}')],
  ['video progress is white without thumb or focus rectangle', css.includes('linear-gradient(90deg,#fff var(--video-progress),rgba(255,255,255,.3)') && /::-webkit-slider-thumb\{[^}]*width:0;height:0/.test(css) && /input\[type=range\]:focus-visible\{outline:none/.test(css)],
  ['image and video lightboxes share one large contain viewport', css.includes('width:min(1440px,calc(100vw - 48px))') && css.includes('height:min(900px,calc(100vh - 48px))') && !css.includes('.media-lightbox[data-kind="video"] .media-lightbox-content') && /\.media-lightbox-stage video\{[^}]*max-height:none;object-fit:contain/.test(css)],
  ['provider model menus escape card clipping and cap long lists', css.includes('.provider-card:has(.provider-app-select[open])') && /provider-app-select \.app-select-popover\{[^}]*max-height:min\(320px/.test(css) && app.includes("menu.closest('.provider-settings-form,.floating-drawer,.modal-backdrop')")],
  ['timeline entry stays out of node parameter rows', html.includes('id="timelineToggleBtn"') && app.includes('data-action="timelineOutput"') && app.includes("if(action==='timelineOutput')return addAssetToTimeline") && !app.includes('class="generator-timeline"')],
];

for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) process.exitCode = 1;
}
