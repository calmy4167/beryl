import { captureAsyncRepository, type CaptureItem } from '@/domain/capture'

export interface SaveFutureReflectionInput {
  choice: string
  facts?: string
  interpretation?: string
  reflection: string
  nextStep?: string
  externalUrl?: string
}

export interface SaveFutureFeedbackInput {
  reflectionCaptureId: string
  feedback: string
}

function normalizeExternalUrl(value?: string): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('链接格式不正确，请填写包含 http:// 或 https:// 的完整链接。')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('链接仅支持 http:// 或 https:// 地址。')
  }
  return url.toString()
}

/**
 * 保存用户在未来回望影响推演中写下的选择和反思。
 * 这里只创建原始 Capture，不生成整理建议，也不保存推演内容。
 */
export async function saveFutureReflection(input: SaveFutureReflectionInput): Promise<CaptureItem> {
  const choice = input.choice.trim()
  if (!choice) throw new Error('先写下你想回头看的选择，再保存。')

  const reflection = input.reflection.trim()
  if (!reflection) throw new Error('先写下看过这些可能后的想法，再保存。')

  const facts = input.facts?.trim()
  const interpretation = input.interpretation?.trim()
  const nextStep = input.nextStep?.trim()
  const externalUrl = normalizeExternalUrl(input.externalUrl)
  const body = [
    '未来回望（影响推演体验）',
    `我考虑的选择：${choice}`,
    ...(facts ? [`已经发生的事：${facts}`] : []),
    ...(interpretation ? [`我的理解或担心：${interpretation}`] : []),
    `我的反思：${reflection}`,
    ...(nextStep ? [`我准备的下一步：${nextStep}`] : []),
    ...(externalUrl ? [`我准备查看的链接：${externalUrl}`] : []),
  ].join('\n')

  return captureAsyncRepository.create(body)
}

/** 将用户主动带回的现实反馈另存为 Capture，并保留到原选择记录的可读引用。 */
export async function saveFutureFeedback(input: SaveFutureFeedbackInput): Promise<CaptureItem> {
  const reflectionCaptureId = input.reflectionCaptureId.trim()
  if (!reflectionCaptureId) throw new Error('找不到对应的选择记录，不能保存反馈。请先重新保存选择和反思，再保存反馈。')
  if (!await captureAsyncRepository.find(reflectionCaptureId)) throw new Error('原选择记录已不存在，不能保存这条关联反馈。请先重新保存选择和反思，再保存反馈。')

  const feedback = input.feedback.trim()
  if (!feedback) throw new Error('先写下后来现实中发生了什么。')

  return captureAsyncRepository.create([
    '未来回望（现实反馈）',
    `参考的选择记录 ID：${reflectionCaptureId}`,
    `后来发生了什么：${feedback}`,
  ].join('\n'))
}
