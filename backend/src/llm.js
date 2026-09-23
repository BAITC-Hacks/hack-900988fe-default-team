// Provider configuration is server-side only; never include it in API responses.
export function llmConfig(env = process.env) {
  if (env.LLM_BASE_URL === undefined) {
    if (!env.OPENAI_API_KEY?.trim()) return null;
    return {
      protocol: 'responses', url: 'https://api.openai.com/v1/responses',
      model: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini', timeoutMs: 12000,
      headers: new Headers({ Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }),
    };
  }
  if (!env.LLM_BASE_URL.trim()) return null;
  const base = new URL(env.LLM_BASE_URL.trim());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid LLM base URL');
  const apiPath = env.LLM_API_PATH?.trim() || '/chat/completions';
  if (!/^\/?[a-zA-Z0-9_/-]+$/.test(apiPath) || apiPath.startsWith('//')) throw new Error('Invalid LLM API path');
  const url = `${base.href.replace(/\/+$/, '')}/${apiPath.replace(/^\//, '')}`;
  const model = env.LLM_MODEL_ANALYSIS?.trim() || env.LLM_MODEL?.trim();
  if (!model) throw new Error('Missing LLM model');
  const temperature = Number(env.LLM_TEMPERATURE?.trim() || '0.2');
  const timeoutMs = Number(env.LLM_TIMEOUT_S?.trim() || '60') * 1000;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error('Invalid temperature');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new Error('Invalid timeout');
  const extra = JSON.parse(env.LLM_EXTRA_HEADERS?.trim() || '{}');
  if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('Invalid extra headers');
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value !== 'string' || ['authorization', 'content-type', 'host', 'content-length'].includes(key.toLowerCase())) throw new Error('Invalid extra header');
    headers.set(key, value);
  }
  // Local OpenAI-compatible servers may deliberately run without authentication.
  if (env.LLM_API_KEY?.trim()) headers.set('Authorization', `Bearer ${env.LLM_API_KEY.trim()}`);
  return { protocol: 'chat', url, model, temperature, timeoutMs, headers };
}

export async function requestStructuredAnalysis(config, messages, schema) {
  const format = { name: 'task_analysis', strict: true, schema };
  const body = config.protocol === 'chat'
    ? { model: config.model, messages, temperature: config.temperature, stream: false, response_format: { type: 'json_schema', json_schema: format } }
    : { model: config.model, input: messages, text: { format: { type: 'json_schema', ...format } } };
  const response = await fetch(config.url, {
    method: 'POST', headers: config.headers, redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs), body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('LLM request failed');
  const payload = await response.json();
  if (payload?.error) throw new Error('LLM error response');
  if (config.protocol === 'chat') {
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason !== 'stop' || choice.message?.role !== 'assistant'
        || choice.message.refusal || choice.message.tool_calls?.length
        || typeof choice.message.content !== 'string') throw new Error('Incomplete LLM response');
    return choice.message.content;
  }
  if (payload?.status !== 'completed' || !Array.isArray(payload.output)) throw new Error('Incomplete OpenAI response');
  const content = payload.output.filter(item => item?.type === 'message' && item.role === 'assistant')
    .flatMap(item => Array.isArray(item.content) ? item.content : []);
  if (content.some(part => part?.type === 'refusal')) throw new Error('OpenAI refusal');
  return content.filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('');
}
