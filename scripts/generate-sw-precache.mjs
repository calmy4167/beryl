import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, relative, posix } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const assets = join(dist, 'assets')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(absolute))
    else files.push(absolute)
  }
  return files
}

const assetUrls = (await filesUnder(assets))
  .map(file => `./${posix.join(...relative(dist, file).split('\\'))}`)
  .sort()
const urls = ['./', './index.html', './manifest.webmanifest', './icon.svg', ...assetUrls]
const swPath = join(dist, 'sw.js')
const source = await readFile(swPath, 'utf8')
const marker = /const PRECACHE_URLS = \[[^\n]*\]/
if (!marker.test(source)) throw new Error('Service worker precache marker not found')
const output = source.replace(marker, `const PRECACHE_URLS = ${JSON.stringify(urls)}`)
await writeFile(swPath, output)
console.log(`Generated ${urls.length} precache URLs in ${relative(root, swPath)}`)
