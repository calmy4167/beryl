import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = 'D:/dsharness';
const source = JSON.parse(await readFile(join(root, 'tmp/official-335-conditional-settle-status.json'), 'utf8'));
const items = source.results.filter(r => r.status === 'nonzero' && r.id !== '057');
const outBase = join(root, 'captures/2026-09-28/official-335-residual-reruns');
const statusPath = join(root, 'tmp/official-335-residual-reruns-status.json');
const python = 'C:/Users/30916/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const runner = join(root, 'tmp/recapture-one.mjs');
const results = [];
const run = (exe, args, opts = {}) => new Promise((resolveRun) => {
  const child = spawn(exe, args, { cwd: root, windowsHide: true, env: opts.env || process.env, stdio: ['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b.toString(); if (stdout.length > 12000) stdout = stdout.slice(-12000); });
  child.stderr.on('data', b => { stderr += b.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
  const timeout = setTimeout(() => child.kill(), opts.timeout || 210000);
  child.on('error', e => { clearTimeout(timeout); resolveRun({ code: -1, stdout, stderr: stderr + String(e) }); });
  child.on('close', code => { clearTimeout(timeout); resolveRun({ code, stdout, stderr }); });
});
const writeStatus = async () => writeFile(statusPath, JSON.stringify({ total: items.length, completed: results.length, sourceStatus: 'official-335-conditional-settle-status.json', results }, null, 2) + String.fromCharCode(10), 'utf8');
let cursor = 0;
async function worker() {
  while (cursor < items.length) {
    const item = items[cursor++];
    const dir = join(outBase, item.id + '-' + item.route.replaceAll('/','-') + '-' + item.viewport);
    await mkdir(dir, { recursive: true });
    const env = { ...process.env, CALMY_NEUTRAL_POINTER: '1', CALMY_POST_POINTER_SETTLE_MS: '400' };
    const replay = await run(process.execPath, [runner, item.manifest, 'both', item.viewport, dir], { env });
    let row = { id: item.id, route: item.route, viewport: item.viewport, manifest: item.manifest, outputDir: dir, replayExit: replay.code };
    if (replay.code === 0) {
      const cmp = await run(python, [join(root,'test/compare-ui-images.py'), join(dir,'recaptured-react.png'), join(dir,'recaptured-vue.png'), '--heatmap', join(dir,'difference-heatmap.png')]);
      const m = cmp.stdout.match(/Images differ: (\d+)\/(\d+) pixels/);
      row.compareExit = cmp.code; row.differentPixels = m ? Number(m[1]) : (cmp.code === 0 ? 0 : null);
      row.status = cmp.code === 0 ? 'exact' : cmp.code === 1 && m ? 'nonzero' : 'compare-error';
      row.compareOutput = cmp.stdout.trim(); row.compareError = cmp.stderr.trim() || undefined;
    } else {
      row.status = 'recapture-error'; row.error = (replay.stderr || replay.stdout).slice(-5000);
      await writeFile(join(root,'tmp','official-335-rerun-' + item.id + '.log'), replay.stdout + String.fromCharCode(10) + replay.stderr, 'utf8');
    }
    results.push(row); await writeStatus();
    console.log('rerun ' + results.length + '/' + items.length + ' id=' + row.id + ' status=' + row.status + ' diff=' + (row.differentPixels ?? '-'));
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
await writeStatus();
console.log('reruns complete', JSON.stringify(results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})));
