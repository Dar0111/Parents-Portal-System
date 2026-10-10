// THE STAND-INS FOR loop-messages-thread.mjs (feat/shared-messages, commit 1).
//
// The runner's Vite plugin points four modules here — `api/axios`,
// `auth/AuthContext`, `realtime/SocketProvider` and `realtime/UnreadProvider` —
// so the REAL thread pages run in Chromium with no server, no API, no database
// and no sign-in. Fixtures only, fictional names; nothing leaves the browser.
//
// The scenario comes from the page's own address:
//   ?role=admin|teacher|parent  &unread=<n>  &paged=0|1
// `paged=1` is a thread longer than one page: the first read returns the newest
// 50 of 80 with `has_more`, and "Load earlier messages" asks for the rest.
//
// EVERY VALUE A HOOK HANDS OUT IS CREATED ONCE, HERE. The pages list `user`,
// `subscribe` and `refresh` as effect and callback dependencies; a new object
// per render would re-run their loads for ever.
//
// THE TIMING IS THE POINT: marking read answers after 150 ms and the unread
// refresh after 50 ms, both while the thread's first-load spinner is still up.
// That is the race behind the follow-up's F1 (2026-10-06): a thread with unread
// messages opened at its OLDEST message.
const params = new URLSearchParams(window.location.search);
const ROLE = params.get('role') || 'admin';
const UNREAD = Number(params.get('unread') || 0);
const PAGED = params.get('paged') === '1';

const USERS = {
  1: { id: 1, role: 'admin', name: 'Admin Fixture' },
  2: { id: 2, role: 'teacher', name: 'Teacher Fixture' },
  3: { id: 3, role: 'parent', name: 'Parent Fixture' },
};
const ME = { admin: 1, teacher: 2, parent: 3 }[ROLE];
// Who each role's thread is with: the admin and a parent talk to a teacher,
// the teacher to a parent (so the teacher's "Announce to" shows, as it would).
const OTHER = { admin: 2, teacher: 3, parent: 2 }[ROLE];

export const scenario = Object.freeze({ role: ROLE, me: ME, other: OTHER, unread: UNREAD, paged: PAGED });

const TOTAL = PAGED ? 80 : 30;
const TAIL = PAGED ? 50 : TOTAL;
export const NEWEST_BODY = `Fixture message ${TOTAL}, the newest`;
export const OLDEST_BODY = 'Fixture message 1';

const store = [];
for (let n = 1; n <= TOTAL; n += 1) {
  const unread = n > TOTAL - UNREAD;
  const fromOther = unread || n % 2 === 0;
  const sender = fromOther ? OTHER : ME;
  const receiver = fromOther ? ME : OTHER;
  let body = `Fixture message ${n}`;
  if (n === TOTAL) body = NEWEST_BODY;
  else if (n % 3 === 0) body = `${body}. A longer one, so the bubbles are not all one line: it wraps at the bubble's width the way a real message does.`;
  store.push({
    id: n,
    sender_id: sender,
    receiver_id: receiver,
    sender_name: USERS[sender].name,
    sender_role: USERS[sender].role,
    receiver_name: USERS[receiver].name,
    receiver_role: USERS[receiver].role,
    body,
    read_status: unread ? 0 : 1,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + n * 60_000).toISOString(),
  });
}

// The teacher's thread reads its contacts row for "Announce to a class".
const CONTACTS = [
  { id: 3, role: 'parent', name: 'Parent Fixture', student_name: 'Learner Fixture', student_grade_level: 6, student_section: 'Malikhain', unread_count: 0 },
];

// What the runner reads: requests in flight, read-all calls, unknown requests;
// and how many times this module was evaluated — it must be once, or the pages
// and the entry would hold different counters and hook values.
const loop = { inflight: 0, reads: 0, unknown: [] };
window.__loop = loop;
window.__loopModules = (window.__loopModules || 0) + 1;

function later(ms, value) {
  loop.inflight += 1;
  return new Promise((resolve) => {
    setTimeout(() => {
      loop.inflight -= 1;
      resolve(value);
    }, ms);
  });
}

// The real client's `unwrap`: a key returns that value, a list of keys an
// object of them.
function unwrapped(body, unwrap) {
  if (Array.isArray(unwrap)) return Object.fromEntries(unwrap.map((key) => [key, body[key]]));
  return body[unwrap];
}

function unknown(method, url) {
  loop.unknown.push(`${method} ${url}`);
  return Promise.reject(new Error(`loop stand-in: no fixture for ${method} ${url}`));
}

const api = {
  get(url, options = {}) {
    if (url === `/messages/with/${OTHER}`) {
      const before = Number(options.params?.before) || null;
      const rows = before ? store.filter((m) => m.id < before) : store.slice(-TAIL);
      const hasMore = before ? false : store.length > TAIL;
      return later(30, unwrapped({ messages: rows.map((m) => ({ ...m })), page: { has_more: hasMore } }, options.unwrap));
    }
    if (url === '/messages/contacts') return later(30, unwrapped({ contacts: CONTACTS }, options.unwrap));
    return unknown('GET', url);
  },
  patch(url, ...rest) {
    const options = rest[1] || {};
    if (url === `/messages/read-all/${OTHER}`) {
      loop.reads += 1;
      let count = 0;
      for (const m of store) {
        if (m.receiver_id === ME && !m.read_status) {
          m.read_status = 1;
          count += 1;
        }
      }
      return later(150, unwrapped({ count }, options.unwrap));
    }
    return unknown('PATCH', url);
  },
  // Nothing in this loop sends; a send would be a request with no fixture.
  post(url) {
    return unknown('POST', url);
  },
};

export default api;
export const fetchAll = (url, options) => api.get(url, options);
export const listParams = (values) => values;

const AUTH = Object.freeze({ user: Object.freeze({ id: ME, role: ROLE, name: USERS[ME].name }) });
export function useAuth() {
  return AUTH;
}

const listeners = new Set();
const SOCKET = Object.freeze({
  connected: true,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
});
export function useSocket() {
  return SOCKET;
}

const UNREAD_COUNTS = Object.freeze({ refresh: () => later(50, undefined) });
export function useUnread() {
  return UNREAD_COUNTS;
}
