import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleGetUserKey } from '../src/routes/vault.js'

test('Vault key API returns the D1 JSON envelope as an object for the authenticated account', async () => {
  const recoveryEnvelope = { v: 1, iv: 'base64url-iv', ciphertext: 'base64url-ciphertext' }
  const db = {
    prepare(sql) {
      const statement = {
        bind() { return statement },
        async run() { return { meta: { changes: 0 } } },
        async all() { return { results: [] } },
        async first() {
          if (sql.includes('FROM sessions s JOIN users u')) return {
            session_id: 'session-test', user_id: 'user-test', device_id: 'device-test',
            expires_at: Date.now() + 60_000, last_seen_at: Date.now(), username: 'test',
            display_name: 'Test', role: 'user', status: 'active', must_change_password: 0,
            password_updated_at: Date.now(), deleted_at: null
          }
          if (sql.includes('SELECT recovery_envelope')) return {
            recovery_envelope: JSON.stringify(recoveryEnvelope), version: '1', updated_at: '42'
          }
          return null
        }
      }
      return statement
    }
  }
  const request = new Request('https://calmy.test/api/vault/key', { headers: { Authorization: 'Bearer test-token' } })

  const result = await handleGetUserKey(request, { BERYL_D1: db })

  assert.equal(result.status, undefined)
  assert.deepEqual(result.body.recoveryEnvelope, recoveryEnvelope)
  assert.equal(result.body.version, 1)
})
