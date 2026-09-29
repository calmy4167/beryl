import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const require = createRequire('D:/Scoop/apps/nodejs-lts/current/node_modules/npm/package.json')
const cacache = require('cacache')
const cachePath = 'D:/Scoop/persist/nodejs-lts/cache/_cacache'
const packages = [
  ['react', '19.2.8'],
  ['react-dom', '19.2.8'],
  ['react-router-dom', '7.8.2'],
  ['react-router', '7.8.2'],
  ['scheduler', '0.27.0'],
  ['@types/react', '19.2.17', '@types/react/-/react-19.2.17.tgz'],
  ['@types/react-dom', '19.2.3', '@types/react-dom/-/react-dom-19.2.3.tgz'],
  ['csstype', '3.2.3']
]
for (const [name, version, customPath] of packages) {
  const path = customPath || `${name}/-/${name}-${version}.tgz`
  const key = `make-fetch-happen:request-cache:https://registry.npmjs.org/${path}`
  const { data } = await cacache.get(cachePath, key)
  const target = join('node_modules', ...name.split('/'))
  const temp = join('tmp', `${name.replaceAll('/', '-')}-${version}.tgz`)
  mkdirSync(target, { recursive: true })
  writeFileSync(temp, data)
  const result = spawnSync('tar', ['-xzf', temp, '-C', target, '--strip-components=1'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`tar extraction failed for ${name}: ${result.stderr}`)
  console.log(`${name}@${version} unpacked locally`)
}
