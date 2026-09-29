import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('docs/superpowers/migrations/captures/2026-09-26')
const rows = []
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file)
    else if (item.name.startsWith('manifest-') && item.name.endsWith('.json')) {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      const react = new Set(manifest.viewports.filter(view => view.framework === 'react').map(view => `${view.width}x${view.height}`))
      const vue = new Set(manifest.viewports.filter(view => view.framework === 'vue').map(view => `${view.width}x${view.height}`))
      const paired = [...react].filter(size => vue.has(size))
      rows.push({ name: path.basename(path.dirname(file)), file, paired })
    }
  }
}
walk(root)
console.log(JSON.stringify({
  manifests: rows.length,
  pairViewports: rows.reduce((sum, row) => sum + row.paired.length, 0),
  dirs: rows.map(row => ({ name: row.name, n: row.paired.length })),
}, null, 2))
