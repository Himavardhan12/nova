const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { ensureAdmin } = require('../middleware/auth');
const {
  getDb, CLASSES, subjectsForClass, calculateGrade,
  nextStudentCode, getFeeSummary
} = require('../db/database');

router.use(ensureAdmin);

const AY = '2025-26';

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const stats = {
    totalStudents: db.prepare('SELECT COUNT(*) c FROM students WHERE active = 1').get().c,
    byClass: db.prepare('SELECT class, COUNT(*) c FROM students WHERE active = 1 GROUP BY class').all(),
    totalCollected: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM fee_payments WHERE academic_year = ?`).get(AY).s,
    openComplaints: db.prepare(`SELECT COUNT(*) c FROM complaints WHERE status != 'resolved'`).get().c,
    totalComplaints: db.prepare('SELECT COUNT(*) c FROM complaints').get().c,
    pendingStudents: db.prepare(`
      SELECT s.id, s.student_code, s.name, s.class FROM students s
      WHERE s.active = 1 AND (
        SELECT COALESCE(SUM(p.amount),0) FROM fee_payments p
        WHERE p.student_id = s.id AND p.academic_year = ?) <
        (SELECT COALESCE(fs.tuition_fee,0) FROM fee_structures fs
         WHERE fs.class = s.class AND fs.academic_year = ?)
      LIMIT 6`).all(AY, AY),
    recentPayments: db.prepare(`
      SELECT p.*, s.name, s.student_code, s.class FROM fee_payments p
      JOIN students s ON s.id = p.student_id
      ORDER BY p.id DESC LIMIT 6`).all(),
    recentComplaints: db.prepare(`
      SELECT c.*, s.name, s.student_code FROM complaints c
      JOIN students s ON s.id = c.student_id
      ORDER BY c.id DESC LIMIT 5`).all()
  };
  res.render('admin/dashboard', { title: 'Admin Dashboard', stats, classes: CLASSES });
});

router.get('/students', (req, res) => {
  const db = getDb();
  const { q, class: cls } = req.query;
  let sql = 'SELECT * FROM students WHERE active = 1';
  const params = [];
  if (cls) { sql += ' AND class = ?'; params.push(cls); }
  if (q) { sql += ' AND (name LIKE ? OR student_code LIKE ? OR parent_phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY class, name';
  const students = db.prepare(sql).all(...params);
  res.render('admin/students', { title: 'Students', students, classes: CLASSES, q: q || '', selectedClass: cls || '' });
});

router.get('/students/new', (req, res) => {
  const db = getDb();
  const routes = db.prepare('SELECT * FROM transport_routes WHERE active = 1').all();
  res.render('admin/student-form', {
    title: 'Add Student', student: null, classes: CLASSES, routes,
    nextCode: nextStudentCode(db)
  });
});

router.post('/students/new', (req, res) => {
  const db = getDb();
  const b = req.body;
  if (!b.name || !b.class) {
    const routes = db.prepare('SELECT * FROM transport_routes WHERE active = 1').all();
    return res.render('admin/student-form', {
      title: 'Add Student', student: { ...b }, classes: CLASSES, routes,
      nextCode: nextStudentCode(db), error: 'Name and class are required.'
    });
  }
  const code = nextStudentCode(db);
  const info = db.prepare(`
    INSERT INTO students (student_code, name, dob, gender, class, section, admission_date, address,
      parent_name, parent_phone, guardian_name, guardian_phone, email, blood_group,
      transport_route_id, pickup_point)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    code, b.name.trim(), b.dob || null, b.gender || null, b.class, b.section || 'A',
    b.admission_date || new Date().toISOString().slice(0, 10), b.address || null,
    b.parent_name || null, b.parent_phone || null, b.guardian_name || null, b.guardian_phone || null,
    b.email || null, b.blood_group || null, b.transport_route_id ? Number(b.transport_route_id) : null,
    b.pickup_point || null
  );
  const sid = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, ?, ?)')
    .run(code, bcrypt.hashSync('654321', 10), 'student', sid);
  res.redirect(`/admin/students/${sid}`);
});

router.get('/students/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const student = db.prepare(`
    SELECT s.*, r.route_name, r.stops, r.monthly_fee
    FROM students s LEFT JOIN transport_routes r ON r.id = s.transport_route_id
    WHERE s.id = ?`).get(id);
  if (!student) return res.status(404).render('error', { title: 'Not Found', message: 'Student not found.', user: req.session.user });

  const fee = getFeeSummary(db, id, AY);
  const payments = db.prepare(`
    SELECT p.*, a.name as activity_name FROM fee_payments p
    LEFT JOIN activities a ON a.id = p.activity_id
    WHERE p.student_id = ? ORDER BY p.id DESC`).all(id);
  const marks = db.prepare(`
    SELECT m.*, e.name as exam_name FROM marks m
    JOIN exams e ON e.id = m.exam_id
    WHERE m.student_id = ? ORDER BY e.id, m.subject`).all(id);
  const exams = db.prepare('SELECT * FROM exams ORDER BY id').all();
  const enrolled = db.prepare(`
    SELECT sa.*, a.name, a.fee FROM student_activities sa
    JOIN activities a ON a.id = sa.activity_id WHERE sa.student_id = ?`).all(id);
  const activities = db.prepare('SELECT * FROM activities').all();
  const complaints = db.prepare('SELECT * FROM complaints WHERE student_id = ? ORDER BY id DESC').all(id);

  const examStats = exams.map(e => {
    const exMarks = marks.filter(m => m.exam_id === e.id);
    if (!exMarks.length) return { ...e, avg: null, grade: null };
    const total = exMarks.reduce((s, m) => s + (m.marks_obtained || 0), 0);
    const max = exMarks.reduce((s, m) => s + m.max_marks, 0);
    const pct = max ? (total / max) * 100 : 0;
    return { ...e, avg: pct.toFixed(1), grade: calculateGrade(total, max) };
  });

  res.render('admin/student-profile', {
    title: student.name, student, fee, payments, marks, exams, examStats,
    enrolled, activities, complaints
  });
});

router.get('/students/:id/edit', (req, res) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(Number(req.params.id));
  if (!student) return res.status(404).render('error', { title: 'Not Found', message: 'Student not found.', user: req.session.user });
  const routes = db.prepare('SELECT * FROM transport_routes WHERE active = 1').all();
  res.render('admin/student-form', { title: 'Edit Student', student, classes: CLASSES, routes, nextCode: null });
});

router.post('/students/:id/edit', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE students SET name=?, dob=?, gender=?, class=?, section=?, admission_date=?, address=?,
      parent_name=?, parent_phone=?, guardian_name=?, guardian_phone=?, email=?, blood_group=?,
      transport_route_id=?, pickup_point=? WHERE id=?`).run(
    b.name, b.dob || null, b.gender || null, b.class, b.section || 'A', b.admission_date || null,
    b.address || null, b.parent_name || null, b.parent_phone || null, b.guardian_name || null,
    b.guardian_phone || null, b.email || null, b.blood_group || null,
    b.transport_route_id ? Number(b.transport_route_id) : null, b.pickup_point || null, id
  );
  res.redirect(`/admin/students/${id}`);
});

router.post('/students/:id/delete', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.redirect('/admin/students');
});

router.get('/students/:id/fees', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) return res.status(404).render('error', { title: 'Not Found', message: 'Student not found.', user: req.session.user });
  const fee = getFeeSummary(db, id, AY);
  const payments = db.prepare(`
    SELECT p.*, a.name as activity_name FROM fee_payments p
    LEFT JOIN activities a ON a.id = p.activity_id
    WHERE p.student_id = ? ORDER BY p.id DESC`).all(id);
  const nextReceipt = 2000 + db.prepare('SELECT COUNT(*) c FROM fee_payments').get().c;
  res.render('admin/student-fees', { title: `Fees - ${student.name}`, student, fee, payments, nextReceipt, success: req.query.success });
});

router.post('/students/:id/fees/pay', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const { category, amount, payment_date, mode, receipt_no, activity_id, notes } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt <= 0 || !['tuition', 'transport', 'activity'].includes(category)) {
    return res.redirect(`/admin/students/${id}/fees?error=Invalid+payment+details`);
  }
  db.prepare(`INSERT INTO fee_payments (student_id, category, amount, payment_date, mode, receipt_no, academic_year, activity_id, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, category, amt, payment_date || new Date().toISOString().slice(0, 10),
    mode || 'cash', receipt_no || null, AY, activity_id ? Number(activity_id) : null,
    notes || null, req.session.user.id
  );
  res.redirect(`/admin/students/${id}/fees?success=1`);
});

router.get('/students/:id/marks', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) return res.status(404).render('error', { title: 'Not Found', message: 'Student not found.', user: req.session.user });
  const exams = db.prepare('SELECT * FROM exams ORDER BY id').all();
  const marks = db.prepare('SELECT * FROM marks WHERE student_id = ?').all(id);
  const subjects = subjectsForClass(student.class);
  res.render('admin/student-marks', { title: `Marks - ${student.name}`, student, exams, marks, subjects, success: req.query.success });
});

router.post('/students/:id/marks', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const { exam_id, entries } = req.body;
  if (entries && typeof entries === 'object') {
    const up = db.prepare(`INSERT OR REPLACE INTO marks (student_id, exam_id, subject, marks_obtained, max_marks)
      VALUES (?, ?, ?, ?, ?)`);
    Object.entries(entries).forEach(([subject, val]) => {
      if (val !== '' && val !== null && !isNaN(Number(val))) {
        up.run(id, Number(exam_id), subject, Number(val), 100);
      }
    });
  }
  res.redirect(`/admin/students/${id}/marks?success=1`);
});

router.post('/students/:id/activities', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const { activity_id } = req.body;
  if (activity_id) {
    db.prepare(`INSERT OR IGNORE INTO student_activities (student_id, activity_id, enrolled_date)
      VALUES (?, ?, ?)`).run(id, Number(activity_id), new Date().toISOString().slice(0, 10));
  }
  res.redirect(`/admin/students/${id}`);
});

router.post('/students/:id/activities/:aid/remove', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM student_activities WHERE student_id = ? AND activity_id = ?')
    .run(Number(req.params.id), Number(req.params.aid));
  res.redirect(`/admin/students/${req.params.id}`);
});

router.get('/fees', (req, res) => {
  const db = getDb();
  const students = db.prepare('SELECT * FROM students WHERE active = 1 ORDER BY class, name').all();
  const rows = students.map(s => {
    const fee = getFeeSummary(db, s.id, AY);
    return { student: s, fee };
  });
  const totals = rows.reduce((acc, r) => {
    acc.due += r.fee.totalDue; acc.paid += r.fee.totalPaid; acc.remaining += r.fee.remaining;
    return acc;
  }, { due: 0, paid: 0, remaining: 0 });
  res.render('admin/fees', { title: 'Fee Report', rows, totals, classes: CLASSES });
});

router.get('/complaints', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `SELECT c.*, s.name, s.student_code, s.class FROM complaints c
    JOIN students s ON s.id = c.student_id`;
  const params = [];
  if (status) { sql += ' WHERE c.status = ?'; params.push(status); }
  sql += ` ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, c.id DESC`;
  const complaints = db.prepare(sql).all(...params);
  res.render('admin/complaints', { title: 'Complaints', complaints, selectedStatus: status || '' });
});

router.post('/complaints/:id/update', (req, res) => {
  const db = getDb();
  const { status, admin_remark } = req.body;
  if (status === 'resolved') {
    db.prepare(`UPDATE complaints SET status = ?, admin_remark = ?, resolved_at = datetime('now','localtime') WHERE id = ?`)
      .run(status, admin_remark || null, Number(req.params.id));
  } else {
    db.prepare('UPDATE complaints SET status = ?, admin_remark = ? WHERE id = ?')
      .run(status, admin_remark || null, Number(req.params.id));
  }
  res.redirect('/admin/complaints');
});

router.get('/transport', (req, res) => {
  const db = getDb();
  const routes = db.prepare(`
    SELECT r.*, (SELECT COUNT(*) FROM students s WHERE s.transport_route_id = r.id AND s.active = 1) as student_count
    FROM transport_routes r WHERE r.active = 1`).all();
  const students = db.prepare(`
    SELECT s.id, s.student_code, s.name, s.class, s.pickup_point, r.route_name
    FROM students s JOIN transport_routes r ON r.id = s.transport_route_id
    WHERE s.active = 1 ORDER BY r.route_name, s.name`).all();
  res.render('admin/transport', { title: 'Transport', routes, students });
});

router.post('/transport/new', (req, res) => {
  const db = getDb();
  const { route_name, stops, monthly_fee } = req.body;
  if (route_name) {
    db.prepare('INSERT INTO transport_routes (route_name, stops, monthly_fee) VALUES (?, ?, ?)')
      .run(route_name, stops || null, parseFloat(monthly_fee) || 0);
  }
  res.redirect('/admin/transport');
});

router.get('/activities', (req, res) => {
  const db = getDb();
  const activities = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM student_activities sa WHERE sa.activity_id = a.id) as enrolled_count
    FROM activities a`).all();
  res.render('admin/activities', { title: 'Activities', activities });
});

module.exports = router;
