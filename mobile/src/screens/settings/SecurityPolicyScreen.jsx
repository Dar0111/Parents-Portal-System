import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import api from '../../api/client';
import extractError from '../../api/extractError';
import { cardClass } from '../../components/buttonStyles';
import ErrorAlert from '../../components/ErrorAlert';
import Skeleton, { SkeletonBar } from '../../components/Skeleton';
import Text from '../../components/Text';
import { timestampDay } from '../../format/date';
import useSkeleton from '../../hooks/useSkeleton';
import Reveal from '../../motion/Reveal';
import { useTheme } from '../../theme/ThemeProvider';

// SETTINGS → SECURITY & POLICY on the phone (feat/privacy, 2026-10-10; MOBILE
// M26) — every role, the web's section (FRONTEND §29) on the phone's row-push
// Settings. The current Data Privacy Notice and Terms of Use, and the date
// THIS user accepted each. Every role accepts since feat/staff-acceptance
// (2026-10-11), so the server's `required` is true for staff too and they see
// their own dates; the `required: false` branch (the documents, and that
// parents accept them — never a "Not accepted" that reads as something owed)
// stays for a role that ever accepts nothing.
//
// The dates are the server's (GET /api/policy/status), shown as the Manila
// calendar day (format/date.js, a mirror) — never computed here. A first load
// shows Build 2's skeleton; a pull keeps what is on screen and shows the
// pull's own indicator (M23).

function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

export default function SecurityPolicyScreen() {
  const { tokens } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const read = useCallback(async () => {
    const [documents, status] = await Promise.all([
      api.get('/policy', { unwrap: 'documents' }),
      api.get('/policy/status', { unwrap: ['required', 'acceptances'] }),
    ]);
    return { documents, status };
  }, []);

  useEffect(() => {
    let live = true;
    read()
      .then((next) => {
        if (live) setData(next);
      })
      .catch((err) => {
        if (live) setError(extractError(err));
      });
    return () => {
      live = false;
    };
  }, [read]);

  const loading = !data && !error;
  const phase = useSkeleton(loading);

  async function reread() {
    setRefreshing(true);
    try {
      setData(await read());
      setError(null);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setRefreshing(false);
    }
  }

  function retry() {
    setError(null);
    setData(null);
    read()
      .then(setData)
      .catch((err) => setError(extractError(err)));
  }

  const required = Boolean(data?.status?.required);
  const acceptedAt = (document) => data?.status?.acceptances?.find((a) => a.document === document)?.accepted_at || null;

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerClassName="gap-3 p-4 pb-10"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={reread} tintColor={tokens['fg-muted']} colors={[tokens.brand]} />
      }
    >
      <Reveal>
        <View className={`${cardClass} gap-5 p-5`}>
          <View>
            <Text accessibilityRole="header" className="font-serif text-lg text-fg">
              Security & policy
            </Text>
            <Text className="mt-1 text-sm text-fg-muted">
              {required
                ? 'The school’s Data Privacy Notice and Terms of Use, and when you accepted each.'
                : 'The school’s Data Privacy Notice and Terms of Use. Parents accept them before using the portal.'}
            </Text>
          </View>

          {error && !data ? (
            <ErrorAlert message={error} onRetry={retry} />
          ) : loading ? (
            <Skeleton phase={phase} label="Loading the documents…">
              <View className="gap-6">
                {[0, 1].map((i) => (
                  <View key={i} className="gap-2">
                    <SkeletonBar className="h-5 w-48" />
                    <SkeletonBar className="h-4 w-40" />
                    <SkeletonBar className="h-24 w-full" round="rounded-lg" />
                  </View>
                ))}
              </View>
            </Skeleton>
          ) : (
            data.documents.map((doc) => {
              const at = acceptedAt(doc.document);
              return (
                <View key={doc.document}>
                  <Text accessibilityRole="header" className="font-serif text-base text-fg">
                    {doc.title}
                  </Text>
                  {required ? (
                    <Text className="mt-0.5 text-sm text-fg-muted">
                      {at ? `Accepted on ${timestampDay(at, { style: 'long' })}` : 'Not accepted yet'}
                    </Text>
                  ) : null}
                  <View className="mt-2 gap-3 rounded-lg border border-edge bg-surface-subtle p-4">
                    {paragraphs(doc.text).map((p, i) => (
                      <Text key={i} className="text-sm text-fg-body">
                        {p}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </Reveal>
    </ScrollView>
  );
}
