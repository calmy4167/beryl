/** 前端到独立 Worker 的统一 HTTP 边界：超时、路径拼接和错误语义只在这里处理。 */
export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}

export async function apiFetch(baseUrl: string, path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(endpoint(baseUrl, path), { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('请求超时')
    throw new ApiError('无法连接云端，请检查网络、地址或跨域配置')
  } finally {
    clearTimeout(timer)
  }
}
