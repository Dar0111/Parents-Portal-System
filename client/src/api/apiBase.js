// THE API BASE URL, decided in one place (feat/lan-web, 2026-10-01) — used by
// api/axios.js (every request, and through it every photo address), and by
// realtime/SocketProvider.jsx (the socket's origin). Before this each of them
// read VITE_API_BASE_URL with its own 'http://localhost:5000/api' fallback.
//
// 1. VITE_API_BASE_URL, when it is set (non-blank), wins — exactly as before.
// 2. Otherwise it is DERIVED FROM THE PAGE'S OWN ADDRESS: the same protocol
//    and host the page was loaded from, port 5000, '/api'. So:
//      http://localhost:3000     → http://localhost:5000/api   (as today)
//      http://192.168.x.y:3000   → http://192.168.x.y:5000/api (a phone's
//                                  Chrome on the LAN — no .env edit, and it
//                                  follows the laptop's IP when that changes)
// 3. With no page at all (an SSR proof under Node), the old default.
//
// PURE: `resolveApiBase(envValue, location)` takes both as arguments, so the
// proof can drive every case without a browser.
export const API_PORT = 5000;
const FALLBACK = `http://localhost:${API_PORT}/api`;

export function resolveApiBase(envValue, location) {
  if (typeof envValue === 'string' && envValue.trim()) return envValue.trim();
  const protocol = location && typeof location.protocol === 'string' ? location.protocol : '';
  const hostname = location && typeof location.hostname === 'string' ? location.hostname : '';
  if ((protocol === 'http:' || protocol === 'https:') && hostname) {
    return `${protocol}//${hostname}:${API_PORT}/api`;
  }
  return FALLBACK;
}

export const API_BASE_URL = resolveApiBase(
  import.meta.env.VITE_API_BASE_URL,
  typeof window !== 'undefined' ? window.location : null
);

// The socket attaches to the HTTP server root, not the /api mount.
export const SOCKET_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
