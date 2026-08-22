const output = document.querySelector('#result')

function seedSyntheticSession() {
  const sidebarState = localStorage.getItem('calmy_sidebar_collapsed')
  localStorage.clear()
  sessionStorage.clear()

  const auth = {
    u: 'ui-smoke',
    salt: '00'.repeat(16),
    hash: '00'.repeat(32),
    iter: 1
  }

  localStorage.setItem('b_auth', JSON.stringify(auth))
  localStorage.setItem('b_session', JSON.stringify({ u: auth.u, ts: Date.now() }))
  localStorage.setItem('b_scene', JSON.stringify('personal'))
  if (sidebarState !== null) localStorage.setItem('calmy_sidebar_collapsed', sidebarState)
}

try {
  seedSyntheticSession()
  // Hash history is the app's production router contract; keep the smoke page
  // on the same origin so Vite serves the real application modules.
  location.replace('/#/app/today')
} catch (error) {
  output.textContent = JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.stack || error.message : String(error)
  })
}
