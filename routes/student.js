const express = require('express');
const router = express.Router();
const { ensureStudent } = require('../middleware/auth');
const { getDb, getFeeSummary, calculateGrade, gradePoint, subjectsForClass } = require('../db/database');

router.use(ensureStudent);

const AY = '2025-26';

function loadStudent(req) {
  const db = getDb();
  return db.prepare(`
    SELECT s.*, r.route_name, r.stops, r.monthly_fee
    FROM students s LEFT JOIN transport_routes r ON r.id = s.transport_route_id
    WHERE s.id = ?`).get(req.session.user.studentId);
}

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const fee = getFeeSummary(db, student.id, AY);
  const openComplaints = db.prepare(`SELECT COUNT(*) c FROM complaints WHERE student_id = ? AND status != 'resolved'`).get(student.id).c;
  const enrolledCount = db.prepare('SELECT COUNT(*) c FROM student_activities WHERE student_id = ?').get(student.id).c;
  const marksCount = db.prepare('SELECT COUNT(*) c FROM marks WHERE student_id = ?').get(student.id).c;
  res.render('student/dashboard', { title: 'My Dashboard', student, fee, openComplaints, enrolledCount, marksCount });
});

router.get('/profile', (req, res) => {
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  res.render('student/profile', { title: 'My Profile', student });
});

router.get('/fees', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const fee = getFeeSummary(db, student.id, AY);
  const payments = db.prepare(`
    SELECT p.*, a.name as activity_name FROM fee_payments p
    LEFT JOIN activities a ON a.id = p.activity_id
    WHERE p.student_id = ? ORDER BY p.id DESC`).all(student.id);
  res.render('student/fees', { title: 'Fee Details', student, fee, payments });
});

router.get('/academics', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const exams = db.prepare('SELECT * FROM exams ORDER BY id').all();
  const marks = db.prepare(`
    SELECT m.*, e.name as exam_name FROM marks m
    JOIN exams e ON e.id = m.exam_id
    WHERE m.student_id = ? ORDER BY e.id, m.subject`).all(student.id);

  const examReports = exams.map(e => {
    const exMarks = marks.filter(m => m.exam_id === e.id);
    if (!exMarks.length) return { exam: e, subjects: [], total: null, pct: null, grade: null, rank: null };
    const total = exMarks.reduce((s, m) => s + (m.marks_obtained || 0), 0);
    const max = exMarks.reduce((s, m) => s + m.max_marks, 0);
    const pct = max ? (total / max) * 100 : 0;

    const classmates = db.prepare(`
      SELECT student_id, SUM(marks_obtained) as t, SUM(max_marks) as mx
      FROM marks WHERE exam_id = ? GROUP BY student_id
      HAVING mx = (SELECT SUM(max_marks) FROM marks WHERE exam_id = ? AND student_id = ?)
      `).all(e.id, e.id, student.id);
    let rank = null;
    if (classmates.length) {
      classmates.sort((a, b) => b.t - a.t);
      rank = classmates.findIndex(r => r.student_id === student.id) + 1;
    }
    return { exam: e, subjects: exMarks, total, pct: pct.toFixed(1), grade: calculateGrade(total, max), rank };
  });

  const overall = marks.length ? (() => {
    const total = marks.reduce((s, m) => s + (m.marks_obtained || 0), 0);
    const max = marks.reduce((s, m) => s + m.max_marks, 0);
    return { total, max, pct: ((total / max) * 100).toFixed(1), grade: calculateGrade(total, max) };
  })() : null;

  res.render('student/academics', { title: 'Academic Performance', student, examReports, overall });
});

router.get('/activities', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const enrolled = db.prepare(`
    SELECT sa.*, a.name, a.fee, a.description,
      (SELECT COALESCE(SUM(amount),0) FROM fee_payments p
       WHERE p.student_id = sa.student_id AND p.activity_id = sa.activity_id AND p.category = 'activity') as paid
    FROM student_activities sa JOIN activities a ON a.id = sa.activity_id
    WHERE sa.student_id = ?`).all(student.id);
  res.render('student/activities', { title: 'Extra Activities', student, enrolled });
});

router.get('/transport', (req, res) => {
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const db = getDb();
  const fee = getFeeSummary(db, student.id, AY);
  res.render('student/transport', { title: 'Transport', student, fee });
});

router.get('/complaints', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const complaints = db.prepare('SELECT * FROM complaints WHERE student_id = ? ORDER BY id DESC').all(student.id);
  res.render('student/complaints', { title: 'My Complaints', student, complaints, success: req.query.success });
});

router.post('/complaints/new', (req, res) => {
  const db = getDb();
  const student = loadStudent(req);
  if (!student) return res.redirect('/login');
  const { title, description, category } = req.body;
  if (title && title.trim()) {
    db.prepare('INSERT INTO complaints (student_id, title, description, category) VALUES (?, ?, ?, ?)')
      .run(student.id, title.trim(), description || null, category || 'other');
    return res.redirect('/student/complaints?success=1');
  }
  res.redirect('/student/complaints');
});

module.exports = router;
