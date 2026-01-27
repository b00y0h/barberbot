import OpenAI from 'openai';
import { env } from '../config/env';
import { getBusinessProfile } from '../config/business';
import { buildSystemPrompt } from '../prompts/system';
import {
  findCustomerByPhone,
  createCustomer,
  createAppointment,
  checkAvailability,
} from './customers';

const openai = new OpenAI({ apiKey: env.openai.apiKey });

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ConversationState {
  messages: ConversationMessage[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  appointmentBooked: boolean;
  leadCaptured: boolean;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'collect_customer_info',
      description: 'Save or update customer information when they provide their name, phone, or email',
      parameters: {
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
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check appointment availability for a specific date, optionally for a specific barber',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to check (YYYY-MM-DD format)' },
          staff: { type: 'string', description: 'Optional: specific barber name' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book an appointment for the customer',
      parameters: {
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
  {
    type: 'function',
    function: {
      name: 'get_business_info',
      description: 'Get specific business information like hours, services, pricing, location, or policies',
      parameters: {
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
];

function handleToolCall(
  name: string,
  args: Record<string, string>,
  state: ConversationState,
  callerPhone: string
): string {
  const profile = getBusinessProfile();

  switch (name) {
    case 'collect_customer_info': {
      if (args.name) state.customerName = args.name;
      if (args.phone) state.customerPhone = args.phone;
      if (args.email) state.customerEmail = args.email;

      const phone = args.phone || state.customerPhone || callerPhone;
      if (phone) {
        const customer = createCustomer({
          name: args.name || state.customerName,
          phone,
          email: args.email || state.customerEmail,
        });
        state.leadCaptured = true;
        return JSON.stringify({ success: true, customer_id: customer.id, message: 'Customer info saved' });
      }
      return JSON.stringify({ success: true, message: 'Info noted, but no phone number to save yet' });
    }

    case 'check_availability': {
      const existing = checkAvailability(args.date, args.staff);
      const bookedTimes = existing.map(a => `${a.time} (${a.service} with ${a.staff || 'any barber'})`);

      if (bookedTimes.length === 0) {
        return JSON.stringify({ available: true, message: `${args.date} is wide open! All time slots available.` });
      }
      return JSON.stringify({
        available: true,
        booked_slots: bookedTimes,
        message: `Some slots are booked on ${args.date}: ${bookedTimes.join(', ')}. Other times are available.`,
      });
    }

    case 'book_appointment': {
      const phone = args.customer_phone || state.customerPhone || callerPhone;
      let customerId: number | undefined;

      if (phone) {
        const customer = createCustomer({
          name: args.customer_name || state.customerName,
          phone,
        });
        customerId = customer.id;
        state.leadCaptured = true;
      }

      const service = profile.services.find(
        s => s.name.toLowerCase() === args.service.toLowerCase()
      );

      const appointment = createAppointment({
        customer_id: customerId,
        service: args.service,
        staff: args.staff || undefined,
        date: args.date,
        time: args.time,
        duration: service?.duration || 30,
      });

      state.appointmentBooked = true;
      return JSON.stringify({
        success: true,
        appointment_id: appointment.id,
        message: `Appointment booked: ${args.service} on ${args.date} at ${args.time}${args.staff ? ` with ${args.staff}` : ''}`,
      });
    }

    case 'get_business_info': {
      switch (args.topic) {
        case 'hours':
          return JSON.stringify({ hours: profile.hours });
        case 'services':
        case 'pricing':
          return JSON.stringify({ services: profile.services });
        case 'location':
          return JSON.stringify({ address: profile.address, phone: profile.phone });
        case 'policies':
          return JSON.stringify({ policies: profile.policies });
        case 'staff':
          return JSON.stringify({ staff: profile.staff });
        default:
          return JSON.stringify({ error: 'Unknown topic' });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export function createConversation(callerPhone: string): ConversationState {
  const profile = getBusinessProfile();
  const existingCustomer = findCustomerByPhone(callerPhone);

  const state: ConversationState = {
    messages: [],
    customerName: existingCustomer?.name || undefined,
    customerPhone: callerPhone,
    appointmentBooked: false,
    leadCaptured: !!existingCustomer,
  };

  const systemPrompt = buildSystemPrompt(profile, existingCustomer?.name || undefined);
  state.messages.push({ role: 'system', content: systemPrompt });

  return state;
}

export async function getGreeting(state: ConversationState): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: state.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools,
    max_tokens: 150,
    temperature: 0.7,
  });

  const msg = response.choices[0]?.message;
  if (!msg?.content) return 'Thanks for calling, how can I help you?';

  state.messages.push({ role: 'assistant', content: msg.content });
  return msg.content;
}

export async function processUserMessage(
  state: ConversationState,
  userText: string,
  callerPhone: string
): Promise<string> {
  state.messages.push({ role: 'user', content: userText });

  let attempts = 0;
  const maxAttempts = 5; // prevent infinite tool call loops

  while (attempts < maxAttempts) {
    attempts++;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: state.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      max_tokens: 200,
      temperature: 0.7,
    });

    const choice = response.choices[0];
    if (!choice?.message) break;

    const msg = choice.message;

    // If there are tool calls, handle them
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Push the assistant message with tool calls
      state.messages.push({
        role: 'assistant',
        content: msg.content || '',
      });

      for (const toolCall of msg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = handleToolCall(toolCall.function.name, args, state, callerPhone);

        state.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Continue loop to get the final text response
      continue;
    }

    // No tool calls — we have a text response
    const text = msg.content || "I'm sorry, could you repeat that?";
    state.messages.push({ role: 'assistant', content: text });
    return text;
  }

  return "I'm sorry, I'm having a bit of trouble. Could you repeat that?";
}

export async function generateCallSummary(state: ConversationState): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Summarize this phone call transcript in 2-3 sentences. Include: caller intent, outcome, and any action items.',
        },
        {
          role: 'user',
          content: state.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role === 'user' ? 'Caller' : 'Bot'}: ${m.content}`)
            .join('\n'),
        },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || 'No summary available';
  } catch (err) {
    console.error('[Conversation] Error generating summary:', err);
    return 'Summary generation failed';
  }
}

export function getTranscript(state: ConversationState): string {
  return state.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'Caller' : 'Bot'}: ${m.content}`)
    .join('\n');
}
