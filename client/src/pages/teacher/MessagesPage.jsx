import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { fetchAll, listParams } from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
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
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg">{row.other_user_name}</span>
            <span className="text-xs text-fg-muted">{row.other_user_role}</span>
          </div>
          <div className="line-clamp-1 max-w-xl text-xs text-fg-muted">{row.last_message_body}</div>
        </div>
      ),
    },
    {
      key: 'last_message_at',
      header: 'Last message',
      sortable: true,
      render: (row) => String(row.last_message_at).slice(0, 10),
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
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-fg">
            {row.unread_count}
          </span>
        ) : null,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/teacher/messages/${row.other_user_id}`)}
          className="rounded-lg border border-edge-strong px-2.5 py-1 text-sm text-fg-body transition hover:bg-surface-muted"
        >
          Open
        </button>
      ),
    },
  ];

  const newMessageButton = (
    <button
      type="button"
      onClick={openPicker}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
    >
      New message
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{newMessageButton}</div>

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
          title: row.other_user_name,
          subtitle: row.last_message_body,
          meta: `${String(row.last_message_at).slice(0, 10)}${
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

      <Modal open={picking} onClose={() => setPicking(false)} title="New message" size="lg">
        <div className="space-y-4">
          <FormField
            label="Search"
            placeholder="Contact name or student name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {contactsLoading ? (
            <p className="py-6 text-center text-sm text-fg-muted">Loading contacts…</p>
          ) : contactsError ? (
            <p className="text-sm text-danger-text">{contactsError}</p>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="fa-address-book"
              title="No one to message yet"
              message="You can message parents once you are assigned to a class or made a section adviser."
            />
          ) : (
            groups.map((group) => (
              <div key={group.role}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
                  {group.label}
                </p>
                {group.rows.length === 0 ? (
                  <p className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-fg-muted">
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
                  <ul className="divide-y divide-edge-soft rounded-lg border border-edge">
                    {group.rows.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicking(false);
                            navigate(`/teacher/messages/${c.id}`);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-surface-subtle"
                        >
                          <span>
                            {/* Parent rows LEAD with the student: a guardian's
                                own name may mean nothing to a teacher, who is
                                looking for "Marwin's parent". */}
                            {c.role === 'parent' && c.student_name ? (
                              <>
                                <span className="font-medium text-fg">{c.student_name}</span>
                                <span className="text-sm text-fg-muted"> — parent: {c.name}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-fg">{c.name}</span>
                                {c.subject ? (
                                  <span className="text-sm text-fg-muted"> — {c.subject}</span>
                                ) : null}
                              </>
                            )}
                          </span>
                          {Number(c.unread_count) > 0 ? (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-fg">
                              {c.unread_count}
                            </span>
                          ) : null}
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
