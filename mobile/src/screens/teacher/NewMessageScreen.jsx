import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { fetchAll } from '../../api/client';
import extractError from '../../api/extractError';
import { cardClass } from '../../components/buttonStyles';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import FormField from '../../components/FormField';
import LoadingSpinner from '../../components/LoadingSpinner';
import Text from '../../components/Text';
import Icon from '../../icons';
import { useTheme } from '../../theme/ThemeProvider';

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
//
// THE LOOK (feat/ui-refresh, 2026-10-02) is the web picker's: each group is
// an eyebrow over ONE card of rows, a hairline between them, and a row is one
// button — the name, the server's own unread count (§10) and a chevron that
// says it goes somewhere. A ROW IS 48dp, SET IN dp through a plain style
// object (the phone's rem is 14 — M19) and never a style function (M20); it
// is a minimum, so a long "student — parent: name" line wraps and grows its
// row instead of being cut. Press feedback is Android's ripple, clipped to
// the card's corners by `overflow-hidden` on the card. A failed read is the
// shared alert with the API's own wording (§2), as on the web.
//
// PULL TO REFRESH repeats the screen's ONE request. The fetch stays inside its
// effect, exactly as it was; `attempt` is only the effect's key, so a pull and
// Try again set their state in their own handler and the effect itself never
// sets state synchronously. What was typed in Search is kept. No entrance
// motion: the rows arrive with the read, and a list's rows never animate.
const ROW = { minHeight: 48 };

export default function NewMessageScreen({ navigation }) {
  const { tokens } = useTheme();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);

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
        if (live) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  // Try again shows the spinner in place of the list; a pull keeps the list
  // on screen under the pull spinner.
  function retry() {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }

  function pullToRefresh() {
    setRefreshing(true);
    setError(null);
    setAttempt((n) => n + 1);
  }

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
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />}
    >
      <FormField label="Search" placeholder="Contact name or student name" value={search} onChangeText={setSearch} autoCorrect={false} />
      {loading || (refreshing && contacts.length === 0) ? (
        <LoadingSpinner size="sm" className="py-6" label="Loading contacts…" />
      ) : error ? (
        <ErrorAlert message={error} onRetry={retry} />
      ) : contacts.length === 0 ? (
        <View className={cardClass}>
          <EmptyState icon="fa-address-book" title="No one to message yet" message="You can message parents once you are assigned to a class or made a section adviser." />
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.role} className="gap-2">
            <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {group.label}
            </Text>
            {group.rows.length === 0 ? (
              <View className="rounded-xl bg-surface-subtle px-4 py-3">
                <Text className="text-sm text-fg-muted">
                  {group.role === 'parent' && !search.trim()
                    ? 'No parents yet. A parent appears here once an admin approves their account.'
                    : `No ${group.label.toLowerCase()} match that search.`}
                </Text>
              </View>
            ) : (
              <View className={`${cardClass} overflow-hidden`}>
                {group.rows.map((c, i) => (
                  <Pressable
                    key={c.id}
                    onPress={() => navigation.replace('MessageThread', { otherId: c.id, name: c.name })}
                    accessibilityRole="button"
                    android_ripple={{ color: tokens['edge-strong'] }}
                    className={`flex-row items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-edge-soft' : ''}`}
                    style={ROW}
                  >
                    <Text className="min-w-0 flex-1 text-sm text-fg">
                      {c.role === 'parent' && c.student_name ? (
                        <>
                          <Text className="font-semibold">{c.student_name}</Text>
                          <Text className="text-fg-muted"> — parent: {c.name}</Text>
                        </>
                      ) : (
                        <>
                          <Text className="font-semibold">{c.name}</Text>
                          {c.subject ? <Text className="text-fg-muted"> — {c.subject}</Text> : null}
                        </>
                      )}
                    </Text>
                    {Number(c.unread_count) > 0 ? (
                      <View className="rounded-full bg-primary px-2 py-0.5">
                        <Text className="text-xs font-semibold text-primary-fg">{c.unread_count}</Text>
                      </View>
                    ) : null}
                    <Icon name="fa-chevron-right" size={12} color={tokens['fg-faint']} />
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
