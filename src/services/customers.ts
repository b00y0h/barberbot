import { getDatabase } from '../database';

export interface Customer {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  customer_id: number | null;
  service: string;
  staff: string | null;
  date: string;
  time: string;
  duration: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRecord {
  id: number;
  call_sid: string;
  phone_number: string;
  direction: string;
  duration: number;
  transcript: string | null;
  summary: string | null;
  lead_captured: number;
  appointment_booked: number;
  customer_id: number | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

// ─── Customers ───

export function findCustomerByPhone(phone: string): Customer | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone) as Customer | undefined;
}

export function createCustomer(data: { name?: string; phone: string; email?: string; notes?: string }): Customer {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, customers.name), email = COALESCE(excluded.email, customers.email), notes = COALESCE(excluded.notes, customers.notes), updated_at = datetime(\'now\')'
  ).run(data.name || null, data.phone, data.email || null, data.notes || null);

  return db.prepare('SELECT * FROM customers WHERE id = ? OR phone = ?').get(result.lastInsertRowid, data.phone) as Customer;
}

export function getCustomer(id: number): Customer | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | undefined;
}

export function listCustomers(limit = 50, offset = 0): Customer[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM customers ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Customer[];
}

// ─── Appointments ───

export function createAppointment(data: {
  customer_id?: number;
  service: string;
  staff?: string;
  date: string;
  time: string;
  duration?: number;
  notes?: string;
}): Appointment {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO appointments (customer_id, service, staff, date, time, duration, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(data.customer_id || null, data.service, data.staff || null, data.date, data.time, data.duration || 30, data.notes || null);

  return db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid) as Appointment;
}

export function listAppointments(date?: string, limit = 50): Appointment[] {
  const db = getDatabase();
  if (date) {
    return db.prepare('SELECT * FROM appointments WHERE date = ? ORDER BY time ASC LIMIT ?').all(date, limit) as Appointment[];
  }
  return db.prepare('SELECT * FROM appointments ORDER BY date DESC, time ASC LIMIT ?').all(limit) as Appointment[];
}

export function checkAvailability(date: string, staff?: string): Appointment[] {
  const db = getDatabase();
  if (staff) {
    return db.prepare('SELECT * FROM appointments WHERE date = ? AND staff = ? AND status != \'cancelled\' ORDER BY time ASC').all(date, staff) as Appointment[];
  }
  return db.prepare('SELECT * FROM appointments WHERE date = ? AND status != \'cancelled\' ORDER BY time ASC').all(date) as Appointment[];
}

// ─── Calls ───

export function createCallRecord(data: { call_sid: string; phone_number: string; direction?: string; customer_id?: number }): CallRecord {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO calls (call_sid, phone_number, direction, customer_id) VALUES (?, ?, ?, ?)'
  ).run(data.call_sid, data.phone_number, data.direction || 'inbound', data.customer_id || null);

  return db.prepare('SELECT * FROM calls WHERE id = ?').get(result.lastInsertRowid) as CallRecord;
}

export function updateCallRecord(callSid: string, data: Partial<Pick<CallRecord, 'duration' | 'transcript' | 'summary' | 'lead_captured' | 'appointment_booked' | 'status' | 'customer_id'>>): void {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.duration !== undefined) { sets.push('duration = ?'); values.push(data.duration); }
  if (data.transcript !== undefined) { sets.push('transcript = ?'); values.push(data.transcript); }
  if (data.summary !== undefined) { sets.push('summary = ?'); values.push(data.summary); }
  if (data.lead_captured !== undefined) { sets.push('lead_captured = ?'); values.push(data.lead_captured); }
  if (data.appointment_booked !== undefined) { sets.push('appointment_booked = ?'); values.push(data.appointment_booked); }
  if (data.status !== undefined) { sets.push('status = ?'); values.push(data.status); }
  if (data.customer_id !== undefined) { sets.push('customer_id = ?'); values.push(data.customer_id); }

  if (data.status === 'completed') {
    sets.push('ended_at = datetime(\'now\')');
  }

  if (sets.length === 0) return;
  values.push(callSid);
  db.prepare(`UPDATE calls SET ${sets.join(', ')} WHERE call_sid = ?`).run(...values);
}

export function getCallRecord(id: number): CallRecord | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as CallRecord | undefined;
}

export function getCallBySid(sid: string): CallRecord | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM calls WHERE call_sid = ?').get(sid) as CallRecord | undefined;
}

export function listCalls(limit = 50, offset = 0): CallRecord[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM calls ORDER BY started_at DESC LIMIT ? OFFSET ?').all(limit, offset) as CallRecord[];
}

export function getDashboardStats(): { callsToday: number; leadsToday: number; appointmentsToday: number; totalCustomers: number } {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const callsToday = (db.prepare('SELECT COUNT(*) as count FROM calls WHERE date(started_at) = ?').get(today) as { count: number }).count;
  const leadsToday = (db.prepare('SELECT COUNT(*) as count FROM calls WHERE date(started_at) = ? AND lead_captured = 1').get(today) as { count: number }).count;
  const appointmentsToday = (db.prepare('SELECT COUNT(*) as count FROM appointments WHERE date = ?').get(today) as { count: number }).count;
  const totalCustomers = (db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number }).count;

  return { callsToday, leadsToday, appointmentsToday, totalCustomers };
}
