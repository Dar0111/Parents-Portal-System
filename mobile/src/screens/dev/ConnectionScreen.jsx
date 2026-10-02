import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { API_BASE_URL, SOCKET_ORIGIN } from '../../api/client';
import extractError from '../../api/extractError';
import Button from '../../components/Button';
import { cardClass } from '../../components/buttonStyles';
import Text from '../../components/Text';

// DEV ONLY — the Expo counterpart of the web's /dev/ui. EVERYTHING under
// src/screens/dev/ resolves to an empty module in a production bundle
// (metro.config.js explains why `__DEV__` alone is not enough), so this file
// holds every dev-only string, the link that opens it included: Login and
// RoleHome render `DevLink` only when the import resolved to a component.
// Grepped absent from `npx expo export` output, with a positive control.
//
// It answers the one question the hotspot proof asks before anything else:
// can THIS phone reach THAT laptop at the URL the bundle was built with.
// `raw: true` because /api/health is not key-shaped on a 503.
//
// The look is the app's (feat/ui-refresh, 2026-10-02) — the shared `Text`,
// the card surface, the shared `Button` — and nothing else changed.
export function DevLink({ navigation }) {
  return (
    <Pressable
      onPress={() => navigation.navigate('Connection')}
      accessibilityRole="link"
      className="mt-2 items-center justify-center"
      style={{ minHeight: 44 }}
    >
      <Text className="text-sm font-semibold text-fg-muted">Connection check (dev)</Text>
    </Pressable>
  );
}

export default function ConnectionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setResult(null);
    const started = Date.now();
    try {
      const res = await api.get('/health', { raw: true });
      setResult({ tone: 'ok', text: `HTTP ${res.status} in ${Date.now() - started} ms\n${JSON.stringify(res.data)}` });
    } catch (err) {
      const status = err?.response?.status;
      setResult({
        tone: 'error',
        text: `${status ? `HTTP ${status}` : err?.code || 'no response'} in ${Date.now() - started} ms\n${extractError(err)}`,
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-page" contentContainerClassName="gap-4 px-4 pb-10" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
      <View>
        <Text accessibilityRole="header" className="font-serif text-lg text-fg">
          Connection check (dev)
        </Text>
        <Text className="mt-1 text-sm text-fg-muted">
          Read from EXPO_PUBLIC_API_URL at bundle time. Change mobile/.env and restart Metro to point elsewhere.
        </Text>
      </View>

      <View className={`${cardClass} p-4`}>
        <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted">API base</Text>
        <Text selectable className="mt-1 text-sm text-fg">{API_BASE_URL}</Text>
        <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">Socket origin</Text>
        <Text selectable className="mt-1 text-sm text-fg">{SOCKET_ORIGIN}</Text>
      </View>

      <Button variant="primary" full loading={checking} onPress={check}>
        {checking ? 'Checking…' : 'GET /api/health'}
      </Button>

      {result ? (
        <View
          className={`rounded-xl border px-4 py-3 ${
            result.tone === 'ok' ? 'border-success-edge bg-success-soft' : 'border-danger-edge bg-danger-soft'
          }`}
        >
          <Text selectable className={`text-sm ${result.tone === 'ok' ? 'text-success-strong' : 'text-danger-strong'}`}>
            {result.text}
          </Text>
        </View>
      ) : null}

      <View className="items-center">
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="flex-row items-center" style={{ minHeight: 48 }}>
          <Text className="text-sm font-semibold text-brand">Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
