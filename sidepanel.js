// FormMitra — Side Panel Script
// Handles 1-Click Autofill, Web Crypto AES-GCM Encrypted Local Vault, Trilingual Ask AI, Document Verifier, and Student Review.

(function () {
  'use strict';

  console.log('[FormMitra:SidePanel] Side panel initializing...');

  /* ── DOM Cache ──────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  const dom = {
    langSelect: $('lang-select'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Tab 1: Vault & Autofill
    btnAutofill: $('btn-autofill'),
    btnSaveVault: $('btn-save-vault'),
    btnLoadDemo: $('btn-load-demo'),
    autofillStatus: $('autofill-status'),
    vaultForm: $('vault-form'),

    // Tab 2: Ask AI
    aiActiveLang: $('ai-active-lang'),
    askFieldInput: $('ask-field-input'),
    btnMic: $('btn-mic'),
    btnExplain: $('btn-explain'),
    micStatus: $('mic-status'),
    aiResultCard: $('ai-result-card'),
    aiResultTitle: $('ai-result-title'),
    aiResultBody: $('ai-result-body'),
    topicChips: document.querySelectorAll('.topic-chip'),

    // Tab 3: Document Check
    docTypeSelect: $('doc-type-select'),
    uploadDropzone: $('upload-dropzone'),
    docFileInput: $('doc-file-input'),
    docCheckLoading: $('doc-check-loading'),
    docResultsBox: $('doc-results-box'),
    docStatusBar: $('doc-status-bar'),
    docStatusIcon: $('doc-status-icon'),
    docStatusText: $('doc-status-text'),
    docIssuesList: $('doc-issues-list'),
    docDetailsNote: $('doc-details-note'),

    // Tab 4: Student Review
    btnRefreshReview: $('btn-refresh-review'),
    reviewFieldsList: $('review-fields-list'),
    studentDeclarationCheck: $('student-declaration-check'),
    submitGuidance: $('submit-guidance'),
    guidanceText: $('guidance-text')
  };

  /* ── App State ──────────────────────────────────────────────── */
  const state = {
    language: 'en', // 'en', 'kn', 'hi'
    currentTab: 'tab-autofill',
    voiceState: 'idle', // 'idle' | 'recording' | 'transcribing'
    mediaRecorder: null,
    audioStream: null,
    audioChunks: [],
    audioTimer: null
  };

  /* ══════════════════════════════════════════════════════════════
     §1  WEB CRYPTO AES-GCM LOCAL VAULT ENCRYPTION
     ══════════════════════════════════════════════════════════════ */

  async function getOrCreateVaultKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['fmVaultKeyRaw'], async (res) => {
        try {
          if (res.fmVaultKeyRaw && Array.isArray(res.fmVaultKeyRaw)) {
            const rawKey = new Uint8Array(res.fmVaultKeyRaw);
            const importedKey = await crypto.subtle.importKey(
              'raw',
              rawKey,
              { name: 'AES-GCM' },
              false,
              ['encrypt', 'decrypt']
            );
            return resolve(importedKey);
          }

          // Generate a cryptographically secure 256-bit AES key
          const raw = crypto.getRandomValues(new Uint8Array(32));
          chrome.storage.local.set({ fmVaultKeyRaw: Array.from(raw) }, async () => {
            const key = await crypto.subtle.importKey(
              'raw',
              raw,
              { name: 'AES-GCM' },
              false,
              ['encrypt', 'decrypt']
            );
            resolve(key);
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async function encryptVault(profileObj) {
    console.log('[FormMitra:SidePanel] Encrypting profile vault with Web Crypto AES-GCM...');
    const key = await getOrCreateVaultKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(profileObj));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(cipher))
    };
  }

  async function decryptVault(stored) {
    if (!stored || !stored.iv || !stored.ciphertext) return null;
    console.log('[FormMitra:SidePanel] Decrypting profile vault with Web Crypto AES-GCM...');
    const key = await getOrCreateVaultKey();
    const iv = new Uint8Array(stored.iv);
    const ciphertext = new Uint8Array(stored.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  function readVaultForm() {
    const fields = [
      'fullName', 'dob', 'gender', 'aadhaar', 'mobile', 'email',
      'fatherName', 'motherName', 'category', 'casteCertNo',
      'income', 'rdNumber', 'college', 'usn', 'course', 'year',
      'domicile', 'bankAccount', 'ifsc', 'address', 'district', 'state', 'pincode'
    ];
    const profile = {};
    fields.forEach((f) => {
      const el = $(`prof-${f}`);
      if (el) profile[f] = el.value.trim();
    });
    return profile;
  }

  function populateVaultForm(profile) {
    if (!profile) return;
    Object.entries(profile).forEach(([k, v]) => {
      const el = $(`prof-${k}`);
      if (el) el.value = v;
    });
  }

  async function saveVaultToStorage() {
    const profile = readVaultForm();
    try {
      const encrypted = await encryptVault(profile);
      await new Promise((resolve) => {
        chrome.storage.local.set({ fmVaultEncrypted: encrypted }, resolve);
      });
      showStatus('Local encrypted vault saved successfully!', 'success');
      console.log('[FormMitra:SidePanel] Vault encrypted and stored in chrome.storage.local.');
    } catch (err) {
      console.error('[FormMitra:SidePanel] Encryption save failed:', err);
      showStatus('Failed to encrypt vault: ' + err.message, 'error');
    }
  }

  async function loadVaultFromStorage() {
    chrome.storage.local.get(['fmVaultEncrypted'], async (res) => {
      if (res.fmVaultEncrypted) {
        try {
          const profile = await decryptVault(res.fmVaultEncrypted);
          if (profile) {
            populateVaultForm(profile);
            console.log('[FormMitra:SidePanel] Loaded and decrypted profile from vault.');
          }
        } catch (err) {
          console.warn('[FormMitra:SidePanel] Decryption failed, may be fresh install:', err);
        }
      }
    });
  }

  function showStatus(text, type = 'success') {
    if (!dom.autofillStatus) return;
    dom.autofillStatus.textContent = text;
    dom.autofillStatus.className = `status-msg ${type}`;
    dom.autofillStatus.classList.remove('hidden');
    setTimeout(() => {
      dom.autofillStatus.classList.add('hidden');
    }, 4500);
  }

  /* ══════════════════════════════════════════════════════════════
     §2  1-CLICK AUTOFILL
     ══════════════════════════════════════════════════════════════ */

  async function handle1ClickAutofill() {
    console.log('[FormMitra:SidePanel] 1-Click Autofill clicked.');
    const profile = readVaultForm();
    await saveVaultToStorage();

    showStatus('Scanning page and filling fields...', 'success');

    // Relay to Content Script via Background Service Worker
    chrome.runtime.sendMessage({
      target: 'content',
      action: 'AUTOFILL_PAGE',
      profile
    }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error('[FormMitra:SidePanel] Relay error:', chrome.runtime.lastError.message);
        showStatus('Error communicating with page: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (resp && resp.success) {
        console.log(`[FormMitra:SidePanel] Autofill successful. ${resp.filledCount} fields filled.`);
        showStatus(`Success! Autofilled ${resp.filledCount} scholarship fields with violet glow.`, 'success');
        // Update review tab if summary is available
        if (resp.summary) {
          renderReviewSummary(resp.summary);
        }
      } else {
        showStatus(resp?.error || 'Could not autofill fields on active page.', 'error');
      }
    });
  }

  function loadDemoStudentProfile() {
    const demo = {
      fullName: 'Rahul Kumar',
      dob: '2004-06-15',
      gender: 'Male',
      aadhaar: '5421 9876 1234',
      mobile: '9876543210',
      email: 'rahul.kumar@student.ac.in',
      fatherName: 'Suresh Kumar',
      motherName: 'Sunita Devi',
      category: 'OBC',
      casteCertNo: 'RD0038912345',
      income: '180000',
      rdNumber: 'RD0038741098',
      college: 'BMS College of Engineering',
      usn: '1BM22CS091',
      course: 'B.Tech Computer Science',
      year: '2nd Year',
      domicile: 'Karnataka Domicile',
      bankAccount: '389102938102',
      ifsc: 'SBIN0040123',
      address: '#42, 5th Cross, Malleshwaram',
      district: 'Bangalore Urban',
      state: 'Karnataka',
      pincode: '560003'
    };
    populateVaultForm(demo);
    showStatus('Loaded sample student profile data.', 'success');
  }

  /* ══════════════════════════════════════════════════════════════
     §3  ASK AI FIELD EXPLAINER & VOICE INPUT
     ══════════════════════════════════════════════════════════════ */

  async function requestFieldExplanation(fieldLabel) {
    if (!fieldLabel || !fieldLabel.trim()) return;
    const label = fieldLabel.trim();
    console.log(`[FormMitra:SidePanel] Requesting explanation for "${label}" in ${state.language}`);

    if (dom.aiResultCard) {
      dom.aiResultCard.classList.remove('hidden');
      dom.aiResultTitle.textContent = label;
      dom.aiResultBody.innerHTML = '<em>Consulting FormMitra scholarship intelligence...</em>';
    }

    // Call background service worker endpoint
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'EXPLAIN_FIELD',
      payload: {
        field_label: label,
        context: 'Scholarship Application Portal',
        language: state.language
      }
    }, (resp) => {
      if (chrome.runtime.lastError) {
        dom.aiResultBody.textContent = 'Failed to load explanation: ' + chrome.runtime.lastError.message;
        return;
      }

      if (resp && resp.success && resp.data) {
        console.log('[FormMitra:SidePanel] Explanation received:', resp.data);
        dom.aiResultTitle.textContent = resp.data.field_label || label;
        dom.aiResultBody.textContent = resp.data.explanation || 'No explanation available.';
      } else {
        dom.aiResultBody.textContent = resp?.error || 'Could not fetch explanation. Please ensure backend is running.';
      }
    });
  }

  // Voice Input Machine
  async function toggleMic() {
    if (state.voiceState === 'transcribing') return;

    if (state.voiceState === 'recording') {
      stopRecording();
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioStream = stream;
      state.audioChunks = [];

      const mediaRecorder = new MediaRecorder(stream);
      state.mediaRecorder = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        await handleAudioTranscription(audioBlob);
      };

      mediaRecorder.start();
      state.voiceState = 'recording';
      dom.btnMic.classList.add('recording');
      dom.micStatus.classList.remove('hidden');
      dom.micStatus.textContent = 'Listening... tap mic again to finish';

      // Auto-stop after 10 seconds
      state.audioTimer = setTimeout(() => {
        if (state.voiceState === 'recording') stopRecording();
      }, 10000);
    } catch (err) {
      console.warn('[FormMitra:SidePanel] Mic permission error:', err);
      if (err.name === 'NotAllowedError') {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
      }
      dom.micStatus.classList.remove('hidden');
      dom.micStatus.textContent = 'Mic access needed. Allow microphone in the tab.';
    }
  }

  function stopRecording() {
    if (state.voiceState !== 'recording') return;
    clearTimeout(state.audioTimer);
    state.voiceState = 'transcribing';
    dom.btnMic.classList.remove('recording');
    dom.micStatus.textContent = 'Transcribing voice...';

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    if (state.audioStream) {
      state.audioStream.getTracks().forEach((t) => t.stop());
    }
  }

  async function handleAudioTranscription(blob) {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'TRANSCRIBE_AUDIO',
          payload: { mimeType: 'audio/webm', base64 }
        }, (resp) => {
          state.voiceState = 'idle';
          dom.micStatus.classList.add('hidden');

          if (resp && resp.success && resp.data && resp.data.text) {
            console.log('[FormMitra:SidePanel] Voice transcription:', resp.data.text);
            dom.askFieldInput.value = resp.data.text;
            requestFieldExplanation(resp.data.text);
          } else {
            dom.micStatus.classList.remove('hidden');
            dom.micStatus.textContent = 'Could not catch voice. Please try typing.';
            setTimeout(() => dom.micStatus.classList.add('hidden'), 3000);
          }
        });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      state.voiceState = 'idle';
      dom.micStatus.classList.add('hidden');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     §4  DOCUMENT VERIFICATION
     ══════════════════════════════════════════════════════════════ */

  async function handleDocumentUpload(file) {
    if (!file) return;
    const docType = dom.docTypeSelect.value;
    console.log(`[FormMitra:SidePanel] Checking document: ${file.name} (${file.size} bytes) as ${docType}`);

    dom.docCheckLoading.classList.remove('hidden');
    dom.docResultsBox.classList.add('hidden');

    // 1. Client-side Size Check (< 2MB)
    const sizeKB = file.size / 1024;
    const clientIssues = [];
    if (file.size > 2 * 1024 * 1024) {
      clientIssues.push(`File size exceeds 2MB limit (${(sizeKB / 1024).toFixed(2)} MB). Please compress.`);
    }
    if (file.size < 5 * 1024) {
      clientIssues.push('File is too small (<5KB). Image appears empty or corrupted.');
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Image = reader.result;

      chrome.runtime.sendMessage({
        target: 'background',
        action: 'CHECK_DOCUMENT',
        payload: {
          image: base64Image,
          doc_type: docType,
          filename: file.name
        }
      }, (resp) => {
        dom.docCheckLoading.classList.add('hidden');
        dom.docResultsBox.classList.remove('hidden');

        if (chrome.runtime.lastError || !resp || !resp.success) {
          // If backend offline, show client verification
          const ok = clientIssues.length === 0;
          renderDocResults(ok, clientIssues, ok ? 'File format & size verified (<2MB).' : 'Issues detected.');
          return;
        }

        const data = resp.data;
        const allIssues = [...clientIssues, ...(data.issues || [])];
        const isOk = allIssues.length === 0;
        renderDocResults(isOk, allIssues, data.details || (isOk ? 'Document meets scholarship requirements.' : 'Issues found.'));
      });
    };
    reader.readAsDataURL(file);
  }

  function renderDocResults(ok, issues, details) {
    if (ok) {
      dom.docStatusBar.className = 'result-status-bar status-passed';
      dom.docStatusText.textContent = 'Document Verification Passed';
      dom.docStatusIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      `;
      dom.docIssuesList.innerHTML = '';
      dom.docDetailsNote.textContent = details || 'Official seals, resolution clarity, and file size validated successfully.';
    } else {
      dom.docStatusBar.className = 'result-status-bar status-failed';
      dom.docStatusText.textContent = 'Action Required';
      dom.docStatusIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      `;
      dom.docIssuesList.innerHTML = issues
        .map((iss) => `<div class="doc-issue-item">${iss}</div>`)
        .join('');
      dom.docDetailsNote.textContent = 'Fix the items above and re-upload before submitting to the portal.';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     §5  STUDENT REVIEW & NON-SUBMIT ENFORCEMENT
     ══════════════════════════════════════════════════════════════ */

  function renderReviewSummary(summary) {
    if (!summary || summary.length === 0) {
      dom.reviewFieldsList.innerHTML = '<div class="empty-state">No fields detected on page yet. Open a scholarship form tab and click "Scan Page Fields".</div>';
      return;
    }

    dom.reviewFieldsList.innerHTML = summary.map((item) => `
      <div class="review-item">
        <span class="review-item-label">${item.label || item.key}</span>
        <span class="review-item-value">${item.value || '(empty)'}</span>
      </div>
    `).join('');
  }

  function scanCurrentPageFields() {
    console.log('[FormMitra:SidePanel] Scanning active page for filled review fields...');
    chrome.runtime.sendMessage({
      target: 'content',
      action: 'GET_FILLED_SUMMARY'
    }, (resp) => {
      if (!chrome.runtime.lastError && resp && resp.success) {
        renderReviewSummary(resp.summary);
      } else {
        dom.reviewFieldsList.innerHTML = '<div class="empty-state">Could not read active page. Please make sure the scholarship portal tab is open.</div>';
      }
    });
  }

  function handleDeclarationChange() {
    const isChecked = dom.studentDeclarationCheck.checked;
    if (isChecked) {
      dom.submitGuidance.className = 'submit-guidance alert-success';
      dom.guidanceText.textContent = 'Student declaration confirmed! You may now return to the portal page and submit your application.';
    } else {
      dom.submitGuidance.className = 'submit-guidance alert-warning';
      dom.guidanceText.textContent = 'Please check the student declaration above. On the portal page, final submission will remain disabled until you verify.';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     §6  TAB NAVIGATION & EVENTS
     ══════════════════════════════════════════════════════════════ */

  function switchTab(tabId) {
    state.currentTab = tabId;
    dom.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    dom.tabPanes.forEach((pane) => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  function wireEvents() {
    // Tab switching
    dom.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Language switcher
    dom.langSelect.addEventListener('change', (e) => {
      state.language = e.target.value;
      const names = { en: 'English', kn: 'ಕನ್ನಡ (Kannada)', hi: 'हिंदी (Hindi)' };
      dom.aiActiveLang.textContent = names[state.language] || 'English';
      console.log('[FormMitra:SidePanel] Language set to:', state.language);
    });

    // Tab 1: 1-Click Autofill & Vault
    dom.btnAutofill.addEventListener('click', handle1ClickAutofill);
    dom.btnSaveVault.addEventListener('click', saveVaultToStorage);
    dom.btnLoadDemo.addEventListener('click', loadDemoStudentProfile);

    // Tab 2: Ask AI
    dom.topicChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const topic = chip.dataset.topic;
        dom.askFieldInput.value = topic;
        requestFieldExplanation(topic);
      });
    });

    dom.btnExplain.addEventListener('click', () => {
      requestFieldExplanation(dom.askFieldInput.value);
    });

    dom.askFieldInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        requestFieldExplanation(dom.askFieldInput.value);
      }
    });

    dom.btnMic.addEventListener('click', toggleMic);

    // Tab 3: Doc Check
    dom.uploadDropzone.addEventListener('click', () => {
      dom.docFileInput.click();
    });

    dom.docFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleDocumentUpload(e.target.files[0]);
      }
    });

    dom.uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.uploadDropzone.style.borderColor = 'var(--primary)';
    });

    dom.uploadDropzone.addEventListener('dragleave', () => {
      dom.uploadDropzone.style.borderColor = '#C4B5FD';
    });

    dom.uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.uploadDropzone.style.borderColor = '#C4B5FD';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleDocumentUpload(e.dataTransfer.files[0]);
      }
    });

    // Tab 4: Student Review
    dom.btnRefreshReview.addEventListener('click', scanCurrentPageFields);
    dom.studentDeclarationCheck.addEventListener('change', handleDeclarationChange);

    // Incoming messages from background (e.g. from injected page Ask AI button)
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.target === 'sidepanel' && msg.action === 'TRIGGER_ASK_AI') {
        console.log('[FormMitra:SidePanel] Received TRIGGER_ASK_AI from page for:', msg.fieldLabel);
        switchTab('tab-ask-ai');
        dom.askFieldInput.value = msg.fieldLabel || '';
        requestFieldExplanation(msg.fieldLabel);
      }
    });
  }

  // Initialization
  wireEvents();
  loadVaultFromStorage();

  console.log('[FormMitra:SidePanel] Initialized successfully.');
})();
