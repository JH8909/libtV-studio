import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const appSource = await readFile(join(ROOT, 'public', 'app.js'), 'utf8');
const cssSource = await readFile(join(ROOT, 'public', 'styles.css'), 'utf8');
const indexSource = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
const connectBranch = appSource.match(/else if\(it\.type==='connect'\)\{[\s\S]*?\}else if\(it\.type==='pan'\)/)?.[0] || '';
const nodeCatalogSource = appSource.match(/const NODE_CATALOG=\[[\s\S]*?\n\];/)?.[0] || '';
const scriptParserSource = appSource.match(/function splitMarkdownRow[\s\S]*?function parseStructuredScript\(text,preset\)\{[^\n]+\}/)?.[0] || '';
const legacyScriptSample = `# Seedance 最终视频提示词

**【第1格 | 0:00-0:03】 全景/俯拍/缓慢推进**
城市天台对决，人物动作稳定。文案/旁白：胜负就在此刻。声音：风声与脚步声。产品一致性：服装造型保持统一。

---

**【第2格 | 0:03-0:06】 中景/横移跟拍**
镜头跟随人物移动。音效：衣物摩擦声。`;
const legacyParsed = scriptParserSource ? runInNewContext(`const SCRIPT_TABLE_HEADERS=['镜号','阶段/景别','画面描述','文案/旁白','时长','音效/音乐'];const SCRIPT_PRESETS=new Set(['storyboard','video_script','nine_grid_hook','seedance_grid_prompt']);${scriptParserSource};parseStructuredScript(input,'seedance_grid_prompt')`, { input: legacyScriptSample }) : null;

const checks = [
  ['edge hit target is wider than the visible line', /\.edge-hit\{[^}]*stroke-width:26/.test(cssSource)],
  ['selected edge uses blue without extra width or glow', /\(sel\|\|st==='done'\)\?'var\(--edge-blue,#8fcce9\)'/.test(appSource) && !/edge-selected-glow/.test(appSource + cssSource) && !/\.edge-main\.edge-selected\{[^}]*stroke-width/.test(cssSource) && !/\.edge-main\.edge-selected\{[^}]*filter/.test(cssSource)],
  ['completed edges use the blue edge highlight', /st==='done'/.test(appSource) && /--edge-blue:#8fcce9/.test(cssSource)],
  ['marquee selection can pick an edge', /function edgeIntersectsScreenBox/.test(appSource) && /S\.selectedEdgeId=S\.selectedNodeIds\.length\?null:\(S\.workflow\.edges\.find\(edge=>edgeIntersectsScreenBox\(edge,screenBox\)\)\?\.id\|\|null\)/.test(appSource)],
  ['transparent generation node shell does not block edge hits', /\.node\.node-generation\{[^}]*pointer-events:none/.test(cssSource) && /\.node-generation \.node-header,\.node-generation \.generator-preview,\.node-generation \.generator-composer,\.node-generation \.generation-result-actions\{pointer-events:auto\}/.test(cssSource)],
  ['canvas double click opens the full node menu', /addEventListener\('dblclick',e=>\{[^}]*showNodeMenu\(e\.clientX,e\.clientY,screenToWorld\(e\.clientX,e\.clientY\)\);/.test(appSource) && !/showCanvasQuickAddMenu/.test(appSource)],
  ['canvas right click does not open an app menu', /addEventListener\('contextmenu',e=>\{if\(e\.target\.closest\('\.node'\)\)return;e\.preventDefault\(\);hideMenus\(\);\}\);/.test(appSource) && !/showCanvasContextMenu/.test(appSource)],
  ['node menu search is removed', !/nodeMenuSearch/.test(appSource+indexSource) && !/node-menu-search/.test(cssSource)],
  ['node menu only lists base node types', /id:'text\.ai'/.test(nodeCatalogSource) && /id:'image\.generate'/.test(nodeCatalogSource) && /id:'video\.generate'/.test(nodeCatalogSource) && !/id:'text\.(storyboard|video_script|image_prompt|nine_grid_hook|seedance_grid_prompt)'/.test(nodeCatalogSource) && !/id:'image\.edit'/.test(nodeCatalogSource) && !/id:'video\.(image_to_video|first_last_frame|reference)'/.test(nodeCatalogSource)],
  ['node menu only renders icons and titles', !/(section|desc|badge):/.test(nodeCatalogSource) && !/menu-section-title|node-menu-copy|menu-badge/.test(appSource+cssSource) && /node-menu-label/.test(appSource+cssSource)],
  ['node menu includes a real upload node', /id:'asset\.upload'[^\n]*title:'上传节点'[^\n]*addUploadNode\(pos\)/.test(nodeCatalogSource) && /if\(n\.type==='upload'\)/.test(appSource) && /data-action="chooseUpload"/.test(appSource)],
  ['files can be dropped on the canvas or upload node', /els\.canvas\.addEventListener\('dragover'/.test(appSource) && /els\.canvas\.addEventListener\('drop'[^\n]*addUploadNode\(screenToWorld\(e\.clientX,e\.clientY\)\)/.test(appSource) && /uploadFiles\(\[\.\.\.e\.dataTransfer\.files\],\{targetNodeId:n\.id\}\)/.test(appSource)],
  ['uploaded files become connectable upload nodes', /\['asset','upload'\]\.includes\(n\.type\)/.test(appSource) && /uploaded\.forEach\(\(asset,index\)=>\{const node=index===0\?current:addUploadNode/.test(appSource)],
  ['node menu uses the reduced width', /\.node-menu\{width:220px\}/.test(cssSource)],
  ['manual text node is not offered or rendered', !/id:'text\.manual'/.test(appSource) && !/if\(n\.type==='prompt'\) return/.test(appSource)],
  ['obsolete canvas guidance is removed', !/canvasHint|canvas-hint|右键添加节点/.test(appSource+indexSource+cssSource) && /<kbd>节点右键<\/kbd><span>节点菜单<\/span>/.test(indexSource)],
  ['saved prompt nodes are migrated out of the workflow', /function migratePromptNodes/.test(appSource) && /S\.workflow\.nodes=S\.workflow\.nodes\.filter\(n=>!promptIds\.has\(n\.id\)\)/.test(appSource) && /S\.workflow\.edges=S\.workflow\.edges\.filter\(e=>!promptIds\.has\(e\.source\)&&!promptIds\.has\(e\.target\)\)/.test(appSource)],
  ['new default canvas does not seed prompt nodes', /function seedWelcomeNodes/.test(appSource) && !/type:'prompt',position/.test(appSource)],
  ['hidden prompt creation control is removed', !/addPromptBtn/.test(appSource) && !/id="addPromptBtn"/.test(indexSource)],
  ['connection drag highlights only the target port', /classList\.add\('connection-target'\)/.test(connectBranch) && !/classList\.add\('drop-target'\)/.test(connectBranch) && /\.node\.connection-target \.handle\.in\{[^}]*background:var\(--edge-blue,#8fcce9\)/.test(cssSource) && !/\.node\.connection-target::after/.test(cssSource)],
  ['generated text can be viewed and edited', /<textarea class="generator-text-result" data-field="outputText"/.test(appSource) && /\.generator-text-result\{[^}]*resize:none/.test(cssSource)],
  ['generated text preview wheel scroll is not captured by the canvas', /\.generator-text-result',el\)\.forEach\(textarea=>textarea\.addEventListener\('wheel',e=>e\.stopPropagation\(\),\{passive:true\}\)\)/.test(appSource)],
  ['image and video prompts include connected text output', /function collectIncomingText/.test(appSource) && /function collectNodePrompt\(n\)\{return \[collectIncomingText\(n\),String\(n\.data\.prompt\|\|''\)\.trim\(\)\]\.filter\(Boolean\)\.join\('\\n\\n'\)\.trim\(\);\}/.test(appSource)],
  ['douyin ecommerce text presets are available', /id:'text\.nine_grid_hook'/.test(appSource) && /id:'text\.seedance_grid_prompt'/.test(appSource) && /强 Hook 九宫格/.test(appSource) && /九宫格成片/.test(appSource)],
  ['nine-grid video preset removes the English Prompt label', !/九宫格成片 Prompt/.test(appSource) && /label:'九宫格成片'/.test(appSource) && /seedance_grid_prompt:'九宫格成片'/.test(appSource)],
  ['nine-grid script and Seedance prompt presets stay separate', /nine_grid_hook:`[^`]*只生成“3x3 强 Hook 九宫格中文分镜脚本”[^`]*不要生成 Seedance 成片提示词/.test(appSource) && /seedance_grid_prompt:`[^`]*只生成“九宫格成片 Seedance 最终视频提示词”[^`]*不要重新生成九宫格分镜脚本/.test(appSource)],
  ['video nodes expose Seedance audio mode controls', /data-param="audioMode"/.test(appSource) && /ambient:'环境音'/.test(appSource) && /\.inline-fields\.four/.test(cssSource)],
  ['generated scripts have a dedicated full-page viewer', /data-action="openTextOutput"/.test(appSource) && /function openTextOutputPage/.test(appSource) && /id="textOutputModal"/.test(indexSource) && /\.text-output-page/.test(cssSource)],
  ['script presets share one structured table schema', /\| 镜号 \| 阶段\/景别 \| 画面描述 \| 文案\/旁白 \| 时长 \| 音效\/音乐 \|/.test(appSource) && /storyboard:`[^`]*\$\{SCRIPT_TABLE_RULE\}/.test(appSource) && /video_script:`[^`]*\$\{SCRIPT_TABLE_RULE\}/.test(appSource) && /nine_grid_hook:`[^`]*\$\{SCRIPT_TABLE_RULE\}/.test(appSource) && /seedance_grid_prompt:`[^`]*\$\{SCRIPT_TABLE_RULE\}/.test(appSource)],
  ['legacy script blocks are categorized into table cells', legacyParsed?.rows?.length===2 && legacyParsed.rows[0][1]==='全景/俯拍/缓慢推进' && legacyParsed.rows[0][2].includes('产品一致性') && legacyParsed.rows[0][3].includes('胜负就在此刻') && legacyParsed.rows[0][4]==='0:00-0:03' && legacyParsed.rows[0][5].includes('风声与脚步声')],
  ['script tables render in the full-page viewer', /function renderMarkdownTables/.test(appSource) && /textOutputTable/.test(appSource) && /id="textOutputTable"/.test(indexSource) && /\.script-table/.test(cssSource)],
  ['structured script view does not duplicate raw markdown', /\.text-output-page\.has-table \.text-output-editor\{display:none\}/.test(cssSource) && /grid-template-rows:64px minmax\(0,1fr\)/.test(cssSource)],
  ['script viewer is centered at the annotated height', /\.text-output-modal\{[^}]*place-items:center/.test(cssSource) && /\.text-output-page\{[^}]*height:min\(900px,calc\(100vh - 32px\)\)/.test(cssSource)],
  ['structured scripts support explicit inline edit and save', /id="textOutputEditBtn"/.test(indexSource) && /id="textOutputSaveBtn"/.test(indexSource) && /function saveTextOutputEdits/.test(appSource) && /contenteditable="true"/.test(appSource) && /脚本已保存/.test(appSource)],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`canvas interaction regression: ${failed.join(', ')}`);

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
