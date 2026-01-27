import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { initializeCall, getActiveCall, sendGreeting, endCall } from './call-manager';

export function handleMediaStream(ws: WebSocket, req: IncomingMessage): void {
  console.log('[AudioPipeline] New WebSocket connection');

  let callSid: string | null = null;

  ws.on('message', async (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          console.log('[AudioPipeline] Stream connected');
          break;

        case 'start': {
          callSid = msg.start.callSid;
          const streamSid = msg.start.streamSid;
          const phoneNumber = msg.start.customParameters?.from || msg.start.customParameters?.To || 'unknown';
          const direction = (msg.start.customParameters?.direction || 'inbound') as 'inbound' | 'outbound';

          console.log(`[AudioPipeline] Stream started: callSid=${callSid}, streamSid=${streamSid}`);

          try {
            const call = await initializeCall(callSid!, phoneNumber, direction);
            call.streamSid = streamSid;

            // Set up audio sending function
            call.sendAudio = (payload: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
              }
            };

            // Send initial greeting after short delay
            setTimeout(() => sendGreeting(call), 500);
          } catch (err) {
            console.error('[AudioPipeline] Failed to initialize call:', err);
          }
          break;
        }

        case 'media': {
          if (!callSid) break;
          const call = getActiveCall(callSid);
          if (!call) break;

          // Decode base64 mulaw audio and send to STT
          const audioData = Buffer.from(msg.media.payload, 'base64');
          call.stt.sendAudio(audioData);
          break;
        }

        case 'mark': {
          // Mark event — audio playback reached this point
          console.log(`[AudioPipeline] Mark: ${msg.mark?.name}`);
          break;
        }

        case 'stop': {
          console.log(`[AudioPipeline] Stream stopped: ${callSid}`);
          if (callSid) {
            await endCall(callSid);
          }
          break;
        }

        default:
          console.log(`[AudioPipeline] Unknown event: ${msg.event}`);
      }
    } catch (err) {
      console.error('[AudioPipeline] Error processing message:', err);
    }
  });

  ws.on('close', async (code: number, reason: Buffer) => {
    console.log(`[AudioPipeline] WebSocket closed: ${code} ${reason.toString()}`);
    if (callSid) {
      await endCall(callSid);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('[AudioPipeline] WebSocket error:', err);
  });
}
