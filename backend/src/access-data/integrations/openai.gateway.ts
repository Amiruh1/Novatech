const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 12_000;

export interface StructuredCompletionRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  schemaName: string;
  schema: Record<string, unknown>;
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

// El adaptador conoce el protocolo del proveedor, pero no los temas ni las
// reglas de Nova. Devuelve el texto para que business lo interprete.
export async function requestStructuredCompletion(
  input: StructuredCompletionRequest,
  signal?: AbortSignal,
  request: typeof fetch = fetch
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const classic = model.startsWith('gpt-4');
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: input.schemaName, strict: true, schema: input.schema }
    },
    max_completion_tokens: classic ? 400 : 1500
  };
  if (classic) body['temperature'] = 0;

  try {
    const response = await request(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as any;
      console.warn(`Nova: OpenAI respondió ${response.status}${error?.error?.code ? ` (${error.error.code})` : ''}`);
      return null;
    }
    const data = await response.json() as any;
    const choice = data?.choices?.[0];
    if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal) return null;
    return choice.message?.content ?? null;
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError' && (error as Error)?.name !== 'TimeoutError') {
      console.warn('Nova: no se pudo consultar OpenAI');
    }
    return null;
  }
}
