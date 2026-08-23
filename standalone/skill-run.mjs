import { randomUUID } from 'node:crypto';

const STEP_ORDER = ['anchor', 'storyboard', 'keyframes', 'videos', 'audio', 'timeline'];

function now() {
  return new Date().toISOString();
}

function workflowStageToStep(stage) {
  const value = String(stage || '');
  if (value === 'creative-anchor' || value === 'vfx-plan' || value === 'image-plan') return 'anchor';
  if (value === 'storyboard') return 'storyboard';
  if (value === 'skill-keyframe' || value === 'skill-image') return 'keyframes';
  if (value === 'skill-video') return 'videos';
  if (value === 'voiceover-plan' || value === 'music-plan') return 'audio';
  return '';
}

export function skillRunStepsFromNodes(nodes = [], skill) {
  const byStep = Object.fromEntries(STEP_ORDER.map((id) => [id, { id, status: 'queued', nodeIds: [], shotIds: [] }]));
  const workflow = skill?.execution?.workflow;
  const isGeneric = ['cinematic-vfx', 'generic-video', 'generic-image'].includes(workflow);
  const isSourceFaithful = skill?.execution?.sourceFaithful === true;
  const isPlannedProduction = skill?.id === 'new-chinese-tvc';

  for (const node of nodes) {
    const stage = node?.data?.workflowStage;
    const stepId = node?.data?.stepId || workflowStageToStep(stage);
    if (!stepId || !byStep[stepId]) continue;
    byStep[stepId].nodeIds.push(node.id);
    const shot = node?.data?.shotId || node?.data?.storyboardShot;
    if (shot && !byStep[stepId].shotIds.includes(shot)) byStep[stepId].shotIds.push(shot);
  }

  if (isGeneric) {
    if (isSourceFaithful) {
      return STEP_ORDER.filter((id) => byStep[id].nodeIds.length || id === 'timeline').map((id) => byStep[id]);
    }
    if (!byStep.anchor.nodeIds.length && byStep.keyframes.nodeIds.length) {
      // generic-image may only have plan + image
    }
    return ['anchor', workflow === 'generic-image' ? 'keyframes' : 'videos', 'timeline']
      .filter((id) => byStep[id].nodeIds.length || id === 'timeline')
      .map((id) => byStep[id]);
  }

  // Planned production Skills create media nodes after the storyboard is
  // generated. Keep future phases so they can receive compiled node IDs.
  return STEP_ORDER
    .map((id) => byStep[id])
    .filter((step) => isPlannedProduction || step.nodeIds.length || step.id === 'timeline');
}

export function createSkillRunRecord({ projectId, skill, result }) {
  const runId = randomUUID();
  const createdNodes = (result?.nodes || []).filter((node) => (result?.createdNodeIds || []).includes(node.id));
  const steps = skillRunStepsFromNodes(createdNodes, skill).map((step) => ({
    ...step,
    status: 'queued',
    error: null,
  }));
  return {
    runId,
    projectId,
    skillId: skill.id,
    skillVersion: Number(skill.version || 1),
    status: 'queued',
    inputValues: { ...(result?.input || {}) },
    steps,
    assetIds: [],
    createdNodeIds: [...(result?.createdNodeIds || [])],
    videoNodeIds: [...(result?.videoNodeIds || [])],
    audioPlanNodeIds: [...(result?.audioPlanNodeIds || [])],
    autoRun: skill.execution?.autoRun === true,
    error: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function tagWorkflowNodesWithSkillRun(nodes, runId) {
  for (const node of nodes || []) {
    if (!node?.data) continue;
    if (!node.data.skillRunId && node.data.skillId) node.data.skillRunId = runId;
    if (!node.data.stepId) {
      const stepId = workflowStageToStep(node.data.workflowStage);
      if (stepId) node.data.stepId = stepId;
    }
    if (!node.data.shotId && node.data.storyboardShot) node.data.shotId = node.data.storyboardShot;
  }
  return nodes;
}

function nodeTerminalStatus(status) {
  const value = String(status || 'idle').toLowerCase();
  if (value === 'succeeded') return 'succeeded';
  if (['failed', 'error'].includes(value)) return 'failed';
  if (value === 'canceled') return 'canceled';
  if (['queued', 'processing', 'running'].includes(value)) return 'processing';
  return 'queued';
}

export function syncSkillRunProgress(run, workflow) {
  if (!run) return run;
  delete run.confirmMode;
  delete run.pauseAt;
  if (run.status === 'canceled') {
    run.updatedAt = now();
    return run;
  }
  const nodesById = new Map((workflow?.nodes || []).map((node) => [node.id, node]));
  const assetIds = new Set(run.assetIds || []);
  for (const step of run.steps || []) {
    if (step.id === 'timeline') continue;
    const statuses = (step.nodeIds || []).map((id) => nodeTerminalStatus(nodesById.get(id)?.data?.status));
    if (!statuses.length) {
      step.status = 'queued';
      continue;
    }
    if (statuses.every((status) => status === 'succeeded')) step.status = 'succeeded';
    else if (statuses.some((status) => status === 'failed')) {
      step.status = 'failed';
      const failed = (step.nodeIds || [])
        .map((id) => nodesById.get(id))
        .find((node) => nodeTerminalStatus(node?.data?.status) === 'failed');
      step.error = failed?.data?.error || '步骤失败';
    } else if (statuses.some((status) => status === 'canceled')) {
      step.status = 'canceled';
      step.error = '步骤已取消';
    } else if (statuses.some((status) => status === 'processing')) step.status = 'processing';
    else if (statuses.some((status) => status === 'succeeded')) step.status = 'processing';
    else step.status = 'queued';

    for (const id of step.nodeIds || []) {
      const node = nodesById.get(id);
      for (const assetId of node?.data?.outputAssetIds || []) if (assetId) assetIds.add(assetId);
    }
  }
  run.assetIds = [...assetIds];
  if ((run.steps || []).some((step) => step.status === 'failed')) {
    run.status = 'failed';
    run.error = (run.steps || []).find((step) => step.status === 'failed')?.error || 'SkillRun 失败';
  } else if ((run.steps || []).some((step) => step.status === 'canceled')) {
    run.status = 'canceled';
    run.error = 'SkillRun 已取消';
  } else if ((run.steps || []).filter((step) => step.id !== 'timeline').every((step) => step.status === 'succeeded') && run.steps.find((step) => step.id === 'timeline')?.status === 'succeeded') {
    run.status = 'succeeded';
    run.error = null;
  } else if ((run.steps || []).some((step) => step.status === 'processing' || step.status === 'succeeded')) {
    run.status = 'processing';
    run.error = null;
  } else run.status = 'queued';
  run.updatedAt = now();
  return run;
}

export function publicSkillRun(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    id: run.runId,
    projectId: run.projectId,
    skillId: run.skillId,
    skillVersion: run.skillVersion,
    status: run.status,
    inputValues: run.inputValues,
    input: run.inputValues,
    steps: run.steps,
    assetIds: run.assetIds,
    createdNodeIds: run.createdNodeIds,
    videoNodeIds: run.videoNodeIds,
    audioPlanNodeIds: run.audioPlanNodeIds,
    autoRun: run.autoRun,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function skillPhaseNodeIds(run, phase) {
  const step = (run?.steps || []).find((item) => item.id === phase);
  return [...(step?.nodeIds || [])];
}
