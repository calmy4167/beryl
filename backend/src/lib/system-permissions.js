export const SYSTEM_CAPABILITIES = Object.freeze([
  'system.users.read',
  'system.users.create',
  'system.users.update',
  'system.users.disable',
  'system.users.delete',
  'system.users.reset_password',
  'system.users.unlock',
  'system.users.assign_roles',
  'system.roles.read',
  'system.roles.manage',
  'system.security.read',
  'system.security.manage',
  'system.login_logs.read',
  'system.operation_logs.read',
  'system.sessions.read',
  'system.sessions.revoke'
]);

export const BUILTIN_ROLE_CODES = Object.freeze({
  superAdmin: 'system.super_admin',
  userAdmin: 'system.user_admin',
  securityAdmin: 'system.security_admin',
  auditReader: 'system.audit_reader',
  basicUser: 'system.basic_user'
});

export const BUILTIN_ROLES = Object.freeze([
  { code: BUILTIN_ROLE_CODES.superAdmin, name: '超级管理员', description: '所有系统管理权限；不可删除或停用', builtIn: true },
  { code: BUILTIN_ROLE_CODES.userAdmin, name: '用户管理员', description: '管理用户账号及其状态', builtIn: true },
  { code: BUILTIN_ROLE_CODES.securityAdmin, name: '安全管理员', description: '管理登录安全设置和会话', builtIn: true },
  { code: BUILTIN_ROLE_CODES.auditReader, name: '审计查看员', description: '只读查看登录及操作审计', builtIn: true },
  { code: BUILTIN_ROLE_CODES.basicUser, name: '普通用户', description: '不含系统管理权限', builtIn: true }
]);
