const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// On Vercel the deployment filesystem is read-only; /tmp is the only writable location.
// Locally we keep the database next to the code in db/.
function resolveDbPath() {
  if (process.env.VERCEL || process.env.DB_PATH) {
    return process.env.DB_PATH || path.join('/tmp', 'school.db');
  }
  return path.join(__dirname, 'school.db');
}

const DB_PATH = resolveDbPath();
let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON;');
  }
  return db;
}

const CLASSES = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10 (SSLC)'
];

const SUBJECTS_BY_CLASS = {
  primary: ['English', 'Kannada', 'Mathematics', 'EVS', 'Drawing'],
  middle: ['English', 'Kannada', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Computer'],
  high: ['English', 'Kannada', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Computer', 'Physical Education']
};

function subjectsForClass(cls) {
  const n = classNumber(cls);
  if (cls === 'Nursery' || cls === 'LKG' || cls === 'UKG' || n <= 5) return SUBJECTS_BY_CLASS.primary;
  if (n <= 8) return SUBJECTS_BY_CLASS.middle;
  return SUBJECTS_BY_CLASS.high;
}

function classNumber(cls) {
  const m = cls.match(/Class (\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function initSchema() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','student')),
      student_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      class TEXT NOT NULL,
      section TEXT DEFAULT 'A',
      admission_date TEXT,
      address TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      guardian_name TEXT,
      guardian_phone TEXT,
      email TEXT,
      blood_group TEXT,
      transport_route_id INTEGER,
      pickup_point TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (transport_route_id) REFERENCES transport_routes(id)
    );

    CREATE TABLE IF NOT EXISTS transport_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      stops TEXT,
      monthly_fee REAL NOT NULL DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fee_structures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class TEXT NOT NULL,
      academic_year TEXT NOT NULL DEFAULT '2025-26',
      tuition_fee REAL NOT NULL DEFAULT 0,
      UNIQUE(class, academic_year)
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('tuition','transport','activity')),
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      mode TEXT DEFAULT 'cash',
      receipt_no TEXT,
      academic_year TEXT DEFAULT '2025-26',
      activity_id INTEGER,
      notes TEXT,
      recorded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year TEXT DEFAULT '2025-26'
    );

    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      marks_obtained REAL,
      max_marks REAL DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(student_id, exam_id, subject),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      fee REAL NOT NULL DEFAULT 0,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS student_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      enrolled_date TEXT,
      UNIQUE(student_id, activity_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'other',
      status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
      admin_remark TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      resolved_at TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);
  return d;
}

function calculateGrade(obtained, max) {
  if (obtained === null || obtained === undefined || max === 0) return null;
  const pct = (obtained / max) * 100;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

function gradePoint(grade) {
  const map = { 'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C': 6, 'D': 5, 'F': 0 };
  return map[grade] !== undefined ? map[grade] : 0;
}

function nextStudentCode(db) {
  const row = db.prepare(`SELECT student_code FROM students ORDER BY id DESC LIMIT 1`).get();
  const year = new Date().getFullYear();
  let seq = 1;
  if (row && row.student_code) {
    const m = row.student_code.match(/STU-\d{4}-(\d+)/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `STU-${year}-${String(seq).padStart(3, '0')}`;
}

function getFeeSummary(db, studentId, academicYear = '2025-26') {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return null;

  const fs = db.prepare('SELECT tuition_fee FROM fee_structures WHERE class = ? AND academic_year = ?')
    .get(student.class, academicYear);
  const tuitionDue = fs ? fs.tuition_fee : 0;

  let transportDue = 0;
  if (student.transport_route_id) {
    const route = db.prepare('SELECT monthly_fee FROM transport_routes WHERE id = ?').get(student.transport_route_id);
    if (route) transportDue = route.monthly_fee * 10;
  }

  const activities = db.prepare(`
    SELECT a.id, a.name, a.fee
    FROM student_activities sa JOIN activities a ON a.id = sa.activity_id
    WHERE sa.student_id = ?`).all(studentId);
  const activityDue = activities.reduce((s, a) => s + a.fee, 0);

  const paid = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM fee_payments
    WHERE student_id = ? AND academic_year = ?`).get(studentId, academicYear);

  const paidByCategory = db.prepare(`
    SELECT category, COALESCE(SUM(amount),0) as total FROM fee_payments
    WHERE student_id = ? AND academic_year = ? GROUP BY category`).all(studentId, academicYear);

  const catMap = {};
  paidByCategory.forEach(r => { catMap[r.category] = r.total; });

  const totalDue = tuitionDue + transportDue + activityDue;
  const totalPaid = paid.total || 0;

  return {
    student,
    academicYear,
    tuitionDue,
    transportDue,
    activityDue,
    totalDue,
    totalPaid,
    remaining: Math.max(0, totalDue - totalPaid),
    tuitionPaid: catMap['tuition'] || 0,
    transportPaid: catMap['transport'] || 0,
    activityPaid: catMap['activity'] || 0,
    tuitionRemaining: Math.max(0, tuitionDue - (catMap['tuition'] || 0)),
    transportRemaining: Math.max(0, transportDue - (catMap['transport'] || 0)),
    activityRemaining: Math.max(0, activityDue - (catMap['activity'] || 0)),
    activities
  };
}

module.exports = {
  getDb,
  initSchema,
  CLASSES,
  subjectsForClass,
  classNumber,
  calculateGrade,
  gradePoint,
  nextStudentCode,
  getFeeSummary,
  DB_PATH
};
