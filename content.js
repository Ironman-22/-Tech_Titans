// FormMitra — Content Script
// Inspects form fields, maps to profile keys, fills React/standard inputs, applies violet glow, and injects Ask AI buttons.

(function () {
  'use strict';

  if (window.__formMitraLoaded) {
    console.log('[FormMitra:Content] Already initialized on this page.');
    return;
  }
  window.__formMitraLoaded = true;

  console.log('[FormMitra:Content] FormMitra content script loaded on:', window.location.href);

  /* ── Synonyms mapping for 16+ scholarship profile fields ────── */
  const PROFILE_PATTERNS = {
    fullName: [
      /\bfull.?name\b/i, /\bstudent.?name\b/i, /\bapplicant.?name\b/i,
      /\bcandidate.?name\b/i, /\bname\b/i
    ],
    dob: [
      /\b(dob|birth.?date|date.?of.?birth)\b/i
    ],
    gender: [
      /\b(gender|sex)\b/i
    ],
    aadhaar: [
      /\b(aadhaar|aadhar|uid|uidai)\b/i
    ],
    mobile: [
      /\b(mobile|phone|contact.?no|telephone)\b/i
    ],
    email: [
      /\b(email|e-mail|mail)\b/i
    ],
    fatherName: [
      /\b(father|guardian|parent)\b/i
    ],
    motherName: [
      /\b(mother)\b/i
    ],
    category: [
      /\b(category|caste|social.?category|community)\b(?!\s*(?:no|num|cert))/i
    ],
    casteCertNo: [
      /\b(caste.*cert|cert.*no|certificate.*no)\b/i
    ],
    income: [
      /\b(annual.?income|family.?income|gross.*income|income)\b/i
    ],
    rdNumber: [
      /\b(rd.?number|rd.?no|gsc|nadakacheri)\b/i
    ],
    college: [
      /\b(college|institution|university|institute)\b(?!\s*seat)/i
    ],
    usn: [
      /\b(usn|university.?seat|roll.?no|reg.?no|registration.?number)\b/i
    ],
    course: [
      /\b(course|program|degree|branch)\b/i
    ],
    year: [
      /\b(year|semester|current.?year|academic.?year)\b/i
    ],
    domicile: [
      /\b(domicile|residential.?status|nativity|native)\b/i
    ],
    bankAccount: [
      /\b(account.?no|bank.*account|acc.?num|a\/c)\b/i
    ],
    ifsc: [
      /\b(ifsc|branch.?code)\b/i
    ],
    address: [
      /\b(address|street|permanent.?address|residential.?address)\b/i
    ],
    district: [
      /\b(district|city|town)\b/i
    ],
    state: [
      /\b(state|province)\b/i
    ],
    pincode: [
      /\b(pin|pincode|postal.?code|zip|zipcode)\b/i
    ]
  };

  /* ── Label extraction helper ────────────────────────────────── */
  function getElementLabel(el) {
    // 1. Explicit <label for="id">
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }

    // 2. Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach(c => c.remove());
      const txt = clone.textContent.trim();
      if (txt) return txt;
    }

    // 3. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 4. aria-labelledby
    const ariaLabeledBy = el.getAttribute('aria-labelledby');
    if (ariaLabeledBy) {
      const ref = document.getElementById(ariaLabeledBy);
      if (ref && ref.textContent.trim()) return ref.textContent.trim();
    }

    // 5. placeholder
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();

    // 6. name attribute
    if (el.name) {
      return el.name.replace(/[_\-\[\]]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }

    // 7. Preceding label-like sibling
    let prev = el.previousElementSibling;
    if (prev && prev.tagName === 'LABEL' && prev.textContent.trim()) {
      return prev.textContent.trim();
    }
    if (prev && (prev.tagName === 'SPAN' || prev.tagName === 'P') && prev.textContent.trim().length < 50) {
      return prev.textContent.trim();
    }

    return '';
  }

  let idCounter = 0;
  function ensureElementId(el) {
    if (el.id) return el.id;
    const generated = `fm-field-${Date.now()}-${idCounter++}`;
    el.id = generated;
    return generated;
  }

  function isVisible(el) {
    if (el.offsetParent === null && el.type !== 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /* ── Match field to profile key ────────────────────────────── */
  function matchFieldToKey(label, name, id, placeholder) {
    const combined = `${label} ${name} ${id} ${placeholder}`.toLowerCase();
    for (const [key, patterns] of Object.entries(PROFILE_PATTERNS)) {
      for (const rx of patterns) {
        if (rx.test(combined)) {
          return key;
        }
      }
    }
    return null;
  }

  /* ── Read all fillable fields on the page ──────────────────── */
  function scanFields() {
    console.log('[FormMitra:Content] Scanning form fields on page...');
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';
    const elements = document.querySelectorAll(selector);
    const fields = [];

    elements.forEach((el) => {
      if (!isVisible(el)) return;

      const label = getElementLabel(el);
      const id = ensureElementId(el);
      const name = el.name || '';
      const type = el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text'));
      const placeholder = el.placeholder || '';
      const matchedKey = matchFieldToKey(label, name, id, placeholder);

      fields.push({
        id,
        label: label || name || id,
        name,
        type,
        placeholder,
        matchedKey,
        currentValue: el.value || ''
      });
    });

    console.log(`[FormMitra:Content] Found ${fields.length} interactive fields (${fields.filter(f => f.matchedKey).length} matched)`);
    return fields;
  }

  /* ── Apply Violet Glow ─────────────────────────────────────── */
  function applyVioletGlow(el) {
    el.classList.add('formmitra-filled');
    el.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.45)';
    el.style.borderColor = '#8B5CF6';
    el.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
  }

  /* ── Fill React/Standard Controlled Element ────────────────── */
  function fillElement(el, value) {
    if (!el || value === undefined || value === null) return false;
    const stringVal = String(value);

    try {
      if (el.tagName === 'SELECT') {
        const target = stringVal.trim().toLowerCase();
        let matched = false;
        for (const opt of el.options) {
          const optVal = opt.value.trim().toLowerCase();
          const optTxt = opt.textContent.trim().toLowerCase();
          if (optVal === target || optTxt === target || optTxt.includes(target) || target.includes(optTxt)) {
            el.value = opt.value;
            matched = true;
            break;
          }
        }
        if (!matched && el.options.length > 0) {
          // If no exact match, fallback to direct value set
          el.value = stringVal;
        }
      } else if (el.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(el, stringVal);
        } else {
          el.value = stringVal;
        }
      } else if (el.type === 'radio' || el.type === 'checkbox') {
        const isMatch = stringVal.toLowerCase() === 'true' ||
                        stringVal.toLowerCase() === (el.value || '').toLowerCase() ||
                        stringVal.toLowerCase() === getElementLabel(el).toLowerCase();
        el.checked = isMatch;
      } else {
        // Standard input (text, email, tel, date, number, etc.)
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(el, stringVal);
        } else {
          el.value = stringVal;
        }
      }

      // Dispatch bubbling synthetic events for React 19, Vue, and Angular listeners
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      // Apply the required violet glow to every filled field
      applyVioletGlow(el);
      return true;
    } catch (err) {
      console.error('[FormMitra:Content] Error filling element:', el, err);
      return false;
    }
  }

  /* ── 1-Click Autofill Form ─────────────────────────────────── */
  function autofillPage(profile) {
    console.log('[FormMitra:Content] Starting 1-Click Autofill with profile keys:', Object.keys(profile || {}));
    if (!profile) return { success: false, filledCount: 0, fields: [] };

    const fields = scanFields();
    let filledCount = 0;
    const filledKeys = [];
    const summary = [];

    fields.forEach((field) => {
      const el = document.getElementById(field.id);
      if (!el) return;

      const key = field.matchedKey;
      if (key && profile[key] !== undefined && profile[key] !== '') {
        const valToFill = profile[key];
        const success = fillElement(el, valToFill);
        if (success) {
          filledCount++;
          filledKeys.push(key);
          summary.push({
            label: field.label,
            key,
            value: valToFill
          });
        }
      }
    });

    console.log(`[FormMitra:Content] Autofill completed: filled ${filledCount} fields.`);
    return {
      success: true,
      filledCount,
      filledKeys,
      summary
    };
  }

  /* ── Injected "Ask AI" Buttons ─────────────────────────────── */
  function injectAskAiButtons() {
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';
    const elements = document.querySelectorAll(selector);

    elements.forEach((el) => {
      if (!isVisible(el)) return;
      if (el.dataset.fmAskAiInjected) return;

      // Check if nearby container already has an Ask AI button (e.g. built into the demo portal)
      const container = el.closest('.form-group') || el.closest('div') || el.parentElement;
      if (container && container.querySelector('.ask-ai-btn, [data-ask-ai]')) {
        el.dataset.fmAskAiInjected = 'true';
        return;
      }

      const label = getElementLabel(el);
      if (!label) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fm-injected-ask-ai';
      btn.setAttribute('aria-label', `Ask AI about ${label}`);
      btn.title = `Ask AI: What is ${label}?`;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <span>Ask AI</span>
      `;

      // Inline styles for high compatibility and non-intrusive UI
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '4px';
      btn.style.marginLeft = '8px';
      btn.style.padding = '2px 8px';
      btn.style.fontSize = '11px';
      btn.style.fontWeight = '500';
      btn.style.color = '#7C3AED';
      btn.style.backgroundColor = '#F5F3FF';
      btn.style.border = '1px solid #DDD6FE';
      btn.style.borderRadius = '9999px';
      btn.style.cursor = 'pointer';
      btn.style.verticalAlign = 'middle';
      btn.style.transition = 'all 0.2s';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[FormMitra:Content] Ask AI clicked for field:', label);

        // Highlight this field
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        applyVioletGlow(el);

        // Send to background to trigger Side Panel
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'PAGE_ASK_AI_CLICKED',
          fieldLabel: label,
          context: document.title || 'Scholarship Portal'
        });
      });

      // Try appending next to label or directly after input
      const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      if (labelEl && !labelEl.querySelector('.fm-injected-ask-ai')) {
        labelEl.appendChild(btn);
      } else if (el.parentNode) {
        el.parentNode.insertBefore(btn, el.nextSibling);
      }

      el.dataset.fmAskAiInjected = 'true';
    });
  }

  // Initial scan & injection after DOM settles
  setTimeout(injectAskAiButtons, 500);

  // Listen for portal custom event
  window.addEventListener('formmitra:ask-ai', (e) => {
    const detail = e.detail || {};
    console.log('[FormMitra:Content] Caught formmitra:ask-ai event from portal:', detail);
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'PAGE_ASK_AI_CLICKED',
      fieldLabel: detail.fieldLabel,
      context: detail.context || document.title || 'Scholarship Portal'
    }).catch(() => {});
  });

  // Re-run injection if SPA navigates or changes form steps
  const observer = new MutationObserver(() => {
    injectAskAiButtons();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Get summary of all filled fields for Student Approval ──── */
  function getFilledSummary() {
    const fields = scanFields();
    const filled = [];
    fields.forEach((f) => {
      const el = document.getElementById(f.id);
      if (!el) return;
      const val = el.value || (el.checked ? 'Checked' : '');
      if (val && val.trim()) {
        filled.push({
          id: f.id,
          label: f.label,
          value: val
        });
      }
    });
    return filled;
  }

  /* ── Listen for messages from Background / Side Panel ──────── */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.action) return false;

    console.log('[FormMitra:Content] Received message action:', msg.action);

    switch (msg.action) {
      case 'SCAN_FIELDS': {
        const fields = scanFields();
        sendResponse({ success: true, fields });
        break;
      }
      case 'AUTOFILL_PAGE': {
        const result = autofillPage(msg.profile);
        sendResponse(result);
        break;
      }
      case 'GET_FILLED_SUMMARY': {
        const filled = getFilledSummary();
        sendResponse({ success: true, summary: filled });
        break;
      }
      case 'HIGHLIGHT_FIELD': {
        const el = document.getElementById(msg.fieldId);
        if (el) {
          applyVioletGlow(el);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Field not found' });
        }
        break;
      }
      case 'CLEAR_HIGHLIGHTS': {
        document.querySelectorAll('.formmitra-filled').forEach((el) => {
          el.classList.remove('formmitra-filled');
          el.style.boxShadow = '';
          el.style.borderColor = '';
        });
        sendResponse({ success: true });
        break;
      }
      default:
        return false;
    }
    return true;
  });

})();
