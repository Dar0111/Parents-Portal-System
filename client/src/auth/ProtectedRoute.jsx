import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AuthUnavailable from './AuthUnavailable';
import { nextStep } from './accountSteps';
import { roleHome } from './roles';
import { STEP_PATH } from './stepPath';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading, authError, retry } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  // /auth/me failed for a reason that is not a dead session (pre-Stage-5
  // #4): the token is still stored, so this is NOT a redirect to /login —
  // that would throw away a valid session for a network blip. Checked
  // BEFORE `!user`, because a failed read leaves `user` null too.
  if (authError) {
    return <AuthUnavailable message={authError} onRetry={retry} />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // THE THREE STEPS BEFORE THE APP (feat/first-signin, 2026-10-18; FRONTEND
  // §29): consent (/consent), then a confirmed Gmail or mobile number
  // (/confirm-contact), then the forced password change (/change-password) —
  // the server's order, from the one mirrored nextStep(). An account with a
  // step left reaches only that step's page. BEFORE the role check on purpose:
  // the destination is the same for all three roles, so a teacher who lands
  // on /admin is sent to the step, not bounced to /teacher first.
  //
  // ROUTED ON /auth/me's FIELDS, NEVER ON THE 403s (§2) — `policy_pending`,
  // `contact_pending`, `must_change_password`. The server's 403s
  // (POLICY_ACCEPTANCE_REQUIRED, CONTACT_VERIFICATION_REQUIRED,
  // MUST_CHANGE_PASSWORD) are a backstop for direct API callers.
  //
  // No loop: the three step pages are top-level routes outside every
  // ProtectedRoute, so nothing sends them back here.
  const step = nextStep(user);
  if (step) {
    return <Navigate to={STEP_PATH[step]} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return children;
}
