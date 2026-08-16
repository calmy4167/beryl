import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const sw = await readFile(join(dist, 'sw.js'), 'utf8')
const match = sw.match(/const PRECACHE_URLS = (\[[^\n]+\])/)
if (!match) throw new Error('precache-list-missing')
const urls = JSON.parse(match[1])
for (const url of urls) {
  if (!url.startsWith('./') || url.includes('..')) throw new Error(`unsafe-precache-url:${url}`)
  await access(join(dist, url.slice(2)))
}
console.log(`PWA precache drill passed: ${urls.length} local files are present`)
