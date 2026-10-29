import { NonRetryableError } from 'cloudflare:workflows';

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { filename: string; file_data: string } })[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };
export type ModelTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
type ModelOptions = { tools?: ModelTool[]; responseFormat?: Record<string, unknown>; maxTokens?: number };

// Only emit bounded diagnostic codes, never exception text, provider bodies,
// SQL parameters or conversation content. Unknown errors stay deliberately vague.
export function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'UNEXPECTED_ERROR';
  if (/^(MODEL|GROUP|VOICE)_[A-Z_]{1,80}$/.test(error.message)) return error.message;
  if (error instanceof SyntaxError) return 'INVALID_JSON';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'REQUEST_TIMEOUT';
  if (error.message.startsWith('D1_')) return 'DATABASE_ERROR';
  return 'UNEXPECTED_ERROR';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function museCompletion(env: Env, messages: ModelMessage[], configuredModel?: string,
  options: ModelOptions = {}): Promise<Extract<ModelMessage, { role: 'assistant' }>> {
  const key = env.META_API_KEY;
  if (!key?.trim()) throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  const model = configuredModel ?? 'muse-spark-1.3';
  if (model !== 'muse-spark-1.3' && model !== 'muse-spark-1.3-contributor') {
    throw new NonRetryableError('MODEL_NOT_CONFIGURED');
  }
  const query = { model, messages, max_completion_tokens: options.maxTokens ?? 4096,
    reasoning_effort: 'low', stream: false,
    ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
  };
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  // Meta public USD rates, checked October 27, 2026. Costs are estimates,
  // including provider cache reads, not Cloudflare's own cached responses.
  const rates = model.endsWith('-contributor')
    ? { per_token_in: 0.10 / 1e6, per_token_out: 0.20 / 1e6, per_cache_read_token: 0.002 / 1e6 }
    : { per_token_in: 1.25 / 1e6, per_token_out: 4.25 / 1e6, per_cache_read_token: 0.15 / 1e6 };
  const response = env.AI_GATEWAY_ID
    ? await env.AI.gateway(env.AI_GATEWAY_ID).run({
      provider: 'custom-meta', endpoint: 'https://api.meta.ai/v1/chat/completions', headers, query,
    }, {
      gateway: { id: env.AI_GATEWAY_ID, skipCache: true, collectLog: true, retries: { maxAttempts: 1 }, requestTimeoutMs: 45_000 },
      extraHeaders: { 'cf-aig-collect-log-payload': 'false', 'cf-aig-custom-cost': JSON.stringify(rates) },
      signal: AbortSignal.timeout(45_000),
    })
    : await fetch('https://api.meta.ai/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(45_000),
    // Workers supports manual redirects; never forward the provider credential.
    redirect: 'manual',
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'model_request_failed',
      transport: env.AI_GATEWAY_ID ? 'gateway' : 'direct', status: response.status }));
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
          (['create_mini_app', 'create_document', 'edit_document', 'generate_chat_image'].includes(call.function.name) ? 30000
            : ['send_group_message', 'call_mcp_tool', 'create_task_list'].includes(call.function.name) ? 16000
            : ['add_task', 'update_task', 'request_changes'].includes(call.function.name) ? 6000
            : call.function.name === 'research_web' ? 4000
            : ['create_schedule', 'update_schedule', 'ask_agent_in_group'].includes(call.function.name) ? 6000 : 1000) ||
        toolCalls.some((previous) => previous.id === call.id)) throw new Error('MODEL_INVALID_TOOL_CALLS');
      toolCalls.push({ id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments } });
    }
    return { role: 'assistant', content, tool_calls: toolCalls };
  }
  if (!content) throw new Error('MODEL_EMPTY_RESPONSE');
  return { role: 'assistant', content };
}
