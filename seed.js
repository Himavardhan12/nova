const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const {
  initSchema, getDb, CLASSES, subjectsForClass,
  calculateGrade, nextStudentCode, DB_PATH
} = require('./db/database');

const AY = '2025-26';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function resetDb() {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  return initSchema();
}

function seed(opts = {}) {
  const reset = opts.reset !== false;
  let db;
  if (reset) {
    db = resetDb();
  } else {
    db = initSchema();
    const existing = db.prepare('SELECT COUNT(*) c FROM students').get().c;
    if (existing > 0) return false;
  }

  const adminHash = bcrypt.hashSync('123456', 10);
  const studentHash = bcrypt.hashSync('654321', 10);

  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', adminHash, 'admin');

  const routes = [
    ['Route A - MG Road', 'MG Road, Brigade Cross, City Center', 700],
    ['Route B - Jayanagar', 'Jayanagar 4th Block, South End, Ashoka Pillar', 650],
    ['Route C - Whitefield', 'ITPL Main, Hope Farm, Hoodi Circle', 900],
    ['Route D - Rajajinagar', 'Rajajinagar 2nd Stage, Chord Road, Basaveshwara Circle', 750]
  ];
  const insRoute = db.prepare('INSERT INTO transport_routes (route_name, stops, monthly_fee) VALUES (?, ?, ?)');
  routes.forEach(r => insRoute.run(...r));

  const feeTiers = {
    'Nursery': 15000, 'LKG': 16000, 'UKG': 17000,
    'Class 1': 25000, 'Class 2': 25000, 'Class 3': 26000, 'Class 4': 27000, 'Class 5': 28000,
    'Class 6': 30000, 'Class 7': 31000, 'Class 8': 32000, 'Class 9': 35000, 'Class 10 (SSLC)': 40000
  };
  const insFS = db.prepare('INSERT INTO fee_structures (class, academic_year, tuition_fee) VALUES (?, ?, ?)');
  CLASSES.forEach(c => insFS.run(c, AY, feeTiers[c]));

  const activities = [
    ['Sports (Cricket)', 3000, 'Cricket coaching and inter-school matches'],
    ['Sports (Football)', 2800, 'Football training and tournaments'],
    ['Dance (Classical)', 2500, 'Bharatanatyam and Kuchipudi training'],
    ['Dance (Western)', 2200, 'Hip-hop and contemporary dance'],
    ['Music (Vocal)', 2000, 'Carnatic and Hindustani vocal training'],
    ['Music (Instrumental)', 3500, 'Keyboard, guitar and tabla'],
    ['Art & Craft', 1500, 'Painting, sculpture and craft workshops']
  ];
  const insAct = db.prepare('INSERT INTO activities (name, fee, description) VALUES (?, ?, ?)');
  activities.forEach(a => insAct.run(...a));

  const exams = [
    ['Unit Test 1', AY], ['Unit Test 2', AY], ['Half Yearly Examination', AY], ['Annual Examination', AY]
  ];
  const insExam = db.prepare('INSERT INTO exams (name, academic_year) VALUES (?, ?)');
  exams.forEach(e => insExam.run(...e));

  const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Krishna', 'Ishaan', 'Reyansh', 'Aryan', 'Kabir',
    'Ananya', 'Diya', 'Ira', 'Myra', 'Sara', 'Kiara', 'Aisha', 'Meera', 'Pooja', 'Kavya',
    'Rohan', 'Nikhil', 'Manoj', 'Prisha', 'Tanvi', 'Sneha', 'Rahul', 'Vikram', 'Neha', 'Suresh'
  ];
  const lastNames = [
    'Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Kumar', 'Gowda', 'Rao', 'Verma', 'Singh',
    'Hegde', 'Shetty', 'Bhat', 'Kulkarni', 'Desai', 'Joshi', 'Mehta', 'Chopra', 'Pillai', 'Menon'
  ];
  const streets = [
    '12, 4th Cross, Jayanagar', '45, MG Road', '7, Whitefield Main', '22, Rajajinagar 2nd Stage',
    '88, Indiranagar 100ft Road', '3, Malleswaram 8th Cross', '19, Basavanagudi', '56, Kalyan Nagar'
  ];

  const insStudent = db.prepare(`
    INSERT INTO students (student_code, name, dob, gender, class, section, admission_date, address,
      parent_name, parent_phone, guardian_name, guardian_phone, email, blood_group,
      transport_route_id, pickup_point)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insUser = db.prepare('INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, ?, ?)');
  const insPay = db.prepare(`INSERT INTO fee_payments
    (student_id, category, amount, payment_date, mode, receipt_no, academic_year, activity_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const studentIds = [];
  let receiptCounter = 1000;

  // One student per class (13) + extra in a few classes to reach ~25
  const classPlan = [...CLASSES];
  classPlan.push('Class 10 (SSLC)', 'Class 10 (SSLC)', 'Class 5', 'Class 8', 'Class 3',
    'Nursery', 'Class 7', 'Class 9', 'Class 2', 'Class 6', 'UKG', 'LKG');

  classPlan.forEach((cls) => {
    const code = nextStudentCode(db);
    const fname = rand(firstNames);
    const lname = rand(lastNames);
    const name = `${fname} ${lname}`;
    const isYoung = cls === 'Nursery' || cls === 'LKG' || cls === 'UKG';
    const classNum = parseInt((cls.match(/Class (\d+)/) || [])[1] || 1, 10);
    const age = isYoung ? classNum + 3 : classNum + 5;
    const birthYear = new Date().getFullYear() - age;
    const dob = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
    const gender = Math.random() > 0.5 ? 'Male' : 'Female';
    const section = Math.random() > 0.5 ? 'A' : 'B';
    const admission = `${birthYear + 3}-${String(randInt(5, 7)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
    const parentName = `${rand(['Mr.', 'Mrs.'])} ${rand(firstNames)} ${lname}`;
    const parentPhone = `9${randInt(100000000, 999999999)}`;
    const guardianName = `${rand(['Mr.', 'Mrs.'])} ${rand(firstNames)} ${lname}`;
    const guardianPhone = `9${randInt(100000000, 999999999)}`;
    const email = `${fname.toLowerCase()}.${lname.toLowerCase()}${randInt(1, 99)}@example.com`;
    const blood = rand(['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-']);
    const useTransport = Math.random() > 0.35;
    const routeId = useTransport ? randInt(1, 4) : null;
    const pickup = useTransport ? rand(['Stop 1', 'Stop 2', 'Stop 3', 'Stop 4']) : null;

    const info = insStudent.run(code, name, dob, gender, cls, section, admission,
      `${randInt(1, 100)}, ${rand(streets)}, Bengaluru - 5600${randInt(10, 99)}`,
      parentName, parentPhone, guardianName, guardianPhone, email, blood, routeId, pickup);
    const sid = Number(info.lastInsertRowid);
    studentIds.push({ id: sid, code, cls });

    insUser.run(code, studentHash, 'student', sid);

    const tuition = feeTiers[cls];
    const transportFee = routeId ? 700 * 10 : 0;

    let paidTuition = 0;
    if (Math.random() > 0.4) {
      const pay1 = Math.round(tuition * 0.5);
      insPay.run(sid, 'tuition', pay1, `2025-06-${randInt(10, 28)}`, 'UPI',
        `RCT-${receiptCounter++}`, AY, null, 'First installment');
      paidTuition = pay1;
      if (Math.random() > 0.5) {
        const pay2 = tuition - pay1;
        insPay.run(sid, 'tuition', pay2, `2025-09-${randInt(1, 28)}`, 'Cash',
          `RCT-${receiptCounter++}`, AY, null, 'Second installment');
        paidTuition = tuition;
      }
    } else {
      const pay1 = Math.round(tuition * 0.3);
      insPay.run(sid, 'tuition', pay1, `2025-06-${randInt(10, 28)}`, 'Cash',
        `RCT-${receiptCounter++}`, AY, null, 'Partial payment');
      paidTuition = pay1;
    }

    if (routeId) {
      const tPay = Math.random() > 0.4 ? transportFee : Math.round(transportFee * 0.5);
      insPay.run(sid, 'transport', tPay, `2025-06-${randInt(10, 28)}`, 'Cash',
        `RCT-${receiptCounter++}`, AY, null, 'Transport fees');
    }

    if (Math.random() > 0.35) {
      const actId = randInt(1, 7);
      const act = db.prepare('SELECT * FROM activities WHERE id = ?').get(actId);
      db.prepare('INSERT INTO student_activities (student_id, activity_id, enrolled_date) VALUES (?, ?, ?)')
        .run(sid, actId, `2025-06-${randInt(10, 28)}`);
      if (Math.random() > 0.5) {
        insPay.run(sid, 'activity', act.fee, `2025-07-${randInt(1, 28)}`, 'UPI',
          `RCT-${receiptCounter++}`, AY, actId, `Payment for ${act.name}`);
      }
    }

    if (Math.random() > 0.55) {
      const examId = randInt(1, 4);
      const subs = subjectsForClass(cls);
      subs.forEach(sub => {
        const max = 100;
        const obt = randInt(35, 98);
        db.prepare(`INSERT OR REPLACE INTO marks (student_id, exam_id, subject, marks_obtained, max_marks)
          VALUES (?, ?, ?, ?, ?)`).run(sid, examId, sub, obt, max);
      });
    }
  });

  const complaintSeed = [
    ['Bus delay in the morning', 'Route A bus arrives 20 minutes late every day this week.', 'transport'],
    ['Drinking water problem', 'The ground floor water cooler is not working since Monday.', 'infrastructure'],
    ['Library books overdue query', 'I returned the books but the portal still shows them as issued.', 'academic'],
    ['Classroom fan not working', 'The ceiling fan in Room 204 has been broken for two weeks.', 'infrastructure'],
    ['Sports kit size issue', 'The cricket kit provided is too small, need a larger size.', 'other']
  ];
  const insComp = db.prepare(`INSERT INTO complaints (student_id, title, description, category, status, admin_remark)
    VALUES (?, ?, ?, ?, ?, ?)`);

  for (let i = 0; i < 8; i++) {
    const s = rand(studentIds);
    const c = rand(complaintSeed);
    const status = rand(['open', 'in_progress', 'resolved']);
    const remark = status === 'resolved' ? 'Resolved by administration. Thank you for reporting.'
      : status === 'in_progress' ? 'Maintenance team informed, work in progress.' : null;
    insComp.run(s.id, c[0], c[1], c[2], status, remark);
  }

  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  const totalPayments = db.prepare('SELECT COUNT(*) as c FROM fee_payments').get().c;
  const totalComplaints = db.prepare('SELECT COUNT(*) as c FROM complaints').get().c;

  console.log('=== Seed Complete ===');
  console.log(`Students: ${totalStudents}`);
  console.log(`Fee payments: ${totalPayments}`);
  console.log(`Complaints: ${totalComplaints}`);
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin   : username "admin"    / password "123456"');
  console.log('  Student : username <student_code> / password "654321"');
  console.log('');
  console.log('Sample student codes:');
  db.prepare('SELECT student_code, name, class FROM students ORDER BY id LIMIT 5').all()
    .forEach(s => console.log(`  ${s.student_code}  ${s.name} (${s.class})`));
  return true;
}

// Seed only if the database has no students (used on Vercel cold starts).
function seedIfEmpty() {
  return seed({ reset: false });
}

module.exports = { seed, seedIfEmpty };

if (require.main === module) {
  seed({ reset: true });
}
