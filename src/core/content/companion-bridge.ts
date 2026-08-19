export const COMPANION_BRIDGE_VERSION = 1 as const

export type BridgeClient = 'calmy-web' | 'obsidian-plugin'
export type BridgeFieldDecision = 'keep-local' | 'use-incoming'
export type BridgeDecision = BridgeFieldDecision | {
  mode: 'merge'
  fields: Record<string, BridgeFieldDecision>
}

interface BridgeMessageBase<K extends string> {
  bridge_version: typeof COMPANION_BRIDGE_VERSION
  message_id: string
  kind: K
}

export interface BridgeHelloMessage extends BridgeMessageBase<'hello'> {
  client: BridgeClient
  capabilities: string[]
}

export interface BridgeWorkspaceExportRequestMessage extends BridgeMessageBase<'workspace_export_request'> {
  request_id: string
}

export interface BridgeWorkspaceExportOfferMessage extends BridgeMessageBase<'workspace_export_offer'> {
  request_id: string
  manifest_hash: string
  entity_count: number
  asset_count: number
}

export interface BridgeAssetPayload {
  path: string
  mime_type: string
  data_base64: string
}

export interface BridgeWorkspacePayload {
  files: Record<string, string>
  assets: BridgeAssetPayload[]
}

export interface BridgeWorkspaceExportMessage extends BridgeMessageBase<'workspace_export'> {
  request_id: string
  manifest_hash: string
  workspace: BridgeWorkspacePayload
}

export interface BridgeConflictPreview {
  calmy_id: string
  calmy_type: string
  local_revision: number
  incoming_revision: number
  fields: Array<{ key: string; local_value: unknown; incoming_value: unknown }>
}

export interface BridgeWorkspaceImportPreviewMessage extends BridgeMessageBase<'workspace_import_preview'> {
  request_id: string
  added_ids: string[]
  unchanged_ids: string[]
  conflict_ids: string[]
  asset_conflict_paths: string[]
  missing_asset_paths: string[]
  orphan_asset_paths: string[]
  issues: Array<{ path: string; code: string; message: string }>
  conflict_previews?: BridgeConflictPreview[]
  tombstone_ids?: string[]
}

export interface BridgeWorkspaceImportApplyMessage extends BridgeMessageBase<'workspace_import_apply'> {
  request_id: string
  workspace: BridgeWorkspacePayload
  decisions: Record<string, BridgeDecision>
}

export interface BridgeAckMessage extends BridgeMessageBase<'ack'> {
  request_id: string
  message: string
}

export interface BridgeErrorMessage extends BridgeMessageBase<'error'> {
  request_id?: string
  code: string
  message: string
}

export type CompanionMessage =
  | BridgeHelloMessage
  | BridgeWorkspaceExportRequestMessage
  | BridgeWorkspaceExportOfferMessage
  | BridgeWorkspaceExportMessage
  | BridgeWorkspaceImportPreviewMessage
  | BridgeWorkspaceImportApplyMessage
  | BridgeAckMessage
  | BridgeErrorMessage

export class CompanionBridgeMessageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CompanionBridgeMessageError'
  }
}

export function createBridgeMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'bridge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export function createBridgeHello(client: BridgeClient, capabilities: string[] = []): BridgeHelloMessage {
  return {
    bridge_version: COMPANION_BRIDGE_VERSION,
    message_id: createBridgeMessageId(),
    kind: 'hello',
    client,
    capabilities: [...capabilities]
  }
}

export function createWorkspaceExportRequest(requestId = createBridgeMessageId()): BridgeWorkspaceExportRequestMessage {
  return {
    bridge_version: COMPANION_BRIDGE_VERSION,
    message_id: createBridgeMessageId(),
    kind: 'workspace_export_request',
    request_id: requestId
  }
}

export function createWorkspaceImportApply(
  workspace: BridgeWorkspacePayload,
  decisions: Record<string, BridgeDecision>,
  requestId = createBridgeMessageId()
): BridgeWorkspaceImportApplyMessage {
  return {
    bridge_version: COMPANION_BRIDGE_VERSION,
    message_id: createBridgeMessageId(),
    kind: 'workspace_import_apply',
    request_id: requestId,
    workspace,
    decisions: { ...decisions }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string, code = 'bridge-field-invalid'): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') throw new CompanionBridgeMessageError(code, key + ' must be a non-empty string')
  return value
}

function requireStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new CompanionBridgeMessageError('bridge-array-invalid', key + ' must be an array of non-empty strings')
  }
  return value as string[]
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] {
  if (record[key] === undefined) return []
  return requireStringArray(record, key)
}

function requireIssueArray(record: Record<string, unknown>, key: string): Array<{ path: string; code: string; message: string }> {
  const value = record[key]
  if (!Array.isArray(value)) throw new CompanionBridgeMessageError('bridge-issues-invalid', key + ' must be an array')
  return value.map(item => {
    if (!isRecord(item)) throw new CompanionBridgeMessageError('bridge-issues-invalid', key + ' must contain objects')
    return {
      path: requireString(item, 'path', 'bridge-issues-invalid'),
      code: requireString(item, 'code', 'bridge-issues-invalid'),
      message: requireString(item, 'message', 'bridge-issues-invalid')
    }
  })
}

function optionalConflictPreviews(record: Record<string, unknown>): BridgeConflictPreview[] {
  const value = record.conflict_previews
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new CompanionBridgeMessageError('bridge-conflicts-invalid', 'conflict_previews must be an array')
  return value.map(item => {
    if (!isRecord(item)) throw new CompanionBridgeMessageError('bridge-conflicts-invalid', 'conflict previews must contain objects')
    const fields = item.fields
    if (!Array.isArray(fields)) throw new CompanionBridgeMessageError('bridge-conflicts-invalid', 'conflict preview fields must be an array')
    return {
      calmy_id: requireString(item, 'calmy_id', 'bridge-conflicts-invalid'),
      calmy_type: requireString(item, 'calmy_type', 'bridge-conflicts-invalid'),
      local_revision: requireNonNegativeInteger(item, 'local_revision'),
      incoming_revision: requireNonNegativeInteger(item, 'incoming_revision'),
      fields: fields.map(field => {
        if (!isRecord(field)) throw new CompanionBridgeMessageError('bridge-conflicts-invalid', 'conflict fields must contain objects')
        return { key: requireString(field, 'key', 'bridge-conflicts-invalid'), local_value: field.local_value, incoming_value: field.incoming_value }
      })
    }
  })
}

function requireNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new CompanionBridgeMessageError('bridge-number-invalid', key + ' must be a non-negative integer')
  }
  return value
}

function parseDecision(value: unknown): BridgeDecision {
  if (value === 'keep-local' || value === 'use-incoming') return value
  if (!isRecord(value) || value.mode !== 'merge' || !isRecord(value.fields)) {
    throw new CompanionBridgeMessageError('bridge-decision-invalid', 'decision must be keep-local, use-incoming, or a merge decision')
  }
  const fields: Record<string, BridgeFieldDecision> = {}
  for (const [field, decision] of Object.entries(value.fields)) {
    if (field.trim() === '' || (decision !== 'keep-local' && decision !== 'use-incoming')) {
      throw new CompanionBridgeMessageError('bridge-field-decision-invalid', 'merge fields must contain valid field decisions')
    }
    fields[field] = decision
  }
  return { mode: 'merge', fields }
}

function requireDecisionMap(record: Record<string, unknown>): Record<string, BridgeDecision> {
  const value = record.decisions
  if (!isRecord(value)) throw new CompanionBridgeMessageError('bridge-decisions-invalid', 'decisions must be an object')
  const decisions: Record<string, BridgeDecision> = {}
  for (const [entityId, decision] of Object.entries(value)) {
    if (entityId.trim() === '') throw new CompanionBridgeMessageError('bridge-decisions-invalid', 'decision entity IDs must be non-empty')
    decisions[entityId] = parseDecision(decision)
  }
  return decisions
}

function requireWorkspacePayload(record: Record<string, unknown>): BridgeWorkspacePayload {
  const value = record.workspace
  if (!isRecord(value)) throw new CompanionBridgeMessageError('bridge-workspace-invalid', 'workspace must be an object')
  const rawFiles = value.files
  if (!isRecord(rawFiles)) throw new CompanionBridgeMessageError('bridge-workspace-files-invalid', 'workspace.files must be an object')
  const files: Record<string, string> = {}
  for (const [path, content] of Object.entries(rawFiles)) {
    if (path.trim() === '' || typeof content !== 'string') {
      throw new CompanionBridgeMessageError('bridge-workspace-files-invalid', 'workspace files must map non-empty paths to strings')
    }
    files[path] = content
  }
  const rawAssets = value.assets
  if (!Array.isArray(rawAssets)) throw new CompanionBridgeMessageError('bridge-workspace-assets-invalid', 'workspace.assets must be an array')
  const assets: BridgeAssetPayload[] = []
  const seenPaths = new Set<string>()
  for (const rawAsset of rawAssets) {
    if (!isRecord(rawAsset)) throw new CompanionBridgeMessageError('bridge-workspace-assets-invalid', 'workspace assets must be objects')
    const path = requireString(rawAsset, 'path', 'bridge-workspace-assets-invalid')
    const mimeType = requireString(rawAsset, 'mime_type', 'bridge-workspace-assets-invalid')
    const data = rawAsset.data_base64
    if (typeof data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      throw new CompanionBridgeMessageError('bridge-workspace-assets-invalid', 'asset data_base64 must be valid base64')
    }
    if (seenPaths.has(path)) throw new CompanionBridgeMessageError('bridge-workspace-assets-invalid', 'workspace asset paths must be unique')
    seenPaths.add(path)
    assets.push({ path, mime_type: mimeType, data_base64: data })
  }
  return { files, assets }
}

export function parseCompanionMessage(input: unknown): CompanionMessage {
  if (!isRecord(input)) throw new CompanionBridgeMessageError('bridge-message-invalid', 'message must be an object')
  if (input.bridge_version !== COMPANION_BRIDGE_VERSION) {
    throw new CompanionBridgeMessageError('bridge-version-unsupported', 'unsupported companion bridge version')
  }
  const messageId = requireString(input, 'message_id')
  const kind = requireString(input, 'kind')
  const base = { bridge_version: COMPANION_BRIDGE_VERSION, message_id: messageId }

  switch (kind) {
    case 'hello': {
      const client = input.client
      if (client !== 'calmy-web' && client !== 'obsidian-plugin') {
        throw new CompanionBridgeMessageError('bridge-client-invalid', 'client must be calmy-web or obsidian-plugin')
      }
      return { ...base, kind, client, capabilities: requireStringArray(input, 'capabilities') }
    }
    case 'workspace_export_request':
      return { ...base, kind, request_id: requireString(input, 'request_id') }
    case 'workspace_export_offer':
      return {
        ...base,
        kind,
        request_id: requireString(input, 'request_id'),
        manifest_hash: requireString(input, 'manifest_hash'),
        entity_count: requireNonNegativeInteger(input, 'entity_count'),
        asset_count: requireNonNegativeInteger(input, 'asset_count')
      }
    case 'workspace_export':
      return {
        ...base,
        kind,
        request_id: requireString(input, 'request_id'),
        manifest_hash: requireString(input, 'manifest_hash'),
        workspace: requireWorkspacePayload(input)
      }
    case 'workspace_import_preview':
      return {
        ...base,
        kind,
        request_id: requireString(input, 'request_id'),
        added_ids: requireStringArray(input, 'added_ids'),
        unchanged_ids: requireStringArray(input, 'unchanged_ids'),
        conflict_ids: requireStringArray(input, 'conflict_ids'),
        asset_conflict_paths: requireStringArray(input, 'asset_conflict_paths'),
        missing_asset_paths: requireStringArray(input, 'missing_asset_paths'),
        orphan_asset_paths: requireStringArray(input, 'orphan_asset_paths'),
        issues: requireIssueArray(input, 'issues'),
        conflict_previews: optionalConflictPreviews(input),
        tombstone_ids: optionalStringArray(input, 'tombstone_ids')
      }
    case 'workspace_import_apply':
      return {
        ...base,
        kind,
        request_id: requireString(input, 'request_id'),
        workspace: requireWorkspacePayload(input),
        decisions: requireDecisionMap(input)
      }
    case 'ack':
      return { ...base, kind, request_id: requireString(input, 'request_id'), message: requireString(input, 'message') }
    case 'error':
      return {
        ...base,
        kind,
        request_id: input.request_id === undefined ? undefined : requireString(input, 'request_id'),
        code: requireString(input, 'code'),
        message: requireString(input, 'message')
      }
    default:
      throw new CompanionBridgeMessageError('bridge-kind-unsupported', 'unsupported companion bridge message kind')
  }
}

export function isCompanionMessage(input: unknown): input is CompanionMessage {
  try {
    parseCompanionMessage(input)
    return true
  } catch {
    return false
  }
}
