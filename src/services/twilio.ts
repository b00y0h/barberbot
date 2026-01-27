import twilio from 'twilio';
import { env } from '../config/env';

let _client: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (!_client) {
    if (!env.twilio.accountSid || !env.twilio.authToken) {
      throw new Error('Twilio credentials not configured');
    }
    _client = twilio(env.twilio.accountSid, env.twilio.authToken);
  }
  return _client;
}

export function generateTwiML(baseUrl: string): string {
  const wsUrl = baseUrl.replace(/^https?/, 'wss') + '/voice/stream';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="direction" value="inbound" />
    </Stream>
  </Connect>
</Response>`;
}

export async function makeOutboundCall(to: string): Promise<string> {
  const client = getTwilioClient();
  const wsUrl = env.baseUrl.replace(/^https?/, 'wss') + '/voice/stream';

  const call = await client.calls.create({
    to,
    from: env.twilio.phoneNumber,
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="direction" value="outbound" />
    </Stream>
  </Connect>
</Response>`,
    statusCallback: `${env.baseUrl}/voice/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  });

  console.log(`[Twilio] Outbound call initiated: ${call.sid} → ${to}`);
  return call.sid;
}
