import type { FeishuField, FeishuRecord, FeishuTableKey } from '@/core/api/feishu'

export type FieldRole = 'title' | 'status' | 'project' | 'due' | 'owner' | 'body' | 'progress' | 'count'
export type FieldBindings = Partial<Record<FieldRole, string>>
export type WorkspaceBindings = Partial<Record<FeishuTableKey, FieldBindings>>

const aliases: Record<FeishuTableKey, Partial<Record<FieldRole, string[]>>> = {
  tasks: { title: ['任务', '任务名称'], status: ['状态'], project: ['所属项目'], due: ['截止时间'], owner: ['任务执行人'], body: ['解决方案'] },
  projects: { title: ['项目名称', '项目'], status: ['状态'], due: ['项目截止时间'], body: ['目标'], progress: ['任务完成度'], count: ['任务数量'] },
  reviews: { title: ['汇报标题', '周报'], project: ['所属项目'], due: ['日期'], owner: ['汇报人'], body: ['进度内容'] },
  members: { title: ['成员名', '成员'], owner: ['账号'], body: ['部门'] },
}

export function bindFields(table: FeishuTableKey, fields: FeishuField[], saved: FieldBindings = {}): FieldBindings {
  const result = { ...saved }
  for (const role of Object.keys(aliases[table]) as FieldRole[]) {
    // A disappeared ID must not silently rebind to another similarly named field.
    if (result[role]) continue
    const found = fields.find(item => aliases[table][role]?.includes(item.field_name))
    if (found) result[role] = found.field_id
  }
  return result
}

export function boundField(fields: FeishuField[], bindings: FieldBindings, role: FieldRole): FeishuField | undefined {
  return fields.find(item => item.field_id === bindings[role])
}

export function valueText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    return valueText(item.text ?? item.name ?? item.value ?? item.display_name ?? item.title)
  }
  return String(value)
}

export function relationIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(relationIds)
  if (typeof value === 'string') return value.startsWith('rec') ? [value] : []
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    return relationIds(item.record_ids ?? item.record_id ?? [])
  }
  return []
}

export function fieldValue(record: FeishuRecord, fields: FeishuField[], bindings: FieldBindings, role: FieldRole): unknown {
  const field = boundField(fields, bindings, role)
  return field ? record.fields[field.field_name] : undefined
}

export function statusOptions(fields: FeishuField[], bindings: FieldBindings, records: FeishuRecord[]): string[] {
  const status = boundField(fields, bindings, 'status')
  const names = status?.type === 3 ? (status.property?.options || []).map(item => item.name) : []
  return [...new Set([...names, ...records.map(item => valueText(fieldValue(item, fields, bindings, 'status')) || '未设置')])]
}

export function taskCreateFields(fields: FeishuField[], bindings: FieldBindings, title: string, projectId = ''): Record<string, unknown> {
  const titleField = boundField(fields, bindings, 'title')
  if (!titleField || titleField.type !== 1) throw new Error('任务标题字段缺失或不再是文本，请在飞书检查字段配置。')
  if (!title.trim()) throw new Error('请填写任务标题')
  const result: Record<string, unknown> = { [titleField.field_name]: title.trim() }
  const status = boundField(fields, bindings, 'status')
  if (status?.type === 3 && status.property?.options?.some(item => item.name === '未开始')) result[status.field_name] = '未开始'
  if (projectId) {
    const project = boundField(fields, bindings, 'project')
    if (!project || ![18, 21].includes(project.type)) throw new Error('项目关联字段缺失或类型已变化，暂不能关联项目。')
    result[project.field_name] = [projectId]
  }
  return result
}

export function taskStatusFields(fields: FeishuField[], bindings: FieldBindings, status: string): Record<string, unknown> {
  const field = boundField(fields, bindings, 'status')
  if (!field || field.type !== 3 || !field.property?.options?.some(item => item.name === status)) throw new Error('该状态不在飞书当前选项中，请刷新后再操作。')
  return { [field.field_name]: status }
}

export function readTodayReferences(storage: Pick<Storage, 'getItem'>, workspaceId: string, date: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(`calmy:feishu:today:${workspaceId}:${date}`) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))].slice(0, 3) : []
  } catch { return [] }
}

export function writeTodayReferences(storage: Pick<Storage, 'setItem'>, workspaceId: string, date: string, ids: string[]): void {
  storage.setItem(`calmy:feishu:today:${workspaceId}:${date}`, JSON.stringify([...new Set(ids)].slice(0, 3)))
}
