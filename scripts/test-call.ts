import '../src/config/env';
import { makeOutboundCall } from '../src/services/twilio';

const to = process.argv[2];
if (!to) {
  console.error('Usage: pnpm test-call +1XXXXXXXXXX');
  process.exit(1);
}

(async () => {
  try {
    const sid = await makeOutboundCall(to);
    console.log(`Call initiated: ${sid}`);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
})();
