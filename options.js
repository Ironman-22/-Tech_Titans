(function () {
  'use strict';

  const PROFILE_KEYS = [
    'name','gender','email','phone','address','city','state','pincode',
    'dob','fatherName','motherName','education','marks','income','category'
  ];

  const $ = id => document.getElementById(id);

  // ── Custom fields ──────────────────
  function addKVRow(key, value) {
    const wrap = document.createElement('div');
    wrap.className = 'kv-row';
    const ki = document.createElement('input');
    ki.type = 'text'; ki.placeholder = 'Field name'; ki.value = key || '';
    const vi = document.createElement('input');
    vi.type = 'text'; vi.placeholder = 'Value'; vi.value = value || '';
    const rm = document.createElement('button');
    rm.className = 'kv-remove'; rm.textContent = '×'; rm.title = 'Remove';
    rm.addEventListener('click', () => wrap.remove());
    wrap.appendChild(ki);
    wrap.appendChild(vi);
    wrap.appendChild(rm);
    $('custom-fields').appendChild(wrap);
  }

  $('add-kv-btn').addEventListener('click', () => addKVRow('', ''));

  const DEFAULT_PROFILE = {
    name: 'Rahul Kumar', email: 'rahul.kumar@example.com', phone: '+91 98765 43210',
    address: '123 MG Road, Indiranagar', city: 'Bangalore', state: 'Karnataka', pincode: '560038',
    gender: 'Male', education: 'B.Tech Computer Science', income: '850000', marks: '88%', category: 'General'
  };

  function sanitizeKey(val) {
    return (val || '').replace(/[\r\n"']/g, '').trim();
  }

  // ── Load ───────────────────────────
  chrome.storage.local.get(['whProfile', 'whApiKey', 'whModel'], data => {
    const p = (data.whProfile && Object.keys(data.whProfile).length > 0) ? data.whProfile : DEFAULT_PROFILE;
    PROFILE_KEYS.forEach(k => { if (p[k]) $(k).value = p[k]; });
    if (p.custom) {
      Object.entries(p.custom).forEach(([k, v]) => addKVRow(k, v));
    }
    $('apiKey').value = data.whApiKey || 'paste here';
    if (data.whModel) {
      $('modelSelect').value = data.whModel;
    }
  });

  // ── Test Connection ────────────────
  const testBtn = $('test-conn-btn');
  const connStatus = $('conn-status');

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const apiKey = sanitizeKey($('apiKey').value);
      const model = $('modelSelect').value;

      if (!apiKey) {
        connStatus.className = 'conn-status err';
        connStatus.textContent = '✗ Please paste an API key first.';
        return;
      }

      testBtn.disabled = true;
      connStatus.className = 'conn-status testing';
      connStatus.textContent = 'Testing connection…';

      chrome.runtime.sendMessage({
        target: 'background',
        action: 'TEST_CONNECTION',
        payload: { apiKey, model }
      }, (resp) => {
        testBtn.disabled = false;
        if (chrome.runtime.lastError) {
          connStatus.className = 'conn-status err';
          connStatus.textContent = `✗ ${chrome.runtime.lastError.message}`;
          return;
        }

        if (resp && resp.ok) {
          connStatus.className = 'conn-status ok';
          connStatus.textContent = `✓ HTTP ${resp.status}: Connected successfully!`;
        } else {
          connStatus.className = 'conn-status err';
          connStatus.textContent = `✗ HTTP ${resp ? resp.status : 'Error'}: ${resp ? resp.error : 'Connection failed'}`;
        }
      });
    });
  }

  // ── Save ───────────────────────────
  $('save-btn').addEventListener('click', () => {
    const profile = {};
    PROFILE_KEYS.forEach(k => { const v = $(k).value.trim(); if (v) profile[k] = v; });

    // Custom fields
    const rows = $('custom-fields').querySelectorAll('.kv-row');
    if (rows.length) {
      profile.custom = {};
      rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const k = inputs[0].value.trim();
        const v = inputs[1].value.trim();
        if (k && v) profile.custom[k] = v;
      });
    }

    const apiKey = sanitizeKey($('apiKey').value);
    const model = $('modelSelect').value;

    chrome.storage.local.set({
      whProfile: profile,
      whApiKey: apiKey || null,
      whModel: model
    }, () => {
      const toast = $('toast');
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2000);
    });
  });

  // ── Delete all data ────────────────
  $('delete-btn').addEventListener('click', () => {
    if (!confirm('This will permanently delete your profile, custom fields, and API key. Continue?')) return;
    chrome.storage.local.clear(() => {
      PROFILE_KEYS.forEach(k => $(k).value = '');
      $('apiKey').value = '';
      $('custom-fields').innerHTML = '';
      if (connStatus) connStatus.textContent = '';
      const toast = $('toast');
      toast.textContent = 'All data deleted';
      toast.classList.add('visible');
      setTimeout(() => { toast.classList.remove('visible'); toast.textContent = 'Saved'; }, 2000);
    });
  });
})();
