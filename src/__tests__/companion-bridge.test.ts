import { describe, expect, it } from 'vitest'
import {
  COMPANION_BRIDGE_VERSION,
  CompanionBridgeMessageError,
  createBridgeHello,
  createWorkspaceExportRequest,
  createWorkspaceImportApply,
  isCompanionMessage,
  parseCompanionMessage
} from '@/core/content/companion-bridge'

describe('Companion bridge protocol', () => {
  it('creates versioned hello and export request messages with IDs', () => {
    const hello = createBridgeHello('calmy-web', ['workspace-preview', 'conflict-decisions'])
    const request = createWorkspaceExportRequest('request-1')

    expect(hello.bridge_version).toBe(COMPANION_BRIDGE_VERSION)
    expect(hello.message_id).toBeTruthy()
    expect(hello.client).toBe('calmy-web')
    expect(hello.capabilities).toEqual(['workspace-preview', 'conflict-decisions'])
    expect(parseCompanionMessage(hello)).toEqual(hello)
    expect(request.request_id).toBe('request-1')
    expect(isCompanionMessage(request)).toBe(true)
  })

  it('accepts explicit keep-local, use-incoming and field merge decisions', () => {
    const workspace = { files: { '_calmy/manifest.json': '{}' }, assets: [] }
    const message = createWorkspaceImportApply(workspace, {
      'matter-1': 'keep-local',
      'record-1': 'use-incoming',
      'action-1': { mode: 'merge', fields: { title: 'use-incoming', status: 'keep-local' } }
    }, 'request-merge')

    expect(parseCompanionMessage(message)).toEqual(message)
  })

  it('rejects unsupported versions, kinds and malformed decisions', () => {
    expect(() => parseCompanionMessage({
      bridge_version: 2,
      message_id: 'message-1',
      kind: 'hello',
      client: 'calmy-web',
      capabilities: []
    })).toThrowError(new CompanionBridgeMessageError('bridge-version-unsupported', 'unsupported companion bridge version'))

    expect(() => parseCompanionMessage({
      bridge_version: 1,
      message_id: 'message-2',
      kind: 'not-supported'
    })).toThrow(/unsupported companion bridge message kind/)

    expect(() => parseCompanionMessage({
      bridge_version: 1,
      message_id: 'message-3',
      kind: 'workspace_import_apply',
      request_id: 'request-3',
      workspace: { files: { '_calmy/manifest.json': '{}' }, assets: [] },
      decisions: { 'matter-1': { mode: 'merge', fields: { title: 'skip' } } }
    })).toThrow(/valid field decisions/)
    expect(isCompanionMessage({ bridge_version: 1, message_id: '', kind: 'hello', client: 'calmy-web', capabilities: [] })).toBe(false)
  })

  it('rejects malformed preview counts and asset arrays', () => {
    expect(() => parseCompanionMessage({
      bridge_version: 1,
      message_id: 'message-4',
      kind: 'workspace_export_offer',
      request_id: 'request-4',
      manifest_hash: 'hash',
      entity_count: -1,
      asset_count: 0
    })).toThrow(/non-negative integer/)

    expect(() => parseCompanionMessage({
      bridge_version: 1,
      message_id: 'message-5',
      kind: 'workspace_import_preview',
      request_id: 'request-5',
      added_ids: ['matter-1', ''],
      unchanged_ids: [],
      conflict_ids: [],
      asset_conflict_paths: [],
      missing_asset_paths: [],
      orphan_asset_paths: [],
      issues: []
    })).toThrow(/array of non-empty strings/)
  })
})
