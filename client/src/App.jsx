import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import { roleHome } from './auth/roles';
import Shell from './layout/Shell';
import Login from './pages/Login';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import TeacherDashboard from './pages/dashboards/TeacherDashboard';
import ParentDashboard from './pages/dashboards/ParentDashboard';
import TeacherAttendance from './pages/teacher/AttendancePage';
import TeacherStudents from './pages/teacher/StudentsPage';
import TeacherStudentDetail from './pages/teacher/StudentDetailPage';
import TeacherExcuseLetters from './pages/teacher/ExcuseLettersPage';
import TeacherAnnouncements from './pages/teacher/AnnouncementsPage';
import TeacherMemos from './pages/teacher/MemosPage';
import TeacherEvents from './pages/teacher/EventsPage';
import TeacherMessages from './pages/teacher/MessagesPage';
import TeacherMessageThread from './pages/teacher/MessageThreadPage';
import UiGallery from './pages/dev/UiGallery';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />;
}

// Each role is a LAYOUT route: ProtectedRoute gates it, Shell renders the
// chrome once, and every page below is a plain component rendered into its
// <Outlet />. Pages no longer import Shell themselves — that pattern would
// mean 36 copies of the layout decision by the end of Stage 4.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
          </Route>

          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<TeacherDashboard />} />
            <Route path="attendance" element={<TeacherAttendance />} />
            <Route path="students" element={<TeacherStudents />} />
            <Route path="students/:id" element={<TeacherStudentDetail />} />
            <Route path="excuse-letters" element={<TeacherExcuseLetters />} />
            <Route path="announcements" element={<TeacherAnnouncements />} />
            <Route path="memos" element={<TeacherMemos />} />
            <Route path="events" element={<TeacherEvents />} />
            <Route path="messages" element={<TeacherMessages />} />
            <Route path="messages/:userId" element={<TeacherMessageThread />} />
          </Route>

          <Route
            path="/parent"
            element={
              <ProtectedRoute allowedRoles={['parent']}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<ParentDashboard />} />
          </Route>

          {/* Component gallery — dev builds only. import.meta.env.DEV is
              replaced with `false` in a production build, so neither the route
              nor the module survives it. Deliberately not role-gated and not
              in any nav: it exists to review primitives, and shipping an
              unauthenticated gallery to the server parents use is the thing
              being avoided here. */}
          {import.meta.env.DEV ? <Route path="/dev/ui" element={<UiGallery />} /> : null}

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
