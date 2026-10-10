import ConversationsPage from '../messages/ConversationsPage';

// Conversation list, the teacher's. The page itself is the shared component
// (feat/shared-messages, FRONTEND §30); what is the teacher's is the picker:
// three groups, a search that also reads the learner's name, and parent rows
// that lead with the learner.
//
// THE EMPTY GROUPS SAY WHY (§5f, the owner's decision of 2026-10-11): with a
// search applied, "No <group> match that search."; with none, the group's own
// sentence. The Parents sentence names a KNOWN IMPRECISION rather than hiding
// it: contacts lists ACTIVE accounts only, and the API gives no way to tell
// "this teacher has no students" apart from "every parent is still pending".
// A teacher with genuinely no students is told to wait for an approval that is
// not coming. Saying nothing would be worse — an unexplained empty group reads
// as broken.
const GROUPS = Object.freeze([
  { role: 'parent', label: 'Parents', empty: 'No parents yet. A parent appears here once an admin approves their account.' },
  { role: 'teacher', label: 'Teachers' },
  { role: 'admin', label: 'Admin' },
]);
const SEARCH_FIELDS = Object.freeze(['name', 'student_name']);

// Parent rows LEAD with the student: a guardian's own name may mean nothing
// to a teacher, who is looking for "Marwin's parent". Every other row is the
// name and subject (null hands it back to the shared row).
function contactText(c) {
  if (c.role !== 'parent' || !c.student_name) return null;
  return (
    <>
      <span className="font-semibold text-fg">{c.student_name}</span>
      <span className="text-sm text-fg-muted"> — parent: {c.name}</span>
    </>
  );
}

export default function MessagesPage() {
  return (
    <ConversationsPage
      base="/teacher/messages"
      groups={GROUPS}
      searchPlaceholder="Contact name or student name"
      searchFields={SEARCH_FIELDS}
      noContactsMessage="You can message parents once you are assigned to a class or made a section adviser."
      renderContact={contactText}
    />
  );
}
