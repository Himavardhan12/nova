# Sunrise Public School — Student Profile & Fee Management System

A complete school management website covering **Nursery to SSLC (Class 10)** with unique student IDs, full student profiles, fees tracking, academic performance, activities, transport and complaints — with **two separate portals**: Admin/Teachers and Students.

## Quick Start

```bash
npm install
npm run seed     # creates db/school.db with 25 sample students
npm start        # http://localhost:3000
```

## Login Credentials

| Portal | Username | Password |
|---|---|---|
| **Admin / Teacher** | `admin` | `123456` |
| **Student** | Student ID e.g. `STU-2026-001` | `654321` |

> Sample student IDs: `STU-2026-001` … `STU-2026-025` (shown on login page and in admin student list).

## Features

### Admin / Teacher Portal
- **Dashboard** — total students, fees collected, open complaints, recent payments
- **Students** — search, filter by class, add/edit/soft-delete; auto-generated unique ID (`STU-YYYY-NNN`)
- **Student Profile** — personal details, parent & guardian phone numbers, fee summary, exam grades, activities, complaints in one view
- **Fees** — record payments (tuition/transport/activity), receipt numbers, modes, full report with outstanding balances
- **Marks** — enter/update marks per exam & subject, auto letter grades (A+ … F)
- **Complaints** — filter by status, respond with remarks, mark resolved
- **Transport** — add bus routes, view enrolled students per route
- **Activities** — Sports, Dance, Music, Art enrollments with fees

### Student Portal
- **Dashboard** — fee overview with progress bar, quick links
- **My Profile** — personal details, parent & guardian contact numbers
- **Fee Details** — total, paid, remaining (by category) + payment history
- **Academics** — per-exam subject marks, grades, class rank
- **Activities** — enrolled activities + fee status
- **Transport** — route, stops, pickup point, fee status
- **Complaints** — submit new complaint, track status & school response

## Classes Covered
Nursery, LKG, UKG, Class 1–10 (SSLC)

## Tech Stack
- **Node.js + Express** — server
- **EJS** — server-rendered views
- **node:sqlite** (built-in, zero native install) — database (`db/school.db`)
- **bcryptjs** — password hashing
- **express-session** — session auth
- **Bootstrap 5** (CDN) — UI

## Project Structure
```
├── server.js            # Express app entry
├── seed.js              # Database seeder (npm run seed)
├── db/
│   ├── database.js      # Schema, helpers, fee calculations
│   └── school.db        # SQLite database (generated)
├── middleware/
│   └── auth.js          # Role-based route guards
├── routes/
│   ├── public.js        # Home + login/logout
│   ├── admin.js         # Admin/teacher portal
│   └── student.js       # Student portal
├── views/
│   ├── partials/        # Header, footer, sidebars
│   ├── admin/           # Admin portal pages
│   └── student/         # Student portal pages
└── public/css/style.css # Custom styles
```

## Security Notes
- Passwords are bcrypt-hashed in the database.
- Default passwords (`123456` / `654321`) are set for demo convenience as specified — **change them before production use**.
- Sessions are HTTP-only; both portals are protected by role middleware.
- Students can only view their own data (session-bound student ID).

## Resetting Data
```bash
npm run seed    # wipes and re-creates the database with fresh sample data
```
