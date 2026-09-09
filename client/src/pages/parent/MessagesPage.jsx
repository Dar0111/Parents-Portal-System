import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import extractError from '../../api/extractError';
import DataTable from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';
import FormField from '../../components/FormField';
import Modal from '../../components/Modal';
import { useSocket } from '../../realtime/SocketProvider';
import { usePageTitle } from '../../layout/usePageTitle';

// Conversation list. The thread is its own route (/parent/messages/:userId).
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
// Contact groups are Teachers + Admin. A parent never sees other parents
// (canMessage refuses them). The Teacher picker's Parents group and its
// pending-approval copy are omitted on purpose — they would be a lie here.
//
// §5c: :userId is users.id, never an LRN. login_id is not rendered.

export default function ParentMessagesPage() {
  usePageTitle('Messages');
  const navigate = useNavigate();
  const { subscribe } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [picking, setPicking] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConversations(await api.get('/messages/conversations', { unwrap: 'conversations' }));
    } catch (err) {
      setError(extractError(err));
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
      setContacts(await api.get('/messages/contacts', { unwrap: 'contacts' }));
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
    () => [
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
            <span className="font-medium text-slate-900">{row.other_user_name}</span>
            <span className="text-xs text-slate-400">{row.other_user_role}</span>
          </div>
          <div className="line-clamp-1 max-w-xl text-xs text-slate-500">{row.last_message_body}</div>
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
      render: (row) =>
        Number(row.unread_count) > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
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
          onClick={() => navigate(`/parent/messages/${row.other_user_id}`)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
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
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      New message
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{newMessageButton}</div>

      <DataTable
        columns={columns}
        rows={conversations}
        keyField="other_user_id"
        loading={loading}
        error={error}
        onRetry={load}
        emptyIcon="fa-comments"
        emptyTitle="No messages yet"
        emptyMessage="Start a conversation with your child's teacher or the school admin."
        emptyAction={newMessageButton}
      />

      <Modal open={picking} onClose={() => setPicking(false)} title="New message" size="lg">
        <div className="space-y-4">
          <FormField
            label="Search"
            placeholder="Teacher or admin name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {contactsLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading contacts…</p>
          ) : contactsError ? (
            <p className="text-sm text-rose-600">{contactsError}</p>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="fa-address-book"
              title="No one to message yet"
              message="You can message your child's teachers and the school admin once your account is linked to a student."
            />
          ) : (
            groups.map((group) => (
              <div key={group.role}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                {group.rows.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {search.trim()
                      ? `No ${group.label.toLowerCase()} match that search.`
                      : `No ${group.label.toLowerCase()} to message.`}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {group.rows.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicking(false);
                            navigate(`/parent/messages/${c.id}`);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                        >
                          <span>
                            <span className="font-medium text-slate-900">{c.name}</span>
                            {c.subject ? (
                              <span className="text-sm text-slate-500"> — {c.subject}</span>
                            ) : null}
                          </span>
                          {Number(c.unread_count) > 0 ? (
                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
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
