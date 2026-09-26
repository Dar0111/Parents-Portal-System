import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY, setTokenProvider } from '../api/client';

// THE ONE PLACE THE TOKEN IS KEPT ON THE DEVICE. expo-secure-store — the
// Android Keystore behind SharedPreferences — with an in-memory mirror so the
// request interceptor does not touch the keystore on every call. The mirror is
// filled ONCE at boot (`load`) and afterwards written only through `save` and
// `clear`, so it cannot disagree with the store.
//
// Three writers, exactly as on the web: login, applyToken, and the 401 branch
// in api/client.js (through the provider registered below). Nothing else
// stores, reads or prints a token.
//
// THE LOGOUT REASON LIVES HERE TOO, in memory only — the web used
// sessionStorage, and the phone's equivalent is a module variable that a
// fresh launch does not carry (a fresh launch has no dead session to explain).
// Read once by LoginScreen and cleared by that read.

let cached = null;
let loaded = false;
let logoutReason = '';

export async function load() {
  if (!loaded) {
    try {
      cached = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      // A keystore that refuses to read (a corrupted entry after a device
      // restore) is the same as no token: the user signs in again.
      cached = null;
    }
    loaded = true;
  }
  return cached;
}

export function get() {
  return cached;
}

export async function save(token) {
  cached = token;
  loaded = true;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clear() {
  cached = null;
  loaded = true;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Already gone. The mirror is what the interceptor reads, and it is null.
  }
}

export function storeLogoutReason(text) {
  logoutReason = text || '';
}

// Returns the stored reason (or '') and clears it, so a second visit to Login
// in the same launch does not repeat it.
export function takeLogoutReason() {
  const text = logoutReason;
  logoutReason = '';
  return text;
}

// The interceptor's two hooks. `get` is async-shaped because the provider
// contract is; it resolves from the mirror, which `load()` filled at boot.
setTokenProvider({
  get: async () => (loaded ? cached : load()),
  clear,
});
