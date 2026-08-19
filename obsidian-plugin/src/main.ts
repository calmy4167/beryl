import { Notice, Plugin, TFile } from 'obsidian'
import { readVaultSnapshot } from '../../src/core/content/obsidian-adapter'
import { CompanionBridgeSession } from '../../src/core/content/companion-bridge-runtime'
import { attachCompanionBridgeSession, type BridgeMessagePort } from '../../src/core/content/companion-bridge-transport'
import { ObsidianVaultAdapter } from './vault-adapter'

export default class CalmyOpenPlugin extends Plugin {
  private adapter!: ObsidianVaultAdapter
  private bridgeSession!: CompanionBridgeSession
  private detachCompanionPort?: () => void
  private validationTimer: number | undefined

  async onload(): Promise<void> {
    this.adapter = new ObsidianVaultAdapter(this.app.vault)
    this.bridgeSession = new CompanionBridgeSession(this.adapter, 'obsidian-plugin')
    this.addCommand({
      id: 'validate-open-workspace',
      name: 'Validate Calmy Open Workspace',
      callback: () => { void this.validateVault() }
    })
    this.addRibbonIcon('shield-check', 'Validate Calmy Open Workspace', () => { void this.validateVault() })
    this.registerEvent(this.app.vault.on('modify', file => this.scheduleValidation(file)))
    this.registerEvent(this.app.vault.on('create', file => this.scheduleValidation(file)))
    this.registerEvent(this.app.vault.on('rename', file => this.scheduleValidation(file)))
  }

  /** Transport adapters can call this method after explicit user authorization. */
  async handleCompanionMessage(input: unknown) {
    return this.bridgeSession.handle(input)
  }

  onunload(): void {
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer)
    this.detachCompanionPort?.()
    this.detachCompanionPort = undefined
  }

  /** Attach only a host-authorized MessagePort; this plugin never creates one. */
  attachCompanionPort(port: BridgeMessagePort): () => void {
    if (!this.bridgeSession) throw new Error('calmy-open-plugin-not-loaded')
    this.detachCompanionPort?.()
    const detach = attachCompanionBridgeSession(port, this.bridgeSession)
    this.detachCompanionPort = () => {
      detach()
      this.detachCompanionPort = undefined
    }
    return this.detachCompanionPort
  }

  private scheduleValidation(file: TFile): void {
    if (!file.path.endsWith('.md') && !file.path.endsWith('manifest.json')) return
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer)
    this.validationTimer = window.setTimeout(() => {
      this.validationTimer = undefined
      void this.validateVault(true)
    }, 400)
  }

  private async validateVault(silent = false): Promise<void> {
    const snapshot = await readVaultSnapshot(this.adapter)
    if (snapshot.issues.length) {
      if (!silent) new Notice('Calmy Vault 有 ' + snapshot.issues.length + ' 个问题，请查看导入预览。')
      return
    }
    if (!silent) new Notice('Calmy Vault 校验通过：' + snapshot.entities.length + ' 个实体，' + snapshot.assets.length + ' 个附件。')
  }
}
