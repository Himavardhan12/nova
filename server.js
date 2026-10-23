const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const { initSchema, getDb } = require('./db/database');
const { seedIfEmpty } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

initSchema();
try {
  seedIfEmpty();
} catch (e) {
  console.error('Auto-seed failed:', e);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieSession({
  name: 'sp_session',
  keys: [process.env.SESSION_SECRET || 'sunrise-school-secret-2026'],
  maxAge: 8 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax'
}));

app.use((req, res, next) => {
  res.locals.user = (req.session && req.session.user) || null;
  res.locals.currentPath = req.path;
  res.locals.siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));
app.use('/student', require('./routes/student'));

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    user: (req.session && req.session.user) || null
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'Something went wrong. Please try again later.',
    user: (req.session && req.session.user) || null
  });
});

// Start the HTTP server only when run directly (local dev).
// On Vercel the app is imported as a serverless function and must not call listen().
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sunrise Public School portal running at http://localhost:${PORT}`);
  });
}

module.exports = app;
