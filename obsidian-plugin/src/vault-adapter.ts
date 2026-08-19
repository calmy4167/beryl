import { TFile, Vault, normalizePath } from 'obsidian'
import type { VaultAdapter } from '../../src/core/content/obsidian-adapter'

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private readonly vault: Vault) {}

  async listPaths(): Promise<string[]> {
    return this.vault.getFiles().map(file => file.path)
  }

  private file(path: string): TFile {
    const file = this.vault.getAbstractFileByPath(normalizePath(path))
    if (!(file instanceof TFile)) throw new Error('vault-file-not-found:' + path)
    return file
  }

  async readText(path: string): Promise<string> {
    return this.vault.read(this.file(path))
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await this.vault.readBinary(this.file(path)))
  }

  private async ensureParent(path: string): Promise<void> {
    const segments = normalizePath(path).split('/')
    segments.pop()
    let current = ''
    for (const segment of segments) {
      current = current ? current + '/' + segment : segment
      if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current)
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(normalizePath(path))
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content)
      return
    }
    await this.ensureParent(path)
    await this.vault.create(normalizePath(path), content)
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(normalizePath(path))
    if (existing instanceof TFile) {
      await this.vault.modifyBinary(existing, content.buffer as ArrayBuffer)
      return
    }
    await this.ensureParent(path)
    await this.vault.createBinary(normalizePath(path), content.buffer as ArrayBuffer)
  }

  async deletePath(path: string): Promise<void> {
    const file = this.file(path)
    await this.vault.delete(file)
  }
}
