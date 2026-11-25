// FormMitra — Content Helpers for Whole-Page Translation & Safe Form Fill/Insert

(function () {
  'use strict';

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG']);
  const ATTR_NAMES = ['placeholder', 'title', 'aria-label'];

  const originalTextMap = new WeakMap();
  const originalAttrMap = new WeakMap();
  const translatedLangMap = new WeakMap();
  const tokenToTarget = new Map();
  let tokenCounter = 0;

  let activeTargetLang = null;
  let dirtyObserver = null;
  let dirtyTimer = null;
  let scrollHandler = null;

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= (window.innerHeight || document.documentElement.clientHeight);
  }

  function isAlreadyTargetLang(text, targetLang) {
    const letters = text.replace(/[\d\s\p{P}\p{S}]/gu, '');
    if (!letters) return true;
    if (targetLang === 'hi') return /[\u0900-\u097F]/.test(text) && !/[a-zA-Z]/.test(text);
    if (targetLang === 'kn') return /[\u0C80-\u0CFF]/.test(text) && !/[a-zA-Z]/.test(text);
    if (targetLang === 'en') return /^[\x00-\x7F]+$/.test(text);
    return false;
  }

  function getAttrCache(el) {
    let map = originalAttrMap.get(el);
    if (!map) {
      map = new Map();
      originalAttrMap.set(el, map);
    }
    return map;
  }

  function notifyDirty() {
    if (!activeTargetLang) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      if (!activeTargetLang) return;
      try {
        const p = chrome.runtime.sendMessage({ action: 'TRANSLATE_DIRTY' });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }, 300);
  }

  function ensureObservers() {
    if (!dirtyObserver && document.body) {
      dirtyObserver = new MutationObserver(() => notifyDirty());
      dirtyObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (!scrollHandler) {
      scrollHandler = () => notifyDirty();
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }
  }

  function stopObservers() {
    clearTimeout(dirtyTimer);
    if (dirtyObserver) {
      dirtyObserver.disconnect();
      dirtyObserver = null;
    }
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
  }

  function collectTranslateBatch(targetLang, viewportOnly = true) {
    if (!document.body) return { ok: true, items: [], hasMoreOffscreen: false };

    activeTargetLang = targetLang;
    ensureObservers();

    const viewportItems = [];
    const offscreenItems = [];
    const seenTexts = new Set();

    const pushItem = (el, id, sourceText) => {
      if (!sourceText || isAlreadyTargetLang(sourceText, targetLang)) return;
      const item = { id, text: sourceText };
      if (isInViewport(el)) viewportItems.push(item);
      else offscreenItems.push(item);
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.isContentEditable || parent.closest('[contenteditable="true"], [contenteditable=""], code, pre')) {
        continue;
      }
      if (!isVisible(parent)) continue;

      if (!originalTextMap.has(node)) {
        const raw = node.nodeValue || '';
        const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
        originalTextMap.set(node, {
          original: raw,
          leading: match ? match[1] : '',
          trimmed: match ? match[2] : raw.trim(),
          trailing: match ? match[3] : ''
        });
      }

      const info = originalTextMap.get(node);
      if (!info.trimmed || translatedLangMap.get(node) === targetLang) continue;
      if (translatedLangMap.has(node) && isAlreadyTargetLang(info.trimmed, targetLang)) {
        node.nodeValue = info.original;
        translatedLangMap.delete(node);
        continue;
      }

      const id = `tx-${++tokenCounter}`;
      tokenToTarget.set(id, { kind: 'text', node });
      pushItem(parent, id, info.trimmed);
    }

    document.querySelectorAll('input[placeholder], input[title], input[aria-label], button[aria-label], button[title], a[aria-label], a[title], [placeholder], [title], [aria-label]').forEach((el) => {
      if (!isVisible(el) || SKIP_TAGS.has(el.tagName) || el.isContentEditable) return;
      const attrCache = getAttrCache(el);
      ATTR_NAMES.forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        const langKey = `attr:${attr}`;
        if (!attrCache.has(attr)) attrCache.set(attr, el.getAttribute(attr) || '');
        const origVal = attrCache.get(attr).trim();
        if (!origVal || attrCache.get(langKey) === targetLang) return;
        if (attrCache.has(langKey) && isAlreadyTargetLang(origVal, targetLang)) {
          el.setAttribute(attr, attrCache.get(attr));
          attrCache.delete(langKey);
          return;
        }
        const id = `at-${++tokenCounter}`;
        tokenToTarget.set(id, { kind: 'attr', node: el, attr });
        pushItem(el, id, origVal);
      });
    });

    const pool = viewportOnly ? viewportItems : [...viewportItems, ...offscreenItems];
    const batch = [];
    let chars = 0;
    for (const item of pool) {
      if (batch.length >= 40 || (batch.length > 0 && chars + item.text.length > 3000)) break;
      batch.push(item);
      chars += item.text.length;
    }

    const remaining = viewportOnly ? (viewportItems.length - batch.length + offscreenItems.length) : (pool.length - batch.length);
    return { ok: true, items: batch, hasMoreOffscreen: offscreenItems.length > 0, remainingCount: Math.max(0, remaining) };
  }

  function applyTranslations(targetLang, entries) {
    if (!Array.isArray(entries)) return { ok: false };
    let applied = 0;

    for (const entry of entries) {
      const target = tokenToTarget.get(entry.id);
      if (!target || typeof entry.translated !== 'string') continue;

      if (target.kind === 'text' && target.node.isConnected) {
        const info = originalTextMap.get(target.node);
        if (info) {
          target.node.nodeValue = `${info.leading}${entry.translated.trim()}${info.trailing}`;
          translatedLangMap.set(target.node, targetLang);
          applied += 1;
        }
      } else if (target.kind === 'attr' && target.node.isConnected) {
        const cache = getAttrCache(target.node);
        target.node.setAttribute(target.attr, entry.translated.trim());
        cache.set(`attr:${target.attr}`, targetLang);
        applied += 1;
      }
      tokenToTarget.delete(entry.id);
    }

    return { ok: true, applied };
  }

  function restoreTranslations() {
    activeTargetLang = null;
    stopObservers();
    tokenToTarget.clear();
    if (!document.body) return { ok: true, restored: 0 };

    let restored = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const info = originalTextMap.get(node);
      if (info) {
        node.nodeValue = info.original;
        translatedLangMap.delete(node);
        restored += 1;
      }
    }

    document.querySelectorAll('[placeholder], [title], [aria-label]').forEach((el) => {
      const cache = originalAttrMap.get(el);
      if (!cache) return;
      ATTR_NAMES.forEach((attr) => {
        if (cache.has(attr)) {
          el.setAttribute(attr, cache.get(attr));
          cache.delete(`attr:${attr}`);
          restored += 1;
        }
      });
    });

    return { ok: true, restored };
  }

  /* ── Form Fill, Insert & Highlight Clear ───────────────────── */
  function setNativeValue(el, value, sensitiveAllowed, isSensitiveFn) {
    if (!el || !isVisible(el) || el.disabled || el.readOnly) return false;
    if (!sensitiveAllowed && isSensitiveFn(el)) return false;

    const str = String(value ?? '');
    if (el.tagName === 'SELECT') {
      const target = str.trim().toLowerCase();
      let matchedVal = null;
      for (const opt of el.options) {
        const ov = (opt.value || '').trim().toLowerCase();
        const ot = (opt.textContent || '').trim().toLowerCase();
        if (ov === target || ot === target) { matchedVal = opt.value; break; }
      }
      if (matchedVal === null) {
        for (const opt of el.options) {
          const ov = (opt.value || '').trim().toLowerCase();
          const ot = (opt.textContent || '').trim().toLowerCase();
          if ((ot && (ot.includes(target) || target.includes(ot))) || (ov && (ov.includes(target) || target.includes(ov)))) {
            matchedVal = opt.value;
            break;
          }
        }
      }
      if (matchedVal === null) return false;
      el.value = matchedVal;
    } else if (el.isContentEditable) {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, str);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } else {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, str);
      else el.value = str;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function applyFieldHighlight(el, tier) {
    el.dataset.fmHighlight = tier;
    if (tier === 'amber') {
      el.style.borderColor = '#D97706';
      el.style.boxShadow = '0 0 0 3px rgba(217, 119, 6, 0.35)';
    } else {
      el.style.borderColor = '#16A34A';
      el.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.35)';
    }
  }

  function fillFields(entries, findByIdFn, isSensitiveFn) {
    let filledCount = 0;
    for (const entry of entries || []) {
      const el = findByIdFn(entry.id);
      if (!el || isSensitiveFn(el)) continue;
      if (setNativeValue(el, entry.value, false, isSensitiveFn)) {
        applyFieldHighlight(el, entry.tier === 'amber' ? 'amber' : 'green');
        filledCount += 1;
      }
    }
    return { ok: true, success: true, count: filledCount };
  }

  function insertFocusedValue(value) {
    const el = document.activeElement;
    const isEditable = el && isVisible(el) && !el.disabled && !el.readOnly && (
      el.isContentEditable ||
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && !/^(hidden|submit|button|reset|image|checkbox|radio|file)$/i.test(el.type || 'text'))
    );
    if (!isEditable) {
      return { success: false, ok: false, error: 'no_focus' };
    }
    const ok = setNativeValue(el, value, true, () => false);
    return ok ? { success: true, ok: true } : { success: false, ok: false, error: 'insert_failed' };
  }

  function clearFormHighlights() {
    document.querySelectorAll('[data-fm-highlight]').forEach((el) => {
      delete el.dataset.fmHighlight;
      el.style.borderColor = '';
      el.style.boxShadow = '';
    });
    return { ok: true };
  }

  window.__formMitraHelpers = {
    collectTranslateBatch,
    applyTranslations,
    restoreTranslations,
    fillFields,
    insertFocusedValue,
    clearFormHighlights
  };
})();
