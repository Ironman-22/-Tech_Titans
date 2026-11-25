// FormMitra — Settings Controller

import {
  DEFAULTS,
  getSettings,
  saveProviderKey,
  saveSettingsPatch,
  clearAllData
} from './lib/storage.js';
import { mountSavedDetailsUI } from './lib/details-ui.js';

const $ = (id) => document.getElementById(id);

const dom = {
  btnRefreshModels: $('btn-refresh-models'),
  modelsStatus: $('models-status'),
  geminiKey: $('gemini-key'),
  geminiModel: $('gemini-model'),
  geminiStatus: $('gemini-status'),
  btnSaveGemini: $('btn-save-gemini'),
  btnTestGemini: $('btn-test-gemini'),
  groqKey: $('groq-key'),
  groqModel: $('groq-model'),
  groqStatus: $('groq-status'),
  btnSaveGroq: $('btn-save-groq'),
  btnTestGroq: $('btn-test-groq'),
  savedDetailsStatus: $('saved-details-status'),
  savedDetailsContainer: $('saved-details-container'),
  btnDeleteAll: $('btn-delete-all'),
  dataStatus: $('data-status')
};

let detailsUi = null;

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = kind ? `status-line ${kind}` : 'status-line';
}

function sendAction(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, summary: chrome.runtime.lastError.message, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, summary: 'No response from background.', error: 'No response.' });
      }
    });
  });
}

function populateSelect(selectEl, models, currentVal, defaultVal) {
  selectEl.textContent = '';
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name && m.name !== m.id ? `${m.id} (${m.name})` : m.id;
    selectEl.appendChild(opt);
  });

  const ids = new Set(models.map((m) => m.id));
  if (ids.has(currentVal)) selectEl.value = currentVal;
  else if (ids.has(defaultVal)) selectEl.value = defaultVal;
  else if (models.length > 0) selectEl.value = models[0].id;
  return selectEl.value;
}

async function refreshProviderModels(provider, apiKey, silent = false) {
  const selectEl = provider === 'gemini' ? dom.geminiModel : dom.groqModel;
  const defaultModel = provider === 'gemini' ? DEFAULTS.whGeminiModel : DEFAULTS.whGroqModel;
  const currentModel = selectEl.value || defaultModel;

  if (!apiKey) {
    populateSelect(selectEl, [{ id: defaultModel, name: defaultModel }], defaultModel, defaultModel);
    return { ok: false, skipped: true };
  }

  const resp = await sendAction({ action: 'LIST_MODELS', provider, apiKey });
  if (resp.ok && Array.isArray(resp.models) && resp.models.length > 0) {
    const chosen = populateSelect(selectEl, resp.models, currentModel, defaultModel);
    await saveSettingsPatch(provider === 'gemini' ? { whGeminiModel: chosen } : { whGroqModel: chosen });
    if (!silent) setStatus(provider === 'gemini' ? dom.geminiStatus : dom.groqStatus, `Loaded ${resp.models.length} models.`, 'ok');
    return { ok: true, count: resp.models.length };
  }

  if (!silent) {
    setStatus(provider === 'gemini' ? dom.geminiStatus : dom.groqStatus, resp.summary || 'Could not load models.', 'err');
  }
  return { ok: false, error: resp.summary };
}

async function saveKeyOnly(provider) {
  const inputEl = provider === 'gemini' ? dom.geminiKey : dom.groqKey;
  const statusEl = provider === 'gemini' ? dom.geminiStatus : dom.groqStatus;

  const res = await saveProviderKey(provider, inputEl.value);
  if (!res.ok) {
    setStatus(statusEl, res.error, 'err');
    return null;
  }

  inputEl.value = res.key;
  setStatus(statusEl, res.key ? 'API key saved locally.' : 'API key cleared.', 'ok');
  if (res.key) await refreshProviderModels(provider, res.key, true);
  return res.key;
}

async function testProvider(provider) {
  const inputEl = provider === 'gemini' ? dom.geminiKey : dom.groqKey;
  const selectEl = provider === 'gemini' ? dom.geminiModel : dom.groqModel;
  const statusEl = provider === 'gemini' ? dom.geminiStatus : dom.groqStatus;
  const testBtn = provider === 'gemini' ? dom.btnTestGemini : dom.btnTestGroq;

  const saved = await saveProviderKey(provider, inputEl.value);
  if (!saved.ok) { setStatus(statusEl, saved.error, 'err'); return; }
  inputEl.value = saved.key;
  if (!saved.key) { setStatus(statusEl, 'Paste an API key first.', 'err'); return; }

  testBtn.disabled = true;
  setStatus(statusEl, 'Testing connection...');

  try {
    const resp = await sendAction({ action: 'TEST_PROVIDER', provider, apiKey: saved.key, model: selectEl.value });
    if (resp.ok) {
      setStatus(statusEl, `Connected (${resp.model}).`, 'ok');
      await refreshProviderModels(provider, saved.key, true);
    } else {
      setStatus(statusEl, resp.error || resp.summary || 'Connection failed.', 'err');
    }
  } finally {
    testBtn.disabled = false;
  }
}

async function refreshAllModels() {
  dom.btnRefreshModels.disabled = true;
  setStatus(dom.modelsStatus, 'Refreshing available models...');
  try {
    const gKey = dom.geminiKey.value.trim();
    const qKey = dom.groqKey.value.trim();
    if (!gKey && !qKey) { setStatus(dom.modelsStatus, 'Add at least one API key first.', 'err'); return; }

    const parts = [];
    if (gKey) {
      const g = await refreshProviderModels('gemini', gKey, false);
      parts.push(g.ok ? `Gemini: ${g.count}` : 'Gemini failed');
    }
    if (qKey) {
      const q = await refreshProviderModels('groq', qKey, false);
      parts.push(q.ok ? `Groq: ${q.count}` : 'Groq failed');
    }
    setStatus(dom.modelsStatus, `Models refreshed (${parts.join(', ')}).`, 'ok');
  } finally {
    dom.btnRefreshModels.disabled = false;
  }
}

async function loadInitialState() {
  detailsUi = mountSavedDetailsUI({
    container: dom.savedDetailsContainer,
    allowInsert: false,
    onStatus: (txt, kind) => {
      dom.savedDetailsStatus.textContent = txt;
      dom.savedDetailsStatus.className = kind ? `details-status ${kind}` : 'details-status';
    }
  });

  const s = await getSettings();
  dom.geminiKey.value = s.whGeminiKey;
  dom.groqKey.value = s.whGroqKey;
  populateSelect(dom.geminiModel, [{ id: s.whGeminiModel, name: s.whGeminiModel }], s.whGeminiModel, DEFAULTS.whGeminiModel);
  populateSelect(dom.groqModel, [{ id: s.whGroqModel, name: s.whGroqModel }], s.whGroqModel, DEFAULTS.whGroqModel);

  if (s.whGeminiKey) refreshProviderModels('gemini', s.whGeminiKey, true);
  if (s.whGroqKey) refreshProviderModels('groq', s.whGroqKey, true);
}

dom.btnSaveGemini.addEventListener('click', () => saveKeyOnly('gemini'));
dom.btnSaveGroq.addEventListener('click', () => saveKeyOnly('groq'));
dom.btnTestGemini.addEventListener('click', () => testProvider('gemini'));
dom.btnTestGroq.addEventListener('click', () => testProvider('groq'));
dom.btnRefreshModels.addEventListener('click', refreshAllModels);
dom.geminiModel.addEventListener('change', () => saveSettingsPatch({ whGeminiModel: dom.geminiModel.value }));
dom.groqModel.addEventListener('change', () => saveSettingsPatch({ whGroqModel: dom.groqModel.value }));

dom.btnDeleteAll.addEventListener('click', async () => {
  if (!window.confirm('Delete all API keys, saved details, model choices, and preferences stored by FormMitra?')) return;
  await clearAllData();
  dom.geminiKey.value = '';
  dom.groqKey.value = '';
  populateSelect(dom.geminiModel, [{ id: DEFAULTS.whGeminiModel, name: DEFAULTS.whGeminiModel }], DEFAULTS.whGeminiModel, DEFAULTS.whGeminiModel);
  populateSelect(dom.groqModel, [{ id: DEFAULTS.whGroqModel, name: DEFAULTS.whGroqModel }], DEFAULTS.whGroqModel, DEFAULTS.whGroqModel);
  if (detailsUi) await detailsUi.reload();
  setStatus(dom.geminiStatus, '');
  setStatus(dom.groqStatus, '');
  setStatus(dom.modelsStatus, '');
  setStatus(dom.dataStatus, 'All data deleted.', 'ok');
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.whSavedDetails && detailsUi) detailsUi.reload();
});

loadInitialState();
