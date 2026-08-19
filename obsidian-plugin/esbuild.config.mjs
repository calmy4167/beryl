import esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const production = process.argv[2] === 'production'
const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

await esbuild.build({
  entryPoints: [path.join(pluginRoot, 'src/main.ts')],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2018',
  outfile: path.join(pluginRoot, 'main.js'),
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  logLevel: 'info'
})
