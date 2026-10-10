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

// THE CONVERSATION LIST AND THE NEW-MESSAGE PICKER, FOR EVERY ROLE
// (feat/shared-messages, 2026-10-11; FRONTEND §30). The thread is its own
// route (<base>/:userId) — a destination a user returns to, and on a phone a
// split view collapses to exactly this anyway. The parent's page (the admin's
// too since 2026-10-05) and the teacher's were two copies; each is now a small
// wrapper passing what differs, AS THE CODE HAD IT:
//   - `base`              — the thread routes' base path;
//   - `groups`            — the picker's groups, in order: { role, label,
//                           empty? } — `empty` is the sentence for an empty
//                           group with no search (default "No <label> to
//                           message.");
//   - `searchPlaceholder`, `searchFields` — what the picker's search reads;
//   - `noContactsMessage` — the empty picker's sentence;
//   - `renderContact`     — optional: a row's text; null falls back to the
//                           name and subject.
// WHO MAY BE MESSAGED IS THE SERVER'S: GET /messages/contacts is scoped by the
// inverse of canMessage() (the admin → active teachers; a parent → their
// child's teachers; a teacher → parents, teachers and the admin). The client
// only GROUPS what came back; it never widens or narrows it.
//
// FETCH SHAPE: the TABLE is GET /messages/conversations. GET /messages/contacts
// is the New-message picker only. Contacts already carries last_message and
// unread_count; this page does not merge the two lists. A merge would show
// people the user has never spoken to as if they were conversations.
//
// "Announce to a class" is not here. The list has no draft and no section — a
// button here would be a second door into the empty compose that already
// exists on Announcements; it sits on the teacher's thread.
//
// THE PAGE'S SHAPE (feat/ui-refresh, 2026-10-02): one section — its header
// (title, New message) and the list. NOTHING ANIMATES WHEN A MESSAGE
// ARRIVES: the entrance wrapper plays once, when the page mounts, and a
// refetch only swaps the table inside it. The picker sits BESIDE that
// wrapper, never inside it (motion/motion.js).
//
// §5c: :userId is users.id, never an LRN. login_id is not rendered.

// A contact row's text when the page passes nothing else: the name, and the
// subject (or the adviser label the server puts there) when there is one.
function ContactName({ contact }) {
  return (
    <>
      <span className="font-semibold text-fg">{contact.name}</span>
      {contact.subject ? <span className="text-sm text-fg-muted"> — {contact.subject}</span> : null}
    </>
  );
}

export default function ConversationsPage({ base, groups, searchPlaceholder, searchFields, noContactsMessage, renderContact }) {
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
    return contacts.filter((c) => searchFields.some((field) => (c[field] || '').toLowerCase().includes(term)));
  }, [contacts, search, searchFields]);

  const groupRows = useMemo(
    () => groups.map((group) => ({ ...group, rows: filteredContacts.filter((c) => c.role === group.role) })),
    [groups, filteredContacts]
  );

  const columns = [
    {
      key: 'other_user_name',
      header: 'Conversation',
      sortable: true,
      // The person cell: the same photo-or-initials circle the phone card
      // shows (`other_user_profile_pic` is already on the row), the name, the
      // role as a quiet label (re-cased for display only, §5d), and one line
      // of the last message.
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
            // CONVERSATION CARD (DV1b-a). Opening the thread IS the one action
            // this page exists for, so the whole card is the link — the table's
            // separate "Open" button has no place on a card, where the card
            // itself is the affordance (§5a-iii).
            //
            // `to`, not `onSelect`: the thread is a real route, so this must be a
            // <Link> that can open in a new tab, not a button that navigates.
            // `to` keys on `users.id` (`other_user_id`), never a login id — a
            // parent's login id IS their child's LRN and never enters a URL
            // (§5c). The unread count stays in meta rather than `status`,
            // because StatusBadge maps a vocabulary to a tone and a number is
            // not one (§4). It stays the server's own count either way —
            // nothing here increments (§10).
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
            // THE WHOLE ROW OPENS IT TOO (fix round W2, 2026-10-11): a click
            // anywhere on a table row goes where its Open goes. Open stays
            // exactly as it is — the keyboard and screen-reader path — and a
            // click on it is its own, so it navigates once (DataTable).
            onRowClick={(row) => navigate(`${base}/${row.other_user_id}`)}
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
        <div className="space-y-4">
          <FormField
            label="Search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {contactsLoading ? (
            <LoadingSpinner size="sm" label="Loading contacts…" className="py-6" />
          ) : contactsError ? (
            // The API's own wording, in the shared alert (§2).
            <ErrorAlert message={contactsError} />
          ) : contacts.length === 0 ? (
            <EmptyState icon="fa-address-book" title="No one to message yet" message={noContactsMessage} />
          ) : (
            groupRows.map((group) => (
              <div key={group.role}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  {group.label}
                </p>
                {group.rows.length === 0 ? (
                  // An empty group says WHY, from the search actually applied
                  // (§5f): a search that matched no one, or a group with no one
                  // in it at all — the page's own sentence for that group.
                  <p className="rounded-xl bg-surface-subtle px-4 py-3 text-sm text-fg-muted">
                    {search.trim()
                      ? `No ${group.label.toLowerCase()} match that search.`
                      : group.empty || `No ${group.label.toLowerCase()} to message.`}
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
                          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-accent"
                        >
                          <span className="min-w-0 break-words">
                            {renderContact?.(c) ?? <ContactName contact={c} />}
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
