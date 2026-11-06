const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'ledgerline';
const AUDIENCE = 'ledgerline-api';
// Pin the algorithm so an attacker can't switch it (e.g. to "none").
const ALGORITHM = 'HS256';

function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
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
