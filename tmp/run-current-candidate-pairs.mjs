import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const pairListPath = process.env.CALMY_PARITY_PAIR_LIST || 'tmp/current-candidate-pairs.json'
const pairs = JSON.parse(readFileSync(pairListPath, 'utf8'))
const start = Number(process.argv[2] || 0)
const limit = Number(process.argv[3] || pairs.length)
const concurrency = Number(process.env.CALMY_PARITY_WORKERS || 3)
const statusPath = resolve(process.env.CALMY_PARITY_STATUS_PATH || 'tmp/current-candidate-status.json')
const recaptureTimeoutMs = Number(process.env.CALMY_PARITY_RECAPTURE_TIMEOUT_MS || 90000)
const selected = pairs.slice(start, start + limit)
const results = []
let cursor = 0
const root = resolve(process.env.CALMY_PARITY_OUTPUT_DIR || 'captures/2026-09-27/rebuilt-current-candidate-pairs')
mkdirSync(root, { recursive: true })
const python = 'C:/Users/30916/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'

function runRecapture(pair, outputDir) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [
      resolve('tmp/recapture-one.mjs'), pair.manifest, 'both', pair.viewport, outputDir,
    ], { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      rejectRun(new Error(`recapture-timeout-${recaptureTimeoutMs}ms\n${output}`))
    }, recaptureTimeoutMs)
    child.stdout.on('data', chunk => { output = `${output}${chunk}`.slice(-12000) })
    child.stderr.on('data', chunk => { output = `${output}${chunk}`.slice(-12000) })
    child.once('error', error => { clearTimeout(timeout); rejectRun(error) })
    child.once('close', code => {
      clearTimeout(timeout)
      code === 0 ? resolveRun() : rejectRun(new Error(`recapture-exit-${code}\n${output}`))
    })
  })
}

async function worker() {
  while (true) {
    const index = cursor++
    if (index >= selected.length) return
    const pair = selected[index]
    const scale = pair.visualScale && pair.visualScale !== 1 ? `-scale${String(pair.visualScale).replace('.', '_')}` : ''
    const slug = `${pair.id}-${pair.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${pair.viewport}${scale}`
    const outputDir = join(root, slug)
    mkdirSync(outputDir, { recursive: true })
    const record = { id: pair.id, route: pair.route, viewport: pair.viewport, manifest: pair.manifest, status: 'running' }
    results.push(record)
    try {
      await runRecapture(pair, outputDir)
      const comparison = spawnSync(python, [
        'test/compare-ui-images.py',
        join(outputDir, 'recaptured-react.png'),
        join(outputDir, 'recaptured-vue.png'),
        '--heatmap', join(outputDir, 'difference-heatmap.png'),
      ], { cwd: resolve('.'), encoding: 'utf8' })
      const output = `${comparison.stdout || ''}${comparison.stderr || ''}`.trim()
      const count = Number(output.match(/Images differ: (\d+)\//)?.[1] || 0)
      record.status = comparison.status === 0 ? 'exact' : comparison.status === 1 ? 'nonzero' : 'compare-error'
      record.differentPixels = count
      record.outputDir = outputDir
      if (comparison.status > 1) record.error = output
    } catch (error) {
      record.status = 'recapture-error'
      record.error = error instanceof Error ? error.message : String(error)
      record.outputDir = outputDir
    }
    writeFileSync(statusPath, JSON.stringify({ start, limit, concurrency, recaptureTimeoutMs, results }, null, 2))
    const complete = results.length
    const counts = results.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {})
    console.log(`candidate ${pair.id}/${pairs.length} ${pair.route} ${pair.viewport}: ${record.status}${record.differentPixels == null ? '' : ` ${record.differentPixels}px`}; batch ${complete}/${selected.length}; ${JSON.stringify(counts)}`)
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()))
const summary = results.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {})
writeFileSync(statusPath, JSON.stringify({ start, limit, concurrency, recaptureTimeoutMs, summary, results }, null, 2))
console.log(`batch complete: ${JSON.stringify(summary)}; status=${statusPath}`)
