# Coding Conventions

**Analysis Date:** 2026-01-27

## Naming Patterns

**Files:**
- kebab-case for file names: `audio-pipeline.ts`, `call-manager.ts`, `stt.ts`, `tts.ts`
- Services grouped in `src/services/` directory
- Config files in `src/config/` directory
- Routes in `src/routes/` directory
- Database logic in `src/database/` directory
- Prompts in `src/prompts/` directory

**Functions:**
- camelCase for all functions: `createConversation()`, `findCustomerByPhone()`, `getDatabase()`, `handleMediaStream()`
- Private functions use underscore prefix: `_db`, `_profile`, `_client`
- Async functions clearly marked with `async` keyword
- Handler functions use `handle` prefix: `handleMediaStream()`, `handleToolCall()`, `handleUserUtterance()`

**Variables:**
- camelCase for all variables: `callSid`, `phoneNumber`, `isBotSpeaking`, `utteranceBuffer`
- Constants in UPPER_CASE: `BIAS = 0x84`, `CLIP = 32635`, `maxAttempts = 5`
- Private module-level variables prefixed with underscore: `_db`, `_profile`, `_client`, `_config`
- Event listeners named with `on` prefix: `stt.on('transcript', ...)`, `tts.on('audio', ...)`

**Types/Interfaces:**
- PascalCase for all types and interfaces: `ConversationState`, `ActiveCall`, `Customer`, `ServiceItem`, `BusinessProfile`
- Interface names use descriptive nouns without "I" prefix: `ConversationMessage` not `IConversationMessage`
- API response objects and request parameters follow similar interface patterns
- Enum-like types use Record<string, Type> pattern: `Record<string, BusinessHours | 'closed'>`

**Exports:**
- Named exports for functions: `export function createConversation()`
- Named exports for interfaces: `export interface ConversationState {}`
- Default exports for route handlers: `export default router;`

## Code Style

**Formatting:**
- TypeScript strict mode enabled in `tsconfig.json`
- No explicit formatter configuration (Prettier/ESLint config files not present)
- Code follows general JavaScript conventions with TypeScript types
- Single quotes used for string literals throughout codebase
- 2-space indentation observed in all files

**Linting:**
- No linter configuration detected (no `.eslintrc`, `eslint.config.js`, or `biome.json`)
- Code relies on TypeScript strict mode for type safety
- Type safety enforced through TypeScript compiler (`strict: true`)

**Semicolons:**
- Semicolons used consistently at end of statements
- Part of general TypeScript convention adherence

## Import Organization

**Order:**
1. Node.js built-in modules: `import path from 'path'`, `import fs from 'fs'`, `import { EventEmitter } from 'events'`
2. Third-party packages: `import express from 'express'`, `import WebSocket from 'ws'`, `import OpenAI from 'openai'`
3. Local config imports: `import { env } from '../config/env'`, `import { getBusinessProfile } from '../config/business'`
4. Local service/utility imports: `import { createConversation } from './conversation'`

**Path Aliases:**
- No path aliases configured
- Relative imports used throughout: `../config/`, `../services/`, `./database`
- All imports are relative paths from current file

## Error Handling

**Patterns:**
- Try-catch blocks for async operations that may fail
- Examples in `src/services/call-manager.ts`: catch blocks around `processUserMessage()`, `generateCallSummary()`, `makeOutboundCall()`
- Errors logged with context prefix: `console.error('[CallManager] Error processing utterance:', err)`
- Fallback responses for graceful degradation in conversation: `"I'm sorry, I didn't catch that. Could you say that again?"`
- Error throwing for critical configuration issues: `throw new Error('Twilio credentials not configured')`
- No custom error classes; relies on native Error objects with descriptive messages
- Errors propagated up call stack when they represent actual failures requiring caller handling

**Error Logging Pattern:**
```typescript
try {
  const summary = await generateCallSummary(call.conversation);
} catch (err) {
  console.error('[CallManager] Error generating summary:', err);
}
```

**Validation Errors:**
- Environment validation done at startup in `src/config/env.ts` with `required()` helper
- Function parameters validated inline: checking for falsy values before use
- Example: `if (!env.deepgram.apiKey) { throw new Error('DEEPGRAM_API_KEY is required'); }`

## Logging

**Framework:** console (native Node.js)

**Patterns:**
- Prefixed log entries with module/service name in brackets: `[Database]`, `[CallManager]`, `[AudioPipeline]`, `[STT]`, `[Voice]`
- Format: `console.log('[Module] Message')` or `console.error('[Module] Error:', err)`
- Used for initialization: `console.log('[Database] Connected: ${dbPath}')`
- Used for state transitions: `console.log('[STT] Deepgram connection opened')`
- Used for debugging: `console.log('[STT] Final: ${text}')`, `console.log('[AudioPipeline] Stream started: ...')`
- Error logging includes context about what failed
- Verbose startup messages with ASCII art branding in `src/index.ts`

**When to Log:**
- Service initialization and connection events
- Call lifecycle events (start, end, state changes)
- Message processing milestones
- Error conditions
- Not used for performance metrics or excessive internal state tracking

## Comments

**When to Comment:**
- Algorithm explanations: PCM to μ-law conversion algorithm in `src/services/tts.ts` includes detailed comment block
- Complex business logic: Tool call handling in `src/services/conversation.ts` has comments on tool call continuation
- Important configuration notes: "Keep-alive every 10s" in `src/services/stt.ts`
- Non-obvious behavior: "Continue loop to get the final text response" in conversation handling
- Generally light commenting; code structure is self-documenting through clear naming

**JSDoc/TSDoc:**
- Used sparingly
- Brief function documentation comments for public functions
- Example in `src/services/tts.ts`:
```typescript
/**
 * Linear16 PCM → G.711 μ-law conversion
 * Input: 16-bit signed PCM samples
 * Output: 8-bit μ-law encoded samples
 */
function pcmToMulaw(pcmBuffer: Buffer): Buffer {
```

- Block comments for utility functions and algorithms
- No @param or @return annotations observed
- Comments focus on "why" not "what" (code structure answers "what")

## Function Design

**Size:**
- Most functions 15-40 lines
- Small utility functions: 5-10 lines
- Complex orchestration functions may reach 60+ lines (e.g., `processUserMessage()` in conversation)
- No explicit size limit enforced; maintainability is driver

**Parameters:**
- Explicit named parameters preferred over options objects for simple functions
- Options/config objects used when multiple optional parameters: `{ name?: string; phone: string; email?: string; notes?: string }`
- Request/Response parameters from Express included directly
- Context objects (like `ConversationState`) passed explicitly

**Return Values:**
- Async functions return Promise with explicit type annotation: `Promise<string>`, `Promise<void>`, `Promise<ActiveCall>`
- Synchronous functions return explicit types: `Customer | undefined`, `ActiveCall[]`, `void`
- Null/undefined used for "not found" cases: `findCustomerByPhone()` returns `Customer | undefined`
- Arrays returned for collections: `getAllActiveCalls(): ActiveCall[]`
- Error states handled via throw or try-catch, not error return values

**Example of well-structured function:**
```typescript
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
    // ... implementation
  }

  return "I'm sorry, I'm having a bit of trouble. Could you repeat that?";
}
```

## Module Design

**Exports:**
- Services export single class or multiple named functions
- Example: `src/services/stt.ts` exports `DeepgramSTT` class
- Database module exports utility functions: `getDatabase()`, `closeDatabase()`
- Config modules export objects and functions: `env` object, `loadBusinessProfile()` function
- Routes export Express Router as default: `export default router;`

**Barrel Files:**
- No barrel files (index.ts) for re-exporting observed
- Each module imported directly from its file path
- Encourages explicit dependency tracking

**Module Naming:**
- Service files named after what they provide: `conversation.ts`, `call-manager.ts`, `stt.ts` (speech-to-text), `tts.ts` (text-to-speech)
- Clear responsibility boundary per file
- Database operations grouped in `database/` directory

---

*Convention analysis: 2026-01-27*
