import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { fetchAll, listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import { useAuth } from '../../auth/AuthContext';
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

// Conversation list. The thread is its own route (/parent/messages/:userId).
//
// THE ADMIN'S INBOX TOO (2026-10-05, the owner's decision): the admin is
// routed to this page and its thread at /admin/messages, so every link here
// takes its base path from the signed-in role. Both roles message teachers
// only — a parent may not message the admin, and the admin may message
// teachers only — so the picker is ONE group, Teachers. The page-level copy
// that differs by role is the picker's empty message. A shared component
// replaces this reuse after the Fri 9 Oct 2026 check.
//
// FETCH SHAPE COPIED FROM Teacher → Messages, not reinvented: the TABLE is
// GET /messages/conversations. GET /messages/contacts is the New-message
// picker only. Contacts already carries last_message and unread_count; this
// page does not merge the two lists. A merge would show people the parent
// has never spoken to as if they were conversations.
//
// "Post to class" is not here. That pre-fills the teacher Announcements
// composer, a write a parent cannot make (403 Access denied.).
//
// The one contact group is Teachers (since 2026-10-05; it was Teachers +
// Admin). A parent never sees other parents (canMessage refuses them). The
// Teacher picker's Parents group and its pending-approval copy are omitted on
// purpose — they would be a lie here.
//
// §5c: :userId is users.id, never an LRN. login_id is not rendered.

export default function ParentMessagesPage() {
  usePageTitle('Messages');
  const navigate = useNavigate();
  const { subscribe } = useSocket();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const base = isAdmin ? '/admin/messages' : '/parent/messages';

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
        (c.subject || '').toLowerCase().includes(term)
    );
  }, [contacts, search]);

  const groups = useMemo(
    () => [{ role: 'teacher', label: 'Teachers', rows: filteredContacts.filter((c) => c.role === 'teacher') }],
    [filteredContacts]
  );

  const columns = [
    {
      key: 'other_user_name',
      header: 'Conversation',
      sortable: true,
      // The person cell: the same photo-or-initials circle the phone card
      // shows (`other_user_profile_pic` is already on the row), the name, the
      // role as a quiet label, and one line of the last message.
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
      // `last_message_at` is `messages.created_at` under an alias — a
      // TIMESTAMP, not a date — so slicing it showed the previous day for
      // any conversation last touched before 08:00 PH. The alias is exactly
      // why this site was missed when the bug was first swept for.
      render: (row) => <span className="tabular-nums">{timestampDay(row.last_message_at)}</span>,
    },
    {
      key: 'unread_count',
      header: 'Unread',
      align: 'right',
      sortable: true,
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
        <Button size="sm" onClick={() => navigate(`${base}/${row.other_user_id}`)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      <Reveal className="space-y-6">
        <section className="space-y-3">
          {/* New message is the page's one primary action and is in the
              header at every state — the empty state below names it rather
              than repeating it (§5f).

              `[&_h2]:break-words`: the title is one long word beside the
              button. Where both do not fit the button drops under it (the
              title's 12rem basis); a word that still cannot fit is allowed
              to break rather than run past the card's edge. */}
          <SectionHeader
            title="Conversations"
            className="[&_h2]:break-words"
            actions={
              <Button variant="primary" icon="fa-plus" onClick={openPicker}>
                New message
              </Button>
            }
          />

          <DataTable
            // CONVERSATION CARD (DV1b-a). The same shape as the teacher page:
            // opening the thread is the one action, so the card IS the link,
            // and the table's separate "Open" button has no place here.
            //
            // `to` keys on `users.id` (`other_user_id`), never a login id — a
            // parent's login id IS their child's LRN and never enters a URL
            // (§5c). The unread count stays in meta rather than `status`,
            // because StatusBadge maps a vocabulary to a tone and a number is
            // not one.
            renderCard={(row) => ({
              to: `${base}/${row.other_user_id}`,
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

      {/* OUTSIDE the entrance wrapper: Modal renders inline behind a fixed
          backdrop, so it must never sit under an element that can carry a
          transform (motion/motion.js). */}
      <Modal open={picking} onClose={() => setPicking(false)} title="New message" size="lg">
        <div className="space-y-5">
          <FormField
            label="Search"
            placeholder="Teacher name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {contactsLoading ? (
            <LoadingSpinner size="sm" label="Loading contacts…" className="py-6" />
          ) : contactsError ? (
            <ErrorAlert message={contactsError} />
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="fa-address-book"
              title="No one to message yet"
              message={
                isAdmin
                  ? 'Active teacher accounts appear here.'
                  : "You can message your child's teachers once your account is linked to a student."
              }
            />
          ) : (
            groups.map((group) => (
              <div key={group.role}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {group.label}
                </p>
                {group.rows.length === 0 ? (
                  <p className="rounded-xl bg-surface-subtle px-4 py-3 text-sm text-fg-muted">
                    {search.trim()
                      ? `No ${group.label.toLowerCase()} match that search.`
                      : `No ${group.label.toLowerCase()} to message.`}
                  </p>
                ) : (
                  // Each contact is one 44px row: the whole row is the
                  // button, with a chevron saying it leads somewhere. The
                  // list clips its rows to its own corners, so a hovered
                  // first or last row keeps the rounding; the keyboard
                  // outline is drawn inside the row for the same reason.
                  <ul className="divide-y divide-edge-soft overflow-hidden rounded-xl border border-edge">
                    {group.rows.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicking(false);
                            // The name rides in router state, so a new thread
                            // is titled with it before any message exists.
                            navigate(`${base}/${c.id}`, { state: { name: c.name } });
                          }}
                          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent"
                        >
                          <span className="min-w-0 break-words">
                            <span className="font-semibold text-fg">{c.name}</span>
                            {c.subject ? (
                              <span className="text-sm text-fg-muted"> — {c.subject}</span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            {Number(c.unread_count) > 0 ? (
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-fg">
                                {c.unread_count}
                              </span>
                            ) : null}
                            <span aria-hidden="true" className="flex items-center justify-center text-xs text-fg-faint">
                              <i className="fa-solid fa-chevron-right" />
                            </span>
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
    </>
  );
}
