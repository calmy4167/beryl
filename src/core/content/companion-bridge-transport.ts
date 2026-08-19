import type { CompanionBridgeTransport } from './companion-bridge-client'
import type { CompanionMessage } from './companion-bridge'
import { CompanionBridgeMessageError, parseCompanionMessage } from './companion-bridge'
import type { CompanionBridgeSession } from './companion-bridge-runtime'

export interface BridgeMessagePort {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  start?(): void
  close?(): void
}

export interface MessagePortTransport extends CompanionBridgeTransport {
  close(): void
}

export interface MessagePortTransportOptions {
  onInvalidMessage?: (error: CompanionBridgeMessageError) => void
}

export function createMessagePortTransport(
  port: BridgeMessagePort,
  options: MessagePortTransportOptions = {}
): MessagePortTransport {
  const listeners = new Set<(message: CompanionMessage) => void>()
  let closed = false
  const receive = (event: { data: unknown }) => {
    if (closed) return
    try {
      const message = parseCompanionMessage(event.data)
      listeners.forEach(listener => listener(message))
    } catch (error) {
      if (error instanceof CompanionBridgeMessageError) options.onInvalidMessage?.(error)
    }
  }
  port.addEventListener('message', receive)
  port.start?.()
  return {
    send(message: CompanionMessage): void {
      if (closed) throw new Error('bridge-transport-closed')
      port.postMessage(message)
    },
    subscribe(listener: (message: CompanionMessage) => void): () => void {
      if (closed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close(): void {
      if (closed) return
      closed = true
      port.removeEventListener('message', receive)
      listeners.clear()
      port.close?.()
    }
  }
}

export function attachCompanionBridgeSession(
  port: BridgeMessagePort,
  session: CompanionBridgeSession,
  options: MessagePortTransportOptions = {}
): () => void {
  const transport = createMessagePortTransport(port, options)
  const unsubscribe = transport.subscribe(message => {
    void session.handle(message).then(response => {
      try {
        transport.send(response)
      } catch {
        // The host may close the port while a response is being prepared.
      }
    })
  })
  return () => {
    unsubscribe()
    transport.close()
  }
}
