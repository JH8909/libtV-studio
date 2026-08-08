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

const SYSTEM_PROMPT = `You are LibTV Studio's creative planning Agent. Turn the user's idea into an actionable short-film plan, never execute media generation or editing.
Return only JSON matching the supplied schema. Use the user's language.
Ask questions only when the conversation contains no usable creative subject. When a user gives a subject or answers a prior question, make a proposal using reasonable defaults for missing platform, duration, audience, ending, and visual details; state those assumptions in message. Never repeat a question that the conversation already answers.
For question replies, keep message to one short introduction and put the actual questions only in questions; never repeat question text in message.
A proposal must contain 3-12 coherent shots. Every shot needs specific composition, visible action, camera movement, lighting, image prompt, video-motion prompt, audio note, and continuity note. Story clarity and continuity beat novelty.
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
    config.openaiKey && { providerId:'openai', modelId:config.openaiModel, displayName:`OpenAI · ${config.openaiModel}` },
    config.geminiKey && { providerId:'gemini', modelId:config.geminiModel, displayName:`Gemini · ${config.geminiModel}` },
    config.agnesKey && { providerId:'agnes', modelId:config.agnesModel, displayName:`Agnes · ${config.agnesModel}` },
  ].filter(Boolean).map(model => ({ ...model, configured:true }));
}

function providerError(label, response, body) {
  const message = body?.error?.message || body?.message || body?.error || `${response.status} ${response.statusText}`;
  return Object.assign(new Error(`${label}: ${String(message).slice(0,800)}`), { status:502 });
}
function openAIText(body) {
  if (typeof body.output_text === 'string') return body.output_text;
  for (const item of body.output || []) for (const content of item.content || []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
  return '';
}
function geminiText(body) { return (body.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join(''); }

async function readProviderStream(response, providerId, onDelta) {
  const reader=response.body?.getReader();if(!reader)return'';
  const decoder=new TextDecoder();let buffer='',result='',mode='unknown';
  const consume=line=>{if(!line.startsWith('data:'))return;const value=line.slice(5).trim();if(!value||value==='[DONE]')return;let data;try{data=JSON.parse(value)}catch{return;}let delta='';if(providerId==='openai'&&data.type==='response.output_text.delta')delta=data.delta||'';else if(providerId==='gemini')delta=geminiText(data);else if(providerId==='agnes')delta=data.choices?.[0]?.delta?.content||'';if(typeof delta==='string'&&delta){if(result&&mode==='unknown')mode=delta.startsWith(result)?'cumulative':'incremental';const next=mode==='cumulative'&&delta.startsWith(result)?delta:result+delta,added=next.slice(result.length);result=next;if(added)onDelta(added);}};
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
  if (providerId === 'openai') {
    label='OpenAI Agent'; url=`${config.openaiBase}/responses`; read=openAIText;
    options={method:'POST',headers:{Authorization:`Bearer ${config.openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelId,instructions:SYSTEM_PROMPT,input:prompt,store:false,stream:Boolean(onRawDelta),text:{format:{type:'json_schema',name:'libtv_creative_plan',strict:true,schema:AGENT_REPLY_SCHEMA}}}),signal:combined};
  } else if (providerId === 'gemini') {
    label='Gemini Agent'; url=`${config.geminiBase}/models/${encodeURIComponent(modelId)}:${onRawDelta?'streamGenerateContent?alt=sse':'generateContent'}`; read=geminiText;
    options={method:'POST',headers:{'x-goog-api-key':config.geminiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:AGENT_REPLY_SCHEMA}}),signal:combined};
  } else if (providerId === 'agnes') {
    label='Agnes Agent'; url=`${config.agnesBase}/chat/completions`; read=body=>body.choices?.[0]?.message?.content || '';
    options={method:'POST',headers:{Authorization:`Bearer ${config.agnesKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelId,messages:[{role:'system',content:`${SYSTEM_PROMPT}\n\nReturn JSON matching this schema exactly:\n${JSON.stringify(AGENT_REPLY_SCHEMA)}`},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0,stream:Boolean(onRawDelta)}),signal:combined};
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
    mediaModels:models.filter(model=>model.providerId!=='mock').map(model=>({providerId:model.providerId,modelId:model.modelId,capabilities:model.capabilities,constraints:model.constraints})),
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
function nodeMeta(proposal, shotId, role) { return { origin:'agent', agentProposalId:proposal.id, shotId, agentRole:role }; }

export function applyAgentProposal(project, proposal, models) {
  if (proposal.status === 'applied') return { workflow:project.workflow, appliedNodeIds:proposal.appliedNodeIds || [] };
  if (proposal.status !== 'pending') fail('proposal is no longer applicable',409);
  const nodes=Array.isArray(project.workflow?.nodes)?project.workflow.nodes:[], edges=Array.isArray(project.workflow?.edges)?project.workflow.edges:[];
  const image=models.find(model=>model.providerId!=='mock'&&model.capabilities?.includes('image.generate'))||models.find(model=>model.capabilities?.includes('image.generate'));
  const video=models.find(model=>model.providerId!=='mock'&&model.capabilities?.includes('video.image_to_video'))||models.find(model=>model.capabilities?.includes('video.image_to_video'));
  const maxRight=nodes.reduce((max,node)=>Math.max(max,Number(node.position?.x||0)+(node.type==='prompt'?300:420)),0);
  const baseX=nodes.length?maxRight+120:80, baseY=60, shotTop=baseY+260, rowGap=680, created=[], newEdges=[];
  const briefId=randomUUID();
  const brief=proposal.plan.brief, style=proposal.plan.styleBible;
  created.push({id:briefId,type:'prompt',position:{x:baseX,y:baseY},data:{preset:'Agent 创作简报',text:`${brief.title}\n\n${brief.logline}\n\n受众：${brief.audience}\n平台：${brief.platform}\n画幅：${brief.aspectRatio}\n时长：${brief.targetDurationSec}s\n基调：${brief.tone}\n结尾：${brief.ending}\n\n视觉：${style.visualStyle}\n色彩：${style.palette}\n镜头：${style.cameraLanguage}\n光线：${style.lighting}\n连续性：${style.continuityRules.join('；')}`, ...nodeMeta(proposal,'brief','brief')}});
  proposal.plan.shots.forEach((shot,index)=>{
    const y=shotTop+index*rowGap, promptId=randomUUID(), imageId=randomUUID(), videoId=randomUUID();
    const imageAspect=preferred(image?.constraints?.aspectRatios,brief.aspectRatio,'16:9'), videoAspect=preferred(video?.constraints?.aspectRatios,brief.aspectRatio,'16:9');
    const imageQuality=preferred(image?.constraints?.resolutions,'2K','2K'), duration=nearest(video?.constraints?.durations,shot.durationSec,shot.durationSec), resolution=preferred(video?.constraints?.resolutions,'720p','720p');
    created.push(
      {id:promptId,type:'prompt',position:{x:baseX,y},data:{preset:`Agent 镜头 ${index+1}`,text:`${shot.title}\n目的：${shot.purpose}\n构图：${shot.composition}\n动作：${shot.action}\n镜头：${shot.camera}\n光线：${shot.lighting}\n画面提示：${shot.imagePrompt}\n声音：${shot.audioNote}\n连续性：${shot.continuityNote}`,...nodeMeta(proposal,shot.id,'shot-prompt')}},
      {id:imageId,type:'imageGen',position:{x:baseX+420,y},data:{modelKey:image?`${image.providerId}::${image.modelId}`:'',prompt:'',status:'idle',progress:0,params:{aspectRatio:imageAspect,quality:imageQuality},layoutWidth:420,...nodeMeta(proposal,shot.id,'image')}},
      {id:videoId,type:'videoGen',position:{x:baseX+900,y},data:{modelKey:video?`${video.providerId}::${video.modelId}`:'',prompt:shot.videoPrompt,status:'idle',progress:0,forcedCapability:'video.image_to_video',params:{duration,aspectRatio:videoAspect,resolution},layoutWidth:420,...nodeMeta(proposal,shot.id,'video')}},
    );
    newEdges.push({id:randomUUID(),source:promptId,target:imageId},{id:randomUUID(),source:imageId,target:videoId,role:'first-frame'});
  });
  project.workflow={version:2,nodes:[...nodes,...created],edges:[...edges,...newEdges]};
  proposal.status='applied'; proposal.appliedNodeIds=created.map(node=>node.id); proposal.appliedAt=new Date().toISOString();
  return {workflow:project.workflow,appliedNodeIds:proposal.appliedNodeIds,briefNodeId:briefId};
}
