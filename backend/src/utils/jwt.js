const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'ledgerline';
const AUDIENCE = 'ledgerline-api';
// Pin the algorithm so an attacker can't switch it (e.g. to "none").
const ALGORITHM = 'HS256';

// `sv` = the user's sessionVersion when the token was issued. authenticate() rejects the
// token as soon as the stored version is higher (after logout or a status change).
function signAccessToken(user) {
  if (!Number.isInteger(user.sessionVersion)) throw new Error('signAccessToken needs user.sessionVersion');
  return jwt.sign({ role: user.role, sv: user.sessionVersion }, env.JWT_SECRET, {
    subject: user.id, // "sub" claim = user id
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: ALGORITHM,
  });
}

// Throws if the token is invalid, expired, or signed with another secret.
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALGORITHM],
  });
}

module.exports = { signAccessToken, verifyAccessToken };
