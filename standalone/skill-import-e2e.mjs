import { buildSkillWorkflow, normalizeImportedLiblibSkill } from './skill-catalog.mjs';
import { createSkillRunRecord } from './skill-run.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const remote = {
  templateUuid: '1234567890abcdef1234567890abcdef',
  skillUuid: 'source-skill-1',
  skillKey: 'source-skill-key',
  name: '新中式美学TVC',
  version: '1.0.15',
  description: '新中式美学全案：从妆造、布景到广告成片。',
  resultType: 3,
  useScenario: '品牌广告',
  inputType: '导入产品图和卖点描述',
  outputContent: '角色三视图、场景图、分镜、多语言旁白、国风BGM、完整成片',
  tags: [{ tagLabel: '商业广告' }],
};

const existing = {
  id: 'liblib-skill-1234567890ab',
  promptTemplates: { videoPlanSystem: '旧的通用规则' },
  rules: { shotCount: 1 },
  execution: { workflow: 'generic-video' },
};
const skill = normalizeImportedLiblibSkill(remote, {}, remote.templateUuid, `https://www.liblib.tv/skill/share?uuid=${remote.templateUuid}`, existing);

assert(skill.id === existing.id, 're-import must retain the local skill id');
assert(skill.source.definition.inputType === remote.inputType, 'public source input contract must be retained');
assert(skill.source.definition.outputContent === remote.outputContent, 'public source output contract must be retained');
assert(skill.outputs.join('、') === remote.outputContent, 'declared output items must not be replaced by generic outputs');
assert(skill.fixedSteps.some((step) => step.includes('国风BGM')), 'each source output must become an execution step');
assert(skill.promptTemplates.videoPlanSystem.includes(remote.inputType), 'plan prompt must embed the source input contract');
assert(skill.promptTemplates.videoPrompt.includes('私有画布、隐藏提示词或模型参数'), 'media prompt must not claim hidden source rules');
assert(!('shotCount' in skill.rules) && !('continuity' in skill.rules), 'generic production rules must not leak into imports');
assert(skill.execution.sourceFaithful === true, 'import must select the source-faithful executor');
console.log('PASS imported public contract retained');

const built = buildSkillWorkflow({
  skill,
  existingWorkflow: { version: 2, nodes: [], edges: [] },
  referenceAssetId: 'asset-product',
  referenceKind: 'image',
  instruction: '玉石香薰产品，强调东方雅致',
});
const generated = built.nodes.filter((node) => node.type !== 'asset');
assert(generated.some((node) => node.type === 'textGen' && node.data.title.includes('分镜')), 'declared storyboard output must create a text node');
assert(generated.filter((node) => node.type === 'imageGen').length === 2, 'declared visual outputs must create image nodes');
assert(generated.some((node) => node.type === 'textGen' && node.data.title.includes('国风BGM')), 'declared audio output must create an audio plan node');
assert(generated.some((node) => node.type === 'videoGen' && node.data.title.includes('完整成片')), 'declared final-video output must create a video node');
assert(built.edges.some((edge) => edge.role === 'first-frame'), 'the final video must use the declared image deliverable as its first frame');
console.log('PASS imported outputs compiled into canvas workflow');

const run = createSkillRunRecord({ projectId: 'project-1', skill, result: built });
assert(run.steps.map((step) => step.id).join(',') === 'anchor,keyframes,videos,audio,timeline', 'source-faithful run must expose every generated phase');
console.log('PASS imported SkillRun phases retained');
