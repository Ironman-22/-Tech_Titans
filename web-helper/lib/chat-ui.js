// FormMitra — Chat Message, Find Card, Approval Card, Form Fill Review & Error Bubble Renderers

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
    tag.textContent = provider === 'groq' ? 'via Groq' : 'via Gemini';
    wrap.appendChild(tag);
  }

  appendAndScroll(container, emptyState, wrap);
}

export function appendFindCard(container, emptyState, query, count, index, sendAction) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-card';

  const label = document.createElement('div');
  const fmt = (c, idx) => (c === 0 ? '0 matches' : `${c} ${c === 1 ? 'match' : 'matches'} (${idx} of ${c} for "${query}")`);
  label.textContent = fmt(count, index);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-card';
  prevBtn.textContent = 'Prev';
  prevBtn.disabled = count === 0;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-card';
  nextBtn.textContent = 'Next';
  nextBtn.disabled = count === 0;

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn-card';
  clearBtn.textContent = 'Clear';
  clearBtn.disabled = count === 0;

  const nav = async (dir) => {
    const res = await sendAction({ action: 'FIND_NAV', dir });
    if (res.ok) label.textContent = fmt(res.count, res.index);
  };

  prevBtn.addEventListener('click', () => nav('prev'));
  nextBtn.addEventListener('click', () => nav('next'));
  clearBtn.addEventListener('click', async () => {
    await sendAction({ action: 'FIND_CLEAR' });
    label.textContent = 'Highlights cleared.';
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
  line.textContent = summaryText;
  wrap.appendChild(line);

  if (rawDetail) {
    const details = document.createElement('details');
    details.className = 'error-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
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
  retryBtn.textContent = 'Retry';
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
    text.textContent = promptText;

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const allowBtn = document.createElement('button');
    allowBtn.type = 'button';
    allowBtn.className = 'btn-card btn-allow';
    allowBtn.textContent = 'Allow';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-card';
    skipBtn.textContent = 'Skip';

    const statusNote = document.createElement('span');
    statusNote.className = 'card-note';

    const finish = (choice, note) => {
      ctl.onAbort = null;
      allowBtn.disabled = true;
      skipBtn.disabled = true;
      statusNote.textContent = note;
      resolve(choice);
    };

    ctl.onAbort = () => finish('stop', 'Stopped');
    allowBtn.addEventListener('click', () => finish('allow', 'Allowed'));
    skipBtn.addEventListener('click', () => finish('skip', 'Skipped'));

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
  header.textContent = `Form Fill Review (${rows.length} ${rows.length === 1 ? 'field' : 'fields'})`;
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
    val.textContent = row.displayValue;
    info.append(lbl, val);

    const conf = document.createElement('span');
    conf.className = 'fill-conf';
    conf.textContent = row.tier === 'sensitive' ? 'Sensitive' : `${Math.round(row.confidence * 100)}%`;

    item.append(cb, info, conf);
    list.appendChild(item);
  });

  const footer = document.createElement('div');
  footer.className = 'card-actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn-card btn-allow';
  applyBtn.textContent = 'Apply';
  applyBtn.disabled = !rows.some((r) => !r.disabled);

  const note = document.createElement('span');
  note.className = 'card-note';
  if (provider) note.textContent = provider === 'groq' ? 'via Groq' : 'via Gemini';

  applyBtn.addEventListener('click', async () => {
    const selected = rowChecks
      .filter(({ row, cb }) => !row.disabled && cb.checked)
      .map(({ row }) => ({ id: row.fieldId, value: row.value, tier: row.tier }));
    if (selected.length === 0) {
      note.textContent = 'No rows selected.';
      return;
    }
    applyBtn.disabled = true;
    const res = await onApply(selected);
    note.textContent = res.ok ? `Applied ${res.count} field(s).` : (res.error || 'Apply failed.');
  });

  footer.append(applyBtn, note);
  wrap.append(list, footer);
  appendAndScroll(container, emptyState, wrap);
}

export function appendUnreadablePageCard(container, emptyState, onNavigate) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-card';

  const msg = document.createElement('div');
  msg.textContent = "I can't read this browser page. I can open a website for you instead.";

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const googleBtn = document.createElement('button');
  googleBtn.type = 'button';
  googleBtn.className = 'btn-card btn-allow';
  googleBtn.textContent = 'Open Google';

  const form = document.createElement('form');
  form.className = 'unreadable-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'unreadable-input';
  input.placeholder = 'Go to a website or search';
  input.setAttribute('aria-label', 'Go to a website or search');

  const goBtn = document.createElement('button');
  goBtn.type = 'submit';
  goBtn.className = 'btn-card';
  goBtn.textContent = 'Go';

  const note = document.createElement('span');
  note.className = 'card-note';

  const runNav = async (targetText) => {
    note.textContent = 'Opening...';
    const res = await onNavigate(targetText);
    if (!res.ok) note.textContent = res.error || 'Could not open website.';
    else note.textContent = 'Opened.';
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
  el.textContent = text;
  appendAndScroll(container, emptyState, el);
}
