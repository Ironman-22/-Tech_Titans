// FormMitra — Content Script
// SNAPSHOT reader, non-destructive FIND, guarded CLICK/TYPE/SCROLL, plus delegation to content-helpers.js.

(function () {
  'use strict';

  const INSTANCE_ID = `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const runtimeKey = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || INSTANCE_ID;

  if (window.__formMitraLoaded === runtimeKey) return;
  if (typeof window.__formMitraCleanup === 'function') {
    try { window.__formMitraCleanup(); } catch (_) {}
  }

  window.__formMitraLoaded = runtimeKey;
  window.__formMitraInstanceId = INSTANCE_ID;

  const SAFE_BUTTON_RX = /^(next|continue|previous|back|prev|start|begin|open|view|show|more)\b/i;
  const BLOCKED_CLICK_RX = /submit|pay|confirm|delete|remove|sign.?out|log.?out|send|verify|otp|captcha|checkout|buy|place\s+order/i;
  const SENSITIVE_FIELD_RX = /password|passcode|otp|captcha|cvv|cvc|card.?num|credit|debit|expir|payment|ssn|aadhaar|aadhar|\bpan\b|passport|bank|account|ifsc|\bpin\b/i;
  const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG']);

  let stableIdCounter = 0;
  let findMatches = [];
  let findIndex = -1;

  function assignStableId(el) {
    if (!el.dataset.fmId) {
      stableIdCounter += 1;
      el.dataset.fmId = `fm-${stableIdCounter}`;
    }
    return el.dataset.fmId;
  }

  function findByStableId(id) {
    if (!id || typeof id !== 'string') return null;
    return document.querySelector(`[data-fm-id="${CSS.escape(id)}"]`);
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collapseWs(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function guessPageLanguage(visibleText) {
    const htmlLang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
    if (['en', 'hi', 'kn'].includes(htmlLang)) return htmlLang;
    if (/[\u0C80-\u0CFF]/.test(visibleText)) return 'kn';
    if (/[\u0900-\u097F]/.test(visibleText)) return 'hi';
    return htmlLang || 'en';
  }

  function getElementLabel(el) {
    if (el.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicit) {
        const t = collapseWs(explicit.textContent);
        if (t) return t;
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const t = collapseWs(clone.textContent);
      if (t) return t;
    }
    const aria = collapseWs(el.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy.trim().split(/\s+/).map((id) => collapseWs(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
      if (t) return t;
    }
    const ph = collapseWs(el.getAttribute('placeholder'));
    if (ph) return ph;
    if (el.name) return collapseWs(el.name.replace(/[_\-\[\]]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'));
    return '';
  }

  function collectHeadings() {
    const out = [];
    for (const el of document.querySelectorAll('h1, h2, h3, h4')) {
      if (out.length >= 15) break;
      if (!isVisible(el)) continue;
      const text = collapseWs(el.textContent).slice(0, 120);
      if (text) out.push(text);
    }
    return out;
  }

  function collectInteractive() {
    const prioritySel = '[role="listbox"] a, [role="option"] a, main a, [role="main"] a, button, [role="button"], [role="tab"], [role="grid"] [role="row"], [role="list"] [role="listitem"], [role="option"], [role="listbox"] li, summary';
    const allSel = 'a, button, [role="button"], [role="tab"], [role="link"], [role="option"], [role="listitem"], [role="row"], summary';
    const seen = new Set();
    const out = [];

    const addNode = (el) => {
      if (out.length >= 40 || seen.has(el) || !isVisible(el)) return;
      if (el.matches('li, [role="option"], [role="listitem"]') && el.querySelector('a[href], button, [role="button"]')) return;
      const text = collapseWs(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.value).slice(0, 80);
      if (!text) return;
      seen.add(el);
      const role = (el.getAttribute('role') || '').toLowerCase();
      const tag = el.tagName.toLowerCase();
      out.push({ id: assignStableId(el), text, kind: role || (tag === 'a' ? 'link' : tag) });
    };

    document.querySelectorAll(prioritySel).forEach(addNode);
    document.querySelectorAll(allSel).forEach(addNode);
    return out;
  }

  function collectFormFields() {
    const sel = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"], [role="textbox"]';
    const fields = [];
    let hasSearchBox = Boolean(document.querySelector('[role="search"], [role="searchbox"]'));

    document.querySelectorAll(sel).forEach((el) => {
      if (!isVisible(el)) return;
      const isEditable = el.isContentEditable || el.getAttribute('role') === 'textbox';
      const type = el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (isEditable ? 'composer' : (el.type || 'text').toLowerCase()));
      const label = getElementLabel(el);
      const hint = `${label} ${el.name || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`;
      if (type === 'search' || /\bsearch\b/i.test(hint)) hasSearchBox = true;
      const options = el.tagName === 'SELECT'
        ? Array.from(el.options).slice(0, 30).map((o) => collapseWs(o.textContent || o.value)).filter(Boolean)
        : [];
      fields.push({
        id: assignStableId(el),
        label: label || el.name || type,
        type,
        options,
        required: Boolean(el.required || el.getAttribute('aria-required') === 'true')
      });
    });
    return { formFields: fields, hasSearchBox };
  }

  function takeSnapshot() {
    const visibleText = collapseWs(document.body?.innerText || '').slice(0, 3000);
    const { formFields, hasSearchBox } = collectFormFields();
    return {
      title: collapseWs(document.title),
      url: window.location.href,
      language: guessPageLanguage(visibleText),
      headings: collectHeadings(),
      visibleText,
      interactive: collectInteractive(),
      formFields,
      hasSearchBox
    };
  }

  function clearFindHighlights() {
    const parents = new Set();
    document.querySelectorAll('span[data-fm-find="1"]').forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent || ''), span);
        parents.add(parent);
      }
    });
    parents.forEach((p) => p.normalize());
    findMatches = [];
    findIndex = -1;
  }

  function activateFindMatch(idx) {
    findMatches.forEach((el, i) => {
      if (!el.isConnected) return;
      el.style.backgroundColor = i === idx ? '#FB923C' : '#FEF08A';
      el.style.outline = i === idx ? '2px solid #0B6E6E' : 'none';
    });
    const target = findMatches[idx];
    if (target && target.isConnected) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function findInPage(rawQuery) {
    clearFindHighlights();
    const query = collapseWs(rawQuery);
    if (!query || !document.body) return { ok: true, count: 0, index: 0 };

    const qLower = query.toLowerCase();
    const qLen = query.length;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (!p || SKIP_TEXT_TAGS.has(p.tagName) || p.isContentEditable) continue;
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(qLower)) continue;
      if (isVisible(p)) textNodes.push(node);
    }

    for (const tn of textNodes) {
      if (findMatches.length >= 200) break;
      const val = tn.nodeValue;
      const lower = val.toLowerCase();
      let pos = 0;
      let matchPos = lower.indexOf(qLower, pos);
      if (matchPos === -1) continue;
      const frag = document.createDocumentFragment();
      while (matchPos !== -1 && findMatches.length < 200) {
        if (matchPos > pos) frag.appendChild(document.createTextNode(val.slice(pos, matchPos)));
        const span = document.createElement('span');
        span.dataset.fmFind = '1';
        span.textContent = val.slice(matchPos, matchPos + qLen);
        Object.assign(span.style, { backgroundColor: '#FEF08A', color: '#111827', borderRadius: '2px', padding: '0 1px' });
        frag.appendChild(span);
        findMatches.push(span);
        pos = matchPos + qLen;
        matchPos = lower.indexOf(qLower, pos);
      }
      if (pos < val.length) frag.appendChild(document.createTextNode(val.slice(pos)));
      tn.parentNode.replaceChild(frag, tn);
    }

    if (findMatches.length > 0) {
      findIndex = 0;
      activateFindMatch(0);
    }
    return { ok: true, count: findMatches.length, index: findMatches.length > 0 ? 1 : 0 };
  }

  function navigateFind(dir) {
    findMatches = findMatches.filter((m) => m.isConnected);
    if (findMatches.length === 0) return { ok: true, count: 0, index: 0 };
    findIndex = dir === 'prev' ? (findIndex - 1 + findMatches.length) % findMatches.length : (findIndex + 1) % findMatches.length;
    activateFindMatch(findIndex);
    return { ok: true, count: findMatches.length, index: findIndex + 1 };
  }

  function isSensitiveField(el) {
    if (!el) return true;
    if (el.tagName === 'INPUT' && (el.type === 'password' || el.type === 'hidden')) return true;
    const sig = `${getElementLabel(el)} ${el.name || ''} ${el.id || ''} ${el.getAttribute('autocomplete') || ''}`;
    return SENSITIVE_FIELD_RX.test(sig);
  }

  function isClickBlocked(el) {
    if (!el || !isVisible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const explicitType = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'input' && (explicitType === 'submit' || explicitType === 'password')) return true;
    if (tag === 'button' && (explicitType === 'submit' || (el.closest('form') && explicitType !== 'button'))) return true;
    if (el.closest('[class*="captcha" i], [id*="captcha" i], [data-sitekey]')) return true;
    if (tag === 'a' && /^javascript:/i.test((el.getAttribute('href') || '').trim())) return true;

    const text = collapseWs([el.innerText, el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.value].filter(Boolean).join(' '));
    if (BLOCKED_CLICK_RX.test(text)) return true;

    const btnText = collapseWs(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.value);
    if (tag === 'button' || role === 'button' || (tag === 'input' && explicitType === 'button')) return !SAFE_BUTTON_RX.test(btnText);

    return !(tag === 'a' || tag === 'summary' || role === 'link' || role === 'tab' || role === 'listitem' || role === 'row' || role === 'option' || Boolean(el.closest('[role="listbox"]') && tag === 'li'));
  }

  function handleClick(id) {
    const el = findByStableId(id);
    if (isClickBlocked(el)) return { success: false, error: 'blocked' };

    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const target = hit && el.contains(hit) ? hit : el;

    // Safety: single guarded activation sequence in extension; verified visible, enabled, non-submit, non-sensitive, and allowed role/text by isClickBlocked(el) above.
    const common = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0 };
    const sequence = [
      ['pointerdown', PointerEvent, 1],
      ['mousedown', MouseEvent, 1],
      ['pointerup', PointerEvent, 0],
      ['mouseup', MouseEvent, 0],
      ['click', MouseEvent, 0]
    ];
    for (const [evType, Ctor, buttons] of sequence) {
      const extra = Ctor === PointerEvent ? { pointerId: 1, pointerType: 'mouse', isPrimary: true } : {};
      target.dispatchEvent(new Ctor(evType, { ...common, buttons, ...extra }));
    }

    const targetText = collapseWs(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || target.textContent || '').slice(0, 40);
    return { success: true, targetText };
  }

  function findSearchTarget() {
    const groups = [
      () => document.querySelectorAll('input[type="search"]'),
      () => document.querySelectorAll('[role="searchbox"]'),
      () => Array.from(document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"]'))
        .filter((el) => /search|find/i.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-placeholder') || ''} ${el.getAttribute('title') || ''}`)),
      () => Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'))
        .filter((el) => /search|find/i.test(`${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''}`))
    ];
    for (const getList of groups) {
      for (const el of getList()) {
        if (isVisible(el) && !el.disabled && !el.readOnly && !isSensitiveField(el)) return el;
      }
    }
    return null;
  }

  function findComposerTarget(id) {
    if (id) {
      const byId = findByStableId(id);
      if (byId && isVisible(byId) && !byId.disabled && !byId.readOnly && !isSensitiveField(byId)) return byId;
    }
    for (const el of document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]')) {
      if (!isVisible(el) || el.disabled || el.readOnly || isSensitiveField(el)) continue;
      if (/search|find/i.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`)) continue;
      return el;
    }
    return null;
  }

  function handleType(target, text, id) {
    const str = String(text ?? '');
    const el = target === 'search' ? findSearchTarget() : (target === 'composer' ? findComposerTarget(id) : null);
    if (!el || isSensitiveField(el) || !isVisible(el) || el.disabled || el.readOnly) return { success: false, error: 'blocked' };
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, str);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, str);
      else el.value = str;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { success: true, target, label: getElementLabel(el) || target };
  }

  function handleScroll(id, direction) {
    if (id) {
      const el = findByStableId(id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { success: true }; }
    }
    const stepY = Math.round(window.innerHeight * 0.75);
    if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (direction === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    else if (direction === 'up') window.scrollBy({ top: -stepY, behavior: 'smooth' });
    else window.scrollBy({ top: stepY, behavior: 'smooth' });
    return { success: true };
  }

  function onMessage(msg, _sender, sendResponse) {
    if (!msg || !msg.action || window.__formMitraInstanceId !== INSTANCE_ID) return false;
    const h = window.__formMitraHelpers;

    switch (msg.action) {
      case 'PING': sendResponse({ ok: true, instanceId: INSTANCE_ID }); return false;
      case 'SNAPSHOT': sendResponse({ ok: true, snapshot: takeSnapshot() }); return false;
      case 'FIND': sendResponse(findInPage(msg.query)); return false;
      case 'FIND_NAV': sendResponse(navigateFind(msg.dir)); return false;
      case 'FIND_CLEAR': clearFindHighlights(); sendResponse({ ok: true }); return false;
      case 'CLICK': sendResponse(handleClick(msg.id)); return false;
      case 'TYPE': sendResponse(handleType(msg.target, msg.text, msg.id)); return false;
      case 'SCROLL': sendResponse(handleScroll(msg.id, msg.direction)); return false;
      case 'TRANSLATE_COLLECT': sendResponse(h ? h.collectTranslateBatch(msg.targetLang, msg.viewportOnly !== false) : { ok: false, error: 'Helpers missing' }); return false;
      case 'TRANSLATE_APPLY': sendResponse(h ? h.applyTranslations(msg.targetLang, msg.entries) : { ok: false }); return false;
      case 'TRANSLATE_RESTORE': sendResponse(h ? h.restoreTranslations() : { ok: true }); return false;
      case 'FILL': sendResponse(h ? h.fillFields(msg.entries, findByStableId, isSensitiveField) : { ok: false }); return false;
      case 'INSERT_VALUE': sendResponse(h ? h.insertFocusedValue(msg.value) : { ok: false }); return false;
      case 'HIGHLIGHT_CLEAR': sendResponse(h ? h.clearFormHighlights() : { ok: true }); return false;
      case 'TRANSLATE_DIRTY': return false;
      default: sendResponse({ ok: false, error: `Unknown action: ${msg.action}` }); return false;
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);

  window.__formMitraCleanup = function () {
    clearFindHighlights();
    if (window.__formMitraHelpers) {
      window.__formMitraHelpers.restoreTranslations();
      window.__formMitraHelpers.clearFormHighlights();
    }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) {}
    delete window.__formMitraLoaded;
    delete window.__formMitraInstanceId;
  };
})();
