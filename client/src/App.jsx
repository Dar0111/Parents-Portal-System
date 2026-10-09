import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AuthUnavailable from './auth/AuthUnavailable';
import { roleHome } from './auth/roles';
import Shell from './layout/Shell';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ForcedPasswordChange from './pages/ForcedPasswordChange';
import PolicyConsent from './pages/PolicyConsent';
import AboutPage from './pages/AboutPage';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import AdminUsers from './pages/admin/UsersPage';
import AdminStudents from './pages/admin/StudentsPage';
import AdminStudentDetail from './pages/admin/StudentDetailPage';
import AdminAttendance from './pages/admin/AttendancePage';
import AdminAnnouncements from './pages/admin/AnnouncementsPage';
import AdminGrades from './pages/admin/GradesPage';
import AdminBackups from './pages/admin/BackupsPage';
import TeacherDashboard from './pages/dashboards/TeacherDashboard';
import ParentDashboard from './pages/dashboards/ParentDashboard';
import TeacherAttendance from './pages/teacher/AttendancePage';
import TeacherAttendanceRecords from './pages/teacher/AttendanceRecordsPage';
import TeacherStudents from './pages/teacher/StudentsPage';
import TeacherStudentDetail from './pages/teacher/StudentDetailPage';
import TeacherExcuseLetters from './pages/teacher/ExcuseLettersPage';
import TeacherAnnouncements from './pages/teacher/AnnouncementsPage';
import TeacherMemos from './pages/teacher/MemosPage';
import TeacherEvents from './pages/teacher/EventsPage';
import TeacherMessages from './pages/teacher/MessagesPage';
import TeacherMessageThread from './pages/teacher/MessageThreadPage';
import TeacherClassRecord from './pages/teacher/ClassRecordPage';
import TeacherClassSummary from './pages/teacher/ClassSummaryPage';
import TeacherClassSummaryLearner from './pages/teacher/ClassSummaryLearnerPage';
import ParentGrades from './pages/parent/GradesPage';
import ParentAttendance from './pages/parent/AttendancePage';
import ParentAnnouncements from './pages/parent/AnnouncementsPage';
import ParentMemos from './pages/parent/MemosPage';
import ParentEvents from './pages/parent/EventsPage';
import ParentExcuseLetters from './pages/parent/ExcuseLettersPage';
import ParentMessages from './pages/parent/MessagesPage';
import ParentMessageThread from './pages/parent/MessageThreadPage';
import SettingsLayout from './pages/settings/SettingsLayout';
import AccountInfoSection from './pages/settings/AccountInfoSection';
import ChangePasswordSection from './pages/settings/ChangePasswordSection';
import PersonalizationSection from './pages/settings/PersonalizationSection';
import SchoolSettingsSection from './pages/settings/SchoolSettingsSection';
import SecurityPolicySection from './pages/settings/SecurityPolicySection';
import UiGallery from './pages/dev/UiGallery';

function RootRedirect() {
  const { user, loading, authError, retry } = useAuth();
  if (loading) return null;
  // Same guard as ProtectedRoute (pre-Stage-5 #4): a stored token whose
  // /auth/me read failed for a non-401 reason must not bounce "/" to /login.
  if (authError) return <AuthUnavailable message={authError} onRetry={retry} />;
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
          {/* Public: the reset code is the credential, so this route is
              reachable signed out — which is the only state it is used
              from. */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* Top-level, with NO ProtectedRoute and NO Shell. ProtectedRoute
              redirects here when users.must_change_password is set, so
              wrapping this route in it would be a loop; the page does its
              own signed-in / flag-still-set checks. Outside every role
              prefix because all three roles land on the same screen. */}
          <Route path="/change-password" element={<ForcedPasswordChange />} />
          {/* The consent screen (feat/privacy): the same shape as the forced
              change — top-level, no Shell, no ProtectedRoute (which sends
              people here on `policy_pending`). The page does its own guards. */}
          <Route path="/consent" element={<PolicyConsent />} />
          {/* Public: the school's own details and the DepEd VMV, reachable
              from the login screen. No Shell, no ProtectedRoute; it reads
              GET /settings/public, the one unauthenticated settings read.
              The same component sits under each role prefix below. */}
          <Route path="/about" element={<AboutPage publicView />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="students/:id" element={<AdminStudentDetail />} />
            {/* Settings is a nested layout: tabs are sub-routes, so a deep link
                opens the right tab and the back button returns to the previous
                one. Admin's index tab is School settings; the other roles'
                index tab is Account information. */}
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SchoolSettingsSection />} />
              <Route path="account" element={<AccountInfoSection />} />
              <Route path="password" element={<ChangePasswordSection />} />
              <Route path="security" element={<SecurityPolicySection />} />
              <Route path="personalization" element={<PersonalizationSection />} />
            </Route>
            <Route path="attendance" element={<AdminAttendance />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            {/* The admin's inbox (2026-10-05): the PARENT pages, which take
                their base path from the signed-in role — teacher ↔ admin
                only, so the admin's picker holds teachers and its threads
                have no "Announce to a class". */}
            <Route path="messages" element={<ParentMessages />} />
            <Route path="messages/:userId" element={<ParentMessageThread />} />
            <Route path="grades" element={<AdminGrades />} />
            <Route path="backups" element={<AdminBackups />} />
            <Route path="about" element={<AboutPage />} />
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
            {/* TEACHER → GRADES *IS* THE CLASS RECORD (2026-09-22). The
                per-learner page it replaced is deleted, not hidden: two
                grades screens for one role is the "second composer" problem,
                and the grid shows the same term grades for the whole class
                at once. The nav item is unchanged and still says Grades.
                The per-learner cross-subject view returns as CR3's adviser
                class summary. */}
            <Route path="grades" element={<TeacherClassRecord />} />
            {/* The path CR2 shipped for one dispatch. Kept as a redirect so
                any link already written to it still lands somewhere. */}
            <Route path="class-record" element={<Navigate to="/teacher/grades" replace />} />
            {/* CR3 — the adviser's Summary of Grades, read-only. The
                drill-through routes on students.id, never the LRN (§5c). */}
            <Route path="class-summary" element={<TeacherClassSummary />} />
            <Route path="class-summary/:studentId" element={<TeacherClassSummaryLearner />} />
            <Route path="attendance" element={<TeacherAttendance />} />
            <Route path="attendance-records" element={<TeacherAttendanceRecords />} />
            <Route path="students" element={<TeacherStudents />} />
            <Route path="students/:id" element={<TeacherStudentDetail />} />
            <Route path="excuse-letters" element={<TeacherExcuseLetters />} />
            <Route path="announcements" element={<TeacherAnnouncements />} />
            <Route path="memos" element={<TeacherMemos />} />
            <Route path="events" element={<TeacherEvents />} />
            <Route path="messages" element={<TeacherMessages />} />
            <Route path="messages/:userId" element={<TeacherMessageThread />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<AccountInfoSection />} />
              <Route path="password" element={<ChangePasswordSection />} />
              <Route path="security" element={<SecurityPolicySection />} />
              <Route path="personalization" element={<PersonalizationSection />} />
            </Route>
            <Route path="about" element={<AboutPage />} />
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
            <Route path="grades" element={<ParentGrades />} />
            <Route path="attendance" element={<ParentAttendance />} />
            <Route path="excuse-letters" element={<ParentExcuseLetters />} />
            <Route path="announcements" element={<ParentAnnouncements />} />
            <Route path="memos" element={<ParentMemos />} />
            <Route path="events" element={<ParentEvents />} />
            <Route path="messages" element={<ParentMessages />} />
            <Route path="messages/:userId" element={<ParentMessageThread />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<AccountInfoSection />} />
              <Route path="password" element={<ChangePasswordSection />} />
              <Route path="security" element={<SecurityPolicySection />} />
              <Route path="personalization" element={<PersonalizationSection />} />
            </Route>
            <Route path="about" element={<AboutPage />} />
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
