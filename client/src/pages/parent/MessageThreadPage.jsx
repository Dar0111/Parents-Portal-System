import { useAuth } from '../../auth/AuthContext';
import MessageThread from '../messages/MessageThread';

// One conversation — the parent's, and the admin's too: /admin/messages/:userId
// renders this page (2026-10-05), so the way back follows the signed-in role.
// The thread itself is the shared component (feat/shared-messages, FRONTEND
// §30). Neither role gets "Announce to a class" — that is a teacher's
// hand-off, and only on a parent's thread.
export default function ParentMessageThreadPage() {
  const { user } = useAuth();
  return <MessageThread listPath={user?.role === 'admin' ? '/admin/messages' : '/parent/messages'} />;
}
