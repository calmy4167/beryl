const SETTINGS = Object.freeze({
  'security.password.minLength': { type: 'number', default: 6, min: 6, max: 256 },
  'security.password.maxLength': { type: 'number', default: 256, min: 6, max: 256 },
  'security.password.requireUppercase': { type: 'boolean', default: false },
  'security.password.requireLowercase': { type: 'boolean', default: false },
  'security.password.requireNumber': { type: 'boolean', default: false },
  'security.password.requireSymbol': { type: 'boolean', default: false },
  'security.password.expiryDays': { type: 'number', default: 0, min: 0, max: 3650 },
  'security.login.maxFailures': { type: 'number', default: 5, min: 1, max: 100 },
  'security.login.windowSeconds': { type: 'number', default: 30, min: 10, max: 3600 },
  'security.login.lockSeconds': { type: 'number', default: 30, min: 10, max: 86400 },
  'security.login.captchaEnabled': { type: 'boolean', default: false },
  'security.login.captchaType': { type: 'string', default: 'arithmetic', values: ['arithmetic', 'text'] },
  'security.audit.retentionDays': { type: 'number', default: 180, min: 30, max: 3650 }
});

function parseValue(key, raw) {
  const definition = SETTINGS[key];
  if (!definition) return undefined;
  if (definition.type === 'boolean') return raw === true || raw === 'true';
  if (definition.type === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(definition.max, Math.max(definition.min, Math.floor(parsed))) : definition.default;
  }
  return definition.values.includes(String(raw)) ? String(raw) : definition.default;
}

export async function getSecuritySettings(env) {
  const { results = [] } = await env.BERYL_D1.prepare('SELECT setting_key, setting_value FROM system_settings').all();
  const stored = new Map(results.map(row => [row.setting_key, row.setting_value]));
  const values = {};
  for (const [key, definition] of Object.entries(SETTINGS)) values[key] = parseValue(key, stored.get(key) ?? definition.default);
  if (values['security.password.minLength'] > values['security.password.maxLength']) {
    values['security.password.minLength'] = values['security.password.maxLength'];
  }
  return values;
}

export function publicPasswordPolicy(settings) {
  return {
    minLength: settings['security.password.minLength'],
    maxLength: settings['security.password.maxLength'],
    requireUppercase: settings['security.password.requireUppercase'],
    requireLowercase: settings['security.password.requireLowercase'],
    requireNumber: settings['security.password.requireNumber'],
    requireSymbol: settings['security.password.requireSymbol'],
    expiryDays: settings['security.password.expiryDays'],
    captchaEnabled: settings['security.login.captchaEnabled'],
    captchaType: settings['security.login.captchaType']
  };
}

export async function updateSecuritySettings(env, actorUserId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'invalid-settings' };
  const allowed = new Set(Object.keys(SETTINGS));
  const entries = Object.entries(patch);
  if (!entries.length || entries.some(([key]) => !allowed.has(key))) return { error: 'invalid-settings' };

  const current = await getSecuritySettings(env);
  const next = { ...current };
  for (const [key, raw] of entries) {
    const definition = SETTINGS[key];
    if (definition.type === 'boolean') {
      if (typeof raw !== 'boolean') return { error: 'invalid-settings' };
      next[key] = raw;
    } else if (definition.type === 'number') {
      if (!Number.isInteger(raw) || raw < definition.min || raw > definition.max) return { error: 'invalid-settings' };
      next[key] = raw;
    } else {
      if (!definition.values.includes(raw)) return { error: 'invalid-settings' };
      next[key] = raw;
    }
  }
  if (next['security.password.minLength'] > next['security.password.maxLength']) return { error: 'invalid-settings' };

  const now = Date.now();
  for (const [key, value] of entries) {
    await env.BERYL_D1.prepare(
      'INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
    ).bind(key, String(value), now, actorUserId).run();
  }
  return { values: next };
}
