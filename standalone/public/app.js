import { IMAGE_PRESET_CATEGORIES, imagePresetById, imagePresetsForCategory, setImagePresetLibrary, closestSupportedAspectRatio, composePresetRequestPrompt, composeImagePresetPrompt } from './image-presets.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const els = Object.fromEntries([
  'workspaceIcon','projectSelect','newProjectBtn','saveState','addImageBtn','addVideoBtn','uploadBtn','exportBtn','fileInput','welcomeCards','canvasNotice',
  'refreshAssetsBtn','assetList','assetLibraryTabs','promptLibraryList','canvas','canvasWorld','edgesLayer','inspector','jobList','jobSummary','archiveCompletedJobsBtn','fitBtn','zoomOutBtn','zoomInBtn','zoomLabel',
  'connectionToast','timelineBody','timelineRuler','timelineMeta','timelineHint','timelineRefBtn','deleteClipBtn','splitClipBtn','duplicateClipBtn','crossfadeBtn','rippleDeleteBtn',
  'timelineUndoBtn','timelineRedoBtn','addTextClipBtn','timelineZoomOutBtn','timelineZoomInBtn','timelineZoomLabel','canvasUndoBtn','canvasRedoBtn','runAllBtn','previewStage','previewPlayBtn','previewTime','previewFullscreenBtn','previewFullscreenModal','previewFullscreenStage','previewFullscreenPlayBtn','previewFullscreenTime','previewFullscreenCloseBtn','mediaLightbox','mediaLightboxStage','mediaLightboxClose','assetPromptModal','assetPromptText','assetPromptCopy','assetPromptClose','toastRoot',
  'addNodeBtn','nodeMenu','nodeMenuContent','nodeContextMenu','mouseTools','createProjectModal','createProjectInput','createProjectCancel','createProjectConfirm','deleteProjectModal','deleteProjectMessage','deleteProjectCancel','deleteProjectConfirm','providerSettingsBtn','providerModal','providerModalClose','providerSettingsForm','providerSaveBtn','providerSaveStatus','assetDrawerBtn','assetDrawer','assetFilterChips','inspectorDrawer','timelineToggleBtn','timelineShell','timelineCloseBtn','helpBtn','helpModal','helpModalClose','textOutputModal','textOutputTitle','textOutputMeta','textOutputTable','textOutputEditor','textOutputContinuityBtn','textOutputStoryboardBtn','textOutputEditBtn','textOutputSaveBtn','textOutputModalClose','textOutputCopyBtn','agentBtn','agentOverlay','agentResizer','agentModelSelect','agentHistoryBtn','agentHistoryMenu','agentNewConversationBtn','agentMessages','agentEmptyState','agentStatus','agentPromptForm','agentPromptInput','agentPromptSourceMenu','agentPromptPlusBtn','agentDictationBtn','agentSendBtn'
].map(id => [id, document.getElementById(id)]));

const NODE_W = 300;
const GENERATION_NODE_W = 500;
const GENERATION_PREVIEW_W = 430;
const NODE_GAP_X = 20;
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
  interaction: null, spaceDown: false, suppressNodeClickId: null, saveTimer: null, saveInFlight: null, saveQueued: false, workflowBase: null, timelineSaveTimer: null, projectSwitching: false, homeMode: false, jobFilter: 'all', archivedJobIds: new Set(), pendingDeleteProjectId: null,
  timelineZoom: 1, playheadFrame: 0, previewTimer: null, previewActiveKey: '', previewActiveKeyFull: '',
  tool: 'select', menuWorld: null, menuClient: null, providerSettings: {}, jobWatchers: new Map(), activeReference: null,
  assetPick:null, assetFilter:{tag:'all',kind:'all'}, assetLibraryTab:'assets', promptLibrary:{categories:[],presets:[]}, uploadTargetNodeId:null, textOutputNodeId:null, textOutputDirect:null, textOutputOriginal:'', canvasNotice:null, canvasNoticeTimer:null,
  agent: { conversations: [], conversationId: '', messages: [], modelKey: '', busy: false, error: '', modelMenuOpen: false, sourceMenuOpen: false, dictating: false },
};

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
let mediaLightboxReturnFocus=null;
let assetPromptReturnFocus=null;
let textOutputReturnFocus=null;
function restoreInteractionFocus(target){if(target?.isConnected)return target.focus?.();const node=selectedNode(),preview=node&&els.canvasWorld?.querySelector(`[data-id="${node.id}"] [data-action="togglePreview"]`);preview?.focus?.();}
function openMediaLightbox(asset){if(!asset||!['image','video'].includes(asset.kind))return;const returnFocus=document.activeElement;prepareModalOpen(els.mediaLightbox);mediaLightboxReturnFocus=returnFocus;els.mediaLightbox.dataset.kind=asset.kind;els.mediaLightboxStage.innerHTML=asset.kind==='image'?`<img src="${esc(asset.publicUrl)}" alt="${esc(asset.filename||'图片预览')}">`:customVideoPlayerMarkup(asset.publicUrl,{autoplay:true,className:'media-lightbox-player',label:asset.filename||'视频预览'});bindCustomVideoPlayers(els.mediaLightboxStage);els.mediaLightbox.classList.remove('hidden');requestAnimationFrame(()=>els.mediaLightboxClose?.focus());}
function closeMediaLightbox(){els.mediaLightboxStage?.querySelector('video')?.pause();els.mediaLightbox?.classList.add('hidden');els.mediaLightbox?.removeAttribute('data-kind');if(els.mediaLightboxStage)els.mediaLightboxStage.innerHTML='';restoreInteractionFocus(mediaLightboxReturnFocus);mediaLightboxReturnFocus=null;}
function assetPrompt(a){return String(a?.metadata?.prompt||a?.metadata?.agnesResult?.request_params?.prompt||'').replace(/\s+/g,' ').trim();}
function openAssetPrompt(a){const prompt=assetPrompt(a),returnFocus=document.activeElement;prepareModalOpen(els.assetPromptModal);assetPromptReturnFocus=returnFocus;els.assetPromptText.value=prompt||'上传素材未包含提示词';els.assetPromptCopy.disabled=!prompt;els.assetPromptModal.classList.remove('hidden');requestAnimationFrame(()=>prompt?els.assetPromptCopy.focus():els.assetPromptClose.focus());}
function closeAssetPrompt(){els.assetPromptModal.classList.add('hidden');restoreInteractionFocus(assetPromptReturnFocus);assetPromptReturnFocus=null;}
function friendlyError(v){const message=String(v||'');if(['Agnes video image references require PUBLIC_BASE_URL pointing to this Studio','当前图片仅保存在本机，Agnes 视频无法访问。请重新运行 Agnes 图片节点后再生成视频；本地上传图片需在“模型/API → Agnes AI”配置素材公网地址'].includes(v))return '该图片没有 Agnes 可访问的公网地址。请配置素材公网地址，或改用支持内联图片的模型。';if(/fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message))return '暂时无法连接 Agnes 服务，请检查网络和“模型/API”配置后重试。';if(/video queue is full/i.test(message))return '视频服务当前排队已满，自动重试仍未成功，请稍后点击重试。图片、提示词和参数已保留。';if(/rate limit|rate exceeded|allows\s+\d+\s+requests?\s+per/i.test(message))return 'Agnes 视频接口触发频率限制（当前约每分钟 2 次），请等待限流窗口结束后再重试。图片、提示词和参数已保留。';return v;}
function icon(name) { return `<i class="ui-icon${name==='loader-2'?' icon-spin':''}" style="--icon:url('/vendor/icons/${name}.svg')" aria-hidden="true"></i>`; }
function customVideoPlayerMarkup(src,{autoplay=false,className='',label='视频预览'}={}){return `<div class="custom-video-player ${esc(className)}" data-video-player><video class="node-media node-media-video" src="${esc(src)}" ${autoplay?'autoplay':''} playsinline preload="metadata" aria-label="${esc(label)}"></video><button type="button" class="custom-video-center-play" data-video-action="play" aria-label="播放">${icon('player-play')}</button><div class="custom-video-controls" role="group" aria-label="视频播放控制"><button type="button" data-video-action="play" aria-label="播放">${icon('player-play')}</button><span class="custom-video-time" data-video-time>0:00 / 0:00</span><input type="range" min="0" max="1000" value="0" step="1" data-video-seek aria-label="视频进度"><button type="button" data-video-action="mute" aria-label="静音">${icon('volume')}</button><button type="button" data-video-action="fullscreen" aria-label="全屏播放">${icon('arrows-maximize')}</button></div></div>`;}
function formatMediaTime(seconds){const value=Number.isFinite(seconds)?Math.max(0,seconds):0,minutes=Math.floor(value/60),secs=Math.floor(value%60);return `${minutes}:${String(secs).padStart(2,'0')}`;}
function bindCustomVideoPlayers(root=document){$$('[data-video-player]',root).forEach(player=>{if(player.dataset.videoBound)return;player.dataset.videoBound='1';const video=$('video',player),playButtons=$$('[data-video-action="play"]',player),mute=$('[data-video-action="mute"]',player),fullscreen=$('[data-video-action="fullscreen"]',player),seek=$('[data-video-seek]',player),time=$('[data-video-time]',player);const stop=e=>e.stopPropagation(),update=()=>{const duration=Number.isFinite(video.duration)?video.duration:0,current=Number.isFinite(video.currentTime)?video.currentTime:0,playing=!video.paused&&!video.ended;player.classList.toggle('is-playing',playing);playButtons.forEach(button=>{button.setAttribute('aria-label',playing?'暂停':'播放');button.innerHTML=icon(playing?'player-pause':'player-play');});mute.setAttribute('aria-label',video.muted?'取消静音':'静音');mute.innerHTML=icon(video.muted?'volume-off':'volume');if(seek){seek.value=duration?String(Math.round(current/duration*1000)):'0';seek.style.setProperty('--video-progress',`${duration?current/duration*100:0}%`);}if(time)time.textContent=`${formatMediaTime(current)} / ${formatMediaTime(duration)}`;};$$('button,input',player).forEach(control=>['pointerdown','click','dblclick'].forEach(type=>control.addEventListener(type,stop)));playButtons.forEach(button=>button.addEventListener('click',()=>{if(video.paused||video.ended){$$('[data-video-player] video').forEach(other=>{if(other!==video)other.pause();});video.play().catch(()=>{});}else video.pause();}));mute.addEventListener('click',()=>{video.muted=!video.muted;update();});seek?.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)/1000*video.duration;update();});fullscreen.addEventListener('click',()=>{if(document.fullscreenElement===player)document.exitFullscreen?.();else player.requestFullscreen?.();});['loadedmetadata','durationchange','timeupdate','play','pause','ended','volumechange'].forEach(type=>video.addEventListener(type,update));update();});}
function setIconButton(el, name, label) { if (el) el.innerHTML = `${icon(name)}<span>${esc(label)}</span>`; }
function id() { return crypto.randomUUID(); }
function clone(v) { return structuredClone(v); }
function toast(message, type='info') { const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; els.toastRoot.append(el); setTimeout(()=>el.remove(),3600); }
function renderCanvasNotice(){const el=els.canvasNotice;if(!el)return;const notice=S.canvasNotice,n=notice&&nodeById(notice.nodeId);if(!notice||!n){el.className='canvas-notice hidden';el.innerHTML='';return;}el.className='canvas-notice error';el.innerHTML=`<strong>生成失败</strong><span>${esc(notice.message)}</span>`;}
function setCanvasNotice(n,message){clearTimeout(S.canvasNoticeTimer);S.canvasNoticeTimer=null;S.canvasNotice=n&&message?{nodeId:n.id,message:friendlyError(message)}:null;renderCanvasNotice();if(S.canvasNotice){S.canvasNoticeTimer=setTimeout(()=>{S.canvasNotice=null;S.canvasNoticeTimer=null;renderCanvasNotice();},5000);}}
async function api(path, opts={}) { const res=await fetch(path,opts); const ct=res.headers.get('content-type')||''; const body=ct.includes('application/json')?await res.json():await res.text(); if(!res.ok) throw Object.assign(new Error(body?.message||body?.error||`${res.status} ${res.statusText}`),{status:res.status,body}); return body; }
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
    const requestedProjectId = new URLSearchParams(location.search).get('projectId');
    const [modelData,projectData,promptLibrary]=await Promise.all([api('/api/models'),api('/api/projects'),api('/api/prompt-library')]);
    S.promptLibrary=promptLibrary;setImagePresetLibrary(promptLibrary);
    S.models=(modelData.models||[]).filter(model=>model.providerId!=='mock'); S.projects=projectData.projects||[];
    if(!S.projects.length){const p=await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'My LibTV Project'})});S.projects=[p];}
    renderProjectSelect(); await openProject(S.projects.some(project=>project.id===requestedProjectId)?requestedProjectId:S.projects[0].id); setupGlobalInteractions(); bindAssetFilterChips(); bindAssetLibraryTabs();
  } catch(e){ console.error(e); toast(`启动失败：${e.message}`,'error'); }
}

function renderProjectSelect(){
  const nameCounts=new Map();
  for(const project of S.projects)nameCounts.set(project.name,(nameCounts.get(project.name)||0)+1);
  const options=S.projects.map(project=>{
    const duplicate=nameCounts.get(project.name)>1;
    const date=project.updatedAt||project.createdAt;
    const suffix=duplicate&&date?` · ${new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date))}`:'';
    return{value:project.id,label:`${project.name}${suffix}`};
  });
  els.projectSelect.innerHTML=appSelectMarkup({value:S.projectId,options,className:'project-switcher',ariaLabel:'当前画布'});
  $$('[data-app-select-option]',els.projectSelect).forEach(button=>{
    const row=document.createElement('div');row.className='project-option-row';button.before(row);row.append(button);
    const remove=document.createElement('button');remove.type='button';remove.className='project-delete';remove.dataset.projectDelete=button.dataset.appSelectValue;remove.title='删除画布';remove.setAttribute('aria-label',`删除画布 ${button.textContent.trim()}`);remove.disabled=S.projects.length<=1;remove.innerHTML=icon('trash');row.append(remove);
  });
  $$('[data-app-select-option]',els.projectSelect).forEach(button=>button.addEventListener('click',async()=>{
    const projectId=button.dataset.appSelectValue;
    const menu=button.closest('.app-select');
    if(!projectId){closeDetailsMenu(menu,{restoreFocus:false});return;}
    if(projectId===S.projectId){closeDetailsMenu(menu,{restoreFocus:false});if(S.homeMode){S.homeMode=false;renderAll();setTimeout(fitCanvas,0);}return;}
    if(S.projectSwitching)return;
    const summary=$('summary',menu),value=$('.app-select-value',menu);
    S.projectSwitching=true;
    menu?.classList.add('is-loading');
    if(summary){summary.setAttribute('aria-busy','true');summary.setAttribute('aria-disabled','true');}
    if(value)value.textContent='切换中…';
    try{S.homeMode=false;await openProject(projectId);}catch(e){renderProjectSelect();toast(`切换画布失败：${e.message}`,'error');}finally{S.projectSwitching=false;}
  }));
  $$('[data-project-delete]',els.projectSelect).forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();openDeleteProjectConfirm(button.dataset.projectDelete);}));
}
function openDeleteProjectConfirm(projectId){const project=S.projects.find(item=>item.id===projectId);if(!project||S.projects.length<=1)return toast('至少保留一个画布','error');S.pendingDeleteProjectId=projectId;prepareModalOpen(els.deleteProjectModal);els.deleteProjectMessage.textContent=`确定删除“${project.name}”？画布节点、素材和时间线将一并删除，此操作无法撤销。`;els.deleteProjectModal.classList.remove('hidden');requestAnimationFrame(()=>els.deleteProjectCancel.focus());}
function closeDeleteProjectConfirm(){S.pendingDeleteProjectId=null;closeModalElement(els.deleteProjectModal);}
async function deleteProject(projectId){
  const project=S.projects.find(item=>item.id===projectId);if(!project||S.projects.length<=1)return toast('至少保留一个画布','error');
  const wasCurrent=projectId===S.projectId;
  if(wasCurrent){clearTimeout(S.saveTimer);clearTimeout(S.timelineSaveTimer);S.saveTimer=null;S.timelineSaveTimer=null;}
  try{els.deleteProjectConfirm.disabled=true;await api(`/api/projects/${projectId}`,{method:'DELETE'});S.projects=S.projects.filter(item=>item.id!==projectId);S.pendingDeleteProjectId=null;closeModalElement(els.deleteProjectModal);if(wasCurrent){S.homeMode=false;await openProject(S.projects[0].id);}else renderProjectSelect();toast(`已删除画布“${project.name}”`);}catch(e){toast(`删除画布失败：${e.message}`,'error');}finally{els.deleteProjectConfirm.disabled=false;}
}
function openWelcomeHome(){preparePrimarySurface();S.homeMode=true;S.selectedNodeId=S.selectedEdgeId=S.selectedClipId=null;S.selectedNodeIds=[];renderCanvas();renderEdges();renderInspector();}
function openCreateProject(){prepareModalOpen(els.createProjectModal);els.createProjectInput.value=`未命名画布 ${S.projects.length+1}`;els.createProjectModal.classList.remove('hidden');requestAnimationFrame(()=>{els.createProjectInput.focus();els.createProjectInput.select();});}
function closeCreateProject(){closeModalElement(els.createProjectModal);}
async function createProject(){const name=els.createProjectInput.value.trim();if(!name)return els.createProjectInput.focus();els.createProjectConfirm.disabled=true;els.createProjectConfirm.setAttribute('aria-busy','true');try{const p=await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});S.projects.unshift(p);closeCreateProject();renderProjectSelect();await openProject(p.id);toast(`已新建画布“${name}”`);}catch(e){toast(`新建画布失败：${e.message}`,'error');}finally{els.createProjectConfirm.disabled=false;els.createProjectConfirm.removeAttribute('aria-busy');}}
async function openProject(projectId){
  stopPreview(); for(const stop of S.jobWatchers.values())stop(); S.jobWatchers.clear();
  const hadPendingCanvas = S.saveTimer, hadPendingTimeline = S.timelineSaveTimer;
  clearTimeout(S.saveTimer); clearTimeout(S.timelineSaveTimer);
  if (hadPendingCanvas) await saveWorkflow();
  if (hadPendingTimeline) await saveTimeline();
  S.projectId=projectId; S.selectedNodeId=S.selectedEdgeId=S.selectedClipId=null;S.selectedNodeIds=[]; S.canvasHistory={past:[],future:[]}; S.timelineHistory={past:[],future:[]};
  try{S.archivedJobIds=new Set(JSON.parse(localStorage.getItem(`libtv.archivedJobs.${projectId}`)||'[]'));}catch{S.archivedJobIds=new Set();}
  const [workflow,timeline,assets,jobs]=await Promise.all([api(`/api/projects/${projectId}/workflow`),api(`/api/projects/${projectId}/timeline`),api(`/api/projects/${projectId}/assets`),api(`/api/projects/${projectId}/generations`)]);
  S.workflow={version:Number(workflow.version||2),nodes:workflow.nodes||[],edges:workflow.edges||[]};
  S.workflow.nodes.filter(isGenerationNode).forEach(n=>{n.data.expanded=false;});
  S.workflowBase=clone(S.workflow);S.saveQueued=false;
  S.timeline={fps:timeline.fps||30,width:timeline.width||1280,height:timeline.height||720,items:timeline.items||[],tracks:timeline.tracks||{}};
  S.assets=assets.assets||[]; S.jobs=jobs.generations||[]; S.playheadFrame=0; S.previewActiveKey='';
  const promptMigrated=migratePromptNodes(),presetPromptMigrated=migrateImagePresetPrompts(),layoutMigrated=migrateGenerationNodeLayout(),referencesMigrated=migrateNodeReferences(),aspectMigrated=migrateInheritedAspectRatios(),storyboardLayoutMigrated=arrangeAllStoryboardNodes();
  for(const n of S.workflow.nodes.filter(n=>n.type==='videoGen'))n.data.forcedCapability??=inferredVideoCapability(rawNodeReferences(n));
  normalizeTimeline(); renderProjectSelect(); renderAll(); resumeNodeJobs(); await loadAgentConversations(projectId); if(promptMigrated||presetPromptMigrated||layoutMigrated||referencesMigrated||aspectMigrated||storyboardLayoutMigrated)scheduleSave(); requestAnimationFrame(()=>{if(arrangeAllStoryboardNodes(true)){scheduleSave();renderAll();}}); setTimeout(fitCanvas,0);
}
function migrateGenerationNodeLayout(){const nodes=S.workflow.nodes.filter(isGenerationNode);if(!nodes.some(n=>n.data.layoutWidth!==GENERATION_NODE_W))return false;const rows=[];for(const n of [...nodes].sort((a,b)=>a.position.y-b.position.y||a.position.x-b.position.x)){let row=rows.find(r=>Math.abs(r.y-n.position.y)<100);if(!row){row={y:n.position.y,nodes:[]};rows.push(row);}row.nodes.push(n);}for(const row of rows){let cursor=-Infinity;for(const n of row.nodes.sort((a,b)=>a.position.x-b.position.x)){n.position.x=Math.max(n.position.x,cursor);cursor=n.position.x+GENERATION_NODE_W+30;n.data.layoutWidth=GENERATION_NODE_W;}}return true;}
function migrateNodeReferences(){let changed=false;for(const n of S.workflow.nodes){const refs=n.data?.presetReferences;if(!Array.isArray(refs))continue;const normalized=refs.map(ref=>normalizeNodeReference(ref));if(JSON.stringify(refs)!==JSON.stringify(normalized)){n.data.presetReferences=normalized;changed=true;}}return changed;}
function migratePromptNodes(){const prompts=S.workflow.nodes.filter(n=>n.type==='prompt');if(!prompts.length)return false;const promptIds=new Set(prompts.map(n=>n.id));for(const prompt of prompts){const text=String(prompt.data?.text||'').trim();if(!text)continue;for(const edge of S.workflow.edges.filter(e=>e.source===prompt.id)){const target=nodeById(edge.target);if(!target||!['textGen','imageGen','videoGen'].includes(target.type))continue;const current=String(target.data?.prompt||'').trim();target.data??={};target.data.prompt=current?`${text}\n\n${current}`:text;}}S.workflow.nodes=S.workflow.nodes.filter(n=>!promptIds.has(n.id));S.workflow.edges=S.workflow.edges.filter(e=>!promptIds.has(e.source)&&!promptIds.has(e.target));if(promptIds.has(S.selectedNodeId))S.selectedNodeId=null;S.selectedNodeIds=S.selectedNodeIds.filter(id=>!promptIds.has(id));return true;}
function migrateImagePresetPrompts(){let changed=false;for(const n of S.workflow.nodes.filter(n=>n.type==='imageGen'&&n.data?.imagePresetId)){const preset=imagePresetById(n.data.imagePresetId),source=String(n.data.presetSourcePrompt||'参考图片中的主体与场景').trim();if(!preset)continue;const systemPrompt=composeImagePresetPrompt(preset,source),current=String(n.data.prompt||'').trim();if(n.data.presetSystemPrompt!==systemPrompt){n.data.presetSystemPrompt=systemPrompt;changed=true;}n.data.params??={};const updates={imagePresetSourceId:preset.sourceId,presetVersion:preset.version,aspectPolicy:preset.aspectPolicy,presetAspectRatio:preset.aspectRatio,presetValidation:preset.validation};for(const [key,value] of Object.entries(updates))if(JSON.stringify(n.data[key])!==JSON.stringify(value)){n.data[key]=value;changed=true;}if(n.data.params.negativePrompt!==preset.negative){n.data.params.negativePrompt=preset.negative;changed=true;}if(preset.aspectPolicy==='locked'&&n.data.params.aspectRatio!==preset.aspectRatio){n.data.params.aspectRatio=preset.aspectRatio;changed=true;}if(current===systemPrompt||current===source){n.data.prompt='';changed=true;}}return changed;}
function migrateInheritedAspectRatios(){let changed=false;for(const n of S.workflow.nodes.filter(n=>['imageGen','videoGen'].includes(n.type)))changed=inheritUpstreamAspectRatio(n)||changed;return changed;}
function normalizeTimeline(){ for(const t of TRACKS) S.timeline.tracks[t]??={muted:false,hidden:false}; for(const i of S.timeline.items){i.playbackRate??=1;i.volume??=1;i.opacity??=1;i.fadeInFrames??=0;i.fadeOutFrames??=0;i.transform??={x:0,y:0,scale:1};} }
function firstModelKey(cap){ const m=S.models.find(x=>x.capabilities?.includes(cap)); return m?`${m.providerId}::${m.modelId}`:''; }
function modelsFor(cap){return S.models.filter(x=>x.capabilities?.includes(cap));}
function appSelectMarkup({value='',options=[],className='',ariaLabel='',dataField='',dataProviderKey='',dataApimartSelect=false,dataSelectId='',hideChevron=false}){
  const list=options.length?options:[{value:'',label:'无可用选项',disabled:true}],selected=list.find(item=>String(item.value)===String(value))||list[0];
  const attrs=[ariaLabel&&`aria-label="${esc(ariaLabel)}"`,dataField&&`data-field="${esc(dataField)}"`,dataProviderKey&&`data-provider-key="${esc(dataProviderKey)}"`,dataApimartSelect&&'data-apimart-select="1"',dataSelectId&&`data-select-id="${esc(dataSelectId)}"`].filter(Boolean).join(' ');
  return `<details class="app-select ${className}" ${attrs} data-value="${esc(selected.value)}"><summary aria-expanded="false"><span class="app-select-value">${esc(selected.label)}</span>${hideChevron?'':icon('chevron-down')}</summary><div class="app-select-popover" role="listbox">${list.map(item=>`<button type="button" role="option" class="app-select-option ${String(item.value)===String(selected.value)?'active':''}" data-app-select-option data-app-select-value="${esc(item.value)}" ${item.disabled?'disabled':''} aria-selected="${String(item.value)===String(selected.value)}">${esc(item.label)}</button>`).join('')}</div></details>`;
}
function controlValue(control){return control?.matches?.('.app-select')?String(control.dataset.value||''):String(control?.value||'');}
function modelOptionsData(cap,selected){return modelsFor(cap).map(m=>{const value=`${m.providerId}::${m.modelId}`,label=`${String(m.modelId||m.displayName||'').trim()}${m.configured===false?' (未配置)':''}`;return{value,label,selected:value===selected};});}
function modelOptions(cap,selected){return modelOptionsData(cap,selected).map(item=>`<option value="${esc(item.value)}" ${item.selected?'selected':''}>${esc(item.label)}</option>`).join('')||'<option value="">无可用模型</option>';}
function modelSelectMarkup(cap,selected){return appSelectMarkup({value:selected,options:modelOptionsData(cap,selected),className:'generator-model-select',dataField:'modelKey',ariaLabel:'模型'});}
function modelForKey(key){const [providerId,modelId]=String(key||'').split('::');return S.models.find(m=>m.providerId===providerId&&m.modelId===modelId);}
function normalizedImageParams(n){n.data.params??={};const model=modelForKey(n.data.modelKey),c=model?.constraints||{},aspects=c.aspectRatios?.length?c.aspectRatios:['1:1','16:9','9:16','4:3','3:4'],qualities=c.resolutions?.length?c.resolutions:['1K','2K','4K'],quantities=[1,2,4];if(!aspects.includes(n.data.params.aspectRatio))n.data.params.aspectRatio=aspects.includes('16:9')?'16:9':aspects[0];if(!qualities.includes(n.data.params.quality))n.data.params.quality=qualities.includes('1K')?'1K':qualities[0];if(!quantities.includes(Number(n.data.params.variants)))n.data.params.variants=1;return{aspects,qualities,quantities};}
function referenceRoleControl(n){const context=activeReferenceContext(n),label=context?SEMANTIC_REFERENCE_ROLES[context.ref.semanticRole]||'参考类型':'参考类型',optionsHtml=context?Object.entries(SEMANTIC_REFERENCE_ROLES).map(([value,text])=>`<button type="button" data-reference-role="${value}" class="reference-role-option ${context.ref.semanticRole===value?'active':''}">${icon(value==='continuity'?'link':'tag')}<span>${text}</span></button>`).join(''):'<span class="reference-role-empty">先添加或点击参考图片</span>';return `<details class="generator-reference-role-menu"><summary title="参考类型">${icon('adjustments-horizontal')}<span>${label}</span>${icon('chevron-down')}</summary><div class="generator-reference-role-popover">${optionsHtml}</div></details>`;}
function paramChoice(param,value,selected,label,kind=''){return `<button type="button" class="generator-param-choice ${selected?'active':''}" data-param-choice="${esc(param)}" data-param-value="${esc(value)}"><span>${esc(label)}</span></button>`;}
function generationParamMenu(n){if(n.type==='imageGen'){const p=normalizedImageParams(n),aspect=n.data.params.aspectRatio,quality=n.data.params.quality,variants=Number(n.data.params.variants||1),ratioButtons=p.aspects.map(value=>paramChoice('aspectRatio',value,value===aspect,value,'ratio')).join(''),qualityButtons=p.qualities.map(value=>paramChoice('quality',value,value===quality,value,'quality')).join(''),quantityButtons=p.quantities.map(value=>paramChoice('variants',value,value===variants,`${value}张`,'quantity')).join('');return `<details class="generator-param-menu"><summary title="比例、分辨率、数量">${icon('adjustments-horizontal')}<span>${esc(aspect)} · ${esc(quality)} · ${variants}张</span>${icon('chevron-down')}</summary><div class="generator-param-popover"><div class="param-section"><span>分辨率</span><div class="param-choice-grid quality-grid">${qualityButtons}</div></div><div class="param-section"><span>比例</span><div class="param-choice-grid ratio-grid">${ratioButtons}</div></div><div class="param-section"><span>生成数量</span><div class="param-choice-grid quantity-grid">${quantityButtons}</div></div></div></details>`;}const p=normalizedVideoParams(n),audioLabels={ambient:'环境音',silent:'静音',music:'音乐',voiceover:'口播',full:'完整'},aspect=n.data.params.aspectRatio,duration=n.data.params.duration,resolution=n.data.params.resolution,audio=n.data.params.audioMode;return `<details class="generator-param-menu"><summary title="视频参数">${icon('adjustments-horizontal')}<span>${duration}s · ${esc(aspect)} · ${esc(resolution)}</span>${icon('chevron-down')}</summary><div class="generator-param-popover"><div class="param-section"><span>时长</span><div class="param-choice-grid">${p.durations.map(value=>paramChoice('duration',value,Number(value)===Number(duration),`${value}s`,'duration')).join('')}</div></div><div class="param-section"><span>比例</span><div class="param-choice-grid ratio-grid">${p.aspects.map(value=>paramChoice('aspectRatio',value,value===aspect,value,'ratio')).join('')}</div></div><div class="param-section"><span>分辨率</span><div class="param-choice-grid">${p.resolutions.map(value=>paramChoice('resolution',value,value===resolution,value,'quality')).join('')}</div></div><div class="param-section"><span>声音</span><div class="param-choice-grid">${p.audioModes.map(value=>paramChoice('audioMode',value,value===audio,audioLabels[value]||value,'audio')).join('')}</div></div></div></details>`;}
function imageParamControls(n){return `<div class="field generator-model"><label>模型</label>${modelSelectMarkup(imageNodeCapability(n),n.data.modelKey)}</div>${generationParamMenu(n)}`;}
function normalizedVideoParams(n){n.data.params??={};const model=modelForKey(n.data.modelKey),c=model?.constraints||{};const durations=c.durations?.length?c.durations:[5,8,10];const aspects=c.aspectRatios?.length?c.aspectRatios:['16:9','9:16'];const resolutions=c.resolutions?.length?c.resolutions:['720p','1080p'];const audioModes=c.audioModes?.length?c.audioModes:['ambient','silent','music','voiceover','full'];if(!durations.map(Number).includes(Number(n.data.params.duration)))n.data.params.duration=Number(durations[0]);if(!aspects.includes(n.data.params.aspectRatio))n.data.params.aspectRatio=aspects[0];if(!resolutions.includes(n.data.params.resolution))n.data.params.resolution=resolutions[0];if(!audioModes.includes(n.data.params.audioMode))n.data.params.audioMode=audioModes[0];const cap=videoNodeCapability(n);if(model?.providerId==='veo'&&(cap!=='video.generate'||['1080p','4k'].includes(String(n.data.params.resolution).toLowerCase())))n.data.params.duration=8;return{durations,aspects,resolutions,audioModes};}
function inheritUpstreamAspectRatio(n){if(!['imageGen','videoGen'].includes(n?.type))return false;if(n.data?.aspectPolicy==='locked'){n.data.params??={};const preferred=String(n.data.presetAspectRatio||n.data.params.aspectRatio||'');const model=modelForKey(n.data.modelKey),supported=model?.constraints?.aspectRatios||[];if(!preferred||supported.length&&!supported.includes(preferred))return false;const changed=n.data.params.aspectRatio!==preferred;n.data.params.aspectRatio=preferred;n.data.inheritedAspectRatio='';return changed;}const capability=n.type==='imageGen'?imageNodeCapability(n):videoNodeCapability(n);if(capability!=='image.edit'&&!['video.image_to_video','video.first_last_frame'].includes(capability))return false;const refs=collectNodeReferences(n),ref=refs.find(item=>item.role==='first-frame'&&findAsset(item.assetId)?.kind==='image')||refs.find(item=>findAsset(item.assetId)?.kind==='image');if(!ref)return false;const asset=findAsset(ref.assetId),source=nodeById(ref.sourceNodeId),sourceAspect=String(source?.data?.params?.aspectRatio||'');const model=modelForKey(n.data.modelKey),defaults=n.type==='imageGen'?['1:1','16:9','9:16','4:3','3:4']:['16:9','9:16'],supported=model?.constraints?.aspectRatios?.length?model.constraints.aspectRatios:defaults;const measured=closestSupportedAspectRatio(asset?.width,asset?.height,supported),inherited=measured||(supported.includes(sourceAspect)?sourceAspect:'');if(!inherited)return false;n.data.params??={};const changed=n.data.params.aspectRatio!==inherited;n.data.params.aspectRatio=inherited;n.data.inheritedAspectRatio=inherited;return changed;}
function options(values,selected){return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join('');}
function videoParamControls(n){return `${generationParamMenu(n)}${referenceRoleControl(n)}`;}
function renderAll(){renderCanvas();renderCanvasNotice();renderEdges();renderAssets();renderTimeline();renderInspector();renderJobs();updateView();renderPreview();updateUndoButtons();}

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
    const busy=['queued','processing','running'].includes(n.data.status);
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
const STORYBOARD_SCHEMA_VERSION='professional-cn-v4';
const SCRIPT_TABLE_HEADERS=['镜号','阶段/景别','画面描述','文案/旁白','时长','音效/音乐'];
const VIDEO_SCRIPT_TABLE_HEADERS=['节拍','剧情功能','剧情内容','对白/旁白','时长','声音意图'];
const STORYBOARD_TABLE_HEADERS=['镜号','阶段/景别','图片提示词','视频提示词','文案/旁白','时长','音效/音乐'];
const SCRIPT_PRESETS=new Set(['storyboard','video_script','nine_grid_hook','seedance_grid_prompt']);
const DIRECTOR_PLANNING_RULE=`先在内部按导演工作流完成拆解，不要输出分析过程：1）确认题材、受众、平台、画幅、目标时长和上游故事意图；2）锁定上游剧情与节拍顺序，不补写捷径、不改变人物选择和结局；3）建立连续性档案——角色与关系、外形、服化、表演状态，场景方位/时段/天气，道具外形/数量/持有者/状态；4）拆成镜头——每镜只有一个主要叙事目的，写清输入状态→可见动作→结果/承接，保证人物、场景、道具、时间、空间方向、180度轴线和视线连续；5）安排视听语法——景别、焦段、机位、构图、运镜、光色和剪辑点必须服务本镜剧情；6）设计声音——对白/旁白能在镜头时长内说完，环境声、拟音、音乐有明确进出点；7）逐镜自检——无无因状态突变、无重复信息、时长可执行、动作符合真实物理、镜头可生成。禁止堆砌形容词，所有情绪必须落到可见动作、可听声音或可剪辑节拍上。`;
const SCRIPT_TABLE_RULE=`必须按 Markdown 表格输出，固定表头只能是：${SCRIPT_TABLE_HEADER}。每行只写一个镜头；阶段/景别写段落功能、景别和机位；画面描述依次写剧情功能、起始状态、按因果发生的可见动作、结束状态/剪辑承接、场面调度、景别/焦段/机位、运镜、构图、光线/色彩、连续性锚点和真实物理约束；文案/旁白只写实际说出口的内容；时长必须明确到秒；音效/音乐写环境声、拟音、音乐和进出落点；没有内容时填写“—”。表格外不要重复镜头内容。`;
const CINEMATIC_STORY_RULE=`视频脚本是后续分镜的叙事蓝图，不是图片或视频生成提示词，也不承担逐镜摄影参数；可以在视频定位中给出服务内容的整体视觉方向和关键视觉母题。质量标准固定，剧情结构自由。先根据题材、时长、平台和创作目标，在内部选择最合适的叙事方式或少量混合：目标行动、悬疑揭示、关系变化、选择困境、预期反转、循环、观察纪实、情绪诗意、群像交叉、一镜实时、广告论证或实验概念；也可以采用更适合输入的新结构。不得默认套用固定的 Hook、触发、升级、最低谷、高潮、余韵顺序，严禁默认套用“受挫、训练、成功”或“童年、多年后、功成名就”的换皮故事。角色驱动的故事须明确人物当下目标、阻力、选择、代价与改变；非传统剧情须明确观察对象、形式规则、信息变化和意义落点。所有节拍必须具有因果、认知、关系、风险或意象上的必要联系，不能用互不影响的“然后”堆事件。关键结果必须有前置建立，时间、年龄、身份和地点变化必须有可信过渡；禁止无铺垫的贵人、没有代价的胜利、仅靠旁白推进和用蒙太奇跳过关键因果。结尾应回答、反转、深化或有意悬置开场提出的问题。`;
const VIDEO_SCRIPT_TABLE_RULE=`最终答案必须是一份可直接交给导演和分镜师的视频脚本文档，严格按以下顺序输出：# 《片名》；## 1. 视频定位；## 2. 视频脚本；## 3. 剪辑与声音要求。视频定位必须用项目符号明确时长、发布平台与画幅、内容类型与受众、叙事风格、核心命题或冲突、整体情绪、节奏曲线及关键视觉母题；未知信息可依据用户目标采用合理默认，但不得虚构事实。视频脚本章节只放一个 Markdown 剧情节拍表，固定表头必须逐字等于：${VIDEO_SCRIPT_TABLE_HEADER}。节拍数量和顺序由目标时长、叙事方式和信息密度决定，不设固定阶段或固定行数；每行都必须对整体不可替代，并能在标注时长内完成。剧情功能使用适合本片的具体名称，不得机械套用统一阶段。剧情内容写清本节拍进入状态、发生的变化或阻碍、人物行动或信息推进、直接结果、与前后节拍的因果或意义联系；角色驱动时还要写选择、代价和风险变化，非传统结构不得生硬补造冲突。对白/旁白只写实际说出口且画面无法替代的内容，禁止解释画面；声音意图只写对叙事必要的声音事件；时长明确到秒；没有内容填写“—”。剪辑与声音要求必须用项目符号说明开场抓点、段落节奏、关键转折或高潮、结尾策略、环境声/拟音/音乐的总体进入与退出逻辑，只写服务叙事的要求，不提前拆具体摄影机位。表格单元格内不得换行或使用竖线。输出前内部自检：章节齐全；表头和列数正确；结构与题材匹配而非套模板；人物或观察对象清楚；节拍之间存在必要联系；关键结果有前置建立；变化有可信过渡；结尾完成预定意义；总时长与视频定位一致且可执行。`;
const IMAGE_PROMPT_FORMAT=`第[镜头编号]镜，[关键帧类型]。[角色完整描述]，连续性锚点为[角色/服装/道具锚点]。场景位于[场景]，[时间与环境描述]。画面定格在：[关键动作瞬间]。主体位于[位置]，面向[方向]，视线看向[方向]；[其他人物/道具空间关系]。[景别]，[焦段]，[机位]，[构图方式]，[景深]。采用[光线]，整体[色调]，[视觉氛围]，[视觉风格]。真实物理要求：[物理约束]。保持真实人体结构、真实材质、自然光影，禁止肢体畸形、穿模、悬浮、错误道具和不合理空间关系。延续上一镜的角色外貌、服装、道具、场景、人物朝向与空间关系，并保持可与下一镜连续剪接。`;
const VIDEO_PROMPT_FORMAT=`第[镜头编号]镜，时长[秒数]秒。基于本镜首帧生成，严格保持角色身份、脸型、发型、服装、道具、场景、光线与色调一致。剧情功能：[本镜唯一叙事目的]。镜头开始时：[主体位置、姿势、视线、道具与环境状态]。动作过程：[时间段1]完成[动作1]；[时间段2]完成[动作2]；[时间段3]完成[动作3]，动作连续且有明确因果。镜头结束时：[主体位置、姿势、视线、道具状态与动作结果]，结尾保持一拍并可衔接下一镜。主体从[起点]向[方向]移动，面向[方向]，视线看向[方向]；[其他人物/道具运动与空间关系]。[景别]，[焦段]，[机位]；运镜为[单一运镜方式与速度]，[构图方式]，[景深]。采用[光线]，整体[色调]，[视觉氛围]，[视觉风格]，曝光、色温和光线方向稳定。真实物理要求：[人体动力学、重力、惯性、碰撞、材质、衣物、头发与环境约束]。声音：对白/旁白为[内容或无]；环境音为[内容]；拟音为[内容]；音乐为[内容及进出点]。承接上一镜的结束状态，并以明确动作、视线或声音剪辑点衔接下一镜。禁止新增人物、变脸、换装、改变道具和场景结构、瞬移、跳帧、穿模、肢体畸形、无指令切镜、变焦或改变光线。`;
const STORYBOARD_TABLE_RULE=`最终答案必须是一份可直接进入 AI 影像生产的专业分镜文档，严格按以下顺序输出：# 《片名｜AI视频分镜生成脚本》；## 1. 项目统一设定；## 2. 全局角色与场景设定提示词；## 3. 正式分镜拆解；## 4. 统一负面提示词；## 5. AI视频统一运动提示词；## 6. 推荐生成流程；## 7. 角色与场景一致性建议；## 8. 建议生成参数；## 9. 封面图提示词。项目统一设定必须明确画幅、目标时长、视觉风格、主要角色或阵营的固定视觉语言、场景基线与重要生成原则。全局角色与场景设定提示词必须为每个反复出现的核心角色和核心场景分别提供可直接生成参考图的完整中文提示词，写清身份、年龄段、体态、脸型、发型、服装、固定配饰、表情气质、视图要求、背景与禁止项；不得要求复刻真实人物面孔。正式分镜拆解章节只放一个 Markdown 表格，固定表头只能是：${STORYBOARD_TABLE_HEADER}。每行只写一个镜头，镜头粒度通常为3至5秒，并按剧情复杂度调整。图片提示词和视频提示词必须是可直接提交给生成模型的精简中文成品，除专有名词外不得使用英文整句，不得输出分析过程，不得保留任何方括号占位符，不得使用“同上”“保持一致”等缺少具体锚点的省略表达。每条提示词必须独立完整；每镜只允许一个主要叙事目的、一条连续动作链和一种主要运镜，复杂蒙太奇必须拆镜。图片提示词严格按以下固定句序填写：${IMAGE_PROMPT_FORMAT} 图片只描述一个可见关键帧，不得写动作时间轴、运镜过程、对白、旁白、音效或音乐。视频提示词严格按以下固定句序填写：${VIDEO_PROMPT_FORMAT} 视频动作控制在模型可执行范围内，按镜头时长拆成1至3个连续动作，不得在一个镜头中切换时间、地点、人物造型或摄影机位。分镜阶段可以根据剧情设计光线和色彩，但不得强制设置主题色或色值，除非它有明确叙事依据；每项视觉选择都必须服务上游剧情。阶段/景别只写本镜功能、景别和机位；文案/旁白与音效/音乐用于导演审阅，同时必须与视频提示词中的对应内容完全一致；时长明确到秒；没有内容填写“—”；表格单元格内不得换行或使用竖线。统一负面提示词、AI视频统一运动提示词和封面图提示词必须全部使用中文且可直接提交模型；生成流程、一致性建议和生成参数必须针对本项目具体说明，不写空泛教程。`;
const STORYBOARD_HANDOFF_PROMPT=`这是一个已经确认的视频脚本。请只把上游脚本拆解成完整、可执行的专业 AI 视频分镜生成脚本，不改写故事、不新增角色或场景，也不要直接生成图片或视频。先锁定角色、配角、场景、道具、服化、年龄/时间跳跃和首尾呼应，再按规定的九个章节输出；所有角色设定、场景设定、逐镜图片提示词、逐镜视频提示词、负面提示词、统一运动提示词和封面提示词均使用中文。每个镜头必须有明确时长，时间跳跃必须写“多年后/时间跳跃”，连续性变化必须写清“从什么状态变成什么状态”。总时长必须与上游脚本一致或明确说明调整原因。`;
function textSystemForPreset(p){return ({storyboard:`你是导演、摄影指导、场记和 AI 影像提示词工程师。${DIRECTOR_PLANNING_RULE}严格依据上游视频脚本输出导演级分镜，不改变故事、节拍顺序、人物选择和结局。图片负责“这一帧长什么样”，视频负责“这一镜怎么动”，两者禁止互相复制。生成模型不会记住上一条提示词，因此每镜都必须重复角色、服装、道具、场景和光线的具体连续性锚点；闪回、梦境和时间跳跃必须明确标记。${STORYBOARD_TABLE_RULE}`,video_script:`你是成熟商业电影的原创编剧和故事编辑，不模仿任何在世创作者的个人风格。${CINEMATIC_STORY_RULE}先让内容在人物、因果、变化、铺垫回收和时长上成立，再压缩为可进入分镜拆解的视频脚本。允许在视频定位中明确整体视觉方向，具体颜色、光线、摄影与生成提示词留到分镜阶段，不得用摄影术语掩盖薄弱内容。${VIDEO_SCRIPT_TABLE_RULE}`,image_prompt:`把输入描述扩写为可直接提交图片模型的中文提示词，只描述一个可见关键帧，不改变核心意图。不得写动作过程、运镜、对白、旁白、音效或音乐，不得保留方括号占位符。严格按以下固定句序输出：${IMAGE_PROMPT_FORMAT}`,nine_grid_hook:`你是 TikTok/抖音电商信息流短视频分镜专家。这个预设只生成“3x3 强 Hook 九宫格中文分镜脚本”，不要生成 Seedance 成片提示词，不要输出视频最终提示词，不要混入成片参数。${DIRECTOR_PLANNING_RULE}${SCRIPT_TABLE_RULE}必须共9行；前3镜必须是强 Hook，有停滑点、痛点放大、反差或结果前置，并且第3镜前必须出现产品或解决方案；中间3镜展示核心卖点和使用场景；最后3镜完成信任背书和转化收束。表格前只保留一行统一视觉基调，表格后只询问用户是否确认。`,seedance_grid_prompt:`你是 Seedance 2.0/C端2.0 视频提示词工程师。这个预设只生成“九宫格成片 Seedance 最终视频提示词”，不要重新生成九宫格分镜脚本，也不要重新设计分镜或混入强 Hook 分镜内容。基于用户提供的九宫格脚本、9段图片提示词或上游文本，整理成可直接用于 Seedance 的最终视频生成提示词。${SCRIPT_TABLE_RULE}必须完整覆盖9镜，按从上到下、从左到右顺序填写具体时间码、景别/运镜、主体动作、卖点表达、场景、构图、光线、声音设计、产品一致性和真实物理约束。禁止字幕和画面文字，除非用户明确要求。`,rewrite:'保持原意，提升表达、结构和可执行性。'})[p]||'根据用户输入生成高质量文本。';}
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
function generationPreviewAsset(n,kind){return nodeOutputAssets(n).map(findAsset).find(a=>a?.kind===kind)||(n.data.previousOutputAssetIds||[]).map(findAsset).find(a=>a?.kind===kind)||null;}
function imageGenerationPreview(n){const out=generationPreviewAsset(n,'image');if(out)return `<div class="node-current-preview"><img class="node-media" src="${esc(out.publicUrl)}" alt="当前生成图片"></div>`;const ref=collectNodeReferences(n).map(item=>findAsset(item.assetId)).find(a=>a?.kind==='image');if(ref)return `<div class="node-reference-preview"><img class="node-media" src="${esc(ref.publicUrl)}" alt="参考图片预览"></div>`;return generationPlaceholder('photo-plus',[['upload','图生图'],['badge-hd','图片高清']]);}
function phaseLabel(phase) {
  return ({ preparing: '准备素材', submitting: '提交模型', generating: '模型生成中', retrying: '网络重试', downloading: '下载结果', finalizing: '保存结果', rate_limited: '限流等待', provider_busy: '视频服务繁忙' })[phase] || '';
}
function progressElapsedLabel(startedAt){const seconds=Math.max(0,Math.floor((Date.now()-Number(startedAt||Date.now()))/1000));return seconds<60?`${seconds}秒`:`${Math.floor(seconds/60)}分${String(seconds%60).padStart(2,'0')}秒`;}
function isRetryWaitPhase(phase){return ['rate_limited','provider_busy'].includes(phase);}
function retryWaitLabel(phase){return phase==='provider_busy'?'视频服务繁忙，自动重试':'限流等待';}
function nodeProgressIsDeterminate(n){return n.data.progressMode==='provider'||n.data.progressMode==='stream';}
function nodeStatusLabel(n){const status=n.data.status||'idle',phase=n.data.phase;if(status==='queued')return isRetryWaitPhase(phase)?retryWaitLabel(phase):'排队中';if(status==='processing'||status==='running')return phase?phaseLabel(phase):'生成中';return status==='failed'?'失败':status==='canceled'?'已取消':'';}
function nodeStatusBadge(n){const status=n.data.status||'idle',active=['queued','processing','running'].includes(status),label=nodeStatusLabel(n);if(!label)return '';if(!active)return `<span class="node-status-badge ${status}">${label}</span>`;const determinate=nodeProgressIsDeterminate(n),progress=Math.max(0,Math.min(100,Number(n.data.progress||0))),elapsed=n.data.progressStartedAt?progressElapsedLabel(n.data.progressStartedAt):'';return `<span class="node-status-badge run"><span data-node-status-label>${esc(label)}</span><span data-node-progress-percent>${determinate?` ${progress}%`:''}</span><span data-node-progress-elapsed aria-hidden="true">${elapsed?` · ${elapsed}`:''}</span></span>`;}
function nodeProgressMarkup(n){const status=n.data.status||'idle',active=['queued','processing','running'].includes(status);if(!active)return '';const determinate=nodeProgressIsDeterminate(n),progress=Math.max(0,Math.min(100,Number(n.data.progress||0)));return `<div class="node-progress ${determinate?'is-determinate':'is-indeterminate'}" role="progressbar" aria-label="生成进度"${determinate?` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"`:''}><span style="${determinate?`width:${progress}%`:''}"></span></div>`;}
function updateNodeProgressDom(n){const node=els.canvasWorld?.querySelector(`[data-id="${n.id}"]`);if(!node)return;const determinate=nodeProgressIsDeterminate(n),progress=Math.max(0,Math.min(100,Number(n.data.progress||0))),label=nodeStatusLabel(n),badge=$('.node-status-badge',node),bar=$('.node-progress',node);if(badge){const labelEl=$('[data-node-status-label]',badge),percentEl=$('[data-node-progress-percent]',badge),elapsedEl=$('[data-node-progress-elapsed]',badge);if(labelEl)labelEl.textContent=label;if(percentEl)percentEl.textContent=determinate?` ${progress}%`:'';if(elapsedEl)elapsedEl.textContent=n.data.progressStartedAt?` · ${progressElapsedLabel(n.data.progressStartedAt)}`:'';}if(bar){bar.classList.toggle('is-determinate',determinate);bar.classList.toggle('is-indeterminate',!determinate);if(determinate){bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(progress));}else{bar.removeAttribute('aria-valuemin');bar.removeAttribute('aria-valuemax');bar.removeAttribute('aria-valuenow');}const fill=$('span',bar);if(fill&&determinate)fill.style.width=`${progress}%`;}}
function generationHeader(n,iconName,label){return `<div class="node-header"><div class="node-title">${icon(iconName)}<strong>${esc(label)}</strong></div>${nodeStatusBadge(n)}</div>${nodeProgressMarkup(n)}`;}
function generationPreviewToggleAttrs(n){const expanded=n.data.expanded===true;return `data-action="togglePreview" tabindex="0" aria-label="${expanded?'收起':'展开'}输入区" aria-expanded="${expanded}" aria-controls="composer-${esc(n.id)}" title="展开 / 收起输入区"`;}
function hasGeneratedVisual(n){return Boolean(nodeOutputAssets(n).map(findAsset).find(a=>a&&['image','video'].includes(a.kind)));}
function imagePresetToolbar(n){
  if(n.type!=='imageGen'||!nodeOutputAssets(n).map(findAsset).some(asset=>asset?.kind==='image'))return'';
  const disabled=!modelsFor('image.edit').length;
  return `<div class="image-preset-toolbar" role="group" aria-label="图片预设">${IMAGE_PRESET_CATEGORIES.map(category=>{
    const presets=imagePresetsForCategory(category.id);if(!presets.length)return'';
    return `<details class="image-preset-menu"><summary title="${esc(category.label)}预设">${icon(category.icon)}<span>${esc(category.label)}</span>${icon('chevron-down')}</summary><div class="image-preset-popover">${presets.map(preset=>`<button type="button" data-image-preset="${esc(preset.id)}" title="${esc(preset.scene)}" ${disabled?'disabled':''}>${icon(preset.icon)}<b>${esc(preset.label)}</b></button>`).join('')}</div></details>`;
  }).join('')}</div>`;
}
function nodeContextToolbar(n){const out=generationPreviewAsset(n,'image')||generationPreviewAsset(n,'video'),label=out?.kind==='video'?'视频':'图片',presets=imagePresetToolbar(n);return `<div class="node-context-toolbar" role="toolbar" aria-label="节点操作">${presets}${presets?'<span class="node-context-divider" aria-hidden="true"></span>':''}<button data-node-toolbar="duplicate" title="复制节点" aria-label="复制节点">${icon('copy')}</button><button data-node-toolbar="inspect" title="打开属性" aria-label="打开属性">${icon('adjustments-horizontal')}</button>${out?`<button data-action="timelineOutput" title="添加到时间线" aria-label="添加到时间线">${icon('timeline-event-plus')}</button><button data-action="openMediaOutput" title="放大${label}" aria-label="放大${label}">${icon('arrows-maximize')}</button><button data-action="downloadOutput" title="下载${label}" aria-label="下载${label}">${icon('download')}</button>`:''}</div>`;}
function referenceRoleOptions(asset, current){
  const kinds = asset?.kind === 'video' ? ['reference-video'] : asset?.kind === 'audio' ? ['reference-audio'] : ['first-frame','last-frame','reference-image'];
  return kinds.map(r=>`<option value="${r}" ${r===current?'selected':''}>${esc(REFERENCE_ROLE_LABELS[r]||r)}</option>`).join('');
}
function referenceRegionEditor(ref,isPreset){if(!isPreset||!ref.region)return'';const key=referenceKey(ref),fields=[['x','X'],['y','Y'],['width','W'],['height','H']];return `<div class="node-ref-region" data-ref-region="${esc(key)}">${fields.map(([field,label])=>`<label>${label}<input type="number" min="0" max="100" step="1" data-region-field="${field}" value="${Math.round(Number(ref.region[field]||0)*100)}"></label>`).join('')}</div>`;}
function nodeReferenceChips(n){
  const refs = rawNodeReferences(n);
  if (!refs.length) return '';
  return `<div class="node-refs-wrap"><div class="node-refs">${refs.map(r=>{
    const a=findAsset(r.assetId); if(!a) return '';
    const key=referenceKey(r),isPreset=(n.data.presetReferences||[]).some(x=>referenceKey(normalizeNodeReference(x))===key);
    const thumb=a.kind==='image'?`<img src="${esc(a.publicUrl)}" alt="">`:`<span class="node-ref-kind">${a.kind==='video'?'VID':'AUD'}</span>`;
    const remove=isPreset||r.sourceEdgeId?`<button data-ref-remove="${esc(key)}" title="移除参考" aria-label="移除参考">${icon('x')}</button>`:'';
    const role=REFERENCE_ROLE_LABELS[r.role]||'参考素材',source=referenceSourceLabel(r),active=S.activeReference?.key===key&&S.activeReference?.nodeId===n.id;
    return `<div class="node-ref ${active?'active':''}" data-ref-select="${esc(key)}" data-asset="${esc(a.id)}" title="${esc(`${a.filename||'未命名素材'} · ${role} · ${source}`)}"><div class="node-ref-thumb">${thumb}<span class="node-ref-role-badge">${esc(role)}</span><span class="node-ref-source-dot source-${esc(r.source||'asset')}" aria-hidden="true"></span></div><div class="node-ref-meta"><strong class="node-ref-name">${esc(a.filename||'未命名素材')}</strong><span class="node-ref-source">${esc(source)}</span></div>${remove}</div>`;
  }).join('')}</div></div>`;
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
function imagePresetReview(n){
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
function markdownInline(value){return esc(value).replace(/&lt;br\s*\/?&gt;/gi,'<br>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');}
function parseMarkdownTable(text,expected){
  const lines=String(text||'').split(/\r?\n/);
  for(let start=0;start<lines.length;start++){
    if(!lines[start].includes('|')||!isMarkdownSeparator(lines[start+1]||''))continue;
    const headers=splitMarkdownRow(lines[start]),rows=[];let end=start+2;
    while(end<lines.length&&lines[end].includes('|')&&!isMarkdownSeparator(lines[end])){const cells=splitMarkdownRow(lines[end]);if(cells.length>1)rows.push(cells);end++;}
    const matches=!expected||(headers.length===expected.length&&headers.every((header,index)=>header===expected[index]));
    if(matches&&headers.length&&rows.length)return {lines,start,end,headers,rows};
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
  const expected=structuredTableHeaders(preset),parsed=parseMarkdownTable(text,expected);
  if(parsed){if(preset==='video_script')parsed.rows=parsed.rows.map((row,index)=>row.length===expected.length-1&&/^\d+(?:\.\d+)?(?:\s*(?:秒|s))?$/i.test(String(row[3]||'').trim())?[String(index+1),...row]:row);return parsed;}
  return SCRIPT_PRESETS.has(preset)?parseLegacyScript(text):null;
}
function renderScriptAuxTable(headers,rows,className='script-aux-table'){return `<table class="${className}"><thead><tr>${headers.map(cell=>`<th>${markdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map((_,index)=>`<td>${markdownInline(row[index]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function extractScriptTables(lines){
  const tables=[],consumed=new Set();
  for(let index=0;index<lines.length;index++){
    if(!lines[index].includes('|')||!isMarkdownSeparator(lines[index+1]||''))continue;
    const headers=splitMarkdownRow(lines[index]),rows=[];let end=index+2;consumed.add(index);consumed.add(index+1);
    while(end<lines.length&&lines[end].includes('|')&&!isMarkdownSeparator(lines[end])){rows.push(splitMarkdownRow(lines[end]));consumed.add(end++);}
    if(headers.length&&rows.length)tables.push({headers,rows});index=end-1;
  }
  return {tables,consumed};
}
function renderScriptSectionBody(lines,sectionTitle=''){
  const {tables,consumed}=extractScriptTables(lines),definitions=[],entities=[],rest=[];let index=0;
  while(index<lines.length){
    if(consumed.has(index)||!lines[index].trim()){index++;continue;}
    const line=lines[index].trim(),definition=line.match(/^[-*]\s+\*\*([^*]+)\*\*[：:]\s*(.*)$/),entity=line.match(/^\*\*([^*]+)\*\*$/);
    if(definition){
      const details=[definition[2]].filter(Boolean);index++;
      while(index<lines.length&&!consumed.has(index)&&!/^[-*]\s+\*\*[^*]+\*\*[：:]/.test(lines[index].trim())&&!/^\*\*[^*]+\*\*$/.test(lines[index].trim())){const value=lines[index].trim().replace(/^\s*[-*]\s+/,'');if(value)details.push(`• ${value}`);index++;}
      definitions.push([definition[1],details.join('<br>')||'—']);continue;
    }
    if(entity&&/(?:角色.*场景|场景.*角色)/.test(sectionTitle)){
      const body=[];index++;while(index<lines.length&&!/^\*\*[^*]+\*\*$/.test(lines[index].trim())&&!/^#{1,6}\s+/.test(lines[index].trim())&&!consumed.has(index)){const value=lines[index].trim().replace(/^>\s?/, '');if(value)body.push(value);index++;}
      entities.push([/^场景/.test(entity[1])?'场景':'角色',entity[1],body.join(' ')||'—']);continue;
    }
    rest.push(line);index++;
  }
  const parts=[];
  if(entities.length)parts.push(renderScriptAuxTable(['类型','名称','统一设定'],entities,'script-entity-table'));
  tables.forEach(table=>parts.push(renderScriptAuxTable(table.headers,table.rows)));
  if(definitions.length)parts.push(renderScriptAuxTable(['项目','内容'],definitions,'script-definition-table'));
  if(rest.length){
    let html='',list=[];const flush=()=>{if(list.length){html+=`<ul>${list.map(item=>`<li>${markdownInline(item)}</li>`).join('')}</ul>`;list=[];}};
    rest.forEach(line=>{const heading=line.match(/^#{3,6}\s+(.+)$/),named=line.match(/^\*\*([^*]+)\*\*$/),item=line.match(/^\s*(?:[-*]|\d+[.、])\s+(.+)$/);if(item){list.push(item[1]);return;}flush();if(heading||named)html+=`<h3>${markdownInline((heading||named)[1])}</h3>`;else if(!/^---+$/.test(line))html+=`<p>${markdownInline(line.replace(/^>\s?/,''))}</p>`;});flush();if(html)parts.push(`<div class="script-section-copy">${html}</div>`);
  }
  return parts.join('');
}
function parseScriptDocument(lines){
  let title='',current={title:'',lines:[]};const sections=[];
  const push=()=>{if(current.title||current.lines.some(line=>line.trim()))sections.push(current);};
  lines.forEach(raw=>{const line=raw.trim(),h1=line.match(/^#\s+(.+)$/),h2=line.match(/^##\s+(.+)$/);if(h1){title=h1[1];return;}if(h2){push();current={title:h2[1],lines:[]};return;}current.lines.push(raw);});push();
  return {title,sections};
}
function renderScriptSections(sections){return sections.map(section=>{const body=renderScriptSectionBody(section.lines,section.title);return body?`<section class="script-document-section">${section.title?`<h2>${markdownInline(section.title)}</h2>`:''}${body}</section>`:'';}).join('');}
function renderScriptDocument(lines){
  const document=parseScriptDocument(lines);
  return `${document.title?`<h1 class="script-document-title">${markdownInline(document.title)}</h1>`:''}${renderScriptSections(document.sections)}`;
}
function renderAgentBriefDocument(text){
  const document=parseScriptDocument(String(text||'').split(/\r?\n/)),title=shortScriptTitle(document.title)||'创作简报',body=document.sections.map(section=>renderScriptSectionBody(section.lines,section.title)).join('');
  return `<article class="script-workspace"><header class="script-title-band"><h1>${markdownInline(title)}</h1></header><div class="script-workspace-body"><nav class="script-section-nav" aria-label="脚本章节"><button type="button" class="script-nav-button active" data-script-nav="brief">创作简报</button></nav><div class="script-section-content"><section class="script-section-panel active" data-script-section="brief"><h2>创作简报</h2>${body}</section></div></div></article>`;
}
function shortScriptTitle(value){
  const text=String(value||'').trim(),wrapped=text.match(/^《(.+)》$/),core=(wrapped?.[1]||text).split(/[｜|]/)[0].trim();
  return wrapped?`《${core}》`:core;
}
function takeMainScriptHeading(lines,preset){
  const source=[...lines];while(source.length&&!source.at(-1).trim())source.pop();const match=source.at(-1)?.trim().match(/^##\s+(.+)$/);if(match)source.pop();
  return {lines:source,heading:match?.[1]||(preset==='storyboard'?'正式分镜拆解':'视频脚本')};
}
function renderStoryboardAppendix(lines,wrapped=true){
  let current={title:'',lines:[]};const sections=[];const push=()=>{if(current.title||current.lines.some(line=>line.trim()))sections.push(current);};
  lines.forEach(raw=>{const heading=raw.trim().match(/^##\s+(.+)$/);if(heading){push();current={title:heading[1],lines:[]};}else current.lines.push(raw);});push();
  const body=sections.map(section=>{const content=renderScriptSectionBody(section.lines,section.title);return content?`<div class="script-appendix-block">${section.title?`<h3>${markdownInline(section.title)}</h3>`:''}${content}</div>`:'';}).join('');
  if(!body)return '';
  return wrapped?`<section class="script-document-section script-appendix-section"><h2>生成与制作规范</h2>${body}</section>`:body;
}
function scriptWorkspacePanel(id,label,content,active=false){return content?`<section class="script-section-panel${active?' active':''}" data-script-section="${id}"><h2>${label}</h2>${content}</section>`:'';}
function renderMarkdownTables(text,editable=false,preset=''){
  const parsed=parseStructuredScript(text,preset);if(!parsed)return '';
  const editAttr=editable?' contenteditable="true" spellcheck="false"':'',before=takeMainScriptHeading(parsed.lines.slice(0,parsed.start),preset),after=parsed.lines.slice(parsed.end);let footer='';
  const footerIndex=after.findIndex(line=>/^\*\*总时长\*\*[：:]/.test(line.trim()));if(footerIndex>=0){footer=after[footerIndex].trim();after.splice(footerIndex,1);}
  const table=`<table class="script-table"><thead><tr>${parsed.headers.map(h=>`<th>${markdownInline(h)}</th>`).join('')}</tr></thead><tbody>${parsed.rows.map(row=>`<tr>${parsed.headers.map((_,idx)=>`<td${editAttr}>${markdownInline(row[idx]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const document=parseScriptDocument(before.lines),isStoryboard=preset==='storyboard',entitySections=document.sections.filter(section=>/(?:角色.*场景|场景.*角色)/.test(section.title)),overviewSections=document.sections.filter(section=>!entitySections.includes(section)),production=isStoryboard?renderStoryboardAppendix(after,false):renderScriptSections(parseScriptDocument(after).sections),mainLabel=isStoryboard?'正式分镜':'视频脚本';
  const panels=[
    {id:'main',label:mainLabel,content:`<div class="script-main-table">${table}</div>${footer?`<div class="script-main-footer">${markdownInline(footer)}</div>`:''}`},
    {id:'overview',label:'项目概览',content:renderScriptSections(overviewSections)},
    {id:'entities',label:'角色与场景',content:renderScriptSections(entitySections)},
    {id:'production',label:isStoryboard?'制作规范':'剪辑与声音',content:production},
  ].filter(panel=>panel.content);
  const title=shortScriptTitle(document.title)||'短片脚本',nav=panels.map((panel,index)=>`<button type="button" class="script-nav-button${index===0?' active':''}" data-script-nav="${panel.id}">${panel.label}</button>`).join(''),content=panels.map((panel,index)=>scriptWorkspacePanel(panel.id,panel.label,panel.content,index===0)).join('');
  return `<article class="script-workspace"><header class="script-title-band"><h1>${markdownInline(title)}</h1></header><div class="script-workspace-body"><nav class="script-section-nav" aria-label="脚本章节">${nav}</nav><div class="script-section-content">${content}</div></div></article>`;
}
function durationSeconds(value){const text=String(value||''),range=text.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);if(range)return Math.max(0,(Number(range[3])*60+Number(range[4]))-(Number(range[1])*60+Number(range[2])));return Number.parseFloat(text)||0;}
function scriptFingerprint(value){let hash=2166136261;for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return String(hash>>>0);}
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
  ordered.forEach(([,pair])=>{const image=pair.find(node=>node.type==='imageGen'),video=pair.find(node=>node.type==='videoGen'),y=Math.round(cursor/10)*10,videoX=baseX+(image?nodeWidth(image):GENERATION_NODE_W)+NODE_GAP_X;if(image&&(image.position.x!==baseX||image.position.y!==y)){image.position={x:baseX,y};changed=true;}if(video&&(video.position.x!==videoX||video.position.y!==y)){video.position={x:videoX,y};changed=true;}cursor=y+Math.max(...pair.map(node=>storyboardNodeHeight(node,measure)))+56;});
  return changed;
}
function arrangeAllStoryboardNodes(measure=false){const sourceIds=new Set(S.workflow.nodes.map(node=>node.data?.storyboardSourceId).filter(Boolean));let changed=false;sourceIds.forEach(sourceId=>{changed=arrangeStoryboardNodes(S.workflow.nodes.filter(node=>node.data?.storyboardSourceId===sourceId),measure)||changed;});return changed;}
function settleStoryboardLayout(sourceId){requestAnimationFrame(()=>{const nodes=S.workflow.nodes.filter(node=>node.data?.storyboardSourceId===sourceId);if(arrangeStoryboardNodes(nodes,true)){scheduleSave();renderAll();}});}
function createStoryboardScriptFromVideoScript(){
  const source=nodeById(S.textOutputNodeId);if(!source||source.data?.preset!=='video_script')return createStoryboardFromScript();
  const sourceHash=scriptFingerprint(`${STORYBOARD_SCHEMA_VERSION}:${source.data.outputText||''}`),existing=nodeById(source.data.storyboardScriptNodeId);if(existing){if(existing.data?.sourceScriptHash!==sourceHash){existing.data.outputText='';existing.data.status='idle';existing.data.error='';existing.data.sourceScriptHash=sourceHash;scheduleSave();renderNode(existing);closeTextOutputPage();toast('检测到脚本或提示词标准已更新，正在重新生成分镜脚本');void generateNode(existing.id).then(result=>{if(result?.ok)openTextOutputPage(existing);});return existing;}if(existing.data?.outputText)openTextOutputPage(existing);else{selectNode(existing.id);closeTextOutputPage();revealNode(existing);toast('已定位分镜脚本节点，请先运行生成','info');}return existing;}
  const position={x:source.position.x+nodeWidth(source)+NODE_GAP_X,y:source.position.y};
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
    const image={id:id(),type:'imageGen',position,data:{modelKey:firstModelKey('image.generate'),prompt:visualPrompt,status:'idle',progress:0,params:{aspectRatio:storyboardAspect,quality:'1K',variants:1},expanded:false,workflowStage:'storyboard-keyframe',...common,layoutWidth:GENERATION_NODE_W}};
    const video={id:id(),type:'videoGen',position:{x:position.x+nodeWidth(image)+NODE_GAP_X,y:position.y},data:{modelKey:firstModelKey('video.image_to_video')||firstModelKey('video.generate'),prompt:motionPrompt,status:'idle',progress:0,params:{duration:seconds,aspectRatio:storyboardAspect,resolution:'720p'},expanded:false,workflowStage:'storyboard-video',forcedCapability:'video.image_to_video',actionId:'video.image_to_video',...common,layoutWidth:GENERATION_NODE_W}};
    nodes.push(image,video);edges.push({id:id(),source:source.id,target:image.id,role:'storyboard-shot'},{id:id(),source:image.id,target:video.id,role:'first-frame'});
  });
  S.workflow.nodes.push(...nodes);S.workflow.edges.push(...edges);source.data.storyboardStatus='approved';source.data.storyboardSourceHash=sourceHash;source.data.storyboardNodeIds=nodes.map(node=>node.id);source.data.storyboardNodePairs=continuity.shots.map((shot,index)=>({shot:String(shot.shot),imageNodeId:nodes[index*2]?.id,videoNodeId:nodes[index*2+1]?.id,durationSec:shot.durationSec}));source.data.storyboardCreatedAt=new Date().toISOString();S.selectedNodeId=nodes[0]?.id||null;S.selectedNodeIds=nodes[0]?[nodes[0].id]:[];S.selectedEdgeId=null;scheduleSave();closeTextOutputPage();renderAll();settleStoryboardLayout(source.id);requestAnimationFrame(()=>fitNodes(nodes));toast(`已建立 ${parsed.rows.length} 个分镜：先确认图片，再生成视频`);
}
function refreshTextOutputTable(){
  if(!els.textOutputTable)return;
  const page=els.textOutputModal?.querySelector('.text-output-page'),value=els.textOutputEditor?.value||'',source=nodeById(S.textOutputNodeId),direct=S.textOutputDirect,preset=source?.data?.preset||direct?.preset||'',parsed=parseStructuredScript(value,preset),editing=page?.classList.contains('is-editing'),directHtml=direct?.render?.(value)||'';
  const continuity=analyzeScriptContinuity(parsed);els.textOutputTable.innerHTML=parsed?`${renderContinuityReport(continuity)}${renderMarkdownTables(value,editing,preset)}`:directHtml;
  page?.classList.toggle('has-table',Boolean(parsed||directHtml));
  const isVideoScript=source?.data?.preset==='video_script',storyboardScript=nodeById(source?.data?.storyboardScriptNodeId),hasStoryboard=Boolean(source?.data?.storyboardNodeIds?.some(id=>nodeById(id)));if(els.textOutputStoryboardBtn){els.textOutputStoryboardBtn.classList.toggle('hidden',Boolean(direct)||!parsed);const label=isVideoScript?(storyboardScript?.data?.outputText?'查看分镜脚本':'生成分镜脚本'):(hasStoryboard?'查看分镜节点':'生成分镜节点');els.textOutputStoryboardBtn.innerHTML=`${icon('layout-grid')}<span>${label}</span>`;els.textOutputStoryboardBtn.setAttribute('aria-label',label);}
  els.textOutputContinuityBtn?.classList.toggle('hidden',Boolean(direct)||!parsed);els.textOutputEditBtn?.classList.toggle('hidden',Boolean(direct));els.textOutputSaveBtn?.classList.toggle('hidden',Boolean(direct)||!editing);
  if(els.textOutputMeta)els.textOutputMeta.textContent=parsed||direct?'':(SCRIPT_PRESETS.has(preset)&&value.trim()?'脚本结构不完整，请重新生成或编辑为标准镜头表':'完整查看和修改文本生成结果');
}
function setTextOutputEditing(editing){
  const page=els.textOutputModal?.querySelector('.text-output-page');page?.classList.toggle('is-editing',editing);els.textOutputEditor.readOnly=!editing;
  els.textOutputSaveBtn?.classList.toggle('hidden',!editing);
  if(els.textOutputEditBtn){els.textOutputEditBtn.innerHTML=editing?`${icon('x')}<span>取消</span>`:`${icon('edit')}<span>编辑</span>`;els.textOutputEditBtn.setAttribute('aria-label',editing?'取消编辑':'编辑脚本');}
  refreshTextOutputTable();
  if(editing)requestAnimationFrame(()=>page?.classList.contains('has-table')?els.textOutputTable?.querySelector('.script-table tbody td')?.focus():els.textOutputEditor?.focus());
}
function markdownTableLine(cells){return `| ${cells.map(cell=>String(cell||'').replace(/\s*\r?\n\s*/g,' ').replace(/\|/g,'\\|').trim()).join(' | ')} |`;}
function textOutputDraftValue(){
  const value=els.textOutputEditor?.value||'',preset=nodeById(S.textOutputNodeId)?.data?.preset||'',parsed=parseStructuredScript(value,preset),page=els.textOutputModal?.querySelector('.text-output-page');
  if(!parsed||!page?.classList.contains('has-table')||!page.classList.contains('is-editing'))return value;
  const rows=$$('.script-table>tbody>tr',els.textOutputTable).map(row=>$$('td',row).map(cell=>cell.textContent));
  const tableLines=[markdownTableLine(parsed.headers),markdownTableLine(parsed.headers.map(()=>'---')),...rows.map(markdownTableLine)];
  return [...parsed.lines.slice(0,parsed.start),...tableLines,...parsed.lines.slice(parsed.end)].join('\n');
}
function syncTextOutputNode(value){const n=nodeById(S.textOutputNodeId);if(!n)return;n.data.outputText=value;const preview=els.canvasWorld.querySelector(`[data-id="${n.id}"] .generator-text-result`);if(preview&&preview!==els.textOutputEditor)preview.value=value;scheduleSave();renderInspector();}
function saveTextOutputEdits(){const value=textOutputDraftValue();els.textOutputEditor.value=value;syncTextOutputNode(value);S.textOutputOriginal=value;setTextOutputEditing(false);refreshTextOutputTable();toast('脚本已保存');}
function toggleTextOutputEditing(){const page=els.textOutputModal?.querySelector('.text-output-page');if(page?.classList.contains('is-editing')){els.textOutputEditor.value=S.textOutputOriginal;setTextOutputEditing(false);return;}S.textOutputOriginal=els.textOutputEditor.value;setTextOutputEditing(true);}
function openTextOutputPage(n){if(!n?.data?.outputText)return;const returnFocus=document.activeElement;prepareModalOpen(els.textOutputModal);textOutputReturnFocus=returnFocus;S.textOutputNodeId=n.id;S.textOutputDirect=null;S.textOutputOriginal=n.data.outputText;els.textOutputTitle.textContent=textOutputTitle(n);els.textOutputEditor.value=n.data.outputText;els.textOutputModal.classList.remove('hidden');setTextOutputEditing(false);if(els.textOutputTable){els.textOutputTable.scrollTop=0;els.textOutputTable.scrollLeft=0;}requestAnimationFrame(()=>els.textOutputEditBtn?.focus());}
function openDirectTextOutputPage({title,text,preset='',render}){if(!text)return;const returnFocus=document.activeElement;prepareModalOpen(els.textOutputModal);textOutputReturnFocus=returnFocus;S.textOutputNodeId=null;S.textOutputDirect={preset,render};S.textOutputOriginal=text;els.textOutputTitle.textContent=title||'脚本全文';els.textOutputEditor.value=text;els.textOutputModal.classList.remove('hidden');setTextOutputEditing(false);if(els.textOutputTable){els.textOutputTable.scrollTop=0;els.textOutputTable.scrollLeft=0;}}
function closeTextOutputPage(){els.textOutputEditor.value=S.textOutputOriginal;S.textOutputNodeId=null;S.textOutputDirect=null;S.textOutputOriginal='';els.textOutputModal?.classList.add('hidden');els.textOutputModal?.querySelector('.text-output-page')?.classList.remove('is-editing');restoreInteractionFocus(textOutputReturnFocus);textOutputReturnFocus=null;}
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
  inheritUpstreamAspectRatio(n);
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
  const contextToolbar=isGenerationNode(n)&&hasGeneratedVisual(n)&&n.data.expanded===true&&S.selectedNodeIds.includes(n.id)?nodeContextToolbar(n):'';
  if(n.type==='textGen'){
    n.data.preset??='storyboard';
    const hasOutput=!!n.data.outputText;
    const preview=hasOutput?`<textarea class="generator-text-result" data-field="outputText" aria-label="文本结果">${esc(n.data.outputText)}</textarea>`:generationPlaceholder('file-text',[['file-text','分镜脚本'],['bulb','提示词扩写']]);
    return `${input}${output}${contextToolbar}${generationHeader(n,'file-text','文本')}<div class="node-body"><section class="generator-preview generator-text-preview" ${generationPreviewToggleAttrs(n)}>${preview}</section>${generationResultActions(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${nodeActionMenu(n)}</div><textarea class="generator-prompt" data-field="prompt" placeholder="描述希望生成的文本内容，留空则读取上游文本">${esc(n.data.prompt||'')}</textarea><div class="generator-controls"><div class="generator-settings"><div class="field generator-model"><label>模型</label>${modelSelectMarkup('text.generate',n.data.modelKey)}</div></div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='imageGen'){
    n.data.params??={aspectRatio:'16:9',quality:'1K'};ensureNodeModelForCapability(n,imageNodeCapability(n));
    const preview=imageGenerationPreview(n);
    const promptPlaceholder=n.data.imagePresetId?(imagePresetById(n.data.imagePresetId)?.promptPlaceholder||'可选：补充需要调整的细节'):(imageNodeCapability(n)==='image.edit'?'描述需要修改的内容，保留主体一致性':'描述希望生成的画面内容，@引用素材');
    return `${input}${output}${contextToolbar}${generationHeader(n,'photo-plus','图片')}<div class="node-body"><section class="generator-preview" ${generationPreviewToggleAttrs(n)}>${preview}</section>${generationResultActions(n)}${imagePresetReview(n)}${variantFilmstrip(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${referenceAddButton(n)}${nodeActionMenu(n)}</div>${nodeReferenceChips(n)}<textarea class="generator-prompt" data-field="prompt" placeholder="${esc(promptPlaceholder)}">${esc(n.data.prompt||'')}</textarea><div class="generator-controls"><div class="generator-settings">${imageParamControls(n)}</div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='videoGen'){
    const cap=videoNodeCapability(n);ensureNodeModelForCapability(n,cap);const out=generationPreviewAsset(n,'video');
    const preview=out?`<div class="node-current-preview">${customVideoPlayerMarkup(out.publicUrl,{label:'当前生成视频'})}</div>`:generationPlaceholder('video',[['video','文生视频'],['photo-video','首帧视频']]);
    return `${input}${output}${contextToolbar}${generationHeader(n,'video','视频')}<div class="node-body"><section class="generator-preview" ${generationPreviewToggleAttrs(n)}>${preview}</section>${generationResultActions(n)}<section class="generator-composer" id="composer-${n.id}"><div class="generator-chips">${referenceAddButton(n)}${nodeActionMenu(n)}</div>${nodeReferenceChips(n)}<textarea class="generator-prompt" data-field="prompt" placeholder="描述镜头、动作、运镜和音效，@引用素材">${esc(n.data.prompt||'')}</textarea>${videoReferencePanel(n,cap)}<div class="generator-controls"><div class="generator-settings"><div class="field generator-model"><label>模型</label>${modelSelectMarkup(cap,n.data.modelKey)}</div>${videoParamControls(n)}</div><div class="generator-secondary-actions"></div>${generationFooter(n)}</div></section></div>`;
  }
  if(n.type==='upload'){
    const a=findAsset(n.data.assetId),uploading=n.data.status==='uploading';
    const preview=a?(a.kind==='image'?`<img class="node-media" src="${esc(a.publicUrl)}" alt="上传图片">`:a.kind==='video'?`<video class="node-media node-media-video" src="${esc(a.publicUrl)}" muted playsinline preload="metadata"></video>`:`<span class="upload-node-audio">${icon('volume')}</span>`):'';
    const body=a?`<button class="upload-node-preview" data-action="chooseUpload" title="替换文件" aria-label="替换文件">${preview}</button>`:`<button class="upload-node-dropzone" data-action="chooseUpload" ${uploading?'disabled':''}>${icon(uploading?'loader-2':'upload')}<strong>${uploading?'上传中':'选择或拖放文件'}</strong></button>`;
    return `${output}<div class="node-header"><div class="node-title">${icon('upload')}<strong>上传</strong></div></div><div class="node-body">${body}${n.data.error?`<div class="asset-meta error-text">${esc(n.data.error)}</div>`:''}</div>`;
  }
  if(n.type==='asset'){
    const a=findAsset(n.data.assetId);if(!a)return `${output}<div class="node-header"><div class="node-title">素材已丢失</div></div>`;
    const media=a.kind==='image'?`<img class="node-media" src="${esc(a.publicUrl)}" alt="图片素材">`:a.kind==='video'?`<video class="node-media node-media-video" src="${esc(a.publicUrl)}" muted playsinline preload="metadata"></video>`:`<div class="node-media-empty">${icon('volume')}</div>`;
    const assetIcon=a.kind==='video'?'video':a.kind==='image'?'photo':'volume';
    const assetLabel=a.kind==='video'?'视频':a.kind==='image'?'图片':'音频';
    return `${output}<div class="node-header"><div class="node-title">${icon(assetIcon)}<strong>${assetLabel}</strong></div></div><div class="node-body">${media}</div>`;
  }
  return '<div class="node-header">Unknown node</div>';
}
function providerAttemptLabel(n){const attempt=Number(n.data.providerAttempt||0),max=Number(n.data.providerMaxAttempts||0);return attempt&&max?` · 请求 ${attempt}/${max}`:'';}
function generationFooter(n){const state=n.data.status||'idle',busy=['queued','processing','running'].includes(state),label=state==='failed'?'重试':['succeeded','canceled'].includes(state)?'重新生成':'生成';return `<div class="node-actions generation-actions">${busy?`<button class="generator-cancel" data-action="cancelGeneration" title="取消任务" aria-label="取消任务">${icon('square-x')}<span>取消</span></button>`:`<button class="primary generator-submit" data-action="generate" title="${label}" aria-label="${label}">${icon('arrow-up')}<span>${label}</span></button>`}</div>`;}
function updateComposerStateDom(el,n){const expanded=n.data.expanded===true,label=expanded?'收起输入区':'展开输入区',toggle=$('[data-action="toggleComposer"]',el);el.classList.toggle('is-expanded',expanded);el.classList.toggle('is-collapsed',!expanded);if(toggle){toggle.title=label;toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-expanded',String(expanded));toggle.innerHTML=icon(expanded?'chevron-up':'chevron-down');}}
function collapseComposerFromPreview(n){if(!isGenerationNode(n))return;n.data.expanded=false;S.activeReference=null;S.selectedNodeId=null;S.selectedNodeIds=[];S.selectedEdgeId=null;S.selectedClipId=null;scheduleSave();renderNode(n);renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();}
function toggleComposerFromPreview(n){if(!isGenerationNode(n))return;if(n.data.expanded===true)return collapseComposerFromPreview(n);const previous=selectedNode();if(previous&&previous.id!==n.id)collapseNodeComposer(previous);selectNode(n.id,{render:false});n.data.expanded=true;S.view.zoom=Math.max(.75,S.view.zoom);scheduleSave();renderNode(n);updateView();updateCanvasSelectionDom();renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();requestAnimationFrame(()=>revealNode(n));}
const POINTER_DRAG_THRESHOLD=4;
function pointerSelectionMode(e){return{add:e.shiftKey,toggle:e.ctrlKey||e.metaKey,subtract:e.altKey};}
function mergeNodeSelection(current,ids,mode){const next=new Set(mode.add||mode.toggle||mode.subtract?current:[]);for(const id of ids){if(mode.subtract)next.delete(id);else if(mode.toggle){if(next.has(id))next.delete(id);else next.add(id);}else next.add(id);}return[...next];}
function commitNodeSelection(ids){const valid=[...new Set(ids)].filter(nodeById),previous=selectedNode();if(previous&&!valid.includes(previous.id))collapseNodeComposer(previous);S.selectedNodeIds=valid;S.selectedNodeId=valid[0]||null;S.selectedEdgeId=null;S.selectedClipId=null;S.activeReference=null;updateCanvasSelectionDom();renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();}
function beginNodePointer(e,n,header,el){
  if(e.button!==0||e.target.closest('button')||S.tool!=='select')return;
  e.preventDefault();e.stopPropagation();if(S.interaction)cancelPointerInteraction();
  const mode=pointerSelectionMode(e),before=[...S.selectedNodeIds],wasSelected=before.includes(n.id);
  if(!mode.subtract&&!mode.toggle){if(!wasSelected)commitNodeSelection([n.id]);}

  header.setPointerCapture?.(e.pointerId);
  S.interaction={type:'pending-node',pointerId:e.pointerId,nodeId:n.id,nodeEl:el,captureTarget:header,startX:e.clientX,startY:e.clientY,selectionBefore:before,mode,dragIds:wasSelected&&!mode.toggle&&!mode.subtract?before:mode.add?[...new Set([...before,n.id])]:[n.id]};
}
function startNodeDrag(it){
  commitNodeSelection(it.dragIds);beginCanvasSnapshot();it.type='node-drag';it.moved=true;it.items=it.dragIds.map(nodeId=>{const node=nodeById(nodeId);return node?{node,el:els.canvasWorld.querySelector(`[data-id="${nodeId}"]`),startPos:{...node.position}}:null}).filter(Boolean);it.items.forEach(item=>item.el?.classList.add('dragging'));renderEdges();renderInspector();
}
function selectionWorldBox(it,e){const a=screenToWorld(it.startX,it.startY),b=screenToWorld(e.clientX,e.clientY);return{left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};}
function commitMarqueeSelection(it,e){const box=selectionWorldBox(it,e),hitNodes=S.workflow.nodes.filter(node=>node.position.x<box.right&&node.position.x+nodeWidth(node)>box.left&&node.position.y<box.bottom&&node.position.y+nodeHeight(node)>box.top).map(node=>node.id),mode=it.mode;if(hitNodes.length){commitNodeSelection(mergeNodeSelection(it.selectionBefore,hitNodes,mode));return;}if(!mode.add&&!mode.toggle&&!mode.subtract){const r=els.canvas.getBoundingClientRect(),screenBox={left:Math.min(it.startX,e.clientX)-r.left,right:Math.max(it.startX,e.clientX)-r.left,top:Math.min(it.startY,e.clientY)-r.top,bottom:Math.max(it.startY,e.clientY)-r.top},edge=S.workflow.edges.find(item=>edgeIntersectsScreenBox(item,screenBox));if(edge)return selectEdge(edge.id);commitNodeSelection([]);}}
function finishNodePointer(it){if(it.type==='pending-node'){commitNodeSelection(mergeNodeSelection(it.selectionBefore,[it.nodeId],it.mode));S.suppressNodeClickId=it.nodeId;}else if(it.type==='node-drag'){it.items.forEach(item=>item.el?.classList.remove('dragging'));S.suppressNodeClickId=it.nodeId;scheduleSave();}}
function releaseInteractionPointer(it){try{it.captureTarget?.releasePointerCapture?.(it.pointerId);}catch{}}
function bindNode(el,n){
  if(['queued','processing','running'].includes(n.data.status)){ $$('textarea,select,input',el).forEach(control=>control.disabled=true); $$('.app-select,.app-select-option,.generator-mode-menu summary,.node-advanced summary,.generator-param-menu summary,.generator-param-choice,.image-preset-menu summary',el).forEach(control=>{control.setAttribute('aria-disabled','true');control.addEventListener('click',e=>e.preventDefault());}); }
  const header=$('.node-header',el); header?.addEventListener('pointerdown',e=>beginNodePointer(e,n,header,el));
  $$('.handle',el).forEach(h=>h.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(h.dataset.handle==='out')startConnectionDrag(e,n,h);}));
  // 节点上右键无操作（菜单已统一移植到画布空白处右键）
  el.addEventListener('click',e=>{e.stopPropagation();if(S.suppressNodeClickId===n.id){S.suppressNodeClickId=null;return;}if(S.interaction)return;if(e.target.closest('textarea,input,select,[contenteditable="true"]'))return;const imagePreset=e.target.closest('[data-image-preset]')?.dataset.imagePreset;if(imagePreset)return applyImagePreset(n,imagePreset);const toolbar=e.target.closest('[data-node-toolbar]')?.dataset.nodeToolbar;if(toolbar==='duplicate')return duplicateNode(n);if(toolbar==='inspect'){selectNode(n.id);return showDrawer('inspectorDrawer');}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='delete')return deleteNode(n.id);if(action==='chooseUpload')return chooseUploadFiles(n.id);if(action==='togglePreview')return toggleComposerFromPreview(n);if(action==='toggleComposer'){if(isGenerationNode(n)){n.data.expanded=!n.data.expanded;scheduleSave();updateComposerStateDom(el,n);if(n.data.storyboardSourceId)settleStoryboardLayout(n.data.storyboardSourceId);}return;}if(action==='generate')return generateNode(n.id);if(action==='cancelGeneration')return cancelNodeGeneration(n);if(action==='openTextOutput')return openTextOutputPage(n);if(action==='copyOutput')return copyNodeOutput(n);if(action==='openMediaOutput')return openMediaLightbox(nodeOutputAssets(n).map(findAsset).find(a=>['image','video'].includes(a?.kind)));if(action==='downloadOutput')return downloadNodeOutput(n);if(action==='timelineOutput')return addAssetToTimeline(nodeOutputAssets(n)[0]);if(action==='nodeAction')return applyNodeAction(n,e.target.closest('[data-node-action]').dataset.nodeAction);if(action==='refAdd'){S.assetPick={nodeId:n.id};showDrawer('assetDrawer');toast('点击素材库中的素材，添加为节点参考');return;}if(action==='refRemove'){const key=e.target.closest('[data-ref-remove]')?.dataset.refRemove;if(key)removeReference(n,key);return;}if(action==='variant'){const aid=e.target.closest('[data-variant]')?.dataset.variant;if(aid)selectVariant(n,aid);return;}if(e.target.closest('button,summary,details'))return;if(S.tool==='select')commitNodeSelection(mergeNodeSelection(S.selectedNodeIds,[n.id],pointerSelectionMode(e)));});
  $('[data-action="togglePreview"]',el)?.addEventListener('keydown',e=>{if(e.target!==e.currentTarget||!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();toggleComposerFromPreview(n);requestAnimationFrame(()=>els.canvasWorld?.querySelector(`[data-id="${n.id}"] [data-action="togglePreview"]`)?.focus());});
  if(n.type==='upload'){
    el.addEventListener('dragover',e=>{if(!hasDraggedFiles(e))return;e.preventDefault();e.stopPropagation();el.classList.add('file-drag-active');});
    el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('file-drag-active');});
    el.addEventListener('drop',e=>{if(!hasDraggedFiles(e))return;e.preventDefault();e.stopPropagation();el.classList.remove('file-drag-active');uploadFiles([...e.dataTransfer.files],{targetNodeId:n.id});});
    const refreshEdges=()=>requestAnimationFrame(renderEdges);
    $$('img.node-media',el).forEach(media=>{media.addEventListener('load',refreshEdges,{once:true});if(media.complete)refreshEdges();});
    $$('video.node-media',el).forEach(media=>media.addEventListener('loadedmetadata',refreshEdges,{once:true}));
  }
  $$('.generator-text-result,.generator-prompt',el).forEach(textarea=>textarea.addEventListener('wheel',e=>e.stopPropagation(),{passive:true}));
  bindCustomVideoPlayers(el);
  if(n.type!=='upload')$$('video,audio',el).filter(media=>!media.closest('[data-video-player]')).forEach(media=>['pointerdown','click','dblclick'].forEach(type=>media.addEventListener(type,e=>e.stopPropagation())));
  $$('[data-ref-select]',el).forEach(ref=>{ref.addEventListener('pointerdown',e=>e.stopPropagation());ref.addEventListener('click',e=>{e.stopPropagation();setActiveReference(n,ref.dataset.refSelect);});});
  $$('[data-ref-remove]',el).forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();removeReference(n,button.dataset.refRemove);}));
  $$('.generator-param-popover',el).forEach(popover=>{popover.addEventListener('pointerdown',e=>e.stopPropagation());popover.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});});
  $$('[data-reference-role]',el).forEach(option=>option.addEventListener('click',e=>{e.stopPropagation();applyReferenceRole(option.dataset.referenceRole,n.id);closeDetailsMenu(option.closest('details'));}));
  $$('[data-ref-role]',el).forEach(sel=>sel.addEventListener('change',()=>{beginCanvasSnapshot();updateNodeReference(n,sel.dataset.refRole,{role:sel.value});scheduleSave();renderNode(n);renderInspector();}));
  $$('[data-ref-region] input',el).forEach(control=>control.addEventListener('change',()=>{const editor=control.closest('[data-ref-region]'),values=Object.fromEntries($$('[data-region-field]',editor).map(input=>[input.dataset.regionField,Number(input.value)/100]));beginCanvasSnapshot();updateNodeReference(n,editor.dataset.refRegion,{region:values});scheduleSave();renderNode(n);renderInspector();}));
  const applyNodeField=(field,value)=>{n.data[field]=value;if(field==='modelKey'&&['videoGen','imageGen'].includes(n.type)){if(n.type==='videoGen')normalizedVideoParams(n);else normalizedImageParams(n);inheritUpstreamAspectRatio(n);scheduleSave();renderNode(n);renderInspector();return;}scheduleSave();renderInspector();};
  $$('[data-field]',el).forEach(control=>{if(control.matches('.app-select'))return;control.addEventListener('pointerdown',e=>e.stopPropagation());const evt=control.tagName==='SELECT'?'change':'input';control.addEventListener(evt,()=>{applyNodeField(control.dataset.field,control.value);if(control.tagName==='SELECT')control.blur();});});
  $$('[data-app-select-option]',el).forEach(option=>option.addEventListener('click',e=>{e.stopPropagation();const menu=option.closest('.app-select');if(!menu||option.disabled)return;const field=menu.dataset.field;menu.dataset.value=option.dataset.appSelectValue;menu.querySelector('.app-select-value').textContent=option.textContent.trim();$$('[data-app-select-option]',menu).forEach(item=>{const active=item===option;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});closeDetailsMenu(menu,{restoreFocus:false});applyNodeField(field,menu.dataset.value);requestAnimationFrame(()=>els.canvasWorld?.querySelector(`[data-id="${n.id}"] .app-select[data-field="${field}"]>summary`)?.focus());}));
  $$('[data-param]',el).forEach(control=>{const k=control.dataset.param,defaults={duration:5,resolution:'720p',aspectRatio:'16:9',quality:'2K',temperature:0.7,seed:'',negativePrompt:'',variants:1};control.value=String(n.data.params?.[k]??defaults[k]??'');control.addEventListener('pointerdown',e=>e.stopPropagation());control.addEventListener('change',()=>{const numeric=['duration','temperature','seed','variants'].includes(k);const value=numeric?(control.value===''?'':Number(control.value)):control.value;n.data.params={...(n.data.params||{}),[k]:value};if(control.tagName==='SELECT')control.blur();if(n.type==='videoGen'&&['duration','resolution','aspectRatio'].includes(k))normalizedVideoParams(n);scheduleSave();if(n.type==='videoGen')renderNode(n);});});
  $$('[data-param-choice]',el).forEach(control=>control.addEventListener('click',e=>{e.stopPropagation();const k=control.dataset.paramChoice,value=['duration','variants'].includes(k)?Number(control.dataset.paramValue):control.dataset.paramValue;n.data.params={...(n.data.params||{}),[k]:value};if(n.type==='imageGen')normalizedImageParams(n);if(n.type==='videoGen')normalizedVideoParams(n);scheduleSave();renderNode(n);}));
}
function syncCanvasSelection(){clearTimeout(S.selectionSyncTimer);if(!S.projectId)return;S.selectionSyncTimer=setTimeout(()=>api(`/api/projects/${S.projectId}/canvas/selection`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({nodeIds:S.selectedNodeIds,edgeIds:S.selectedEdgeId?[S.selectedEdgeId]:[]})}).catch(()=>{}),120);}
function updateCanvasSelectionDom(){$$('.node',els.canvasWorld).forEach(el=>el.classList.toggle('selected',S.selectedNodeIds.includes(el.dataset.id)));syncCanvasSelection();}
function collapseNodeComposer(n){if(!n||!isGenerationNode(n)||n.data.expanded!==true)return false;n.data.expanded=false;const el=els.canvasWorld?.querySelector(`[data-id="${n.id}"]`);if(el)renderNode(n);return true;}
function clearCanvasSelection(){const current=selectedNode(),collapsed=collapseNodeComposer(current);S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];if(collapsed)scheduleSave();updateCanvasSelectionDom();renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();}
function selectNode(nodeId,{render=true}={}){const previous=[...S.selectedNodeIds],previousNode=nodeById(S.selectedNodeId);if(previousNode?.id!==nodeId)collapseNodeComposer(previousNode);S.selectedNodeId=nodeId;S.selectedNodeIds=nodeId?[nodeId]:[];if(S.activeReference?.nodeId!==nodeId)S.activeReference=null;S.selectedEdgeId=null;S.selectedClipId=null;if(render){updateCanvasSelectionDom();[...new Set([...previous,...S.selectedNodeIds])].map(nodeById).filter(Boolean).forEach(renderNode);}if(previousNode?.id!==nodeId&&previousNode?.data?.expanded===false)scheduleSave();renderEdges();renderInspector();renderTimelineSelectionButtons();renderReferenceRoleMenu();}
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
function createEdge(source,target){if(source===target)return toast('不能连接节点自身','error');const s=nodeById(source),t=nodeById(target);if(!s||!t)return;if(!['textGen','imageGen','videoGen'].includes(t.type))return toast('目标节点不接受输入','error');if(t.type==='textGen'&&!['prompt','textGen'].includes(s.type))return toast('文本生成节点只接受文本输入','error');if(S.workflow.edges.some(e=>e.source===source&&e.target===target)){S.canvasHistory.past.pop();updateUndoButtons();return toast('这两个节点已经连接','error');}if(wouldCreateCycle(source,target)){S.canvasHistory.past.pop();updateUndoButtons();return toast('此连接会形成循环','error');}syncTargetCapabilityForConnection(s,t);S.workflow.edges.push({id:id(),source,target,role:defaultEdgeRole(s,t)});inheritUpstreamAspectRatio(t);scheduleSave();renderCanvas();renderEdges();renderInspector();}
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
  if(els.edgesLayer.querySelector('path:not([data-edge-key])'))els.edgesLayer.innerHTML='';
  const existing=new Map($$('path[data-edge-key]',els.edgesLayer).map(path=>[path.dataset.edgeKey,path])),keep=new Set();
  const updatePath=(key,d,cls,edgeId='')=>{let path=existing.get(key);if(!path){path=document.createElementNS('http://www.w3.org/2000/svg','path');path.dataset.edgeKey=key;els.edgesLayer.append(path);existing.set(key,path);}keep.add(key);path.setAttribute('d',d);path.setAttribute('class',cls);if(edgeId)path.dataset.edge=edgeId;else delete path.dataset.edge;return path;};
  for(const e of S.workflow.edges){const a=nodeById(e.source),b=nodeById(e.target);if(!a||!b)continue;const p1=worldToScreen(portWorld(a,'out')),p2=worldToScreen(portWorld(b,'in'));const c=Math.max(55,Math.abs(p2.x-p1.x)*.42);const d=`M ${p1.x} ${p1.y} C ${p1.x+c} ${p1.y}, ${p2.x-c} ${p2.y}, ${p2.x} ${p2.y}`;const st=edgeState(e),sel=e.id===S.selectedEdgeId,color=st==='failed'?'var(--danger)':(sel||st==='done')?'var(--edge-blue,#8fcce9)':'#63738b',cls=st==='failed'?'failed':st==='done'?'satisfied':'pending',key=`edge:${e.id}`;updatePath(`${key}:glow`,d,`edge-path edge-glow ${cls}`,e.id).style.color=color;updatePath(`${key}:main`,d,`edge-path edge-main ${cls}${sel?' edge-selected':''}`,e.id).style.color=color;if(st==='done')updatePath(`${key}:light`,d,'edge-light',e.id).setAttribute('pathLength','100');const hit=updatePath(`${key}:hit`,d,'edge-hit',e.id);if(!hit.dataset.bound){hit.dataset.bound='1';hit.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.stopPropagation();const edgeId=event.currentTarget.dataset.edge;if(S.selectedEdgeId===edgeId)selectEdge(null);else selectEdge(edgeId);});}}
  if(S.interaction?.type==='connect'){const a=nodeById(S.interaction.sourceId);if(a){const p1=worldToScreen(portWorld(a,'out')),r=els.canvas.getBoundingClientRect(),p2={x:S.interaction.x-r.left,y:S.interaction.y-r.top},c=Math.max(55,Math.abs(p2.x-p1.x)*.42);updatePath('preview',`M ${p1.x} ${p1.y} C ${p1.x+c} ${p1.y}, ${p2.x-c} ${p2.y}, ${p2.x} ${p2.y}`,'edge-path preview');}}
  for(const [key,path] of existing)if(!keep.has(key))path.remove();
}
function updateView(){els.canvasWorld.style.transform=`translate(${S.view.x}px,${S.view.y}px) scale(${S.view.zoom})`;els.zoomLabel.textContent=`${Math.round(S.view.zoom*100)}%`;renderEdges();}
function fitNodes(nodes){if(!nodes.length)return;const xs=nodes.map(n=>n.position.x),ys=nodes.map(n=>n.position.y),minX=Math.min(...xs),maxX=Math.max(...nodes.map(n=>n.position.x+nodeWidth(n))),minY=Math.min(...ys),maxY=Math.max(...nodes.map(n=>n.position.y+nodeFitHeight(n)));const r=els.canvas.getBoundingClientRect();const z=Math.min(1,Math.max(.25,Math.min((r.width-100)/Math.max(1,maxX-minX),(r.height-180)/Math.max(1,maxY-minY))));S.view.zoom=z;S.view.x=(r.width-(maxX-minX)*z)/2-minX*z;S.view.y=(r.height-(maxY-minY)*z)/2-minY*z;updateView();}
function fitCanvas(){fitNodes(S.workflow.nodes);}

  // 按连线关系排布：单链路横向排列，分支链路按行向下展开。
  function autoLayoutNodes(){
    const nodes = S.workflow.nodes.filter(n => isGenerationNode(n) || n.type === 'upload');
    if (!nodes.length) return toast('画布上没有节点', 'info');

    const GAP_X = NODE_GAP_X, GAP_Y = 56, START_X = 50, START_Y = 50;
    renderCanvas();

    const typeOrder = { upload: 0, textGen: 1, imageGen: 2, videoGen: 3 };
    const byId = new Map(nodes.map(n => [n.id, n]));
    const referenceSources = new Set(S.workflow.edges.filter(e => e.role === 'design-reference').map(e => e.source));
    const resourceNodes = nodes.filter(n => referenceSources.has(n.id) || n.id.startsWith('design-bible:'));
    const flowNodes = nodes.filter(n => !resourceNodes.includes(n));
    const flowIds = new Set(flowNodes.map(n => n.id));
    const incoming = new Map(flowNodes.map(n => [n.id, []]));
    const outgoing = new Map(flowNodes.map(n => [n.id, []]));
    for (const edge of S.workflow.edges.filter(e => e.role !== 'design-reference')) {
      if (!flowIds.has(edge.source) || !flowIds.has(edge.target)) continue;
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
      outgoing.get(edge.source).push(edge.target);
      incoming.get(edge.target).push(edge.source);
    }
    const nodeSort = (a, b) => {
      const shotA = Number(a.data?.storyboardShotIndex ?? Number.MAX_SAFE_INTEGER), shotB = Number(b.data?.storyboardShotIndex ?? Number.MAX_SAFE_INTEGER);
      return shotA - shotB || (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.position.y - b.position.y || a.position.x - b.position.x;
    };

    // 每行是一条可连续阅读的链路。遇到一对多或多对一时断行，避免共享节点把所有镜头挤成一条横向长线。
    const rows = [], queued = new Set(), placed = new Set(), pending = flowNodes.filter(n => incoming.get(n.id).length === 0).sort(nodeSort);
    const enqueue = list => list.filter(n => !queued.has(n.id) && !placed.has(n.id)).sort(nodeSort).forEach(n => { queued.add(n.id); pending.push(n); });
    while (pending.length) {
      const seed = pending.shift();
      if (placed.has(seed.id)) continue;
      const row = [], seen = new Set();
      let current = seed;
      while (current && !placed.has(current.id) && !seen.has(current.id)) {
        seen.add(current.id); placed.add(current.id); row.push(current);
        const children = outgoing.get(current.id).map(id => byId.get(id)).filter(Boolean).filter(n => !placed.has(n.id));
        if (children.length > 1) {
          const [first, ...rest] = children.sort(nodeSort);
          enqueue(rest);
          current = first;
        } else if (children.length === 1) current = children[0];
        else break;
      }
      if (row.length) rows.push(row);
    }
    // 循环或孤立节点也必须进入布局，不能因为没有根节点而留在旧位置。
    enqueue(flowNodes.filter(n => !placed.has(n.id)));
    while (pending.length) { const n = pending.shift(); if (!placed.has(n.id)) { placed.add(n.id); rows.push([n]); } }
    const rowShot = row => Math.min(...row.map(n => Number(n.data?.storyboardShotIndex)).filter(Number.isFinite));
    rows.sort((a, b) => {
      const shotA = rowShot(a), shotB = rowShot(b), hasA = Number.isFinite(shotA), hasB = Number.isFinite(shotB);
      if (hasA !== hasB) return hasA ? 1 : -1;
      if (hasA) return shotA - shotB || a[0].position.y - b[0].position.y;
      return (typeOrder[a[0].type] ?? 9) - (typeOrder[b[0].type] ?? 9) || a[0].position.y - b[0].position.y;
    });

    const columnTypes = [...new Set(flowNodes.map(n => n.type))].sort((a, b) => (typeOrder[a] ?? 9) - (typeOrder[b] ?? 9));
    const columnX = new Map();
    let cursorX = START_X;
    for (const type of columnTypes) {
      columnX.set(type, cursorX);
      cursorX += Math.max(...flowNodes.filter(n => n.type === type).map(nodeWidth)) + GAP_X;
    }
    let cursorY = START_Y;
    for (const row of rows) {
      const byType = new Map();
      for (const n of row) { if (!byType.has(n.type)) byType.set(n.type, []); byType.get(n.type).push(n); }
      let rowHeight = 0;
      for (const [type, typedNodes] of byType) {
        let offset = 0;
        for (const n of typedNodes) { n.position = { x: columnX.get(type) ?? START_X, y: Math.round((cursorY + offset) / 10) * 10 }; offset += nodeHeight(n) + 24; }
        rowHeight = Math.max(rowHeight, offset - 24);
      }
      cursorY += rowHeight + GAP_Y;
    }

    // 角色、场景、道具等设计资料会被多个镜头复用，单独放在主链左侧，避免撑开每一条镜头链。
    if (resourceNodes.length) {
      const resourceWidth = Math.max(...resourceNodes.map(nodeWidth));
      const resourceX = START_X - resourceWidth - GAP_X;
      let resourceY = START_Y;
      for (const n of resourceNodes.sort(nodeSort)) {
        n.position = { x: resourceX, y: Math.round(resourceY / 10) * 10 };
        resourceY += nodeHeight(n) + 24;
      }
    }

    scheduleSave();
    renderCanvas();
    renderEdges();
    fitCanvas();
    toast(`已自动排布 ${nodes.length} 个节点`, 'info');
  }
  
  // 按节点类型分列自动排布（文本→图片→视频）
function nodePositionOccupied(x,y,ignoreId){return S.workflow.nodes.some(n=>n.id!==ignoreId&&Math.abs(n.position.x-x)<Math.max(GENERATION_NODE_W,nodeWidth(n))*.9&&Math.abs(n.position.y-y)<Math.max(220,nodeHeight(n))*.9);}
function findOpenNodePosition(){const r=els.canvas.getBoundingClientRect(),sel=selectedNode();if(sel){const sw=nodeWidth(sel),sh=nodeHeight(sel),near=[[sel.position.x+sw+NODE_GAP_X,sel.position.y],[sel.position.x,sel.position.y+sh+70],[sel.position.x-GENERATION_NODE_W-NODE_GAP_X,sel.position.y],[sel.position.x+sw+NODE_GAP_X,sel.position.y+sh+70]];for(const [x0,y0] of near){const x=Math.round(x0/10)*10,y=Math.round(y0/10)*10;if(!nodePositionOccupied(x,y))return{x,y};}}const margin=28,nodeH=260,left=(-S.view.x+margin)/S.view.zoom,top=(-S.view.y+70)/S.view.zoom,right=(r.width-S.view.x-margin)/S.view.zoom-GENERATION_NODE_W,bottom=(r.height-S.view.y-margin)/S.view.zoom-nodeH,cx=(left+right)/2,cy=(top+bottom)/2,candidates=[];for(let y=top;y<=bottom;y+=nodeH+36)for(let x=left;x<=right;x+=GENERATION_NODE_W+36)candidates.push({x:Math.round(x/10)*10,y:Math.round(y/10)*10,d:Math.hypot(x-cx,y-cy)});candidates.sort((a,b)=>a.d-b.d);return candidates.find(p=>!nodePositionOccupied(p.x,p.y))||{x:Math.round(cx/10)*10,y:Math.round(cy/10)*10};}
function findOpenNodePositionRight(source){if(source){const y=Math.round(source.position.y/10)*10,start=Math.round((source.position.x+nodeWidth(source)+NODE_GAP_X)/10)*10;for(let i=0;i<24;i++){const x=start+i*(GENERATION_NODE_W+NODE_GAP_X);if(!nodePositionOccupied(x,y))return{x,y};}}return findOpenNodePosition();}
function revealNode(node){const r=els.canvas.getBoundingClientRect(),p=worldToScreen({x:node.position.x,y:node.position.y}),right=p.x+nodeWidth(node)*S.view.zoom,bottom=p.y+nodeHeight(node)*S.view.zoom;let dx=0,dy=0;if(p.x<45)dx=45-p.x;else if(right>r.width-45)dx=(r.width-45)-right;if(p.y<70)dy=70-p.y;else if(bottom>r.height-90)dy=(r.height-90)-bottom;if(dx||dy){S.view.x+=dx;S.view.y+=dy;updateView();}}
function addNode(type,data={},position){beginCanvasSnapshot();const pos=position||findOpenNodePosition();const n={id:id(),type,position:pos,data};if(isGenerationNode(n)){n.data.layoutWidth=GENERATION_NODE_W;n.data.expanded=false;}S.workflow.nodes.push(n);S.selectedNodeId=n.id;S.selectedNodeIds=[n.id];S.selectedEdgeId=null;scheduleSave();renderCanvas();renderEdges();renderInspector();requestAnimationFrame(()=>revealNode(n));return n;}
function addTextGen(preset='storyboard',data={},position){return addNode('textGen',{modelKey:firstModelKey('text.generate'),prompt:'',preset,status:'idle',progress:0,outputText:'',params:{temperature:.7},...data},position);}
function addImage(data={},position){const cap=(data.presetReferences||[]).some(r=>findAsset(r.assetId)?.kind==='image')?'image.edit':'image.generate';return addNode('imageGen',{modelKey:firstModelKey(cap)||firstModelKey('image.generate'),prompt:'',status:'idle',progress:0,params:{aspectRatio:'16:9',quality:'1K',variants:1},...data},position);}
function applyImagePreset(source,presetId){
  const preset=imagePresetById(presetId),sourceAsset=nodeOutputAssets(source).map(findAsset).find(asset=>asset?.kind==='image');
  if(!preset||source?.type!=='imageGen'||!sourceAsset)return toast('请先生成主体图片，再使用图片预设','error');
  const sourceModel=modelForKey(source.data.modelKey),modelKey=sourceModel?.capabilities?.includes('image.edit')?source.data.modelKey:firstModelKey('image.edit');
  if(!modelKey)return toast('没有支持参考图生成的图片模型，请先在“模型/API”中配置','error');
  const sourcePrompt=String(source.data.presetSourcePrompt||collectNodePrompt(source)||assetPrompt(sourceAsset)||'参考图片中的主体与场景').trim();
  const presetSystemPrompt=composeImagePresetPrompt(preset,sourcePrompt);
  const position=findOpenNodePositionRight(source);
  collapseComposerFromPreview(source);
  const derived=addImage({
    modelKey,
    actionId:'image.edit',
    prompt:'',
    presetSystemPrompt,
    params:{aspectRatio:preset.aspectRatio,quality:preset.quality,variants:1,negativePrompt:preset.negative},
    aspectPolicy:preset.aspectPolicy,
    presetAspectRatio:preset.aspectRatio,
    presetVersion:preset.version,
    presetValidation:preset.validation,
    imagePresetId:preset.id,
    imagePresetSourceId:preset.sourceId,
    presetSourcePrompt:sourcePrompt,
    sourcePresetNodeId:source.id,
  },position);
  S.workflow.edges.push({id:id(),source:source.id,target:derived.id,role:'reference-image'});
  syncImageTargetCapability(derived);normalizedImageParams(derived);inheritUpstreamAspectRatio(derived);scheduleSave();renderCanvas();renderEdges();renderInspector();
  toast(`已加载“${preset.label}”正向与反向提示词，请确认后点击生成`);
  return derived;
}
function addVideo(data={},position){const refs=data.presetReferences||[];const cap=data.forcedCapability||inferredVideoCapability(refs);return addNode('videoGen',{modelKey:firstModelKey(cap)||firstModelKey('video.generate'),prompt:'',status:'idle',progress:0,params:{duration:5,aspectRatio:'16:9',resolution:'720p'},...data,forcedCapability:cap},position);}
function addWelcomeNode(action){
  S.homeMode=false;
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
function collectGenerationPrompt(n){return composePresetRequestPrompt(n.data.presetSystemPrompt,collectNodePrompt(n),n.data.presetSourcePrompt);}
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
  if(['queued','processing','running'].includes(n.data.status)) return null;
  if(S.canvasNotice?.nodeId===n.id)setCanvasNotice(null);
  const prompt=collectGenerationPrompt(n);
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
    if(!r||!r.ok){ n.data.error='上游节点生成失败，已停止'; renderNode(n); setCanvasNotice(n,n.data.error); return null; }
  }
  inheritUpstreamAspectRatio(n);
  if(n.type==='imageGen')normalizedImageParams(n);else if(n.type==='videoGen')normalizedVideoParams(n);
  const validation=n.type==='videoGen'?videoNodeValidationError(n):n.type==='imageGen'?imageNodeValidationError(n):'';
  if(validation){ n.data.error=validation; renderNode(n); setCanvasNotice(n,validation); return null; }
  if(n.data.jobId) S.jobWatchers.get(n.data.jobId)?.();
  n.data.previousOutputAssetIds=[...nodeOutputAssets(n)];n.data.jobId='';n.data.status='queued';n.data.phase='queued';n.data.progress=0;n.data.progressStartedAt=Date.now();n.data.error='';n.data.providerAttempt=0;n.data.providerMaxAttempts=0;n.data.variantAssetIds=[];n.data.selectedVariantIndex=undefined;renderNode(n);
  try{
    const params={...(n.data.params||{})}; if(n.type==='textGen') params.system=n.data.system||textSystemForPreset(n.data.preset);
    const job=await api('/api/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:S.projectId,capability,providerId,modelId,prompt,params,references:collectNodeReferences(n),requestId:crypto.randomUUID(),sourceNodeId:n.id})});
    n.data.jobId=job.id; scheduleSave(); watchJob(n,job.id);
    return await waitForNodeJob(n,job.id);
  }catch(e){ const message=friendlyError(e.message); n.data.status='failed'; n.data.error=message; renderNode(n); setCanvasNotice(n,message); return null; }
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
async function applyJobUpdate(n,job){const terminal=['succeeded','failed','canceled'];if(n.data.jobId!==job.id||!nodeById(n.id)||terminal.includes(n.data.status))return true;if(n.data.status==='processing'&&job.status==='queued'&&!isRetryWaitPhase(job.phase))return false;const hadText=Boolean(n.data.outputText);n.data.status=job.status;n.data.phase=job.phase;n.data.progressMode=job.progressMode||'phase';n.data.progressStartedAt=terminal.includes(job.status)?null:(n.data.progressStartedAt||Date.now());n.data.nextAttemptAt=job.nextAttemptAt||null;n.data.providerAttempt=job.providerAttempt||0;n.data.providerMaxAttempts=job.providerMaxAttempts||0;n.data.progress=terminal.includes(job.status)?Number(job.progress||0):Math.max(Number(n.data.progress||0),Number(job.progress||0));n.data.error=job.error||'';if(n.type==='textGen'&&job.outputText!=null){n.data.outputText=job.outputText;const preview=els.canvasWorld.querySelector(`[data-id="${n.id}"] .generator-text-result`);if(preview)preview.value=job.outputText;else if(!hadText&&job.outputText)renderNode(n);}upsertJob(job);renderJobs();if(!terminal.includes(job.status)){updateNodeProgressDom(n);return false;}n.data.jobId='';if(job.status==='succeeded'){if(job.outputText!=null)n.data.outputText=job.outputText;const outs=(job.outputs||[]).map(o=>o.id);n.data.variantAssetIds=outs.length>1?outs:[];n.data.selectedVariantIndex=0;n.data.previousOutputAssetIds=[];n.data.outputAssetIds=outs.slice(0,1);n.data.expanded=false;await saveWorkflow();setCanvasNotice(null);await refreshAssets();const output=findAsset(outs[0]);if(n.data.imagePresetId&&output){const preset=imagePresetById(n.data.imagePresetId),expected=String(preset?.aspectRatio||'').split(':').map(Number),actual=Number(output.width)/Number(output.height);n.data.presetReviewWarning=expected.length===2&&expected.every(Boolean)&&actual>0&&Math.abs(Math.log(actual/(expected[0]/expected[1])))>.18?'输出比例与预设版式不一致，请检查宫格完整性':'';}renderNode(n);renderEdges();for(const e of S.workflow.edges.filter(e=>e.source===n.id)){const t=nodeById(e.target);if(t&&isGenerationNode(t))renderNode(t);}scheduleSave();return true;}renderNode(n);scheduleSave();if(job.status==='failed')setCanvasNotice(n,job.error||'生成失败');else toast(friendlyError(job.error)||(job.status==='canceled'?'任务已取消':job.status),job.status==='failed'?'error':'info');return true;}
function watchJob(n,jobId){S.jobWatchers.get(jobId)?.();let es=null,timer=null,ticker=null,stopped=false;n.data.progressStartedAt??=Date.now();const stop=()=>{if(stopped)return;stopped=true;es?.close();if(timer)clearTimeout(timer);if(ticker)clearInterval(ticker);S.jobWatchers.delete(jobId);};const poll=async()=>{if(stopped)return;try{const job=await api(`/api/generations/${jobId}`);if(await applyJobUpdate(n,job))return stop();timer=setTimeout(poll,1000);}catch(e){if(nodeById(n.id)&&n.data.jobId===jobId){n.data.status='failed';n.data.jobId='';n.data.progressStartedAt=null;n.data.error=`任务状态恢复失败：${e.message}`;renderNode(n);}stop();}};ticker=setInterval(()=>{if(!stopped&&nodeById(n.id)&&n.data.jobId===jobId&&['queued','processing','running'].includes(n.data.status))updateNodeProgressDom(n);},1000);es=new EventSource(`/api/generations/${jobId}/events`);es.addEventListener('generation',async ev=>{const job=JSON.parse(ev.data);if(await applyJobUpdate(n,job))stop();});es.onerror=()=>{es?.close();es=null;if(!stopped)timer=setTimeout(poll,600);};S.jobWatchers.set(jobId,stop);}
function resumeNodeJobs(){for(const n of S.workflow.nodes)if(n.data?.jobId&&['queued','processing','running'].includes(n.data.status))watchJob(n,n.data.jobId);}
function upsertJob(job){const i=S.jobs.findIndex(j=>j.id===job.id);if(i>=0)S.jobs[i]=job;else S.jobs.unshift(job);}

/* ---------------- Assets ---------------- */
async function refreshAssets(){if(!S.projectId)return;const f=S.assetFilter||{},q=new URLSearchParams();if(f.tag&&f.tag!=='all')q.set('tag',f.tag);if(f.kind&&f.kind!=='all')q.set('kind',f.kind);const qs=q.toString();const r=await api(`/api/projects/${S.projectId}/assets${qs?`?${qs}`:''}`);S.assets=r.assets||[];renderAssets();renderInspector();renderPreview();}
function setAssetLibraryTab(tab){S.assetLibraryTab=tab==='prompts'?'prompts':'assets';$$('[data-library-tab]',els.assetLibraryTabs).forEach(button=>{const active=button.dataset.libraryTab===S.assetLibraryTab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});$$('[data-library-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.libraryPanel!==S.assetLibraryTab));if(S.assetLibraryTab==='prompts')renderPromptLibrary();}
async function savePromptLibraryPreset(card){const presetId=card.dataset.presetId,patch=Object.fromEntries($$('[data-prompt-field]',card).map(field=>[field.dataset.promptField,field.value]));const button=$('[data-prompt-save]',card);button.disabled=true;try{const updated=await api(`/api/prompt-library/${encodeURIComponent(presetId)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});S.promptLibrary.presets=S.promptLibrary.presets.map(preset=>preset.id===updated.id?updated:preset);setImagePresetLibrary(S.promptLibrary);renderPromptLibrary();renderCanvas();toast(`“${updated.label}”提示词已更新至 v${updated.version}`);}catch(error){button.disabled=false;toast(`提示词保存失败：${error.message}`,'error');}}
function renderPromptLibrary(){if(!els.promptLibraryList)return;const categories=S.promptLibrary.categories||[];els.promptLibraryList.innerHTML=categories.map(category=>{const presets=(S.promptLibrary.presets||[]).filter(preset=>preset.category===category.id&&preset.enabled!==false);if(!presets.length)return'';return `<section class="prompt-library-group"><h3>${icon(category.icon)}${esc(category.label)}</h3>${presets.map(preset=>`<article class="prompt-library-card" data-preset-id="${esc(preset.id)}"><div><strong>${esc(preset.label)}</strong><span>v${Number(preset.version||1)} · ${esc(preset.aspectRatio)} · ${preset.aspectPolicy==='locked'?'预设比例':'继承上游'}</span></div><p>${esc(preset.scene||'')}</p><details><summary>查看与编辑系统提示词</summary><label>正向提示词<textarea data-prompt-field="positive">${esc(preset.positive)}</textarea></label><label>反向提示词<textarea data-prompt-field="negative">${esc(preset.negative)}</textarea></label><button type="button" data-prompt-save>保存提示词</button></details></article>`).join('')}</section>`;}).join('')||'<div class="empty-state">暂无图片预设</div>';$$('[data-prompt-save]',els.promptLibraryList).forEach(button=>button.addEventListener('click',()=>savePromptLibraryPreset(button.closest('[data-preset-id]'))));}
function bindAssetLibraryTabs(){els.assetLibraryTabs?.querySelectorAll('[data-library-tab]').forEach(button=>button.addEventListener('click',()=>setAssetLibraryTab(button.dataset.libraryTab)));setAssetLibraryTab(S.assetLibraryTab);}
function bindAssetFilterChips(){els.assetFilterChips?.querySelectorAll('[data-filter-tag],[data-filter-kind]').forEach(chip=>chip.addEventListener('click',()=>{const t=chip.dataset.filterTag,k=chip.dataset.filterKind;if(t){S.assetFilter={...(S.assetFilter||{}),tag:t};els.assetFilterChips.querySelectorAll('[data-filter-tag]').forEach(c=>c.classList.toggle('active',c===chip));}if(k){S.assetFilter={...(S.assetFilter||{}),kind:k};els.assetFilterChips.querySelectorAll('[data-filter-kind]').forEach(c=>c.classList.toggle('active',c===chip));}refreshAssets();}));}
function renderAssets(){
  if(!S.assets.length){els.assetList.innerHTML=`<div class="empty-state asset-empty">${S.assetFilter?.tag!=='all'||S.assetFilter?.kind!=='all'?'当前过滤无结果，点击上方分类清除过滤':'暂无素材'}</div>`;return;}
  const kindLabel={image:'图片',video:'视频',audio:'音频'};
  const dateLabel=value=>{const date=new Date(value);if(Number.isNaN(date.getTime()))return '未记录日期';const today=new Date();const start=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();const diff=Math.round((start(today)-start(date))/86400000);if(diff===0)return '今天';if(diff===1)return '昨天';return date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});};
  const assets=[...S.assets].sort((a,b)=>Date.parse(b.metadata?.generatedAt||b.createdAt||0)-Date.parse(a.metadata?.generatedAt||a.createdAt||0)||String(b.id).localeCompare(String(a.id)));let lastDate='';
  els.assetList.innerHTML=assets.map(a=>{const prompt=assetPrompt(a),media=a.kind==='image'?`<img class="asset-thumb" src="${esc(a.publicUrl)}" alt="" draggable="false">`:a.kind==='video'?`<video class="asset-thumb" src="${esc(a.publicUrl)}" muted playsinline preload="metadata" draggable="false"></video>`:`<span class="asset-thumb audio">${icon('volume')}</span>`,date=dateLabel(a.metadata?.generatedAt||a.createdAt),heading=date===lastDate?'':(lastDate=date,`<div class="asset-date-group">${esc(date)}</div>`);return `${heading}<div class="asset-card" data-asset="${esc(a.id)}" title="${esc(a.filename)}" role="button" tabindex="0" draggable="true"><button type="button" class="asset-delete" data-asset-delete title="删除素材" aria-label="删除素材">${icon('x')}</button><span class="asset-visual">${media}<span class="asset-kind">${kindLabel[a.kind]||esc(a.kind)}</span></span><span class="asset-card-copy"><span class="asset-name">${esc(a.filename)}</span><button type="button" class="asset-prompt${prompt?'':' is-empty'}"><b>提示词</b><span>${prompt?esc(prompt):'上传素材未包含提示词'}</span></button></span></div>`;}).join('');
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
function revealTimelineClip(itemId){requestAnimationFrame(()=>{const item=S.timeline.items.find(candidate=>candidate.id===itemId);if(!item||!els.timelineBody)return;const px=timelinePx(),viewport=Math.max(240,els.timelineBody.clientWidth-100),left=item.startFrame*px,right=left+Math.max(24,item.durationInFrames*px),visibleLeft=els.timelineBody.scrollLeft,visibleRight=visibleLeft+viewport;if(left<visibleLeft+24||right>visibleRight-24)els.timelineBody.scrollLeft=Math.max(0,left-Math.round(viewport*.2));syncTimelineRulerScroll();});}
function revealTimelineContent(){const selected=selectedClip(),target=selected||[...S.timeline.items].sort((a,b)=>Math.abs(a.startFrame-S.playheadFrame)-Math.abs(b.startFrame-S.playheadFrame))[0];if(target)revealTimelineClip(target.id);}
function addAssetToTimeline(assetId,{sourceNodeId=''}={}){const a=findAsset(assetId);if(!a)return;beginTimelineSnapshot();const fps=S.timeline.fps||30,track=a.kind==='audio'?'A1':'V1',duration=Math.max(1,a.kind==='image'?fps*3:Math.round((a.durationMs||3000)/1000*fps)),end=Math.max(0,...S.timeline.items.filter(item=>item.track===track).map(item=>item.startFrame+item.durationInFrames));const item={id:id(),track,startFrame:end,durationInFrames:duration,name:a.filename,kind:a.kind,sourceAssetId:a.id,sourceNodeId,sourceInFrame:0,sourceOutFrame:duration,playbackRate:1,volume:1,opacity:1,fadeInFrames:0,fadeOutFrames:0,transform:{x:0,y:0,scale:1}};S.timeline.items.push(item);S.selectedClipId=item.id;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleTimelineSave();renderTimeline();revealTimelineClip(item.id);renderInspector();renderPreview();toast('已加入 Timeline');}
function addTextClip(){beginTimelineSnapshot();const fps=S.timeline.fps||30;const item={id:id(),track:'C1',startFrame:S.playheadFrame,durationInFrames:fps*3,name:'字幕',kind:'text',text:'输入字幕',opacity:1,fadeInFrames:0,fadeOutFrames:0,textStyle:{fontSize:44,color:'#ffffff',x:50,y:84,background:false}};S.timeline.items.push(item);S.selectedClipId=item.id;S.selectedNodeId=S.selectedEdgeId=null;S.selectedNodeIds=[];scheduleTimelineSave();renderTimeline();revealTimelineClip(item.id);renderInspector();renderPreview();toast('已添加字幕 Clip');}
function maxTimelineFrame(){return Math.max((S.timeline.fps||30)*20,S.playheadFrame,...S.timeline.items.map(i=>i.startFrame+i.durationInFrames));}
function syncTimelineRulerScroll(){if(!els.timelineRuler||!els.timelineBody)return;els.timelineRuler.style.transform=`translateX(${-els.timelineBody.scrollLeft}px)`;}
function renderTimeline(){
  S.previewActiveKey='';
  const previousScroll=els.timelineBody.scrollLeft;
  const fps=S.timeline.fps||30,px=timelinePx(),total=maxTimelineFrame(),width=Math.max(1000,total*px+100);els.timelineMeta.textContent=`${S.timeline.width}×${S.timeline.height} · ${fps} fps · ${(S.playheadFrame/fps).toFixed(2)}s`;els.timelineRuler.style.width=`${width}px`;els.timelineRuler.innerHTML='';
  for(let sec=0;sec<=Math.ceil(total/fps);sec++){const m=document.createElement('span');m.className=`ruler-mark ${sec%5===0?'major':''}`;m.style.left=`${sec*fps*px}px`;m.textContent=sec%2===0?`${sec}s`:'';els.timelineRuler.append(m);}const ph=document.createElement('div');ph.className='playhead ruler-playhead';ph.style.left=`${S.playheadFrame*px}px`;els.timelineRuler.append(ph);
  els.timelineBody.innerHTML=TRACKS.map(t=>{const st=S.timeline.tracks[t]||{};return `<div class="track ${st.hidden?'track-hidden':''}"><div class="track-label"><span>${t}</span><button data-track-mute="${t}" class="track-mini ${st.muted?'active':''}" title="${st.muted?'取消静音':'静音'}" aria-label="${st.muted?'取消静音':'静音'}">${icon(st.muted?'volume-off':'volume')}</button><button data-track-hide="${t}" class="track-mini ${st.hidden?'active':''}" title="${st.hidden?'显示':'隐藏'}" aria-label="${st.hidden?'显示':'隐藏'}">${icon(st.hidden?'eye-off':'eye')}</button></div><div class="track-lane" data-track="${t}" style="width:${width}px"></div></div>`;}).join('');
  for(const item of S.timeline.items){const lane=els.timelineBody.querySelector(`[data-track="${item.track}"]`);if(!lane)continue;const c=document.createElement('div');c.className=`clip ${item.kind} ${item.id===S.selectedClipId?'selected':''}`;c.dataset.clip=item.id;c.style.left=`${item.startFrame*px}px`;c.style.width=`${Math.max(24,item.durationInFrames*px)}px`;c.innerHTML=`<span class="clip-trim left" data-trim="left"></span><div class="clip-name">${esc(item.kind==='text'?(item.text||item.name):item.name)}</div><div class="clip-sub">${(item.durationInFrames/fps).toFixed(1)}s${item.kind==='text'?' · Caption':` · ×${Number(item.playbackRate||1).toFixed(2)}`}</div><span class="clip-trim right" data-trim="right"></span>`;bindClip(c,item);lane.append(c);}const bodyPh=document.createElement('div');bodyPh.className='playhead body-playhead';bodyPh.style.left=`${80+S.playheadFrame*px}px`;els.timelineBody.append(bodyPh);els.timelineBody.scrollLeft=previousScroll;bindTrackButtons();renderTimelineSelectionButtons();syncTimelineRulerScroll();
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
function renderTimelineSelectionButtons(){const has=Boolean(selectedClip()),hint=has?'':'请选择一个 Timeline Clip 后再使用剪切、复制、叠化或删除';if(els.timelineHint)els.timelineHint.textContent=hint;for(const el of [els.timelineRefBtn,els.deleteClipBtn,els.splitClipBtn,els.duplicateClipBtn,els.crossfadeBtn,els.rippleDeleteBtn])if(el){el.disabled=!has;if(!has){el.title=`${el.textContent.trim()}：请选择一个 Timeline Clip`;el.setAttribute('aria-label',el.title);}else{el.removeAttribute('title');el.removeAttribute('aria-label');}}}

/* ---------------- Inspector & preview ---------------- */
function renderInspector(){
  const n=selectedNode(),clip=selectedClip();
  if(S.selectedNodeIds.length>1){els.inspector.className='inspector empty-state';els.inspector.textContent=`已选择 ${S.selectedNodeIds.length} 个节点，可一起拖动或删除`;return;}
  if(S.selectedEdgeId){const e=S.workflow.edges.find(x=>x.id===S.selectedEdgeId);const src=e?nodeById(e.source):null,tgt=e?nodeById(e.target):null;const outAsset=nodeOutputAssets(src||{}).map(findAsset).find(Boolean);const roles=outAsset?.kind==='image'?['first-frame','last-frame','reference-image']:outAsset?.kind==='video'?['reference-video']:outAsset?.kind==='audio'?['reference-audio']:[];const role=e.role||defaultEdgeRole(src,tgt);els.inspector.className='inspector';els.inspector.innerHTML=`<h3>Connection</h3><dl><dt>Source</dt><dd>${esc(e?.source)}</dd><dt>Target</dt><dd>${esc(e?.target)}</dd></dl>${tgt?.type==='videoGen'&&roles.length?`<label class="field"><span>Reference role</span>${appSelectMarkup({value:role,options:roles.map(value=>({value,label:value})),className:'inspector-app-select',dataSelectId:'edgeRoleSelect',ariaLabel:'参考类型'})}</label>`:''}<button id="deleteEdgeBtn" class="danger">删除连线</button>`;$$('[data-app-select-option]',els.inspector).forEach(option=>option.addEventListener('click',()=>{const menu=option.closest('.app-select');menu.dataset.value=option.dataset.appSelectValue;menu.querySelector('.app-select-value').textContent=option.textContent.trim();menu.open=false;beginCanvasSnapshot();e.role=menu.dataset.value;scheduleSave();renderCanvas();renderEdges();renderInspector();}));$('#deleteEdgeBtn')?.addEventListener('click',deleteSelectedEdge);return;}
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
  const options=models.map(m=>{const k=`${m.providerId}::${m.modelId}`;const label=String(m.displayName||m.modelId).split('·')[0].trim();return{value:k,label};});
  return `<div class="section-divider"></div><div class="inspector-edit"><div class="inspector-edit-head">${icon('refresh')}<strong>专业编辑</strong><span class="muted">锚定重拍 · 尾帧续写</span></div><textarea id="editPrompt" rows="2" placeholder="描述期望的新画面；留空则保持主体与光线一致"></textarea><label class="field"><span>模型</span>${appSelectMarkup({value:preferred,options,className:'inspector-app-select',dataSelectId:'editModel',ariaLabel:'编辑模型'})}</label><div class="inspector-edit-actions"><button id="reshootBtn" data-edit-action="reshoot" title="以片段首尾帧为锚点重新生成，原位替换">${icon('refresh')}<span>重拍此段</span></button><button id="extendBtn" data-edit-action="extend" title="取尾帧作下一段首帧，续写接片">${icon('player-track-next')}<span>续写接片</span></button></div><div id="editStatus" class="edit-status"></div></div>`;
}
function setEditStatus(text){const el=els.inspector?.querySelector?.('#editStatus');if(el){el.textContent=text||'';el.classList.toggle('active',Boolean(text));}}
async function runClipEdit(action){
  const clip=selectedClip(); if(!clip)return;
  const need=action==='reshoot'?'video.first_last_frame':'video.image_to_video';
  let model=null;const key=controlValue(els.inspector?.querySelector?.('[data-select-id="editModel"]'))||'';
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
      const busy=['queued','processing','running'].includes(job.status),determinate=job.progressMode==='provider'||job.progressMode==='stream';
      setEditStatus(busy?`${isRetryWaitPhase(job.phase)?retryWaitLabel(job.phase):job.status==='queued'?'排队中':phaseLabel(job.phase)||'生成中'}${determinate?` · ${job.progress||0}%`:''}`:job.status);
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
function openFullscreenPreview(){if(!els.previewFullscreenModal)return;prepareModalOpen(els.previewFullscreenModal);els.previewFullscreenModal.classList.remove('hidden');renderFullscreenPreview();}
function closeFullscreenPreview(){if(!els.previewFullscreenModal)return;els.previewFullscreenModal.classList.add('hidden');$$('video',els.previewFullscreenStage).forEach(v=>v.pause());}
function renderFullscreenPreview(){
  const stage=els.previewFullscreenStage;if(!stage)return;
  const active=activeVisualAt(S.playheadFrame),key=active.map(i=>i.id).join('|');
  if(key!==S.previewActiveKeyFull){S.previewActiveKeyFull=key;stage.innerHTML='';if(!active.length)stage.innerHTML='<div class="preview-empty">No visual at playhead</div>';else for(const item of active){let el;if(item.kind==='text'){el=document.createElement('div');el.className='preview-caption preview-caption-fs';}else{const a=findAsset(item.sourceAssetId);if(!a)continue;el=document.createElement(a.kind==='video'?'video':'img');el.src=a.publicUrl;el.className='preview-media';if(a.kind==='video'){el.muted=true;el.playsInline=true;el.preload='auto';}}el.dataset.previewItem=item.id;stage.append(el);}}
  for(const item of active){const el=stage.querySelector(`[data-preview-item="${CSS.escape(item.id)}"]`);if(!el)continue;if(item.kind==='text'){const st=item.textStyle||{};el.textContent=item.text||'';el.style.left=`${st.x??50}%`;el.style.top=`${st.y??84}%`;el.style.fontSize=`${(st.fontSize||44)*3}px`;el.style.color=st.color||'#fff';el.style.opacity=String(item.opacity??1);continue;}const a=findAsset(item.sourceAssetId);if(!a)continue;const t=item.transform||{};el.style.transform=`translate(${t.x||0}%,${t.y||0}%) scale(${t.scale||1})`;el.style.opacity=String(item.opacity??1);if(a.kind==='video'){const local=(S.playheadFrame-item.startFrame)*(item.playbackRate||1)/(S.timeline.fps||30)+(item.sourceInFrame||0)/(S.timeline.fps||30);const sync=()=>{try{const target=Math.max(0,Math.min(local,Number.isFinite(el.duration)?el.duration:local));if(Math.abs((el.currentTime||0)-target)>.28)el.currentTime=target;el.playbackRate=Math.max(.25,Math.min(4,item.playbackRate||1));if(S.previewTimer)el.play().catch(()=>{});else el.pause();}catch{}};if(el.readyState>=1)sync();else el.addEventListener('loadedmetadata',sync,{once:true});}}
  if(els.previewFullscreenTime)els.previewFullscreenTime.textContent=els.previewTime?.textContent||'';
}
function jobProgressMarkup(job){const determinate=job.progressMode==='provider'||job.progressMode==='stream',progress=Math.max(0,Math.min(100,Number(job.progress||0))),active=['queued','processing','running'].includes(job.status);if(!active&&!determinate)return'';return `<div class="progressbar ${determinate?'is-determinate':'is-indeterminate'}" role="progressbar" aria-label="任务进度"${determinate?` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"`:''}><span style="${determinate?`width:${progress}%`:''}"></span></div>`;}
function jobMatchesFilter(job){if(S.jobFilter==='active')return ['queued','processing','running'].includes(job.status);if(S.jobFilter==='failed')return job.status==='failed';if(S.jobFilter==='succeeded')return job.status==='succeeded';return true;}
function retryJobFromList(jobId){const job=S.jobs.find(item=>item.id===jobId),node=job?.sourceNodeId&&nodeById(job.sourceNodeId);if(!node)return toast('该任务没有可重试的来源节点','error');selectNode(node.id);generateNode(node.id);}
function archiveCompletedJobs(){const ids=S.jobs.filter(job=>['succeeded','canceled'].includes(job.status)).map(job=>job.id);ids.forEach(id=>S.archivedJobIds.add(id));localStorage.setItem(`libtv.archivedJobs.${S.projectId}`,JSON.stringify([...S.archivedJobIds]));renderJobs();toast(`已归档 ${ids.length} 个已完成任务`,'info');}
function renderJobs(){
  const visible=S.jobs.filter(job=>!S.archivedJobIds.has(job.id)),active=visible.filter(job=>['queued','processing','running'].includes(job.status)).length,failed=visible.filter(job=>job.status==='failed').length,done=visible.filter(job=>job.status==='succeeded').length;
  if(els.jobSummary)els.jobSummary.textContent=`${active} 进行中 · ${failed} 失败 · ${done} 完成`;
  $$('[data-job-filter]').forEach(button=>button.classList.toggle('active',button.dataset.jobFilter===S.jobFilter));
  const jobs=visible.filter(jobMatchesFilter).slice(0,20);
  els.jobList.innerHTML=jobs.length?jobs.map(j=>{const determinate=j.progressMode==='provider'||j.progressMode==='stream',progress=Math.max(0,Math.min(100,Number(j.progress||0))),stage=isRetryWaitPhase(j.phase)?retryWaitLabel(j.phase):phaseLabel(j.phase)||({queued:'排队中',processing:'生成中',running:'生成中',succeeded:'已完成',failed:'失败',canceled:'已取消'}[j.status]||j.status),retry=j.status==='failed'&&j.sourceNodeId;return `<div class="job"><div class="job-top"><strong>${esc(j.modelId)}</strong><span class="status ${esc(j.status)}">${esc(stage)}</span></div><div class="asset-meta">${esc(j.capability)}${determinate?` · ${progress}%`:''}</div>${jobProgressMarkup(j)}${j.error?`<div class="asset-meta error-text">${esc(friendlyError(j.error))}</div>`:''}${retry?`<div class="job-actions"><button type="button" data-job-retry="${esc(j.id)}">重试任务</button></div>`:''}</div>`;}).join(''):'<div class="empty-state jobs-empty">当前筛选没有任务</div>';
  $$('[data-job-retry]',els.jobList).forEach(button=>button.addEventListener('click',()=>retryJobFromList(button.dataset.jobRetry)));
}
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
const INTERACTION_DETAILS_SELECTOR='.app-select,.generator-mode-menu,.generator-composer .node-advanced,.generator-param-menu,.image-preset-menu';
const modalReturnFocus=new WeakMap();
function closeControlDropdowns(except=null){$$(`${INTERACTION_DETAILS_SELECTOR}`).forEach(menu=>{if(menu!==except&&menu.open)menu.open=false;});}
function closeDetailsMenu(menu,{restoreFocus=true}={}){if(!menu)return;menu.open=false;if(restoreFocus)$('summary',menu)?.focus();}
function positionOpenDetails(menu){if(!menu?.matches('.app-select'))return;requestAnimationFrame(()=>{if(!menu.open)return;const summary=$('summary',menu),popover=$('.app-select-popover',menu),container=menu.closest('.provider-settings-form,.floating-drawer,.modal-backdrop'),summaryRect=summary?.getBoundingClientRect(),containerRect=container?.getBoundingClientRect();if(!summaryRect||!popover)return;const bottom=containerRect?.bottom||innerHeight,needed=Math.min(320,Math.max(120,popover.scrollHeight));menu.classList.toggle('opens-up',bottom-summaryRect.bottom<needed+12&&summaryRect.top>needed);});}
function collapseExpandedNodeComposers(){let changed=false;for(const n of S.workflow.nodes.filter(isGenerationNode)){if(n.data.expanded!==true)continue;n.data.expanded=false;const el=els.canvasWorld?.querySelector(`[data-id="${n.id}"]`);if(el)renderNode(n);changed=true;}if(changed)scheduleSave();return changed;}
function restoreModalFocus(modal){const target=modalReturnFocus.get(modal);modalReturnFocus.delete(modal);restoreInteractionFocus(target);}
function closeModalElement(modal){if(!modal||modal.classList.contains('hidden'))return;if(modal===els.textOutputModal){modalReturnFocus.delete(modal);return closeTextOutputPage();}if(modal===els.assetPromptModal){modalReturnFocus.delete(modal);return closeAssetPrompt();}if(modal===els.mediaLightbox){modalReturnFocus.delete(modal);return closeMediaLightbox();}if(modal===els.previewFullscreenModal){closeFullscreenPreview();restoreModalFocus(modal);return;}modal.classList.add('hidden');restoreModalFocus(modal);}
function closeOtherModals(except=null){[els.textOutputModal,els.assetPromptModal,els.mediaLightbox,els.previewFullscreenModal,els.createProjectModal,els.deleteProjectModal,els.providerModal,els.helpModal].forEach(modal=>{if(modal!==except)closeModalElement(modal);});}
function preparePrimarySurface(){closeControlDropdowns();hideMenus();collapseExpandedNodeComposers();hideDrawer('assetDrawer');hideDrawer('inspectorDrawer');setTimelineOpen(false);}
function prepareModalOpen(modal){const returnFocus=document.activeElement;preparePrimarySurface();closeOtherModals(modal);if(modal)modalReturnFocus.set(modal,returnFocus);}
function closeTopLayerOnEscape(){
  if(!els.agentOverlay?.classList.contains('hidden')){closeAgent();return true;}
  const openControl=$$(INTERACTION_DETAILS_SELECTOR).filter(menu=>menu.open).at(-1);if(openControl){openControl.open=false;$('summary',openControl)?.focus();return true;}
  if(!els.textOutputModal?.classList.contains('hidden')){closeTextOutputPage();return true;}
  if(!els.assetPromptModal?.classList.contains('hidden')){closeAssetPrompt();return true;}
  if(!els.mediaLightbox?.classList.contains('hidden')){closeMediaLightbox();return true;}
  if(!els.previewFullscreenModal?.classList.contains('hidden')){closeFullscreenPreview();return true;}
  if(!els.createProjectModal?.classList.contains('hidden')){closeCreateProject();return true;}
  if(!els.deleteProjectModal?.classList.contains('hidden')){closeDeleteProjectConfirm();return true;}
  if(!els.providerModal?.classList.contains('hidden')){closeModalElement(els.providerModal);return true;}
  if(!els.helpModal?.classList.contains('hidden')){closeModalElement(els.helpModal);return true;}
  if(!els.nodeMenu?.classList.contains('hidden')||!els.nodeContextMenu?.classList.contains('hidden')){hideMenus();return true;}
  if(S.interaction){cancelPointerInteraction();return true;}
  if(!els.inspectorDrawer?.classList.contains('hidden-drawer')){hideDrawer('inspectorDrawer');return true;}
  if(!els.assetDrawer?.classList.contains('hidden-drawer')){hideDrawer('assetDrawer');return true;}
  if(!els.timelineShell?.classList.contains('collapsed')){setTimelineOpen(false);return true;}
  if(S.selectedNodeIds.length||S.selectedEdgeId||S.selectedClipId){S.selectedNodeId=S.selectedEdgeId=S.selectedClipId=null;S.selectedNodeIds=[];updateCanvasSelectionDom();renderEdges();renderInspector();renderTimelineSelectionButtons();return true;}
  return false;
}
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
function showCanvasContextMenu(x,y,{nodeId=null,edgeId=null,world=null}={}){
  hideMenus();
  const node=nodeId?nodeById(nodeId):null,gen=S.workflow.nodes.filter(isGenerationNode),items=[];
  if(node)items.push(
    ...(isGenerationNode(node)?[{id:'run',icon:'player-play',label:nodeOutputAssets(node).length?'重新运行':'运行'}]:[]),
    {id:'duplicate',icon:'copy',label:'复制节点'},
    {id:'disconnect',icon:'unlink',label:'断开所有连线'},
    {id:'inspect',icon:'adjustments-horizontal',label:'属性'},
    ...(isGenerationNode(node)?[{id:'toggleComposer',icon:node.data.expanded===true?'chevrons-up':'chevrons-down',label:node.data.expanded===true?'收起输入区':'展开输入区'}]:[]),
    {id:'delete',icon:'trash',label:'删除节点',danger:true,separatorBefore:true},
  );
  else if(edgeId)items.push({id:'deleteEdge',icon:'unlink',label:'断开连线',danger:true});
  else items.push(
    {id:'addNode',icon:'plus',label:'添加节点'},
    {id:'autoLayout',icon:'layout-grid',label:'自动排布'},
    ...(gen.length?[{id:'runAll',icon:'player-play',label:'运行全部'}]:[]),
    {id:'fit',icon:'arrows-maximize',label:'适配画布',separatorBefore:true},
    {id:'selectTool',icon:'pointer',label:'选择工具'},
    {id:'handTool',icon:'hand-stop',label:'抓手工具'},
    {id:'assets',icon:'folder',label:'素材库',separatorBefore:true},
    {id:'timeline',icon:'timeline',label:'时间线'},
  );
  els.nodeContextMenu.innerHTML=items.map(item=>`${item.separatorBefore?'<div class="context-sep"></div>':''}<button class="context-menu-item${item.danger?' danger':''}" data-context-action="${item.id}">${icon(item.icon)}<span>${item.label}</span></button>`).join('');
  $$('[data-context-action]',els.nodeContextMenu).forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.contextAction;hideMenus();
    if(action==='addNode')showNodeMenu(x,y,world||screenToWorld(x,y));
    else if(action==='autoLayout')autoLayoutNodes();
    else if(action==='runAll')runAllNodes();
    else if(action==='fit')fitCanvas();
    else if(action==='selectTool')setTool('select');
    else if(action==='handTool')setTool('pan');
    else if(action==='assets')showDrawer('assetDrawer');
    else if(action==='timeline')setTimelineOpen(true);
    else if(action==='run'&&node)generateNode(node.id);
    else if(action==='duplicate'&&node)duplicateNode(node);
    else if(action==='disconnect'&&node)disconnectNode(node);
    else if(action==='inspect'&&node){selectNode(node.id);showDrawer('inspectorDrawer');}
    else if(action==='toggleComposer'&&node){node.data.expanded=node.data.expanded!==true;if(node.data.expanded)S.view.zoom=Math.max(.75,S.view.zoom);scheduleSave();renderNode(node);updateView();renderEdges();renderInspector();if(node.data.expanded)requestAnimationFrame(()=>revealNode(node));}
    else if(action==='delete'&&node)deleteNode(node.id);
    else if(action==='deleteEdge'&&S.selectedEdgeId===edgeId)deleteSelectedEdge();
  }));
  menuPosition(els.nodeContextMenu,x,y);
}
function setTool(tool){S.tool=tool;els.canvas.classList.toggle('tool-pan',tool==='pan');els.canvas.classList.toggle('tool-connect',tool==='connect');$$('[data-tool]',els.mouseTools).forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));}
function showDrawer(id){hideDrawer(id==='assetDrawer'?'inspectorDrawer':'assetDrawer');setTimelineOpen(false);document.getElementById(id)?.classList.remove('hidden-drawer');}
function hideDrawer(id){document.getElementById(id)?.classList.add('hidden-drawer');if(id==='assetDrawer')S.assetPick=null;}
function setTimelineOpen(open){if(open)preparePrimarySurface();els.timelineShell?.classList.toggle('collapsed',!open);if(open)revealTimelineContent();}
const PROVIDER_FIELDS=[
  {id:'agnes',name:'Agnes AI',fields:[['AGNES_API_KEY','API Key','password'],['AGNES_BASE_URL','Base URL','text'],['PUBLIC_BASE_URL','素材公网地址（本地上传图可选）','text']]},
  {id:'apimart',name:'APIMart',fields:[['APIMART_API_KEY','API Key','password']]},
  {id:'deepseek',name:'DeepSeek',fields:[['DEEPSEEK_API_KEY','API Key','password'],['DEEPSEEK_BASE_URL','Base URL','text']]},
  {id:'bailian',name:'阿里云百炼',fields:[['BAILIAN_API_KEY','API Key','password'],['BAILIAN_BASE_URL','文本 Base URL','text'],['BAILIAN_MEDIA_BASE_URL','图片 / 视频 Base URL','text']]},
];
const AGNES_MODEL_FIELDS=[['文本','AGNES_TEXT_MODEL'],['图片','AGNES_IMAGE_MODEL'],['视频','AGNES_VIDEO_MODEL']];
const APIMART_MODEL_GROUPS=[['text','文本'],['image','图片'],['video','视频']];
const PROVIDER_MODEL_FIELDS={
  agnes:AGNES_MODEL_FIELDS.map(([title,key])=>[title,key,[]]),
  deepseek:[['文本','DEEPSEEK_TEXT_MODEL',['deepseek-v4-pro','deepseek-v4-flash']]],
  bailian:[['文本','BAILIAN_TEXT_MODEL',['qwen-plus','qwen-max','qwen-turbo','qwen3-max','qwen3-plus','qwen3-coder-plus']],['图片','BAILIAN_IMAGE_MODEL',['qwen-image-3.0-pro','qwen-image-3.0','qwen-image-2.0-pro','qwen-image-2.0','qwen-image-max','qwen-image-plus','qwen-image']],['视频','BAILIAN_VIDEO_MODEL',['wan2.7-t2v-2026-06-12','wan2.7-t2v','wan3.0-video']]],
};
function apimartModelType(model){if(model.capabilities?.some(value=>value.startsWith('video.')))return'video';if(model.capabilities?.some(value=>value.startsWith('image.')))return'image';return'text';}
function agnesModelOptions(data,type){const capability=type==='agent'?'text.generate':type==='image'?'image.generate':type==='video'?'video.generate':'text.generate';return(data.agnesModels||[]).filter(model=>model.capabilities?.includes(capability)).map(model=>model.modelId);}
function modelSelectHtml(key,value,items,attrs=''){const options=[...new Set([value,...items].filter(Boolean))].map(item=>({value:item,label:item}));return appSelectMarkup({value,options,className:'provider-app-select',dataProviderKey:key,dataApimartSelect:attrs.includes('data-apimart-select')});}
function providerConnectionHtml(provider){return`<div class="provider-section"><div class="provider-section-title">连接信息</div><div class="provider-card-body">${provider.fields.map(([key,label,type])=>`<label class="${key.includes('BASE_URL')||key==='PUBLIC_BASE_URL'?'wide':''}">${esc(label)}<input data-provider-key="${key}" type="${type}" value="${esc(S.providerSettings[key]||'')}" placeholder="${type==='password'?'留空保持现有密钥':''}"></label>`).join('')}</div></div>`;}
function staticProviderModelsHtml(providerId,data){const fields=PROVIDER_MODEL_FIELDS[providerId]||[];return`<div class="provider-models"><div class="provider-models-head"><strong>模型分类</strong><span>${fields.length} 类</span></div><div class="provider-model-grid">${fields.map(([title,key,options])=>{const dynamic=providerId==='agnes'?agnesModelOptions(data,title==='图片'?'image':title==='视频'?'video':'text'):options;return`<section class="provider-model-group"><div class="provider-model-group-title">${esc(title)}</div>${modelSelectHtml(key,S.providerSettings[key]||'',dynamic)}</section>`;}).join('')}</div></div>`;}
function apimartModelsHtml(data){const models=data.apimartModels||[],enabled=new Set(data.enabledApimartModelIds||[]);if(!models.length)return`<div class="provider-models"><div class="provider-models-head"><strong>模型分类</strong><span>0 个</span></div><div class="apimart-model-empty">${data.configured?.apimart?'未拉取到模型，请重新保存 API Key。':'输入 API Key 并保存后，可在这里按分类选择模型。'}</div></div>`;const groups=APIMART_MODEL_GROUPS.map(([type,title])=>{const items=models.filter(model=>apimartModelType(model)===(type==='agent'?'text':type)).map(model=>model.modelId),value=items.find(id=>enabled.has(id))||items[0]||'';return items.length?`<section class="provider-model-group"><div class="provider-model-group-title">${esc(title)}<span>${items.length}</span></div>${modelSelectHtml(`APIMART_${type.toUpperCase()}_MODEL`,value,items,'data-apimart-select="1"')}</section>`:'';}).join('');return`<div class="provider-models"><div class="provider-models-head"><strong>模型分类</strong><span>${APIMART_MODEL_GROUPS.length} 类</span></div><div class="provider-model-grid">${groups}</div></div>`;}
function renderProviderSettings(data){S.providerSettings=data.settings||{};S.apimartModels=data.apimartModels||[];els.providerSettingsForm.innerHTML=PROVIDER_FIELDS.map(p=>`<section class="provider-card"><div class="provider-card-head"><strong><span class="provider-status-dot ${data.configured?.[p.id]?'on':''}"></span>${esc(p.name)}</strong><span class="muted">${data.configured?.[p.id]?'已配置':'未配置'}</span></div>${providerConnectionHtml(p)}${p.id==='apimart'?apimartModelsHtml(data):staticProviderModelsHtml(p.id,data)}</section>`).join('');$$('[data-app-select-option]',els.providerSettingsForm).forEach(option=>option.addEventListener('click',e=>{e.stopPropagation();const menu=option.closest('.app-select');if(!menu||option.disabled)return;menu.dataset.value=option.dataset.appSelectValue;menu.querySelector('.app-select-value').textContent=option.textContent.trim();$$('[data-app-select-option]',menu).forEach(item=>{const active=item===option;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});closeDetailsMenu(menu);}));}
async function openProviderSettings(){prepareModalOpen(els.providerModal);try{const data=await api('/api/provider-settings');renderProviderSettings(data);els.providerSaveStatus.textContent='';els.providerModal.classList.remove('hidden');requestAnimationFrame(()=>els.providerModalClose?.focus());}catch(e){toast(e.message,'error');}}
async function saveProviderSettings(){const patch={};$$('[data-provider-key]',els.providerSettingsForm).forEach(i=>{const value=controlValue(i).trim();if(value)patch[i.dataset.providerKey]=value;});const apimartChoices=[...new Set($$('[data-apimart-select]',els.providerSettingsForm).map(controlValue).map(value=>value.trim()).filter(Boolean))],pullApimart=!apimartChoices.length||Object.hasOwn(patch,'APIMART_API_KEY');if(apimartChoices.length)patch.APIMART_ENABLED_MODELS=apimartChoices.join(',');['TEXT','IMAGE','VIDEO'].forEach(type=>delete patch[`APIMART_${type}_MODEL`]);if(pullApimart)patch.APIMART_REFRESH_MODELS='1';els.providerSaveStatus.textContent=pullApimart?'正在保存并拉取模型…':'正在保存选择…';try{const result=await api('/api/provider-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});S.models=result.models||[];renderProviderSettings(result);els.providerSaveStatus.textContent=pullApimart?`模型配置已保存，APIMart 已拉取 ${result.apimartModels?.length||0} 个，启用 ${result.enabledApimartModelIds?.length||0} 个`:'模型配置已保存';renderCanvas();renderEdges();}catch(e){els.providerSaveStatus.textContent=e.message;toast(e.message,'error');}}

/* ---------------- Native creative Agent ---------------- */
function agentModels(){return S.models.filter(model=>model.capabilities?.includes('text.generate'));}
function agentModelKey(){const available=agentModels(),selected=available.find(model=>`${model.providerId}::${model.modelId}`===S.agent.modelKey);if(selected)return S.agent.modelKey;return available[0]?`${available[0].providerId}::${available[0].modelId}`:'';}
const AGENT_PROMPT_SOURCES=[
  {name:'项目上下文',desc:'只读项目目标与创作资料',insert:'@项目上下文'},
  {name:'节点摘要',desc:'只读已有节点的文字摘要',insert:'@节点摘要'},
  {name:'素材概况',desc:'只读素材类型与数量概况',insert:'@素材概况'},
];
const AGENT_PROMPT_COMMANDS=[
  {name:'发散方向',desc:'从一个想法找到三条不同的路',insert:'帮我发散三个完全不同的创意方向'},
  {name:'建立风格',desc:'确定画面气质和视觉语言',insert:'帮我设计这个项目的视觉风格和色彩基调'},
  {name:'拆解场景',desc:'把概念变成有画面感的场景',insert:'帮我把这个想法拆成几个有画面感的场景'},
  {name:'设计角色',desc:'补齐角色动机、关系和外在特征',insert:'帮我设计核心角色与人物关系'},
  {name:'润色表达',desc:'让现有创意更清晰、更有感染力',insert:'帮我润色这段创意表达'},
];
function agentPromptToken(value){const match=/(^|\s)([@/])([\w\u4e00-\u9fff-]*)$/.exec(String(value||''));return match?{kind:match[2],query:match[3].toLowerCase(),start:match.index+match[1].length}:null;}
function agentModelIconName(model){const provider=String(model?.providerId||'').toLowerCase(),modelId=String(model?.modelId||'').toLowerCase();if(provider==='deepseek'||modelId.includes('deepseek'))return'deepseek';if(provider==='bailian'||modelId.includes('qwen'))return'qwen';return'model';}
function agentModelIcon(model){const name=agentModelIconName(model),generic=name==='model'?' agent-model-icon-generic':'';return`<img class="agent-model-icon${generic}" src="/model-icons/${name}.svg" alt="" aria-hidden="true">`;}
function syncAgentPromptMenuLayout(){
  els.agentPromptForm?.classList.toggle('is-model-menu-open',Boolean(S.agent.modelMenuOpen));
  els.agentPromptForm?.classList.toggle('is-source-menu-open',Boolean(S.agent.sourceMenuOpen));
}
function agentPromptMenuRows(){
  const value=els.agentPromptInput?.value||'',token=agentPromptToken(value),kind=S.agent.sourceMenuOpen?'@':token?.kind;
  if(!kind)return{token,rows:[]};
  const query=S.agent.sourceMenuOpen?'':token?.query||'',source=kind==='@',items=source?AGENT_PROMPT_SOURCES:AGENT_PROMPT_COMMANDS;
  return{token,rows:items.filter(item=>!query||`${item.name}${item.desc}`.toLowerCase().includes(query))};
}
function renderAgentPromptMenu(){
  if(!els.agentPromptSourceMenu)return;
  const {token,rows}=agentPromptMenuRows(),visible=rows.length>0&&(S.agent.sourceMenuOpen||token);
  els.agentPromptSourceMenu.classList.toggle('hidden',!visible);
  els.agentPromptPlusBtn?.setAttribute('aria-expanded',String(Boolean(S.agent.sourceMenuOpen)));
  syncAgentPromptMenuLayout();
  if(!visible)return;
  S.agent.promptMenuIndex=Math.min(Number(S.agent.promptMenuIndex||0),rows.length-1);
  els.agentPromptSourceMenu.innerHTML=rows.map((item,index)=>`<button type="button" role="menuitem" class="agent-prompt-menu-item ${index===S.agent.promptMenuIndex?'active':''}" data-agent-prompt-choice="${index}"><span class="agent-prompt-menu-copy"><strong>${esc(item.name)}</strong><small>${esc(item.desc)}</small></span><span class="agent-prompt-menu-mark">${index===S.agent.promptMenuIndex?'↵':''}</span></button>`).join('');
}
function applyAgentPromptChoice(index){
  const {token,rows}=agentPromptMenuRows(),item=rows[Number(index)];if(!item||!els.agentPromptInput)return;
  const value=els.agentPromptInput.value,prefix=token?value.slice(0,token.start):value.trimEnd(),next=`${prefix}${item.insert} `;
  els.agentPromptInput.value=next;S.agent.sourceMenuOpen=false;S.agent.promptMenuIndex=0;renderAgentPromptMenu();autoResizeAgentPrompt();els.agentPromptInput.focus();
}
function autoResizeAgentPrompt(){const input=els.agentPromptInput;if(!input)return;input.style.height='0px';const contentHeight=input.scrollHeight;input.style.height=`${Math.min(Math.max(contentHeight,28),100)}px`;input.style.overflowY=contentHeight>100?'auto':'hidden';els.agentPromptForm?.querySelector('.agent-prompt-composer')?.classList.toggle('is-expanded',contentHeight>28||input.value.includes('\n'));}
function renderAgentModelSelect(){
  if(!els.agentModelSelect)return;
  const selected=agentModelKey();S.agent.modelKey=selected;const options=agentModels().map(model=>({value:`${model.providerId}::${model.modelId}`,label:model.displayName||`${model.providerId} · ${model.modelId}`,model})),current=options.find(item=>item.value===selected)||options[0],open=Boolean(S.agent.modelMenuOpen);
  els.agentModelSelect.innerHTML=`<div class="agent-prompt-model"><button type="button" class="agent-prompt-model-trigger" data-agent-model-trigger aria-expanded="${open}" aria-label="${esc(current?.label||'选择创意模型')}" title="${esc(current?.label||'选择创意模型')}">${current?agentModelIcon(current.model):''}</button><div class="agent-prompt-model-menu ${open?'':'hidden'}" role="listbox">${options.length?options.map(item=>`<button type="button" role="option" class="agent-prompt-model-option ${item.value===selected?'active':''}" data-agent-model-option="${esc(item.value)}" aria-selected="${item.value===selected}">${agentModelIcon(item.model)}<span>${esc(item.label)}</span>${item.value===selected?'<span class="agent-prompt-model-check">✓</span>':''}</button>`).join(''):'<span class="agent-prompt-model-empty">请先配置文本模型</span>'}</div></div>`;
  syncAgentPromptMenuLayout();
  els.agentModelSelect.querySelector('[data-agent-model-trigger]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();S.agent.modelMenuOpen=!S.agent.modelMenuOpen;S.agent.sourceMenuOpen=false;renderAgentModelSelect();renderAgentPromptMenu();});
  $$('[data-agent-model-option]',els.agentModelSelect).forEach(option=>option.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();S.agent.modelKey=option.dataset.agentModelOption||'';S.agent.modelMenuOpen=false;localStorage.setItem('libtv.agentModel',S.agent.modelKey);renderAgentModelSelect();els.agentPromptInput?.focus();}));
}
function agentMessageText(text){return String(text||'').split(/\n{2,}/).filter(Boolean).map(part=>`<p>${esc(part).replace(/\n/g,'<br>')}</p>`).join('');}
function agentCardMarkup(card){
  const label={idea:'想法',direction:'方向',scene:'场景',character:'角色',style:'风格','follow-up':'下一步'}[card.type]||'创意';
  const bullets=Array.isArray(card.bullets)&&card.bullets.length?`<ul>${card.bullets.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'';
  const tags=Array.isArray(card.tags)&&card.tags.length?`<div class="agent-card-tags">${card.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>`:'';
  const copyText=[card.title,card.summary,card.body,...(card.bullets||[])].filter(Boolean).join('\n');
  return `<article class="agent-creative-card" data-agent-card="${esc(card.id)}"><div class="agent-card-bar"><div class="agent-card-heading"><span class="agent-card-type">${label}</span><span class="agent-card-kind">创意建议</span></div><div class="agent-card-actions"><button type="button" class="agent-card-action" data-agent-copy="${esc(copyText)}" title="复制卡片" aria-label="复制卡片">${icon('copy')}</button><button type="button" class="agent-card-action agent-card-favorite ${card.favorite?'is-favorite':''}" data-agent-favorite="${esc(card.id)}" title="收藏卡片" aria-label="收藏卡片">${icon(card.favorite?'star-filled':'star')}</button></div></div><div class="agent-card-pad"><h3>${esc(card.title)}</h3><p class="agent-card-summary">${esc(card.summary)}</p>${card.body?`<div class="agent-card-body">${agentMessageText(card.body)}</div>`:''}${bullets}</div>${tags?`<div class="agent-card-footer">${tags}<span class="agent-card-readonly">只读建议</span></div>`:''}</article>`;
}
function agentMessageMarkup(message){
  const assistant=message.role==='assistant';
  const thinking=message.thinking&&!message.text;
  const header=assistant?`<div class="agent-message-meta"><span class="agent-avatar" aria-hidden="true">✦</span><span>Agent</span><span class="agent-message-role">创意伙伴</span></div>`:`<div class="agent-message-meta agent-message-meta-user"><span>你</span></div>`;
  return `<article class="agent-message ${assistant?'agent-message-assistant':'agent-message-user'} ${message.thinking?'is-thinking':''}">${header}<div class="agent-message-body">${thinking?'<div class="agent-thinking-state"><span class="agent-thinking-mark">✦</span><span class="agent-thinking"><i></i><i></i><i></i>正在整理创意…</span></div>':agentMessageText(message.text)}${assistant&&(message.cards||[]).length?`<div class="agent-card-list">${message.cards.map(agentCardMarkup).join('')}</div>`:''}</div></article>`;
}
function renderAgentHistory(){
  if(!els.agentHistoryMenu)return;
  const rows=S.agent.conversations||[];
  els.agentHistoryMenu.innerHTML=rows.length?rows.map(conversation=>`<button type="button" role="menuitem" class="agent-history-item ${conversation.id===S.agent.conversationId?'active':''}" data-agent-conversation="${esc(conversation.id)}"><strong>${esc(conversation.title||'创意对话')}</strong><small>${conversation.updatedAt?new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(conversation.updatedAt)):''}</small></button>`).join(''):'<span class="agent-history-empty">还没有其它创意对话</span>';
}
function renderAgentMessages(){
  if(!els.agentMessages)return;
  const messages=S.agent.messages||[];
  els.agentMessages.innerHTML=messages.length?messages.map(agentMessageMarkup).join(''):els.agentEmptyState?.outerHTML||'';
  els.agentMessages.scrollTop=els.agentMessages.scrollHeight;
  if(els.agentSendBtn)els.agentSendBtn.disabled=Boolean(S.agent.busy);
  renderAgentModelSelect();
}
function setAgentStatus(message=''){if(els.agentStatus)els.agentStatus.textContent=message;}
let agentRecognition=null;
function renderAgentDictation(){if(!els.agentDictationBtn)return;const active=Boolean(S.agent.dictating);els.agentDictationBtn.setAttribute('aria-pressed',String(active));els.agentDictationBtn.title=active?'停止语音输入':'语音输入';els.agentDictationBtn.innerHTML=active?'<span class="agent-dictation-bars"><i></i><i></i><i></i></span>':icon('microphone');els.agentDictationBtn.classList.toggle('is-active',active);}
function toggleAgentDictation(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition)return setAgentStatus('当前浏览器不支持语音输入。');
  if(S.agent.dictating){agentRecognition?.stop();return;}
  const recognition=new Recognition();agentRecognition=recognition;recognition.lang='zh-CN';recognition.interimResults=false;recognition.continuous=false;
  recognition.onresult=event=>{const text=[...event.results].map(result=>result[0]?.transcript||'').join('').trim();if(text){els.agentPromptInput.value=`${els.agentPromptInput.value.trimEnd()}${els.agentPromptInput.value.trim()?' ':''}${text}`;renderAgentPromptMenu();autoResizeAgentPrompt();}};
  recognition.onerror=event=>{if(event.error!=='aborted')setAgentStatus(`语音输入失败：${event.error||'未知错误'}`);};
  recognition.onend=()=>{S.agent.dictating=false;agentRecognition=null;renderAgentDictation();};
  S.agent.dictating=true;renderAgentDictation();recognition.start();
}
async function loadAgentConversation(conversationId){
  const conversation=await api(`/api/projects/${encodeURIComponent(S.projectId)}/creative-agent/conversations/${encodeURIComponent(conversationId)}`);
  S.agent.conversationId=conversation.id;S.agent.messages=conversation.messages||[];renderAgentHistory();renderAgentMessages();
}
async function loadAgentConversations(projectId){
  S.agent={...S.agent,conversations:[],conversationId:'',messages:[],busy:false,error:''};
  try{const data=await api(`/api/projects/${encodeURIComponent(projectId)}/creative-agent/conversations`);S.agent.conversations=data.conversations||[];const preferred=S.agent.conversations.find(item=>item.id===S.agent.conversationId)||S.agent.conversations[0];if(preferred)await loadAgentConversation(preferred.id);else{renderAgentHistory();renderAgentMessages();}}catch(error){setAgentStatus(`创意会话暂时不可用：${error.message}`);renderAgentMessages();}
}
async function ensureAgentConversation(){if(S.agent.conversationId)return S.agent.conversationId;const conversation=await api(`/api/projects/${encodeURIComponent(S.projectId)}/creative-agent/conversations`,{method:'POST'});S.agent.conversationId=conversation.id;S.agent.conversations=[conversation,...(S.agent.conversations||[])];S.agent.messages=[];renderAgentHistory();return conversation.id;}
function parseAgentSseChunk(state,chunk,onEvent){state.buffer+=chunk;let split;while((split=state.buffer.indexOf('\n\n'))>=0){const block=state.buffer.slice(0,split);state.buffer=state.buffer.slice(split+2);let event='message',data='';for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data+=line.slice(5).trim();}if(data){try{onEvent(event,JSON.parse(data));}catch{}}}}
async function sendAgentMessage(value){
  const message=String(value||'').trim();if(!message||S.agent.busy)return;
  const modelKey=agentModelKey();const [providerId,modelId]=modelKey.split('::');if(!providerId||!modelId)return setAgentStatus('请先在“模型/API”中配置一个文本模型。');
  S.agent.busy=true;S.agent.sourceMenuOpen=false;S.agent.modelMenuOpen=false;renderAgentPromptMenu();setAgentStatus('正在整理创意…');await ensureAgentConversation();
  S.agent.messages=[...(S.agent.messages||[]),{id:`local-${crypto.randomUUID()}`,role:'user',text:message,createdAt:new Date().toISOString()},{id:`pending-${crypto.randomUUID()}`,role:'assistant',text:'',cards:[],thinking:true,createdAt:new Date().toISOString()}];renderAgentMessages();
  const pending=S.agent.messages.at(-1);
  try{
    const response=await fetch(`/api/projects/${encodeURIComponent(S.projectId)}/creative-agent/conversations/${encodeURIComponent(S.agent.conversationId)}/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,providerId,modelId})});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message||body.error||`${response.status} ${response.statusText}`);}
    const reader=response.body?.getReader();if(!reader)throw new Error('Agent 没有返回可读取的响应');const decoder=new TextDecoder(),state={buffer:''};let doneMessage=null;const handle=(event,data)=>{if(event==='thinking')setAgentStatus(data.message||'正在整理创意…');if(event==='delta'){pending.text=String(data.text||'');pending.thinking=false;renderAgentMessages();}if(event==='cards'){pending.cards=Array.isArray(data.cards)?data.cards:[];renderAgentMessages();}if(event==='done'){doneMessage=data.message;Object.assign(pending,doneMessage,{thinking:false});renderAgentMessages();}};
    while(true){const {done,value:chunk}=await reader.read();if(done)break;parseAgentSseChunk(state,decoder.decode(chunk,{stream:true}),handle);}parseAgentSseChunk(state,decoder.decode(),handle);if(doneMessage)S.agent.messages[S.agent.messages.length-1]=doneMessage;S.agent.conversations=[{id:S.agent.conversationId,title:message.slice(0,48),updatedAt:new Date().toISOString()},...(S.agent.conversations||[]).filter(item=>item.id!==S.agent.conversationId)];renderAgentHistory();
  }catch(error){pending.thinking=false;pending.text=`这次没有完成：${error.message}`;pending.cards=[];renderAgentMessages();setAgentStatus('请求失败，可以重新发送。');}finally{S.agent.busy=false;if(!S.agent.error)setAgentStatus('');}
}
async function toggleAgentFavorite(cardId){const card=(S.agent.messages||[]).flatMap(message=>message.cards||[]).find(item=>item.id===cardId);if(!card)return;try{const result=await api(`/api/projects/${encodeURIComponent(S.projectId)}/creative-agent/conversations/${encodeURIComponent(S.agent.conversationId)}/cards/${encodeURIComponent(cardId)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({favorite:!card.favorite})});card.favorite=result.favorite;renderAgentMessages();}catch(error){setAgentStatus(`收藏失败：${error.message}`);}}
function agentMaxWidth(){return Math.min(Math.max(380,window.innerWidth*.75),900);}
function fitAgentViewport(){requestAnimationFrame(()=>{updateView();setTimeout(()=>fitCanvas(),190);});}
function setAgentWidth(width){const value=Math.round(Math.max(380,Math.min(agentMaxWidth(),width)));els.agentOverlay.style.width=`${value}px`;document.body.style.setProperty('--agent-width',`${value}px`);localStorage.setItem('libtv.agentWidth',String(value));requestAnimationFrame(updateView);}
async function openAgent(){if(!S.projectId)return toast('请先新建或打开一个画布','error');preparePrimarySurface();els.agentOverlay.classList.remove('hidden');document.body.classList.add('agent-open');setAgentWidth(Number(localStorage.getItem('libtv.agentWidth'))||Math.min(560,Math.max(380,window.innerWidth*.42)));renderAgentHistory();renderAgentMessages();fitAgentViewport();}
function closeAgent(){els.agentHistoryMenu?.classList.add('hidden');els.agentOverlay.classList.add('hidden');document.body.classList.remove('agent-open');document.body.style.removeProperty('--agent-width');fitAgentViewport();els.agentBtn?.focus();}
function toggleAgent(){if(els.agentOverlay?.classList.contains('hidden'))openAgent();else closeAgent();}
async function newAgentConversation(){try{const conversation=await api(`/api/projects/${encodeURIComponent(S.projectId)}/creative-agent/conversations`,{method:'POST'});S.agent.conversations=[conversation,...(S.agent.conversations||[])];S.agent.conversationId=conversation.id;S.agent.messages=[];els.agentHistoryMenu?.classList.add('hidden');renderAgentHistory();renderAgentMessages();els.agentPromptInput?.focus();}catch(error){setAgentStatus(`新建会话失败：${error.message}`);}}
function bindAgentWindow(){
  let drag=null;
  els.agentNewConversationBtn?.addEventListener('click',newAgentConversation);
  els.agentHistoryBtn?.addEventListener('click',()=>{renderAgentHistory();els.agentHistoryMenu.classList.toggle('hidden');});
  els.agentHistoryMenu?.addEventListener('click',async event=>{const button=event.target.closest('[data-agent-conversation]');if(!button)return;try{await loadAgentConversation(button.dataset.agentConversation);els.agentHistoryMenu.classList.add('hidden');}catch(error){setAgentStatus(`打开会话失败：${error.message}`);}});
  els.agentMessages?.addEventListener('click',event=>{const copy=event.target.closest('[data-agent-copy]'),favorite=event.target.closest('[data-agent-favorite]'),prompt=event.target.closest('[data-agent-prompt]');if(copy){copyTextValue(copy.dataset.agentCopy||'','卡片已复制');return;}if(favorite){toggleAgentFavorite(favorite.dataset.agentFavorite);return;}if(prompt){els.agentPromptInput.value=prompt.dataset.agentPrompt||'';autoResizeAgentPrompt();els.agentPromptInput.focus();}});
  els.agentPromptForm?.addEventListener('click',event=>{const plus=event.target.closest('#agentPromptPlusBtn'),choice=event.target.closest('[data-agent-prompt-choice]');if(plus){event.stopPropagation();S.agent.sourceMenuOpen=!S.agent.sourceMenuOpen;S.agent.modelMenuOpen=false;S.agent.promptMenuIndex=0;renderAgentModelSelect();renderAgentPromptMenu();els.agentPromptInput?.focus();return;}if(choice){event.preventDefault();applyAgentPromptChoice(choice.dataset.agentPromptChoice);}});
  els.agentPromptForm?.addEventListener('submit',event=>{event.preventDefault();const value=els.agentPromptInput.value;els.agentPromptInput.value='';S.agent.sourceMenuOpen=false;S.agent.modelMenuOpen=false;renderAgentPromptMenu();autoResizeAgentPrompt();sendAgentMessage(value);});
  els.agentPromptInput?.addEventListener('input',()=>{S.agent.sourceMenuOpen=false;S.agent.modelMenuOpen=false;S.agent.promptMenuIndex=0;renderAgentPromptMenu();autoResizeAgentPrompt();});
  els.agentPromptInput?.addEventListener('keydown',event=>{const {rows}=agentPromptMenuRows();if((S.agent.sourceMenuOpen||agentPromptToken(els.agentPromptInput.value))&&rows.length&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();S.agent.promptMenuIndex=(Number(S.agent.promptMenuIndex||0)+(event.key==='ArrowDown'?1:rows.length-1))%rows.length;renderAgentPromptMenu();return;}if((S.agent.sourceMenuOpen||agentPromptToken(els.agentPromptInput.value))&&rows.length&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();applyAgentPromptChoice(S.agent.promptMenuIndex||0);return;}if(event.key==='Escape'&&(S.agent.sourceMenuOpen||S.agent.modelMenuOpen||agentPromptToken(els.agentPromptInput.value))){event.preventDefault();S.agent.sourceMenuOpen=false;S.agent.modelMenuOpen=false;renderAgentModelSelect();renderAgentPromptMenu();return;}if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();els.agentPromptForm.requestSubmit();}});
  els.agentDictationBtn?.addEventListener('click',toggleAgentDictation);renderAgentDictation();renderAgentPromptMenu();
  document.addEventListener('pointerdown',event=>{if(event.target.closest('#agentPromptForm'))return;if(S.agent.sourceMenuOpen||S.agent.modelMenuOpen){S.agent.sourceMenuOpen=false;S.agent.modelMenuOpen=false;renderAgentModelSelect();renderAgentPromptMenu();}});
  els.agentResizer?.addEventListener('pointerdown',event=>{event.preventDefault();drag={startX:event.clientX,startWidth:els.agentOverlay.getBoundingClientRect().width};els.agentOverlay.classList.add('is-resizing');document.querySelector('.stage-shell')?.classList.add('agent-resizing');els.agentResizer.setPointerCapture?.(event.pointerId);});
  els.agentResizer?.addEventListener('pointermove',event=>{if(drag)setAgentWidth(drag.startWidth+drag.startX-event.clientX);});
  const stopDrag=()=>{if(!drag)return;drag=null;els.agentOverlay.classList.remove('is-resizing');document.querySelector('.stage-shell')?.classList.remove('agent-resizing');fitAgentViewport();};els.agentResizer?.addEventListener('pointerup',stopDrag);els.agentResizer?.addEventListener('pointercancel',stopDrag);
  els.agentResizer?.addEventListener('keydown',event=>{const current=els.agentOverlay.getBoundingClientRect().width;if(event.key==='ArrowLeft'){event.preventDefault();setAgentWidth(current+40);}if(event.key==='ArrowRight'){event.preventDefault();setAgentWidth(current-40);}if(event.key==='Home'){event.preventDefault();setAgentWidth(380);}if(event.key==='End'){event.preventDefault();setAgentWidth(agentMaxWidth());}});
}
/* ---------------- Persistence / export ---------------- */
function setSaveState(label,state='saved'){els.saveState.dataset.state=state;const text=$('span',els.saveState);if(text)text.textContent=label;}
function sameValue(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function copyValue(value){return value===undefined?undefined:clone(value);}
function mergeWorkflowValue(base,local,remote){
  if(sameValue(local,base))return copyValue(remote);
  if(sameValue(remote,base))return copyValue(local);
  if(local===undefined&&base!==undefined)return undefined;
  const objects=[base,local,remote].every(value=>value===undefined||(value&&typeof value==='object'&&!Array.isArray(value)));
  if(objects){const result={};for(const key of new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})])){const value=mergeWorkflowValue(base?.[key],local?.[key],remote?.[key]);if(value!==undefined)result[key]=value;}return result;}
  return copyValue(local);
}
function mergeWorkflowEntities(base=[],local=[],remote=[]){
  const baseMap=new Map(base.map(item=>[item.id,item])),localMap=new Map(local.map(item=>[item.id,item])),remoteMap=new Map(remote.map(item=>[item.id,item])),order=[...new Set([...remote.map(item=>item.id),...local.map(item=>item.id)])],result=[];
  for(const id of order){const merged=mergeWorkflowValue(baseMap.get(id),localMap.get(id),remoteMap.get(id));if(merged!==undefined)result.push(merged);}
  return result;
}
function mergeWorkflowGraphs(base,local,remote){
  const merged={version:Number(remote.version||1),nodes:mergeWorkflowEntities(base?.nodes,local?.nodes,remote.nodes),edges:mergeWorkflowEntities(base?.edges,local?.edges,remote.edges)},localNodes=new Map((local?.nodes||[]).map(node=>[node.id,node]));
  for(const node of merged.nodes.filter(isGenerationNode)){const localNode=localNodes.get(node.id);if(localNode)node.data.expanded=localNode.data?.expanded===true;}
  return merged;
}
function workflowGraphSignature(workflow){return JSON.stringify({nodes:workflow?.nodes||[],edges:workflow?.edges||[]});}
function renderWorkflowChanges(previous,next){
  const previousIds=(previous?.nodes||[]).map(node=>node.id),nextIds=(next?.nodes||[]).map(node=>node.id),structural=!sameValue(previousIds,nextIds);
  S.selectedNodeIds=S.selectedNodeIds.filter(id=>nextIds.includes(id));if(S.selectedNodeId&&!nextIds.includes(S.selectedNodeId))S.selectedNodeId=S.selectedNodeIds[0]||null;
  if(structural)renderCanvas();else for(const node of next.nodes){const before=(previous?.nodes||[]).find(item=>item.id===node.id);if(!sameValue(before,node))renderNode(node);}
  updateCanvasSelectionDom();renderEdges();renderInspector();renderReferenceRoleMenu();
}
function scheduleSave(){setSaveState('保存中…','saving');S.saveQueued=true;clearTimeout(S.saveTimer);S.saveTimer=setTimeout(()=>{S.saveTimer=null;void saveWorkflow();},350);}
async function saveWorkflow(){
  if(!S.projectId)return;S.saveQueued=true;clearTimeout(S.saveTimer);S.saveTimer=null;if(S.saveInFlight)return S.saveInFlight;
  const projectId=S.projectId;
  S.saveInFlight=(async()=>{let conflicts=0;while(S.saveQueued&&S.projectId===projectId){S.saveQueued=false;const local=clone(S.workflow),base=clone(S.workflowBase||local);if(workflowGraphSignature(local)===workflowGraphSignature(base))continue;try{const saved=await api(`/api/projects/${projectId}/workflow`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(local)});if(S.projectId!==projectId)return;const changedWhileSaving=workflowGraphSignature(S.workflow)!==workflowGraphSignature(local),version=Number(saved.version||local.version||1);S.workflow.version=version;S.workflowBase={...local,version};if(changedWhileSaving)S.saveQueued=true;conflicts=0;}catch(error){if(error.status!==409||conflicts>=2)throw error;conflicts++;const remote=await api(`/api/projects/${projectId}/workflow`);if(S.projectId!==projectId)return;const previous=S.workflow,merged=mergeWorkflowGraphs(base,clone(S.workflow),remote);S.workflow=merged;S.workflowBase=clone(remote);S.saveQueued=true;renderWorkflowChanges(previous,merged);}}setSaveState('已保存');})().catch(error=>{setSaveState('保存失败','error');toast(friendlyError(error.message),'error');}).finally(()=>{S.saveInFlight=null;});
  return S.saveInFlight;
}
function scheduleTimelineSave(){setSaveState('保存中…','saving');clearTimeout(S.timelineSaveTimer);S.timelineSaveTimer=setTimeout(()=>{S.timelineSaveTimer=null;void saveTimeline();},300);}
async function saveTimeline(){clearTimeout(S.timelineSaveTimer);S.timelineSaveTimer=null;try{await api(`/api/projects/${S.projectId}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(S.timeline)});setSaveState('已保存');}catch(e){setSaveState('保存失败','error');toast(e.message,'error');}}
async function exportTimeline(){els.exportBtn.disabled=true;els.exportBtn.setAttribute('aria-busy','true');setIconButton(els.exportBtn,'loader-2','导出中…');toast('正在导出 MP4，请稍候…','info');try{await saveTimeline();const asset=await api(`/api/projects/${S.projectId}/timeline/export`,{method:'POST'});await refreshAssets();const preview=window.open(asset.publicUrl,'_blank');toast(preview?'MP4 导出完成，已打开预览':'MP4 导出完成，已加入素材库，请从素材库下载','info');}catch(e){toast(`导出失败：${e.message}。请检查时间线和 FFmpeg 配置后重试。`,'error');}finally{els.exportBtn.disabled=false;els.exportBtn.removeAttribute('aria-busy');setIconButton(els.exportBtn,'download','导出');}}

/* ---------------- Global pointer state machine ---------------- */
function cancelPointerInteraction(){
  const it=S.interaction;if(!it)return;
  if(it.type==='node-drag'){for(const item of it.items){item.node.position={...item.startPos};item.el?.classList.remove('dragging');}S.canvasHistory.past.pop();updateUndoButtons();renderInspector();}
  else if(it.type==='connect'){S.canvasHistory.past.pop();updateUndoButtons();els.connectionToast.classList.add('hidden');}
  else if(it.type?.startsWith('clip-')||it.type?.startsWith('trim-')){const previous=S.timelineHistory.past.pop();if(previous)S.timeline=previous;it.el?.classList.remove('dragging');renderTimeline();renderInspector();renderPreview();updateUndoButtons();}
  it.el?.remove?.();S.interaction=null;releaseInteractionPointer(it);clearConnectionTargets();els.canvas.classList.remove('panning');renderEdges();
}
function pointerDistance(it,e){return Math.hypot(e.clientX-it.startX,e.clientY-it.startY);}
function updateCanvasPointer(it,e){
  if(it.type==='pending-node'&&!it.mode.toggle&&!it.mode.subtract&&pointerDistance(it,e)>=POINTER_DRAG_THRESHOLD)startNodeDrag(it);
  if(it.type==='pending-marquee'&&pointerDistance(it,e)>=POINTER_DRAG_THRESHOLD){it.type='marquee';it.el=document.createElement('div');it.el.className='selection-marquee';els.canvas.append(it.el);}
  if(it.type==='node-drag'){const dx=(e.clientX-it.startX)/S.view.zoom,dy=(e.clientY-it.startY)/S.view.zoom;for(const item of it.items){item.node.position.x=Math.round((item.startPos.x+dx)/10)*10;item.node.position.y=Math.round((item.startPos.y+dy)/10)*10;if(item.el){item.el.style.left=`${item.node.position.x}px`;item.el.style.top=`${item.node.position.y}px`;}}renderEdges();renderInspector();}
  else if(it.type==='marquee'){const r=els.canvas.getBoundingClientRect(),left=Math.min(it.startX,e.clientX)-r.left,top=Math.min(it.startY,e.clientY)-r.top;Object.assign(it.el.style,{left:`${left}px`,top:`${top}px`,width:`${Math.abs(e.clientX-it.startX)}px`,height:`${Math.abs(e.clientY-it.startY)}px`});}
  else if(it.type==='pan'){S.view.x=it.startView.x+e.clientX-it.startX;S.view.y=it.startView.y+e.clientY-it.startY;updateView();}
}
function finishCanvasPointer(it,e){
  if(it.type==='pending-node'){finishNodePointer(it);}
  else if(it.type==='node-drag'){finishNodePointer(it);}
  else if(it.type==='marquee'){commitMarqueeSelection(it,e);it.el?.remove();}
  else if(it.type==='pending-marquee'&&!it.mode.add&&!it.mode.toggle&&!it.mode.subtract)commitNodeSelection([]);
  else if(it.type==='pan')els.canvas.classList.remove('panning');
  S.interaction=null;releaseInteractionPointer(it);renderEdges();
}
function setupGlobalInteractions(){
  els.canvas.addEventListener('pointerdown',e=>{
    if(!keyboardTargetAllowsTextEntry(e.target))els.canvas.focus({preventScroll:true});
    if(e.target.closest('.node')||e.target.closest('.edge-hit'))return;
    if(S.interaction)cancelPointerInteraction();hideMenus();
    if(e.button===1||S.tool==='pan'||S.spaceDown){e.preventDefault();S.interaction={type:'pan',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,startView:{...S.view},captureTarget:els.canvas};els.canvas.setPointerCapture?.(e.pointerId);els.canvas.classList.add('panning');return;}
    if(e.button===0){e.preventDefault();S.interaction={type:'pending-marquee',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,selectionBefore:[...S.selectedNodeIds],mode:pointerSelectionMode(e),captureTarget:els.canvas};els.canvas.setPointerCapture?.(e.pointerId);}
  });
  els.canvas.addEventListener('dblclick',e=>{if(e.target.closest('.node')||e.target.closest('.edge-hit'))return;e.preventDefault();showNodeMenu(e.clientX,e.clientY,screenToWorld(e.clientX,e.clientY));});
  els.canvas.addEventListener('contextmenu',e=>{e.preventDefault();const node=e.target.closest('.node'),edge=e.target.closest('.edge-hit');if(node){selectNode(node.dataset.id);showCanvasContextMenu(e.clientX,e.clientY,{nodeId:node.dataset.id});return;}if(edge){selectEdge(edge.dataset.edge);showCanvasContextMenu(e.clientX,e.clientY,{edgeId:edge.dataset.edge});return;}const selectedContext=S.selectedNodeIds.length===1?S.selectedNodeIds[0]:null;showCanvasContextMenu(e.clientX,e.clientY,{nodeId:selectedContext,edgeId:S.selectedEdgeId,world:screenToWorld(e.clientX,e.clientY)});});
  els.canvas.addEventListener('dragover',e=>{if(!hasDraggedFiles(e)&&!hasDraggedAsset(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';els.canvas.classList.add('file-drag-active');});
  els.canvas.addEventListener('dragleave',e=>{if(!els.canvas.contains(e.relatedTarget))els.canvas.classList.remove('file-drag-active');});
  els.canvas.addEventListener('drop',e=>{if(!hasDraggedFiles(e)&&!hasDraggedAsset(e))return;e.preventDefault();els.canvas.classList.remove('file-drag-active');const draggedAsset=findAsset(e.dataTransfer.getData(ASSET_DRAG_TYPE));if(draggedAsset)return addAssetNode(draggedAsset,screenToWorld(e.clientX,e.clientY));const node=addUploadNode(screenToWorld(e.clientX,e.clientY));uploadFiles([...e.dataTransfer.files],{targetNodeId:node.id});});
  window.addEventListener('pointermove',e=>{const it=S.interaction;if(!it||it.pointerId!==e.pointerId)return;if(it.type==='connect'){it.x=e.clientX;it.y=e.clientY;clearConnectionTargets();const targetEl=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.node'),source=nodeById(it.sourceId),target=targetEl&&nodeById(targetEl.dataset.id);if(source&&target&&canAutoConnect(source,target))targetEl.classList.add('connection-target');renderEdges();return;}if(['pending-node','node-drag','pending-marquee','marquee','pan'].includes(it.type)){updateCanvasPointer(it,e);return;}if(it.type?.startsWith('clip-')||it.type?.startsWith('trim-'))moveTimelineInteraction(e,it);});
  window.addEventListener('pointerup',e=>{const it=S.interaction;if(!it||it.pointerId!==e.pointerId)return;if(['pending-node','node-drag','pending-marquee','marquee','pan'].includes(it.type)){finishCanvasPointer(it,e);return;}if(it.type==='connect')return finishConnection(e.clientX,e.clientY);if(it.type?.startsWith('clip-')||it.type?.startsWith('trim-')){it.el.classList.remove('dragging');scheduleTimelineSave();renderTimeline();renderInspector();renderPreview();S.interaction=null;}});
  window.addEventListener('pointercancel',cancelPointerInteraction);
  document.addEventListener('lostpointercapture',e=>{if(S.interaction?.pointerId===e.pointerId)cancelPointerInteraction();});
  els.canvas.addEventListener('wheel',e=>{e.preventDefault();const r=els.canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,wx=(mx-S.view.x)/S.view.zoom,wy=(my-S.view.y)/S.view.zoom,nz=Math.min(2.5,Math.max(.25,S.view.zoom*(e.deltaY>0?.9:1.1)));S.view.x=mx-wx*nz;S.view.y=my-wy*nz;S.view.zoom=nz;updateView();},{passive:false});
  els.timelineRuler.addEventListener('pointerdown',e=>{const r=els.timelineRuler.getBoundingClientRect();S.playheadFrame=Math.max(0,Math.round((e.clientX-r.left+els.timelineBody.scrollLeft)/timelinePx()));renderTimeline();renderPreview();});
  els.timelineBody.addEventListener('scroll',syncTimelineRulerScroll,{passive:true});
  els.timelineBody.addEventListener('pointerdown',e=>{if(e.target.closest('.clip')||e.target.closest('button'))return;const lane=e.target.closest('.track-lane');if(lane){const r=lane.getBoundingClientRect();S.playheadFrame=Math.max(0,Math.round((e.clientX-r.left)/timelinePx()));renderTimeline();renderPreview();}});
  document.addEventListener('toggle',e=>{const menu=e.target;if(!(menu instanceof HTMLDetailsElement)||!menu.matches(INTERACTION_DETAILS_SELECTOR))return;$('summary',menu)?.setAttribute('aria-expanded',String(menu.open));if(menu.open){closeControlDropdowns(menu);positionOpenDetails(menu);}},{capture:true});
  document.addEventListener('pointerdown',e=>{const controlMenu=e.target.closest(INTERACTION_DETAILS_SELECTOR);closeControlDropdowns(controlMenu);if(!e.target.closest('.node-menu')&&!e.target.closest('.context-menu')&&!e.target.closest('#addNodeBtn'))hideMenus();});
  els.canvas.focus({preventScroll:true});
}
function moveTimelineInteraction(e,it){const px=timelinePx(),df=Math.round((e.clientX-it.startX)/px),item=it.item;if(it.type==='clip-drag'){item.startFrame=snapFrame(Math.max(0,it.start.startFrame+df),item.id);const under=document.elementFromPoint(e.clientX,e.clientY)?.closest('.track-lane');if(under){const track=under.dataset.track;if(item.kind==='audio'&&track.startsWith('A'))item.track=track;else if(item.kind==='text'&&track==='C1')item.track=track;else if(['image','video'].includes(item.kind)&&track.startsWith('V'))item.track=track;}it.el.style.left=`${item.startFrame*px}px`;}else if(it.type==='clip-slip'){const asset=findAsset(item.sourceAssetId),rate=Math.max(.25,Number(item.playbackRate||1)),sourceLen=asset?.durationMs?Math.round(asset.durationMs/1000*(S.timeline.fps||30)):Number.POSITIVE_INFINITY,span=Math.round(item.durationInFrames*rate),desired=it.start.sourceIn+Math.round(df*rate),maxIn=Number.isFinite(sourceLen)?Math.max(0,sourceLen-span):Math.max(0,desired);item.sourceInFrame=Math.max(0,Math.min(maxIn,desired));item.sourceOutFrame=item.sourceInFrame+span;renderInspector();}else if(it.type==='trim-right'){const newDur=Math.max(1,it.start.duration+df);item.durationInFrames=newDur;item.sourceOutFrame=it.start.sourceIn+Math.round(newDur*(item.playbackRate||1));it.el.style.width=`${Math.max(24,newDur*px)}px`;}else if(it.type==='trim-left'){const maxShift=it.start.duration-1,shift=Math.max(-it.start.sourceIn,Math.min(maxShift,df)),newStart=it.start.startFrame+shift,newDur=it.start.duration-shift;item.startFrame=Math.max(0,snapFrame(newStart,item.id));const actualShift=item.startFrame-it.start.startFrame;item.durationInFrames=Math.max(1,it.start.duration-actualShift);item.sourceInFrame=Math.max(0,it.start.sourceIn+Math.round(actualShift*(item.playbackRate||1)));item.sourceOutFrame=it.start.sourceOut;it.el.style.left=`${item.startFrame*px}px`;it.el.style.width=`${Math.max(24,item.durationInFrames*px)}px`;}}

function initUnifiedTooltips(){
  const tooltip=document.createElement('div');tooltip.className='app-tooltip';tooltip.setAttribute('role','tooltip');tooltip.setAttribute('aria-hidden','true');document.body.append(tooltip);
  let active=null,timer=0;
  const migrate=root=>{if(!(root instanceof Element||root instanceof Document))return;const selector='[title],button[aria-label],summary[aria-label],[role="button"][aria-label]',items=[...(root instanceof Element&&root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];items.forEach(item=>{const nativeLabel=item.getAttribute('title')?.trim(),accessibleLabel=!item.textContent.trim()?item.getAttribute('aria-label')?.trim():'';if(nativeLabel||accessibleLabel)item.dataset.tooltip=nativeLabel||accessibleLabel;item.removeAttribute('title');});};
  const hide=()=>{clearTimeout(timer);timer=0;active=null;tooltip.classList.remove('is-visible');tooltip.setAttribute('aria-hidden','true');};
  const position=target=>{const rect=target.getBoundingClientRect(),tip=tooltip.getBoundingClientRect(),gap=8;let top=rect.bottom+gap;if(top+tip.height>innerHeight-8)top=rect.top-tip.height-gap;tooltip.style.left=`${Math.max(8,Math.min(innerWidth-tip.width-8,rect.left+(rect.width-tip.width)/2))}px`;tooltip.style.top=`${Math.max(8,top)}px`;};
  const show=target=>{if(active===target&&tooltip.classList.contains('is-visible'))return;hide();active=target;timer=setTimeout(()=>{if(active!==target||!target.isConnected)return;tooltip.textContent=target.dataset.tooltip;tooltip.classList.add('is-visible');tooltip.setAttribute('aria-hidden','false');position(target);},350);};
  migrate(document);
  new MutationObserver(records=>records.forEach(record=>{if(record.type==='attributes')migrate(record.target);else record.addedNodes.forEach(migrate);})).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title','aria-label']});
  document.addEventListener('pointerover',e=>{const target=e.target.closest?.('[data-tooltip]');if(target)show(target);});
  document.addEventListener('pointerout',e=>{if(active&&(!e.relatedTarget||!active.contains(e.relatedTarget)))hide();});
  document.addEventListener('focusin',e=>{const target=e.target.closest?.('[data-tooltip]');if(target)show(target);});
  document.addEventListener('focusout',hide);window.addEventListener('blur',hide);window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
}

/* ---------------- Bind toolbar / keyboard ---------------- */
els.newProjectBtn.addEventListener('click',openCreateProject);
els.createProjectCancel?.addEventListener('click',closeCreateProject);els.createProjectConfirm?.addEventListener('click',createProject);els.createProjectInput?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();createProject();}});els.createProjectModal?.addEventListener('pointerdown',e=>{if(e.target===els.createProjectModal)closeCreateProject();});
els.deleteProjectCancel?.addEventListener('click',closeDeleteProjectConfirm);els.deleteProjectConfirm?.addEventListener('click',()=>{if(S.pendingDeleteProjectId)deleteProject(S.pendingDeleteProjectId);});els.deleteProjectModal?.addEventListener('pointerdown',e=>{if(e.target===els.deleteProjectModal)closeDeleteProjectConfirm();});
els.workspaceIcon?.addEventListener('click',()=>{preparePrimarySurface();els.projectSelect?.querySelector('summary')?.click();});
$$('[data-welcome-action]').forEach(button=>button.addEventListener('pointerdown',event=>event.stopPropagation()));
$$('[data-welcome-action]').forEach(button=>button.addEventListener('click',()=>addWelcomeNode(button.dataset.welcomeAction)));
els.addImageBtn?.addEventListener('click',()=>addImage());els.addVideoBtn?.addEventListener('click',()=>addVideo());
els.addNodeBtn?.addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();showNodeMenu(r.left,r.top-420,findOpenNodePosition());});
$$('[data-tool]',els.mouseTools).forEach(b=>b.addEventListener('click',()=>setTool(S.tool===b.dataset.tool?'select':b.dataset.tool)));
els.uploadBtn.addEventListener('click',()=>{preparePrimarySurface();S.uploadTargetNodeId=null;els.fileInput.click();});els.fileInput.addEventListener('change',async()=>{const targetNodeId=S.uploadTargetNodeId;S.uploadTargetNodeId=null;await uploadFiles([...els.fileInput.files],{targetNodeId});els.fileInput.value='';});els.fileInput.addEventListener('cancel',()=>{S.uploadTargetNodeId=null;});els.refreshAssetsBtn.addEventListener('click',refreshAssets);els.exportBtn.addEventListener('click',()=>{preparePrimarySurface();exportTimeline();});
els.assetDrawerBtn?.addEventListener('click',()=>{preparePrimarySurface();showDrawer('assetDrawer');});els.timelineToggleBtn?.addEventListener('click',()=>setTimelineOpen(els.timelineShell.classList.contains('collapsed')));els.timelineCloseBtn?.addEventListener('click',()=>setTimelineOpen(false));
$$('[data-close-drawer]').forEach(b=>b.addEventListener('click',()=>hideDrawer(b.dataset.closeDrawer)));
els.providerSettingsBtn?.addEventListener('click',openProviderSettings);els.providerModalClose?.addEventListener('click',()=>closeModalElement(els.providerModal));els.providerSaveBtn?.addEventListener('click',saveProviderSettings);els.providerModal?.addEventListener('pointerdown',e=>{if(e.target===els.providerModal)closeModalElement(els.providerModal);});
els.helpBtn?.addEventListener('click',()=>{prepareModalOpen(els.helpModal);els.helpModal.classList.remove('hidden');requestAnimationFrame(()=>els.helpModalClose?.focus());});els.helpModalClose?.addEventListener('click',()=>closeModalElement(els.helpModal));els.helpModal?.addEventListener('pointerdown',e=>{if(e.target===els.helpModal)closeModalElement(els.helpModal);});
els.textOutputModalClose?.addEventListener('click',closeTextOutputPage);els.textOutputModal?.addEventListener('pointerdown',e=>{if(e.target===els.textOutputModal)closeTextOutputPage();});
els.textOutputTable?.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});
els.textOutputTable?.addEventListener('click',e=>{const button=e.target.closest('[data-script-nav]');if(!button)return;const workspace=button.closest('.script-workspace'),target=button.dataset.scriptNav;$$('[data-script-nav]',workspace).forEach(item=>item.classList.toggle('active',item===button));$$('[data-script-section]',workspace).forEach(panel=>panel.classList.toggle('active',panel.dataset.scriptSection===target));workspace.querySelector('.script-section-content')?.scrollTo({top:0,left:0});});
els.textOutputTable?.addEventListener('paste',e=>{if(!e.target.closest('td[contenteditable="true"]'))return;const value=e.clipboardData?.getData('text/plain');if(value==null)return;e.preventDefault();document.execCommand('insertText',false,value.replace(/\s*\r?\n\s*/g,' '));});
els.textOutputContinuityBtn?.addEventListener('click',toggleContinuityReport);els.textOutputStoryboardBtn?.addEventListener('click',()=>{const source=nodeById(S.textOutputNodeId);return source?.data?.preset==='video_script'?createStoryboardScriptFromVideoScript():createStoryboardFromScript();});els.textOutputEditBtn?.addEventListener('click',toggleTextOutputEditing);els.textOutputSaveBtn?.addEventListener('click',saveTextOutputEdits);
els.textOutputCopyBtn?.addEventListener('click',()=>copyTextValue(textOutputDraftValue(),'已复制脚本全文'));
els.agentBtn?.addEventListener('click',toggleAgent);bindAgentWindow();
$$('[data-job-filter]').forEach(button=>button.addEventListener('click',()=>{S.jobFilter=button.dataset.jobFilter||'all';renderJobs();}));els.archiveCompletedJobsBtn?.addEventListener('click',archiveCompletedJobs);
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
window.addEventListener('keydown',e=>{if(handleSpacePanKeydown(e))return;const deleteKey=e.key==='Delete'||e.key==='Backspace'||e.code==='Delete'||e.code==='Backspace',textEntry=keyboardTargetAllowsTextEntry(e.target);if(deleteKey&&!textEntry){e.preventDefault();if(S.selectedNodeIds.length)deleteSelectedNodes();else if(S.selectedEdgeId)deleteSelectedEdge();else if(S.selectedClipId)deleteSelectedClip();return;}const editing=keyboardTargetConsumesShortcuts(e.target);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?canvasRedo():canvasUndo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'&&!editing){e.preventDefault();canvasRedo();return;}if(!editing&&e.key.toLowerCase()==='v')setTool('select');if(!editing&&e.key.toLowerCase()==='h')setTool(S.tool==='pan'?'select':'pan');if(!editing&&e.key.toLowerCase()==='f')fitCanvas();if(e.key.toLowerCase()==='s'&&!editing&&S.selectedClipId){e.preventDefault();splitSelectedClip();return;}if(e.key==='Escape'){e.preventDefault();closeTopLayerOnEscape();}},{capture:true});
window.addEventListener('keyup',handleSpacePanKeyup,{capture:true});
window.addEventListener('blur',()=>{releaseSpacePan();cancelPointerInteraction();});
initUnifiedTooltips();
setTool('select');
init();
