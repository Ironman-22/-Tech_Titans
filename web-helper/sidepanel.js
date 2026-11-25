// FormMitra — Side Panel Controller (Chat, Agent, Whole-Page Translation, Saved Details, Form Fill)

import { getSettings, saveSettingsPatch, getSavedDetails } from './lib/storage.js';
import { classifyInput, runAgentLoop } from './lib/agent.js';
import { appendUserMessage, appendAssistantMessage, appendFindCard, appendErrorBubble, promptActionApproval, appendFormFillCard } from './lib/chat-ui.js';
import { runViewportTranslation } from './lib/translate.js';
import { buildFormFillPrompt, resolveFormFillPlan } from './lib/form-fill.js';
import { mountSavedDetailsUI } from './lib/details-ui.js';
import { createVoiceController } from './lib/voice.js';

const $ = (id) => document.getElementById(id);

const dom = {
  providerSelect: $('provider-select'),
  langSelect: $('lang-select'),
  btnRefresh: $('btn-refresh'),
  btnSettings: $('btn-settings'),
  pageTitle: $('page-title'),
  pageChars: $('page-chars'),
  btnTranslatePage: $('btn-translate-page'),
  btnShowOriginal: $('btn-show-original'),
  btnTranslateCancel: $('btn-translate-cancel'),
  translateStatus: $('translate-status'),
  tabBtnChat: $('tab-btn-chat'),
  tabBtnDetails: $('tab-btn-details'),
  tabChat: $('tab-chat'),
  tabDetails: $('tab-details'),
  firstRunNotice: $('first-run-notice'),
  btnAckNotice: $('btn-ack-notice'),
  noKeyBanner: $('no-key-banner'),
  btnOpenSettings: $('btn-open-settings'),
  emptyState: $('empty-state'),
  chipWhatIsPage: $('chip-what-is-page'),
  chipFind: $('chip-find'),
  chipSearch: $('chip-search'),
  chipFill: $('chip-fill'),
  chatMessages: $('chat-messages'),
  chkAutoAllow: $('chk-auto-allow'),
  composerForm: $('composer-form'),
  chatInput: $('chat-input'),
  micStatus: $('mic-status'),
  btnMic: $('btn-mic'),
  btnStop: $('btn-stop'),
  btnSend: $('btn-send'),
  detailsStatus: $('details-status'),
  detailsContainer: $('details-container')
};

const state = {
  lang: 'en',
  snapshot: null,
  restricted: false,
  hasKey: false,
  running: false,
  history: [],
  taskId: createTaskId(),
  abortCtl: null,
  translating: false,
  translationActive: false,
  translateCtl: null,
  translatedCount: 0,
  detailsUi: null,
  voice: null
};

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendAction(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, summary: 'Could not reach extension service.', error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, summary: 'No response received.', error: 'Empty response.' });
      }
    });
  });
}

function scrollToBottom() {
  dom.chatMessages.parentElement.scrollTop = dom.chatMessages.parentElement.scrollHeight;
}

function updateEmptyState() {
  dom.emptyState.classList.toggle('hidden', dom.chatMessages.children.length > 0);
}

function autoResizeInput() {
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = `${Math.min(dom.chatInput.scrollHeight, 120)}px`;
}

function updateKeyBanner(settings) {
  state.hasKey = Boolean(settings.whGeminiKey || settings.whGroqKey);
  dom.noKeyBanner.classList.toggle('hidden', state.hasKey);
}

function setRunning(flag) {
  state.running = flag;
  dom.btnSend.disabled = flag;
  dom.btnSend.classList.toggle('hidden', flag);
  dom.btnStop.classList.toggle('hidden', !flag);
}

function stopCurrentTask() {
  if (!state.abortCtl) return;
  state.abortCtl.aborted = true;
  if (typeof state.abortCtl.onAbort === 'function') state.abortCtl.onAbort();
}

function switchTab(tabId) {
  const isChat = tabId === 'tab-chat';
  dom.tabBtnChat.classList.toggle('active', isChat);
  dom.tabBtnDetails.classList.toggle('active', !isChat);
  dom.tabChat.classList.toggle('hidden', !isChat);
  dom.tabChat.classList.toggle('active', isChat);
  dom.tabDetails.classList.toggle('hidden', isChat);
  dom.tabDetails.classList.toggle('active', !isChat);
}

function setTranslationControls(translating, showOrig, statusText = '') {
  dom.btnTranslatePage.disabled = translating;
  dom.btnTranslateCancel.classList.toggle('hidden', !translating);
  dom.btnShowOriginal.classList.toggle('hidden', !showOrig);
  dom.translateStatus.textContent = statusText;
}

async function runPageTranslation(isLazyTrigger = false) {
  if (state.translating) return;
  if (!state.hasKey) {
    dom.noKeyBanner.classList.remove('hidden');
    dom.translateStatus.textContent = 'Add an API key in Settings.';
    return;
  }

  const ctl = { aborted: false };
  state.translateCtl = ctl;
  state.translating = true;
  if (!isLazyTrigger) state.translatedCount = 0;

  setTranslationControls(true, state.translatedCount > 0, isLazyTrigger ? 'Translating new content...' : 'Collecting visible text...');

  try {
    const res = await runViewportTranslation({
      targetLang: state.lang,
      taskId: state.taskId,
      sendAction,
      onProgress: (txt) => { dom.translateStatus.textContent = txt; },
      ctl
    });

    if (res.aborted || ctl.aborted) {
      setTranslationControls(false, state.translatedCount > 0, 'Translation cancelled.');
      return;
    }

    state.translatedCount += res.applied || 0;
    if (!res.ok) {
      state.translationActive = false;
      setTranslationControls(false, state.translatedCount > 0, res.error || 'Translation failed.');
      return;
    }

    state.translationActive = true;
    const msgParts = [`Translated (${state.translatedCount})`];
    if (res.partialMismatch) msgParts.push('some items skipped');
    else if (res.hasMoreOffscreen) msgParts.push('scroll for more');
    setTranslationControls(false, state.translatedCount > 0, msgParts.join(' — '));
  } finally {
    state.translateCtl = null;
    state.translating = false;
  }
}

async function restoreOriginalPage() {
  if (state.translateCtl) state.translateCtl.aborted = true;
  state.translationActive = false;
  state.translatedCount = 0;
  await sendAction({ action: 'TRANSLATE_RESTORE' });
  setTranslationControls(false, false, '');
}

async function refreshSnapshot(clearChat = true) {
  if (clearChat) {
    stopCurrentTask();
    state.history = [];
    state.taskId = createTaskId();
    dom.chatMessages.textContent = '';
    dom.chkAutoAllow.checked = false;
    updateEmptyState();
    await sendAction({ action: 'FIND_CLEAR' });
    await sendAction({ action: 'HIGHLIGHT_CLEAR' });
    if (state.translationActive || state.translatedCount > 0) await restoreOriginalPage();
  }

  dom.pageTitle.textContent = 'Reading page...';
  dom.pageChars.textContent = 'Read 0 chars';
  state.restricted = false;

  const resp = await sendAction({ action: 'SNAPSHOT' });
  if (resp.ok && resp.snapshot) {
    state.snapshot = resp.snapshot;
    state.restricted = false;
    dom.pageTitle.textContent = resp.snapshot.title || resp.snapshot.url || 'Untitled page';
    dom.pageChars.textContent = `Read ${(resp.snapshot.visibleText || '').length} chars`;
    return true;
  }

  state.snapshot = null;
  state.restricted = Boolean(resp.restricted);
  dom.pageTitle.textContent = resp.restricted ? "I can't read this browser page" : 'Page not readable';
  dom.pageChars.textContent = 'Read 0 chars';
  return false;
}

async function handleFormFill(inputText = 'Fill this form') {
  if (!state.hasKey) {
    appendErrorBubble(dom.chatMessages, dom.emptyState, 'Add an API key in Settings.', 'Neither Gemini nor Groq API key is configured.', () => handleUserSubmit(inputText, true));
    return;
  }

  await refreshSnapshot(false);
  const fields = state.snapshot?.formFields || [];
  if (fields.length === 0) {
    appendAssistantMessage(dom.chatMessages, dom.emptyState, 'No visible form fields were found on this page.', null);
    return;
  }

  const details = await getSavedDetails();
  const nonSensitiveLabels = details.filter((d) => !d.sensitive).map((d) => d.label);
  if (nonSensitiveLabels.length === 0 && !fields.some((f) => f.type === 'password')) {
    appendAssistantMessage(dom.chatMessages, dom.emptyState, 'Add non-sensitive details in the Details tab first, or use Insert for sensitive items.', null);
    return;
  }

  const pending = document.createElement('div');
  pending.className = 'msg msg-pending';
  pending.textContent = 'Matching form fields...';
  dom.chatMessages.appendChild(pending);
  updateEmptyState();
  scrollToBottom();

  let resp = { ok: true, data: { mappings: [] }, provider: null };
  if (nonSensitiveLabels.length > 0) {
    const { systemPrompt, userPrompt } = buildFormFillPrompt(fields, nonSensitiveLabels);
    resp = await sendAction({ action: 'LLM_CALL', systemPrompt, messages: [{ role: 'user', content: userPrompt }], taskId: state.taskId });
  }
  pending.remove();

  if (!resp.ok) {
    appendErrorBubble(dom.chatMessages, dom.emptyState, resp.summary || 'Could not match form fields.', resp.error || '', () => handleFormFill(inputText));
    return;
  }

  const rows = resolveFormFillPlan(fields, details, resp.data?.mappings);
  if (rows.length === 0) {
    appendAssistantMessage(dom.chatMessages, dom.emptyState, 'None of your saved details matched the fields on this form.', resp.provider);
    return;
  }

  appendFormFillCard(dom.chatMessages, dom.emptyState, rows, resp.provider, (selectedEntries) =>
    sendAction({ action: 'FILL', entries: selectedEntries })
  );
}

async function handleUserSubmit(rawText, isRetry = false) {
  const input = String(rawText || '').trim();
  if (!input || state.running) return;
  switchTab('tab-chat');

  if (!isRetry) {
    appendUserMessage(dom.chatMessages, dom.emptyState, input);
    dom.chatInput.value = '';
    autoResizeInput();
  }

  if (/^(fill(\s+this|\s+the)?\s+form|autofill)\b/i.test(input)) {
    await handleFormFill(input);
    return;
  }

  const route = classifyInput(input);
  if (route.mode === 'find') {
    const res = await sendAction({ action: 'FIND', query: route.query });
    if (!res.ok) appendErrorBubble(dom.chatMessages, dom.emptyState, res.error || 'Could not search this page.', '', () => handleUserSubmit(input, true));
    else appendFindCard(dom.chatMessages, dom.emptyState, route.query, res.count || 0, res.index || 0, sendAction);
    return;
  }

  if (!state.hasKey) {
    appendErrorBubble(dom.chatMessages, dom.emptyState, 'Add an API key in Settings.', 'Neither Gemini nor Groq API key is configured.', () => handleUserSubmit(input, true));
    return;
  }

  dom.chkAutoAllow.checked = false;
  const ctl = { aborted: false, onAbort: null };
  state.abortCtl = ctl;
  setRunning(true);

  try {
    await runAgentLoop({
      goal: route.goal,
      ctl,
      state,
      dom,
      sendAction,
      refreshSnapshot,
      onReply: (txt, prov) => appendAssistantMessage(dom.chatMessages, dom.emptyState, txt, prov),
      onError: (sum, raw, retryFn) => appendErrorBubble(dom.chatMessages, dom.emptyState, sum, raw, retryFn),
      onFind: (q, cnt, idx) => appendFindCard(dom.chatMessages, dom.emptyState, q, cnt, idx, sendAction),
      onNoKey: () => dom.noKeyBanner.classList.remove('hidden'),
      onAskApproval: (promptText, c) => promptActionApproval(dom.chatMessages, dom.emptyState, promptText, c),
      onRetry: () => handleUserSubmit(input, true)
    });
  } finally {
    state.abortCtl = null;
    setRunning(false);
  }
}

function prefillInput(prefix) {
  dom.chatInput.value = prefix;
  autoResizeInput();
  dom.chatInput.focus();
  dom.chatInput.setSelectionRange(prefix.length, prefix.length);
}

function setDetailsStatus(text, kind = '') {
  dom.detailsStatus.textContent = text;
  dom.detailsStatus.className = kind ? `details-status ${kind}` : 'details-status';
}

function wireEvents() {
  dom.providerSelect.addEventListener('change', () => saveSettingsPatch({ whProvider: dom.providerSelect.value }));
  dom.langSelect.addEventListener('change', () => { state.lang = dom.langSelect.value; saveSettingsPatch({ whLang: state.lang }); });
  dom.tabBtnChat.addEventListener('click', () => switchTab('tab-chat'));
  dom.tabBtnDetails.addEventListener('click', () => switchTab('tab-details'));
  dom.btnRefresh.addEventListener('click', () => refreshSnapshot(true));
  dom.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  dom.btnOpenSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  dom.btnAckNotice.addEventListener('click', () => { dom.firstRunNotice.classList.add('hidden'); saveSettingsPatch({ whNoticeAck: true }); });

  dom.btnTranslatePage.addEventListener('click', () => runPageTranslation(false));
  dom.btnShowOriginal.addEventListener('click', restoreOriginalPage);
  dom.btnTranslateCancel.addEventListener('click', () => { if (state.translateCtl) state.translateCtl.aborted = true; state.translationActive = false; });

  dom.chipWhatIsPage.addEventListener('click', () => handleUserSubmit('What is this page?'));
  dom.chipFind.addEventListener('click', () => prefillInput('Find '));
  dom.chipSearch.addEventListener('click', () => prefillInput('Search this site for '));
  dom.chipFill.addEventListener('click', () => handleUserSubmit('Fill this form'));

  dom.btnStop.addEventListener('click', stopCurrentTask);
  dom.btnMic.addEventListener('click', () => { if (state.voice) state.voice.toggle(); });
  window.addEventListener('pagehide', () => { if (state.voice) state.voice.cleanup(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.running) { e.preventDefault(); stopCurrentTask(); } });

  dom.chatInput.addEventListener('input', autoResizeInput);
  dom.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleUserSubmit(dom.chatInput.value); } });
  dom.composerForm.addEventListener('submit', (e) => { e.preventDefault(); handleUserSubmit(dom.chatInput.value); });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'TRANSLATE_DIRTY' && state.translationActive && !state.translating) runPageTranslation(true);
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.whGeminiKey || changes.whGroqKey) getSettings().then(updateKeyBanner);
    if (changes.whProvider) dom.providerSelect.value = changes.whProvider.newValue || 'auto';
    if (changes.whLang) { state.lang = changes.whLang.newValue || 'en'; dom.langSelect.value = state.lang; }
    if (changes.whSavedDetails && state.detailsUi) state.detailsUi.reload();
  });
}

async function init() {
  state.voice = createVoiceController({
    btnMic: dom.btnMic,
    micStatus: dom.micStatus,
    chatInput: dom.chatInput,
    langSelect: dom.langSelect,
    sendAction,
    onLanguageDetected: (lang) => {
      state.lang = lang;
      dom.langSelect.value = lang;
      saveSettingsPatch({ whLang: lang });
    },
    onErrorBubble: (sum, raw, retryFn) => appendErrorBubble(dom.chatMessages, dom.emptyState, sum, raw, retryFn),
    onResizeInput: autoResizeInput
  });
  wireEvents();
  state.detailsUi = mountSavedDetailsUI({
    container: dom.detailsContainer,
    allowInsert: true,
    onStatus: setDetailsStatus,
    onInsert: async (item) => {
      const res = await sendAction({ action: 'INSERT_VALUE', value: item.value });
      if (res.success || res.ok) setDetailsStatus(`Inserted "${item.label}" into focused field.`, 'ok');
      else if (res.error === 'no_focus') setDetailsStatus('No field focused on the page. Click into an input box first.', 'err');
      else setDetailsStatus(res.error || 'Could not insert value.', 'err');
    }
  });

  const settings = await getSettings();
  dom.providerSelect.value = settings.whProvider;
  dom.langSelect.value = settings.whLang;
  state.lang = settings.whLang;
  dom.firstRunNotice.classList.toggle('hidden', settings.whNoticeAck);
  updateKeyBanner(settings);
  await refreshSnapshot(false);
}

init();
