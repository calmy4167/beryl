declare module 'obsidian' {
  export class TAbstractFile {
    path: string
  }

  export class TFile extends TAbstractFile {
    extension: string
  }

  export interface EventRef {}

  export class Vault {
    getFiles(): TFile[]
    getAbstractFileByPath(path: string): TAbstractFile | null
    read(file: TFile): Promise<string>
    readBinary(file: TFile): Promise<ArrayBuffer>
    modify(file: TFile, content: string): Promise<void>
    modifyBinary(file: TFile, content: ArrayBuffer): Promise<void>
    create(path: string, content: string): Promise<TFile>
    createBinary(path: string, content: ArrayBuffer): Promise<TFile>
    createFolder(path: string): Promise<TAbstractFile>
    on(event: 'modify' | 'create' | 'rename', callback: (file: TFile) => void): EventRef
  }

  export class Plugin {
    app: { vault: Vault }
    addCommand(options: { id: string; name: string; callback: () => void }): void
    addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement
    registerEvent(event: EventRef): void
  }

  export class Notice {
    constructor(message: string)
  }

  export function normalizePath(path: string): string
}
