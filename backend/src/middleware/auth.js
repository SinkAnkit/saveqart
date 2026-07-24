const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  // Accept the httpOnly cookie first (preferred), then fall back to the
  // Authorization: Bearer header for backward compatibility / API clients.
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = (req.cookies && req.cookies.sq_token) || bearer;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authRequired };
