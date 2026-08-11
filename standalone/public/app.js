const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const els = Object.fromEntries([
  'projectSelect','newProjectBtn','saveState','addImageBtn','addVideoBtn','uploadBtn','exportBtn','fileInput','welcomeCards',
  'refreshAssetsBtn','assetList','canvas','canvasWorld','edgesLayer','inspector','jobList','fitBtn','zoomOutBtn','zoomInBtn','zoomLabel',
  'connectionToast','timelineBody','timelineRuler','timelineMeta','timelineRefBtn','deleteClipBtn','splitClipBtn','duplicateClipBtn','crossfadeBtn','rippleDeleteBtn',
  'timelineUndoBtn','timelineRedoBtn','addTextClipBtn','timelineZoomOutBtn','timelineZoomInBtn','timelineZoomLabel','canvasUndoBtn','canvasRedoBtn','runAllBtn','previewStage','previewPlayBtn','previewTime','previewFullscreenBtn','previewFullscreenModal','previewFullscreenStage','previewFullscreenPlayBtn','previewFullscreenTime','previewFullscreenCloseBtn','mediaLightbox','mediaLightboxStage','mediaLightboxClose','assetPromptModal','assetPromptText','assetPromptCopy','assetPromptClose','toastRoot',
  'addNodeBtn','nodeMenu','nodeMenuContent','nodeContextMenu','mouseTools','providerSettingsBtn','providerModal','providerModalClose','providerSettingsForm','providerSaveBtn','providerSaveStatus','assetDrawerBtn','assetDrawer','assetFilterChips','inspectorDrawer','timelineToggleBtn','timelineShell','timelineCloseBtn','helpBtn','helpModal','helpModalClose','textOutputModal','textOutputTitle','textOutputMeta','textOutputTable','textOutputEditor','textOutputContinuityBtn','textOutputStoryboardBtn','textOutputEditBtn','textOutputSaveBtn','textOutputModalClose','textOutputCopyBtn','agentBtn','agentDrawer','agentNewBtn','agentModelSelect','agentMessages','agentProposal','agentInput','agentSendBtn','agentCancelBtn'
].map(id => [id, document.getElementById(id)]));

const NODE_W = 300;
const GENERATION_NODE_W = 500;
const GENERATION_PREVIEW_W = 430;
const PORT_Y = 58;
function isGenerationNode(n){return ['imageGen','videoGen','textGen'].includes(n?.type);}
function nodeWidth(n){ return els.canvasWorld?.querySelector(`[data-id="${n?.id}"]`)?.offsetWidth || (isGenerationNode(n)?GENERATION_NODE_W:NODE_W); }
function nodeHeight(n){ return els.canvasWorld?.querySelector(`[data-id="${n?.id}"]`)?.offsetHeight || (['imageGen','videoGen','textGen'].includes(n?.type)?260:220); }
function nodeFitHeight(n){ return nodeHeight(n); }
const BASE_TIMELINE_PX = 2;
const TRACKS = ['C1','V2','V1','A1','A2'];
const S = {
  projectId: null, projects: [], models: [], assets: [], jobs: [],
  workflow: { version: 2, nodes: [], edges: [] },
  timeline: { fps: 30, width: 1280, height: 720, items: [], tracks: {} },
  selectedNodeId: null, selectedNodeIds: [], selectedEdgeId: null, selectedClipId: null,
  view: { x: 120, y: 80, zoom: 1 },
  canvasHistory: { past: [], future: [] }, timelineHistory: { past: [], future: [] },
  interaction: null, spaceDown: false, saveTimer: null, timelineSaveTimer: null,
  timelineZoom: 1, playheadFrame: 0, previewTimer: null, previewActiveKey: '', previewActiveKeyFull: '',
  tool: 'select', menuWorld: null, menuClient: null, providerSettings: {}, jobWatchers: new Map(), activeReference: null,
  agentModels:[], agentSession:null, agentController:null, assetPick:null, assetFilter:{tag:'all',kind:'all'}, uploadTargetNodeId:null, textOutputNodeId:null, textOutputOriginal:'',
};

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
let mediaLightboxReturnFocus=null;
let assetPromptReturnFocus=null;
let textOutputReturnFocus=null;
function openMediaLightbox(asset){if(!asset||!['image','video'].includes(asset.kind))return;mediaLightboxReturnFocus=document.activeElement;els.mediaLightbox.dataset.kind=asset.kind;els.mediaLightboxStage.innerHTML=asset.kind==='image'?`<img src="${esc(asset.publicUrl)}" alt="${esc(asset.filename||'图片预览')}">`:`<video src="${esc(asset.publicUrl)}" controls autoplay playsinline preload="metadata"></video>`;els.mediaLightbox.classList.remove('hidden');requestAnimationFrame(()=>els.mediaLightboxClose?.focus());}
function closeMediaLightbox(){els.mediaLightboxStage?.querySelector('video')?.pause();els.mediaLightbox?.classList.add('hidden');els.mediaLightbox?.removeAttribute('data-kind');if(els.mediaLightboxStage)els.mediaLightboxStage.innerHTML='';mediaLightboxReturnFocus?.focus?.();mediaLightboxReturnFocus=null;}
function assetPrompt(a){return String(a?.metadata?.prompt||a?.metadata?.agnesResult?.request_params?.prompt||'').replace(/\s+/g,' ').trim();}
function openAssetPrompt(a){const prompt=assetPrompt(a);assetPromptReturnFocus=document.activeElement;els.assetPromptText.value=prompt||'上传素材未包含提示词';els.assetPromptCopy.disabled=!prompt;els.assetPromptModal.classList.remove('hidden');requestAnimationFrame(()=>prompt?els.assetPromptCopy.focus():els.assetPromptClose.focus());}
function closeAssetPrompt(){els.assetPromptModal.classList.add('hidden');assetPromptReturnFocus?.focus?.();assetPromptReturnFocus=null;}
function friendlyError(v){const message=String(v||'');if(['Agnes video image references require PUBLIC_BASE_URL pointing to this Studio','当前图片仅保存在本机，Agnes 视频无法访问。请重新运行 Agnes 图片节点后再生成视频；本地上传图片需在“模型/API → Agnes AI”配置素材公网地址'].includes(v))return '该图片没有 Agnes 可访问的公网地址。请配置素材公网地址，或改用支持内联图片的模型。';if(/fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message))return '暂时无法连接 Agnes 服务，请检查网络和“模型/API”配置后重试。';if(/video queue is full/i.test(message))return '视频服务当前排队已满，自动重试仍未成功，请稍后点击重试。图片、提示词和参数已保留。';if(/rate limit|rate exceeded|allows\s+\d+\s+requests?\s+per/i.test(message))return 'Agnes 视频接口触发频率限制（当前约每分钟 2 次），请等待限流窗口结束后再重试。图片、提示词和参数已保留。';return v;}
function icon(name) { return `<i class="ui-icon${name==='loader-2'?' icon-spin':''}" style="--icon:url('/vendor/icons/${name}.svg')" aria-hidden="true"></i>`; }
function setIconButton(el, name, label) { if (el) el.innerHTML = `${icon(name)}<span>${esc(label)}</span>`; }
function id() { return crypto.randomUUID(); }
function clone(v) { return structuredClone(v); }
function toast(message, type='info') { const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; els.toastRoot.append(el); setTimeout(()=>el.remove(),3600); }
async function api(path, opts={}) { const res=await fetch(path,opts); const ct=res.headers.get('content-type')||''; const body=ct.includes('application/json')?await res.json():await res.text(); if(!res.ok) throw new Error(body?.message||body?.error||`${res.status} ${res.statusText}`); return body; }
function findAsset(assetId){ return S.assets.find(a=>a.id===assetId); }
const ASSET_DRAG_TYPE='application/x-libtv-asset-id';
function nodeById(nodeId){ return S.workflow.nodes.find(n=>n.id===nodeId); }
function selectedNode(){ return nodeById(S.selectedNodeId); }
function selectedClip(){ return S.timeline.items.find(i=>i.id===S.selectedClipId); }
function activeReferenceContext(nodeOverride){const preferred=S.activeReference,node=nodeOverride|| (preferred?.nodeId?nodeById(preferred.nodeId):selectedNode()),refs=(node?.data?.presetReferences||[]).map(ref=>normalizeNodeReference(ref)),ref=refs.find(item=>referenceKey(item)===preferred?.key)||refs[0];return node&&ref?{node,ref,key:referenceKey(ref),asset:findAsset(ref.assetId)}:null;}
function renderReferenceRoleMenu(){const context=activeReferenceContext(),button=els.referenceRoleBtn,menu=els.referenceRoleMenu,options=els.referenceRoleOptions;if(!button||!menu||!options)return;button.disabled=!context;button.setAttribute('aria-expanded',String(!menu.classList.contains('hidden')));options.innerHTML=context?Object.entries(SEMANTIC_REFERENCE_ROLES).map(([value,label])=>`<button type="button" class="reference-role-option ${context.ref.semanticRole===value?'active':''}" data-reference-role="${value}">${icon(value==='continuity'?'link':'tag')}<span>${label}</span></button>`).join(''):'<span class="reference-role-empty">先选中节点中的参考素材</span>';}
function setActiveReference(node,key){S.activeReference={nodeId:node.id,key};selectNode(node.id);renderNode(node);renderReferenceRoleMenu();}
function applyReferenceRole(value,nodeId){const context=activeReferenceContext(nodeId?nodeById(nodeId):null);if(!context)return;beginCanvasSnapshot();updateNodeReference(context.node,context.key,{semanticRole:value});scheduleSave();renderNode(context.node);renderInspector();renderReferenceRoleMenu();toast(`参考类型：${SEMANTIC_REFERENCE_ROLES[value]}`);}
function toggleReferenceRoleMenu(){const context=activeReferenceContext();if(!context)return toast('请先点击节点中的参考素材','info');els.referenceRoleMenu.classList.toggle('hidden');renderReferenceRoleMenu();}
function timelinePx(){ return BASE_TIMELINE_PX*S.timelineZoom; }

async function init(){
  try {
    const [modelData,projectData]=await Promise.all([api('/api/models'),api('/api/projects')]);
    S.models=(modelData.models||[]).filter(model=>model.providerId!=='mock'); S.projects=projectData.projects||[];
    if(!S.projects.length){const p=await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'My LibTV Project'})});S.projects=[p];}
    renderProjectSelect(); await openProject(S.projects[0].id); setupGlobalInteractions(); bindAssetFilterChips();
  } catch(e){ console.error(e); toast(`启动失败：${e.message}`,'error'); }
}

function renderProjectSelect(){ els.projectSelect.innerHTML=S.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===S.projectId?'selected':''}>${esc(p.name)}</option>`).join(''); }
async function openProject(projectId){
  stopPreview(); for(const stop of S.jobWatchers.values())stop(); S.jobWatchers.clear(); S.agentController?.abort(); S.agentController=null; S.agentSession=null;
  const hadPendingCanvas = S.saveTimer, hadPendingTimeline = S.timelineSaveTimer;
  clearTimeout(S.saveTimer); clearTimeout(S.timelineSaveTimer);
  if (hadPendingCanvas) await saveWorkflow();
  if (hadPendingTimeline) await saveTimeline();
  S.projectId=projectId; S.selectedNodeId=S.selectedEdgeId=S.selectedClipId=null;S.selectedNodeIds=[]; S.canvasHistory={past:[],future:[]}; S.timelineHistory={past:[],future:[]};
  const [workflow,timeline,assets,jobs]=await Promise.all([api(`/api/projects/${projectId}/workflow`),api(`/api/projects/${projectId}/timeline`),api(`/api/projects/${projectId}/assets`),api(`/api/projects/${projectId}/generations`)]);
  S.workflow={version:2,nodes:workflow.nodes||[],edges:workflow.edges||[]};
  S.timeline={fps:timeline.fps||30,width:timeline.width||1280,height:timeline.height||720,items:timeline.items||[],tracks:timeline.tracks||{}};
  S.assets=assets.assets||[]; S.jobs=jobs.generations||[]; S.playheadFrame=0; S.previewActiveKey='';
  const promptMigrated=migratePromptNodes(),layoutMigrated=migrateGenerationNodeLayout(),referencesMigrated=migrateNodeReferences(),storyboardLayoutMigrated=arrangeAllStoryboardNodes();
  for(const n of S.workflow.nodes.filter(n=>n.type==='videoGen'))n.data.forcedCapability??=inferredVideoCapability(rawNodeReferences(n));
  normalizeTimeline(); renderProjectSelect(); renderAll(); resumeNodeJobs(); if(promptMigrated||layoutMigrated||referencesMigrated||storyboardLayoutMigrated)scheduleSave(); requestAnimationFrame(()=>{if(arrangeAllStoryboardNodes(true)){scheduleSave();renderAll();}}); setTimeout(fitCanvas,0); if(els.agentDrawer&&!els.agentDrawer.classList.contains('hidden-drawer'))loadAgent();
}
function migrateGenerationNodeLayout(){const nodes=S.workflow.nodes.filter(isGenerationNode);if(!nodes.some(n=>n.data.layoutWidth!==GENERATION_NODE_W))return false;const rows=[];for(const n of [...nodes].sort((a,b)=>a.position.y-b.position.y||a.position.x-b.position.x)){let row=rows.find(r=>Math.abs(r.y-n.position.y)<100);if(!row){row={y:n.position.y,nodes:[]};rows.push(row);}row.nodes.push(n);}for(const row of rows){let cursor=-Infinity;for(const n of row.nodes.sort((a,b)=>a.position.x-b.position.x)){n.position.x=Math.max(n.position.x,cursor);cursor=n.position.x+GENERATION_NODE_W+30;n.data.layoutWidth=GENERATION_NODE_W;}}return true;}
function migrateNodeReferences(){let changed=false;for(const n of S.workflow.nodes){const refs=n.data?.presetReferences;if(!Array.isArray(refs))continue;const normalized=refs.map(ref=>normalizeNodeReference(ref));if(JSON.stringify(refs)!==JSON.stringify(normalized)){n.data.presetReferences=normalized;changed=true;}}return changed;}
function migratePromptNodes(){const prompts=S.workflow.nodes.filter(n=>n.type==='prompt');if(!prompts.length)return false;const promptIds=new Set(prompts.map(n=>n.id));for(const prompt of prompts){const text=String(prompt.data?.text||'').trim();if(!text)continue;for(const edge of S.workflow.edges.filter(e=>e.source===prompt.id)){const target=nodeById(edge.target);if(!target||!['textGen','imageGen','videoGen'].includes(target.type))continue;const current=String(target.data?.prompt||'').trim();target.data??={};target.data.prompt=current?`${text}\n\n${current}`:text;}}S.workflow.nodes=S.workflow.nodes.filter(n=>!promptIds.has(n.id));S.workflow.edges=S.workflow.edges.filter(e=>!promptIds.has(e.source)&&!promptIds.has(e.target));if(promptIds.has(S.selectedNodeId))S.selectedNodeId=null;S.selectedNodeIds=S.selectedNodeIds.filter(id=>!promptIds.has(id));return true;}
function normalizeTimeline(){ for(const t of TRACKS) S.timeline.tracks[t]??={muted:false,hidden:false}; for(const i of S.timeline.items){i.playbackRate??=1;i.volume??=1;i.opacity??=1;i.fadeInFrames??=0;i.fadeOutFrames??=0;i.transform??={x:0,y:0,scale:1};} }
function firstModelKey(cap){ const m=S.models.find(x=>x.capabilities?.includes(cap)); return m?`${m.providerId}::${m.modelId}`:''; }
function modelsFor(cap){return S.models.filter(x=>x.capabilities?.includes(cap));}
function modelOptions(cap,selected){const list=modelsFor(cap);return list.length?list.map(m=>{const k=`${m.providerId}::${m.modelId}`,label=String(m.modelId||m.displayName||'').trim();return `<option value="${esc(k)}" ${k===selected?'selected':''}>${esc(label)}${m.configured===false?' (未配置)':''}</option>`}).join(''):'<option value="">无可用模型</option>';}
function modelForKey(key){const [providerId,modelId]=String(key||'').split('::');return S.models.find(m=>m.providerId===providerId&&m.modelId===modelId);}
function normalizedImageParams(n){n.data.params??={};const model=modelForKey(n.data.modelKey),c=model?.constraints||{},aspects=c.aspectRatios?.length?c.aspectRatios:['1:1','16:9','9:16','4:3','3:4'],qualities=c.resolutions?.length?c.resolutions:['1K','2K','4K'],quantities=[1,2,4];if(!aspects.includes(n.data.params.aspectRatio))n.data.params.aspectRatio=aspects.includes('16:9')?'16:9':aspects[0];if(!qualities.includes(n.data.params.quality))n.data.params.quality=qualities.includes('2K')?'2K':qualities[0];if(!quantities.includes(Number(n.data.params.variants)))n.data.params.variants=1;return{aspects,qualities,quantities};}
function referenceRoleControl(n){const context=activeReferenceContext(n),label=context?SEMANTIC_REFERENCE_ROLES[context.ref.semanticRole]||'参考类型':'参考类型',optionsHtml=context?Object.entries(SEMANTIC_REFERENCE_ROLES).map(([value,text])=>`<button type="button" data-reference-role="${value}" class="reference-role-option ${context.ref.semanticRole===value?'active':''}">${icon(value==='continuity'?'link':'tag')}<span>${text}</span></button>`).join(''):'<span class="reference-role-empty">先添加或点击参考图片</span>';return `<details class="generator-reference-role-menu"><summary title="参考类型">${icon('adjustments-horizontal')}<span>${label}</span>${icon('chevron-down')}</summary><div class="generator-reference-role-popover">${optionsHtml}</div></details>`;}
function paramChoice(param,value,selected,label,kind=''){return `<button type="button" class="generator-param-choice ${selected?'active':''}" data-param-choice="${esc(param)}" data-param-value="${esc(value)}"><span>${esc(label)}</span></button>`;}
function generationParamMenu(n){if(n.type==='imageGen'){const p=normalizedImageParams(n),aspect=n.data.params.aspectRatio,quality=n.data.params.quality,variants=Number(n.data.params.variants||1),ratioButtons=p.aspects.map(value=>paramChoice('aspectRatio',value,value===aspect,value,'ratio')).join(''),qualityButtons=p.qualities.map(value=>paramChoice('quality',value,value===quality,value,'quality')).join(''),quantityButtons=p.quantities.map(value=>paramChoice('variants',value,value===variants,`${value}张`,'quantity')).join('');return `<details class="generator-param-menu"><summary title="比例、分辨率、数量">${icon('adjustments-horizontal')}<span>${esc(aspect)} · ${esc(quality)} · ${variants}张</span>${icon('chevron-down')}</summary><div class="generator-param-popover"><div class="param-section"><span>分辨率</span><div class="param-choice-grid quality-grid">${qualityButtons}</div></div><div class="param-section"><span>比例</span><div class="param-choice-grid ratio-grid">${ratioButtons}</div></div><div class="param-section"><span>生成数量</span><div class="param-choice-grid quantity-grid">${quantityButtons}</div></div></div></details>`;}const p=normalizedVideoParams(n),audioLabels={ambient:'环境音',silent:'静音',music:'音乐',voiceover:'口播',full:'完整'},aspect=n.data.params.aspectRatio,duration=n.data.params.duration,resolution=n.data.params.resolution,audio=n.data.params.audioMode;return `<details class="generator-param-menu"><summary title="视频参数">${icon('adjustments-horizontal')}<span>${duration}s · ${esc(aspect)} · ${esc(resolution)}</span>${icon('chevron-down')}</summary><div class="generator-param-popover"><div class="param-section"><span>时长</span><div class="param-choice-grid">${p.durations.map(value=>paramChoice('duration',value,Number(value)===Number(duration),`${value}s`,'duration')).join('')}</div></div><div class="param-section"><span>比例</span><div class="param-choice-grid ratio-grid">${p.aspects.map(value=>paramChoice('aspectRatio',value,value===aspect,value,'ratio')).join('')}</div></div><div class="param-section"><span>分辨率</span><div class="param-choice-grid">${p.resolutions.map(value=>paramChoice('resolution',value,value===resolution,value,'quality')).join('')}</div></div><div class="param-section"><span>声音</span><div class="param-choice-grid">${p.audioModes.map(value=>paramChoice('audioMode',value,value===audio,audioLabels[value]||value,'audio')).join('')}</div></div></div></details>`;}
function imageParamControls(n){return `<div class="field generator-model"><label>模型</label><select data-field="modelKey" aria-label="模型">${modelOptions(imageNodeCapability(n),n.data.modelKey)}</select></div>${generationParamMenu(n)}`;}
function normalizedVideoParams(n){n.data.params??={};const model=modelForKey(n.data.modelKey),c=model?.constraints||{};const durations=c.durations?.length?c.durations:[5,8,10];const aspects=c.aspectRatios?.length?c.aspectRatios:['16:9','9:16'];const resolutions=c.resolutions?.length?c.resolutions:['720p','1080p'];const audioModes=c.audioModes?.length?c.audioModes:['ambient','silent','music','voiceover','full'];if(!durations.map(Number).includes(Number(n.data.params.duration)))n.data.params.duration=Number(durations[0]);if(!aspects.includes(n.data.params.aspectRatio))n.data.params.aspectRatio=aspects[0];if(!resolutions.includes(n.data.params.resolution))n.data.params.resolution=resolutions[0];if(!audioModes.includes(n.data.params.audioMode))n.data.params.audioMode=audioModes[0];const cap=videoNodeCapability(n);if(model?.providerId==='veo'&&(cap!=='video.generate'||['1080p','4k'].includes(String(n.data.params.resolution).toLowerCase())))n.data.params.duration=8;return{durations,aspects,resolutions,audioModes};}
function options(values,selected){return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join('');}
function timelineControl(n){return nodeOutputAssets(n).some(assetId=>findAsset(assetId))?`<button class="generator-timeline" data-action="timelineOutput" title="添加到时间线" aria-label="添加到时间线">${icon('timeline-event-plus')}</button>`:'';}
function videoParamControls(n){return `${generationParamMenu(n)}${referenceRoleControl(n)}${timelineControl(n)}`;}
function renderAll(){renderCanvas();renderEdges();renderAssets();renderTimeline();renderInspector();renderJobs();updateView();renderPreview();updateUndoButtons();}

/* ---------------- Canvas ---------------- */
function generationPreviewSize(n){
  const out=nodeOutputAssets(n).map(findAsset).find(a=>a&&['image','video'].includes(a.kind)),parts=String(n.data.params?.aspectRatio||'16:9').split(':').map(Number);
  const selectedRatio=parts.length===2&&parts.every(value=>value>0),width=selectedRatio?parts[0]:Number(out?.width),height=selectedRatio?parts[1]:Number(out?.height);
  const safeWidth=width>0?width:16,safeHeight=height>0?height:9,scale=GENERATION_PREVIEW_W/Math.max(safeWidth,safeHeight);
  return{width:safeWidth*scale,height:safeHeight*scale};
}
function createNodeElement(n){
    const el=document.createElement('div');
    const extra=n.type==='imageGen'?'node-generation node-image':n.type==='videoGen'?'node-generation node-video':n.type==='textGen'?'node-generation node-textgen':n.type==='upload'?'node-upload':n.type==='asset'?'node-asset':'';
    const expanded=extra&&n.data.expanded===true;
    const busy=['queued','processing'].includes(n.data.status);
    el.className=`node ${extra} ${expanded?'is-expanded':'is-collapsed'} ${busy?'is-busy':''} ${S.selectedNodeIds.includes(n.id)||n.id===S.selectedNodeId?'selected':''}`;
    el.dataset.id=n.id;el.style.left=`${n.position.x}px`;el.style.top=`${n.position.y}px`;
    if(isGenerationNode(n)){const size=generationPreviewSize(n);el.style.setProperty('--preview-width',`${size.width}px`);el.style.setProperty('--preview-height',`${size.height}px`);el.style.setProperty('--preview-port-y',`${32+size.height/2}px`);}
    el.innerHTML=nodeTemplate(n);bindNode(el,n);return el;
}
function renderCanvas(){
  els.canvasWorld.innerHTML='';
  for(const n of S.workflow.nodes)els.canvasWorld.append(createNodeElement(n));
  els.welcomeCards?.classList.toggle('hidden',S.workflow.nodes.length>0);
}
function renderNode(n){const current=els.canvasWorld?.querySelector(`[data-id="${n?.id}"]`);if(!current)return renderCanvas();current.replaceWith(createNodeElement(n));}
const NODE_ACTIONS=[
  {id:'text.storyboard',nodeTypes:['textGen'],label:'分镜脚本',icon:'list-details',capability:'text.generate',preset:'storyboard'},
  {id:'text.video_script',nodeTypes:['textGen'],label:'视频脚本',icon:'movie',capability:'text.generate',preset:'video_script'},
  {id:'text.image_prompt',nodeTypes:['textGen'],label:'图片提示词',icon:'wand',capability:'text.generate',preset:'image_prompt'},
  {id:'text.nine_grid_hook',nodeTypes:['textGen'],label:'强 Hook 九宫格',icon:'layout-grid',capability:'text.generate',preset:'nine_grid_hook'},
  {id:'text.seedance_grid_prompt',nodeTypes:['textGen'],label:'九宫格成片',icon:'video-plus',capability:'text.generate',preset:'seedance_grid_prompt'},
  {id:'text.rewrite',nodeTypes:['textGen'],label:'改写/润色',icon:'text-recognition',capability:'text.generate',preset:'rewrite'},
  {id:'image.generate',nodeTypes:['imageGen'],label:'文生图',icon:'photo-plus',capability:'image.generate',forbidReferenceKinds:['image']},
  {id:'image.edit',nodeTypes:['imageGen'],label:'图生图',icon:'photo-edit',capability:'image.edit',requiredReferenceKinds:['image']},
  {id:'image.region_focus',nodeTypes:['imageGen'],label:'区域聚焦',icon:'focus-2',capability:'image.edit',requiredReferenceKinds:['image']},
  {id:'video.generate',nodeTypes:['videoGen'],label:'文生视频',icon:'video',capability:'video.generate'},
  {id:'video.image_to_video',nodeTypes:['videoGen'],label:'首帧视频',icon:'photo-video',capability:'video.image_to_video'},
  {id:'video.first_last_frame',nodeTypes:['videoGen'],label:'首尾帧视频',icon:'photo-scan',capability:'video.first_last_frame'},
  {id:'video.reference',nodeTypes:['videoGen'],label:'参考视频',icon:'paperclip',capability:'video.reference'},
];
const REFERENCE_ROLE_LABELS={'first-frame':'首帧','last-frame':'尾帧','reference-image':'参考图片','reference-video':'参考视频','reference-audio':'参考音频'};
const SEMANTIC_REFERENCE_ROLES={subject:'主体',style:'风格',composition:'构图',content:'内容',motion:'动作',audio:'声音',continuity:'连续性'};
const SCRIPT_TABLE_HEADER='| 镜号 | 阶段/景别 | 画面描述 | 文案/旁白 | 时长 | 音效/音乐 |';
const VIDEO_SCRIPT_TABLE_HEADER='| 节拍 | 剧情功能 | 剧情内容 | 对白/旁白 | 时长 | 声音意图 |';
const STORYBOARD_TABLE_HEADER='| 镜号 | 阶段/景别 | 图片提示词 | 视频提示词 | 文案/旁白 | 时长 | 音效/音乐 |';
const STORYBOARD_SCHEMA_VERSION='direct-prompts-v3';
const SCRIPT_TABLE_HEADERS=['镜号','阶段/景别','画面描述','文案/旁白','时长','音效/音乐'];
const VIDEO_SCRIPT_TABLE_HEADERS=['节拍','剧情功能','剧情内容','对白/旁白','时长','声音意图'];
const STORYBOARD_TABLE_HEADERS=['镜号','阶段/景别','图片提示词','视频提示词','文案/旁白','时长','音效/音乐'];
const SCRIPT_PRESETS=new Set(['storyboard','video_script','nine_grid_hook','seedance_grid_prompt']);
const DIRECTOR_PLANNING_RULE=`先在内部按导演工作流完成拆解，不要输出分析过程：1）确认题材、受众、平台、画幅、目标时长和上游故事意图；2）锁定上游剧情与节拍顺序，不补写捷径、不改变人物选择和结局；3）建立连续性档案——角色与关系、外形、服化、表演状态，场景方位/时段/天气，道具外形/数量/持有者/状态；4）拆成镜头——每镜只有一个主要叙事目的，写清输入状态→可见动作→结果/承接，保证人物、场景、道具、时间、空间方向、180度轴线和视线连续；5）安排视听语法——景别、焦段、机位、构图、运镜、光色和剪辑点必须服务本镜剧情；6）设计声音——对白/旁白能在镜头时长内说完，环境声、拟音、音乐有明确进出点；7）逐镜自检——无无因状态突变、无重复信息、时长可执行、动作符合真实物理、镜头可生成。禁止堆砌形容词，所有情绪必须落到可见动作、可听声音或可剪辑节拍上。`;
const SCRIPT_TABLE_RULE=`必须按 Markdown 表格输出，固定表头只能是：${SCRIPT_TABLE_HEADER}。每行只写一个镜头；阶段/景别写段落功能、景别和机位；画面描述依次写剧情功能、起始状态、按因果发生的可见动作、结束状态/剪辑承接、场面调度、景别/焦段/机位、运镜、构图、光线/色彩、连续性锚点和真实物理约束；文案/旁白只写实际说出口的内容；时长必须明确到秒；音效/音乐写环境声、拟音、音乐和进出落点；没有内容时填写“—”。表格外不要重复镜头内容。`;
const CINEMATIC_STORY_RULE=`视频脚本是后续分镜的叙事蓝图，不是图片或视频生成提示词，也不是摄影、颜色或风格设定表。质量标准固定，剧情结构自由。先根据题材、时长、平台和创作目标，在内部选择最合适的叙事方式或少量混合：目标行动、悬疑揭示、关系变化、选择困境、预期反转、循环、观察纪实、情绪诗意、群像交叉、一镜实时、广告论证或实验概念；也可以采用更适合输入的新结构。不得默认套用固定的 Hook、触发、升级、最低谷、高潮、余韵顺序，严禁默认套用“受挫、训练、成功”或“童年、多年后、功成名就”的换皮故事。角色驱动的故事须明确人物当下目标、阻力、选择、代价与改变；非传统剧情须明确观察对象、形式规则、信息变化和意义落点。所有节拍必须具有因果、认知、关系、风险或意象上的必要联系，不能用互不影响的“然后”堆事件。关键结果必须有前置建立，时间、年龄、身份和地点变化必须有可信过渡；禁止无铺垫的贵人、没有代价的胜利、仅靠旁白推进和用蒙太奇跳过关键因果。结尾应回答、反转、深化或有意悬置开场提出的问题。`;
const VIDEO_SCRIPT_TABLE_RULE=`最终答案只能输出一个 Markdown 剧情节拍表，不得输出导演圣经、设定表、分析过程、标题、说明或第二张表。固定表头必须逐字等于：${VIDEO_SCRIPT_TABLE_HEADER}。节拍数量和顺序由目标时长、叙事方式和信息密度决定，不设固定阶段或固定行数；每行都必须对整体不可替代，并能在标注时长内完成。剧情功能使用适合本片的具体名称，不得机械套用统一阶段。剧情内容写清本节拍进入状态、发生的变化或阻碍、人物行动或信息推进、直接结果、与前后节拍的因果或意义联系；角色驱动时还要写选择、代价和风险变化，非传统结构不得生硬补造冲突。对白/旁白只写实际说出口且画面无法替代的内容，禁止解释画面；声音意图只写对叙事必要的声音事件，不做完整声音设计；时长明确到秒；没有内容填写“—”。颜色、色值、光线风格、景别、焦段、机位、构图、运镜和生成参数全部留到分镜阶段，除非颜色本身就是用户明确指定的剧情事实。输出前内部自检：表头和列数正确；结构与题材匹配而非套模板；人物或观察对象清楚；节拍之间存在必要联系；关键结果有前置建立；变化有可信过渡；结尾完成预定意义；总时长可执行。`;
const IMAGE_PROMPT_FORMAT=`第[镜头编号]镜，[关键帧类型]。[角色完整描述]，连续性锚点为[角色/服装/道具锚点]。场景位于[场景]，[时间与环境描述]。画面定格在：[关键动作瞬间]。主体位于[位置]，面向[方向]，视线看向[方向]；[其他人物/道具空间关系]。[景别]，[焦段]，[机位]，[构图方式]，[景深]。采用[光线]，整体[色调]，[视觉氛围]，[视觉风格]。真实物理要求：[物理约束]。保持真实人体结构、真实材质、自然光影，禁止肢体畸形、穿模、悬浮、错误道具和不合理空间关系。延续上一镜的角色外貌、服装、道具、场景、人物朝向与空间关系，并保持可与下一镜连续剪接。`;
const VIDEO_PROMPT_FORMAT=`第[镜头编号]镜，时长[秒数]秒。基于本镜首帧生成，严格保持角色身份、脸型、发型、服装、道具、场景、光线与色调一致。剧情功能：[本镜唯一叙事目的]。镜头开始时：[主体位置、姿势、视线、道具与环境状态]。动作过程：[时间段1]完成[动作1]；[时间段2]完成[动作2]；[时间段3]完成[动作3]，动作连续且有明确因果。镜头结束时：[主体位置、姿势、视线、道具状态与动作结果]，结尾保持一拍并可衔接下一镜。主体从[起点]向[方向]移动，面向[方向]，视线看向[方向]；[其他人物/道具运动与空间关系]。[景别]，[焦段]，[机位]；运镜为[单一运镜方式与速度]，[构图方式]，[景深]。采用[光线]，整体[色调]，[视觉氛围]，[视觉风格]，曝光、色温和光线方向稳定。真实物理要求：[人体动力学、重力、惯性、碰撞、材质、衣物、头发与环境约束]。声音：对白/旁白为[内容或无]；环境音为[内容]；拟音为[内容]；音乐为[内容及进出点]。承接上一镜的结束状态，并以明确动作、视线或声音剪辑点衔接下一镜。禁止新增人物、变脸、换装、改变道具和场景结构、瞬移、跳帧、穿模、肢体畸形、无指令切镜、变焦或改变光线。`;
const STORYBOARD_TABLE_RULE=`必须按 Markdown 表格输出，固定表头只能是：${STORYBOARD_TABLE_HEADER}。每行只写一个镜头。图片提示词和视频提示词必须是可直接提交给生成模型的精简中文成品，不要输出分析过程，不得保留任何方括号占位符，不得使用“同上”“保持一致”等缺少具体锚点的省略表达。每条提示词必须独立完整；每镜只允许一个主要叙事目的、一条连续动作链和一种主要运镜，复杂蒙太奇必须拆镜。图片提示词严格按以下固定句序填写：${IMAGE_PROMPT_FORMAT} 图片只描述一个可见关键帧，不得写动作时间轴、运镜过程、对白、旁白、音效或音乐。视频提示词严格按以下固定句序填写：${VIDEO_PROMPT_FORMAT} 视频动作控制在模型可执行范围内，按镜头时长拆成1至3个连续动作，不得在一个镜头中切换时间、地点、人物造型或摄影机位。分镜阶段可以根据剧情设计光线和色彩，但不得强制设置主题色或色值；每项视觉选择都必须服务上游剧情。阶段/景别只写本镜功能、景别和机位；文案/旁白与音效/音乐用于导演审阅，同时必须与视频提示词中的对应内容完全一致；时长明确到秒；没有内容填写“—”。`;
const STORYBOARD_HANDOFF_PROMPT=`这是一个已经确认的视频脚本。请只把上游脚本拆解成可执行的导演级分镜，不改写故事、不新增角色或场景，也不要直接生成图片或视频。先锁定角色、配角、场景、道具、服化、年龄/时间跳跃和首尾呼应，再输出固定 Markdown 镜头表。每个镜头必须有明确时长，时间跳跃必须写“多年后/时间跳跃”，连续性变化必须写清“从什么状态变成什么状态”。总时长必须与上游脚本一致或明确说明调整原因。`;
function textSystemForPreset(p){return ({storyboard:`你是导演、摄影指导、场记和 AI 影像提示词工程师。${DIRECTOR_PLANNING_RULE}严格依据上游视频脚本输出导演级分镜，不改变故事、节拍顺序、人物选择和结局。图片负责“这一帧长什么样”，视频负责“这一镜怎么动”，两者禁止互相复制。生成模型不会记住上一条提示词，因此每镜都必须重复角色、服装、道具、场景和光线的具体连续性锚点；闪回、梦境和时间跳跃必须明确标记。${STORYBOARD_TABLE_RULE}`,video_script:`你是成熟商业电影的原创编剧和故事编辑，不模仿任何在世创作者的个人风格。${CINEMATIC_STORY_RULE}先让内容在人物、因果、变化、铺垫回收和时长上成立，再压缩为可进入分镜拆解的视频脚本。颜色与视觉风格留到分镜阶段，不得用摄影术语掩盖薄弱内容。${VIDEO_SCRIPT_TABLE_RULE}`,image_prompt:`把输入描述扩写为可直接提交图片模型的中文提示词，只描述一个可见关键帧，不改变核心意图。不得写动作过程、运镜、对白、旁白、音效或音乐，不得保留方括号占位符。严格按以下固定句序输出：${IMAGE_PROMPT_FORMAT}`,nine_grid_hook:`你是 TikTok/抖音电商信息流短视频分镜专家。这个预设只生成“3x3 强 Hook 九宫格中文分镜脚本”，不要生成 Seedance 成片提示词，不要输出视频最终提示词，不要混入成片参数。${DIRECTOR_PLANNING_RULE}${SCRIPT_TABLE_RULE}必须共9行；前3镜必须是强 Hook，有停滑点、痛点放大、反差或结果前置，并且第3镜前必须出现产品或解决方案；中间3镜展示核心卖点和使用场景；最后3镜完成信任背书和转化收束。表格前只保留一行统一视觉基调，表格后只询问用户是否确认。`,seedance_grid_prompt:`你是 Seedance 2.0/C端2.0 视频提示词工程师。这个预设只生成“九宫格成片 Seedance 最终视频提示词”，不要重新生成九宫格分镜脚本，也不要重新设计分镜或混入强 Hook 分镜内容。基于用户提供的九宫格脚本、9段图片提示词或上游文本，整理成可直接用于 Seedance 的最终视频生成提示词。${SCRIPT_TABLE_RULE}必须完整覆盖9镜，按从上到下、从左到右顺序填写具体时间码、景别/运镜、主体动作、卖点表达、场景、构图、光线、声音设计、产品一致性和真实物理约束。禁止字幕和画面文字，除非用户明确要求。`,rewrite:'保持原意，提升表达、结构和可执行性。'})[p]||'根据用户输入生成高质量文本。';}
function defaultSemanticRole(ref,asset){if(ref.role==='first-frame'||ref.role==='last-frame')return'continuity';if(asset?.kind==='video')return'motion';if(asset?.kind==='audio')return'audio';return'subject';}
function normalizeNodeReference(ref={},fallback={}){const merged={...fallback,...ref},timelineRange=merged.timelineRange||(merged.timelineItemId&&Number(merged.sourceOutFrame)>Number(merged.sourceInFrame)?{startFrame:Number(merged.sourceInFrame),endFrame:Number(merged.sourceOutFrame)}:undefined),source=merged.source||(merged.timelineItemId?'timeline':merged.sourceNodeId?'node':'asset'),asset=findAsset(merged.assetId),normalized={...merged,source,semanticRole:merged.semanticRole||defaultSemanticRole(merged,asset),label:merged.label||asset?.filename||''};if(timelineRange)normalized.timelineRange={startFrame:Number(timelineRange.startFrame),endFrame:Number(timelineRange.endFrame)};if(merged.region){const x=Math.max(0,Math.min(1,Number(merged.region.x)||0)),y=Math.max(0,Math.min(1,Number(merged.region.y)||0)),width=Math.max(.01,Math.min(1-x,Number(merged.region.width)||1-x)),height=Math.max(.01,Math.min(1-y,Number(merged.region.height)||1-y));normalized.region={x,y,width,height};}return normalized;}
function referenceKey(ref){return ref.referenceId||`${ref.assetId}:${ref.role}:${ref.sourceNodeId||ref.timelineItemId||ref.source||''}`;}
function referenceSourceLabel(ref){const range=ref.timelineRange,source=ref.source==='node'?`节点${ref.sourceNodeId?` · ${ref.sourceNodeId.slice(0,6)}`:''}`:ref.source==='timeline'?`时间线${range?` · ${range.startFrame}–${range.endFrame}f`:''}`:'素材库',region=ref.region?` · 区域 ${Math.round(ref.region.x*100)},${Math.round(ref.region.y*100)} ${Math.round(ref.region.width*100)}×${Math.round(ref.region.height*100)}%`:'';return source+region;}
function semanticRoleOptions(current){return Object.entries(SEMANTIC_REFERENCE_ROLES).map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('');}
function nodeActionsFor(n){return NODE_ACTIONS.filter(action=>action.nodeTypes.includes(n.type));}
function nodeActionEnabled(n,action){const kinds=new Set([...rawNodeReferences(n).map(ref=>findAsset(ref.assetId)?.kind).filter(Boolean),...pendingReferenceKinds(n)]),currentCapability=n.type==='videoGen'?videoNodeCapability(n):n.type==='imageGen'?imageNodeCapability(n):action.capability;if(action.capability&&action.capability!==currentCapability&&!modelsFor(action.capability).length)return false;return !(action.requiredReferenceKinds||[]).some(kind=>!kinds.has(kind))&&!(action.forbidReferenceKinds||[]).some(kind=>kinds.has(kind));}
function currentNodeActionId(n){const actions=nodeActionsFor(n),saved=actions.find(action=>action.id===n.data.actionId&&nodeActionEnabled(n,action));if(saved)return saved.id;if(n.type==='textGen')return `text.${n.data.preset||'storyboard'}`;if(n.type==='imageGen')return rawNodeReferences(n).some(ref=>ref.region)?'image.region_focus':imageNodeCapability(n);if(n.type==='videoGen')return videoNodeCapability(n);return actions[0]?.id||'';}
function nodeActionMenu(n){const actions=nodeActionsFor(n),current=currentNodeActionId(n),active=actions.find(action=>action.id===current)||actions[0];return `<details class="generator-mode-menu node-action-menu"><summary>${icon(active?.icon||'wand')}<span>${esc(active?.label||'动作')}</span>${icon('chevron-down')}</summary><div class="generator-mode-popover">${actions.map(action=>`<button data-action="nodeAction" data-node-action="${action.id}" class="${current===action.id?'active':''}" ${nodeActionEnabled(n,action)?'':'disabled'}>${icon(action.icon)}<span>${esc(action.label)}</span></button>`).join('')}</div></details>`;}
function applyNodeAction(n,actionId){const action=nodeActionsFor(n).find(item=>item.id===actionId);if(!action)return;if(!nodeActionEnabled(n,action))return toast('该动作需要先添加匹配的参考素材','error');beginCanvasSnapshot();n.data.actionId=action.id;n.data.error='';n.data.status='idle';if(action.preset)n.data.preset=action.preset;if(n.type==='videoGen'){n.data.forcedCapability=action.capability;ensureNodeModelForCapability(n,action.capability);normalizedVideoParams(n);}if(n.type==='imageGen'){if(action.id==='image.region_focus'){const target=(n.data.presetReferences||[]).find(ref=>findAsset(ref.assetId)?.kind==='image');if(target&&!target.region)target.region={x:.25,y:.25,width:.5,height:.5};}ensureNodeModelForCapability(n,action.capability);normalizedImageParams(n);}scheduleSave();renderNode(n);renderInspector();}
function generationPlaceholder(iconName,tips){return `<div class="generator-empty"><div class="generator-empty-icon">${icon(iconName)}</div><div class="generator-suggestions"><span>尝试：</span>${tips.map(([name,label])=>`<strong>${icon(name)}${esc(label)}</strong>`).join('')}</div></div>`;}
function phaseLabel(phase) {
  return ({ preparing: '准备中', generating: '生成中', downloading: '下载中', finalizing: '收尾中', rate_limited: '限流等待', provider_busy: '视频服务繁忙' })[phase] || '';
}
function isRetryWaitPhase(phase){return ['rate_limited','provider_busy'].includes(phase);}
function retryWaitLabel(phase){return phase==='provider_busy'?'视频服务繁忙，自动重试':'限流等待';}
function nodeStatusBadge(n){const s=n.data.status||'idle',p=Number(n.data.progress||0),ph=n.data.phase;if(s==='queued')return `<span class="node-status-badge run">${isRetryWaitPhase(ph)?retryWaitLabel(ph):'排队中'}</span>`;if(s==='processing'||s==='running')return `<span class="node-status-badge run">${ph?`${phaseLabel(ph)} `:`生成中 `}${p}%</span>`;if(s==='failed')return `<span class="node-status-badge failed">失败</span>`;if(s==='canceled')return `<span class="node-status-badge canceled">已取消</span>`;return '';}
function generationHeader(n,iconName,label,chip=''){const expanded=n.data.expanded===true,toggleLabel=expanded?'收起输入区':'展开输入区',out=nodeOutputAssets(n).map(findAsset).find(a=>a&&['image','video'].includes(a.kind)),preview=out?.kind==='image'?`<button data-action="openMediaOutput" title="放大图片" aria-label="放大图片">${icon('arrows-maximize')}</button>`:'',download=out?`<button data-action="downloadOutput" title="下载${out.kind==='video'?'视频':'图片'}" aria-label="下载${out.kind==='video'?'视频':'图片'}">${icon('download')}</button>`:'';return `<div class="node-header"><div class="node-title">${icon(iconName)}<strong>${esc(label)}</strong>${chip}</div>${nodeStatusBadge(n)}<div class="node-header-actions">${preview}${download}<button class="composer-toggle" data-action="toggleComposer" title="${toggleLabel}" aria-label="${toggleLabel}" aria-expanded="${expanded}" aria-controls="composer-${n.id}">${icon(expanded?'chevron-up':'chevron-down')}</button><button data-action="delete" title="删除" aria-label="删除">${icon('x')}</button></div></div>`;}
function referenceRoleOptions(asset, current){
  const kinds = asset?.kind === 'video' ? ['reference-video'] : asset?.kind === 'audio' ? ['reference-audio'] : ['first-frame','last-frame','reference-image'];
  return kinds.map(r=>`<option value="${r}" ${r===current?'selected':''}>${esc(REFERENCE_ROLE_LABELS[r]||r)}</option>`).join('');
}
function referenceRegionEditor(ref,isPreset){if(!isPreset||!ref.region)return'';const key=referenceKey(ref),fields=[['x','X'],['y','Y'],['width','W'],['height','H']];return `<div class="node-ref-region" data-ref-region="${esc(key)}">${fields.map(([field,label])=>`<label>${label}<input type="number" min="0" max="100" step="1" data-region-field="${field}" value="${Math.round(Number(ref.region[field]||0)*100)}"></label>`).join('')}</div>`;}
function nodeReferenceChips(n){
  const refs = rawNodeReferences(n);
  if (!refs.length) return '';
  return `<div class="node-refs">${refs.map(r=>{
    const a=findAsset(r.assetId); if(!a) return '';
    const key=referenceKey(r),isPreset=(n.data.presetReferences||[]).some(x=>referenceKey(normalizeNodeReference(x))===key);
    const thumb=a.kind==='image'?`<img src="${esc(a.publicUrl)}" alt="">`:`<span class="node-ref-kind">${a.kind==='video'?'VID':'AUD'}</span>`;
    const remove=isPreset||r.sourceEdgeId?`<button data-ref-remove="${esc(key)}" title="移除参考" aria-label="移除参考">${icon('x')}</button>`:'';
    return `<div class="node-ref ${S.activeReference?.key===key&&S.activeReference?.nodeId===n.id?'active':''}" data-ref-select="${esc(key)}" data-asset="${esc(a.id)}" title="点击选择参考">${thumb}${remove}</div>`;
  }).join('')}</div>`;
}
function referenceAddButton(n){
  const tip=n.type==='videoGen'?'添加图片 / 视频 / 音频参考（按角色自动匹配）':'添加图片参考（自动切换为图生图）';
  return `<button class="node-ref-add" data-action="refAdd" title="${tip}" aria-label="添加参考素材">${icon('plus')}<span>参考</span></button>`;
}
function variantFilmstrip(n){
  const ids=n.data.variantAssetIds||[];
  if(ids.length<2)return '';
  const selected=(n.data.outputAssetIds||[])[0];
  return `<div class="node-variant-strip">${ids.map(id=>{const a=findAsset(id);if(!a)return'';return `<button class="node-variant ${id===selected?'active':''}" data-action="variant" data-variant="${esc(id)}" title="${id===selected?'当前选用':'点击选用此变体'}">${a.kind==='image'?`<img src="${esc(a.publicUrl)}" alt="变体">`:'VID'}</button>`;}).join('')}</div>`;
}
function generationResultActions(n){
  if(n.type==='textGen'&&n.data.outputText)return `<div class="generation-result-actions"><button data-action="openTextOutput" title="完整查看脚本" aria-label="完整查看脚本">${icon('arrows-maximize')}<span>查看</span></button><button data-action="copyOutput" title="复制文本结果" aria-label="复制文本结果">${icon('copy')}<span>复制</span></button></div>`;
  return '';
}
async function copyTextValue(value,success='已复制文本结果'){
  if(!value)return;
  try{await navigator.clipboard.writeText(value);toast(success);}
  catch{const input=document.createElement('textarea');input.value=value;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();toast(copied?success:'复制失败，请手动选择文本',copied?'info':'error');}
}
async function copyNodeOutput(n){return copyTextValue(nodeOutputText(n));}
function textOutputTitle(n){return ({nine_grid_hook:'强 Hook 九宫格脚本',seedance_grid_prompt:'九宫格成片',storyboard:'分镜脚本',video_script:'视频脚本',image_prompt:'图片提示词',rewrite:'文本结果'})[n?.data?.preset]||'脚本全文';}
function splitMarkdownRow(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell=>cell.replace(/\\\|/g,'|').trim());}
function isMarkdownSeparator(line){return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);}
function markdownInline(value){return esc(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');}
function parseMarkdownTable(text){
  const lines=String(text||'').split(/\r?\n/);
  for(let start=0;start<lines.length;start++){
    if(!lines[start].includes('|')||!isMarkdownSeparator(lines[start+1]||''))continue;
    const headers=splitMarkdownRow(lines[start]),rows=[];let end=start+2;
    while(end<lines.length&&lines[end].includes('|')&&!isMarkdownSeparator(lines[end])){const cells=splitMarkdownRow(lines[end]);if(cells.length>1)rows.push(cells);end++;}
    if(headers.length&&rows.length)return {lines,start,end,headers,rows};
  }
  return null;
}
function cleanScriptLine(line){return String(line||'').trim().replace(/^#{1,6}\s*/,'').replace(/^\*\*(.*?)\*\*$/,'$1').trim();}
function parseScriptSceneHeading(line){
  const value=cleanScriptLine(line);let match=value.match(/^【\s*第?\s*(\d+)\s*(?:格|镜|镜头)?\s*[|｜]\s*([^】]+)】\s*(.*)$/);
  if(match)return {number:match[1],duration:match[2].trim()||'—',stage:match[3].trim()||'—'};
  match=value.match(/^(?:第\s*)?(?:镜头|镜|格)\s*(\d+)\s*(?:[：:|｜-]\s*)?(.*)$/);if(!match)match=value.match(/^(\d+)[.、]\s*(.*)$/);if(!match)return null;
  const timing=match[2].match(/(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}|\d+(?:\.\d+)?\s*s)/i),stage=match[2].replace(timing?.[0]||'','').replace(/^[\s\[\(【:：-]+|[\s\]\)】]+$/g,'').trim();
  return {number:match[1],duration:timing?.[1]||'—',stage:stage||'—'};
}
function splitScriptSceneBody(lines){
  const body=lines.map(cleanScriptLine).filter(line=>line&&line!=='---').join(' ').replace(/\*\*/g,'').trim(),fields={visual:'',copy:'',audio:''},markers=[...body.matchAll(/(文案\/旁白|文案|旁白|对白|台词|声音|音效|音乐|产品一致性|真实物理约束|真实物理|物理约束)\s*[:：]/g)];
  fields.visual=(markers.length?body.slice(0,markers[0].index):body).trim();
  markers.forEach((marker,index)=>{const content=body.slice(marker.index+marker[0].length,markers[index+1]?.index??body.length).trim(),label=marker[1];if(/文案|旁白|对白|台词/.test(label))fields.copy=[fields.copy,content].filter(Boolean).join('；');else if(/声音|音效|音乐/.test(label))fields.audio=[fields.audio,content].filter(Boolean).join('；');else fields.visual=[fields.visual,`${label}：${content}`].filter(Boolean).join('；');});
  return [fields.visual||'—',fields.copy||'—',fields.audio||'—'];
}
function parseLegacyScript(text){
  const lines=String(text||'').split(/\r?\n/),scenes=[];
  lines.forEach((line,index)=>{const heading=parseScriptSceneHeading(line);if(heading)scenes.push({index,...heading});});
  if(!scenes.length)return null;
  let end=lines.length;
  const rows=scenes.map((scene,index)=>{const next=scenes[index+1]?.index??lines.length,separator=lines.findIndex((line,lineIndex)=>lineIndex>scene.index&&lineIndex<next&&line.trim()==='---'),bodyEnd=separator>=0?separator:next;if(index===scenes.length-1)end=separator>=0?separator+1:bodyEnd;const [visual,copy,audio]=splitScriptSceneBody(lines.slice(scene.index+1,bodyEnd));return [scene.number,scene.stage,visual,copy,scene.duration,audio];});
  return {lines,start:scenes[0].index,end,headers:SCRIPT_TABLE_HEADERS,rows,legacy:true};
}
function structuredTableHeaders(preset){if(preset==='storyboard')return STORYBOARD_TABLE_HEADERS;if(preset==='video_script')return VIDEO_SCRIPT_TABLE_HEADERS;if(SCRIPT_PRESETS.has(preset))return SCRIPT_TABLE_HEADERS;return null;}
function parseStructuredScript(text,preset){
  const parsed=parseMarkdownTable(text),expected=structuredTableHeaders(preset);
  if(parsed){if(expected&&(!parsed.headers.every((header,index)=>header===expected[index])||parsed.headers.length!==expected.length))return null;return parsed;}
  return SCRIPT_PRESETS.has(preset)?parseLegacyScript(text):null;
}
function renderMarkdownTables(text,editable=false,preset=''){
  const parsed=parseStructuredScript(text,preset);if(!parsed)return '';
  const editAttr=editable?' contenteditable="true" spellcheck="false"':'';
  return `<table class="script-table"><thead><tr>${parsed.headers.map(h=>`<th>${markdownInline(h)}</th>`).join('')}</tr></thead><tbody>${parsed.rows.map(row=>`<tr>${parsed.headers.map((_,idx)=>`<td${editAttr}>${markdownInline(row[idx]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function durationSeconds(value){const text=String(value||''),range=text.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);if(range)return Math.max(0,(Number(range[3])*60+Number(range[4]))-(Number(range[1])*60+Number(range[2])));return Number.parseFloat(text)||0;}
function scriptFingerprint(value){let hash=2166136261;for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return String(hash>>>0);}
function textOutputDuration(parsed){if(!parsed)return 0;const idx=parsed.headers.findIndex(header=>header.includes('时长'));if(idx<0)return 0;return parsed.rows.reduce((sum,row)=>sum+durationSeconds(row[idx]),0);}
const SCRIPT_ENTITY_TERMS={characters:['女孩','男孩','女人','男人','老人','孩子','教练','父亲','母亲','队友','主角','配角','裁判','观众'],scenes:['农村','土球场','田埂','体育馆','篮球场','球场','足球场','体育场','赛场','戈壁','荒漠','土屋','石墙','教室','房间','街道','窗边','厨房','办公室','公园','海边','车内','屋顶'],props:['篮球','足球','破旧足球','篮筐','石墙球门','煤油灯','邀请信','信件','电视','世界杯','球衣','球鞋','创可贴','手机','背包','钥匙','奖杯','书包','雨伞','汽车','自行车','麦克风']};
function analyzeScriptContinuity(parsed){
  if(!parsed?.rows?.length)return null;
  const indexOf=label=>parsed.headers.findIndex(header=>header.includes(label)),firstIndex=(...labels)=>labels.map(indexOf).find(index=>index>=0)??-1,shotIndex=firstIndex('镜号','节拍'),stageIndex=firstIndex('阶段','剧情功能'),visualIndex=firstIndex('画面','剧情内容'),imagePromptIndex=indexOf('图片提示词'),videoPromptIndex=indexOf('视频提示词'),durationIndex=indexOf('时长'),directPrompts=imagePromptIndex>=0||videoPromptIndex>=0;
  const shots=parsed.rows.map((row,index)=>{const imagePrompt=String(row[imagePromptIndex]||'').trim(),videoPrompt=String(row[videoPromptIndex]||'').trim(),visual=String(row[visualIndex]||imagePrompt||videoPrompt||'').trim(),stage=String(row[stageIndex]||'').trim(),duration=String(row[durationIndex]||'').trim(),text=row.map(value=>String(value||'')).join(' ');return {index,shot:String(row[shotIndex]||index+1).trim()||String(index+1),stage,visual,imagePrompt,videoPrompt,duration,durationSec:durationSeconds(duration),entities:Object.fromEntries(Object.entries(SCRIPT_ENTITY_TERMS).map(([kind,terms])=>[kind,terms.filter(term=>text.includes(term))]))};});
  const countTerms=kind=>SCRIPT_ENTITY_TERMS[kind].map(term=>({term,count:shots.filter(shot=>shot.entities[kind].includes(term)).length})).filter(item=>item.count);
  const recurring=Object.fromEntries(Object.keys(SCRIPT_ENTITY_TERMS).map(kind=>[kind,countTerms(kind).filter(item=>item.count>1)])),isolated=Object.fromEntries(Object.keys(SCRIPT_ENTITY_TERMS).map(kind=>[kind,countTerms(kind).filter(item=>item.count===1)])),issues=[];
  const seenShots=new Set();shots.forEach(shot=>{if(seenShots.has(shot.shot))issues.push({level:'error',text:`镜号 ${shot.shot} 重复`});seenShots.add(shot.shot);if(!shot.visual||shot.visual==='—')issues.push({level:'error',text:`镜 ${shot.shot} 缺少画面动作`});if(directPrompts&&(!shot.imagePrompt||shot.imagePrompt==='—'))issues.push({level:'error',text:`镜 ${shot.shot} 缺少图片直跑提示词`});if(directPrompts&&(!shot.videoPrompt||shot.videoPrompt==='—'))issues.push({level:'error',text:`镜 ${shot.shot} 缺少视频直跑提示词`});if(shot.imagePrompt&&/(?:旁白|对白|环境音|拟音|音乐|运镜速度|\d+\s*[-–]\s*\d+\s*秒)/.test(shot.imagePrompt))issues.push({level:'warn',text:`镜 ${shot.shot} 图片提示词混入了视频专属内容`});if(shot.videoPrompt&&!/(?:起始状态|开始时)/.test(shot.videoPrompt))issues.push({level:'warn',text:`镜 ${shot.shot} 视频提示词缺少起始状态`});if(shot.videoPrompt&&!/(?:结束状态|结尾)/.test(shot.videoPrompt))issues.push({level:'warn',text:`镜 ${shot.shot} 视频提示词缺少结束状态`});if(!shot.stage||shot.stage==='—')issues.push({level:'warn',text:`镜 ${shot.shot} 缺少景别或机位`});if(!shot.duration||shot.duration==='—')issues.push({level:'error',text:`镜 ${shot.shot} 缺少明确时长`});else if(!shot.durationSec)issues.push({level:'error',text:`镜 ${shot.shot} 时长无法解析`});});
  const totalDurationSec=shots.reduce((sum,shot)=>sum+shot.durationSec,0);
  if(!totalDurationSec)issues.push({level:'error',text:'分镜没有可执行的总时长'});
  return {shots,recurring,isolated,issues,totalDurationSec,directPrompts,hasBlockingIssues:issues.some(issue=>issue.level==='error')};
}
function continuityPrompt(report,index){const shot=report?.shots?.[index],previous=report?.shots?.[index-1],next=report?.shots?.[index+1];if(!shot)return '';const current=Object.entries(shot.entities).filter(([,items])=>items.length).map(([kind,items])=>`${kind==='characters'?'角色':kind==='scenes'?'场景':'道具'}：${items.join('、')}`).join('；'),persistent=Object.entries(report.recurring||{}).filter(([,items])=>items.length).map(([kind,items])=>`${kind==='characters'?'角色':kind==='scenes'?'场景':'道具'}：${items.map(item=>item.term).join('、')}`).join('；');return [`连续性锚点：${current||'保持主体、空间和道具与前后镜头一致'}`,persistent&&`全片贯穿元素：${persistent}`,previous&&`承接第${previous.shot}镜，延续其角色、场景、道具和动作状态`,next&&`为第${next.shot}镜预留承接：保持方向、视线和状态可剪接`].filter(Boolean).join('。');}
function cleanDirectPrompt(value){return String(value||'').replace(/\s+/g,' ').replace(/。\s*。+/g,'。').replace(/；\s*；+/g,'；').trim();}
function buildImageDirectPrompt({shot,stage,raw,visual,continuity}){const base=cleanDirectPrompt(raw||visual).replace(/(?:运镜(?:速度)?|旁白|对白|环境音|拟音|音效|音乐)[：:][^。；]*(?:[。；]|$)/g,'').trim(),parts=[];if(!base.includes(`第${shot}镜`))parts.push(`第${shot}镜，首帧关键帧`);if(stage&&stage!=='—'&&!base.includes(stage))parts.push(stage);parts.push(base||`第${shot}镜的可见关键瞬间`);if(!/(?:连续性|承接第)/.test(base))parts.push(`连续性：${continuity}`);if(!/(?:画质|电影级|写实|高细节)/.test(base))parts.push('电影级写实质感，真实人物比例与材质，自然光影，主体清晰，空间关系准确，禁止肢体畸形、穿模、悬浮和错误道具');return cleanDirectPrompt(parts.filter(Boolean).join('。'));}
function buildVideoDirectPrompt({shot,seconds,stage,raw,visual,copy,audio,continuity}){let base=cleanDirectPrompt(raw||visual).replace(/输入状态[：:]/g,'起始状态：').replace(/(?:主体与可见动作|可见动作)[：:]/g,'动作过程：').replace(/(?:动作结果\/承接|动作结果)[：:]/g,'结束状态：'),parts=[];if(!base.includes(`第${shot}镜`))parts.push(`第${shot}镜，时长${seconds}秒`);else if(!/(?:时长|\d+秒)/.test(base))parts.push(`时长${seconds}秒`);if(!/(?:基于.*首帧|首帧生成)/.test(base))parts.push('基于本镜首帧生成，严格保持人物身份、脸型、发型、服装、道具、场景、光线和色调一致');if(stage&&stage!=='—'&&!base.includes(stage))parts.push(stage);parts.push(base||`动作过程：0-${seconds}秒完成本镜动作，结尾保持自然可剪接状态`);if(!/(?:\d+\s*[-–]\s*\d+\s*秒)/.test(base))parts.push(`动作节奏：0-${seconds}秒按上述因果顺序连续完成，结尾保持一拍`);if(copy&&copy!=='—'&&!base.includes(copy))parts.push(`旁白/对白：${copy}`);if(audio&&audio!=='—'&&!/(?:环境音|拟音|音乐|声音)/.test(base))parts.push(`声音：${audio}`);if(!/(?:连续性|承接第)/.test(base))parts.push(`连续性：${continuity}`);if(!/(?:禁止新增|禁止人物|禁止改变)/.test(base))parts.push('禁止新增人物、改变人物外貌服装和道具、改变场景结构、瞬移、穿模、肢体畸形、错误物理运动、无指令切镜变焦或改变光线');return cleanDirectPrompt(parts.filter(Boolean).join('。'));}
function continuityEntityText(items){return items?.length?items.map(item=>`${esc(item.term)} <small>${item.count}镜</small>`).join('、'):'—';}
function renderContinuityReport(report){if(!report)return '';const groups=[['characters','角色'],['scenes','场景'],['props','道具']],errors=report.issues.filter(issue=>issue.level==='error').length,warns=report.issues.filter(issue=>issue.level==='warn').length,status=errors?'需修正':warns?'需要确认':'通过';return `<section class="continuity-report"><div class="continuity-report-head"><div><strong>剧情连续性</strong><small>${report.shots.length} 个镜头 · 总时长 ${report.totalDurationSec||0}s · ${status}</small></div><span class="continuity-status ${errors?'error':warns?'warn':'ok'}">${status}</span></div><div class="continuity-grid">${groups.map(([kind,label])=>`<div class="continuity-card"><b>${label}</b><p>${continuityEntityText(report.recurring[kind])}</p>${report.isolated[kind]?.length?`<small class="continuity-muted">单镜出现：${report.isolated[kind].map(item=>esc(item.term)).join('、')}</small>`:''}</div>`).join('')}</div>${report.issues.length?`<div class="continuity-issues">${report.issues.map(issue=>`<div class="continuity-issue ${issue.level}">${icon(issue.level==='error'?'alert-triangle':'info-circle')}${esc(issue.text)}</div>`).join('')}</div>`:''}<p class="continuity-footnote">连续性锚点会自动写入后续图片与视频节点提示词；修正红色问题后才能建立镜头节点。</p></section>`;}
function toggleContinuityReport(){const page=els.textOutputModal?.querySelector('.text-output-page');if(!page)return;const show=page.classList.toggle('show-continuity');if(els.textOutputContinuityBtn){els.textOutputContinuityBtn.setAttribute('aria-pressed',String(show));els.textOutputContinuityBtn.innerHTML=`${icon('timeline-event-plus')}<span>${show?'隐藏连续性':'连续性'}</span>`;}}
function storyboardNodeHeight(node,measure=false){const el=measure?els.canvasWorld?.querySelector(`[data-id="${node.id}"]`):null;return el?.offsetHeight|| (node.data?.expanded?510:190);}
function arrangeStoryboardNodes(nodes,measure=false){
  const groups=new Map(),storyboardNodes=nodes.filter(node=>node.data?.storyboardShot!=null&&['imageGen','videoGen'].includes(node.type));if(!storyboardNodes.length)return false;
  storyboardNodes.forEach(node=>{const key=String(node.data.storyboardShot);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);});
  const ordered=[...groups.entries()].sort((a,b)=>(Number.parseInt(a[0],10)||999)-(Number.parseInt(b[0],10)||999));
  const baseX=Math.min(...storyboardNodes.map(node=>node.position.x)),baseY=Math.min(...storyboardNodes.map(node=>node.position.y));let changed=false,cursor=baseY;
  ordered.forEach(([,pair])=>{const image=pair.find(node=>node.type==='imageGen'),video=pair.find(node=>node.type==='videoGen'),y=Math.round(cursor/10)*10;if(image&&(image.position.x!==baseX||image.position.y!==y)){image.position={x:baseX,y};changed=true;}if(video&&(video.position.x!==baseX+560||video.position.y!==y)){video.position={x:baseX+560,y};changed=true;}cursor=y+Math.max(...pair.map(node=>storyboardNodeHeight(node,measure)))+56;});
  return changed;
}
function arrangeAllStoryboardNodes(measure=false){const sourceIds=new Set(S.workflow.nodes.map(node=>node.data?.storyboardSourceId).filter(Boolean));let changed=false;sourceIds.forEach(sourceId=>{changed=arrangeStoryboardNodes(S.workflow.nodes.filter(node=>node.data?.storyboardSourceId===sourceId),measure)||changed;});return changed;}
function settleStoryboardLayout(sourceId){requestAnimationFrame(()=>{const nodes=S.workflow.nodes.filter(node=>node.data?.storyboardSourceId===sourceId);if(arrangeStoryboardNodes(nodes,true)){scheduleSave();renderAll();}});}
function createStoryboardScriptFromVideoScript(){
  const source=nodeById(S.textOutputNodeId);if(!source||source.data?.preset!=='video_script')return createStoryboardFromScript();
  const sourceHash=scriptFingerprint(`${STORYBOARD_SCHEMA_VERSION}:${source.data.outputText||''}`),existing=nodeById(source.data.storyboardScriptNodeId);if(existing){if(existing.data?.sourceScriptHash!==sourceHash){existing.data.outputText='';existing.data.status='idle';existing.data.error='';existing.data.sourceScriptHash=sourceHash;scheduleSave();renderNode(existing);closeTextOutputPage();toast('检测到脚本或提示词标准已更新，正在重新生成分镜脚本');void generateNode(existing.id).then(result=>{if(result?.ok)openTextOutputPage(existing);});return existing;}if(existing.data?.outputText)openTextOutputPage(existing);else{selectNode(existing.id);closeTextOutputPage();revealNode(existing);toast('已定位分镜脚本节点，请先运行生成','info');}return existing;}
  const position={x:source.position.x+nodeWidth(source)+70,y:source.position.y};
  const storyboard=addTextGen('storyboard',{prompt:STORYBOARD_HANDOFF_PROMPT,sourceScriptNodeId:source.id,sourceScriptPreset:'video_script',sourceScriptHash:sourceHash,workflowStage:'storyboard',status:'idle'},nodePositionOccupied(position.x,position.y)?undefined:position);
  S.workflow.edges.push({id:id(),source:source.id,target:storyboard.id,role:'script'});source.data.storyboardScriptNodeId=storyboard.id;scheduleSave();renderCanvas();renderEdges();renderInspector();closeTextOutputPage();toast('已建立视频脚本 → 分镜脚本流程，开始生成分镜脚本');
  void generateNode(storyboard.id).then(result=>{if(result?.ok)openTextOutputPage(storyboard);});
  return storyboard;
}
function createStoryboardFromScript(){
  const source=nodeById(S.textOutputNodeId);if(source?.data?.preset==='video_script')return createStoryboardScriptFromVideoScript();
  const value=els.textOutputEditor?.value||'',parsed=parseStructuredScript(value,source?.data?.preset||'');
  if(!source||!parsed?.rows.length)return toast('当前文本不是可执行分镜表格','error');
  const continuity=analyzeScriptContinuity(parsed);source.data.continuity=continuity;source.data.storyboardValidation={...continuity,validatedAt:new Date().toISOString()};
  if(continuity?.hasBlockingIssues){scheduleSave();refreshTextOutputTable();return toast('分镜脚本还有必须修正的问题，请先处理连续性报告中的红色提示','error');}
  const sourceHash=scriptFingerprint(`${STORYBOARD_SCHEMA_VERSION}:${value}`),existing=(source.data.storyboardNodeIds||[]).map(nodeById).filter(Boolean);
  if(existing.length&&source.data.storyboardSourceHash===sourceHash){const changed=arrangeStoryboardNodes(existing);if(changed)scheduleSave();S.selectedNodeId=existing[0].id;S.selectedNodeIds=[existing[0].id];closeTextOutputPage();renderAll();settleStoryboardLayout(source.id);requestAnimationFrame(()=>fitNodes(existing));return toast(`已定位 ${existing.length/2} 个分镜`,'info');}
  if(existing.length)existing.forEach(node=>{node.data.storyboardStatus='superseded';});
  const indexOf=label=>parsed.headers.findIndex(header=>header.includes(label)),shotIndex=indexOf('镜号'),stageIndex=indexOf('阶段'),visualIndex=indexOf('画面'),imagePromptIndex=indexOf('图片提示词'),videoPromptIndex=indexOf('视频提示词'),copyIndex=indexOf('文案'),durationIndex=indexOf('时长'),audioIndex=indexOf('音效'),cell=(row,index)=>index>=0?row[index]:'',storyboardAspect=source.data.aspectRatio||source.data.params?.aspectRatio||'9:16',base=findOpenNodePosition(),nodes=[],edges=[];
  beginCanvasSnapshot();
  parsed.rows.forEach((row,index)=>{
    const shotContinuity=continuityPrompt(continuity,index),shotState=continuity.shots[index],shotEntities=Object.values(shotState.entities).flat();
    const shot=String(cell(row,shotIndex)||index+1).trim()||String(index+1),stage=String(cell(row,stageIndex)).trim(),visual=String(cell(row,visualIndex)).trim(),imagePrompt=String(cell(row,imagePromptIndex)).trim(),videoPrompt=String(cell(row,videoPromptIndex)).trim(),copy=String(cell(row,copyIndex)).trim(),audio=String(cell(row,audioIndex)).trim(),seconds=Math.max(1,Math.round(shotState.durationSec)),rowIndex=index,position={x:Math.round(base.x/10)*10,y:Math.round((base.y+rowIndex*420)/10)*10},visualPrompt=buildImageDirectPrompt({shot,stage,raw:imagePrompt,visual,continuity:shotContinuity}),motionPrompt=buildVideoDirectPrompt({shot,seconds,stage,raw:videoPrompt,visual,copy,audio,continuity:shotContinuity});
    const common={storyboardShot:shot,storyboardShotIndex:index,storyboardDurationSec:seconds,storyboardStage:stage,storyboardSourceId:source.id,storyboardSourceScriptId:source.data.sourceScriptNodeId||source.id,storyboardSourcePreset:source.data.preset,continuityEntities:shotEntities,continuityShot:shotState,storyboardStatus:'approved'};
    const image={id:id(),type:'imageGen',position,data:{modelKey:firstModelKey('image.generate'),prompt:visualPrompt,status:'idle',progress:0,params:{aspectRatio:storyboardAspect,quality:'2K',variants:1},expanded:false,workflowStage:'storyboard-keyframe',...common,layoutWidth:GENERATION_NODE_W}};
    const video={id:id(),type:'videoGen',position:{x:position.x+560,y:position.y},data:{modelKey:firstModelKey('video.image_to_video')||firstModelKey('video.generate'),prompt:motionPrompt,status:'idle',progress:0,params:{duration:seconds,aspectRatio:storyboardAspect,resolution:'720p'},expanded:false,workflowStage:'storyboard-video',forcedCapability:'video.image_to_video',actionId:'video.image_to_video',...common,layoutWidth:GENERATION_NODE_W}};
    nodes.push(image,video);edges.push({id:id(),source:source.id,target:image.id,role:'storyboard-shot'},{id:id(),source:image.id,target:video.id,role:'first-frame'});
  });
  S.workflow.nodes.push(...nodes);S.workflow.edges.push(...edges);source.data.storyboardStatus='approved';source.data.storyboardSourceHash=sourceHash;source.data.storyboardNodeIds=nodes.map(node=>node.id);source.data.storyboardNodePairs=continuity.shots.map((shot,index)=>({shot:String(shot.shot),imageNodeId:nodes[index*2]?.id,videoNodeId:nodes[index*2+1]?.id,durationSec:shot.durationSec}));source.data.storyboardCreatedAt=new Date().toISOString();S.selectedNodeId=nodes[0]?.id||null;S.selectedNodeIds=nodes[0]?[nodes[0].id]:[];S.selectedEdgeId=null;scheduleSave();closeTextOutputPage();renderAll();settleStoryboardLayout(source.id);requestAnimationFrame(()=>fitNodes(nodes));toast(`已建立 ${parsed.rows.length} 个分镜：先确认图片，再生成视频`);
}
function refreshTextOutputTable(){
  if(!els.textOutputTable)return;
  const page=els.textOutputModal?.querySelector('.text-output-page'),value=els.textOutputEditor?.value||'',preset=nodeById(S.textOutputNodeId)?.data?.preset||'',parsed=parseStructuredScript(value,preset),editing=page?.classList.contains('is-editing');
  const continuity=analyzeScriptContinuity(parsed);els.textOutputTable.innerHTML=parsed?`${renderContinuityReport(continuity)}${renderMarkdownTables(value,editing,preset)}`:'';
  page?.classList.toggle('has-table',Boolean(parsed));
  const source=nodeById(S.textOutputNodeId),isVideoScript=source?.data?.preset==='video_script',storyboardScript=nodeById(source?.data?.storyboardScriptNodeId),hasStoryboard=Boolean(source?.data?.storyboardNodeIds?.some(id=>nodeById(id)));if(els.textOutputStoryboardBtn){els.textOutputStoryboardBtn.classList.toggle('hidden',!parsed);const label=isVideoScript?(storyboardScript?.data?.outputText?'查看分镜脚本':'生成分镜脚本'):(hasStoryboard?'查看分镜节点':'生成分镜节点');els.textOutputStoryboardBtn.innerHTML=`${icon('layout-grid')}<span>${label}</span>`;els.textOutputStoryboardBtn.setAttribute('aria-label',label);}
  if(els.textOutputMeta)els.textOutputMeta.textContent=parsed?`${parsed.rows.length} 个${preset==='video_script'?'剧情节拍':'镜头'}${textOutputDuration(parsed)?` · 总时长约 ${textOutputDuration(parsed)} 秒`:''}`:(SCRIPT_PRESETS.has(preset)&&value.trim()?'脚本结构不完整，请重新生成或编辑为标准镜头表':'完整查看和修改文本生成结果');
}
function setTextOutputEditing(editing){
  const page=els.textOutputModal?.querySelector('.text-output-page');page?.classList.toggle('is-editing',editing);els.textOutputEditor.readOnly=!editing;
  els.textOutputSaveBtn?.classList.toggle('hidden',!editing);
  if(els.textOutputEditBtn){els.textOutputEditBtn.innerHTML=editing?`${icon('x')}<span>取消</span>`:`${icon('edit')}<span>编辑</span>`;els.textOutputEditBtn.setAttribute('aria-label',editing?'取消编辑':'编辑脚本');}
  refreshTextOutputTable();
  if(editing)requestAnimationFrame(()=>page?.classList.contains('has-table')?els.textOutputTable?.querySelector('tbody td')?.focus():els.textOutputEditor?.focus());
}
function markdownTableLine(cells){return `| ${cells.map(cell=>String(cell||'').replace(/\s*\r?\n\s*/g,' ').replace(/\|/g,'\\|').trim()).join(' | ')} |`;}
function textOutputDraftValue(){
  const value=els.textOutputEditor?.value||'',preset=nodeById(S.textOutputNodeId)?.data?.preset||'',parsed=parseStructuredScript(value,preset),page=els.textOutputModal?.querySelector('.text-output-page');
  if(!parsed||!page?.classList.contains('has-table')||!page.classList.contains('is-editing'))return value;
  const rows=$$('tbody tr',els.textOutputTable).map(row=>$$('td',row).map(cell=>cell.textContent));
  const tableLines=[markdownTableLine(parsed.headers),markdownTableLine(parsed.headers.map(()=>'---')),...rows.map(markdownTableLine)];
  return [...parsed.lines.slice(0,parsed.start),...tableLines,...parsed.lines.slice(parsed.end)].join('\n');
}
function syncTextOutputNode(value){const n=nodeById(S.textOutputNodeId);if(!n)return;n.data.outputText=value;const preview=els.canvasWorld.querySelector(`[data-id="${n.id}"] .generator-text-result`);if(preview&&preview!==els.textOutputEditor)preview.value=value;scheduleSave();renderInspector();}
function saveTextOutputEdits(){const value=textOutputDraftValue();els.textOutputEditor.value=value;syncTextOutputNode(value);S.textOutputOriginal=value;setTextOutputEditing(false);refreshTextOutputTable();toast('脚本已保存');}
function toggleTextOutputEditing(){const page=els.textOutputModal?.querySelector('.text-output-page');if(page?.classList.contains('is-editing')){els.textOutputEditor.value=S.textOutputOriginal;setTextOutputEditing(false);return;}S.textOutputOriginal=els.textOutputEditor.value;setTextOutputEditing(true);}
function openTextOutputPage(n){if(!n?.data?.outputText)return;textOutputReturnFocus=document.activeElement;S.textOutputNodeId=n.id;S.textOutputOriginal=n.data.outputText;els.textOutputTitle.textContent=textOutputTitle(n);els.textOutputEditor.value=n.data.outputText;els.textOutputModal.classList.remove('hidden');setTextOutputEditing(false);requestAnimationFrame(()=>els.textOutputEditBtn?.focus());}
function closeTextOutputPage(){els.textOutputEditor.value=S.textOutputOriginal;S.textOutputNodeId=null;S.textOutputOriginal='';els.textOutputModal?.classList.add('hidden');els.textOutputModal?.querySelector('.text-output-page')?.classList.remove('is-editing');textOutputReturnFocus?.focus?.();textOutputReturnFocus=null;}
function downloadNodeOutput(n){const out=nodeOutputAssets(n).map(findAsset).find(Boolean);if(!out)return;const link=document.createElement('a');link.href=out.publicUrl;link.download=out.filename||'';document.body.append(link);link.click();link.remove();}
function inferReferenceRole(n,asset){
  if(n.type==='imageGen')return 'reference-image';
  const cap=videoNodeCapability(n);
  if(cap==='video.first_last_frame'){const hasFirst=collectNodeReferences(n).some(r=>r.role==='first-frame');return hasFirst?'last-frame':'first-frame';}
  if(asset.kind==='image')return 'first-frame';
  if(asset.kind==='video')return 'reference-video';
  return 'reference-audio';
}
function pickReferenceAsset(nodeId,asset){
  const n=nodeById(nodeId);if(!n)return;
  beginCanvasSnapshot();
  const role=inferReferenceRole(n,asset);
  n.data.presetReferences=[...(n.data.presetReferences||[])].filter(r=>!(r.assetId===asset.id&&r.role===role));
  n.data.presetReferences.push(normalizeNodeReference({referenceId:id(),assetId:asset.id,role,source:'asset',label:asset.filename}));
  if(n.type==='imageGen')ensureNodeModelForCapability(n,imageNodeCapability(n));
  if(n.type==='videoGen')normalizedVideoParams(n);
  scheduleSave();renderNode(n);renderInspector();renderReferenceRoleMenu();
  toast(`已添加参考：${asset.filename}`);
}
function updateNodeReference(n,key,patch){n.data.presetReferences=(n.data.presetReferences||[]).map(ref=>referenceKey(normalizeNodeReference(ref))===key?normalizeNodeReference({...ref,...patch}):ref);}
function removeNodeReference(n,key){
  if(!(n.data.presetReferences||[]).some(r=>referenceKey(normalizeNodeReference(r))===key))return;
  beginCanvasSnapshot();
  n.data.presetReferences=(n.data.presetReferences||[]).filter(r=>referenceKey(normalizeNodeReference(r))!==key);
  if(S.activeReference?.nodeId===n.id&&S.activeReference?.key===key)S.activeReference=null;
  scheduleSave();renderNode(n);renderInspector();renderReferenceRoleMenu();
}
function removeReference(n,key){const preset=(n.data.presetReferences||[]).some(r=>referenceKey(normalizeNodeReference(r))===key);if(preset)return removeNodeReference(n,key);const ref=rawNodeReferences(n).find(item=>referenceKey(item)===key),edge=ref?.sourceEdgeId?S.workflow.edges.find(item=>item.id===ref.sourceEdgeId):null;if(!edge)return;beginCanvasSnapshot();S.workflow.edges=S.workflow.edges.filter(item=>item.id!==edge.id);if(n.type==='imageGen')syncImageTargetCapability(n);if(S.activeReference?.nodeId===n.id&&S.activeReference?.key===key)S.activeReference=null;scheduleSave();renderNode(n);renderEdges();renderInspector();renderReferenceRoleMenu();}
function selectVariant(n,assetId){
  if((n.data.outputAssetIds||[])[0]===assetId)return;
  beginCanvasSnapshot();
  n.data.selectedVariantIndex=(n.data.variantAssetIds||[]).indexOf(assetId);
  n.data.outputAssetIds=[assetId];
  scheduleSave();renderNode(n);renderEdges();
}
function nodeTemplate(n){
  const input=['textGen','imageGen','videoGen'].includes(n.type)?'<span class="handle in" data-handle="in" title="输入"></span>':'';
  const output=['prompt','textGen','asset','imageGen','videoGen'].includes(n.type)||(n.type==='upload'&&n.data.assetId)?'<span class="handle out" data-handle="out" title="拖动连接"></span>':'';
  const close=`<button data-action="delete" title="删除" aria-label="删除">${icon('x')}</button>`;
  if(n.type==='textGen'){
    n.data.preset??='storyboard';
    const hasOutput=!!n.data.outputText;
    const preview=hasOutput?`<textarea class="generator-text-result" data-field="outputText" aria-label="文本结果">${esc(n.data.outputText)}</textarea>`:generationPlaceholder('file-text',[['file-text','分镜脚本'],['bulb','提示词扩写']]);
    const previewToggle=hasOutput?'':' data-action="toggleComposer" title="展开 / 收起输入区"';
    return `${input}${output}${generationHeader(n,'file-text','文本')}<div class="node-body"><section class="generator-preview generator-text-preview"${previewToggle}>${preview}</section>${generationResultActions(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${nodeActionMenu(n)}</div><textarea class="generator-prompt" data-field="prompt" placeholder="描述希望生成的文本内容，留空则读取上游文本">${esc(n.data.prompt||'')}</textarea><div class="generator-controls"><div class="generator-settings"><div class="field generator-model"><label>模型</label><select data-field="modelKey" aria-label="模型">${modelOptions('text.generate',n.data.modelKey)}</select></div></div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='imageGen'){
    n.data.params??={aspectRatio:'16:9',quality:'2K'};ensureNodeModelForCapability(n,imageNodeCapability(n));
    const out=nodeOutputAssets(n).map(findAsset).find(a=>a?.kind==='image');
    const preview=out?`<img class="node-media" src="${esc(out.publicUrl)}" alt="生成图片">`:generationPlaceholder('photo-plus',[['upload','图生图'],['badge-hd','图片高清']]);
    return `${input}${output}${generationHeader(n,'photo-plus','图片',n.data.storyboardShot?`<span class="node-preset-chip">镜${esc(n.data.storyboardShot)}</span>`:'')}<div class="node-body"><section class="generator-preview" data-action="toggleComposer" title="展开 / 收起输入区">${preview}</section>${generationResultActions(n)}${variantFilmstrip(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${referenceAddButton(n)}${nodeActionMenu(n)}</div>${nodeReferenceChips(n)}<textarea class="generator-prompt" data-field="prompt" placeholder="${imageNodeCapability(n)==='image.edit'?'描述需要修改的内容，保留主体一致性':'描述希望生成的画面内容，@引用素材'}">${esc(n.data.prompt||'')}</textarea><div class="generator-controls"><div class="generator-settings">${imageParamControls(n)}</div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='videoGen'){
    const cap=videoNodeCapability(n);ensureNodeModelForCapability(n,cap);const out=nodeOutputAssets(n).map(findAsset).find(a=>a?.kind==='video');
    const preview=out?`<video class="node-media node-media-video" src="${esc(out.publicUrl)}" controls controlslist="nodownload noremoteplayback" disablepictureinpicture playsinline preload="metadata"></video>`:generationPlaceholder('video',[['video','文生视频'],['photo-video','首帧视频']]);
    return `${input}${output}${generationHeader(n,'video','视频',n.data.storyboardShot?`<span class="node-preset-chip">镜${esc(n.data.storyboardShot)}</span>`:'')}<div class="node-body"><section class="generator-preview" data-action="toggleComposer" title="展开 / 收起输入区">${preview}</section>${generationResultActions(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${referenceAddButton(n)}${nodeActionMenu(n)}</div>${nodeReferenceChips(n)}<textarea class="generator-prompt" data-field="prompt" placeholder="描述镜头、动作、运镜和音效，@引用素材">${esc(n.data.prompt||'')}</textarea>${videoReferencePanel(n,cap)}<div class="generator-controls"><div class="generator-settings"><div class="field generator-model"><label>模型</label><select data-field="modelKey" aria-label="模型">${modelOptions(cap,n.data.modelKey)}</select></div>${videoParamControls(n)}</div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='upload'){
    const a=findAsset(n.data.assetId),uploading=n.data.status==='uploading';
    const preview=a?(a.kind==='image'?`<img class="node-media" src="${esc(a.publicUrl)}" alt="上传图片">`:a.kind==='video'?`<video class="node-media node-media-video" src="${esc(a.publicUrl)}" muted playsinline preload="metadata"></video>`:`<span class="upload-node-audio">${icon('volume')}</span>`):'';
    const body=a?`<button class="upload-node-preview" data-action="chooseUpload" title="替换文件" aria-label="替换文件">${preview}</button>`:`<button class="upload-node-dropzone" data-action="chooseUpload" ${uploading?'disabled':''}>${icon(uploading?'loader-2':'upload')}<strong>${uploading?'上传中':'选择或拖放文件'}</strong></button>`;
    return `${output}<div class="node-header"><div class="node-title">${icon('upload')}<strong>上传</strong></div><div class="node-header-actions">${close}</div></div><div class="node-body">${body}${n.data.error?`<div class="asset-meta error-text">${esc(n.data.error)}</div>`:''}</div>`;
  }
  if(n.type==='asset'){
    const a=findAsset(n.data.assetId);if(!a)return `${output}<div class="node-header"><div class="node-title">素材已丢失</div>${close}</div>`;
    const media=a.kind==='image'?`<img class="node-media" src="${esc(a.publicUrl)}" alt="图片素材">`:a.kind==='video'?`<video class="node-media node-media-video" src="${esc(a.publicUrl)}" muted playsinline preload="metadata"></video>`:`<div class="node-media-empty">${icon('volume')}</div>`;
    const assetIcon=a.kind==='video'?'video':a.kind==='image'?'photo':'volume';
    const assetLabel=a.kind==='video'?'视频':a.kind==='image'?'图片':'音频';
    return `${output}<div class="node-header"><div class="node-title">${icon(assetIcon)}<strong>${assetLabel}</strong></div>${close}</div><div class="node-body">${media}</div>`;
  }
  return '<div class="node-header">Unknown node</div>';
}
function generationFooter(n){const p=Number(n.data.progress||0),state=n.data.status||'idle',ph=n.data.phase,busy=['queued','processing'].includes(state),label=state==='failed'?'重试':['succeeded','canceled'].includes(state)?'重新生成':'生成',waiting=isRetryWaitPhase(ph),seconds=waiting&&n.data.nextAttemptAt?Math.max(0,Math.ceil((Date.parse(n.data.nextAttemptAt)-Date.now())/1000)):0,statusLabel=state==='queued'?(waiting?`${retryWaitLabel(ph)}${seconds?` · ${seconds}s`:''}`:`排队中 · ${p}%`):`${ph?phaseLabel(ph):'生成中'} · ${p}%`;return `<div class="node-actions generation-actions">${busy?`<button class="generator-cancel" data-action="cancelGeneration" title="取消任务" aria-label="取消任务">${icon('square-x')}<span>取消</span></button>`:`<button class="primary generator-submit" data-action="generate" title="${label}" aria-label="${label}">${icon('arrow-up')}<span>${label}</span></button>`}</div>${busy?`<div class="generation-progress" aria-live="polite"><div class="progressbar" role="progressbar" aria-label="${statusLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div><span class="status ${esc(state)}">${statusLabel}</span></div>`:''}${n.data.error?`<div class="asset-meta error-text">${esc(friendlyError(n.data.error))}</div>`:''}`;}
function updateComposerStateDom(el,n){const expanded=n.data.expanded===true,label=expanded?'收起输入区':'展开输入区',toggle=$('[data-action="toggleComposer"]',el);el.classList.toggle('is-expanded',expanded);el.classList.toggle('is-collapsed',!expanded);if(toggle){toggle.title=label;toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-expanded',String(expanded));toggle.innerHTML=icon(expanded?'chevron-up':'chevron-down');}}
function bindNode(el,n){
  if(['queued','processing'].includes(n.data.status)){ $$('textarea,select,input',el).forEach(control=>control.disabled=true); $$('.generator-mode-menu summary,.node-advanced summary,.generator-param-menu summary,.generator-param-choice',el).forEach(control=>{control.setAttribute('aria-disabled','true');control.addEventListener('click',e=>e.preventDefault());}); }
  const header=$('.node-header',el); header?.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;if(S.tool==='connect')return;e.preventDefault();e.stopPropagation();beginCanvasSnapshot();if(!S.selectedNodeIds.includes(n.id))selectNode(n.id,{render:false});const items=S.workflow.nodes.filter(node=>S.selectedNodeIds.includes(node.id)).map(node=>({node,el:els.canvasWorld.querySelector(`[data-id="${node.id}"]`),startPos:{...node.position}}));header.setPointerCapture?.(e.pointerId);S.interaction={type:'node-drag',pointerId:e.pointerId,items,startX:e.clientX,startY:e.clientY,moved:false};items.forEach(item=>item.el?.classList.add('dragging'));renderEdges();renderInspector();});
  $$('.handle',el).forEach(h=>h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(h.dataset.handle==='out')startConnectionDrag(e,n,h);}));
  // 节点上右键无操作（菜单已统一移植到画布空白处右键）
  el.addEventListener('click',e=>{e.stopPropagation();if(S.interaction)return;const action=e.target.closest('[data-action]')?.dataset.action;if(action==='delete')return deleteNode(n.id);if(action==='chooseUpload')return chooseUploadFiles(n.id);if(action==='toggleComposer'){if(isGenerationNode(n)){n.data.expanded=!n.data.expanded;scheduleSave();updateComposerStateDom(el,n);if(n.data.storyboardSourceId)settleStoryboardLayout(n.data.storyboardSourceId);}return;}if(action==='generate')return generateNode(n.id);if(action==='cancelGeneration')return cancelNodeGeneration(n);if(action==='openTextOutput')return openTextOutputPage(n);if(action==='copyOutput')return copyNodeOutput(n);if(action==='openMediaOutput')return openMediaLightbox(nodeOutputAssets(n).map(findAsset).find(a=>a?.kind==='image'));if(action==='downloadOutput')return downloadNodeOutput(n);if(action==='timelineOutput')return addAssetToTimeline(nodeOutputAssets(n)[0]);if(action==='nodeAction')return applyNodeAction(n,e.target.closest('[data-node-action]').dataset.nodeAction);if(action==='refAdd'){S.assetPick={nodeId:n.id};showDrawer('assetDrawer');toast('点击素材库中的素材，添加为节点参考');return;}if(action==='refRemove'){const key=e.target.closest('[data-ref-remove]')?.dataset.refRemove;if(key)removeReference(n,key);return;}if(action==='variant'){const aid=e.target.closest('[data-variant]')?.dataset.variant;if(aid)selectVariant(n,aid);return;}selectNode(n.id);});
  if(n.type==='upload'){
    el.addEventListener('dragover',e=>{if(!hasDraggedFiles(e))return;e.preventDefault();e.stopPropagation();el.classList.add('file-drag-active');});
    el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('file-drag-active');});
    el.addEventListener('drop',e=>{if(!hasDraggedFiles(e))return;e.preventDefault();e.stopPropagation();el.classList.remove('file-drag-active');uploadFiles([...e.dataTransfer.files],{targetNodeId:n.id});});
    const refreshEdges=()=>requestAnimationFrame(renderEdges);
    $$('img.node-media',el).forEach(media=>{media.addEventListener('load',refreshEdges,{once:true});if(media.complete)refreshEdges();});
    $$('video.node-media',el).forEach(media=>media.addEventListener('loadedmetadata',refreshEdges,{once:true}));
  }
  $$('.generator-text-result,.generator-prompt',el).forEach(textarea=>textarea.addEventListener('wheel',e=>e.stopPropagation(),{passive:true}));
  if(n.type!=='upload')$$('video,audio',el).forEach(media=>['pointerdown','click','dblclick'].forEach(type=>media.addEventListener(type,e=>e.stopPropagation())));
  $$('[data-ref-select]',el).forEach(ref=>{ref.addEventListener('pointerdown',e=>e.stopPropagation());ref.addEventListener('click',e=>{e.stopPropagation();setActiveReference(n,ref.dataset.refSelect);});});
  $$('[data-ref-remove]',el).forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();removeReference(n,button.dataset.refRemove);}));
  $$('.generator-param-popover',el).forEach(popover=>{popover.addEventListener('pointerdown',e=>e.stopPropagation());popover.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});});
  $$('[data-reference-role]',el).forEach(option=>option.addEventListener('click',e=>{e.stopPropagation();applyReferenceRole(option.dataset.referenceRole,n.id);const menu=option.closest('details');if(menu)menu.open=false;}));
  $$('[data-ref-role]',el).forEach(sel=>sel.addEventListener('change',()=>{beginCanvasSnapshot();updateNodeReference(n,sel.dataset.refRole,{role:sel.value});scheduleSave();renderNode(n);renderInspector();}));
  $$('[data-ref-region] input',el).forEach(control=>control.addEventListener('change',()=>{const editor=control.closest('[data-ref-region]'),values=Object.fromEntries($$('[data-region-field]',editor).map(input=>[input.dataset.regionField,Number(input.value)/100]));beginCanvasSnapshot();updateNodeReference(n,editor.dataset.refRegion,{region:values});scheduleSave();renderNode(n);renderInspector();}));
  $$('[data-field]',el).forEach(control=>{control.addEventListener('pointerdown',e=>e.stopPropagation());const evt=control.tagName==='SELECT'?'change':'input';control.addEventListener(evt,()=>{n.data[control.dataset.field]=control.value;if(control.tagName==='SELECT')control.blur();if(control.dataset.field==='modelKey'&&['videoGen','imageGen'].includes(n.type)){if(n.type==='videoGen')normalizedVideoParams(n);else normalizedImageParams(n);scheduleSave();renderNode(n);renderInspector();return;}scheduleSave();renderInspector();});});
  $$('[data-param]',el).forEach(control=>{const k=control.dataset.param,defaults={duration:5,resolution:'720p',aspectRatio:'16:9',quality:'2K',temperature:0.7,seed:'',negativePrompt:'',variants:1};control.value=String(n.data.params?.[k]??defaults[k]??'');control.addEventListener('pointerdown',e=>e.stopPropagation());control.addEventListener('change',()=>{const numeric=['duration','temperature','seed','variants'].includes(k);const value=numeric?(control.value===''?'':Number(control.value)):control.value;n.data.params={...(n.data.params||{}),[k]:value};if(control.tagName==='SELECT')control.blur();if(n.type==='videoGen'&&['duration','resolution','aspectRatio'].includes(k))normalizedVideoParams(n);scheduleSave();if(n.type==='videoGen')renderNode(n);});});
  $$('[data-param-choice]',el).forEach(control=>control.addEventListener('click',e=>{e.stopPropagation();const k=control.dataset.paramChoice,value=['duration','variants'].includes(k)?Number(control.dataset.paramValue):control.dataset.paramValue;n.data.params={...(n.data.params||{}),[k]:value};if(n.type==='imageGen')normalizedImageParams(n);if(n.type==='videoGen')normalizedVideoParams(n);scheduleSave();renderNode(n);}));
}
function updateCanvasSelectionDom(){ $$('.node',els.canvasWorld).forEach(el=>el.classList.toggle('selected',S.selectedNodeIds.includes(el.dataset.id))); }
function selectNode(nodeId,{render=true}={}){S.selectedNodeId=nodeId;S.selectedNodeIds=nodeId?[nodeId]:[];if(S.activeReference?.nodeId!==nodeId)S.activeReference=null;S.selectedEdgeId=null;S.selectedClipId=null;if(render)updateCanvasSelectionDom();renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();}
function selectEdge(edgeId){S.selectedEdgeId=edgeId;S.selectedNodeId=null;S.selectedNodeIds=[];S.selectedClipId=null;updateCanvasSelectionDom();renderEdges();renderInspector();}
function beginCanvasSnapshot(){S.canvasHistory.past.push(clone(S.workflow));if(S.canvasHistory.past.length>60)S.canvasHistory.past.shift();S.canvasHistory.future=[];updateUndoButtons();}
function canvasUndo(){const prev=S.canvasHistory.past.pop();if(!prev)return;S.canvasHistory.future.push(clone(S.workflow));S.workflow=prev;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleSave();renderCanvas();renderEdges();renderInspector();updateUndoButtons();}
function canvasRedo(){const next=S.canvasHistory.future.pop();if(!next)return;S.canvasHistory.past.push(clone(S.workflow));S.workflow=next;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleSave();renderCanvas();renderEdges();renderInspector();updateUndoButtons();}
function deleteNode(nodeId){const n=nodeById(nodeId);if(n?.data?.jobId)S.jobWatchers.get(n.data.jobId)?.();beginCanvasSnapshot();S.workflow.nodes=S.workflow.nodes.filter(n=>n.id!==nodeId);S.workflow.edges=S.workflow.edges.filter(e=>e.source!==nodeId&&e.target!==nodeId);S.selectedNodeIds=S.selectedNodeIds.filter(id=>id!==nodeId);if(S.selectedNodeId===nodeId)S.selectedNodeId=S.selectedNodeIds[0]||null;scheduleSave();renderCanvas();renderEdges();renderInspector();}
function deleteSelectedNodes(){const ids=new Set(S.selectedNodeIds);if(!ids.size)return;if(ids.size===1)return deleteNode([...ids][0]);beginCanvasSnapshot();for(const node of S.workflow.nodes)if(ids.has(node.id)&&node.data?.jobId)S.jobWatchers.get(node.data.jobId)?.();S.workflow.nodes=S.workflow.nodes.filter(node=>!ids.has(node.id));S.workflow.edges=S.workflow.edges.filter(edge=>!ids.has(edge.source)&&!ids.has(edge.target));S.selectedNodeIds=[];S.selectedNodeId=null;scheduleSave();renderCanvas();renderEdges();renderInspector();}
function deleteSelectedEdge(){if(!S.selectedEdgeId)return;const edge=S.workflow.edges.find(e=>e.id===S.selectedEdgeId),target=edge?nodeById(edge.target):null;beginCanvasSnapshot();S.workflow.edges=S.workflow.edges.filter(e=>e.id!==S.selectedEdgeId);if(target?.type==='imageGen')syncImageTargetCapability(target);S.selectedEdgeId=null;scheduleSave();renderEdges();renderCanvas();renderInspector();}
function clearConnectionTargets(){$$('.node.connection-target',els.canvasWorld).forEach(el=>el.classList.remove('connection-target'));}
function startConnectionDrag(e,node,handle){beginCanvasSnapshot();selectNode(node.id,{render:false});clearConnectionTargets();S.interaction={type:'connect',pointerId:e.pointerId,sourceId:node.id,x:e.clientX,y:e.clientY};handle.setPointerCapture?.(e.pointerId);els.connectionToast.textContent='拖到目标节点左侧输入端口';els.connectionToast.classList.remove('hidden');renderEdges();}
function finishConnection(clientX,clientY){const it=S.interaction;if(!it||it.type!=='connect')return;const hit=document.elementFromPoint(clientX,clientY),targetNode=hit?.closest?.('.node'),targetId=targetNode?.dataset.id;S.interaction=null;els.connectionToast.classList.add('hidden');clearConnectionTargets();if(targetId&&targetId!==it.sourceId)createEdge(it.sourceId,targetId);else{S.canvasHistory.past.pop();updateUndoButtons();showNodeMenu(clientX,clientY,screenToWorld(clientX,clientY),{sourceId:it.sourceId});}renderEdges();}
function connectionOutputKind(n){if(!n)return null;if(n.type==='imageGen')return'image';if(n.type==='videoGen')return'video';if(['asset','upload'].includes(n.type))return findAsset(n.data.assetId)?.kind||null;return nodeOutputText(n)?'text':null;}
function syncImageTargetCapability(targetNode){if(targetNode?.type!=='imageGen')return;const cap=imageNodeCapability(targetNode);targetNode.data.actionId=cap==='image.edit'?'image.edit':'image.generate';targetNode.data.error='';ensureNodeModelForCapability(targetNode,cap);}
function syncTargetCapabilityForConnection(sourceNode,targetNode){const kind=connectionOutputKind(sourceNode);if(targetNode.type==='imageGen'){if(kind==='image'){targetNode.data.actionId='image.edit';targetNode.data.error='';ensureNodeModelForCapability(targetNode,'image.edit');}else syncImageTargetCapability(targetNode);return;}if(targetNode.type!=='videoGen')return;const current=videoNodeCapability(targetNode);let next=current;if(kind==='image'){const imageInputs=S.workflow.edges.filter(e=>e.target===targetNode.id).map(e=>nodeById(e.source)).filter(n=>connectionOutputKind(n)==='image').length;if(current==='video.generate')next='video.image_to_video';else if(current==='video.image_to_video'&&imageInputs)next='video.first_last_frame';}else if(['video','audio'].includes(kind))next='video.reference';if(next!==current){targetNode.data.forcedCapability=next;targetNode.data.actionId=next;ensureNodeModelForCapability(targetNode,next);normalizedVideoParams(targetNode);}}
function createEdge(source,target){if(source===target)return toast('不能连接节点自身','error');const s=nodeById(source),t=nodeById(target);if(!s||!t)return;if(!['textGen','imageGen','videoGen'].includes(t.type))return toast('目标节点不接受输入','error');if(t.type==='textGen'&&!['prompt','textGen'].includes(s.type))return toast('文本生成节点只接受文本输入','error');if(S.workflow.edges.some(e=>e.source===source&&e.target===target)){S.canvasHistory.past.pop();updateUndoButtons();return toast('这两个节点已经连接','error');}if(wouldCreateCycle(source,target)){S.canvasHistory.past.pop();updateUndoButtons();return toast('此连接会形成循环','error');}syncTargetCapabilityForConnection(s,t);S.workflow.edges.push({id:id(),source,target,role:defaultEdgeRole(s,t)});scheduleSave();renderCanvas();renderEdges();renderInspector();}
function wouldCreateCycle(source,target){const adj=new Map();for(const e of S.workflow.edges){if(!adj.has(e.source))adj.set(e.source,[]);adj.get(e.source).push(e.target);}const seen=new Set();function reachesSource(n){if(n===source)return true;if(seen.has(n))return false;seen.add(n);return (adj.get(n)||[]).some(reachesSource);}return reachesSource(target);}
function defaultEdgeRole(sourceNode,targetNode){if(targetNode.type==='imageGen'){const a=nodeOutputAssets(sourceNode).map(findAsset).find(Boolean);return a?.kind==='image'?'reference-image':undefined;}if(targetNode.type!=='videoGen')return undefined;const assets=nodeOutputAssets(sourceNode).map(findAsset).filter(Boolean);const kind=assets[0]?.kind;if(kind==='image'){const imageEdges=S.workflow.edges.filter(e=>e.target===targetNode.id).filter(e=>nodeOutputAssets(nodeById(e.source)).some(aid=>findAsset(aid)?.kind==='image'));if(targetNode.data.forcedCapability==='video.first_last_frame')return imageEdges.length?'last-frame':'first-frame';if(targetNode.data.forcedCapability==='video.reference')return 'reference-image';return imageEdges.length?'reference-image':'first-frame';}if(kind==='video')return 'reference-video';if(kind==='audio')return 'reference-audio';return undefined;}
function portWorld(node,kind){if(node.type==='upload'||node.type==='asset'){const w=nodeWidth(node),h=nodeHeight(node);return{x:node.position.x+(kind==='out'?w:0),y:node.position.y+h/2};}const previewSize=isGenerationNode(node)?generationPreviewSize(node):null,width=previewSize?.width||nodeWidth(node),inset=isGenerationNode(node)?(GENERATION_NODE_W-width)/2:0,y=previewSize?38+previewSize.height/2:PORT_Y;return{x:node.position.x+inset+(kind==='out'?width:0),y:node.position.y+y};}
function worldToScreen(p){return{x:S.view.x+p.x*S.view.zoom,y:S.view.y+p.y*S.view.zoom};}
function screenToWorld(x,y){const r=els.canvas.getBoundingClientRect();return{x:(x-r.left-S.view.x)/S.view.zoom,y:(y-r.top-S.view.y)/S.view.zoom};}
function edgeScreenPoints(e,steps=28){const a=nodeById(e.source),b=nodeById(e.target);if(!a||!b)return[];const p1=worldToScreen(portWorld(a,'out')),p2=worldToScreen(portWorld(b,'in')),c=Math.max(55,Math.abs(p2.x-p1.x)*.42),points=[];for(let i=0;i<=steps;i++){const t=i/steps,mt=1-t;points.push({x:mt**3*p1.x+3*mt**2*t*(p1.x+c)+3*mt*t**2*(p2.x-c)+t**3*p2.x,y:mt**3*p1.y+3*mt**2*t*p1.y+3*mt*t**2*p2.y+t**3*p2.y});}return points;}
function pointInBox(p,box){return p.x>=box.left&&p.x<=box.right&&p.y>=box.top&&p.y<=box.bottom;}
function segmentTouchesBox(a,b,box){if(pointInBox(a,box)||pointInBox(b,box))return true;return Math.max(a.x,b.x)>=box.left&&Math.min(a.x,b.x)<=box.right&&Math.max(a.y,b.y)>=box.top&&Math.min(a.y,b.y)<=box.bottom;}
function edgeIntersectsScreenBox(e,box){const pad=12,padded={left:box.left-pad,right:box.right+pad,top:box.top-pad,bottom:box.bottom+pad},points=edgeScreenPoints(e);return points.some((p,i)=>i&&segmentTouchesBox(points[i-1],p,padded));}
function renderEdges(){
  els.edgesLayer.innerHTML='';
  const addPath=(d,cls,edgeId)=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);path.setAttribute('class',cls);if(edgeId)path.dataset.edge=edgeId;els.edgesLayer.append(path);return path;};
  for(const e of S.workflow.edges){const a=nodeById(e.source),b=nodeById(e.target);if(!a||!b)continue;const p1=worldToScreen(portWorld(a,'out')),p2=worldToScreen(portWorld(b,'in'));const c=Math.max(55,Math.abs(p2.x-p1.x)*.42);const d=`M ${p1.x} ${p1.y} C ${p1.x+c} ${p1.y}, ${p2.x-c} ${p2.y}, ${p2.x} ${p2.y}`;const st=edgeState(e),sel=e.id===S.selectedEdgeId;const color=st==='failed'?'var(--danger)':(sel||st==='done')?'var(--edge-blue,#8fcce9)':'#63738b';const cls=st==='failed'?'failed':st==='done'?'satisfied':'pending';addPath(d,`edge-path edge-glow ${cls}`,e.id).setAttribute('style',`color:${color}`);addPath(d,`edge-path edge-main ${cls}${sel?' edge-selected':''}`,e.id).setAttribute('style',`color:${color}`);const hit=addPath(d,'edge-hit',e.id);hit.addEventListener('pointerdown',ev=>{ev.stopPropagation();if(S.selectedEdgeId===e.id)selectEdge(null);else selectEdge(e.id);});}
  if(S.interaction?.type==='connect'){const a=nodeById(S.interaction.sourceId);if(a){const p1=worldToScreen(portWorld(a,'out'));const r=els.canvas.getBoundingClientRect(),p2={x:S.interaction.x-r.left,y:S.interaction.y-r.top};const c=Math.max(55,Math.abs(p2.x-p1.x)*.42);addPath(`M ${p1.x} ${p1.y} C ${p1.x+c} ${p1.y}, ${p2.x-c} ${p2.y}, ${p2.x} ${p2.y}`,'edge-path preview');}}
}
function updateView(){els.canvasWorld.style.transform=`translate(${S.view.x}px,${S.view.y}px) scale(${S.view.zoom})`;els.zoomLabel.textContent=`${Math.round(S.view.zoom*100)}%`;renderEdges();}
function fitNodes(nodes){if(!nodes.length)return;const xs=nodes.map(n=>n.position.x),ys=nodes.map(n=>n.position.y),minX=Math.min(...xs),maxX=Math.max(...nodes.map(n=>n.position.x+nodeWidth(n))),minY=Math.min(...ys),maxY=Math.max(...nodes.map(n=>n.position.y+nodeFitHeight(n)));const r=els.canvas.getBoundingClientRect();const z=Math.min(1,Math.max(.25,Math.min((r.width-100)/Math.max(1,maxX-minX),(r.height-180)/Math.max(1,maxY-minY))));S.view.zoom=z;S.view.x=(r.width-(maxX-minX)*z)/2-minX*z;S.view.y=(r.height-(maxY-minY)*z)/2-minY*z;updateView();}
function fitCanvas(){fitNodes(S.workflow.nodes);}

  // 按连线关系分组排布：有连线关联的节点组成一行链路（上传→文本→图片→视频），无连线的按类型单独成组，间距按实际尺寸计算不重叠
  function autoLayoutNodes(){
    const nodes = S.workflow.nodes.filter(n => isGenerationNode(n) || n.type === 'upload');
    if (!nodes.length) return toast('画布上没有节点', 'info');

    const GAP_X = 60, GAP_Y = 50, START_X = 50, START_Y = 50;
    // 先渲染一次，确保 nodeWidth/nodeHeight 读取到真实尺寸
    renderCanvas();

    // 用并查集把有连线关联的节点连成组（连通分量）
    const parent = new Map(nodes.map(n => [n.id, n.id]));
    const find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
    const union = (a, b) => parent.set(find(a), find(b));
    for (const e of S.workflow.edges) {
      if (parent.has(e.source) && parent.has(e.target)) union(e.source, e.target);
    }
    const groups = new Map();
    for (const n of nodes) {
      const root = find(n.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(n);
    }

    // 组内排序：按类型链路顺序 上传→文本→图片→视频，再按链路先后
    const typeOrder = { upload: 0, textGen: 1, imageGen: 2, videoGen: 3 };
    const rank = new Map(nodes.map(n => [n.id, 0]));
    for (const e of S.workflow.edges) {
      if (rank.has(e.source) && rank.has(e.target) && rank.get(e.source) >= rank.get(e.target)) rank.set(e.target, rank.get(e.source) + 1);
    }
    const sortedGroups = [...groups.values()].map(g => g.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || rank.get(a.id) - rank.get(b.id)));

    let cursorY = START_Y;
    for (const group of sortedGroups) {
      let cursorX = START_X;
      let maxH = 0;
      for (const n of group) {
        n.position = { x: cursorX, y: cursorY };
        cursorX += nodeWidth(n) + GAP_X;
        maxH = Math.max(maxH, nodeHeight(n));
      }
      cursorY += maxH + GAP_Y;
    }

    // 分镜节点保留“每镜一行”的导演工作流：图片、视频横向成对，镜号纵向排列。
    arrangeAllStoryboardNodes(true);

    scheduleSave();
    renderCanvas();
    renderEdges();
    fitCanvas();
    toast(`已自动排布 ${nodes.length} 个节点`, 'info');
  }
  
  // 按节点类型分列自动排布（文本→图片→视频）
function nodePositionOccupied(x,y,ignoreId){return S.workflow.nodes.some(n=>n.id!==ignoreId&&Math.abs(n.position.x-x)<Math.max(GENERATION_NODE_W,nodeWidth(n))*.9&&Math.abs(n.position.y-y)<Math.max(220,nodeHeight(n))*.9);}
function findOpenNodePosition(){const r=els.canvas.getBoundingClientRect(),sel=selectedNode();if(sel){const sw=nodeWidth(sel),sh=nodeHeight(sel),near=[[sel.position.x+sw+70,sel.position.y],[sel.position.x,sel.position.y+sh+70],[sel.position.x-GENERATION_NODE_W-70,sel.position.y],[sel.position.x+sw+70,sel.position.y+sh+70]];for(const [x0,y0] of near){const x=Math.round(x0/10)*10,y=Math.round(y0/10)*10;if(!nodePositionOccupied(x,y))return{x,y};}}const margin=28,nodeH=260,left=(-S.view.x+margin)/S.view.zoom,top=(-S.view.y+70)/S.view.zoom,right=(r.width-S.view.x-margin)/S.view.zoom-GENERATION_NODE_W,bottom=(r.height-S.view.y-margin)/S.view.zoom-nodeH,cx=(left+right)/2,cy=(top+bottom)/2,candidates=[];for(let y=top;y<=bottom;y+=nodeH+36)for(let x=left;x<=right;x+=GENERATION_NODE_W+36)candidates.push({x:Math.round(x/10)*10,y:Math.round(y/10)*10,d:Math.hypot(x-cx,y-cy)});candidates.sort((a,b)=>a.d-b.d);return candidates.find(p=>!nodePositionOccupied(p.x,p.y))||{x:Math.round(cx/10)*10,y:Math.round(cy/10)*10};}
function revealNode(node){const r=els.canvas.getBoundingClientRect(),p=worldToScreen({x:node.position.x,y:node.position.y}),right=p.x+nodeWidth(node)*S.view.zoom,bottom=p.y+nodeHeight(node)*S.view.zoom;let dx=0,dy=0;if(p.x<45)dx=45-p.x;else if(right>r.width-45)dx=(r.width-45)-right;if(p.y<70)dy=70-p.y;else if(bottom>r.height-90)dy=(r.height-90)-bottom;if(dx||dy){S.view.x+=dx;S.view.y+=dy;updateView();}}
function addNode(type,data={},position){beginCanvasSnapshot();const pos=position||findOpenNodePosition();const n={id:id(),type,position:pos,data};if(isGenerationNode(n))n.data.layoutWidth=GENERATION_NODE_W;S.workflow.nodes.push(n);S.selectedNodeId=n.id;S.selectedNodeIds=[n.id];S.selectedEdgeId=null;scheduleSave();renderCanvas();renderEdges();renderInspector();requestAnimationFrame(()=>revealNode(n));return n;}
function addTextGen(preset='storyboard',data={},position){return addNode('textGen',{modelKey:firstModelKey('text.generate'),prompt:'',preset,status:'idle',progress:0,outputText:'',params:{temperature:.7},...data},position);}
function addImage(data={},position){const cap=(data.presetReferences||[]).some(r=>findAsset(r.assetId)?.kind==='image')?'image.edit':'image.generate';return addNode('imageGen',{modelKey:firstModelKey(cap)||firstModelKey('image.generate'),prompt:'',status:'idle',progress:0,params:{aspectRatio:'16:9',quality:'2K',variants:1},...data},position);}
function addVideo(data={},position){const refs=data.presetReferences||[];const cap=data.forcedCapability||inferredVideoCapability(refs);return addNode('videoGen',{modelKey:firstModelKey(cap)||firstModelKey('video.generate'),prompt:'',status:'idle',progress:0,params:{duration:5,aspectRatio:'16:9',resolution:'720p'},...data,forcedCapability:cap},position);}
function addWelcomeNode(action){
  const position={x:-250,y:0};
  if(action==='text') return addTextGen('storyboard',{},position);
  if(action==='image') return addImage({},position);
  return addVideo({forcedCapability:'video.generate'},position);
}
function addUploadNode(position){return addNode('upload',{assetId:null,status:'idle',error:''},position);}
function addAssetNode(asset,position){const existing=S.workflow.nodes.find(n=>n.type==='asset'&&n.data.assetId===asset.id);if(existing){selectNode(existing.id);return existing;}return addNode('asset',{assetId:asset.id},position);}
function nodeOutputAssets(n){if(!n)return[];if(['asset','upload'].includes(n.type))return [n.data.assetId].filter(Boolean);return n.data.outputAssetIds||[];}
function nodeOutputText(n){if(!n)return'';if(n.type==='prompt')return String(n.data.text||'');if(n.type==='textGen')return String(n.data.outputText||'');return'';}
function collectIncomingText(n){return S.workflow.edges.filter(e=>e.target===n.id&&!['storyboard-shot','asset-reference'].includes(e.role)).map(e=>nodeById(e.source)).filter(Boolean).map(nodeOutputText).filter(t=>t.trim()).join('\n\n').trim();}
function collectNodePrompt(n){return [collectIncomingText(n),String(n.data.prompt||'').trim()].filter(Boolean).join('\n\n').trim();}
function rawNodeReferences(n){const refs=(n.data.presetReferences||[]).map(ref=>normalizeNodeReference(ref));for(const e of S.workflow.edges.filter(e=>e.target===n.id)){const src=nodeById(e.source);if(!src)continue;for(const aid of nodeOutputAssets(src)){const a=findAsset(aid);if(!a)continue;refs.push(normalizeNodeReference({assetId:a.id,role:e.role||(n.type==='imageGen'?'reference-image':a.kind==='image'?'first-frame':a.kind==='video'?'reference-video':'reference-audio'),source:'node',sourceNodeId:src.id,sourceEdgeId:e.id,label:a.filename}));}}return dedupeRefs(refs);}
function collectNodeReferences(n){const refs=rawNodeReferences(n);if(n.type!=='videoGen')return refs;const cap=videoNodeCapability(n),images=refs.filter(r=>findAsset(r.assetId)?.kind==='image');if(cap==='video.generate')return[];if(cap==='video.image_to_video'){const first=images.find(r=>r.role==='first-frame')||images[0];return first?[{...first,role:'first-frame'}]:[];}if(cap==='video.first_last_frame'){const first=images.find(r=>r.role==='first-frame')||images[0],last=images.find(r=>r.role==='last-frame')||images.find(r=>r!==first);return dedupeRefs([first&&{...first,role:'first-frame'},last&&{...last,role:'last-frame'}].filter(Boolean));}return refs.map(r=>({...r,role:findAsset(r.assetId)?.kind==='image'?'reference-image':findAsset(r.assetId)?.kind==='video'?'reference-video':'reference-audio'}));}
function dedupeRefs(refs){const seen=new Set();return refs.filter(r=>{const k=r.referenceId||`${r.assetId}:${r.role}:${r.sourceNodeId||r.timelineItemId||r.source||''}:${JSON.stringify(r.region||null)}:${JSON.stringify(r.timelineRange||null)}`;if(seen.has(k))return false;seen.add(k);return true;});}
function imageNodeCapability(n){return collectNodeReferences(n).some(r=>findAsset(r.assetId)?.kind==='image')||pendingReferenceKinds(n).has('image')?'image.edit':'image.generate';}
function inferredVideoCapability(refs){if(refs.some(r=>r.role==='last-frame'))return 'video.first_last_frame';if(refs.some(r=>findAsset(r.assetId)?.kind==='image'))return 'video.image_to_video';if(refs.some(r=>['reference-video','reference-audio'].includes(r.role)||['video','audio'].includes(findAsset(r.assetId)?.kind)))return 'video.reference';return 'video.generate';}
function pendingReferenceKinds(n){
  const kinds=new Set();
  for(const e of S.workflow.edges.filter(e=>e.target===n.id)){
    const src=nodeById(e.source); if(!src) continue;
    if(['asset','upload'].includes(src.type)){const a=findAsset(src.data.assetId); if(a) kinds.add(a.kind);}
    else if(src.type==='imageGen') kinds.add('image');
    else if(src.type==='videoGen') kinds.add('video');
  }
  return kinds;
}
function videoNodeCapability(n){
  if(n.data.forcedCapability) return n.data.forcedCapability;
  const produced=inferredVideoCapability(rawNodeReferences(n));
  if(produced!=='video.generate') return produced;
  const kinds=pendingReferenceKinds(n);
  if(kinds.has('image')) return 'video.image_to_video';
  if(kinds.has('video')||kinds.has('audio')) return 'video.reference';
  return 'video.generate';
}
function videoCapabilityLabel(cap){return ({'video.generate':'文生视频','video.image_to_video':'首帧视频','video.first_last_frame':'首尾帧视频','video.reference':'参考视频','video.extend':'视频延长','video.edit':'视频编辑'})[cap]||cap;}
function setVideoCapability(n,cap){return applyNodeAction(n,cap);}
function pendingRefSummary(n){const k=pendingReferenceKinds(n);if(!k.size)return'';const p=[];if(k.has('image'))p.push('图片');if(k.has('video'))p.push('视频');if(k.has('audio'))p.push('音频');return `已连接${p.join('、')}，等待生成`;}
function videoReferencePanel(n,cap){const refs=collectNodeReferences(n),name=ref=>esc(findAsset(ref?.assetId)?.filename||'待连接'),pending=pendingRefSummary(n),wait=refs.length?'':(pending?`<span class="video-ref-pending">${esc(pending)}</span>`:'');if(cap==='video.generate')return '';if(cap==='video.image_to_video')return `<div class="node-output-card video-reference-state ${refs.length?'':'missing'}">首帧：${refs[0]?name(refs[0]):'待连接图片'}${wait}</div>`;if(cap==='video.first_last_frame'){const first=refs.find(r=>r.role==='first-frame'),last=refs.find(r=>r.role==='last-frame');return `<div class="node-output-card video-reference-state ${first&&last?'':'missing'}">首帧：${first?name(first):'待连接'}${first?'':wait}<br>尾帧：${last?name(last):'待连接'}${last?'':wait}</div>`;}return `<div class="node-output-card video-reference-state ${refs.length?'':'missing'}">参考：${refs.length?refs.map(r=>`${esc(r.role)} · ${name(r)}`).join('<br>'):'待连接图片、视频或音频'}${wait}</div>`;}
function missingDepNodes(n){
  if(n.type==='imageGen'&&imageNodeCapability(n)==='image.edit')return S.workflow.edges.filter(e=>e.target===n.id).map(e=>nodeById(e.source)).filter(src=>src?.type==='imageGen'&&src.data.status!=='succeeded');
  if(n.type!=='videoGen') return [];
  const cap=videoNodeCapability(n);
  if(cap==='video.generate') return [];
  const need=new Set(cap==='video.reference'?['image','video','audio']:['image']);
  const producers=[];
  for(const e of S.workflow.edges.filter(e=>e.target===n.id)){
    const src=nodeById(e.source); if(!src||!isGenerationNode(src)) continue;
    const kind=src.type==='imageGen'?'image':src.type==='videoGen'?'video':null;
    if(kind&&need.has(kind)) producers.push(src);
  }
  return producers.filter(p=>p.data.status!=='succeeded');
}
function canAutoConnect(src,tgt){
  if(src.id===tgt.id) return false;
  if(!['textGen','imageGen','videoGen'].includes(tgt.type)) return false;
  return true;
}
function dropTargetForNode(node){
  const c={x:node.position.x+nodeWidth(node)/2,y:node.position.y+nodeHeight(node)/2};
  let best=null,bestArea=0;
  for(const o of S.workflow.nodes){
    if(o.id===node.id) continue;
    const w=nodeWidth(o),h=nodeHeight(o),inflate=14;
    const ix=Math.max(0,Math.min(c.x,o.position.x+w+inflate)-Math.max(c.x,o.position.x-inflate));
    const iy=Math.max(0,Math.min(c.y,o.position.y+h+inflate)-Math.max(c.y,o.position.y-inflate));
    const area=ix*iy;
    if(area>bestArea){bestArea=area;best=o;}
  }
  return best;
}
function edgeState(e){
  const s=nodeById(e.source); if(!s) return 'pending';
  if(s.type==='prompt') return 'done';
  if(['asset','upload'].includes(s.type)) return findAsset(s.data.assetId)?'done':'pending';
  if(isGenerationNode(s)) return s.data.status==='succeeded'?'done':s.data.status==='failed'?'failed':'pending';
  return 'pending';
}
function ensureNodeModelForCapability(n,cap){const [p,m]=(n.data.modelKey||'').split('::');if(!S.models.some(x=>x.providerId===p&&x.modelId===m&&x.capabilities.includes(cap)))n.data.modelKey=firstModelKey(cap)||(n.type==='videoGen'?firstModelKey('video.generate'):n.type==='imageGen'?firstModelKey('image.generate'):firstModelKey('text.generate'));}
function imageNodeValidationError(n){return imageNodeCapability(n)==='image.edit'&&!collectNodeReferences(n).some(ref=>findAsset(ref.assetId)?.kind==='image')?'图生图需要一张已生成的参考图片':'';}
function videoNodeValidationError(n){const cap=videoNodeCapability(n),refs=collectNodeReferences(n);if(cap==='video.image_to_video'&&!refs.some(r=>r.role==='first-frame'))return '首帧视频需要连接一张图片';if(cap==='video.first_last_frame'&&(!refs.some(r=>r.role==='first-frame')||!refs.some(r=>r.role==='last-frame')))return '首尾帧视频需要连接两张图片';if(cap==='video.reference'&&!refs.length)return '参考视频需要连接图片、视频或音频';return '';}
async function generateNode(nodeId){
  const n=nodeById(nodeId); if(!n||!isGenerationNode(n)) return null;
  if(['queued','processing'].includes(n.data.status)) return null;
  const prompt=collectNodePrompt(n);
  if(!prompt) return toast('请填写内容或连接上游文本节点','error');
  const capability=n.type==='textGen'?'text.generate':n.type==='imageGen'?imageNodeCapability(n):videoNodeCapability(n);
  ensureNodeModelForCapability(n,capability);
  if(n.type==='videoGen') normalizedVideoParams(n);
  let [providerId,modelId]=(n.data.modelKey||'').split('::');
  const model=S.models.find(m=>m.providerId===providerId&&m.modelId===modelId&&m.capabilities.includes(capability));
  if(!model) return toast(`没有可用模型：${capability}，请在右上角“模型/API”配置`,'error');
  const deps=missingDepNodes(n);
  for(const d of deps){
    toast(`自动先生成依赖：${d.type==='imageGen'?'图片节点':'上游节点'}…`);
    const r=await generateNode(d.id);
    if(!r||!r.ok){ n.data.error='上游节点生成失败，已停止'; renderNode(n); toast('上游节点生成失败，未继续','error'); return null; }
  }
  const validation=n.type==='videoGen'?videoNodeValidationError(n):n.type==='imageGen'?imageNodeValidationError(n):'';
  if(validation){ n.data.error=validation; renderNode(n); toast(validation,'error'); return null; }
  if(n.data.jobId) S.jobWatchers.get(n.data.jobId)?.();
  n.data.jobId='';n.data.status='queued';n.data.progress=0;n.data.error='';n.data.variantAssetIds=[];n.data.selectedVariantIndex=undefined;renderNode(n);
  try{
    const params={...(n.data.params||{})}; if(n.type==='textGen') params.system=n.data.system||textSystemForPreset(n.data.preset);
    const job=await api('/api/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:S.projectId,capability,providerId,modelId,prompt,params,references:collectNodeReferences(n),requestId:crypto.randomUUID(),sourceNodeId:n.id})});
    n.data.jobId=job.id; scheduleSave(); watchJob(n,job.id);
    return await waitForNodeJob(n,job.id);
  }catch(e){ const message=friendlyError(e.message); n.data.status='failed'; n.data.error=message; renderNode(n); toast(message,'error'); return null; }
}
async function cancelNodeGeneration(n){if(!n?.data?.jobId)return;try{const job=await api(`/api/generations/${n.data.jobId}/cancel`,{method:'POST'});await applyJobUpdate(n,{...job,outputs:[]});}catch(e){toast(`取消失败：${e.message}`,'error');}}
function topoOrderGenerationNodes(){
  const g=S.workflow.nodes.filter(isGenerationNode);
  const index=new Map(g.map((n,i)=>[n.id,i]));
  const adj=new Map(g.map(n=>[n.id,[]]));
  for(const e of S.workflow.edges){if(index.has(e.source)&&index.has(e.target))adj.get(e.source).push(e.target);}
  const state=new Map(),order=[];
  const visit=id=>{const s=state.get(id);if(s==='done'||s==='visiting')return;state.set(id,'visiting');for(const t of adj.get(id))visit(t);state.set(id,'done');order.push(id);};
  for(const n of g)visit(n.id);
  return order.map(id=>g.find(n=>n.id===id));
}
function waitForNodeJob(n,jobId){
  return new Promise(resolve=>{
    const timer=setInterval(async()=>{
      try{const job=await api(`/api/generations/${jobId}`);if(['succeeded','failed','canceled'].includes(job.status)){clearInterval(timer);resolve({ok:job.status==='succeeded',job});}}catch{clearInterval(timer);resolve({ok:false});}
    },700);
  });
}
async function runAllNodes(){
  const order=topoOrderGenerationNodes();
  if(!order.length)return toast('画布上没有可运行的生成节点');
  let ok=0,fail=0;
  toast(`开始运行工作流：${order.length} 个节点，按依赖顺序执行`);
  for(const n of order){
    if(n.data.status==='succeeded'){ok++;continue;}
    const r=await generateNode(n.id);
    if(r&&r.ok)ok++;else fail++;
  }
  toast(`工作流运行完成：成功 ${ok}，失败 ${fail}`,fail?'error':'info');
}
function updateGenerationProgressDom(n){const el=$$('.node',els.canvasWorld).find(node=>node.dataset.id===n.id);if(!el)return renderNode(n);const p=Math.max(0,Math.min(100,Number(n.data.progress||0))),ph=n.data.phase,waiting=isRetryWaitPhase(ph),seconds=waiting&&n.data.nextAttemptAt?Math.max(0,Math.ceil((Date.parse(n.data.nextAttemptAt)-Date.now())/1000)):0,label=n.data.status==='queued'?(waiting?`${retryWaitLabel(ph)}${seconds?` · ${seconds}s`:''}`:`排队中 · ${p}%`):`${ph?phaseLabel(ph):'生成中'} · ${p}%`,bar=$('.generation-progress .progressbar',el),status=$('.generation-progress .status',el),fill=bar&&$('span',bar);if(!bar||!status||!fill)return renderNode(n);bar.setAttribute('aria-label',label);bar.setAttribute('aria-valuenow',String(p));fill.style.width=`${p}%`;status.className=`status ${n.data.status}`;status.textContent=label;}
async function applyJobUpdate(n,job){const terminal=['succeeded','failed','canceled'];if(n.data.jobId!==job.id||!nodeById(n.id)||terminal.includes(n.data.status))return true;if(n.data.status==='processing'&&job.status==='queued'&&!isRetryWaitPhase(job.phase))return false;n.data.status=job.status;n.data.phase=job.phase;n.data.nextAttemptAt=job.nextAttemptAt||null;n.data.progress=terminal.includes(job.status)?Number(job.progress||0):Math.max(Number(n.data.progress||0),Number(job.progress||0));n.data.error=job.error||'';upsertJob(job);renderJobs();if(!terminal.includes(job.status)){updateGenerationProgressDom(n);return false;}n.data.jobId='';if(job.status==='succeeded'){if(job.outputText!=null)n.data.outputText=job.outputText;const outs=(job.outputs||[]).map(o=>o.id);n.data.variantAssetIds=outs.length>1?outs:[];n.data.selectedVariantIndex=0;n.data.outputAssetIds=outs.slice(0,1);n.data.expanded=false;await saveWorkflow();await refreshAssets();renderNode(n);renderEdges();for(const e of S.workflow.edges.filter(e=>e.source===n.id)){const t=nodeById(e.target);if(t&&isGenerationNode(t))renderNode(t);}return true;}renderNode(n);scheduleSave();toast(friendlyError(job.error)||(job.status==='canceled'?'任务已取消':job.status),job.status==='failed'?'error':'info');return true;}
function watchJob(n,jobId){S.jobWatchers.get(jobId)?.();let es=null,timer=null,stopped=false;const stop=()=>{if(stopped)return;stopped=true;es?.close();if(timer)clearTimeout(timer);S.jobWatchers.delete(jobId);};const poll=async()=>{if(stopped)return;try{const job=await api(`/api/generations/${jobId}`);if(await applyJobUpdate(n,job))return stop();timer=setTimeout(poll,1000);}catch(e){if(nodeById(n.id)&&n.data.jobId===jobId){n.data.status='failed';n.data.jobId='';n.data.error=`任务状态恢复失败：${e.message}`;renderNode(n);}stop();}};es=new EventSource(`/api/generations/${jobId}/events`);es.addEventListener('generation',async ev=>{const job=JSON.parse(ev.data);if(await applyJobUpdate(n,job))stop();});es.onerror=()=>{es?.close();es=null;if(!stopped)timer=setTimeout(poll,600);};S.jobWatchers.set(jobId,stop);}
function resumeNodeJobs(){for(const n of S.workflow.nodes)if(n.data?.jobId&&['queued','processing'].includes(n.data.status))watchJob(n,n.data.jobId);}
function upsertJob(job){const i=S.jobs.findIndex(j=>j.id===job.id);if(i>=0)S.jobs[i]=job;else S.jobs.unshift(job);}

/* ---------------- Assets ---------------- */
async function refreshAssets(){if(!S.projectId)return;const f=S.assetFilter||{},q=new URLSearchParams();if(f.tag&&f.tag!=='all')q.set('tag',f.tag);if(f.kind&&f.kind!=='all')q.set('kind',f.kind);const qs=q.toString();const r=await api(`/api/projects/${S.projectId}/assets${qs?`?${qs}`:''}`);S.assets=r.assets||[];renderAssets();renderInspector();renderPreview();}
function bindAssetFilterChips(){els.assetFilterChips?.querySelectorAll('[data-filter-tag],[data-filter-kind]').forEach(chip=>chip.addEventListener('click',()=>{const t=chip.dataset.filterTag,k=chip.dataset.filterKind;if(t){S.assetFilter={...(S.assetFilter||{}),tag:t};els.assetFilterChips.querySelectorAll('[data-filter-tag]').forEach(c=>c.classList.toggle('active',c===chip));}if(k){S.assetFilter={...(S.assetFilter||{}),kind:k};els.assetFilterChips.querySelectorAll('[data-filter-kind]').forEach(c=>c.classList.toggle('active',c===chip));}refreshAssets();}));}
function renderAssets(){
  if(!S.assets.length){els.assetList.innerHTML=`<div class="empty-state asset-empty">${S.assetFilter?.tag!=='all'||S.assetFilter?.kind!=='all'?'当前过滤无结果，点击上方分类清除过滤':'暂无素材'}</div>`;return;}
  const kindOrder={image:0,video:1,audio:2},kindLabel={image:'图片',video:'视频',audio:'音频'},assets=[...S.assets].sort((a,b)=>(kindOrder[a.kind]??3)-(kindOrder[b.kind]??3));
  els.assetList.innerHTML=assets.map(a=>{const prompt=assetPrompt(a),media=a.kind==='image'?`<img class="asset-thumb" src="${esc(a.publicUrl)}" alt="" draggable="false">`:a.kind==='video'?`<video class="asset-thumb" src="${esc(a.publicUrl)}" muted playsinline preload="metadata" draggable="false"></video>`:`<span class="asset-thumb audio">${icon('volume')}</span>`;return `<div class="asset-card" data-asset="${esc(a.id)}" title="${esc(a.filename)}" role="button" tabindex="0" draggable="true"><button type="button" class="asset-delete" data-asset-delete title="删除素材" aria-label="删除素材">${icon('x')}</button><span class="asset-visual">${media}<span class="asset-kind">${kindLabel[a.kind]||esc(a.kind)}</span></span><span class="asset-card-copy"><span class="asset-name">${esc(a.filename)}</span><button type="button" class="asset-prompt${prompt?'':' is-empty'}"><b>提示词</b><span>${prompt?esc(prompt):'上传素材未包含提示词'}</span></button></span></div>`;}).join('');
  $$('.asset-card',els.assetList).forEach(card=>{card.addEventListener('click',e=>{const a=findAsset(card.dataset.asset);if(!a)return;if(e.target.closest('[data-asset-delete]'))return deleteAsset(a);if(e.target.closest('.asset-prompt'))return openAssetPrompt(a);if(S.assetPick){const pick=S.assetPick;S.assetPick=null;hideDrawer('assetDrawer');pickReferenceAsset(pick.nodeId,a);return;}if(['image','video'].includes(a.kind))openMediaLightbox(a);});card.addEventListener('dragstart',e=>{if(e.target.closest('button'))return e.preventDefault();e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData(ASSET_DRAG_TYPE,card.dataset.asset);});card.addEventListener('keydown',e=>{if(e.target!==card||!['Enter',' '].includes(e.key))return;e.preventDefault();card.click();});});
}
function hasDraggedFiles(e){return [...(e.dataTransfer?.types||[])].includes('Files');}
function hasDraggedAsset(e){return [...(e.dataTransfer?.types||[])].includes(ASSET_DRAG_TYPE);}
async function deleteAsset(asset){if(!confirm(`删除素材“${asset.filename}”？引用它的素材节点和时间线片段也会移除。`))return;try{const result=await api(`/api/projects/${S.projectId}/assets/${asset.id}`,{method:'DELETE'});S.workflow=result.workflow;S.timeline=result.timeline;S.assets=S.assets.filter(item=>item.id!==asset.id);S.selectedNodeId=S.selectedEdgeId=S.selectedClipId=null;S.selectedNodeIds=[];renderAll();toast('素材已删除');}catch(e){toast(`删除失败：${e.message}`,'error');}}
function supportedUploadFiles(files){const ext=/\.(avif|gif|jpe?g|png|webp|mp4|mov|m4v|webm|mp3|m4a|wav|ogg|aac)$/i;return [...files].filter(file=>/^(image|video|audio)\//.test(file.type)||ext.test(file.name));}
function chooseUploadFiles(nodeId){S.uploadTargetNodeId=nodeId;els.fileInput.click();}
async function uploadFiles(files,{targetNodeId=null}={}){
  const accepted=supportedUploadFiles(files),target=nodeById(targetNodeId);if(!accepted.length)return toast('请选择图片、视频或音频文件','error');
  if(target){target.data.status='uploading';target.data.error='';renderNode(target);}
  const uploaded=[];
  for(const file of accepted){try{toast(`上传：${file.name}`);uploaded.push(await api(`/api/projects/${S.projectId}/assets/upload`,{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-filename':encodeURIComponent(file.name)},body:file}));}catch(e){toast(`${file.name}: ${e.message}`,'error');}}
  await refreshAssets();
  S.assets=[...uploaded,...S.assets.filter(asset=>!uploaded.some(item=>item.id===asset.id))];
  const current=nodeById(targetNodeId);
  if(current){
    if(uploaded.length){const origin={...current.position};uploaded.forEach((asset,index)=>{const node=index===0?current:addUploadNode({x:origin.x+index*320,y:origin.y});node.data.assetId=asset.id;node.data.status='done';node.data.error='';});toast(`已上传 ${uploaded.length} 个文件`);}
    else{current.data.status='failed';current.data.error='上传失败';}
    scheduleSave();renderCanvas();renderEdges();renderInspector();
  }
  return uploaded;
}

/* ---------------- Timeline ---------------- */
function beginTimelineSnapshot(){S.timelineHistory.past.push(clone(S.timeline));if(S.timelineHistory.past.length>60)S.timelineHistory.past.shift();S.timelineHistory.future=[];updateUndoButtons();}
function timelineUndo(){const prev=S.timelineHistory.past.pop();if(!prev)return;S.timelineHistory.future.push(clone(S.timeline));S.timeline=prev;normalizeTimeline();S.selectedClipId=null;scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();updateUndoButtons();}
function timelineRedo(){const next=S.timelineHistory.future.pop();if(!next)return;S.timelineHistory.past.push(clone(S.timeline));S.timeline=next;normalizeTimeline();scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();updateUndoButtons();}
function addAssetToTimeline(assetId){const a=findAsset(assetId);if(!a)return;beginTimelineSnapshot();const fps=S.timeline.fps||30;const track=a.kind==='audio'?'A1':'V1';const duration=Math.max(1,a.kind==='image'?fps*3:Math.round((a.durationMs||3000)/1000*fps));const end=Math.max(0,...S.timeline.items.filter(i=>i.track===track).map(i=>i.startFrame+i.durationInFrames));const item={id:id(),track,startFrame:end,durationInFrames:duration,name:a.filename,kind:a.kind,sourceAssetId:a.id,sourceInFrame:0,sourceOutFrame:duration,playbackRate:1,volume:1,opacity:1,fadeInFrames:0,fadeOutFrames:0,transform:{x:0,y:0,scale:1}};S.timeline.items.push(item);S.selectedClipId=item.id;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();toast('已加入 Timeline');}
function addTextClip(){beginTimelineSnapshot();const fps=S.timeline.fps||30;const item={id:id(),track:'C1',startFrame:S.playheadFrame,durationInFrames:fps*3,name:'字幕',kind:'text',text:'输入字幕',opacity:1,fadeInFrames:0,fadeOutFrames:0,textStyle:{fontSize:44,color:'#ffffff',x:50,y:84,background:false}};S.timeline.items.push(item);S.selectedClipId=item.id;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();toast('已添加字幕 Clip');}
function maxTimelineFrame(){return Math.max((S.timeline.fps||30)*20,S.playheadFrame,...S.timeline.items.map(i=>i.startFrame+i.durationInFrames));}
function syncTimelineRulerScroll(){if(!els.timelineRuler||!els.timelineBody)return;els.timelineRuler.style.transform=`translateX(${-els.timelineBody.scrollLeft}px)`;}
function renderTimeline(){
  S.previewActiveKey='';
  const fps=S.timeline.fps||30,px=timelinePx(),total=maxTimelineFrame(),width=Math.max(1000,total*px+100);els.timelineMeta.textContent=`${S.timeline.width}×${S.timeline.height} · ${fps} fps · ${(S.playheadFrame/fps).toFixed(2)}s`;els.timelineRuler.style.width=`${width}px`;els.timelineRuler.innerHTML='';
  for(let sec=0;sec<=Math.ceil(total/fps);sec++){const m=document.createElement('span');m.className=`ruler-mark ${sec%5===0?'major':''}`;m.style.left=`${sec*fps*px}px`;m.textContent=sec%2===0?`${sec}s`:'';els.timelineRuler.append(m);}const ph=document.createElement('div');ph.className='playhead ruler-playhead';ph.style.left=`${S.playheadFrame*px}px`;els.timelineRuler.append(ph);
  els.timelineBody.innerHTML=TRACKS.map(t=>{const st=S.timeline.tracks[t]||{};return `<div class="track ${st.hidden?'track-hidden':''}"><div class="track-label"><span>${t}</span><button data-track-mute="${t}" class="track-mini ${st.muted?'active':''}" title="${st.muted?'取消静音':'静音'}" aria-label="${st.muted?'取消静音':'静音'}">${icon(st.muted?'volume-off':'volume')}</button><button data-track-hide="${t}" class="track-mini ${st.hidden?'active':''}" title="${st.hidden?'显示':'隐藏'}" aria-label="${st.hidden?'显示':'隐藏'}">${icon(st.hidden?'eye-off':'eye')}</button></div><div class="track-lane" data-track="${t}" style="width:${width}px"></div></div>`;}).join('');
  for(const item of S.timeline.items){const lane=els.timelineBody.querySelector(`[data-track="${item.track}"]`);if(!lane)continue;const c=document.createElement('div');c.className=`clip ${item.kind} ${item.id===S.selectedClipId?'selected':''}`;c.dataset.clip=item.id;c.style.left=`${item.startFrame*px}px`;c.style.width=`${Math.max(24,item.durationInFrames*px)}px`;c.innerHTML=`<span class="clip-trim left" data-trim="left"></span><div class="clip-name">${esc(item.kind==='text'?(item.text||item.name):item.name)}</div><div class="clip-sub">${(item.durationInFrames/fps).toFixed(1)}s${item.kind==='text'?' · Caption':` · ×${Number(item.playbackRate||1).toFixed(2)}`}</div><span class="clip-trim right" data-trim="right"></span>`;bindClip(c,item);lane.append(c);}const bodyPh=document.createElement('div');bodyPh.className='playhead body-playhead';bodyPh.style.left=`${80+S.playheadFrame*px}px`;els.timelineBody.append(bodyPh);bindTrackButtons();renderTimelineSelectionButtons();syncTimelineRulerScroll();
}
function bindTrackButtons(){$$('[data-track-mute]',els.timelineBody).forEach(b=>b.addEventListener('click',()=>{beginTimelineSnapshot();S.timeline.tracks[b.dataset.trackMute].muted=!S.timeline.tracks[b.dataset.trackMute].muted;scheduleTimelineSave();renderTimeline();}));$$('[data-track-hide]',els.timelineBody).forEach(b=>b.addEventListener('click',()=>{beginTimelineSnapshot();S.timeline.tracks[b.dataset.trackHide].hidden=!S.timeline.tracks[b.dataset.trackHide].hidden;scheduleTimelineSave();renderTimeline();renderPreview();}));}
function bindClip(el,item){
  el.addEventListener('click',e=>{e.stopPropagation();selectClip(item.id);});
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();beginTimelineSnapshot();selectClip(item.id,{render:false});const trim=e.target.closest('[data-trim]')?.dataset.trim;const type=trim?`trim-${trim}`:(e.altKey&&['video','audio'].includes(item.kind)?'clip-slip':'clip-drag');S.interaction={type,pointerId:e.pointerId,item,el,startX:e.clientX,startY:e.clientY,start:{startFrame:item.startFrame,duration:item.durationInFrames,sourceIn:item.sourceInFrame||0,sourceOut:item.sourceOutFrame||item.durationInFrames,track:item.track}};el.setPointerCapture?.(e.pointerId);el.classList.add('dragging');});
}
function selectClip(id,{render=true}={}){S.selectedClipId=id;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];updateCanvasSelectionDom();renderEdges();if(render)renderTimeline();renderInspector();renderPreview();}
function snapFrame(frame,itemId){const px=timelinePx(),threshold=Math.max(1,Math.round(7/px));const candidates=[0,S.playheadFrame];for(const i of S.timeline.items)if(i.id!==itemId)candidates.push(i.startFrame,i.startFrame+i.durationInFrames);let best=frame,dist=Infinity;for(const c of candidates){const d=Math.abs(frame-c);if(d<=threshold&&d<dist){best=c;dist=d;}}return Math.max(0,best);}
function splitSelectedClip(){const clip=selectedClip();if(!clip)return;const cut=S.playheadFrame;if(cut<=clip.startFrame||cut>=clip.startFrame+clip.durationInFrames)return toast('播放头必须位于所选 Clip 内','error');beginTimelineSnapshot();const leftDur=cut-clip.startFrame,rightDur=clip.durationInFrames-leftDur,rate=Number(clip.playbackRate||1);const originalSourceOut=clip.sourceOutFrame||((clip.sourceInFrame||0)+Math.round(clip.durationInFrames*rate));clip.durationInFrames=leftDur;clip.sourceOutFrame=(clip.sourceInFrame||0)+Math.round(leftDur*rate);const right={...clone(clip),id:id(),startFrame:cut,durationInFrames:rightDur,sourceInFrame:clip.sourceOutFrame,sourceOutFrame:originalSourceOut,name:`${clip.name} (B)`};S.timeline.items.push(right);S.selectedClipId=right.id;scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();}
function duplicateSelectedClip(){const clip=selectedClip();if(!clip)return;beginTimelineSnapshot();const copy={...clone(clip),id:id(),startFrame:clip.startFrame+clip.durationInFrames+1,name:`${clip.name} copy`};S.timeline.items.push(copy);S.selectedClipId=copy.id;scheduleTimelineSave();renderTimeline();renderInspector();}
function crossfadeWithNext(){const clip=selectedClip();if(!clip||!['image','video'].includes(clip.kind))return toast('Crossfade 仅支持图片/视频 Clip','error');const next=S.timeline.items.filter(i=>i.id!==clip.id&&i.track===clip.track&&['image','video'].includes(i.kind)&&i.startFrame>=clip.startFrame).sort((a,b)=>a.startFrame-b.startFrame).find(i=>i.startFrame>=clip.startFrame+1);if(!next)return toast('同轨道没有下一个视觉 Clip','error');beginTimelineSnapshot();const frames=Math.max(1,Math.min(15,Math.floor(clip.durationInFrames/3),Math.floor(next.durationInFrames/3)));next.startFrame=Math.max(clip.startFrame,clip.startFrame+clip.durationInFrames-frames);clip.fadeOutFrames=frames;next.fadeInFrames=frames;scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();toast(`已创建 ${frames} 帧 Crossfade`);}
function deleteSelectedClip({ripple=false}={}){const clip=selectedClip();if(!clip)return;beginTimelineSnapshot();S.timeline.items=S.timeline.items.filter(i=>i.id!==clip.id);if(ripple){for(const i of S.timeline.items)if(i.track===clip.track&&i.startFrame>=clip.startFrame+clip.durationInFrames)i.startFrame=Math.max(clip.startFrame,i.startFrame-clip.durationInFrames);}S.selectedClipId=null;scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();}
function createReferenceFromClip(){const clip=selectedClip();if(!clip)return;if(clip.kind==='text')return toast('字幕不能作为媒体 Reference','error');const asset=findAsset(clip.sourceAssetId);if(!asset)return;const role=asset.kind==='image'?'first-frame':asset.kind==='video'?'reference-video':'reference-audio',startFrame=clip.sourceInFrame||0,endFrame=clip.sourceOutFrame||clip.durationInFrames;const ref=normalizeNodeReference({referenceId:id(),assetId:asset.id,role,source:'timeline',timelineItemId:clip.id,timelineRange:{startFrame,endFrame},sourceInFrame:startFrame,sourceOutFrame:endFrame,label:clip.name});addVideo({presetReferences:[ref],prompt:`基于 ${clip.name} 生成一个连续的新镜头`});toast('已创建 Timeline Reference 视频节点');}
function renderTimelineSelectionButtons(){const has=Boolean(selectedClip());for(const el of [els.timelineRefBtn,els.deleteClipBtn,els.splitClipBtn,els.duplicateClipBtn,els.crossfadeBtn,els.rippleDeleteBtn])if(el)el.disabled=!has;}

/* ---------------- Inspector & preview ---------------- */
function renderInspector(){
  const n=selectedNode(),clip=selectedClip();
  if(S.selectedNodeIds.length>1){els.inspector.className='inspector empty-state';els.inspector.textContent=`已选择 ${S.selectedNodeIds.length} 个节点，可一起拖动或删除`;return;}
  if(S.selectedEdgeId){const e=S.workflow.edges.find(x=>x.id===S.selectedEdgeId);const src=e?nodeById(e.source):null,tgt=e?nodeById(e.target):null;const outAsset=nodeOutputAssets(src||{}).map(findAsset).find(Boolean);const roles=outAsset?.kind==='image'?['first-frame','last-frame','reference-image']:outAsset?.kind==='video'?['reference-video']:outAsset?.kind==='audio'?['reference-audio']:[];els.inspector.className='inspector';els.inspector.innerHTML=`<h3>Connection</h3><dl><dt>Source</dt><dd>${esc(e?.source)}</dd><dt>Target</dt><dd>${esc(e?.target)}</dd></dl>${tgt?.type==='videoGen'&&roles.length?`<label class="field"><span>Reference role</span><select id="edgeRoleSelect">${roles.map(r=>`<option value="${r}" ${r===(e.role||defaultEdgeRole(src,tgt))?'selected':''}>${r}</option>`).join('')}</select></label>`:''}<button id="deleteEdgeBtn" class="danger">删除连线</button>`;$('#edgeRoleSelect')?.addEventListener('change',ev=>{beginCanvasSnapshot();e.role=ev.target.value;scheduleSave();renderCanvas();renderEdges();renderInspector();});$('#deleteEdgeBtn')?.addEventListener('click',deleteSelectedEdge);return;}
  if(n){els.inspector.className='inspector';els.inspector.innerHTML=`<h3>${esc(n.type)}</h3><dl><dt>Node ID</dt><dd>${esc(n.id)}</dd><dt>Position</dt><dd>${Math.round(n.position.x)}, ${Math.round(n.position.y)}</dd><dt>Inputs</dt><dd>${S.workflow.edges.filter(e=>e.target===n.id).length}</dd><dt>Outputs</dt><dd>${S.workflow.edges.filter(e=>e.source===n.id).length}</dd>${n.data.jobId?`<dt>Job</dt><dd>${esc(n.data.jobId)}</dd>`:''}</dl>`;return;}
  if(clip&&clip.kind==='text'){const st=clip.textStyle||{fontSize:44,color:'#ffffff',x:50,y:84,background:false};els.inspector.className='inspector';els.inspector.innerHTML=`<h3>Caption</h3><label class="field"><span>文字</span><textarea id="captionText">${esc(clip.text||'')}</textarea></label><div class="inspector-grid"><label>Start<input data-ci="startFrame" type="number" min="0" value="${clip.startFrame}"></label><label>Duration<input data-ci="durationInFrames" type="number" min="1" value="${clip.durationInFrames}"></label><label>Font size<input data-ts="fontSize" type="number" min="12" max="160" value="${st.fontSize||44}"></label><label>Color<input id="captionColor" type="color" value="${esc(st.color||'#ffffff')}"></label><label>X %<input data-ts="x" type="number" min="0" max="100" value="${st.x??50}"></label><label>Y %<input data-ts="y" type="number" min="0" max="100" value="${st.y??84}"></label><label>Opacity<input data-ci="opacity" type="number" min="0" max="1" step="0.05" value="${clip.opacity??1}"></label><label>Fade in<input data-ci="fadeInFrames" type="number" min="0" value="${clip.fadeInFrames||0}"></label><label>Fade out<input data-ci="fadeOutFrames" type="number" min="0" value="${clip.fadeOutFrames||0}"></label></div>`;$('#captionText')?.addEventListener('input',ev=>{clip.text=ev.target.value;clip.name=ev.target.value.slice(0,30)||'字幕';scheduleTimelineSave();renderTimeline();renderPreview();});$('#captionColor')?.addEventListener('input',ev=>{clip.textStyle={...(clip.textStyle||{}),color:ev.target.value};scheduleTimelineSave();renderPreview();});$$('[data-ci]',els.inspector).forEach(inp=>inp.addEventListener('change',()=>{beginTimelineSnapshot();clip[inp.dataset.ci]=Number(inp.value);scheduleTimelineSave();renderTimeline();renderPreview();}));$$('[data-ts]',els.inspector).forEach(inp=>inp.addEventListener('change',()=>{beginTimelineSnapshot();clip.textStyle={...(clip.textStyle||{}),[inp.dataset.ts]:Number(inp.value)};scheduleTimelineSave();renderPreview();}));return;}
  if(clip){const a=findAsset(clip.sourceAssetId);els.inspector.className='inspector';const t=clip.transform||{x:0,y:0,scale:1};els.inspector.innerHTML=`<h3>${esc(clip.name)}</h3><div class="inspector-grid"><label>Start<input data-ci="startFrame" type="number" min="0" value="${clip.startFrame}"></label><label>Duration<input data-ci="durationInFrames" type="number" min="1" value="${clip.durationInFrames}"></label><label>Source In<input data-ci="sourceInFrame" type="number" min="0" value="${clip.sourceInFrame||0}"></label><label>Speed<input data-ci="playbackRate" type="number" min="0.25" max="4" step="0.05" value="${clip.playbackRate||1}"></label><label>Volume<input data-ci="volume" type="number" min="0" max="2" step="0.05" value="${clip.volume??1}"></label><label>Opacity<input data-ci="opacity" type="number" min="0" max="1" step="0.05" value="${clip.opacity??1}"></label><label>X %<input data-ti="x" type="number" step="1" value="${t.x||0}"></label><label>Y %<input data-ti="y" type="number" step="1" value="${t.y||0}"></label><label>Scale<input data-ti="scale" type="number" min="0.1" max="4" step="0.05" value="${t.scale||1}"></label><label>Fade in<input data-ci="fadeInFrames" type="number" min="0" value="${clip.fadeInFrames||0}"></label><label>Fade out<input data-ci="fadeOutFrames" type="number" min="0" value="${clip.fadeOutFrames||0}"></label></div><dl><dt>Track</dt><dd>${esc(clip.track)}</dd><dt>Asset</dt><dd>${esc(a?.id||'-')}</dd><dt>Source Out</dt><dd>${clip.sourceOutFrame||'-'}</dd></dl>${editSectionHtml(clip)}`;$$('[data-ci]',els.inspector).forEach(inp=>inp.addEventListener('change',()=>{beginTimelineSnapshot();const k=inp.dataset.ci;clip[k]=Number(inp.value);if(k==='durationInFrames')clip.sourceOutFrame=(clip.sourceInFrame||0)+Math.round(clip.durationInFrames*(clip.playbackRate||1));scheduleTimelineSave();renderTimeline();renderPreview();}));$$('[data-ti]',els.inspector).forEach(inp=>inp.addEventListener('change',()=>{beginTimelineSnapshot();clip.transform={...(clip.transform||{}),[inp.dataset.ti]:Number(inp.value)};scheduleTimelineSave();renderPreview();}));$('#reshootBtn',els.inspector)?.addEventListener('click',()=>runClipEdit('reshoot'));$('#extendBtn',els.inspector)?.addEventListener('click',()=>runClipEdit('extend'));return;}
  els.inspector.className='inspector empty-state';els.inspector.textContent='选择节点、连线或 Timeline Clip';
}
let editJobWatcher = null;
function editModelList(){return S.models.filter(m=>m.capabilities?.includes('video.first_last_frame')||m.capabilities?.includes('video.image_to_video'));}
function editSectionHtml(clip){
  if(!clip||clip.kind==='text')return '';
  const models=editModelList();
  if(!models.length)return '';
  const preferred=firstModelKey('video.first_last_frame')||firstModelKey('video.image_to_video');
  const opts=models.map(m=>{const k=`${m.providerId}::${m.modelId}`;const label=String(m.displayName||m.modelId).split('·')[0].trim();return `<option value="${esc(k)}" ${k===preferred?'selected':''}>${esc(label)}</option>`;}).join('');
  return `<div class="section-divider"></div><div class="inspector-edit"><div class="inspector-edit-head">${icon('refresh')}<strong>专业编辑</strong><span class="muted">锚定重拍 · 尾帧续写</span></div><textarea id="editPrompt" rows="2" placeholder="描述期望的新画面；留空则保持主体与光线一致"></textarea><label class="field"><span>模型</span><select id="editModel">${opts}</select></label><div class="inspector-edit-actions"><button id="reshootBtn" data-edit-action="reshoot" title="以片段首尾帧为锚点重新生成，原位替换">${icon('refresh')}<span>重拍此段</span></button><button id="extendBtn" data-edit-action="extend" title="取尾帧作下一段首帧，续写接片">${icon('player-track-next')}<span>续写接片</span></button></div><div id="editStatus" class="edit-status"></div></div>`;
}
function setEditStatus(text){const el=els.inspector?.querySelector?.('#editStatus');if(el){el.textContent=text||'';el.classList.toggle('active',Boolean(text));}}
async function runClipEdit(action){
  const clip=selectedClip(); if(!clip)return;
  const need=action==='reshoot'?'video.first_last_frame':'video.image_to_video';
  let model=null;const key=els.inspector?.querySelector?.('#editModel')?.value||'';
  if(key){const [p,m]=key.split('::');model=S.models.find(x=>x.providerId===p&&x.modelId===m&&x.capabilities?.includes(need));}
  if(!model){const fallback=firstModelKey(need);if(fallback){const [p,m]=fallback.split('::');model=S.models.find(x=>x.providerId===p&&x.modelId===m);}}
  if(!model)return toast(`没有可用模型：${need}`,'error');
  const durSec=Math.max(1,Math.round(Number(clip.durationInFrames||1)/(S.timeline.fps||30)));
  const prompt=els.inspector?.querySelector?.('#editPrompt')?.value?.trim()||'';
  const params={duration:durSec};
  setEditStatus('提交中…');
  try{
    const job=await api(`/api/projects/${S.projectId}/timeline/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemId:clip.id,providerId:model.providerId,modelId:model.modelId,prompt,params,requestId:crypto.randomUUID()})});
    watchEditJob(action,job.id);
  }catch(e){setEditStatus(friendlyError(e.message));toast(e.message,'error');}
}
function watchEditJob(action,jobId){
  editJobWatcher?.();let timer=null,stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;if(timer)clearTimeout(timer);if(editJobWatcher===stop)editJobWatcher=null;};
  const poll=async()=>{
    if(stopped)return;
    try{
      const job=await api(`/api/generations/${jobId}`);
      const busy=['queued','processing'].includes(job.status);
      setEditStatus(busy?`${isRetryWaitPhase(job.phase)?retryWaitLabel(job.phase):job.status==='queued'?'排队中':'生成中'} · ${job.progress||0}%`:job.status);
      if(!busy){
        if(job.status==='succeeded'){await refreshTimelineAfterEdit();setEditStatus(action==='reshoot'?'完成，已原位替换片段':'完成，已接片到时间线');toast(action==='reshoot'?'重拍完成，已替换片段':'续写完成，已接片');}
        else setEditStatus(friendlyError(job.error||job.status));
        return stop();
      }
      timer=setTimeout(poll,900);
    }catch(e){setEditStatus(e.message);return stop();}
  };
  editJobWatcher=stop;poll();
}
async function refreshTimelineAfterEdit(){
  const r=await api(`/api/projects/${S.projectId}/timeline`);
  S.timeline={fps:r.fps||30,width:r.width||1280,height:r.height||720,items:r.items||[],tracks:r.tracks||{}};
  normalizeTimeline();renderTimeline();renderInspector();renderPreview();await refreshAssets();
}
function activeVisualAt(frame){const z={V1:1,V2:2,C1:3};return S.timeline.items.filter(i=>['image','video','text'].includes(i.kind)&&!S.timeline.tracks[i.track]?.hidden&&frame>=i.startFrame&&frame<i.startFrame+i.durationInFrames).sort((a,b)=>(z[a.track]||0)-(z[b.track]||0));}
function updatePlayheadDom(){const px=timelinePx();const rph=$('.ruler-playhead',els.timelineRuler),bph=$('.body-playhead',els.timelineBody);if(rph)rph.style.left=`${S.playheadFrame*px}px`;if(bph)bph.style.left=`${80+S.playheadFrame*px}px`;if(els.previewTime)els.previewTime.textContent=`${(S.playheadFrame/(S.timeline.fps||30)).toFixed(2)}s`;}
function renderPreview(){if(!els.previewStage)return;const active=activeVisualAt(S.playheadFrame),key=active.map(i=>i.id).join('|');if(key!==S.previewActiveKey){S.previewActiveKey=key;els.previewStage.innerHTML='';if(!active.length)els.previewStage.innerHTML='<div class="preview-empty">No visual at playhead</div>';else for(const item of active){let el;if(item.kind==='text'){el=document.createElement('div');el.className='preview-caption';}else{const a=findAsset(item.sourceAssetId);if(!a)continue;el=document.createElement(a.kind==='video'?'video':'img');el.src=a.publicUrl;el.className='preview-media';if(a.kind==='video'){el.muted=true;el.playsInline=true;el.preload='auto';}}el.dataset.previewItem=item.id;els.previewStage.append(el);}}
  for(const item of active){const el=els.previewStage.querySelector(`[data-preview-item="${CSS.escape(item.id)}"]`);if(!el)continue;if(item.kind==='text'){const st=item.textStyle||{};el.textContent=item.text||'';el.style.left=`${st.x??50}%`;el.style.top=`${st.y??84}%`;el.style.fontSize=`${st.fontSize||44}px`;el.style.color=st.color||'#fff';el.style.opacity=String(item.opacity??1);continue;}const a=findAsset(item.sourceAssetId);if(!a)continue;const t=item.transform||{};el.style.transform=`translate(${t.x||0}%,${t.y||0}%) scale(${t.scale||1})`;el.style.opacity=String(item.opacity??1);if(a.kind==='video'){const local=(S.playheadFrame-item.startFrame)*(item.playbackRate||1)/(S.timeline.fps||30)+(item.sourceInFrame||0)/(S.timeline.fps||30);const sync=()=>{try{const target=Math.max(0,Math.min(local,Number.isFinite(el.duration)?el.duration:local));if(Math.abs((el.currentTime||0)-target)>.28)el.currentTime=target;el.playbackRate=Math.max(.25,Math.min(4,item.playbackRate||1));if(S.previewTimer)el.play().catch(()=>{});else el.pause();}catch{}};if(el.readyState>=1)sync();else el.addEventListener('loadedmetadata',sync,{once:true});}}
  updatePlayheadDom();if(els.previewFullscreenModal&&!els.previewFullscreenModal.classList.contains('hidden'))renderFullscreenPreview();}
function togglePreview(){if(S.previewTimer)stopPreview();else{setIconButton(els.previewPlayBtn,'player-pause','暂停');const fps=S.timeline.fps||30;S.previewTimer=setInterval(()=>{S.playheadFrame++;if(S.playheadFrame>maxTimelineFrame())S.playheadFrame=0;updatePlayheadDom();renderPreview();},1000/Math.min(30,fps));renderPreview();}}
function stopPreview(){if(S.previewTimer){clearInterval(S.previewTimer);S.previewTimer=null;}$$('video',els.previewStage).forEach(v=>v.pause());setIconButton(els.previewPlayBtn,'player-play','播放');}
function openFullscreenPreview(){if(!els.previewFullscreenModal)return;els.previewFullscreenModal.classList.remove('hidden');renderFullscreenPreview();}
function closeFullscreenPreview(){if(!els.previewFullscreenModal)return;els.previewFullscreenModal.classList.add('hidden');$$('video',els.previewFullscreenStage).forEach(v=>v.pause());}
function renderFullscreenPreview(){
  const stage=els.previewFullscreenStage;if(!stage)return;
  const active=activeVisualAt(S.playheadFrame),key=active.map(i=>i.id).join('|');
  if(key!==S.previewActiveKeyFull){S.previewActiveKeyFull=key;stage.innerHTML='';if(!active.length)stage.innerHTML='<div class="preview-empty">No visual at playhead</div>';else for(const item of active){let el;if(item.kind==='text'){el=document.createElement('div');el.className='preview-caption preview-caption-fs';}else{const a=findAsset(item.sourceAssetId);if(!a)continue;el=document.createElement(a.kind==='video'?'video':'img');el.src=a.publicUrl;el.className='preview-media';if(a.kind==='video'){el.muted=true;el.playsInline=true;el.preload='auto';}}el.dataset.previewItem=item.id;stage.append(el);}}
  for(const item of active){const el=stage.querySelector(`[data-preview-item="${CSS.escape(item.id)}"]`);if(!el)continue;if(item.kind==='text'){const st=item.textStyle||{};el.textContent=item.text||'';el.style.left=`${st.x??50}%`;el.style.top=`${st.y??84}%`;el.style.fontSize=`${(st.fontSize||44)*3}px`;el.style.color=st.color||'#fff';el.style.opacity=String(item.opacity??1);continue;}const a=findAsset(item.sourceAssetId);if(!a)continue;const t=item.transform||{};el.style.transform=`translate(${t.x||0}%,${t.y||0}%) scale(${t.scale||1})`;el.style.opacity=String(item.opacity??1);if(a.kind==='video'){const local=(S.playheadFrame-item.startFrame)*(item.playbackRate||1)/(S.timeline.fps||30)+(item.sourceInFrame||0)/(S.timeline.fps||30);const sync=()=>{try{const target=Math.max(0,Math.min(local,Number.isFinite(el.duration)?el.duration:local));if(Math.abs((el.currentTime||0)-target)>.28)el.currentTime=target;el.playbackRate=Math.max(.25,Math.min(4,item.playbackRate||1));if(S.previewTimer)el.play().catch(()=>{});else el.pause();}catch{}};if(el.readyState>=1)sync();else el.addEventListener('loadedmetadata',sync,{once:true});}}
  if(els.previewFullscreenTime)els.previewFullscreenTime.textContent=els.previewTime?.textContent||'';
}
function renderJobs(){const jobs=S.jobs.slice(0,20);els.jobList.innerHTML=jobs.length?jobs.map(j=>`<div class="job"><div class="job-top"><strong>${esc(j.modelId)}</strong><span class="status ${esc(j.status)}">${esc(j.status)}</span></div><div class="asset-meta">${esc(j.capability)} · ${j.progress||0}%</div><div class="progressbar"><span style="width:${j.progress||0}%"></span></div>${j.error?`<div class="asset-meta error-text">${esc(friendlyError(j.error))}</div>`:''}</div>`).join(''):'<div class="empty-state jobs-empty">暂无任务</div>';}
function updateUndoButtons(){if(els.canvasUndoBtn)els.canvasUndoBtn.disabled=!S.canvasHistory.past.length;if(els.canvasRedoBtn)els.canvasRedoBtn.disabled=!S.canvasHistory.future.length;if(els.timelineUndoBtn)els.timelineUndoBtn.disabled=!S.timelineHistory.past.length;if(els.timelineRedoBtn)els.timelineRedoBtn.disabled=!S.timelineHistory.future.length;}


/* ---------------- LibTV menus / tools / provider settings ---------------- */
const NODE_CATALOG=[
  {id:'text.ai',icon:'sparkles',title:'文本',create:(pos)=>addTextGen('rewrite',{},pos)},
  {id:'image.generate',icon:'photo-plus',title:'图片',create:(pos)=>addImage({},pos)},
  {id:'video.generate',icon:'video-plus',title:'视频',create:(pos)=>addVideo({forcedCapability:'video.generate'},pos)},
  {id:'asset.upload',icon:'upload',title:'上传',create:(pos)=>addUploadNode(pos)},
  {id:'asset.history',icon:'history',title:'历史',create:()=>showDrawer('assetDrawer')},
];
function hideMenus(){els.nodeMenu?.classList.add('hidden');els.nodeContextMenu?.classList.add('hidden');S.menuConnectSourceId=null;}
function closeControlDropdowns(except=null){$$('.generator-mode-menu[open],.generator-composer .node-advanced[open]').forEach(menu=>{if(menu!==except)menu.removeAttribute('open');});}
function menuPosition(el,x,y){el.classList.remove('hidden');const r=el.getBoundingClientRect();el.style.left=`${Math.max(8,Math.min(innerWidth-r.width-8,x))}px`;el.style.top=`${Math.max(8,Math.min(innerHeight-r.height-8,y))}px`;}
function showNodeMenu(clientX,clientY,world,{sourceId=null}={}){hideMenus();S.menuWorld=world||screenToWorld(clientX,clientY);S.menuClient={x:clientX,y:clientY};S.menuConnectSourceId=sourceId;renderNodeMenu();menuPosition(els.nodeMenu,clientX,clientY);setTimeout(()=>els.nodeMenuContent?.querySelector('button')?.focus(),0);}
function connectionMenuItemIds(sourceNode){const kind=connectionOutputKind(sourceNode);if(kind==='image')return new Set(['image.generate','video.generate']);if(kind==='video')return new Set(['video.generate']);if(kind==='text')return new Set(['text.ai','image.generate','video.generate']);return new Set(NODE_CATALOG.map(item=>item.id));}
function renderNodeMenu(){
  const allowed=S.menuConnectSourceId?connectionMenuItemIds(nodeById(S.menuConnectSourceId)):null,items=NODE_CATALOG.filter(item=>!allowed||allowed.has(item.id));
  els.nodeMenuContent.innerHTML=items.map(item=>`<button class="node-menu-item" data-node-menu-id="${esc(item.id)}"><span class="node-menu-icon">${icon(item.icon)}</span><span class="node-menu-label">${esc(item.title)}</span></button>`).join('')||'<div class="empty-state" style="height:80px">没有可连接节点</div>';
  $$('[data-node-menu-id]',els.nodeMenuContent).forEach(btn=>btn.addEventListener('click',()=>{const item=NODE_CATALOG.find(entry=>entry.id===btn.dataset.nodeMenuId),sourceId=S.menuConnectSourceId,world=S.menuWorld;hideMenus();const created=item?.create(world);if(sourceId&&created?.id){createEdge(sourceId,created.id);toast('已创建节点并自动连接');}}));
}
function duplicateNode(n){beginCanvasSnapshot();const c=clone(n);c.id=id();c.position={x:n.position.x+36,y:n.position.y+36};c.data={...c.data,status:'idle',progress:0,jobId:null,error:''};S.workflow.nodes.push(c);S.selectedNodeId=c.id;S.selectedNodeIds=[c.id];scheduleSave();renderCanvas();renderEdges();renderInspector();}
function disconnectNode(n){beginCanvasSnapshot();S.workflow.edges=S.workflow.edges.filter(e=>e.source!==n.id&&e.target!==n.id);scheduleSave();renderCanvas();renderEdges();renderInspector();}
function showCanvasContextMenu(x,y){hideMenus();const gen=S.workflow.nodes.filter(isGenerationNode);const hasGen=gen.length>0;const anyExpanded=gen.some(n=>n.data.expanded===true);const allCollapsed=hasGen&&!anyExpanded;els.nodeContextMenu.innerHTML=`<button class="context-menu-item" data-context-action="autoLayout">${icon('layout-grid')}<span>自动排布</span></button>${hasGen?`<button class="context-menu-item" data-context-action="runAll">${icon('player-play')}<span>运行全部</span></button>`:''}<button class="context-menu-item" data-context-action="duplicate">${icon('copy')}<span>复制节点</span></button><button class="context-menu-item" data-context-action="disconnect">${icon('unlink')}<span>断开所有连线</span></button><button class="context-menu-item" data-context-action="inspect">${icon('adjustments-horizontal')}<span>属性</span></button><button class="context-menu-item" data-context-action="toggleComposer">${icon(allCollapsed?'chevrons-down':'chevrons-up')}<span>${allCollapsed?'展开全部输入区':'收起全部输入区'}</span></button><div class="context-sep"></div><button class="context-menu-item danger" data-context-action="delete">${icon('trash')}<span>删除节点</span></button>`;$$('[data-context-action]',els.nodeContextMenu).forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.contextAction;const n=selectedNode();hideMenus();if(a==='autoLayout')autoLayoutNodes();else if(a==='runAll')runAllNodes();else if(a==='duplicate'){if(n)duplicateNode(n);else toast('请先选中一个节点','error');}else if(a==='disconnect'){if(n)disconnectNode(n);else toast('请先选中一个节点','error');}else if(a==='inspect')showDrawer('inspectorDrawer');else if(a==='toggleComposer'){beginCanvasSnapshot();const target=allCollapsed?true:false;S.workflow.nodes.filter(isGenerationNode).forEach(n=>{n.data.expanded=target;});scheduleSave();renderCanvas();renderEdges();renderInspector();new Set(gen.map(n=>n.data.storyboardSourceId).filter(Boolean)).forEach(settleStoryboardLayout);}else if(a==='delete'){if(n)deleteNode(n.id);else toast('请先选中一个节点','error');}}));menuPosition(els.nodeContextMenu,x,y);}
function setTool(tool){S.tool=tool;els.canvas.classList.toggle('tool-pan',tool==='pan');els.canvas.classList.toggle('tool-connect',tool==='connect');$$('[data-tool]',els.mouseTools).forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));}
function showDrawer(id){if(id==='assetDrawer'){hideDrawer('inspectorDrawer');hideDrawer('agentDrawer');}if(id==='inspectorDrawer'){hideDrawer('assetDrawer');hideDrawer('agentDrawer');}if(id==='agentDrawer'){hideDrawer('assetDrawer');hideDrawer('inspectorDrawer');}document.getElementById(id)?.classList.remove('hidden-drawer');}
function hideDrawer(id){document.getElementById(id)?.classList.add('hidden-drawer');if(id==='assetDrawer')S.assetPick=null;}
function setTimelineOpen(open){els.timelineShell?.classList.toggle('collapsed',!open);}
const PROVIDER_FIELDS=[
  {id:'text',name:'OpenAI-Compatible 文本',fields:[['OPENAI_COMPAT_API_KEY','API Key','password'],['OPENAI_COMPAT_BASE_URL','Base URL','text'],['OPENAI_COMPAT_TEXT_MODEL','文本模型','text']]},
  {id:'openaiAgent',name:'OpenAI · 策划 Agent',fields:[['OPENAI_API_KEY','API Key（可复用上方 Key）','password'],['OPENAI_BASE_URL','Responses Base URL','text'],['OPENAI_AGENT_MODEL','Agent 模型','text']]},
  {id:'agnes',name:'Agnes AI · 文本 / 图片 / 视频 / Agent',fields:[['AGNES_API_KEY','API Key','password'],['AGNES_BASE_URL','Base URL','text'],['PUBLIC_BASE_URL','素材公网地址（本地上传图可选）','text'],['AGNES_TEXT_MODEL','文本模型','text'],['AGNES_AGENT_MODEL','Agent 模型','text'],['AGNES_IMAGE_MODEL','图片模型','text'],['AGNES_VIDEO_MODEL','视频模型','text']]},
  {id:'arkImage',name:'Seedream 图片',fields:[['ARK_API_KEY','Ark API Key','password'],['ARK_IMAGE_MODEL','Seedream 模型','text']]},
  {id:'seedance',name:'Seedance 视频',fields:[['ARK_API_KEY','Ark API Key（与 Seedream 共用）','password'],['ARK_VIDEO_MODEL','Seedance 模型','text']]},
  {id:'kling',name:'Kling 视频',fields:[['KLING_ACCESS_KEY','Access Key','password'],['KLING_SECRET_KEY','Secret Key','password'],['KLING_VIDEO_MODEL','模型','text']]},
  {id:'veo',name:'Google Gemini / Veo',fields:[['GEMINI_API_KEY','Gemini API Key','password'],['GEMINI_AGENT_BASE_URL','Gemini Base URL','text'],['GEMINI_AGENT_MODEL','Agent 模型','text'],['VEO_MODEL','Veo 模型','text']]},
  {id:'fal',name:'fal 聚合模型',fields:[['FAL_KEY','fal Key','password'],['FAL_IMAGE_MODEL','图片模型','text'],['FAL_VIDEO_MODEL','视频模型','text']]},
];
async function openProviderSettings(){try{const data=await api('/api/provider-settings');S.providerSettings=data.settings||{};els.providerSettingsForm.innerHTML=PROVIDER_FIELDS.map(p=>`<section class="provider-card"><div class="provider-card-head"><strong><span class="provider-status-dot ${data.configured?.[p.id]?'on':''}"></span>${esc(p.name)}</strong><span class="muted">${data.configured?.[p.id]?'已配置':'未配置'}</span></div><div class="provider-card-body">${p.fields.map(([key,label,type])=>`<label class="${key.includes('BASE_URL')?'wide':''}">${esc(label)}<input data-provider-key="${key}" type="${type}" value="${esc(S.providerSettings[key]||'')}" placeholder="${type==='password'?'留空保持现有密钥':''}"></label>`).join('')}</div></section>`).join('');els.providerModal.classList.remove('hidden');}catch(e){toast(e.message,'error');}}
async function saveProviderSettings(){const patch={};$$('[data-provider-key]',els.providerSettingsForm).forEach(i=>{if(i.value.trim())patch[i.dataset.providerKey]=i.value.trim();});els.providerSaveStatus.textContent='保存中…';try{await api('/api/provider-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});const md=await api('/api/models');S.models=md.models||[];els.providerSaveStatus.textContent='已保存，模型列表已刷新';renderCanvas();renderEdges();setTimeout(()=>els.providerModal.classList.add('hidden'),450);}catch(e){els.providerSaveStatus.textContent=e.message;toast(e.message,'error');}}

/* ---------------- Creative planning Agent ---------------- */
function agentModelKey(model){return `${model.providerId}::${model.modelId}`;}
function renderAgentModels(){const selected=S.agentSession?.selectedProviderId&&`${S.agentSession.selectedProviderId}::${S.agentSession.selectedModelId}`,value=S.agentModels.some(m=>agentModelKey(m)===selected)?selected:agentModelKey(S.agentModels[0]||{});els.agentModelSelect.innerHTML=S.agentModels.length?S.agentModels.map(m=>`<option value="${esc(agentModelKey(m))}" ${agentModelKey(m)===value?'selected':''}>${esc(m.modelId)}</option>`).join(''):'<option value="">请先配置模型</option>';els.agentSendBtn.disabled=!S.agentModels.length;}
function agentProposalHtml(proposal){if(!proposal)return'';const p=proposal.plan,b=p.brief,s=p.styleBible,status=proposal.status==='pending'?'待应用':proposal.status==='applied'?'已应用':'已取代',realImage=S.models.some(m=>m.capabilities?.includes('image.generate')),realVideo=S.models.some(m=>m.capabilities?.includes('video.image_to_video')),warning=realImage&&realVideo?'':`<div class="agent-warning">${!realImage?'未配置真实图片模型。 ':''}${!realVideo?'未配置真实首帧视频模型。 ':''}节点仍会创建，可稍后配置。</div>`;return `<article class="agent-plan-card"><div class="agent-plan-head"><div><span class="agent-plan-status ${esc(proposal.status)}">${status}</span><h3>${esc(b.title)}</h3></div><span>${p.shots.length} 镜头 · ${b.targetDurationSec}s · ${esc(b.aspectRatio)}</span></div><p>${esc(b.logline)}</p><dl><div><dt>受众 / 平台</dt><dd>${esc(b.audience)} · ${esc(b.platform)}</dd></div><div><dt>基调 / 结尾</dt><dd>${esc(b.tone)} · ${esc(b.ending)}</dd></div><div><dt>视觉</dt><dd>${esc(s.visualStyle)} · ${esc(s.palette)}</dd></div><div><dt>镜头 / 光线</dt><dd>${esc(s.cameraLanguage)} · ${esc(s.lighting)}</dd></div></dl><div class="agent-story-arc">${p.storyArc.map((beat,i)=>`<span>${i+1}. ${esc(beat)}</span>`).join('')}</div><div class="agent-shots">${p.shots.map((shot,i)=>`<details><summary><strong>S${i+1} · ${esc(shot.title)}</strong><span>${shot.durationSec}s</span></summary><div><b>目的</b>${esc(shot.purpose)}<b>画面</b>${esc(shot.composition)}；${esc(shot.action)}<b>运镜 / 光线</b>${esc(shot.camera)}；${esc(shot.lighting)}<b>图片提示词</b>${esc(shot.imagePrompt)}<b>视频提示词</b>${esc(shot.videoPrompt)}<b>声音 / 连续性</b>${esc(shot.audioNote)}；${esc(shot.continuityNote)}</div></details>`).join('')}</div>${warning}<div class="agent-impact">将追加 ${p.shots.length} 个图片节点和 ${p.shots.length} 个视频节点；不会创建文本节点、运行生成或修改时间线。</div>${proposal.status==='pending'?`<button class="primary agent-apply" data-agent-apply="${esc(proposal.id)}">应用整份节点图</button>`:''}</article>`;}
function agentMessageHtml(message){const questions=message.questions?.length?`<ol>${message.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol>`:'';return `<div class="agent-message ${esc(message.role)}" data-message-id="${esc(message.id)}">${questions||`<p>${esc(message.content)}</p>`}</div>`;}
function renderAgent(){const session=S.agentSession||{messages:[],proposals:[]};els.agentMessages.innerHTML=session.messages.length?session.messages.map(agentMessageHtml).join(''):'<div class="agent-empty"><strong>从一句想法开始</strong><span>我会先整理创作简报和分镜，确认后只创建节点，不会自动产生媒体费用。</span></div>';els.agentProposal.innerHTML=[...session.proposals].reverse().map(agentProposalHtml).join('');$$('[data-agent-apply]',els.agentProposal).forEach(button=>button.addEventListener('click',e=>applyAgentProposalUI(e.currentTarget.dataset.agentApply)));renderAgentModels();els.agentMessages.scrollTop=els.agentMessages.scrollHeight;}
async function readAgentStream(response,onEvent){const reader=response.body?.getReader();if(!reader)throw new Error('浏览器不支持流式响应');const decoder=new TextDecoder();let buffer='';while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines)if(line.trim())onEvent(JSON.parse(line));}buffer+=decoder.decode();if(buffer.trim())onEvent(JSON.parse(buffer));}
async function loadAgent(){els.agentMessages.innerHTML='<div class="agent-empty">正在读取本地会话…</div>';try{const [models,session]=await Promise.all([api('/api/agent/models'),api(`/api/projects/${S.projectId}/agent`)]);S.agentModels=models.models||[];S.agentSession=session;renderAgent();}catch(e){els.agentMessages.innerHTML=`<div class="agent-empty error-text">${esc(e.message)}</div>`;}}
async function openAgent(){hideDrawer('inspectorDrawer');showDrawer('agentDrawer');await loadAgent();setTimeout(()=>els.agentInput.focus(),0);}
function setAgentBusy(busy){els.agentSendBtn.disabled=busy||!S.agentModels.length;els.agentModelSelect.disabled=busy;els.agentNewBtn.disabled=busy;els.agentCancelBtn.classList.toggle('hidden',!busy);els.agentInput.disabled=busy;}
async function sendAgentMessage(){if(S.agentController)return;const content=els.agentInput.value.trim(),[providerId,modelId]=String(els.agentModelSelect.value||'').split('::');if(!content||!providerId)return;S.agentController=new AbortController();setAgentBusy(true);setIconButton(els.agentSendBtn,'loader-2','策划中…');const localMessage={id:`local-${Date.now()}`,role:'user',content,createdAt:new Date().toISOString()};S.agentSession.messages.push(localMessage);S.agentSession.messages=S.agentSession.messages.slice(-100);els.agentInput.value='';renderAgent();const streamBox=document.createElement('div');streamBox.className='agent-message assistant streaming';streamBox.innerHTML='<p></p>';els.agentMessages.append(streamBox);const paragraph=$('p',streamBox);els.agentMessages.setAttribute('aria-busy','true');try{const response=await fetch(`/api/projects/${S.projectId}/agent/messages`,{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:JSON.stringify({content,providerId,modelId}),signal:S.agentController.signal});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||error.error||`Agent request failed ${response.status}`);}let finalEvent=null;await readAgentStream(response,event=>{if(event.type==='delta'){paragraph.textContent+=event.delta||'';els.agentMessages.scrollTop=els.agentMessages.scrollHeight;}else if(event.type==='reset')paragraph.textContent='';else if(event.type==='error')throw new Error(event.message||'Agent stream failed');else if(event.type==='final')finalEvent=event;});if(!finalEvent)throw new Error('Agent stream ended before the final reply');S.agentSession=finalEvent.session;renderAgent();}catch(e){await loadAgent();if(S.agentController?.signal.aborted)toast('已取消 Agent 请求');else toast(`Agent 失败：${e.message}`,'error');}finally{els.agentMessages.setAttribute('aria-busy','false');S.agentController=null;setAgentBusy(false);setIconButton(els.agentSendBtn,'send-2','发送');}}
async function applyAgentProposalUI(proposalId){const button=els.agentProposal.querySelector('[data-agent-apply]');if(button){button.disabled=true;button.textContent='应用中…';}try{const result=await api(`/api/projects/${S.projectId}/agent/proposals/${proposalId}/apply`,{method:'POST'});beginCanvasSnapshot();S.workflow=result.workflow;S.selectedNodeId=result.briefNodeId||result.appliedNodeIds?.[0]||null;S.selectedNodeIds=S.selectedNodeId?[S.selectedNodeId]:[];S.selectedEdgeId=null;const local=S.agentSession?.proposals?.find(p=>p.id===proposalId);if(local)Object.assign(local,result.proposal);renderAll();renderAgent();requestAnimationFrame(()=>fitNodes(S.workflow.nodes.filter(n=>result.appliedNodeIds.includes(n.id))));toast('Agent 节点图已追加');}catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent='应用整份节点图';}}}
async function clearAgentConversation(){if(!confirm('清空当前项目的 Agent 对话和未应用提案？已创建的画布节点不会删除。'))return;S.agentController?.abort();S.agentSession=await api(`/api/projects/${S.projectId}/agent`,{method:'DELETE'});renderAgent();}

/* ---------------- Persistence / export ---------------- */
function scheduleSave(){els.saveState.textContent='保存中…';clearTimeout(S.saveTimer);S.saveTimer=setTimeout(saveWorkflow,350);}
async function saveWorkflow(){if(!S.projectId)return;try{await api(`/api/projects/${S.projectId}/workflow`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(S.workflow)});els.saveState.textContent='已保存';}catch(e){els.saveState.textContent='保存失败';toast(e.message,'error');}}
function scheduleTimelineSave(){els.saveState.textContent='保存中…';clearTimeout(S.timelineSaveTimer);S.timelineSaveTimer=setTimeout(saveTimeline,300);}
async function saveTimeline(){try{await api(`/api/projects/${S.projectId}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(S.timeline)});els.saveState.textContent='已保存';}catch(e){toast(e.message,'error');}}
async function exportTimeline(){els.exportBtn.disabled=true;setIconButton(els.exportBtn,'loader-2','导出中…');try{await saveTimeline();const asset=await api(`/api/projects/${S.projectId}/timeline/export`,{method:'POST'});await refreshAssets();toast('MP4 导出完成');window.open(asset.publicUrl,'_blank');}catch(e){toast(`导出失败：${e.message}`,'error');}finally{els.exportBtn.disabled=false;setIconButton(els.exportBtn,'download','导出');}}

/* ---------------- Global pointer state machine ---------------- */
function setupGlobalInteractions(){
  els.canvas.addEventListener('pointerdown',e=>{
    if(e.target.closest('.node')||e.target.closest('.edge-hit'))return;
    hideMenus();
    if(e.button===1||S.tool==='pan'||S.spaceDown){e.preventDefault();S.interaction={type:'pan',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,startView:{...S.view}};els.canvas.setPointerCapture?.(e.pointerId);els.canvas.classList.add('panning');return;}
    if(e.button===0){e.preventDefault();S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];const marquee=document.createElement('div');marquee.className='selection-marquee';els.canvas.append(marquee);S.interaction={type:'marquee',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,el:marquee};els.canvas.setPointerCapture?.(e.pointerId);updateCanvasSelectionDom();renderEdges();renderInspector();}
  });
  els.canvas.addEventListener('dblclick',e=>{if(e.target.closest('.node')||e.target.closest('.edge-hit'))return;e.preventDefault();showNodeMenu(e.clientX,e.clientY,screenToWorld(e.clientX,e.clientY));});
  els.canvas.addEventListener('contextmenu',e=>{if(e.target.closest('.node')||e.target.closest('.edge-hit'))return;e.preventDefault();showCanvasContextMenu(e.clientX,e.clientY);});
  els.canvas.addEventListener('dragover',e=>{if(!hasDraggedFiles(e)&&!hasDraggedAsset(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';els.canvas.classList.add('file-drag-active');});
  els.canvas.addEventListener('dragleave',e=>{if(!els.canvas.contains(e.relatedTarget))els.canvas.classList.remove('file-drag-active');});
  els.canvas.addEventListener('drop',e=>{if(!hasDraggedFiles(e)&&!hasDraggedAsset(e))return;e.preventDefault();els.canvas.classList.remove('file-drag-active');const draggedAsset=findAsset(e.dataTransfer.getData(ASSET_DRAG_TYPE));if(draggedAsset)return addAssetNode(draggedAsset,screenToWorld(e.clientX,e.clientY));const node=addUploadNode(screenToWorld(e.clientX,e.clientY));uploadFiles([...e.dataTransfer.files],{targetNodeId:node.id});});
  window.addEventListener('pointermove',e=>{const it=S.interaction;if(!it)return;if(it.type==='node-drag'){it.moved=true;const dx=(e.clientX-it.startX)/S.view.zoom,dy=(e.clientY-it.startY)/S.view.zoom;for(const item of it.items){item.node.position.x=Math.round((item.startPos.x+dx)/10)*10;item.node.position.y=Math.round((item.startPos.y+dy)/10)*10;if(item.el){item.el.style.left=`${item.node.position.x}px`;item.el.style.top=`${item.node.position.y}px`;}}$$('.node.drop-target',els.canvasWorld).forEach(el=>el.classList.remove('drop-target'));if(it.items.length===1){const n=it.items[0].node,tgt=dropTargetForNode(n);if(tgt&&canAutoConnect(n,tgt)){const te=els.canvasWorld.querySelector(`[data-id="${tgt.id}"]`);if(te)te.classList.add('drop-target');}}renderEdges();renderInspector();}else if(it.type==='marquee'){const r=els.canvas.getBoundingClientRect(),left=Math.min(it.startX,e.clientX)-r.left,top=Math.min(it.startY,e.clientY)-r.top;Object.assign(it.el.style,{left:`${left}px`,top:`${top}px`,width:`${Math.abs(e.clientX-it.startX)}px`,height:`${Math.abs(e.clientY-it.startY)}px`});}else if(it.type==='connect'){it.x=e.clientX;it.y=e.clientY;clearConnectionTargets();const targetEl=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.node'),source=nodeById(it.sourceId),target=targetEl&&nodeById(targetEl.dataset.id);if(source&&target&&canAutoConnect(source,target))targetEl.classList.add('connection-target');renderEdges();}else if(it.type==='pan'){S.view.x=it.startView.x+e.clientX-it.startX;S.view.y=it.startView.y+e.clientY-it.startY;updateView();}else if(it.type?.startsWith('clip-')||it.type?.startsWith('trim-'))moveTimelineInteraction(e,it);});
  window.addEventListener('pointerup',e=>{const it=S.interaction;if(!it)return;if(it.type==='connect')return finishConnection(e.clientX,e.clientY);if(it.type==='node-drag'){it.items.forEach(item=>item.el?.classList.remove('dragging'));$$('.node.drop-target',els.canvasWorld).forEach(el=>el.classList.remove('drop-target'));if(it.items.length===1&&it.moved){const n=it.items[0].node,tgt=dropTargetForNode(n);if(tgt&&canAutoConnect(n,tgt)){const before=S.workflow.edges.length;createEdge(n.id,tgt.id);if(S.workflow.edges.length>before){const role=S.workflow.edges.find(e=>e.source===n.id&&e.target===tgt.id)?.role;toast(`已连接：${n.type==='imageGen'?'图片':'节点'} → ${tgt.type==='videoGen'?'视频':'节点'}${role?`（${role}）`:''}`);}}}scheduleSave();}if(it.type==='marquee'){const a=screenToWorld(it.startX,it.startY),b=screenToWorld(e.clientX,e.clientY),box={left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)},screenBox={left:Math.min(it.startX,e.clientX),right:Math.max(it.startX,e.clientX),top:Math.min(it.startY,e.clientY),bottom:Math.max(it.startY,e.clientY)};S.selectedNodeIds=S.workflow.nodes.filter(node=>node.position.x<box.right&&node.position.x+nodeWidth(node)>box.left&&node.position.y<box.bottom&&node.position.y+nodeHeight(node)>box.top).map(node=>node.id);S.selectedNodeId=S.selectedNodeIds[0]||null;S.selectedEdgeId=S.selectedNodeIds.length?null:(S.workflow.edges.find(edge=>edgeIntersectsScreenBox(edge,screenBox))?.id||null);it.el.remove();updateCanvasSelectionDom();renderEdges();renderInspector();}if(it.type==='pan')els.canvas.classList.remove('panning');if(it.type?.startsWith('clip-')||it.type?.startsWith('trim-')){it.el.classList.remove('dragging');scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();}S.interaction=null;});
  els.canvas.addEventListener('wheel',e=>{e.preventDefault();const r=els.canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,wx=(mx-S.view.x)/S.view.zoom,wy=(my-S.view.y)/S.view.zoom,nz=Math.min(2.5,Math.max(.25,S.view.zoom*(e.deltaY>0?.9:1.1)));S.view.x=mx-wx*nz;S.view.y=my-wy*nz;S.view.zoom=nz;updateView();},{passive:false});
  els.timelineRuler.addEventListener('pointerdown',e=>{const r=els.timelineRuler.getBoundingClientRect();S.playheadFrame=Math.max(0,Math.round((e.clientX-r.left+els.timelineRuler.scrollLeft)/timelinePx()));renderTimeline();renderPreview();});
  els.timelineBody.addEventListener('scroll',syncTimelineRulerScroll,{passive:true});
  els.timelineBody.addEventListener('pointerdown',e=>{if(e.target.closest('.clip')||e.target.closest('button'))return;const lane=e.target.closest('.track-lane');if(lane){const r=lane.getBoundingClientRect();S.playheadFrame=Math.max(0,Math.round((e.clientX-r.left)/timelinePx()));renderTimeline();renderPreview();}});
  document.addEventListener('pointerdown',e=>{const controlMenu=e.target.closest('.generator-mode-menu,.generator-composer .node-advanced');closeControlDropdowns(controlMenu);if(!e.target.closest('.node-menu')&&!e.target.closest('.context-menu')&&!e.target.closest('#addNodeBtn'))hideMenus();});
}
function moveTimelineInteraction(e,it){const px=timelinePx(),df=Math.round((e.clientX-it.startX)/px),item=it.item;if(it.type==='clip-drag'){item.startFrame=snapFrame(Math.max(0,it.start.startFrame+df),item.id);const under=document.elementFromPoint(e.clientX,e.clientY)?.closest('.track-lane');if(under){const track=under.dataset.track;if(item.kind==='audio'&&track.startsWith('A'))item.track=track;else if(item.kind==='text'&&track==='C1')item.track=track;else if(['image','video'].includes(item.kind)&&track.startsWith('V'))item.track=track;}it.el.style.left=`${item.startFrame*px}px`;}else if(it.type==='clip-slip'){const asset=findAsset(item.sourceAssetId),rate=Math.max(.25,Number(item.playbackRate||1)),sourceLen=asset?.durationMs?Math.round(asset.durationMs/1000*(S.timeline.fps||30)):Number.POSITIVE_INFINITY,span=Math.round(item.durationInFrames*rate),desired=it.start.sourceIn+Math.round(df*rate),maxIn=Number.isFinite(sourceLen)?Math.max(0,sourceLen-span):Math.max(0,desired);item.sourceInFrame=Math.max(0,Math.min(maxIn,desired));item.sourceOutFrame=item.sourceInFrame+span;renderInspector();}else if(it.type==='trim-right'){const newDur=Math.max(1,it.start.duration+df);item.durationInFrames=newDur;item.sourceOutFrame=it.start.sourceIn+Math.round(newDur*(item.playbackRate||1));it.el.style.width=`${Math.max(24,newDur*px)}px`;}else if(it.type==='trim-left'){const maxShift=it.start.duration-1,shift=Math.max(-it.start.sourceIn,Math.min(maxShift,df)),newStart=it.start.startFrame+shift,newDur=it.start.duration-shift;item.startFrame=Math.max(0,snapFrame(newStart,item.id));const actualShift=item.startFrame-it.start.startFrame;item.durationInFrames=Math.max(1,it.start.duration-actualShift);item.sourceInFrame=Math.max(0,it.start.sourceIn+Math.round(actualShift*(item.playbackRate||1)));item.sourceOutFrame=it.start.sourceOut;it.el.style.left=`${item.startFrame*px}px`;it.el.style.width=`${Math.max(24,item.durationInFrames*px)}px`;}}

/* ---------------- Bind toolbar / keyboard ---------------- */
els.newProjectBtn.addEventListener('click',async()=>{const name=prompt('项目名称','New Project');if(!name)return;const p=await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});S.projects.unshift(p);renderProjectSelect();await openProject(p.id);});
els.projectSelect.addEventListener('change',()=>openProject(els.projectSelect.value));
$$('[data-welcome-action]').forEach(button=>button.addEventListener('pointerdown',event=>event.stopPropagation()));
$$('[data-welcome-action]').forEach(button=>button.addEventListener('click',()=>addWelcomeNode(button.dataset.welcomeAction)));
els.addImageBtn?.addEventListener('click',()=>addImage());els.addVideoBtn?.addEventListener('click',()=>addVideo());
els.addNodeBtn?.addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();showNodeMenu(r.left,r.top-420,findOpenNodePosition());});
$$('[data-tool]',els.mouseTools).forEach(b=>b.addEventListener('click',()=>setTool(S.tool===b.dataset.tool?'select':b.dataset.tool)));
els.uploadBtn.addEventListener('click',()=>{S.uploadTargetNodeId=null;els.fileInput.click();});els.fileInput.addEventListener('change',()=>{const targetNodeId=S.uploadTargetNodeId;S.uploadTargetNodeId=null;uploadFiles([...els.fileInput.files],{targetNodeId});els.fileInput.value='';});els.fileInput.addEventListener('cancel',()=>{S.uploadTargetNodeId=null;});els.refreshAssetsBtn.addEventListener('click',refreshAssets);els.exportBtn.addEventListener('click',exportTimeline);
els.assetDrawerBtn?.addEventListener('click',()=>showDrawer('assetDrawer'));els.timelineToggleBtn?.addEventListener('click',()=>setTimelineOpen(els.timelineShell.classList.contains('collapsed')));els.timelineCloseBtn?.addEventListener('click',()=>setTimelineOpen(false));
$$('[data-close-drawer]').forEach(b=>b.addEventListener('click',()=>hideDrawer(b.dataset.closeDrawer)));
els.providerSettingsBtn?.addEventListener('click',openProviderSettings);els.providerModalClose?.addEventListener('click',()=>els.providerModal.classList.add('hidden'));els.providerSaveBtn?.addEventListener('click',saveProviderSettings);els.providerModal?.addEventListener('pointerdown',e=>{if(e.target===els.providerModal)els.providerModal.classList.add('hidden');});
els.helpBtn?.addEventListener('click',()=>els.helpModal.classList.remove('hidden'));els.helpModalClose?.addEventListener('click',()=>els.helpModal.classList.add('hidden'));els.helpModal?.addEventListener('pointerdown',e=>{if(e.target===els.helpModal)els.helpModal.classList.add('hidden');});
els.textOutputModalClose?.addEventListener('click',closeTextOutputPage);els.textOutputModal?.addEventListener('pointerdown',e=>{if(e.target===els.textOutputModal)closeTextOutputPage();});
els.textOutputTable?.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});
els.textOutputTable?.addEventListener('paste',e=>{if(!e.target.closest('td[contenteditable="true"]'))return;const value=e.clipboardData?.getData('text/plain');if(value==null)return;e.preventDefault();document.execCommand('insertText',false,value.replace(/\s*\r?\n\s*/g,' '));});
els.textOutputContinuityBtn?.addEventListener('click',toggleContinuityReport);els.textOutputStoryboardBtn?.addEventListener('click',()=>{const source=nodeById(S.textOutputNodeId);return source?.data?.preset==='video_script'?createStoryboardScriptFromVideoScript():createStoryboardFromScript();});els.textOutputEditBtn?.addEventListener('click',toggleTextOutputEditing);els.textOutputSaveBtn?.addEventListener('click',saveTextOutputEdits);
els.textOutputCopyBtn?.addEventListener('click',()=>copyTextValue(textOutputDraftValue(),'已复制脚本全文'));
els.agentBtn?.addEventListener('click',openAgent);els.agentSendBtn?.addEventListener('click',sendAgentMessage);els.agentCancelBtn?.addEventListener('click',()=>S.agentController?.abort());els.agentNewBtn?.addEventListener('click',clearAgentConversation);els.agentInput?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendAgentMessage();}});
els.addTextClipBtn?.addEventListener('click',addTextClip);els.timelineZoomInBtn?.addEventListener('click',()=>{S.timelineZoom=Math.min(4,S.timelineZoom*1.25);els.timelineZoomLabel.textContent=`${Math.round(S.timelineZoom*100)}%`;renderTimeline();});els.timelineZoomOutBtn?.addEventListener('click',()=>{S.timelineZoom=Math.max(.4,S.timelineZoom/1.25);els.timelineZoomLabel.textContent=`${Math.round(S.timelineZoom*100)}%`;renderTimeline();});
els.crossfadeBtn?.addEventListener('click',crossfadeWithNext);els.timelineRefBtn?.addEventListener('click',createReferenceFromClip);els.deleteClipBtn?.addEventListener('click',()=>deleteSelectedClip());els.splitClipBtn?.addEventListener('click',splitSelectedClip);els.duplicateClipBtn?.addEventListener('click',duplicateSelectedClip);els.rippleDeleteBtn?.addEventListener('click',()=>deleteSelectedClip({ripple:true}));
els.canvasUndoBtn?.addEventListener('click',canvasUndo);els.canvasRedoBtn?.addEventListener('click',canvasRedo);els.timelineUndoBtn?.addEventListener('click',timelineUndo);els.timelineRedoBtn?.addEventListener('click',timelineRedo);els.previewPlayBtn?.addEventListener('click',togglePreview);
els.previewFullscreenBtn?.addEventListener('click',openFullscreenPreview);els.previewFullscreenCloseBtn?.addEventListener('click',closeFullscreenPreview);els.previewFullscreenPlayBtn?.addEventListener('click',togglePreview);els.previewFullscreenModal?.addEventListener('pointerdown',e=>{if(e.target===els.previewFullscreenModal)closeFullscreenPreview();});
els.mediaLightboxClose?.addEventListener('click',closeMediaLightbox);els.mediaLightbox?.addEventListener('pointerdown',e=>{if(e.target===els.mediaLightbox)closeMediaLightbox();});
els.assetPromptClose?.addEventListener('click',closeAssetPrompt);els.assetPromptModal?.addEventListener('pointerdown',e=>{if(e.target===els.assetPromptModal)closeAssetPrompt();});els.assetPromptCopy?.addEventListener('click',()=>copyTextValue(els.assetPromptText.value,'提示词已复制'));
els.fitBtn.addEventListener('click',fitCanvas);els.runAllBtn?.addEventListener('click',runAllNodes);els.zoomInBtn.addEventListener('click',()=>{S.view.zoom=Math.min(2.5,S.view.zoom*1.15);updateView();});els.zoomOutBtn.addEventListener('click',()=>{S.view.zoom=Math.max(.25,S.view.zoom/1.15);updateView();});
function keyboardTargetAllowsTextEntry(target){return target instanceof Element&&Boolean(target.closest('textarea,[contenteditable="true"],[role="textbox"],input:not([type]),input[type="email"],input[type="number"],input[type="password"],input[type="search"],input[type="tel"],input[type="text"],input[type="url"]'));}
function keyboardTargetConsumesShortcuts(target){return target instanceof Element&&Boolean(target.closest('input,textarea,select,button,a,summary,[contenteditable="true"],[role="button"],[role="menuitem"],[role="option"],[role="textbox"]'));}
function releaseSpacePan(){if(!S.spaceDown)return;S.spaceDown=false;els.canvas.classList.toggle('tool-pan',S.tool==='pan');}
function handleSpacePanKeydown(e){if(e.code!=='Space'||keyboardTargetAllowsTextEntry(e.target))return false;if(!e.repeat){S.spaceDown=true;els.canvas.classList.add('tool-pan');}e.preventDefault();e.stopPropagation();return true;}
function handleSpacePanKeyup(e){if(e.code!=='Space')return false;const handled=S.spaceDown||!keyboardTargetAllowsTextEntry(e.target);releaseSpacePan();if(handled){e.preventDefault();e.stopPropagation();}return handled;}
window.addEventListener('keydown',e=>{if(handleSpacePanKeydown(e))return;const deleteKey=e.key==='Delete'||e.key==='Backspace'||e.code==='Delete'||e.code==='Backspace',textEntry=keyboardTargetAllowsTextEntry(e.target);if(deleteKey&&!textEntry){e.preventDefault();if(S.selectedNodeIds.length)deleteSelectedNodes();else if(S.selectedEdgeId)deleteSelectedEdge();else if(S.selectedClipId)deleteSelectedClip();return;}const editing=keyboardTargetConsumesShortcuts(e.target);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?canvasRedo():canvasUndo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!editing){e.preventDefault();canvasRedo();return;}if(!editing&&e.key.toLowerCase()==='v')setTool('select');if(!editing&&e.key.toLowerCase()==='h')setTool(S.tool==='pan'?'select':'pan');if(!editing&&e.key.toLowerCase()==='f')fitCanvas();if(e.key.toLowerCase()==='s'&&!editing&&S.selectedClipId){e.preventDefault();splitSelectedClip();return;}if(e.key==='Escape'){S.interaction?.el?.remove?.();S.interaction=null;S.selectedNodeId=null;S.selectedNodeIds=[];S.agentController?.abort();hideMenus();els.providerModal.classList.add('hidden');els.helpModal.classList.add('hidden');hideDrawer('agentDrawer');els.connectionToast.classList.add('hidden');closeFullscreenPreview();closeMediaLightbox();closeAssetPrompt();closeTextOutputPage();updateCanvasSelectionDom();renderEdges();}},{capture:true});
window.addEventListener('keyup',handleSpacePanKeyup,{capture:true});
window.addEventListener('blur',releaseSpacePan);
setTool('select');
init();
