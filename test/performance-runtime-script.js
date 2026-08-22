const output = document.querySelector('#result')

function seedSyntheticSession() {
  localStorage.clear()
  sessionStorage.clear()

  const auth = {
    u: 'performance-baseline',
    salt: '11'.repeat(16),
    hash: '11'.repeat(32),
    iter: 1
  }
  const task = {
    id: 'performance-baseline-task',
    title: 'Performance baseline synthetic task',
    priority: '高',
    date: new Date().toISOString(),
    done: false
  }

  localStorage.setItem('b_auth', JSON.stringify(auth))
  localStorage.setItem('b_session', JSON.stringify({ u: auth.u, ts: Date.now() }))
  localStorage.setItem('b_scene', JSON.stringify('personal'))
  localStorage.setItem('b_tasks', JSON.stringify([task]))
}

try {
  seedSyntheticSession()
  window.__performanceFixtureReady = {
    ok: true,
    seededAt: performance.now(),
    origin: location.origin
  }
  if (output) output.textContent = 'performance-fixture-ready'
} catch (error) {
  const report = {
    ok: false,
    error: error instanceof Error ? error.stack || error.message : String(error)
  }
  window.__performanceFixtureReady = report
  if (output) output.textContent = JSON.stringify(report)
}
