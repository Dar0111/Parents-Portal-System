// TEST-ONLY. Loaded through NODE_OPTIONS=--require by test-drop-staging-schema.js
// and test-smoke-live.js into every process they start — and, through the
// same environment, into those processes' own node children (Playwright and
// its workers): any outgoing TCP connection to a host other than the loopback
// fails at once, before a DNS lookup. No run of those tests can reach the
// Supabase project, whatever the script under test gets wrong. Pipes and
// local sockets are left alone. Each test proves the guard is live with a
// positive control before it relies on it.
const net = require('net');

const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function loopbackOnlyConnect(...args) {
  // net.connect() hands over its already-normalised [options, callback]
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  let host;
  if (first && typeof first === 'object') {
    if (first.path) return original.apply(this, args);
    host = first.host;
  } else if (typeof first === 'number' || /^\d+$/.test(String(first))) {
    host = typeof args[1] === 'string' ? args[1] : undefined;
  } else {
    return original.apply(this, args);
  }
  if (host !== undefined && host !== null && host !== '' && !LOOPBACK.has(String(host).toLowerCase())) {
    throw new Error('blocked by the test loopback guard: a connection off the loopback');
  }
  return original.apply(this, args);
};
