// TEST-ONLY. A preload (NODE_OPTIONS=--require) that makes every TCP listen in
// the process bind 127.0.0.1, whatever host the caller gave or left out.
//
// server.js calls httpServer.listen(PORT, cb) with no host, and Node then
// listens on every interface. A gate that starts the API itself (D-312,
// scripts/test-account-delete.js --gate) loads this next to the network guard
// (migration/scripts/p4b-net-guard.js), so its API is reachable from this
// machine alone. server.js itself is not changed.
//
// Pipes and named sockets (a `path`), an inherited handle or fd, and listen()
// with no port at all are left alone. Loaded once per process; a second load
// is a no-op.
const net = require('net');

const MARK = Symbol.for('d312.listenLoopback');

if (!net[MARK]) {
  const original = net.Server.prototype.listen;
  const HOST = '127.0.0.1';

  net.Server.prototype.listen = function loopbackListen(...args) {
    const first = args[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      // listen(options[, cb])
      if (first.path === undefined && first.handle === undefined && first.fd === undefined && first._handle === undefined) {
        args[0] = { ...first, host: HOST };
      }
    } else if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
      // listen(port[, host][, backlog][, cb])
      if (typeof args[1] === 'string') args[1] = HOST;
      else args.splice(1, 0, HOST);
    }
    return original.apply(this, args);
  };

  net[MARK] = { host: HOST };
}
