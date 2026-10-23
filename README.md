# Sunrise Public School — Student Profile & Fee Management System

A complete school management website covering **Nursery to SSLC (Class 10)** with unique student IDs, full student profiles, fees tracking, academic performance, activities, transport and complaints — with **two separate portals**: Admin/Teachers and Students.

## Quick Start

```bash
npm install
npm run seed     # creates db/school.db with 25 sample students
npm start        # http://localhost:3000
```

## Deploying to Vercel

The app is configured for Vercel's serverless functions:

- `api/index.js` exports the Express app (no `listen()` call on Vercel).
- `vercel.json` routes all requests to that function and bundles `views/` and `public/`.
- On Vercel the SQLite database lives at `/tmp/school.db` (the deployment filesystem is read-only).
- The database is **auto-seeded with sample data on cold start** if empty, because `/tmp` is
  ephemeral: any data written at runtime is lost when the function instance recycles.
- Sessions use signed cookies (`cookie-session`), so login survives serverless instance changes.
- Node runtime is pinned to `22.x` in `package.json` (`node:sqlite` requires Node >= 22.5).

### Deploy steps

1. Push this repository to GitHub.
2. In Vercel, click **Add New Project** and import the repository. Vercel reads `vercel.json`
   automatically; no framework preset or build command is needed.
3. After the first deploy, open the production URL.
4. When your custom domain is ready: add it in Vercel **Project Settings > Domains**, point DNS
   at Vercel, then set environment variables:

| Variable | Value |
|---|---|
| `SITE_URL` | `https://www.yourdomain.edu.in` |
| `SESSION_SECRET` | a long random string |

5. Redeploy. Canonical tags will then use your real domain.

### Production data note

`/tmp` storage is fine for demos and internal trials. For a permanent installation where fee
payments and records must survive instance recycling, replace SQLite with a hosted database
(Vercel Postgres, Turso, or any MySQL/PostgreSQL server). The data access layer is isolated in
`db/database.js`, so only that file needs to change.

## Custom Domain (manual / non-Vercel)

The site emits a canonical URL on every page. When you connect a custom domain, set the
`SITE_URL` environment variable before starting the server so canonical tags and any future
metadata point at the real domain:

```bash
# Linux / macOS
SITE_URL=https://www.yourschool.edu.in npm start

# Windows (PowerShell)
$env:SITE_URL="https://www.yourschool.edu.in"; npm start
```

Default when unset: `http://localhost:3000`. Point your domain's DNS at the host, serve over
HTTPS (e.g. via a reverse proxy with TLS), and set `SITE_URL` to the HTTPS origin.

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
Nursery, LKG, UKG, Class 1 to Class 10 (SSLC)

## Public Pages
- `/` home
- `/login` staff and student login
- `/privacy` privacy policy
- `/terms` terms and conditions

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
