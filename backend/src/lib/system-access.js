import { requireSession } from './session.js';
import { SYSTEM_CAPABILITIES } from './system-permissions.js';

export async function requireSystemCapability(request, env, capability) {
  const actor = await requireSession(request, env);
  if (actor.error) return actor;
  if (actor.mustChangePassword) return { error: 'password-change-required', status: 403 };
  if (!SYSTEM_CAPABILITIES.includes(capability)) return { error: 'forbidden', status: 403 };

  const permission = await env.BERYL_D1.prepare(
    'SELECT 1 AS allowed FROM user_roles ur ' +
    'JOIN roles r ON r.role_id = ur.role_id AND r.status = ? ' +
    'JOIN role_permissions rp ON rp.role_id = r.role_id AND rp.permission_code = ? ' +
    'WHERE ur.user_id = ? LIMIT 1'
  ).bind('active', capability, actor.userId).first();
  return permission ? actor : { error: 'forbidden', status: 403 };
}

export async function systemCapabilitiesForUser(env, userId) {
  const { results = [] } = await env.BERYL_D1.prepare(
    'SELECT DISTINCT rp.permission_code FROM user_roles ur ' +
    'JOIN roles r ON r.role_id = ur.role_id AND r.status = ? ' +
    'JOIN role_permissions rp ON rp.role_id = r.role_id ' +
    'WHERE ur.user_id = ? ORDER BY rp.permission_code'
  ).bind('active', userId).all();
  return results.map(row => row.permission_code).filter(code => SYSTEM_CAPABILITIES.includes(code));
}
