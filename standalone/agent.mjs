import { randomUUID } from 'node:crypto';

const stringSchema = { type: 'string' };
const stringArraySchema = { type: 'array', items: stringSchema };
const shotSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: stringSchema, purpose: stringSchema, durationSec: { type: 'integer' },
    composition: stringSchema, action: stringSchema, camera: stringSchema,
    lighting: stringSchema, imagePrompt: stringSchema, videoPrompt: stringSchema,
    audioNote: stringSchema, continuityNote: stringSchema,
  },
  required: ['title','purpose','durationSec','composition','action','camera','lighting','imagePrompt','videoPrompt','audioNote','continuityNote'],
};

export const AGENT_REPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['question','proposal'] },
    message: stringSchema,
    questions: { type: 'array', items: stringSchema },
    plan: {
      type: ['object','null'], additionalProperties: false,
      properties: {
        brief: {
          type: 'object', additionalProperties: false,
          properties: {
            title: stringSchema, logline: stringSchema, audience: stringSchema,
            platform: stringSchema, aspectRatio: stringSchema,
            targetDurationSec: { type: 'integer' }, tone: stringSchema, ending: stringSchema,
          },
          required: ['title','logline','audience','platform','aspectRatio','targetDurationSec','tone','ending'],
        },
        styleBible: {
          type: 'object', additionalProperties: false,
          properties: {
            visualStyle: stringSchema, palette: stringSchema, cameraLanguage: stringSchema,
            lighting: stringSchema, continuityRules: stringArraySchema,
          },
          required: ['visualStyle','palette','cameraLanguage','lighting','continuityRules'],
        },
        storyArc: stringArraySchema,
        shots: { type: 'array', items: shotSchema },
      },
      required: ['brief','styleBible','storyArc','shots'],
    },
  },
  required: ['kind','message','questions','plan'],
};

const SYSTEM_PROMPT = `You are LibTV Studio's creative planning Agent. Turn the user's idea into an actionable short-film sequence plan, never execute media generation or editing.
Return only JSON matching the supplied schema. Use the user's language.
Ask questions only when the conversation contains no usable creative subject. When a user gives a subject or answers a prior question, make a proposal using reasonable defaults for missing platform, duration, audience, ending, and visual details; state those assumptions in message. Never repeat a question that the conversation already answers.
For question replies, keep message to one short introduction and put the actual questions only in questions; never repeat question text in message.
A proposal must contain 3-12 coherent shots. Every shot needs specific composition, visible action, camera movement, lighting, image prompt, video-motion prompt, audio note, and continuity note. Each shot must end in a state the next shot can inherit; later prompts remain provisional until the prior video is accepted. Story clarity and continuity beat novelty.
Never return nodes, edges, patches, tool calls, executable code, secrets, or instructions to run paid generation.`;

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, name, min = 1, max = 4000) {
  if (typeof value !== 'string') fail(`${name} must be a string`);
  const result = value.trim();
  if (result.length < min || result.length > max) fail(`${name} length must be ${min}-${max}`);
  return result;
}
function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  const allowed = new Set(keys);
  const extra = Object.keys(value).filter(key => !allowed.has(key));
  if (extra.length) fail(`${name} contains unsupported fields: ${extra.join(', ')}`);
}
function textList(value, name, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${name} must contain ${min}-${max} items`);
  return value.map((item, index) => text(item, `${name}[${index}]`, 1, 800));
}

export function validateAgentReply(value) {
  exactKeys(value, ['kind','message','questions','plan'], 'reply');
  if (!['question','proposal'].includes(value.kind)) fail('reply.kind must be question or proposal');
  const message = text(value.message, 'reply.message', 1, 4000);
  if (!Array.isArray(value.questions)) fail('reply.questions must be an array');
  if (value.kind === 'question') {
    if (value.plan !== null) fail('question reply plan must be null');
    return { kind:'question', message, questions:textList(value.questions,'reply.questions',1,3), plan:null };
  }
  if (value.questions.length) fail('proposal reply questions must be empty');
  const plan = value.plan;
  exactKeys(plan, ['brief','styleBible','storyArc','shots'], 'plan');
  exactKeys(plan.brief, ['title','logline','audience','platform','aspectRatio','targetDurationSec','tone','ending'], 'plan.brief');
  const brief = {
    title:text(plan.brief.title,'brief.title',1,160), logline:text(plan.brief.logline,'brief.logline',1,600),
    audience:text(plan.brief.audience,'brief.audience',1,200), platform:text(plan.brief.platform,'brief.platform',1,120),
    aspectRatio:text(plan.brief.aspectRatio,'brief.aspectRatio',1,20), targetDurationSec:integer(plan.brief.targetDurationSec,'brief.targetDurationSec',6,600),
    tone:text(plan.brief.tone,'brief.tone',1,240), ending:text(plan.brief.ending,'brief.ending',1,500),
  };
  exactKeys(plan.styleBible, ['visualStyle','palette','cameraLanguage','lighting','continuityRules'], 'plan.styleBible');
  const styleBible = {
    visualStyle:text(plan.styleBible.visualStyle,'styleBible.visualStyle',1,600), palette:text(plan.styleBible.palette,'styleBible.palette',1,300),
    cameraLanguage:text(plan.styleBible.cameraLanguage,'styleBible.cameraLanguage',1,500), lighting:text(plan.styleBible.lighting,'styleBible.lighting',1,400),
    continuityRules:textList(plan.styleBible.continuityRules,'styleBible.continuityRules',1,12),
  };
  const storyArc = textList(plan.storyArc,'plan.storyArc',3,10);
  if (!Array.isArray(plan.shots) || plan.shots.length < 3 || plan.shots.length > 12) fail('plan.shots must contain 3-12 shots');
  const shots = plan.shots.map((shot, index) => {
    exactKeys(shot, shotSchema.required, `shot[${index}]`);
    return {
      id:`shot-${index+1}`, title:text(shot.title,`shot[${index}].title`,1,120), purpose:text(shot.purpose,`shot[${index}].purpose`,1,400),
      durationSec:integer(shot.durationSec,`shot[${index}].durationSec`,1,30), composition:text(shot.composition,`shot[${index}].composition`,1,500),
      action:text(shot.action,`shot[${index}].action`,1,500), camera:text(shot.camera,`shot[${index}].camera`,1,400),
      lighting:text(shot.lighting,`shot[${index}].lighting`,1,400), imagePrompt:text(shot.imagePrompt,`shot[${index}].imagePrompt`,1,1600),
      videoPrompt:text(shot.videoPrompt,`shot[${index}].videoPrompt`,1,1600), audioNote:text(shot.audioNote,`shot[${index}].audioNote`,1,500),
      continuityNote:text(shot.continuityNote,`shot[${index}].continuityNote`,1,500),
    };
  });
  return { kind:'proposal', message, questions:[], plan:{ brief, styleBible, storyArc, shots } };
}

export function ensureAgentSession(project) {
  const source = project.agentSession && typeof project.agentSession === 'object' ? project.agentSession : {};
  project.agentSession = {
    version:1,
    selectedProviderId:typeof source.selectedProviderId === 'string' ? source.selectedProviderId : '',
    selectedModelId:typeof source.selectedModelId === 'string' ? source.selectedModelId : '',
    messages:Array.isArray(source.messages) ? source.messages.slice(-100) : [],
    proposals:Array.isArray(source.proposals) ? source.proposals.slice(-20) : [],
  };
  return project.agentSession;
}

export function configuredAgentModels(config) {
  return [
    config.agnesKey && { providerId:'agnes', modelId:config.agnesModel, displayName:`Agnes · ${config.agnesModel}` },
    config.deepseekKey && { providerId:'deepseek', modelId:config.deepseekModel, displayName:`DeepSeek · ${config.deepseekModel}` },
    config.bailianKey && { providerId:'bailian', modelId:config.bailianModel, displayName:`百炼 · ${config.bailianModel}` },
  ].filter(Boolean).map(model => ({ ...model, configured:true }));
}

function providerError(label, response, body) {
  const message = body?.error?.message || body?.message || body?.error || `${response.status} ${response.statusText}`;
  return Object.assign(new Error(`${label}: ${String(message).slice(0,800)}`), { status:502 });
}
async function readProviderStream(response, providerId, onDelta) {
  const reader=response.body?.getReader();if(!reader)return'';
  const decoder=new TextDecoder();let buffer='',result='',mode='unknown';
  const consume=line=>{if(!line.startsWith('data:'))return;const value=line.slice(5).trim();if(!value||value==='[DONE]')return;let data;try{data=JSON.parse(value)}catch{return;}const delta=providerId==='agnes'?data.choices?.[0]?.delta?.content||'':'';if(typeof delta==='string'&&delta){if(result&&mode==='unknown')mode=delta.startsWith(result)?'cumulative':'incremental';const next=mode==='cumulative'&&delta.startsWith(result)?delta:result+delta,added=next.slice(result.length);result=next;if(added)onDelta(added);}};
  while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines)consume(line);}
  buffer+=decoder.decode();if(buffer)consume(buffer);return result;
}

function messagePrefix(raw) {
  const match=/"message"\s*:\s*"/.exec(raw);if(!match)return'';let output='';
  for(let i=match.index+match[0].length;i<raw.length;i++){const char=raw[i];if(char==='"')break;if(char!=='\\'){output+=char;continue;}const next=raw[++i];if(next===undefined)break;if(next==='u'){const hex=raw.slice(i+1,i+5);if(!/^[0-9a-f]{4}$/i.test(hex))break;output+=String.fromCharCode(parseInt(hex,16));i+=4;continue;}output+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','"':'"','\\':'\\','/':'/'}[next]??next);}
  return output;
}

function normalizeReplyKind(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || ['question','proposal'].includes(value.kind)) return value;
  if (value.plan && typeof value.plan==='object') return {...value,kind:'proposal',questions:[]};
  if (Array.isArray(value.questions) && value.questions.length) return {...value,kind:'question',plan:null};
  return value;
}

function userAnsweredQuestion(messages) {
  let questionAt=-1;
  messages.forEach((message,index)=>{if(message.role==='assistant'&&Array.isArray(message.questions)&&message.questions.length)questionAt=index;});
  return questionAt>=0&&messages.slice(questionAt+1).some(message=>message.role==='user'&&String(message.content||'').trim());
}

async function callProvider(providerId, modelId, prompt, config, signal, onRawDelta) {
  const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(Math.max(1,Number(config.timeoutMs)||90_000))]);
  let url, options, label, read;
  if (providerId === 'agnes') {
    label='Agnes Agent'; url=`${config.agnesBase}/chat/completions`; read=body=>body.choices?.[0]?.message?.content || '';
    options={method:'POST',headers:{Authorization:`Bearer ${config.agnesKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelId,messages:[{role:'system',content:`${SYSTEM_PROMPT}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(AGENT_REPLY_SCHEMA)}`},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0,stream:Boolean(onRawDelta)}),signal:combined};
  } else if (providerId === 'apimart') {
    label='APIMart Agent'; url=`${config.apimartBase}/chat/completions`; read=body=>(body.data||body).choices?.[0]?.message?.content || '';
    options={method:'POST',headers:{Authorization:`Bearer ${config.apimartKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelId,messages:[{role:'system',content:`${SYSTEM_PROMPT}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(AGENT_REPLY_SCHEMA)}`},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0,stream:false}),signal:combined};
  } else if (providerId === 'deepseek' || providerId === 'bailian') {
    const cfg=providerId==='deepseek'?{name:'DeepSeek Agent',base:config.deepseekBase,key:config.deepseekKey}:{name:'百炼 Agent',base:config.bailianBase,key:config.bailianKey};
    label=cfg.name; url=`${cfg.base}/chat/completions`; read=body=>(body.data||body).choices?.[0]?.message?.content || '';
    options={method:'POST',headers:{Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelId,messages:[{role:'system',content:`${SYSTEM_PROMPT}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(AGENT_REPLY_SCHEMA)}`},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0,stream:false}),signal:combined};
  } else fail('unsupported Agent provider');
  const response = await fetch(url, options);
  if (!response.ok){const body=await response.json().catch(()=>({}));throw providerError(label,response,body);}
  if(onRawDelta&&response.headers.get('content-type')?.includes('text/event-stream')){const result=await readProviderStream(response,providerId,onRawDelta);if(result)return result;throw Object.assign(new Error(`${label} returned no streamed text`),{status:502});}
  const body=await response.json().catch(()=>({}));const result=read(body);if(result&&onRawDelta)onRawDelta(result);if(!result)throw Object.assign(new Error(`${label} returned no text`),{status:502});
  return result;
}

export async function createAgentReply({ project, messages, models, providerId, modelId, config, signal, onMessageEvent }) {
  const context = {
    project:{ name:project.name, nodeCount:project.workflow?.nodes?.length || 0, edgeCount:project.workflow?.edges?.length || 0 },
    mediaModels:models.map(model=>({providerId:model.providerId,modelId:model.modelId,capabilities:model.capabilities,constraints:model.constraints})),
    conversation:messages.slice(-12).map(({role,content})=>({role,content})),
  };
  let prompt=`Create the next Agent reply from this local project context:\n${JSON.stringify(context)}`;
  let lastError;
  for (let attempt=0;attempt<2;attempt++) {
    if(attempt&&onMessageEvent)onMessageEvent({type:'reset'});let emitted='',emittedLength=0;const raw=await callProvider(providerId,modelId,prompt,config,signal,onMessageEvent?delta=>{emitted+=delta;const prefix=messagePrefix(emitted),next=prefix.slice(emittedLength);if(next)onMessageEvent({type:'delta',delta:next});emittedLength=prefix.length;}:null);
    try { const reply=validateAgentReply(normalizeReplyKind(JSON.parse(raw)));if(reply.kind==='question'&&userAnsweredQuestion(messages))fail('reply repeated questions after the user answered; return a proposal with assumptions');return reply; }
    catch(error) {
      lastError=error;
      prompt=`Repair the previous invalid JSON. Return a complete replacement matching the schema exactly. Validation error: ${error.message}\nInvalid output:\n${raw.slice(0,6000)}\nOriginal context:\n${JSON.stringify(context)}`;
    }
  }
  throw Object.assign(new Error(`Agent output validation failed after one repair: ${lastError?.message || 'invalid output'}`),{status:502});
}

function nearest(values, wanted, fallback) {
  const numbers=(values||[]).map(Number).filter(Number.isFinite); if(!numbers.length)return fallback;
  return numbers.reduce((best,value)=>Math.abs(value-wanted)<Math.abs(best-wanted)?value:best,numbers[0]);
}
function preferred(values, wanted, fallback) { return (values||[]).includes(wanted)?wanted:((values||[]).includes(fallback)?fallback:(values||[])[0]||wanted||fallback); }
function nodeMeta(proposalId, shotId, role, extra={}) { return { origin:'agent', agentProposalId:proposalId, shotId, agentRole:role, ...extra }; }

function createSequenceClipNodes(project, sequence, models, clip, previous) {
  const nodes=project.workflow.nodes,edges=project.workflow.edges,shot=sequence.plan.shots[clip.index];
  if (!shot) fail('sequence clip has no matching shot',409);
  const image=models.find(model=>model.capabilities?.includes('image.generate'));
  const video=models.find(model=>model.capabilities?.includes('video.image_to_video'));
  const y=sequence.layoutBaseY+clip.index*680,imageId=randomUUID(),videoId=randomUUID();
  const imageAspect=preferred(image?.constraints?.aspectRatios,sequence.plan.brief.aspectRatio,'16:9'),videoAspect=preferred(video?.constraints?.aspectRatios,sequence.plan.brief.aspectRatio,'16:9');
  const imageQuality=preferred(image?.constraints?.resolutions,'2K','2K'),duration=nearest(video?.constraints?.durations,shot.durationSec,shot.durationSec),resolution=preferred(video?.constraints?.resolutions,'720p','720p');
  const inherited=previous?.observedEndState?`\n\n承接上一段已验收结尾：${previous.observedEndState}`:'';
  const imagePrompt=`${shot.imagePrompt}\n\n${shot.title}\n目的：${shot.purpose}\n构图：${shot.composition}\n动作：${shot.action}\n镜头：${shot.camera}\n光线：${shot.lighting}\n视觉风格：${sequence.plan.styleBible.visualStyle}\n色彩：${sequence.plan.styleBible.palette}\n连续性：${shot.continuityNote}${inherited}`;
  const sequenceMeta={sequenceId:sequence.id,sequenceClipId:clip.id,sequenceStatus:'ready',sequenceReviewStatus:''};
  const created=[
    {id:imageId,type:'imageGen',position:{x:sequence.layoutBaseX,y},data:{modelKey:image?`${image.providerId}::${image.modelId}`:'',prompt:imagePrompt,status:'idle',progress:0,params:{aspectRatio:imageAspect,quality:imageQuality},layoutWidth:420,...nodeMeta(sequence.proposalId,shot.id,'image',sequenceMeta)}},
    {id:videoId,type:'videoGen',position:{x:sequence.layoutBaseX+540,y},data:{modelKey:video?`${video.providerId}::${video.modelId}`:'',prompt:`${shot.videoPrompt}${inherited}`,status:'idle',progress:0,forcedCapability:'video.image_to_video',params:{duration,aspectRatio:videoAspect,resolution},layoutWidth:420,...nodeMeta(sequence.proposalId,shot.id,'video',sequenceMeta)}},
  ];
  nodes.push(...created);edges.push({id:randomUUID(),source:imageId,target:videoId,role:'first-frame'});
  clip.status='ready';clip.imageNodeId=imageId;clip.videoNodeId=videoId;return created;
}

export function applyAgentProposal(project, proposal, models) {
  if (proposal.status === 'applied') return { workflow:project.workflow, appliedNodeIds:proposal.appliedNodeIds || [] };
  if (proposal.status !== 'pending') fail('proposal is no longer applicable',409);
  const nodes=Array.isArray(project.workflow?.nodes)?project.workflow.nodes:[], edges=Array.isArray(project.workflow?.edges)?project.workflow.edges:[];
  const maxRight=nodes.reduce((max,node)=>Math.max(max,Number(node.position?.x||0)+420),0),layoutBaseX=nodes.length?maxRight+120:80;
  const sequence={version:1,id:randomUUID(),proposalId:proposal.id,plan:proposal.plan,activeClipId:'',layoutBaseX,layoutBaseY:60,clips:proposal.plan.shots.map((shot,index)=>({id:randomUUID(),index,shotId:shot.id,status:'planned',imageNodeId:'',videoNodeId:'',observedEndState:'',lastVerdict:''}))};
  project.workflow={version:2,nodes,edges,sequence};
  const created=createSequenceClipNodes(project,sequence,models,sequence.clips[0]);sequence.activeClipId=sequence.clips[0].id;
  proposal.status='applied'; proposal.appliedNodeIds=created.map(node=>node.id); proposal.appliedAt=new Date().toISOString();
  return {workflow:project.workflow,appliedNodeIds:proposal.appliedNodeIds,briefNodeId:created[0]?.id||null};
}

export function reviewSequenceClip(project, clipId, decision, observedEndState, models) {
  const sequence=project.workflow?.sequence,clip=sequence?.clips?.find(item=>item.id===clipId),video=project.workflow?.nodes?.find(node=>node.id===clip?.videoNodeId);
  if (!sequence||!clip||!video) fail('sequence clip not found',404);
  if (decision==='reject') { clip.lastVerdict='rejected';video.data.sequenceReviewStatus='rejected';return {workflow:project.workflow,appliedNodeIds:[],nextClipId:null}; }
  if (decision!=='accept') fail('invalid sequence review decision');
  const next=sequence.clips[clip.index+1];
  if (clip.status==='accepted') {
    if (!next) return {workflow:project.workflow,appliedNodeIds:[],nextClipId:null};
    if (next.status==='planned') { const created=createSequenceClipNodes(project,sequence,models,next,clip);sequence.activeClipId=next.id;return {workflow:project.workflow,appliedNodeIds:created.map(node=>node.id),nextClipId:next.id}; }
    return {workflow:project.workflow,appliedNodeIds:[],nextClipId:next.id};
  }
  if (clip.status!=='ready'||video.data.status!=='succeeded'||!(video.data.outputAssetIds||[]).length) fail('only a completed current clip can be accepted',409);
  clip.status='accepted';clip.lastVerdict='accepted';clip.observedEndState=observedEndState.trim()?text(observedEndState,'observedEndState',1,600):'';video.data.sequenceReviewStatus='accepted';
  if(!next){sequence.activeClipId='';return {workflow:project.workflow,appliedNodeIds:[],nextClipId:null};}
  if(next.status!=='planned')fail('next sequence clip is not available',409);
  const created=createSequenceClipNodes(project,sequence,models,next,clip);sequence.activeClipId=next.id;
  return {workflow:project.workflow,appliedNodeIds:created.map(node=>node.id),nextClipId:next.id};
}
