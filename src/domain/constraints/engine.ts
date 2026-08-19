import type { ConstraintActionCandidate, ConstraintContext, ConstraintEvaluation, ConstraintFinding } from './model'

function minimumCandidate(actions: ConstraintActionCandidate[]): ConstraintActionCandidate | undefined {
  return actions
    .filter(action => !action.protected)
    .slice()
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)[0]
}

function finding(
  kind: ConstraintFinding['kind'], severity: ConstraintFinding['severity'], actionIds: string[],
  evidence: string[], explanation: string, minimumAdjustment: string, minimumActionId?: string
): ConstraintFinding {
  return { id: `constraint:${kind}:${actionIds.join(',') || 'context'}`, kind, severity, actionIds, evidence, explanation, minimumAdjustment, minimumActionId }
}

function boundaryBlocks(boundary: { blockedMatterIds?: string[]; allowedMatterIds?: string[] }, matterId?: string): boolean {
  if (!matterId) return false
  if (boundary.blockedMatterIds?.includes(matterId)) return true
  return !!boundary.allowedMatterIds && !boundary.allowedMatterIds.includes(matterId)
}

export function evaluateConstraints(context: ConstraintContext): ConstraintEvaluation {
  const findings: ConstraintFinding[] = []
  const candidates = context.actionCandidates
  const minimum = minimumCandidate(candidates)
  let reducedIntensity = context.bodyState === 'tired' || context.bodyState === 'bad' || context.mentalState === 'heavy' || context.mentalState === 'overloaded' || context.load >= 70

  if (context.bodyState === 'bad' || context.bodyState === 'tired') {
    const affected = candidates.filter(action => action.intensity === 'high' || action.estimatedMinutes > 30)
    if (affected.length) findings.push(finding(
      'body_capacity', context.bodyState === 'bad' ? 'critical' : 'warning', affected.map(action => action.actionId),
      [`body_state:${context.bodyState}`], '当前身体容量不足以支撑高强度行动。', '把行动缩小到最小必要步骤，或改期。', minimum?.actionId
    ))
  }

  if (context.mentalState === 'overloaded' || context.load >= 80) {
    const affected = candidates.filter(action => action.intensity !== 'minimum')
    if (affected.length) findings.push(finding(
      'mental_load', 'critical', affected.map(action => action.actionId),
      [`mental_state:${context.mentalState}`, `load:${context.load}`], '心理负荷过高，继续堆叠任务会增加切换和逃避。', '只保留一个最小行动，并明确今天不做什么。', minimum?.actionId
    ))
  } else if (context.mentalState === 'heavy' || context.load >= 60) {
    const affected = candidates.filter(action => action.intensity === 'high')
    if (affected.length) findings.push(finding(
      'mental_load', 'warning', affected.map(action => action.actionId),
      [`mental_state:${context.mentalState}`, `load:${context.load}`], '心理负荷正在压缩可用注意力。', '降低强度并减少并行行动。', minimum?.actionId
    ))
  }

  const requiredMinutes = candidates.filter(action => !action.protected).reduce((sum, action) => sum + action.estimatedMinutes, 0)
  const availableMinutes = Math.max(0, context.availableMinutes - (context.protectedMinutes || 0))
  if (requiredMinutes > availableMinutes) {
    findings.push(finding(
      'time_window', 'warning', candidates.map(action => action.actionId),
      [`required_minutes:${requiredMinutes}`, `available_minutes:${availableMinutes}`], '候选行动占用的时间超过今天可用时间。', '只选择最小行动，其余行动移动到后续时间窗。', minimum?.actionId
    ))
  }

  const competingIds = context.competingMatterIds || []
  const competingActions = candidates.filter(action => action.matterId && competingIds.includes(action.matterId))
  if (competingActions.length > 1) {
    findings.push(finding(
      'matter_competition', 'notice', competingActions.map(action => action.actionId),
      competingActions.map(action => `matter:${action.matterId}`), '多个 Matter 同时争夺今天的注意力。', '先指定一个主 Matter，其余只保留最低维护动作。', minimum?.actionId
    ))
  }

  const unavailable = new Map((context.resources || []).filter(resource => !resource.available).map(resource => [resource.resourceId, resource]))
  const resourceAffected = candidates.filter(action => (action.requiredResourceIds || []).some(resourceId => unavailable.has(resourceId)))
  if (resourceAffected.length) {
    findings.push(finding(
      'resource_availability', 'warning', resourceAffected.map(action => action.actionId),
      [...new Set(resourceAffected.flatMap(action => (action.requiredResourceIds || []).filter(resourceId => unavailable.has(resourceId)).map(resourceId => `resource_unavailable:${resourceId}`)))],
      '部分行动依赖的资源当前不可用，继续安排会把计划建立在假设上。', '改用现有资源，或把行动缩小为不依赖该资源的步骤。', minimum?.actionId
    ))
  }

  if (context.preferredTrajectory) {
    const trajectoryAffected = candidates.filter(action => action.trajectory && action.trajectory !== context.preferredTrajectory)
    if (trajectoryAffected.length) {
      findings.push(finding(
        'trajectory_conflict', 'notice', trajectoryAffected.map(action => action.actionId),
        [`preferred_trajectory:${context.preferredTrajectory}`, ...new Set(trajectoryAffected.map(action => `action_trajectory:${action.trajectory}`))],
        '候选行动连接的 Matter 方向不一致，今天的注意力可能会被不同方向拉扯。', '先选择与主 Matter 同方向的最小行动，其余保留为观察。', minimum?.actionId
      ))
    }
  }

  const relationships = new Map((context.relationshipBoundaries || []).map(boundary => [boundary.boundaryId, boundary]))
  const relationshipAffected = candidates.filter(action => (action.relationshipIds || []).some(id => boundaryBlocks(relationships.get(id) || {}, action.matterId)))
  if (relationshipAffected.length) {
    findings.push(finding(
      'relationship_boundary', 'warning', relationshipAffected.map(action => action.actionId),
      [...new Set(relationshipAffected.flatMap(action => (action.relationshipIds || []).filter(id => boundaryBlocks(relationships.get(id) || {}, action.matterId)).map(id => `relationship_boundary:${id}`)))],
      '行动触及了当前 Relationship 边界，不应把个人推进直接当成对方可用的承诺。', '先确认边界和可用节律，再决定是否推进。', minimum?.actionId
    ))
  }

  const sharedSpaces = new Map((context.sharedSpaceBoundaries || []).map(boundary => [boundary.boundaryId, boundary]))
  const sharedSpaceAffected = candidates.filter(action => (action.sharedSpaceIds || []).some(id => boundaryBlocks(sharedSpaces.get(id) || {}, action.matterId)))
  if (sharedSpaceAffected.length) {
    findings.push(finding(
      'shared_space_conflict', 'warning', sharedSpaceAffected.map(action => action.actionId),
      [...new Set(sharedSpaceAffected.flatMap(action => (action.sharedSpaceIds || []).filter(id => boundaryBlocks(sharedSpaces.get(id) || {}, action.matterId)).map(id => `shared_space_boundary:${id}`)))],
      '行动与 Shared Space 的共同边界或权限冲突，不能只按个人时间安排。', '先协商共同规则，或改成不触及共享空间的个人步骤。', minimum?.actionId
    ))
  }

  const suggestedActionIds = reducedIntensity
    ? (minimum ? [minimum.actionId] : [])
    : candidates.slice(0, 3).map(action => action.actionId)
  return { findings, suggestedActionIds, reducedIntensity }
}
