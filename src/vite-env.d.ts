/// <reference types="vite/client" />

/** 构建时间指纹（vite define 注入，如 2026-08-15T16:30） */
declare const __APP_BUILD__: string

interface ImportMetaEnv {
  /** 独立 Worker 的 API 根地址，例如 https://api.beryl.example.com */
  readonly VITE_API_BASE_URL?: string
}
