// FormMitra — Unified Gemini & Groq Provider Client (Chat JSON, Model Discovery & Voice Transcription)

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ_BASE = 'https://api.groq.com/openai/v1';

const GEMINI_EXCLUDE_RX = /(embed|imagen|veo|aqa|tts|native-audio|image-generation|-image\b|robotics|computer-use)/i;
const GROQ_EXCLUDE_RX = /(whisper|tts|guard|embed|moderation|audio|stt|orpheus)/i;

export class ProviderError extends Error {
  constructor(provider, status, summary, rawMessage, retryAfterMs = 0) {
    super(`${summary}: ${rawMessage}`);
    this.provider = provider;
    this.status = status;
    this.summary = summary;
    this.rawMessage = rawMessage;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(headerVal) {
  if (!headerVal) return 30000;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds > 0) return Math.max(1000, Math.round(seconds * 1000));
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) return Math.max(1000, dateMs - Date.now());
  return 30000;
}

async function readRawError(resp) {
  const text = await resp.text().catch(() => '');
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) return String(parsed.error.message);
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch (_) {}
    return text.slice(0, 300);
  }
  return resp.statusText || `HTTP ${resp.status}`;
}

function mapHttpError(provider, status, rawMessage, retryAfterHeader) {
  if (status === 401 || status === 403) return new ProviderError(provider, status, 'Invalid API key', rawMessage);
  if (status === 400 || status === 404) return new ProviderError(provider, status, 'Model or request problem', rawMessage);
  if (status === 429) return new ProviderError(provider, status, 'Rate limit reached', rawMessage, parseRetryAfterMs(retryAfterHeader));
  if (status >= 500) return new ProviderError(provider, status, 'Provider busy', rawMessage);
  return new ProviderError(provider, status, `Request error (HTTP ${status})`, rawMessage);
}

function parseJsonPayload(rawText) {
  if (!rawText || typeof rawText !== 'string') throw new Error('Empty response text from provider.');
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Provider response was not valid JSON.');
  }
}

export function normalizeLangCode(rawLang) {
  const s = String(rawLang || '').trim().toLowerCase();
  if (s === 'en' || s.startsWith('eng')) return 'en';
  if (s === 'hi' || s.startsWith('hin')) return 'hi';
  if (s === 'kn' || s.startsWith('kan')) return 'kn';
  return 'other';
}

function base64ToBlob(base64, mimeType) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'audio/webm' });
}

async function callGemini({ apiKey, model, systemPrompt, messages, signal }) {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    })),
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal
    });
  } catch (netErr) {
    throw new ProviderError('gemini', 0, 'Network error', netErr.message);
  }

  if (!resp.ok) throw mapHttpError('gemini', resp.status, await readRawError(resp), resp.headers.get('retry-after'));

  const json = await resp.json();
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  try {
    return { ok: true, data: parseJsonPayload(text), provider: 'gemini', model };
  } catch (parseErr) {
    throw new ProviderError('gemini', 200, 'Invalid JSON output', parseErr.message);
  }
}

async function callGroq({ apiKey, model, systemPrompt, messages, signal }) {
  const fullMessages = [];
  if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
  messages.forEach((m) => fullMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));

  let resp;
  try {
    resp = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: fullMessages, response_format: { type: 'json_object' }, temperature: 0.2 }),
      signal
    });
  } catch (netErr) {
    throw new ProviderError('groq', 0, 'Network error', netErr.message);
  }

  if (!resp.ok) throw mapHttpError('groq', resp.status, await readRawError(resp), resp.headers.get('retry-after'));

  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content || '';
  try {
    return { ok: true, data: parseJsonPayload(text), provider: 'groq', model };
  } catch (parseErr) {
    throw new ProviderError('groq', 200, 'Invalid JSON output', parseErr.message);
  }
}

export function callProvider({ provider, apiKey, model, systemPrompt, messages, signal }) {
  if (provider === 'gemini') return callGemini({ apiKey, model, systemPrompt, messages, signal });
  if (provider === 'groq') return callGroq({ apiKey, model, systemPrompt, messages, signal });
  throw new ProviderError(provider, 400, 'Unknown provider', String(provider));
}

export async function transcribeAudio({ provider, apiKey, model, base64, mimeType }) {
  if (provider === 'groq') {
    const cleanMime = String(mimeType || 'audio/webm').split(';')[0];
    const form = new FormData();
    form.append('file', base64ToBlob(base64, cleanMime), 'recording.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');

    let resp;
    try {
      resp = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
    } catch (netErr) {
      throw new ProviderError('groq', 0, 'Network error', netErr.message);
    }

    if (!resp.ok) throw mapHttpError('groq', resp.status, await readRawError(resp), resp.headers.get('retry-after'));
    const json = await resp.json();
    return {
      ok: true,
      data: { text: String(json.text || '').trim(), language: normalizeLangCode(json.language) },
      provider: 'groq',
      model: 'whisper-large-v3-turbo'
    };
  }

  if (provider === 'gemini') {
    const cleanMime = String(mimeType || 'audio/webm').split(';')[0];
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
    const prompt = 'Transcribe exactly as spoken in the original language and script (Kannada in Kannada script, Hindi in Devanagari). Do not translate. Return ONLY JSON {"text": string, "language": "en"|"hi"|"kn"|"other"}. If no speech, text is empty.';

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: cleanMime, data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 }
        })
      });
    } catch (netErr) {
      throw new ProviderError('gemini', 0, 'Network error', netErr.message);
    }

    if (!resp.ok) throw mapHttpError('gemini', resp.status, await readRawError(resp), resp.headers.get('retry-after'));
    const json = await resp.json();
    const rawText = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    try {
      const parsed = parseJsonPayload(rawText);
      return {
        ok: true,
        data: { text: String(parsed.text || '').trim(), language: normalizeLangCode(parsed.language) },
        provider: 'gemini',
        model
      };
    } catch (parseErr) {
      throw new ProviderError('gemini', 200, 'Invalid JSON output', parseErr.message);
    }
  }

  throw new ProviderError(provider, 400, 'Unknown provider', String(provider));
}

export async function listProviderModels(provider, apiKey) {
  if (!apiKey) throw new ProviderError(provider, 401, 'Missing API key', 'Add an API key first.');

  if (provider === 'gemini') {
    let resp;
    try {
      resp = await fetch(`${GEMINI_BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': apiKey } });
    } catch (netErr) {
      throw new ProviderError('gemini', 0, 'Network error', netErr.message);
    }
    if (!resp.ok) throw mapHttpError('gemini', resp.status, await readRawError(resp), resp.headers.get('retry-after'));
    const json = await resp.json();
    const models = (json.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), name: m.displayName || String(m.name || '').replace(/^models\//, '') }))
      .filter((m) => m.id && !GEMINI_EXCLUDE_RX.test(m.id));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  }

  if (provider === 'groq') {
    let resp;
    try {
      resp = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (netErr) {
      throw new ProviderError('groq', 0, 'Network error', netErr.message);
    }
    if (!resp.ok) throw mapHttpError('groq', resp.status, await readRawError(resp), resp.headers.get('retry-after'));
    const json = await resp.json();
    const models = (json.data || [])
      .filter((m) => m.active !== false && m.id && !GROQ_EXCLUDE_RX.test(m.id))
      .map((m) => ({ id: m.id, name: m.id }));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  }

  throw new ProviderError(provider, 400, 'Unknown provider', String(provider));
}
