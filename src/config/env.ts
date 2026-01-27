import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface EnvConfig {
  port: number;
  baseUrl: string;
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  deepgram: {
    apiKey: string;
  };
  elevenlabs: {
    apiKey: string;
    voiceId: string;
  };
  openai: {
    apiKey: string;
  };
  databasePath: string;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.warn(`Warning: Missing environment variable ${name}`);
    return '';
  }
  return val;
}

export const env: EnvConfig = {
  port: parseInt(process.env.PORT || '3100', 10),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3100'}`,
  twilio: {
    accountSid: required('TWILIO_ACCOUNT_SID'),
    authToken: required('TWILIO_AUTH_TOKEN'),
    phoneNumber: required('TWILIO_PHONE_NUMBER'),
  },
  deepgram: {
    apiKey: required('DEEPGRAM_API_KEY'),
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // default Adam voice
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
  },
  databasePath: process.env.DATABASE_PATH || './data/barberbot.db',
};
