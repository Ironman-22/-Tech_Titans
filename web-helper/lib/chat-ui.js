// FormMitra — Chat Message, Find Card, Approval Card, Form Fill Review & Error Bubble Renderers

import { t, bindI18n, clearI18n } from './i18n.js';

function setTextOrI18n(el, spec) {
  if (spec && typeof spec === 'object' && spec.key) bindI18n(el, spec.key, spec.vars || null);
  else {
    clearI18n(el);
    el.textContent = String(spec ?? '');
  }
}

function appendAndScroll(container, emptyState, el) {
  container.appendChild(el);
  emptyState.classList.toggle('hidden', container.children.length > 0);
  container.parentElement.scrollTop = container.parentElement.scrollHeight;
}

export function appendUserMessage(container, emptyState, text) {
  const el = document.createElement('div');
  el.className = 'msg msg-user';
  el.textContent = text;
  appendAndScroll(container, emptyState, el);
}

export function appendAssistantMessage(container, emptyState, replyText, provider) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-assistant';

  const body = document.createElement('div');
  body.textContent = replyText;
  wrap.appendChild(body);

  if (provider) {
    const tag = document.createElement('span');
    tag.className = 'msg-provider';
    bindI18n(tag, 'viaProvider', { provider: provider === 'groq' ? 'Groq' : 'Gemini' });
    wrap.appendChild(tag);
  }

  appendAndScroll(container, emptyState, wrap);
}

export function appendFindCard(container, emptyState, query, count, index, sendAction) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-card';

  const label = document.createElement('div');
  const setCountLabel = (c, idx) => {
    if (c === 0) bindI18n(label, 'findZero');
    else if (c === 1) bindI18n(label, 'findOneMatch', { idx, query });
    else bindI18n(label, 'findManyMatches', { c, idx, query });
  };
  setCountLabel(count, index);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-card';
  bindI18n(prevBtn, 'prevBtn');
  prevBtn.disabled = count === 0;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-card';
  bindI18n(nextBtn, 'nextBtn');
  nextBtn.disabled = count === 0;

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn-card';
  bindI18n(clearBtn, 'clearBtn');
  clearBtn.disabled = count === 0;

  const nav = async (dir) => {
    const res = await sendAction({ action: 'FIND_NAV', dir });
    if (res.ok) setCountLabel(res.count, res.index);
  };

  prevBtn.addEventListener('click', () => nav('prev'));
  nextBtn.addEventListener('click', () => nav('next'));
  clearBtn.addEventListener('click', async () => {
    await sendAction({ action: 'FIND_CLEAR' });
    bindI18n(label, 'findCleared');
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    clearBtn.disabled = true;
  });

  actions.append(prevBtn, nextBtn, clearBtn);
  wrap.append(label, actions);
  appendAndScroll(container, emptyState, wrap);
}

export function appendErrorBubble(container, emptyState, summaryText, rawDetail, onRetry) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-error';

  const line = document.createElement('div');
  setTextOrI18n(line, summaryText);
  wrap.appendChild(line);

  if (rawDetail) {
    const details = document.createElement('details');
    details.className = 'error-details';
    const summary = document.createElement('summary');
    bindI18n(summary, 'detailsLabel');
    const pre = document.createElement('pre');
    pre.className = 'error-raw';
    pre.textContent = rawDetail;
    details.append(summary, pre);
    wrap.appendChild(details);
  }

  const actions = document.createElement('div');
  actions.className = 'error-actions';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn-retry';
  bindI18n(retryBtn, 'retryBtn');
  retryBtn.addEventListener('click', () => {
    wrap.remove();
    onRetry();
  });
  actions.appendChild(retryBtn);
  wrap.appendChild(actions);

  appendAndScroll(container, emptyState, wrap);
}

export function promptActionApproval(container, emptyState, promptText, ctl) {
  return new Promise((resolve) => {
    if (ctl.aborted) return resolve('stop');

    const wrap = document.createElement('div');
    wrap.className = 'msg msg-card';

    const text = document.createElement('div');
    setTextOrI18n(text, promptText);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const allowBtn = document.createElement('button');
    allowBtn.type = 'button';
    allowBtn.className = 'btn-card btn-allow';
    bindI18n(allowBtn, 'allowBtn');

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-card';
    bindI18n(skipBtn, 'skipBtn');

    const statusNote = document.createElement('span');
    statusNote.className = 'card-note';

    const finish = (choice, noteKey) => {
      ctl.onAbort = null;
      allowBtn.disabled = true;
      skipBtn.disabled = true;
      bindI18n(statusNote, noteKey);
      resolve(choice);
    };

    ctl.onAbort = () => finish('stop', 'statusStopped');
    allowBtn.addEventListener('click', () => finish('allow', 'statusAllowed'));
    skipBtn.addEventListener('click', () => finish('skip', 'statusSkipped'));

    actions.append(allowBtn, skipBtn, statusNote);
    wrap.append(text, actions);
    appendAndScroll(container, emptyState, wrap);
  });
}

export function appendFormFillCard(container, emptyState, rows, provider, onApply) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-card';

  const header = document.createElement('div');
  header.className = 'fill-header';
  bindI18n(header, rows.length === 1 ? 'fillReviewHeaderOne' : 'fillReviewHeader', { n: rows.length });
  wrap.appendChild(header);

  const list = document.createElement('div');
  list.className = 'fill-rows';
  const rowChecks = [];

  rows.forEach((row) => {
    const item = document.createElement('label');
    const tierCls = row.tier === 'sensitive' ? 'fill-sensitive' : (row.tier === 'amber' ? 'fill-amber' : '');
    item.className = tierCls ? `fill-row ${tierCls}` : 'fill-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = row.checked;
    cb.disabled = row.disabled;
    rowChecks.push({ row, cb });

    const info = document.createElement('div');
    info.className = 'fill-row-info';
    const lbl = document.createElement('span');
    lbl.className = 'fill-field-name';
    lbl.textContent = row.fieldLabel;
    const val = document.createElement('span');
    val.className = row.tier === 'sensitive' ? 'fill-field-sens' : 'fill-field-val';
    if (row.displayKey) bindI18n(val, row.displayKey);
    else val.textContent = row.displayValue;
    info.append(lbl, val);

    const conf = document.createElement('span');
    conf.className = 'fill-conf';
    if (row.tier === 'sensitive') bindI18n(conf, 'sensitiveBadge');
    else conf.textContent = `${Math.round(row.confidence * 100)}%`;

    item.append(cb, info, conf);
    list.appendChild(item);
  });

  const footer = document.createElement('div');
  footer.className = 'card-actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn-card btn-allow';
  bindI18n(applyBtn, 'applyBtn');
  applyBtn.disabled = !rows.some((r) => !r.disabled);

  const note = document.createElement('span');
  note.className = 'card-note';
  if (provider) bindI18n(note, 'viaProvider', { provider: provider === 'groq' ? 'Groq' : 'Gemini' });

  applyBtn.addEventListener('click', async () => {
    const selected = rowChecks
      .filter(({ row, cb }) => !row.disabled && cb.checked)
      .map(({ row }) => ({ id: row.fieldId, value: row.value, tier: row.tier }));
    if (selected.length === 0) {
      bindI18n(note, 'noRowsSelected');
      return;
    }
    applyBtn.disabled = true;
    const res = await onApply(selected);
    if (res.ok) bindI18n(note, 'appliedFields', { n: res.count });
    else if (res.error) { clearI18n(note); note.textContent = res.error; }
    else bindI18n(note, 'applyFailed');
  });

  footer.append(applyBtn, note);
  wrap.append(list, footer);
  appendAndScroll(container, emptyState, wrap);
}

export function appendUnreadablePageCard(container, emptyState, onNavigate) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-card';

  const msg = document.createElement('div');
  bindI18n(msg, 'unreadableCardMsg');

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const googleBtn = document.createElement('button');
  googleBtn.type = 'button';
  googleBtn.className = 'btn-card btn-allow';
  bindI18n(googleBtn, 'openGoogleBtn');

  const form = document.createElement('form');
  form.className = 'unreadable-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'unreadable-input';
  input.placeholder = t('goWebsitePh');
  input.setAttribute('aria-label', t('goWebsitePh'));
  input.dataset.i18nPlaceholder = 'goWebsitePh';
  input.dataset.i18nAria = 'goWebsitePh';

  const goBtn = document.createElement('button');
  goBtn.type = 'submit';
  goBtn.className = 'btn-card';
  bindI18n(goBtn, 'goBtn');

  const note = document.createElement('span');
  note.className = 'card-note';

  const runNav = async (targetText) => {
    bindI18n(note, 'openingStatus');
    const res = await onNavigate(targetText);
    if (!res.ok) {
      if (res.error) { clearI18n(note); note.textContent = res.error; }
      else bindI18n(note, 'openFailed');
    } else {
      bindI18n(note, 'openedStatus');
    }
  };

  googleBtn.addEventListener('click', () => runNav('https://www.google.com/'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val) runNav(val);
    else input.focus();
  });

  form.append(input, goBtn);
  actions.append(googleBtn, form, note);
  wrap.append(msg, actions);
  appendAndScroll(container, emptyState, wrap);
  return input;
}

export function appendStepLine(container, emptyState, text) {
  const el = document.createElement('div');
  el.className = 'msg msg-step';
  setTextOrI18n(el, text);
  appendAndScroll(container, emptyState, el);
}
