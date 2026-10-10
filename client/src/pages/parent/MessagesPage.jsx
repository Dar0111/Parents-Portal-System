import { useAuth } from '../../auth/AuthContext';
import ConversationsPage from '../messages/ConversationsPage';

// Conversation list — the parent's, and the admin's inbox too (2026-10-05,
// the owner's decision): the admin is routed to this page and its thread at
// /admin/messages, so the base path follows the signed-in role. The page
// itself is the shared component (feat/shared-messages, FRONTEND §30).
//
// Both roles message teachers only — a parent may not message the admin, and
// the admin may message teachers only — so the picker is ONE group, Teachers
// (since 2026-10-05; it was Teachers + Admin). A parent never sees other
// parents (canMessage refuses them). The teacher picker's Parents group and its
// pending-approval copy are omitted on purpose — they would be a lie here. The
// copy that differs by role is the empty picker's sentence.
//
// "Post to class" is not here. That pre-fills the teacher Announcements
// composer, a write a parent cannot make (403 Access denied.).
const GROUPS = Object.freeze([{ role: 'teacher', label: 'Teachers' }]);
const SEARCH_FIELDS = Object.freeze(['name', 'subject']);

export default function ParentMessagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const base = isAdmin ? '/admin/messages' : '/parent/messages';

  return (
    <ConversationsPage
      base={base}
      groups={GROUPS}
      searchPlaceholder="Teacher name"
      searchFields={SEARCH_FIELDS}
      noContactsMessage={
        isAdmin
          ? 'Active teacher accounts appear here.'
          : "You can message your child's teachers once your account is linked to a student."
      }
    />
  );
}
