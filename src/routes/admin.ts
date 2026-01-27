import { Router, Request, Response } from 'express';
import {
  listCalls,
  getCallRecord,
  listCustomers,
  getCustomer,
  listAppointments,
  getDashboardStats,
} from '../services/customers';
import { makeOutboundCall } from '../services/twilio';
import { getAllActiveCalls } from '../services/call-manager';

const router: import('express').Router = Router();

// GET /api/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeCalls: getAllActiveCalls().length,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/dashboard
router.get('/dashboard', (_req: Request, res: Response) => {
  try {
    const stats = getDashboardStats();
    const activeCalls = getAllActiveCalls();
    res.json({
      ...stats,
      activeCalls: activeCalls.length,
      activeCallDetails: activeCalls.map(c => ({
        callSid: c.callSid,
        phoneNumber: c.phoneNumber,
        direction: c.direction,
        duration: Math.floor((Date.now() - c.startedAt.getTime()) / 1000),
      })),
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/calls
router.get('/calls', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const calls = listCalls(limit, offset);
  res.json(calls);
});

// GET /api/calls/:id
router.get('/calls/:id', (req: Request, res: Response) => {
  const call = getCallRecord(parseInt(req.params.id, 10));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  res.json(call);
});

// GET /api/customers
router.get('/customers', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const customers = listCustomers(limit, offset);
  res.json(customers);
});

// GET /api/customers/:id
router.get('/customers/:id', (req: Request, res: Response) => {
  const customer = getCustomer(parseInt(req.params.id, 10));
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  res.json(customer);
});

// GET /api/appointments
router.get('/appointments', (req: Request, res: Response) => {
  const date = req.query.date as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const appointments = listAppointments(date, limit);
  res.json(appointments);
});

// POST /api/calls/outbound
router.post('/calls/outbound', async (req: Request, res: Response) => {
  const { to } = req.body;
  if (!to) {
    res.status(400).json({ error: 'Missing "to" phone number' });
    return;
  }

  try {
    const callSid = await makeOutboundCall(to);
    res.json({ success: true, callSid });
  } catch (err: any) {
    console.error('[Admin] Outbound call error:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate call' });
  }
});

export default router;
