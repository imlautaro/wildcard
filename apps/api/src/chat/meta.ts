import { NonRetryableError } from 'cloudflare:workflows';

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { filename: string; file_data: string } })[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };
export type ModelTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
type ModelOptions = { tools?: ModelTool[]; responseFormat?: Record<string, unknown>; maxTokens?: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function museCompletion(key: string | undefined, messages: ModelMessage[], configuredModel?: string,
  options: ModelOptions = {}): Promise<Extract<ModelMessage, { role: 'assistant' }>> {
  if (!key?.trim()) throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  const model = configuredModel ?? 'muse-spark-1.3';
  if (model !== 'muse-spark-1.3' && model !== 'muse-spark-1.3-contributor') {
    throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  }
  const response = await fetch('https://api.meta.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: options.maxTokens ?? 4096,
      reasoning_effort: 'low', stream: false,
      ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
    // Workers supports manual redirects; never forward the provider credential.
    redirect: 'manual',
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new Error('MODEL_TEMPORARILY_UNAVAILABLE');
    throw new NonRetryableError('MODEL_REQUEST_REJECTED');
  }
  if (!response.body) throw new Error('MODEL_EMPTY_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let json = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256 * 1024) throw new NonRetryableError('MODEL_RESPONSE_TOO_LARGE');
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('MODEL_INVALID_JSON'); }
  if (!isRecord(value) || !Array.isArray(value.choices)) throw new Error('MODEL_INVALID_RESPONSE');
  const choice: unknown = value.choices[0];
  if (!isRecord(choice) || choice.finish_reason === 'length') throw new Error('MODEL_INCOMPLETE_RESPONSE');
  const message = choice.message;
  if (!isRecord(message)) throw new Error('MODEL_EMPTY_RESPONSE');
  const content = typeof message.content === 'string' ? message.content.trim() : null;
  if (content && Array.from(content).length > 20_000) throw new NonRetryableError('MODEL_RESPONSE_TOO_LARGE');
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    if (!options.tools?.length || message.tool_calls.length > 4) throw new Error('MODEL_INVALID_TOOL_CALLS');
    if (content && new TextEncoder().encode(content).byteLength > 2000) throw new Error('MODEL_TOOL_TEXT_TOO_LARGE');
    const toolCalls: ToolCall[] = [];
    for (const call of message.tool_calls) {
      if (!isRecord(call) || typeof call.id !== 'string' || !call.id || call.id.length > 200 ||
        call.type !== 'function' || !isRecord(call.function) || typeof call.function.name !== 'string' ||
        call.function.name.length > 80 || typeof call.function.arguments !== 'string' ||
        new TextEncoder().encode(call.function.arguments).byteLength >
          (call.function.name === 'send_group_message' ? 16000
            : ['create_schedule', 'update_schedule', 'ask_agent_in_group'].includes(call.function.name) ? 6000 : 1000) ||
        toolCalls.some((previous) => previous.id === call.id)) throw new Error('MODEL_INVALID_TOOL_CALLS');
      toolCalls.push({ id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments } });
    }
    return { role: 'assistant', content, tool_calls: toolCalls };
  }
  if (!content) throw new Error('MODEL_EMPTY_RESPONSE');
  return { role: 'assistant', content };
}
