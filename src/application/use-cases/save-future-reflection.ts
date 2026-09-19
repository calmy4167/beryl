import { captureAsyncRepository, type CaptureItem } from '@/domain/capture'

export interface SaveFutureReflectionInput {
  choice: string
  reflection: string
  nextStep?: string
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

  const nextStep = input.nextStep?.trim()
  const body = [
    '未来回望（影响推演体验）',
    `我考虑的选择：${choice}`,
    `我的反思：${reflection}`,
    ...(nextStep ? [`我准备的下一步：${nextStep}`] : []),
  ].join('\n')

  return captureAsyncRepository.create(body)
}
