const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SESSION_COOKIE = 'll_session';

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript in the browser can never read this cookie (protects against XSS token theft)
    secure: env.NODE_ENV === 'production', // HTTPS only in production (local dev runs on plain http)
    sameSite: 'strict', // not sent on requests started by other sites (CSRF protection)
    path: '/api', // only sent to the API, not to other paths
  };
}

// Stores the JWT in an HttpOnly cookie that expires exactly when the token does.
function setSessionCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: new Date(exp * 1000) });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

module.exports = { SESSION_COOKIE, setSessionCookie, clearSessionCookie };
