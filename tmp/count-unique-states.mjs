import fs from 'node:fs'
import path from 'node:path'

const roots = [path.resolve('captures'), path.resolve('docs/superpowers/migrations/captures/2026-09-26')]
const records = []
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file)
    else if (item.name.startsWith('manifest-') && item.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      const stepKey = JSON.stringify(data.interaction?.steps || [])
      const visibleKey = JSON.stringify((data.viewports || []).flatMap(v => v.visibleText || []).map(x => x.text))
      const stateKey = `${data.route}|${stepKey}|${visibleKey}`
      const viewports = new Set((data.viewports || []).filter(v => v.framework === 'react').map(v => `${v.width}x${v.height}`))
      records.push({ file, stateKey, count: viewports.size, capturedAt: data.capturedAt || '' })
    }
  }
}
for (const root of roots) walk(root)
const byState = new Map()
for (const record of records) {
  if (!byState.has(record.stateKey)) byState.set(record.stateKey, [])
  byState.get(record.stateKey).push(record)
}
console.log(JSON.stringify({
  manifests: records.length,
  uniqueStateKeys: byState.size,
  sumViewportPairsByLatestState: [...byState.values()].reduce((sum, rows) => sum + rows.sort((a,b) => b.capturedAt.localeCompare(a.capturedAt))[0].count, 0),
  duplicateStateGroups: [...byState.values()].filter(rows => rows.length > 1).map(rows => rows.map(row => ({ path: row.file, capturedAt: row.capturedAt, viewports: row.count }))),
}, null, 2))
