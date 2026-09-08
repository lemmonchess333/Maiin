// Local verification only: refuse TCP/TLS connections before any socket opens.
// Unix-domain IPC remains available to the test runner and tsx.
const net = require('node:net');
const tls = require('node:tls');
const original = net.Socket.prototype.connect;
function denied() {
  const error = new Error('Outbound TCP disabled for offline verification');
  error.code = 'ERR_TEST_NETWORK_DISABLED';
  throw error;
}
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const ipc = (first && typeof first === 'object' && typeof first.path === 'string') ||
    (typeof first === 'string' && !/^\d+$/.test(first));
  if (!ipc) return denied();
  return original.apply(this, args);
};
tls.connect = denied;
