const express = require('express');
const session = require('express-session');
const path = require('path');
const { initSchema } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

initSchema();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'sunrise-school-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
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
    user: req.session.user || null
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'Something went wrong. Please try again later.',
    user: req.session.user || null
  });
});

app.listen(PORT, () => {
  console.log(`Sunrise Public School portal running at http://localhost:${PORT}`);
});

module.exports = app;
