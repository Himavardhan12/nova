const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDb, CLASSES, getFeeSummary } = require('../db/database');

router.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('index', { title: 'Sunrise Public School', classes: CLASSES });
});

router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

router.get('/terms', (req, res) => {
  res.render('terms', { title: 'Terms and Conditions' });
});

router.get('/login', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
    return res.redirect('/student/dashboard');
  }
  res.render('login', { title: 'Login', error: req.query.error || null });
});

router.post('/login', (req, res) => {
  const { role, username, password } = req.body;
  const db = getDb();

  if (!username || !password) {
    return res.render('login', { title: 'Login', error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { title: 'Login', error: 'Invalid username or password.' });
  }

  if (user.role !== role) {
    const msg = role === 'admin'
      ? 'This account is not a staff account. Please use the Student Login tab.'
      : 'This account is not a student account. Please use the Staff Login tab.';
    return res.render('login', { title: 'Login', error: msg });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    studentId: user.student_id || null
  };

  if (user.role === 'admin') return res.redirect('/admin/dashboard');
  return res.redirect('/student/dashboard');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
