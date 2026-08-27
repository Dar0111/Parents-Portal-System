export const ROLE_HOME = {
  admin: '/admin',
  teacher: '/teacher',
  parent: '/parent',
};

export function roleHome(role) {
  return ROLE_HOME[role] || '/login';
}
