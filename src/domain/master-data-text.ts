export function insertTextAtRange(value: string, start: number, end: number, insertion: string): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length))
  const to = Math.max(from, Math.min(end, value.length))
  const nextValue = `${value.slice(0, from)}${insertion}${value.slice(to)}`
  return { value: nextValue, caret: from + insertion.length }
}
