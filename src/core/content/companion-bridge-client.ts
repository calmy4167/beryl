import { exportCurrentOpenWorkspace } from './open-workspace'
import type {
  BridgeDecision,
  BridgeErrorMessage,
  BridgeWorkspaceExportMessage,
  BridgeWorkspaceImportPreviewMessage,
  BridgeWorkspacePayload,
  CompanionMessage
} from './companion-bridge'
import { createBridgeHello, createWorkspaceExportRequest, createWorkspaceImportApply } from './companion-bridge'
import { buildWorkspaceImportPreview } from './companion-bridge-runtime'
import type { OpenWorkspace } from './open-format'

export interface CompanionBridgeTransport {
  send(message: CompanionMessage): void | Promise<void>
  subscribe(listener: (message: CompanionMessage) => void): () => void
}

export interface WebBridgeWorkspacePreview {
  requestId: string
  exported: BridgeWorkspaceExportMessage
  preview: BridgeWorkspaceImportPreviewMessage
}

export class CompanionBridgeRemoteError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CompanionBridgeRemoteError'
  }
}

interface PendingRequest {
  resolve: (message: CompanionMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class CalmyWebBridgeClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly unsubscribe: () => void

  constructor(
    private readonly transport: CompanionBridgeTransport,
    private readonly localWorkspaceProvider: () => OpenWorkspace | Promise<OpenWorkspace> = exportCurrentOpenWorkspace,
    private readonly timeoutMs = 30000
  ) {
    this.unsubscribe = transport.subscribe(message => this.receive(message))
  }

  dispose(): void {
    this.unsubscribe()
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('bridge-client-disposed'))
      this.pending.delete(requestId)
    }
  }

  announce(capabilities: string[] = ['workspace-export', 'workspace-import-preview', 'workspace-import-apply']): Promise<void> {
    return Promise.resolve(this.transport.send(createBridgeHello('calmy-web', capabilities)))
  }

  async requestVaultWorkspace(requestId?: string): Promise<WebBridgeWorkspacePreview> {
    const request = createWorkspaceExportRequest(requestId)
    const response = await this.sendAndWait(request)
    if (response.kind !== 'workspace_export') throw new Error('bridge-export-response-invalid:' + response.kind)
    const localWorkspace = await this.localWorkspaceProvider()
    return {
      requestId: request.request_id,
      exported: response,
      preview: buildWorkspaceImportPreview(request.request_id, localWorkspace, response.workspace)
    }
  }

  async applyWorkspaceToVault(
    workspace: BridgeWorkspacePayload,
    decisions: Record<string, BridgeDecision>,
    requestId?: string
  ): Promise<CompanionMessage> {
    const request = createWorkspaceImportApply(workspace, decisions, requestId)
    const response = await this.sendAndWait(request)
    if (response.kind === 'error') throw new CompanionBridgeRemoteError(response.code, response.message)
    if (response.kind !== 'ack') throw new Error('bridge-apply-response-invalid:' + response.kind)
    return response
  }

  private receive(message: CompanionMessage): void {
    if (!('request_id' in message) || !message.request_id) return
    const pending = this.pending.get(message.request_id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.request_id)
    if (message.kind === 'error') pending.reject(new CompanionBridgeRemoteError(message.code, message.message))
    else pending.resolve(message)
  }

  private async sendAndWait(message: CompanionMessage): Promise<CompanionMessage> {
    const requestId = 'request_id' in message && typeof message.request_id === 'string' ? message.request_id : message.message_id
    const response = new Promise<CompanionMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('bridge-request-timeout:' + requestId))
      }, this.timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer })
    })
    try {
      await this.transport.send(message)
    } catch (error) {
      const pending = this.pending.get(requestId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(requestId)
        pending.reject(error instanceof Error ? error : new Error('bridge-send-failed'))
      }
    }
    return response
  }
}

export function isBridgeError(message: CompanionMessage): message is BridgeErrorMessage {
  return message.kind === 'error'
}
