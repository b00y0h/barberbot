import { Tool } from '@aws-sdk/client-bedrock-runtime';

/**
 * Bedrock message types for conversation state
 * Note: System messages go in separate 'system' parameter, not in messages array
 */
export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: BedrockContentBlock[];
}

export type BedrockContentBlock =
  | { text: string }
  | ToolUseBlock
  | ToolResultBlock;

export interface ToolUseBlock {
  toolUse: {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface ToolResultBlock {
  toolResult: {
    toolUseId: string;
    content: Array<{ text?: string; json?: unknown }>;
  };
}

/**
 * System prompt content block type
 */
export interface SystemContentBlock {
  text: string;
}

/**
 * Tool definitions in AWS Bedrock format
 * Converted from OpenAI's { type: 'function', function: { name, description, parameters } }
 * to Bedrock's { toolSpec: { name, description, inputSchema: { json: {...} } } }
 */
export const bedrockTools: Tool[] = [
  {
    toolSpec: {
      name: 'collect_customer_info',
      description: 'Save or update customer information when they provide their name, phone, or email',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Customer name' },
            phone: { type: 'string', description: 'Customer phone number' },
            email: { type: 'string', description: 'Customer email address' },
          },
          required: [],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'check_availability',
      description: 'Check appointment availability for a specific date, optionally for a specific barber',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date to check (YYYY-MM-DD format)' },
            staff: { type: 'string', description: 'Optional: specific barber name' },
          },
          required: ['date'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'book_appointment',
      description: 'Book an appointment for the customer',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            service: { type: 'string', description: 'Service name (e.g., "Fade", "Regular Haircut")' },
            date: { type: 'string', description: 'Appointment date (YYYY-MM-DD)' },
            time: { type: 'string', description: 'Appointment time (e.g., "2:00 PM")' },
            staff: { type: 'string', description: 'Preferred barber name' },
            customer_name: { type: 'string', description: 'Customer name' },
            customer_phone: { type: 'string', description: 'Customer phone number' },
          },
          required: ['service', 'date', 'time'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_business_info',
      description: 'Get specific business information like hours, services, pricing, location, or policies',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: ['hours', 'services', 'location', 'policies', 'staff', 'pricing'],
              description: 'What info to retrieve',
            },
          },
          required: ['topic'],
        },
      },
    },
  },
];
