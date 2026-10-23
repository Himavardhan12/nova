function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.redirect('/login?error=Please+login+as+staff');
}

function ensureStudent(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'student') return next();
  return res.redirect('/login?error=Please+login+as+student');
}

function ensureAny(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login?error=Please+login+first');
}

module.exports = { ensureAdmin, ensureStudent, ensureAny };
