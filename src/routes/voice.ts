import { Router, Request, Response } from 'express';
import { generateTwiML, makeOutboundCall } from '../services/twilio';
import { endCall } from '../services/call-manager';
import { updateCallRecord } from '../services/customers';
import { env } from '../config/env';

const router: import('express').Router = Router();

// POST /voice/incoming — Twilio webhook for incoming calls
router.post('/incoming', (req: Request, res: Response) => {
  const callSid = req.body.CallSid;
  const from = req.body.From;
  const to = req.body.To;

  console.log(`[Voice] Incoming call: ${from} → ${to} (${callSid})`);

  const twiml = generateTwiML(env.baseUrl);
  res.type('text/xml');
  res.send(twiml);
});

// POST /voice/status — Twilio call status webhook
router.post('/status', async (req: Request, res: Response) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  const duration = req.body.CallDuration;

  console.log(`[Voice] Call status: ${callSid} → ${status}`);

  if (status === 'completed' || status === 'failed' || status === 'no-answer' || status === 'busy') {
    try {
      await endCall(callSid);
      if (duration) {
        updateCallRecord(callSid, {
          duration: parseInt(duration, 10),
          status: status === 'completed' ? 'completed' : 'failed',
        });
      }
    } catch (err) {
      console.error('[Voice] Error handling call status:', err);
    }
  }

  res.sendStatus(200);
});

export default router;
