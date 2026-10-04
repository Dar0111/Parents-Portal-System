import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { fetchAll, listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import { timestampDay } from '../../format/date';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import SectionHeader from '../../components/SectionHeader';
import Reveal from '../../motion/Reveal';
import { useSocket } from '../../realtime/SocketProvider';
import { usePageTitle } from '../../layout/usePageTitle';

// Conversation list. The thread is its own route (/teacher/messages/:userId) —
// a thread is a destination a teacher returns to, and on a phone a split view
// collapses to exactly this anyway.
//
// "Announce to a class" is on the THREAD, not here. The list has no draft and
// no section — a button here would be a second door into the empty compose
// that already exists on Announcements. The thread carries the unsent draft
// via location.state; it does not add a composer on Messages.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header
// (title, New message) and the list. NOTHING ANIMATES WHEN A MESSAGE
// ARRIVES: the entrance wrapper plays once, when the page mounts, and a
// refetch only swaps the table inside it. The picker sits BESIDE that
// wrapper, never inside it (motion/motion.js).

export default function MessagesPage() {
  usePageTitle('Messages');
  const navigate = useNavigate();
  const { subscribe } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Paged table (2026-09-19): one page of conversations, sorted by the
  // server (C1). A sort change resets to the first page (C6).
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(null);

  const [picking, setPicking] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get('/messages/conversations', {
        unwrap: ['conversations', 'page'],
        params: listParams({ offset, sort }),
      });
      setConversations(result.conversations);
      setPage(result.page);
    } catch (err) {
      setError(extractError(err));
      setConversations([]);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [offset, sort]);

  function changeSort(next) {
    setSort(next);
    setOffset(0);
  }

  useEffect(() => {
    load();
  }, [load]);

  // An incoming message can create a conversation that did not exist, so the
  // list is refetched rather than patched — the server computes last_message
  // and unread_count, and reproducing that here is the drift 5b warns about.
  useEffect(() => subscribe(() => load()), [subscribe, load]);

  const openPicker = useCallback(async () => {
    setPicking(true);
    setContactsLoading(true);
    setContactsError(null);
    setSearch('');
    try {
      // C2: the picker searches the WHOLE scoped set client-side, so it needs
      // every contact — fetchAll pages through, never the first page.
      setContacts(await fetchAll('/messages/contacts', { unwrap: 'contacts' }));
    } catch (err) {
      setContactsError(extractError(err));
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.student_name || '').toLowerCase().includes(term)
    );
  }, [contacts, search]);

  const groups = useMemo(
    () => [
      { role: 'parent', label: 'Parents', rows: filteredContacts.filter((c) => c.role === 'parent') },
      { role: 'teacher', label: 'Teachers', rows: filteredContacts.filter((c) => c.role === 'teacher') },
      { role: 'admin', label: 'Admin', rows: filteredContacts.filter((c) => c.role === 'admin') },
    ],
    [filteredContacts]
  );

  const columns = [
    {
      key: 'other_user_name',
      header: 'Conversation',
      sortable: true,
      // The person cell, as on the parent's list: the same photo-or-initials
      // circle the phone card shows (`other_user_profile_pic` is already on
      // the row), the name, the role as a quiet label (re-cased for display
      // only, §5d), and one line of the last message.
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.other_user_name} photo={row.other_user_profile_pic} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-fg">{row.other_user_name}</span>
              <span className="text-xs capitalize text-fg-muted">{row.other_user_role}</span>
            </div>
            <div className="line-clamp-1 max-w-xl text-xs text-fg-muted">{row.last_message_body}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'last_message_at',
      header: 'Last message',
      sortable: true,
      nowrap: true,
      // `last_message_at` is `messages.created_at` aliased — a TIMESTAMP,
      // so slicing it showed the previous day before 08:00 PH. The alias is
      // why a grep for `created_at` did not find this site.
      render: (row) => <span className="tabular-nums">{timestampDay(row.last_message_at)}</span>,
    },
    {
      key: 'unread_count',
      header: 'Unread',
      align: 'right',
      sortable: true,
      // Straight from the server's own COUNT — never a locally maintained
      // number. See convention 5b.
      render: (row) =>
        Number(row.unread_count) > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-fg">
            {row.unread_count}
          </span>
        ) : null,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      nowrap: true,
      render: (row) => (
        <Button size="sm" onClick={() => navigate(`/teacher/messages/${row.other_user_id}`)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          <SectionHeader
            title="Conversations"
            // The title keeps a 12rem basis beside "New message", so the
            // button drops under it by itself wherever both do not fit.
            actions={
              <Button variant="primary" icon="fa-plus" onClick={openPicker}>
                New message
              </Button>
            }
          />

          <DataTable
            // CONVERSATION CARD (DV1b-a). Opening the thread IS the one action
            // this page exists for, so the whole card is the link — the table's
            // separate "Open" button has no place on a card, where the card
            // itself is the affordance (§5a-iii).
            //
            // `to`, not `onSelect`: the thread is a real route, so this must be a
            // <Link> a parent can open in a new tab, not a button that navigates.
            // The route keys on `users.id`, never a login id (§5c).
            //
            // The unread COUNT is deliberately left in meta rather than passed as
            // `status`: StatusBadge maps a vocabulary to a tone, and a number is
            // not one of the four vocabularies (§4). It stays the server's own
            // count either way — nothing here increments (§10).
            renderCard={(row) => ({
              to: `/teacher/messages/${row.other_user_id}`,
              avatar: row.other_user_name,
              avatarPhoto: row.other_user_profile_pic,
              title: row.other_user_name,
              subtitle: row.last_message_body,
              meta: `${timestampDay(row.last_message_at)}${
                Number(row.unread_count) > 0 ? ` · ${row.unread_count} unread` : ''
              }`,
            })}
            columns={columns}
            rows={conversations}
            keyField="other_user_id"
            loading={loading}
            error={error}
            onRetry={load}
            page={page}
            onPageChange={setOffset}
            sort={sort}
            onSortChange={changeSort}
            emptyIcon="fa-comments"
            emptyTitle="No messages yet"
            emptyMessage="Use New message to start a conversation."
          />
        </section>
      </Reveal>

      <Modal open={picking} onClose={() => setPicking(false)} title="New message" size="lg">
        <div className="space-y-4">
          <FormField
            label="Search"
            placeholder="Contact name or student name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {contactsLoading ? (
            <LoadingSpinner size="sm" className="py-6" label="Loading contacts…" />
          ) : contactsError ? (
            // The API's own wording, in the shared alert (§2) — it was a bare
            // red sentence with no role.
            <ErrorAlert message={contactsError} />
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="fa-address-book"
              title="No one to message yet"
              message="You can message parents once you are assigned to a class or made a section adviser."
            />
          ) : (
            groups.map((group) => (
              <div key={group.role}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {group.label}
                </p>
                {group.rows.length === 0 ? (
                  <p className="rounded-xl bg-surface-subtle px-4 py-3 text-sm text-fg-muted">
                    {group.role === 'parent'
                      ? // KNOWN IMPRECISION, recorded in CLAUDE.md rather than
                        // hidden: contacts lists ACTIVE accounts only, and the
                        // API gives no way to tell "this teacher has no
                        // students" apart from "every parent is still pending".
                        // A teacher with genuinely no students is told to wait
                        // for an approval that is not coming. Saying nothing
                        // would be worse — an unexplained empty group reads as
                        // broken.
                        'No parents yet. A parent appears here once an admin approves their account.'
                      : `No ${group.label.toLowerCase()} match that search.`}
                  </p>
                ) : (
                  // One contact is one row and one button: 44px tall, the
                  // keyboard outline drawn INSIDE it (the list clips its own
                  // rounded corners, so an outer one would be cut), and a
                  // chevron that says the row goes somewhere.
                  <ul className="divide-y divide-edge-soft overflow-hidden rounded-xl border border-edge">
                    {group.rows.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicking(false);
                            // The name rides in router state, so a new thread
                            // is titled with it before any message exists.
                            navigate(`/teacher/messages/${c.id}`, { state: { name: c.name } });
                          }}
                          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent"
                        >
                          <span className="min-w-0 break-words">
                            {/* Parent rows LEAD with the student: a guardian's
                                own name may mean nothing to a teacher, who is
                                looking for "Marwin's parent". */}
                            {c.role === 'parent' && c.student_name ? (
                              <>
                                <span className="font-semibold text-fg">{c.student_name}</span>
                                <span className="text-sm text-fg-muted"> — parent: {c.name}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-semibold text-fg">{c.name}</span>
                                {c.subject ? (
                                  <span className="text-sm text-fg-muted"> — {c.subject}</span>
                                ) : null}
                              </>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            {Number(c.unread_count) > 0 ? (
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-fg">
                                {c.unread_count}
                              </span>
                            ) : null}
                            <i aria-hidden="true" className="fa-solid fa-chevron-right text-xs text-fg-faint" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
