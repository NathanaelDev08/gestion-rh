PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_login    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  action TEXT NOT NULL,
  label  TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  manager_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  parent_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  budget      REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  matricule          TEXT UNIQUE,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  gender             TEXT NOT NULL DEFAULT 'F',
  birth_date         TEXT,
  email              TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  address            TEXT NOT NULL DEFAULT '',
  city               TEXT NOT NULL DEFAULT '',
  postal_code        TEXT NOT NULL DEFAULT '',
  country            TEXT NOT NULL DEFAULT '',
  national_id        TEXT NOT NULL DEFAULT '',
  social_security    TEXT NOT NULL DEFAULT '',
  emergency_name     TEXT NOT NULL DEFAULT '',
  emergency_phone    TEXT NOT NULL DEFAULT '',
  department_id      INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  job_title          TEXT NOT NULL DEFAULT '',
  manager_id         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  hire_date          TEXT NOT NULL,
  probation_end_date TEXT,
  contract_type      TEXT NOT NULL DEFAULT 'CDI',
  contract_end_date  TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  termination_date   TEXT,
  termination_reason TEXT,
  work_location      TEXT NOT NULL DEFAULT '',
  work_schedule      TEXT NOT NULL DEFAULT 'Temps plein',
  base_salary        REAL NOT NULL DEFAULT 0,
  transport_allowance REAL NOT NULL DEFAULT 0,
  other_allowance    REAL NOT NULL DEFAULT 0,
  dependents         INTEGER NOT NULL DEFAULT 0,
  bank_name          TEXT NOT NULL DEFAULT '',
  iban               TEXT NOT NULL DEFAULT '',
  photo_color        TEXT NOT NULL DEFAULT '#4f46e5',
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Divers',
  description TEXT NOT NULL DEFAULT '',
  reference   TEXT NOT NULL DEFAULT '',
  file_path   TEXT NOT NULL DEFAULT '',
  issue_date  TEXT,
  expiry_date TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_types (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  code               TEXT NOT NULL DEFAULT '',
  days_per_year      REAL NOT NULL DEFAULT 30,
  color              TEXT NOT NULL DEFAULT '#4f46e5',
  is_paid            INTEGER NOT NULL DEFAULT 1,
  requires_document  INTEGER NOT NULL DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id  INTEGER NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  days           REAL NOT NULL DEFAULT 0,
  reason         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',
  approver_id    INTEGER,
  approver_name  TEXT NOT NULL DEFAULT '',
  decision_note  TEXT NOT NULL DEFAULT '',
  decided_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  recurring INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attendance (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  clock_in        TEXT,
  clock_out       TEXT,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  worked_minutes  INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'present',
  note            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  period         TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'finalized',
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_gross    REAL NOT NULL DEFAULT 0,
  total_net      REAL NOT NULL DEFAULT 0,
  total_employer REAL NOT NULL DEFAULT 0,
  generated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  notes          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  matricule       TEXT NOT NULL DEFAULT '',
  full_name       TEXT NOT NULL DEFAULT '',
  job_title       TEXT NOT NULL DEFAULT '',
  department      TEXT NOT NULL DEFAULT '',
  contract_type   TEXT NOT NULL DEFAULT '',
  base_salary     REAL NOT NULL DEFAULT 0,
  overtime_hours  REAL NOT NULL DEFAULT 0,
  overtime_amount REAL NOT NULL DEFAULT 0,
  bonus           REAL NOT NULL DEFAULT 0,
  commission      REAL NOT NULL DEFAULT 0,
  allowance       REAL NOT NULL DEFAULT 0,
  other_deductions REAL NOT NULL DEFAULT 0,
  gross           REAL NOT NULL DEFAULT 0,
  social_employee REAL NOT NULL DEFAULT 0,
  tax             REAL NOT NULL DEFAULT 0,
  net             REAL NOT NULL DEFAULT 0,
  social_employer REAL NOT NULL DEFAULT 0,
  employer_cost   REAL NOT NULL DEFAULT 0,
  breakdown_json  TEXT NOT NULL DEFAULT '{}',
  notes           TEXT NOT NULL DEFAULT '',
  UNIQUE (run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS job_offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  contract_type  TEXT NOT NULL DEFAULT 'CDI',
  location       TEXT NOT NULL DEFAULT '',
  salary_min     REAL NOT NULL DEFAULT 0,
  salary_max     REAL NOT NULL DEFAULT 0,
  description    TEXT NOT NULL DEFAULT '',
  requirements   TEXT NOT NULL DEFAULT '',
  benefits       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open',
  posted_at      TEXT,
  closed_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id          INTEGER NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT '',
  stage             TEXT NOT NULL DEFAULT 'new',
  rating            REAL NOT NULL DEFAULT 0,
  salary_expectation REAL NOT NULL DEFAULT 0,
  availability      TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  applied_at        TEXT NOT NULL DEFAULT (date('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id    INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  scheduled_at    TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  type            TEXT NOT NULL DEFAULT 'Entretien',
  interviewer     TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  feedback        TEXT NOT NULL DEFAULT '',
  result          TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS evaluations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period        TEXT NOT NULL DEFAULT '',
  evaluator_name TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft',
  global_rating REAL NOT NULL DEFAULT 0,
  criteria_json TEXT NOT NULL DEFAULT '[]',
  strengths     TEXT NOT NULL DEFAULT '',
  improvements   TEXT NOT NULL DEFAULT '',
  goals         TEXT NOT NULL DEFAULT '',
  comments      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp      ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_stat ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp  ON leave_requests(employee_id, start_date);
CREATE INDEX IF NOT EXISTS idx_documents_emp       ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_candidates_offer    ON candidates(offer_id, stage);
CREATE INDEX IF NOT EXISTS idx_interviews_date     ON interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run   ON payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_employees_status    ON employees(status);
