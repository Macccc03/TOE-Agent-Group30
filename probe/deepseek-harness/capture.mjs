// Shared, bounded capture rules. Only redacted values leave the probe.
const SECRET_FIELD = /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie/i;

export function redactText(value) {
  return String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '<REDACTED_API_KEY>')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer <REDACTED>')
    .replace(/\b1[3-9]\d{9}\b/g, '<REDACTED_PHONE>')
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1<REDACTED>');
}

export function safeValue(value, { maxChars = 16000, maxNodes = 512 } = {}) {
  let remaining = maxChars;
  let nodes = maxNodes;
  let truncated = false;
  const seen = new WeakSet();
  function text(value) {
    const clean = redactText(value);
    const kept = clean.slice(0, Math.max(0, remaining));
    remaining -= kept.length;
    if (kept.length < clean.length) truncated = true;
    return kept;
  }
  function visit(item, depth, key = '') {
    if (SECRET_FIELD.test(key)) return '<REDACTED>';
    if (--nodes < 0 || depth > 8) { truncated = true; return '<TRUNCATED>'; }
    if (item == null || typeof item === 'boolean') return item ?? null;
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (typeof item === 'string') {
      if (key === 'arguments' && /^[\s]*[\[{]/.test(item) && item.length <= 1_000_000) {
        try { return visit(JSON.parse(item), depth + 1); } catch { /* Raw malformed arguments. */ }
      }
      return text(item);
    }
    if (typeof item !== 'object') return text(String(item));
    if (seen.has(item)) { truncated = true; return '<CIRCULAR>'; }
    // Omit large binary payloads and provider reasoning text by default.
    if (['image', 'file', 'reasoning'].includes(item.type)) {
      return { type: item.type, omitted: true };
    }
    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      if (item.length > 64) truncated = true;
      result = item.slice(0, 64).map((part) => visit(part, depth + 1));
    } else {
      result = {};
      const keys = Object.keys(item);
      if (keys.length > 64) truncated = true;
      for (const field of keys.slice(0, 64)) {
        if (field === '__proto__' || field === 'constructor') continue;
        result[field] = visit(item[field], depth + 1, field);
      }
    }
    seen.delete(item);
    return result;
  }
  return { value: visit(value, 0), truncated };
}

export function captureText(value, { enabled = true, maxChars = 16000 } = {}) {
  if (!enabled) return { text: '', truncated: false };
  // JSON tool arguments need structural redaction of password/api_key fields.
  let input = value;
  if (typeof value === 'string' && /^[\s]*[\[{]/.test(value) && value.length <= 1_000_000) {
    try { input = JSON.parse(value); } catch { /* Keep malformed arguments as text. */ }
  }
  const safe = safeValue(input, { maxChars });
  const text = typeof safe.value === 'string' ? safe.value : JSON.stringify(safe.value);
  return { text: text.slice(0, maxChars), truncated: safe.truncated || text.length > maxChars };
}

export function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  return (message?.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text).join('\n');
}

export function requestMessages(options) {
  const messages = [];
  if (options.system !== undefined) messages.push({ role: 'system', content: options.system });
  for (const message of options.messages ?? []) {
    // Exclude replay metadata, native provider state, and authentication fields.
    const item = { role: message.role, content: message.content };
    if (message.toolCallId !== undefined) item.toolCallId = message.toolCallId;
    messages.push(item);
  }
  return messages;
}

export function usageAttributes(usage) {
  const count = (key) => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0 ? usage[key] : undefined;
  const uncached = count('inputTokens'), output = count('outputTokens');
  if (uncached === undefined || output === undefined) return {};
  const read = count('cacheReadTokens') ?? 0, write = count('cacheWriteTokens') ?? 0;
  const prompt = uncached + read + write;
  const attrs = {
    'llm.token_count.prompt': prompt,
    'llm.token_count.completion': output,
    'llm.token_count.total': count('totalTokens') ?? prompt + output,
    'dsh.usage.reported': true,
  };
  for (const [source, target] of [
    ['cacheReadTokens', 'llm.token_count.prompt_details.cache_read'],
    ['cacheWriteTokens', 'llm.token_count.prompt_details.cache_write'],
    ['reasoningTokens', 'llm.token_count.completion_details.reasoning'],
  ]) {
    const value = count(source);
    if (value !== undefined) attrs[target] = value;
  }
  return attrs;
}