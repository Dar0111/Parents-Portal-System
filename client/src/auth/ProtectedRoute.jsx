import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { roleHome } from './roles';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-fg-faint" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // R2 — an account an admin gave a temporary password to can reach exactly
  // one screen until it picks a new one. This gate is BEFORE the role check
  // on purpose: the destination is the same for all three roles, so a
  // teacher who lands on /admin should be told to change their password, not
  // bounced to /teacher first and told there.
  //
  // ROUTED ON `user.must_change_password`, NEVER ON THE 403 (§2). The server
  // also refuses every other route with `code: 'MUST_CHANGE_PASSWORD'`, but
  // that 403 is a backstop for direct API callers — a 403 that redirected
  // would be the exact rule §2 forbids, and the flag is already on the
  // /auth/me row AuthContext holds.
  //
  // No loop: /change-password is a top-level route outside every
  // ProtectedRoute, so nothing sends it back here.
  if (user.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return children;
}
