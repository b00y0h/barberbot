import {
  ConverseCommand,
  ConversationRole,
  ContentBlock,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import { getBedrockRuntimeClient, BEDROCK_MODEL_CONVERSATION } from './bedrock-client';
import { bedrockTools, BedrockMessage, ToolUseBlock, ToolResultBlock } from './bedrock-tools';
import { getBusinessProfile } from '../config/business';
import { buildSystemPrompt } from '../prompts/system';
import {
  findCustomerByPhone,
  createCustomer,
  createAppointment,
  checkAvailability,
} from './customers';

/**
 * Conversation state - adapted for Bedrock format
 * Key difference: system prompt stored separately (not in messages array)
 */
export interface ConversationState {
  messages: BedrockMessage[];
  systemPrompt: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  appointmentBooked: boolean;
  leadCaptured: boolean;
}

/**
 * Create a new conversation state for a caller
 * Note: System prompt is stored separately for Bedrock (not in messages)
 */
export function createConversation(callerPhone: string): ConversationState {
  const profile = getBusinessProfile();
  const existingCustomer = findCustomerByPhone(callerPhone);

  const systemPrompt = buildSystemPrompt(profile, existingCustomer?.name || undefined);

  return {
    messages: [], // Bedrock: system prompt is separate, not in messages
    systemPrompt,
    customerName: existingCustomer?.name || undefined,
    customerPhone: callerPhone,
    appointmentBooked: false,
    leadCaptured: !!existingCustomer,
  };
}

/**
 * Execute a tool call and return the result
 * This is the same business logic as the OpenAI version - only format changes
 */
function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  state: ConversationState,
  callerPhone: string
): unknown {
  const profile = getBusinessProfile();

  switch (name) {
    case 'collect_customer_info': {
      const argName = args.name as string | undefined;
      const argPhone = args.phone as string | undefined;
      const argEmail = args.email as string | undefined;

      if (argName) state.customerName = argName;
      if (argPhone) state.customerPhone = argPhone;
      if (argEmail) state.customerEmail = argEmail;

      const phone = argPhone || state.customerPhone || callerPhone;
      if (phone) {
        const customer = createCustomer({
          name: argName || state.customerName,
          phone,
          email: argEmail || state.customerEmail,
        });
        state.leadCaptured = true;
        return { success: true, customer_id: customer.id, message: 'Customer info saved' };
      }
      return { success: true, message: 'Info noted, but no phone number to save yet' };
    }

    case 'check_availability': {
      const date = args.date as string;
      const staff = args.staff as string | undefined;
      const existing = checkAvailability(date, staff);
      const bookedTimes = existing.map(a => `${a.time} (${a.service} with ${a.staff || 'any barber'})`);

      if (bookedTimes.length === 0) {
        return { available: true, message: `${date} is wide open! All time slots available.` };
      }
      return {
        available: true,
        booked_slots: bookedTimes,
        message: `Some slots are booked on ${date}: ${bookedTimes.join(', ')}. Other times are available.`,
      };
    }

    case 'book_appointment': {
      const service = args.service as string;
      const date = args.date as string;
      const time = args.time as string;
      const staff = args.staff as string | undefined;
      const customerName = args.customer_name as string | undefined;
      const customerPhone = args.customer_phone as string | undefined;

      const phone = customerPhone || state.customerPhone || callerPhone;
      let customerId: number | undefined;

      if (phone) {
        const customer = createCustomer({
          name: customerName || state.customerName,
          phone,
        });
        customerId = customer.id;
        state.leadCaptured = true;
      }

      const serviceInfo = profile.services.find(
        s => s.name.toLowerCase() === service.toLowerCase()
      );

      const appointment = createAppointment({
        customer_id: customerId,
        service,
        staff: staff || undefined,
        date,
        time,
        duration: serviceInfo?.duration || 30,
      });

      state.appointmentBooked = true;
      return {
        success: true,
        appointment_id: appointment.id,
        message: `Appointment booked: ${service} on ${date} at ${time}${staff ? ` with ${staff}` : ''}`,
      };
    }

    case 'get_business_info': {
      const topic = args.topic as string;
      switch (topic) {
        case 'hours':
          return { hours: profile.hours };
        case 'services':
        case 'pricing':
          return { services: profile.services };
        case 'location':
          return { address: profile.address, phone: profile.phone };
        case 'policies':
          return { policies: profile.policies };
        case 'staff':
          return { staff: profile.staff };
        default:
          return { error: 'Unknown topic' };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Generate initial greeting using Bedrock Claude
 */
export async function getGreeting(state: ConversationState): Promise<string> {
  try {
    const client = getBedrockRuntimeClient();

    const response = await client.send(
      new ConverseCommand({
        modelId: BEDROCK_MODEL_CONVERSATION,
        messages: state.messages as Message[],
        system: [{ text: state.systemPrompt }],
        toolConfig: { tools: bedrockTools },
        inferenceConfig: {
          maxTokens: 150,
          temperature: 0.7,
        },
      })
    );

    const assistantMessage = response.output?.message;
    const textContent = assistantMessage?.content?.find(
      (block): block is ContentBlock.TextMember => 'text' in block
    );

    if (!textContent?.text) {
      return 'Thanks for calling, how can I help you?';
    }

    // Add assistant message to history
    state.messages.push({
      role: 'assistant',
      content: [{ text: textContent.text }],
    });

    return textContent.text;
  } catch (err) {
    console.error('[Bedrock] Error generating greeting:', err);
    return 'Thanks for calling, how can I help you?';
  }
}

/**
 * Process user message and return assistant response
 * Handles tool calling loop (up to 5 iterations)
 */
export async function processUserMessage(
  state: ConversationState,
  userText: string,
  callerPhone: string
): Promise<string> {
  // Add user message to history
  state.messages.push({
    role: 'user',
    content: [{ text: userText }],
  });

  const client = getBedrockRuntimeClient();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await client.send(
        new ConverseCommand({
          modelId: BEDROCK_MODEL_CONVERSATION,
          messages: state.messages as Message[],
          system: [{ text: state.systemPrompt }],
          toolConfig: { tools: bedrockTools },
          inferenceConfig: {
            maxTokens: 200,
            temperature: 0.7,
          },
        })
      );

      const assistantMessage = response.output?.message;
      const stopReason = response.stopReason;

      if (!assistantMessage) {
        break;
      }

      // Check for tool_use
      if (stopReason === 'tool_use') {
        // Add assistant message with tool_use blocks to history
        const toolUseBlocks = assistantMessage.content?.filter(
          (block): block is ContentBlock.ToolUseMember => 'toolUse' in block
        ) || [];

        // Build assistant content for history
        const assistantContent: Array<{ text: string } | ToolUseBlock> = [];
        const textBlock = assistantMessage.content?.find(
          (block): block is ContentBlock.TextMember => 'text' in block
        );
        if (textBlock?.text) {
          assistantContent.push({ text: textBlock.text });
        }
        for (const block of toolUseBlocks) {
          assistantContent.push({
            toolUse: {
              toolUseId: block.toolUse!.toolUseId!,
              name: block.toolUse!.name!,
              input: block.toolUse!.input as Record<string, unknown>,
            },
          });
        }
        state.messages.push({
          role: 'assistant',
          content: assistantContent,
        });

        // Execute tools and build tool_result blocks
        const toolResults: ToolResultBlock[] = [];
        for (const block of toolUseBlocks) {
          const toolUse = block.toolUse!;
          const result = handleToolCall(
            toolUse.name!,
            toolUse.input as Record<string, unknown>,
            state,
            callerPhone
          );

          toolResults.push({
            toolResult: {
              toolUseId: toolUse.toolUseId!,
              content: [{ json: result }],
            },
          });
        }

        // Add tool results as user message
        state.messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue loop to get final text response
        continue;
      }

      // No tool calls — extract text response
      const textContent = assistantMessage.content?.find(
        (block): block is ContentBlock.TextMember => 'text' in block
      );

      const text = textContent?.text || "I'm sorry, could you repeat that?";

      // Add assistant response to history
      state.messages.push({
        role: 'assistant',
        content: [{ text }],
      });

      return text;
    } catch (err) {
      console.error('[Bedrock] Error processing message:', err);
      break;
    }
  }

  return "I'm sorry, I'm having a bit of trouble. Could you repeat that?";
}

/**
 * Get transcript of conversation (user and assistant text only)
 * Excludes tool_use and tool_result blocks
 */
export function getTranscript(state: ConversationState): string {
  const lines: string[] = [];

  for (const message of state.messages) {
    // Find text content (skip tool_use and tool_result blocks)
    const textBlock = message.content.find(
      (block): block is { text: string } => 'text' in block && typeof (block as { text?: string }).text === 'string'
    );

    if (textBlock?.text) {
      const speaker = message.role === 'user' ? 'Caller' : 'Bot';
      lines.push(`${speaker}: ${textBlock.text}`);
    }
  }

  return lines.join('\n');
}
