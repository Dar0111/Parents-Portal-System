// TEST-ONLY. P4 Part B's network preload, loaded through
// NODE_OPTIONS=--require into every node process of a Part B run (the API, the
// suites, the proofs, and their node children).
//
// Two layers, in this order:
//   1. test-loopback-guard.js, unchanged: any outgoing TCP connection to a host
//      other than the loopback fails at once, before a DNS lookup.
//   2. On top of it, a refusal of the LOOPBACK ports that would reach something
//      that is not this run: 5000 and 3000 (the main checkout's own API and
//      Vite; the laptop's main-checkout API serves the PRODUCTION database,
//      docs/TESTING.md, M18's laptop row), 3306 (the MySQL fallback) and 8081
//      (Metro). Loopback is not the same as isolated.
//
// Pipes and local sockets are left alone. A refusal throws before connecting.
// The connect function underneath this layer (still loopback-guarded) is left
// on the net module under a registered symbol, so p4b-preflight.js can PROBE
// whether 5000 / 3000 are listening without being refused by layer 2.
const net = require('net');

require('./test-loopback-guard');

const DENIED_PORTS = new Set([5000, 3000, 3306, 8081]);
const inner = net.Socket.prototype.connect;

net.Socket.prototype.connect = function p4bDeniedPortsConnect(...args) {
  // net.connect() hands over its already-normalised [options, callback]
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  let port;
  if (first && typeof first === 'object') {
    if (first.path) return inner.apply(this, args);
    port = first.port;
  } else if (typeof first === 'number' || /^\d+$/.test(String(first))) {
    port = first;
  }
  if (port !== undefined && port !== null && DENIED_PORTS.has(Number(port))) {
    throw new Error(`p4b net guard: port ${Number(port)} is not part of this run (refused before connecting)`);
  }
  return inner.apply(this, args);
};

net[Symbol.for('p4b.netGuard')] = { inner, deniedPorts: [...DENIED_PORTS] };
