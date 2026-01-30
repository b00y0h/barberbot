import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export interface EnvConfig {
  port: number;
  baseUrl: string;
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  aws: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  databasePath: string;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.warn(`Warning: Missing environment variable ${name}`);
    return "";
  }
  return val;
}

/**
 * Validate that legacy provider environment variables are not set.
 * These providers have been replaced by AWS services.
 *
 * @returns Array of error messages (empty if no legacy vars found)
 */
export function validateNoLegacyProviders(): string[] {
  const errors: string[] = [];
  const legacyVars = [
    { name: "OPENAI_API_KEY", replacement: "AWS_ACCESS_KEY_ID (Bedrock)" },
    { name: "DEEPGRAM_API_KEY", replacement: "AWS_ACCESS_KEY_ID (Transcribe)" },
    { name: "ELEVENLABS_API_KEY", replacement: "AWS_ACCESS_KEY_ID (Polly)" },
  ];

  for (const { name, replacement } of legacyVars) {
    if (process.env[name]) {
      errors.push(
        `Legacy environment variable ${name} is set but no longer used. ` +
          `Remove it and configure ${replacement} instead.`,
      );
    }
  }

  return errors;
}

export const env: EnvConfig = {
  port: parseInt(process.env.PORT || "3100", 10),
  baseUrl:
    process.env.BASE_URL || `http://localhost:${process.env.PORT || "3100"}`,
  twilio: {
    accountSid: required("TWILIO_ACCOUNT_SID"),
    authToken: required("TWILIO_AUTH_TOKEN"),
    phoneNumber: required("TWILIO_PHONE_NUMBER"),
  },
  aws: {
    accessKeyId: required("AWS_ACCESS_KEY_ID"),
    secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
    region: process.env.AWS_REGION || "us-east-2",
  },
  databasePath: process.env.DATABASE_PATH || "./data/barberbot.db",
};
