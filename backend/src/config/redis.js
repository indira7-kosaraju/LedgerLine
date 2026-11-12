// The Redis connection used for rate-limit counters (only when REDIS_URL is set).
//
// Behaviour when Redis is slow or down: every command fails within COMMAND_TIMEOUT_MS instead of
// waiting – the rate limiters then decide what to do (login/register fail CLOSED, the general API
// limit fails OPEN; see middleware/rateLimiters.js). The client keeps reconnecting in the background.
const { createClient } = require('redis');
const env = require('./env');

const CONNECT_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 1000;
const keyPrefix = env.REDIS_KEY_PREFIX ?? `ll:${env.NODE_ENV}:`;

// Never print a connection string (it can contain a password).
const redact = (message) => String(message).replace(/rediss?:\/\/\S+/gi, '<redis url hidden>');

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let client = null;
let firstReady = null; // resolves when the first connection is up (server.js waits for this at startup)
let firstSettled = null; // resolves on the first connection OR the first error – whichever comes first

if (env.REDIS_URL) {
  client = createClient({
    url: env.REDIS_URL,
    // Fail fast while disconnected instead of queueing commands (and requests) until Redis is back.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 2000),
    },
  });
  let lastLogged = 0;
  client.on('error', (err) => {
    // While Redis is down this fires on every reconnect attempt – log at most every 10 s.
    if (Date.now() - lastLogged > 10_000) {
      lastLogged = Date.now();
      console.error('Redis error:', redact(err.message));
    }
  });
  firstReady = new Promise((resolve) => client.once('ready', resolve));
  firstSettled = Promise.race([firstReady, new Promise((resolve) => client.once('error', resolve))]);
  client.connect().catch(() => {}); // failures are reported through the 'error' event above
}

// The function rate-limit-redis uses for every command. Only a request arriving while the very first
// connection attempt is still under way waits for it (≤ CONNECT_TIMEOUT_MS); once Redis has been seen down,
// commands fail immediately – an outage must not make every request slower.
async function sendCommand(...args) {
  if (!client) throw new Error('Redis is not configured (REDIS_URL is empty)');
  if (!client.isReady) await withTimeout(firstSettled, CONNECT_TIMEOUT_MS, 'Redis connection');
  if (!client.isReady) throw new Error('Redis is not connected');
  return withTimeout(client.sendCommand(args), COMMAND_TIMEOUT_MS, 'Redis command');
}

// Used by the readiness check.
async function ping() {
  const reply = await sendCommand('PING');
  if (reply !== 'PONG') throw new Error('unexpected PING reply');
}

// Used once at startup by server.js.
async function waitUntilReady(ms) {
  if (!client) return false;
  if (client.isReady) return true;
  await withTimeout(firstReady, ms, 'Redis connection');
  return true;
}

// Graceful: lets commands already sent finish (e.g. the counter update after a response); if Redis is
// unreachable, gives up after 1 s and drops the connection.
async function disconnect() {
  if (!client) return;
  // A connection attempt still under way can't be cancelled cleanly – let it finish (or fail) first,
  // otherwise its socket stays open (found by the startup test: Jest never exited).
  if (!client.isReady) await withTimeout(firstSettled, CONNECT_TIMEOUT_MS, 'Redis connection').catch(() => {});
  try {
    if (client.isReady) await withTimeout(client.close(), 1000, 'Redis close');
    else client.destroy(); // still trying to (re)connect: stop the retries
  } catch {
    try {
      client.destroy();
    } catch {
      // already closed
    }
  }
}

module.exports = { configured: Boolean(client), keyPrefix, sendCommand, ping, waitUntilReady, disconnect, redact };
