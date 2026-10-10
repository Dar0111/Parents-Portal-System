import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import Button from '../../components/Button';
import MessageThread from '../messages/MessageThread';

// One conversation, the teacher's. The thread itself is the shared component
// (feat/shared-messages, FRONTEND §30); what is the teacher's alone is the row
// above it: the way back, and "Announce to a class".
//
// ANNOUNCE TO A CLASS sits on this thread, not the list. The list has no draft
// and no section — a button there would be a second door into the empty compose
// that already exists. Draft only; never the last incoming message.
//
// NAMING THE CLASS comes from GET /messages/contacts (2026-09-13), the only
// messages endpoint that carries the child's class — GET /with/:userId and
// GET /conversations still carry none. The row for otherId is fetched once per
// thread in its own effect, NOT inside the thread's load(): load() re-runs on
// every socket message for this thread, so a contacts call there would refetch
// once per incoming message. It starts with the page, beside the thread's own
// read, as it always has. The contacts call never touches the thread's loading
// or error — the thread must render if contacts fails.
//
// Named ONLY when the row is a parent row with student_name and a class. Every
// other case falls back to "Announce to a class" with no target: contacts not
// loaded yet, contacts failed, a teacher/admin thread (class null), or no row
// at all — a deactivated parent, or scope changed and the history is still
// readable. Do not preselect a class for a parent you can no longer reach.
//
// The target is trusted by construction: contacts' parent rows and
// useTeacherTargets both derive from teacher_assignments grade+section and
// sections.adviser_id, and PUT /students refuses the class change that would
// split them. The client PRESELECTS; it does not authorize — Announcements
// re-validates against its own target list and the server decides on POST.
// Do not reconstruct the class by matching student_name to GET /students — two
// students can share a name.

// The way back, and the way out to an announcement, with the sentence that
// says what that button does NOT do kept directly under it.
function AnnounceRow({ back, otherId, other, draft, contactRow }) {
  const navigate = useNavigate();
  // "ANNOUNCE TO A CLASS" IS FOR A PARENT'S THREAD ONLY (2026-10-05). It
  // exists to stop a teacher answering one parent by hand when the whole
  // class needs the answer; a thread with another teacher or with the admin
  // has no class behind it. The role comes from a message that names the
  // other person, else from their contacts row; while neither has loaded the
  // button stays away rather than flashing on a thread that is not a
  // parent's.
  const otherIsParent = (other?.role || contactRow?.role) === 'parent';
  const announceClass =
    contactRow?.student_name && contactRow.student_grade_level != null && contactRow.student_section
      ? {
          key: `${contactRow.student_grade_level}|${contactRow.student_section}`,
          label: `Grade ${contactRow.student_grade_level} - ${contactRow.student_section}`,
        }
      : null;
  // §5i: the named hint is only shown when Announcements will open with that
  // section selected. The last sentence stays in both — it is what stops a
  // teacher believing the announcement answers this parent.
  const announceHint = announceClass
    ? `Opens an announcement to ${announceClass.label}, already selected. Every parent in that section will see it. This conversation will not.`
    : 'Opens a class announcement. Every parent in the section you pick will see it. This conversation will not.';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {back}
        {otherIsParent ? (
          <Button
            icon="fa-bullhorn"
            title={announceHint}
            onClick={() =>
              navigate('/teacher/announcements', {
                state: {
                  compose: announceClass
                    ? { content: draft.trim(), target: announceClass.key, fromThread: otherId }
                    : { content: draft.trim(), fromThread: otherId },
                },
              })
            }
          >
            {announceClass ? `Announce to ${announceClass.label}` : 'Announce to a class'}
          </Button>
        ) : null}
      </div>
      {/* Visible, not only the title tooltip: hover does not exist on touch,
          and "This conversation will not" is the sentence that stops a
          teacher believing they replied to the parent (§3's rule). Under
          the button it explains: right-aligned from `sm`, where the button
          sits on the right; left-aligned on a phone, where the button has
          wrapped to the left. It goes with the button. */}
      {otherIsParent ? <p className="text-xs text-fg-muted sm:text-right">{announceHint}</p> : null}
    </div>
  );
}

export default function MessageThreadPage() {
  const { userId } = useParams();
  const otherId = Number(userId);

  // forId !== otherId is the "not loaded" state, so the effect below never
  // sets state synchronously on a thread change.
  const [contactInfo, setContactInfo] = useState({ forId: null, failed: false, row: null });

  // Its own effect keyed on otherId — see the header for why not inside load().
  useEffect(() => {
    let cancelled = false;
    api
      .get('/messages/contacts', { unwrap: 'contacts' })
      .then((rows) => {
        if (cancelled) return;
        setContactInfo({
          forId: otherId,
          failed: false,
          row: rows.find((c) => c.id === otherId) || null,
        });
      })
      .catch(() => {
        // Not surfaced: the unnamed button is the honest fallback, and a
        // contacts failure must not read as the conversation being broken.
        if (!cancelled) setContactInfo({ forId: otherId, failed: true, row: null });
      });
    return () => {
      cancelled = true;
    };
  }, [otherId]);

  const contactRow = contactInfo.forId === otherId ? contactInfo.row : null;

  return (
    <MessageThread
      listPath="/teacher/messages"
      renderTop={(top) => <AnnounceRow {...top} contactRow={contactRow} />}
    />
  );
}
