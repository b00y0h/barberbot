import Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT UNIQUE,
      email TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      service TEXT NOT NULL,
      staff TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER DEFAULT 30,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT UNIQUE,
      phone_number TEXT,
      direction TEXT DEFAULT 'inbound',
      duration INTEGER DEFAULT 0,
      transcript TEXT,
      summary TEXT,
      lead_captured INTEGER DEFAULT 0,
      appointment_booked INTEGER DEFAULT 0,
      customer_id INTEGER,
      status TEXT DEFAULT 'in-progress',
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number);
    CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
  `);

  console.log('[Database] Schema initialized');
}
