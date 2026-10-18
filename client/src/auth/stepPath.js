import { nextStep } from './accountSteps';
import { roleHome } from './roles';

// Where each first-sign-in step lives on the web (feat/first-signin,
// 2026-10-18). Three top-level routes outside Shell and outside every
// ProtectedRoute — ProtectedRoute is what sends people to them, so wrapping
// any of them in it would loop. Web only: the phone mounts screens, not paths.
export const STEP_PATH = {
  consent: '/consent',
  contact: '/confirm-contact',
  password: '/change-password',
};

// Where a signed-in user belongs right now: the next step's page, or home.
export function entryPath(user) {
  if (!user) return '/login';
  const step = nextStep(user);
  return step ? STEP_PATH[step] : roleHome(user.role);
}
