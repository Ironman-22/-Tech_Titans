// FormMitra — Background Service Worker
// Manages tab tracking, proxies all backend/Gemini API calls, and relays messages between Side Panel and Content Script.

console.log('[FormMitra:Background] Service worker initializing...');

const BACKEND_BASE = 'http://localhost:8000';

// Enable side panel on extension action click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('[FormMitra:Background] setPanelBehavior error:', err);
  });
}

// Track active tab ID
let currentActiveTabId = null;

chrome.tabs.onActivated.addListener((activeInfo) => {
  currentActiveTabId = activeInfo.tabId;
  console.log('[FormMitra:Background] Active tab switched to:', currentActiveTabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    currentActiveTabId = tabId;
    console.log('[FormMitra:Background] Tab updated & ready:', tabId, tab.url);
  }
});

// Seed default API key and model if not yet configured
chrome.storage.local.get(['whApiKey', 'whModel'], (data) => {
  const updates = {};
  if (!data.whApiKey) updates.whApiKey = 'AQ.Ab8RN6LSnY7zVgbmg5QchiMeddOOfKz00FhIilIYokjgf4zyQA';
  if (!data.whModel) updates.whModel = 'gemini-3.5-flash-lite';
  if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
});

/* ── JSON Cleanup Helper ─────────────────────────────────────── */
function parseModelJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response from model.');
  }
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

/* ── Direct Backend API: /explain-field (GROQ on backend) ──────── */
async function explainFieldViaBackend({ field_label, context, language }) {
  console.log(`[FormMitra:Background] Calling ${BACKEND_BASE}/explain-field for "${field_label}" [${language}]`);
  try {
    const resp = await fetch(`${BACKEND_BASE}/explain-field`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_label: field_label || '',
        context: context || '',
        language: language || 'en'
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Backend error (HTTP ${resp.status})`);
    }

    console.log('[FormMitra:Background] /explain-field response received:', data);
    return data;
  } catch (err) {
    console.error('[FormMitra:Background] Backend /explain-field failed:', err.message);
    throw err;
  }
}

/* ── Direct Backend API: /check-document ─────────────────────── */
async function checkDocumentViaBackend({ image, doc_type, filename }) {
  console.log(`[FormMitra:Background] Calling ${BACKEND_BASE}/check-document for "${doc_type}"`);
  try {
    const resp = await fetch(`${BACKEND_BASE}/check-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: image || '',
        doc_type: doc_type || 'Student ID',
        filename: filename || 'document.jpg'
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Backend error (HTTP ${resp.status})`);
    }

    console.log('[FormMitra:Background] /check-document response received:', data);
    return data;
  } catch (err) {
    console.error('[FormMitra:Background] Backend /check-document failed:', err.message);
    throw err;
  }
}

/* ── Direct Gemini Transcription ────────────────────────────── */
async function transcribeAudio({ mimeType, base64 }) {
  const store = await chrome.storage.local.get(['whApiKey', 'whModel']);
  const apiKey = (store.whApiKey || '').trim();
  const model = store.whModel || 'gemini-3.5-flash-lite';

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: base64 } },
          { text: 'Transcribe this speech exactly as spoken, in the original language and script (Kannada in Kannada script, Hindi in Devanagari, English in English). Return ONLY JSON: {"text": string, "language": "en"|"hi"|"kn"}.' }
        ]
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });

  if (!resp.ok) throw new Error(`Transcription HTTP ${resp.status}`);
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseModelJSON(text);
}

/* ── Tab Helper & Relay to Content Script ─────────────────────── */
function relayToActiveTab(payload, sendResponse) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      console.warn('[FormMitra:Background] No active tab found.');
      sendResponse({ success: false, error: 'No active tab found. Please click into your scholarship portal tab.' });
      return;
    }

    const tab = tabs[0];
    const tabId = tab.id;
    currentActiveTabId = tabId;

    if (tab.url && /^(chrome|chrome-extension|edge|about):/i.test(tab.url)) {
      sendResponse({ success: false, error: 'Cannot run on browser internal pages. Open your scholarship portal tab.' });
      return;
    }

    console.log(`[FormMitra:Background] Relaying action "${payload?.action}" to tab ${tabId} (${tab.url})`);

    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (!chrome.runtime.lastError && response) {
        console.log(`[FormMitra:Background] Content script responded for "${payload?.action}":`, response);
        sendResponse(response);
        return;
      }

      // If content script was not yet injected into this tab, inject now
      console.log(`[FormMitra:Background] Injecting content.js into tab ${tabId}...`);
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[FormMitra:Background] Injection failed:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: 'Cannot access this page: ' + chrome.runtime.lastError.message });
            return;
          }

          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, payload, (retryResp) => {
              if (!chrome.runtime.lastError && retryResp) {
                console.log(`[FormMitra:Background] Post-injection content script response:`, retryResp);
                sendResponse(retryResp);
              } else {
                console.warn('[FormMitra:Background] Page still did not respond.');
                sendResponse({ success: false, error: 'Page did not respond. Please refresh the page.' });
              }
            });
          }, 120);
        }
      );
    });
  });
}

/* ── Message Listener ────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  console.log('[FormMitra:Background] Received message:', message.action, 'target:', message.target);

  // 1. Backend /explain-field request
  if (message.action === 'EXPLAIN_FIELD') {
    explainFieldViaBackend(message.payload || {})
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 2. Backend /check-document request
  if (message.action === 'CHECK_DOCUMENT') {
    checkDocumentViaBackend(message.payload || {})
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 3. Audio transcription
  if (message.action === 'TRANSCRIBE_AUDIO') {
    transcribeAudio(message.payload || {})
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 4. Notification from content script when user clicks on an injected "Ask AI" button on page
  if (message.action === 'PAGE_ASK_AI_CLICKED') {
    console.log('[FormMitra:Background] User clicked Ask AI button on web page for:', message.fieldLabel);
    // Forward to Side Panel
    chrome.runtime.sendMessage({
      target: 'sidepanel',
      action: 'TRIGGER_ASK_AI',
      fieldLabel: message.fieldLabel,
      context: message.context
    }).catch(() => {
      // Side panel might be closed or listening
    });
    sendResponse({ success: true });
    return false;
  }

  // 5. Relay to Content Script on Active Tab
  if (message.target === 'content' || message.target === 'background') {
    const payload = message.payload || message;
    relayToActiveTab(payload, sendResponse);
    return true;
  }

  return false;
});
