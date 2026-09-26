import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { API_BASE_URL, SOCKET_ORIGIN } from '../../api/client';
import extractError from '../../api/extractError';

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
export function DevLink({ navigation }) {
  return (
    <Pressable onPress={() => navigation.navigate('Connection')} accessibilityRole="link" className="mt-4 items-center">
      <Text className="text-sm font-medium text-fg-muted">Connection check (dev)</Text>
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
    <ScrollView className="flex-1 bg-page" contentContainerClassName="px-4 pb-10" contentContainerStyle={{ paddingTop: insets.top + 16 }}>
      <Text className="text-lg font-semibold text-fg">Connection check (dev)</Text>
      <Text className="mt-1 text-sm text-fg-muted">
        Read from EXPO_PUBLIC_API_URL at bundle time. Change mobile/.env and restart Metro to point elsewhere.
      </Text>

      <View className="mt-4 rounded-xl border border-edge bg-surface p-4">
        <Text className="text-xs font-medium uppercase text-fg-muted">API base</Text>
        <Text selectable className="mt-1 text-sm text-fg">{API_BASE_URL}</Text>
        <Text className="mt-3 text-xs font-medium uppercase text-fg-muted">Socket origin</Text>
        <Text selectable className="mt-1 text-sm text-fg">{SOCKET_ORIGIN}</Text>
      </View>

      <Pressable
        onPress={check}
        disabled={checking}
        accessibilityRole="button"
        className={`mt-4 items-center rounded-lg bg-primary px-3 py-3 ${checking ? 'opacity-60' : ''}`}
      >
        <Text className="text-sm font-medium text-primary-fg">{checking ? 'Checking…' : 'GET /api/health'}</Text>
      </Pressable>

      {result ? (
        <View
          className={`mt-4 rounded-lg border px-4 py-3 ${
            result.tone === 'ok' ? 'border-success-edge bg-success-soft' : 'border-danger-edge bg-danger-soft'
          }`}
        >
          <Text selectable className={`text-sm ${result.tone === 'ok' ? 'text-success-strong' : 'text-danger-strong'}`}>
            {result.text}
          </Text>
        </View>
      ) : null}

      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" className="mt-6 items-center">
        <Text className="text-sm font-medium text-brand">Back</Text>
      </Pressable>
    </ScrollView>
  );
}
