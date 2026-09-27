import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import EmptyState from '../../components/EmptyState';
import FormField from '../../components/FormField';

// THE TEACHER'S CONTACT PICKER — the web's "New message" modal as a screen.
// GET /messages/contacts is scoped by the inverse of canMessage() (the
// parents of learners this teacher is connected to, plus teachers and
// admins) and lists ACTIVE accounts only; the search filters WITHIN that
// list and is never an unscoped user search. PARENT ROWS LEAD WITH THE
// STUDENT: a guardian's own name may mean nothing to a teacher looking for
// "Tala's parent". Choosing a contact REPLACES this screen with the thread.
//
// The empty Parents group names a KNOWN IMPRECISION rather than hiding it:
// the API cannot tell "this teacher has no students" from "every parent is
// still pending", so the sentence covers the case it can name.
export default function NewMessageScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let live = true;
    fetchAll('/messages/contacts', { unwrap: 'contacts' })
      .then((rows) => {
        if (live) setContacts(rows);
      })
      .catch((err) => {
        if (live) setError(extractError(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(term) || (c.student_name || '').toLowerCase().includes(term));
  }, [contacts, search]);

  const groups = useMemo(
    () => [
      { role: 'parent', label: 'Parents', rows: filtered.filter((c) => c.role === 'parent') },
      { role: 'teacher', label: 'Teachers', rows: filtered.filter((c) => c.role === 'teacher') },
      { role: 'admin', label: 'Admin', rows: filtered.filter((c) => c.role === 'admin') },
    ],
    [filtered]
  );

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
      <FormField label="Search" placeholder="Contact name or student name" value={search} onChangeText={setSearch} autoCorrect={false} />
      {loading ? (
        <Text className="py-6 text-center text-sm text-fg-muted">Loading contacts…</Text>
      ) : error ? (
        <Text className="text-sm text-danger-text">{error}</Text>
      ) : contacts.length === 0 ? (
        <EmptyState icon="fa-address-book" title="No one to message yet" message="You can message parents once you are assigned to a class or made a section adviser." />
      ) : (
        groups.map((group) => (
          <View key={group.role}>
            <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{group.label}</Text>
            {group.rows.length === 0 ? (
              <View className="rounded-lg bg-surface-subtle px-3 py-2">
                <Text className="text-sm text-fg-muted">
                  {group.role === 'parent' && !search.trim()
                    ? 'No parents yet. A parent appears here once an admin approves their account.'
                    : `No ${group.label.toLowerCase()} match that search.`}
                </Text>
              </View>
            ) : (
              <View className="rounded-lg border border-edge bg-surface">
                {group.rows.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => navigation.replace('MessageThread', { otherId: c.id, name: c.name })}
                    accessibilityRole="button"
                    className={`flex-row items-center justify-between gap-3 px-3 py-3 ${i > 0 ? 'border-t border-edge-soft' : ''}`}
                  >
                    <Text className="min-w-0 flex-1 text-sm text-fg">
                      {c.role === 'parent' && c.student_name ? (
                        <>
                          <Text className="font-medium">{c.student_name}</Text>
                          <Text className="text-fg-muted"> — parent: {c.name}</Text>
                        </>
                      ) : (
                        <>
                          <Text className="font-medium">{c.name}</Text>
                          {c.subject ? <Text className="text-fg-muted"> — {c.subject}</Text> : null}
                        </>
                      )}
                    </Text>
                    {Number(c.unread_count) > 0 ? (
                      <View className="rounded-full bg-primary px-2 py-0.5">
                        <Text className="text-xs text-primary-fg">{c.unread_count}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}
