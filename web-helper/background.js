/*
 * FormMitra — Background Service Worker (MV3)
 *
 * Message Actions:
 *   PING              (Background -> Content)            : { action: 'PING' } -> { ok: true, instanceId }
 *   SNAPSHOT          (Sidepanel -> Background -> Content) : { action: 'SNAPSHOT' } -> { ok, snapshot } | { ok: false, error, restricted? }
 *   FIND              (Sidepanel -> Background -> Content) : { action: 'FIND', query } -> { ok, count, index }
 *   FIND_NAV          (Sidepanel -> Background -> Content) : { action: 'FIND_NAV', dir: 'next'|'prev' } -> { ok, count, index }
 *   FIND_CLEAR        (Sidepanel -> Background -> Content) : { action: 'FIND_CLEAR' } -> { ok: true }
 *   CLICK             (Sidepanel -> Background -> Content) : { action: 'CLICK', id } -> { success, targetText?, navigated?, error? }
 *   TYPE              (Sidepanel -> Background -> Content) : { action: 'TYPE', target, text, id? } -> { success, target?, label?, error? }
 *   SCROLL            (Sidepanel -> Background -> Content) : { action: 'SCROLL', id?, direction? } -> { success }
 *   TRANSLATE_COLLECT (Sidepanel -> Background -> Content) : { action: 'TRANSLATE_COLLECT', targetLang, viewportOnly? } -> { ok, items, remainingCount }
 *   TRANSLATE_APPLY   (Sidepanel -> Background -> Content) : { action: 'TRANSLATE_APPLY', targetLang, entries } -> { ok, applied }
 *   TRANSLATE_RESTORE (Sidepanel -> Background -> Content) : { action: 'TRANSLATE_RESTORE' } -> { ok, restored }
 *   TRANSLATE_DIRTY   (Content -> Sidepanel broadcast)     : { action: 'TRANSLATE_DIRTY' } (no response required)
 *   FILL              (Sidepanel -> Background -> Content) : { action: 'FILL', entries: [{ id, value, tier }] } -> { ok, success, count }
 *   INSERT_VALUE      (Sidepanel -> Background -> Content) : { action: 'INSERT_VALUE', value } -> { ok, success, error? }
 *   HIGHLIGHT_CLEAR   (Sidepanel -> Background -> Content) : { action: 'HIGHLIGHT_CLEAR' } -> { ok: true }
 *   SPOTLIGHT         (Sidepanel -> Background -> Content) : { action: 'SPOTLIGHT', id, stepNum? } -> { ok, error? }
 *   SPOTLIGHT_CLEAR   (Sidepanel -> Background -> Content) : { action: 'SPOTLIGHT_CLEAR' } -> { ok: true }
 *   LLM_CALL          (Sidepanel -> Background)            : { action: 'LLM_CALL', systemPrompt, messages, taskId? } -> { ok, data, provider, model } | { ok: false, error, summary, code? }
 *   TRANSCRIBE        (Sidepanel -> Background)            : { action: 'TRANSCRIBE', base64, mimeType, taskId? } -> { ok, data: { text, language }, provider } | { ok: false, error, summary, code? }
 *   OPEN_URL          (Sidepanel -> Background)            : { action: 'OPEN_URL', url } -> { ok, success, url?, error? }
 *   CANCEL_TASK       (Sidepanel -> Background)            : { action: 'CANCEL_TASK', taskId? } -> { ok: true }
 *   TEST_PROVIDER     (Options -> Background)              : { action: 'TEST_PROVIDER', provider, apiKey?, model? } -> { ok, provider, model } | { ok: false, error, summary }
 *   LIST_MODELS       (Options -> Background)              : { action: 'LIST_MODELS', provider, apiKey? } -> { ok, models } | { ok: false, error, summary }
 */

import { getSettings, validateKeyForProvider } from './lib/storage.js';
import { callProvider, transcribeAudio, listProviderModels, ProviderError } from './lib/providers.js';

const RESTRICTED_URL_RX = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i;
const TAB_ACTIONS = new Set([
  'SNAPSHOT', 'FIND', 'FIND_NAV', 'FIND_CLEAR', 'CLICK', 'TYPE', 'SCROLL',
  'TRANSLATE_COLLECT', 'TRANSLATE_APPLY', 'TRANSLATE_RESTORE', 'FILL', 'INSERT_VALUE', 'HIGHLIGHT_CLEAR',
  'SPOTLIGHT', 'SPOTLIGHT_CLEAR'
]);

const cooldownUntil = { gemini: 0, groq: 0 };
const taskProviderAffinity = new Map();
const taskControllers = new Map();
let llmQueue = Promise.resolve();

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('[FormMitra:Background] setPanelBehavior error:', err.message);
  });
}

getSettings().catch(() => {});

function safeReply(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch (err) {
    console.warn('[FormMitra:Background] sendResponse failed:', err.message);
  }
}

function enqueueCall(fn) {
  const next = llmQueue.then(fn, fn);
  llmQueue = next.catch(() => {});
  return next;
}

function providerLabel(p) {
  return p === 'gemini' ? 'Gemini' : 'Groq';
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
        else resolve({ response });
      });
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

function waitForTabComplete(tabId, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function waitAfterClick(tabId) {
  let sawLoading = false;
  await new Promise((resolve) => {
    const onUpd = (id, info) => {
      if (id === tabId && info.status === 'loading') {
        sawLoading = true;
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpd);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); resolve(); }, 400);
  });

  if (sawLoading) {
    await waitForTabComplete(tabId, 5600);
    await new Promise((r) => setTimeout(r, 250));
  } else {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && tab.status === 'loading') await waitForTabComplete(tabId, 5600);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function ensureContentReady(tabId) {
  const ping = await sendTabMessage(tabId, { action: 'PING' });
  if (ping.response && ping.response.ok) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-helpers.js', 'content.js'] });
    await new Promise((r) => setTimeout(r, 60));
    return true;
  } catch (_) {
    return false;
  }
}

async function handleTabAction(message) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = (tabs && tabs[0]) || null;

  if (!tab || tab.id == null || tab.id < 0) return { ok: false, restricted: true, error: "I can't read this browser page" };
  const tabUrl = tab.url || tab.pendingUrl || '';
  if (!tabUrl || RESTRICTED_URL_RX.test(tabUrl)) return { ok: false, restricted: true, error: "I can't read this browser page" };
  if (message.action === 'SNAPSHOT' && tab.status === 'loading') await waitForTabComplete(tab.id, 3000);
  if (!(await ensureContentReady(tab.id))) return { ok: false, restricted: true, error: "I can't read this browser page" };

  let res = await sendTabMessage(tab.id, message);
  if (!res.response && message.action === 'CLICK') {
    await waitAfterClick(tab.id);
    return { success: true, ok: true, navigated: true };
  }

  if (!res.response) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-helpers.js', 'content.js'] });
      await new Promise((r) => setTimeout(r, 60));
      res = await sendTabMessage(tab.id, message);
    } catch (_) {
      return { ok: false, restricted: true, error: "I can't read this browser page" };
    }
  }

  if (!res.response) return { ok: false, error: res.error || 'Page did not respond. Please refresh and try again.' };
  if (message.action === 'CLICK' && (res.response.success || res.response.ok)) await waitAfterClick(tab.id);
  else if (message.action === 'TYPE' && (res.response.success || res.response.ok)) await new Promise((r) => setTimeout(r, 450));
  return res.response;
}

function buildProviderOrder(settings, taskId, autoDefault = 'gemini') {
  const configured = [];
  const primary = settings.whProvider === 'auto' ? autoDefault : settings.whProvider;
  const secondary = primary === 'gemini' ? 'groq' : 'gemini';
  const keyFor = (p) => (p === 'gemini' ? settings.whGeminiKey : settings.whGroqKey);
  const modelFor = (p) => (p === 'gemini' ? settings.whGeminiModel : settings.whGroqModel);

  const affinity = taskId && autoDefault === 'gemini' ? taskProviderAffinity.get(taskId) : null;
  if (affinity && keyFor(affinity)) configured.push(affinity);
  [primary, secondary].forEach((p) => {
    if (keyFor(p) && !configured.includes(p)) configured.push(p);
  });

  if (settings.whProvider === 'auto' && configured.length > 1) {
    const now = Date.now();
    configured.sort((a, b) => (cooldownUntil[a] > now ? 1 : 0) - (cooldownUntil[b] > now ? 1 : 0));
  }
  return configured.map((p) => ({ provider: p, apiKey: keyFor(p), model: modelFor(p) }));
}

async function callWithRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ProviderError && err.status >= 500 && err.status < 600) return fn();
    throw err;
  }
}

async function runQueuedProviderCall({ invoke, taskId, autoDefault = 'gemini', recordAffinity = true }) {
  const settings = await getSettings();
  const candidates = buildProviderOrder(settings, taskId, autoDefault);
  if (candidates.length === 0) {
    return { ok: false, code: 'NO_KEY', summary: 'Add an API key in Settings.', error: 'No Gemini or Groq API key configured.' };
  }

  const ctl = new AbortController();
  if (taskId) taskControllers.set(taskId, ctl);
  const errors = [];
  let lastSummary = 'Could not reach an AI provider.';

  try {
    for (const entry of candidates) {
      if (ctl.signal.aborted) return { ok: false, summary: 'Cancelled.', error: 'Task cancelled.' };
      const now = Date.now();
      if (cooldownUntil[entry.provider] > now) {
        const secs = Math.ceil((cooldownUntil[entry.provider] - now) / 1000);
        errors.push(`${providerLabel(entry.provider)}: Rate limit cooldown (${secs}s remaining)`);
        lastSummary = `${providerLabel(entry.provider)} is temporarily rate-limited.`;
        continue;
      }
      try {
        const res = await callWithRetry(() => invoke(entry, ctl.signal));
        if (recordAffinity && taskId) taskProviderAffinity.set(taskId, entry.provider);
        return res;
      } catch (err) {
        if (ctl.signal.aborted) return { ok: false, summary: 'Cancelled.', error: 'Task cancelled.' };
        if (err instanceof ProviderError) {
          if (err.status === 429) cooldownUntil[entry.provider] = Date.now() + (err.retryAfterMs || 30000);
          lastSummary = `${providerLabel(entry.provider)}: ${err.summary}.`;
          errors.push(`${providerLabel(entry.provider)}: ${err.message}`);
        } else {
          lastSummary = `${providerLabel(entry.provider)} request failed.`;
          errors.push(`${providerLabel(entry.provider)}: ${err.message || 'Unknown error'}`);
        }
      }
    }
    return { ok: false, summary: candidates.length > 1 ? 'Both AI providers failed.' : lastSummary, error: errors.join(' | ') };
  } finally {
    if (taskId && taskControllers.get(taskId) === ctl) taskControllers.delete(taskId);
  }
}

async function handleOpenUrl(rawUrl) {
  let safeUrl = null;
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeUrl = parsed.href;
  } catch (_) {}
  if (!safeUrl) return { ok: false, success: false, error: 'Only http:// and https:// URLs are allowed.' };

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = (tabs && tabs[0]) || null;
  if (!tab || tab.id == null || tab.id < 0) return { ok: false, success: false, error: 'No active tab found.' };

  try {
    const donePromise = waitForTabComplete(tab.id, 8000);
    await chrome.tabs.update(tab.id, { url: safeUrl });
    await donePromise;
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true, success: true, url: safeUrl };
  } catch (err) {
    return { ok: false, success: false, error: err.message || 'Could not open URL.' };
  }
}

async function handleTestProvider({ provider, apiKey, model }) {
  const settings = await getSettings();
  const rawKey = typeof apiKey === 'string' ? apiKey.trim() : (provider === 'gemini' ? settings.whGeminiKey : settings.whGroqKey);
  const check = validateKeyForProvider(provider, rawKey);
  if (!check.ok) return { ok: false, summary: check.error, error: check.error };
  if (!check.key) return { ok: false, summary: 'Please enter an API key first.', error: 'Missing API key.' };

  const selectedModel = model || (provider === 'gemini' ? settings.whGeminiModel : settings.whGroqModel);
  try {
    await callProvider({ provider, apiKey: check.key, model: selectedModel, systemPrompt: 'Respond with JSON: {"ok":true}', messages: [{ role: 'user', content: 'Ping' }] });
    return { ok: true, provider, model: selectedModel };
  } catch (err) {
    const summary = err instanceof ProviderError ? `${providerLabel(provider)}: ${err.summary}` : `${providerLabel(provider)} test failed`;
    return { ok: false, summary, error: err.message };
  }
}

async function handleListModels({ provider, apiKey }) {
  const settings = await getSettings();
  const rawKey = typeof apiKey === 'string' ? apiKey.trim() : (provider === 'gemini' ? settings.whGeminiKey : settings.whGroqKey);
  const check = validateKeyForProvider(provider, rawKey);
  if (!check.ok) return { ok: false, summary: check.error, error: check.error };
  if (!check.key) return { ok: false, summary: 'No API key saved for this provider.', error: 'Missing API key.' };

  try {
    return { ok: true, provider, models: await listProviderModels(provider, check.key) };
  } catch (err) {
    const summary = err instanceof ProviderError ? `${providerLabel(provider)}: ${err.summary}` : 'Could not fetch model list';
    return { ok: false, summary, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.action) return false;
  if (message.action === 'TRANSLATE_DIRTY') return false;

  if (TAB_ACTIONS.has(message.action)) {
    handleTabAction(message).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, error: e.message }));
    return true;
  }

  if (message.action === 'LLM_CALL') {
    enqueueCall(() => runQueuedProviderCall({
      taskId: message.taskId,
      autoDefault: 'gemini',
      invoke: (entry, signal) => callProvider({ ...entry, systemPrompt: message.systemPrompt, messages: message.messages, signal })
    })).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, summary: 'Request failed.', error: e.message }));
    return true;
  }

  if (message.action === 'CANCEL_TASK') {
    if (message.taskId && taskControllers.has(message.taskId)) {
      try { taskControllers.get(message.taskId).abort(); } catch (_) {}
      taskControllers.delete(message.taskId);
    } else {
      for (const c of taskControllers.values()) { try { c.abort(); } catch (_) {} }
      taskControllers.clear();
    }
    safeReply(sendResponse, { ok: true });
    return false;
  }

  if (message.action === 'TRANSCRIBE') {
    enqueueCall(() => runQueuedProviderCall({
      taskId: message.taskId,
      autoDefault: 'groq',
      recordAffinity: false,
      invoke: (entry) => transcribeAudio({ ...entry, base64: message.base64, mimeType: message.mimeType })
    })).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, summary: 'Transcription failed.', error: e.message }));
    return true;
  }

  if (message.action === 'OPEN_URL') {
    handleOpenUrl(message.url).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, success: false, error: e.message }));
    return true;
  }

  if (message.action === 'TEST_PROVIDER') {
    handleTestProvider(message).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, summary: 'Test failed.', error: e.message }));
    return true;
  }

  if (message.action === 'LIST_MODELS') {
    handleListModels(message).then((r) => safeReply(sendResponse, r)).catch((e) => safeReply(sendResponse, { ok: false, summary: 'Failed to list models.', error: e.message }));
    return true;
  }

  safeReply(sendResponse, { ok: false, error: `Unknown action: ${message.action}` });
  return false;
});
