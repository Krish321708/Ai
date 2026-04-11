/**
 * hf.ts — Low-level Hugging Face Inference API client
 * OpenAI-compatible endpoint, supports streaming and non-streaming.
 */

const HF_BASE = 'https://api-inference.huggingface.co/v1';

export type HFMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function token(): string {
  const t = process.env.HF_TOKEN;
  if (!t || t === 'hf_your_token_here') {
    throw new Error('HF_TOKEN missing. Add it to .env.local');
  }
  return t;
}

/** Non-streaming completion — returns full text */
export async function complete(
  model: string,
  messages: HFMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const res = await fetch(`${HF_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HF ${res.status} [${model}]: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** Streaming completion — yields text chunks via AsyncGenerator */
export async function* stream(
  model: string,
  messages: HFMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): AsyncGenerator<string> {
  const res = await fetch(`${HF_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.5,
      stream: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HF stream ${res.status} [${model}]: ${txt.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') return;
        try {
          const parsed = JSON.parse(d);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) yield delta;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
