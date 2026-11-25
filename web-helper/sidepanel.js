// FormMitra — Side Panel Controller (Chat, Agent, Whole-Page Translation, Saved Details, Form Fill)

import { getSettings, saveSettingsPatch } from './lib/storage.js';
import { STRINGS, t, bindI18n, clearI18n, setLang } from './lib/i18n.js';
import { classifyInput, isUnreadableSnapshot, normalizeDirectUrlOrQuery, runAgentLoop } from './lib/agent.js';
import { appendUserMessage, appendAssistantMessage, appendFindCard, appendErrorBubble, promptActionApproval, appendFormFillCard, appendUnreadablePageCard, appendStepLine } from './lib/chat-ui.js';
import { runViewportTranslation } from './lib/translate.js';
import { runFormFillFlow } from './lib/form-fill.js';
import { mountSavedDetailsUI } from './lib/details-ui.js';
import { createVoiceController } from './lib/voice.js';
import { isHelperGoal, createHelperController } from './sidepanel/helper.js';

const $ = (id) => document.getElementById(id);

const dom = {
  providerSelect: $('provider-select'),
  langSelect: $('lang-select'),
  btnHelper: $('btn-helper'),
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
  chipOpenUrl: $('chip-open-url'),
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
  detailsContainer: $('details-container'),
  helperPanel: $('helper-panel'),
  helperGoal: $('helper-goal'),
  helperSteps: $('helper-steps'),
  helperExplain: $('helper-explain'),
  helperActions: $('helper-actions')
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
  unreadableInput: null,
  detailsUi: null,
  voice: null,
  helper: null
};

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendAction(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, summary: t('svcUnreachable'), error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, summary: t('emptyResponse'), error: t('emptyResponse') });
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
  if (state.helper) state.helper.stop();
  if (!state.abortCtl) return;
  state.abortCtl.aborted = true;
  sendAction({ action: 'CANCEL_TASK', taskId: state.taskId });
  state.taskId = createTaskId();
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

function setStatusSpec(el, spec) {
  if (spec && typeof spec === 'object' && spec.key) bindI18n(el, spec.key, spec.vars || null);
  else { clearI18n(el); el.textContent = spec || ''; }
}

function setTranslationControls(translating, showOrig, statusSpec = '') {
  dom.btnTranslatePage.disabled = translating;
  dom.btnTranslateCancel.classList.toggle('hidden', !translating);
  dom.btnShowOriginal.classList.toggle('hidden', !showOrig);
  setStatusSpec(dom.translateStatus, statusSpec);
}

async function runPageTranslation(isLazyTrigger = false) {
  if (state.translating) return;
  if (!state.hasKey) {
    dom.noKeyBanner.classList.remove('hidden');
    setStatusSpec(dom.translateStatus, { key: 'noKeyErrSummary' });
    return;
  }

  const ctl = { aborted: false };
  state.translateCtl = ctl;
  state.translating = true;
  if (!isLazyTrigger) state.translatedCount = 0;

  setTranslationControls(true, state.translatedCount > 0, { key: isLazyTrigger ? 'translatingMore' : 'translatingCollect' });

  try {
    const res = await runViewportTranslation({
      targetLang: state.lang,
      taskId: state.taskId,
      sendAction,
      onProgress: (txt) => setStatusSpec(dom.translateStatus, txt),
      ctl
    });

    if (res.aborted || ctl.aborted) {
      setTranslationControls(false, state.translatedCount > 0, { key: 'translationCancelled' });
      return;
    }

    state.translatedCount += res.applied || 0;
    if (!res.ok) {
      state.translationActive = false;
      setTranslationControls(false, state.translatedCount > 0, res.error || { key: 'translationFailed' });
      return;
    }

    state.translationActive = true;
    const statusKey = res.partialMismatch ? 'translatedSkipped' : (res.hasMoreOffscreen ? 'translatedScrollMore' : 'translatedCount');
    setTranslationControls(false, state.translatedCount > 0, { key: statusKey, vars: { n: state.translatedCount } });
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

async function openFromCard(rawText) {
  const resolved = normalizeDirectUrlOrQuery(rawText);
  if (!resolved || resolved.blocked) return { ok: false, error: t('onlyHttpAllowed') };
  const res = await sendAction({ action: 'OPEN_URL', url: resolved.url });
  if (res.ok) await refreshSnapshot(false);
  return res;
}

function showUnreadableCard() {
  if (state.unreadableInput && state.unreadableInput.isConnected) {
    state.unreadableInput.focus();
    return;
  }
  state.unreadableInput = appendUnreadablePageCard(dom.chatMessages, dom.emptyState, openFromCard);
}

async function refreshSnapshot(clearChat = true) {
  if (clearChat) {
    stopCurrentTask();
    state.history = [];
    state.taskId = createTaskId();
    state.unreadableInput = null;
    dom.chatMessages.textContent = '';
    dom.chkAutoAllow.checked = false;
    updateEmptyState();
    await sendAction({ action: 'FIND_CLEAR' });
    await sendAction({ action: 'HIGHLIGHT_CLEAR' });
    await sendAction({ action: 'SPOTLIGHT_CLEAR' });
    if (state.helper) state.helper.clear();
    if (state.translationActive || state.translatedCount > 0) await restoreOriginalPage();
  }

  bindI18n(dom.pageTitle, 'readingPage');
  bindI18n(dom.pageChars, 'readChars', { n: 0 });
  state.restricted = false;

  const resp = await sendAction({ action: 'SNAPSHOT' });
  if (resp.ok && resp.snapshot && !isUnreadableSnapshot(resp.snapshot, false)) {
    state.snapshot = resp.snapshot;
    state.restricted = false;
    state.unreadableInput = null;
    if (resp.snapshot.title || resp.snapshot.url) {
      clearI18n(dom.pageTitle);
      dom.pageTitle.textContent = resp.snapshot.title || resp.snapshot.url;
    } else {
      bindI18n(dom.pageTitle, 'untitledPage');
    }
    bindI18n(dom.pageChars, 'readChars', { n: (resp.snapshot.visibleText || '').length });
    return true;
  }

  state.snapshot = null;
  state.restricted = true;
  bindI18n(dom.pageTitle, 'cantReadPage');
  bindI18n(dom.pageChars, 'readChars', { n: 0 });
  return false;
}

async function handleFormFill(inputText = t('chipFill')) {
  await runFormFillFlow({
    inputText, state, dom, sendAction, refreshSnapshot,
    onUnreadable: showUnreadableCard,
    onReply: (txt, prov) => appendAssistantMessage(dom.chatMessages, dom.emptyState, txt, prov),
    onError: (sum, raw) => appendErrorBubble(dom.chatMessages, dom.emptyState, sum, raw, () => handleFormFill(inputText)),
    onCard: (rows, prov) => appendFormFillCard(dom.chatMessages, dom.emptyState, rows, prov, (entries) => sendAction({ action: 'FILL', entries }))
  });
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

  const route = classifyInput(input);
  if (route.mode === 'find') {
    const res = await sendAction({ action: 'FIND', query: route.query });
    if (res.restricted) showUnreadableCard();
    else if (!res.ok) appendErrorBubble(dom.chatMessages, dom.emptyState, res.error || { key: 'errCouldNotSearch' }, '', () => handleUserSubmit(input, true));
    else appendFindCard(dom.chatMessages, dom.emptyState, route.query, res.count || 0, res.index || 0, sendAction);
    return;
  }

  if (state.helper && state.helper.isEnabled() && isHelperGoal(input)) {
    const ctl = { aborted: false, onAbort: null };
    state.abortCtl = ctl;
    setRunning(true);
    try { await state.helper.startPlan(input); }
    finally { state.abortCtl = null; setRunning(false); }
    return;
  }

  if (/^(fill(\s+this|\s+the)?\s+form|autofill)\b/i.test(input) || Object.values(STRINGS).some((s) => s.chipFill === input)) {
    await handleFormFill(input);
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
      onUnreadable: showUnreadableCard,
      onStep: (txt) => appendStepLine(dom.chatMessages, dom.emptyState, txt),
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

function setDetailsStatus(spec, kind = '') {
  setStatusSpec(dom.detailsStatus, spec);
  dom.detailsStatus.className = kind ? `details-status ${kind}` : 'details-status';
}

function wireEvents() {
  dom.providerSelect.addEventListener('change', () => saveSettingsPatch({ whProvider: dom.providerSelect.value }));
  dom.langSelect.addEventListener('change', () => {
    state.lang = dom.langSelect.value;
    setLang(state.lang);
  });
  dom.tabBtnChat.addEventListener('click', () => switchTab('tab-chat'));
  dom.tabBtnDetails.addEventListener('click', () => switchTab('tab-details'));
  dom.btnRefresh.addEventListener('click', () => refreshSnapshot(true));
  dom.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  dom.btnOpenSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  dom.btnAckNotice.addEventListener('click', () => { dom.firstRunNotice.classList.add('hidden'); saveSettingsPatch({ whNoticeAck: true }); });

  dom.btnTranslatePage.addEventListener('click', () => runPageTranslation(false));
  dom.btnShowOriginal.addEventListener('click', restoreOriginalPage);
  dom.btnTranslateCancel.addEventListener('click', () => { if (state.translateCtl) state.translateCtl.aborted = true; state.translationActive = false; });

  dom.chipWhatIsPage.addEventListener('click', () => handleUserSubmit(t('chipWhat')));
  dom.chipFind.addEventListener('click', () => prefillInput('Find '));
  dom.chipSearch.addEventListener('click', () => prefillInput('Search this site for '));
  dom.chipOpenUrl.addEventListener('click', () => prefillInput('Open '));
  dom.chipFill.addEventListener('click', () => handleUserSubmit(t('chipFill')));

  dom.btnStop.addEventListener('click', stopCurrentTask);
  dom.btnHelper.addEventListener('click', () => {
    const next = !state.helper.isEnabled();
    state.helper.setEnabled(next);
    saveSettingsPatch({ whHelper: next });
  });
  dom.btnMic.addEventListener('click', () => { if (state.voice) state.voice.toggle(); });
  window.addEventListener('pagehide', () => { if (state.voice) state.voice.cleanup(); if (state.helper) state.helper.stop(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (state.running || state.helper?.isActive())) { e.preventDefault(); stopCurrentTask(); }
  });

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
    if (changes.whLang) {
      state.lang = changes.whLang.newValue || 'en';
      dom.langSelect.value = state.lang;
      setLang(state.lang, { persist: false });
    }
    if (changes.whSavedDetails && state.detailsUi) state.detailsUi.reload();
  });
}

async function init() {
  const onErrorBubble = (sum, raw, retryFn) => appendErrorBubble(dom.chatMessages, dom.emptyState, sum, raw, retryFn);
  const onReply = (txt, prov) => appendAssistantMessage(dom.chatMessages, dom.emptyState, txt, prov);
  state.voice = createVoiceController({
    btnMic: dom.btnMic, micStatus: dom.micStatus, chatInput: dom.chatInput, langSelect: dom.langSelect,
    sendAction, onErrorBubble, onResizeInput: autoResizeInput,
    onLanguageDetected: (lang) => { state.lang = lang; dom.langSelect.value = lang; setLang(lang); }
  });
  wireEvents();
  state.detailsUi = mountSavedDetailsUI({
    container: dom.detailsContainer, allowInsert: true, onStatus: setDetailsStatus,
    onInsert: async (item) => {
      const res = await sendAction({ action: 'INSERT_VALUE', value: item.value });
      if (res.success || res.ok) setDetailsStatus({ key: 'insertedDetail', vars: { label: item.label } }, 'ok');
      else setDetailsStatus(res.error === 'no_focus' ? { key: 'noFieldFocused' } : (res.error || { key: 'insertFailed' }), 'err');
    }
  });
  state.helper = createHelperController({
    dom, state, sendAction, refreshSnapshot, onReply, onError: onErrorBubble,
    onNoKey: () => dom.noKeyBanner.classList.remove('hidden'), onUnreadable: showUnreadableCard,
    onAskApproval: (promptText, c) => promptActionApproval(dom.chatMessages, dom.emptyState, promptText, c),
    onCloseToggle: (flag) => { state.helper.setEnabled(flag); return saveSettingsPatch({ whHelper: flag }); },
    onSetRunning: setRunning
  });

  try {
    const settings = await getSettings();
    dom.providerSelect.value = settings.whProvider;
    dom.langSelect.value = settings.whLang;
    state.lang = settings.whLang;
    await setLang(state.lang, { persist: false });
    state.helper.setEnabled(settings.whHelper);
    dom.firstRunNotice.classList.toggle('hidden', settings.whNoticeAck);
    updateKeyBanner(settings);
  } finally {
    document.body.classList.remove('i18n-loading');
  }
  await refreshSnapshot(false);
}

init();
