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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return children;
}
