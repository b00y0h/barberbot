import { v4 as uuid } from 'uuid';
import {
  ConversationState,
  createConversation,
  getGreeting,
  processUserMessage,
  generateCallSummary,
  getTranscript,
} from './conversation';
import {
  createCallRecord,
  updateCallRecord,
  findCustomerByPhone,
} from './customers';
import { DeepgramSTT } from './stt';
import { TTSService } from './tts';

export interface ActiveCall {
  id: string;
  callSid: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  conversation: ConversationState;
  stt: DeepgramSTT;
  tts: TTSService;
  streamSid: string | null;
  startedAt: Date;
  isBotSpeaking: boolean;
  pendingTranscript: string;
  sendAudio: ((payload: string) => void) | null;
}

const activeCalls = new Map<string, ActiveCall>();

export function getActiveCall(callSid: string): ActiveCall | undefined {
  return activeCalls.get(callSid);
}

export function getAllActiveCalls(): ActiveCall[] {
  return Array.from(activeCalls.values());
}

export async function initializeCall(
  callSid: string,
  phoneNumber: string,
  direction: 'inbound' | 'outbound' = 'inbound'
): Promise<ActiveCall> {
  console.log(`[CallManager] Initializing call ${callSid} from ${phoneNumber}`);

  // Check for existing customer
  const customer = findCustomerByPhone(phoneNumber);

  // Create DB record
  createCallRecord({
    call_sid: callSid,
    phone_number: phoneNumber,
    direction,
    customer_id: customer?.id,
  });

  // Initialize conversation
  const conversation = createConversation(phoneNumber);

  // Initialize STT & TTS
  const stt = new DeepgramSTT();
  const tts = new TTSService();

  const call: ActiveCall = {
    id: uuid(),
    callSid,
    phoneNumber,
    direction,
    conversation,
    stt,
    tts,
    streamSid: null,
    startedAt: new Date(),
    isBotSpeaking: false,
    pendingTranscript: '',
    sendAudio: null,
  };

  activeCalls.set(callSid, call);

  // Set up STT event handlers
  let utteranceBuffer = '';
  let utteranceTimeout: ReturnType<typeof setTimeout> | null = null;

  stt.on('transcript', (text: string, isFinal: boolean) => {
    console.log(`[STT] ${isFinal ? 'Final' : 'Interim'}: ${text}`);

    if (isFinal) {
      utteranceBuffer += (utteranceBuffer ? ' ' : '') + text;

      // Clear existing timeout and set new one
      if (utteranceTimeout) clearTimeout(utteranceTimeout);
      utteranceTimeout = setTimeout(async () => {
        if (utteranceBuffer.trim()) {
          await handleUserUtterance(call, utteranceBuffer.trim());
          utteranceBuffer = '';
        }
      }, 700); // Wait 700ms after last final transcript
    }

    // Interrupt bot if caller starts speaking
    if (call.isBotSpeaking) {
      console.log('[CallManager] Caller interrupted bot');
      call.tts.interrupt();
      call.isBotSpeaking = false;
    }
  });

  stt.on('utterance_end', () => {
    if (utteranceBuffer.trim()) {
      if (utteranceTimeout) clearTimeout(utteranceTimeout);
      handleUserUtterance(call, utteranceBuffer.trim());
      utteranceBuffer = '';
    }
  });

  stt.on('error', (err: Error) => {
    console.error(`[CallManager] STT error for ${callSid}:`, err);
  });

  // Start STT
  await stt.start();

  return call;
}

async function handleUserUtterance(call: ActiveCall, text: string): Promise<void> {
  console.log(`[CallManager] Processing utterance: "${text}"`);

  try {
    const response = await processUserMessage(
      call.conversation,
      text,
      call.phoneNumber
    );

    console.log(`[CallManager] Bot response: "${response}"`);
    await speakResponse(call, response);
  } catch (err) {
    console.error('[CallManager] Error processing utterance:', err);
    await speakResponse(call, "I'm sorry, I didn't catch that. Could you say that again?");
  }
}

export async function sendGreeting(call: ActiveCall): Promise<void> {
  try {
    const greeting = await getGreeting(call.conversation);
    console.log(`[CallManager] Greeting: "${greeting}"`);
    await speakResponse(call, greeting);
  } catch (err) {
    console.error('[CallManager] Error generating greeting:', err);
    await speakResponse(call, 'Thanks for calling, how can I help you today?');
  }
}

async function speakResponse(call: ActiveCall, text: string): Promise<void> {
  if (!call.sendAudio || !call.streamSid) {
    console.warn('[CallManager] Cannot send audio — no stream connected');
    return;
  }

  call.isBotSpeaking = true;
  let sequenceNumber = 0;

  return new Promise<void>((resolve) => {
    const tts = new TTSService();

    tts.on('audio', (mulawChunk: Buffer) => {
      if (!call.isBotSpeaking) return; // interrupted

      const payload = mulawChunk.toString('base64');
      const mediaMessage = JSON.stringify({
        event: 'media',
        streamSid: call.streamSid,
        media: {
          payload,
        },
      });

      call.sendAudio!(mediaMessage);
      sequenceNumber++;
    });

    tts.on('done', () => {
      call.isBotSpeaking = false;

      // Send mark to know when audio finishes playing
      if (call.sendAudio && call.streamSid) {
        call.sendAudio(JSON.stringify({
          event: 'mark',
          streamSid: call.streamSid,
          mark: { name: `response-${sequenceNumber}` },
        }));
      }

      resolve();
    });

    tts.on('error', (err: Error) => {
      console.error('[CallManager] TTS error:', err);
      call.isBotSpeaking = false;
      resolve();
    });

    // Store TTS reference for interruption
    call.tts = tts;
    tts.synthesize(text);
  });
}

export async function endCall(callSid: string): Promise<void> {
  const call = activeCalls.get(callSid);
  if (!call) return;

  console.log(`[CallManager] Ending call ${callSid}`);

  // Stop STT
  call.stt.stop();

  // Generate transcript and summary
  const transcript = getTranscript(call.conversation);
  let summary = '';

  try {
    summary = await generateCallSummary(call.conversation);
  } catch (err) {
    console.error('[CallManager] Error generating summary:', err);
  }

  // Calculate duration
  const duration = Math.floor((Date.now() - call.startedAt.getTime()) / 1000);

  // Update DB
  updateCallRecord(callSid, {
    duration,
    transcript,
    summary,
    lead_captured: call.conversation.leadCaptured ? 1 : 0,
    appointment_booked: call.conversation.appointmentBooked ? 1 : 0,
    status: 'completed',
  });

  activeCalls.delete(callSid);
  console.log(`[CallManager] Call ${callSid} ended. Duration: ${duration}s`);
}
