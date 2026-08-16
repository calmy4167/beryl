/** 轻量、默认安全的 Markdown 渲染器：先转义用户 HTML，再处理常用 Markdown。 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function inline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

/** 支持标题、引用、无序列表、分隔线与常用行内标记；不执行任何用户 HTML。 */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source || '').split(/\r?\n/)
  const output: string[] = []
  let inList = false
  const closeList = () => { if (inList) { output.push('</ul>'); inList = false } }
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { output.push('<ul>'); inList = true }
      output.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
      continue
    }
    closeList()
    if (/^#{1,3}\s+/.test(line)) {
      const level = Math.min(3, (line.match(/^#+/)?.[0].length || 1))
      output.push(`<h${level}>${inline(line.replace(/^#+\s+/, ''))}</h${level}>`)
    } else if (/^>\s?/.test(line)) output.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`)
    else if (/^---+$/.test(line.trim())) output.push('<hr>')
    else if (line.trim()) output.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  return output.join('')
}
