// FormMitra — Storage, Provider Key Validation & Saved Details (chrome.storage.local only)

export const DEFAULTS = Object.freeze({
  whGeminiKey: '',
  whGroqKey: '',
  whGeminiModel: 'gemini-2.5-flash',
  whGroqModel: 'openai/gpt-oss-120b',
  whProvider: 'auto',
  whLang: 'en',
  whNoticeAck: false,
  whHelper: false
});

const STORAGE_KEYS = Object.keys(DEFAULTS);
const DETAILS_KEY = 'whSavedDetails';
const LEGACY_KEYS = ['whApiKey', 'whModel', 'whProfile', 'fmVaultEncrypted', 'fmVaultKeyRaw'];
const SENSITIVE_LABEL_RX = /aadhaar|aadhar|\bpan\b|passport|bank|account|\bcard\b|cvv|cvc|\botp\b|password|passcode|ifsc|\bpin\b/i;

let migrationPromise = null;

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res || {});
    });
  });
}

function storageSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

export function isSensitiveLabel(label) {
  return SENSITIVE_LABEL_RX.test(String(label || ''));
}

export function validateKeyForProvider(provider, rawKey) {
  const key = (rawKey || '').trim();
  if (!key) return { ok: true, key: '' };
  if (provider === 'gemini' && /^gsk_/i.test(key)) {
    return { ok: false, error: 'Groq keys (starting with "gsk_") cannot be saved in the Gemini key field.' };
  }
  if (provider === 'groq' && /^(AIza|AQ\.)/.test(key)) {
    return { ok: false, error: 'Gemini keys (starting with "AIza" or "AQ.") cannot be saved in the Groq key field.' };
  }
  return { ok: true, key };
}

function migrateLegacyStorage() {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const data = await storageGet([...LEGACY_KEYS, 'whGeminiKey', 'whGroqKey']);
      if (!LEGACY_KEYS.some((k) => Object.prototype.hasOwnProperty.call(data, k))) return;
      const legacyKey = typeof data.whApiKey === 'string' ? data.whApiKey.trim() : '';
      const updates = {};
      if (legacyKey && legacyKey !== 'paste here') {
        if (/^gsk_/i.test(legacyKey) && !data.whGroqKey) updates.whGroqKey = legacyKey;
        else if (/^(AIza|AQ\.)/.test(legacyKey) && !data.whGeminiKey) updates.whGeminiKey = legacyKey;
      }
      if (Object.keys(updates).length > 0) await storageSet(updates);
      await storageRemove(LEGACY_KEYS);
    } catch (err) {
      console.warn('[FormMitra:Storage] Legacy migration failed:', err.message);
    }
  })();
  return migrationPromise;
}

export async function getSettings() {
  await migrateLegacyStorage();
  const res = await storageGet(STORAGE_KEYS);
  return {
    whGeminiKey: typeof res.whGeminiKey === 'string' ? res.whGeminiKey.trim() : '',
    whGroqKey: typeof res.whGroqKey === 'string' ? res.whGroqKey.trim() : '',
    whGeminiModel: typeof res.whGeminiModel === 'string' && res.whGeminiModel ? res.whGeminiModel : DEFAULTS.whGeminiModel,
    whGroqModel: typeof res.whGroqModel === 'string' && res.whGroqModel ? res.whGroqModel : DEFAULTS.whGroqModel,
    whProvider: ['auto', 'gemini', 'groq'].includes(res.whProvider) ? res.whProvider : DEFAULTS.whProvider,
    whLang: ['en', 'hi', 'kn'].includes(res.whLang) ? res.whLang : DEFAULTS.whLang,
    whNoticeAck: Boolean(res.whNoticeAck),
    whHelper: Boolean(res.whHelper)
  };
}

export async function saveProviderKey(provider, rawKey) {
  const check = validateKeyForProvider(provider, rawKey);
  if (!check.ok) return check;
  await storageSet({ [provider === 'gemini' ? 'whGeminiKey' : 'whGroqKey']: check.key });
  return { ok: true, key: check.key };
}

export async function saveSettingsPatch(patch) {
  const allowed = {};
  if (typeof patch.whGeminiModel === 'string' && patch.whGeminiModel) allowed.whGeminiModel = patch.whGeminiModel;
  if (typeof patch.whGroqModel === 'string' && patch.whGroqModel) allowed.whGroqModel = patch.whGroqModel;
  if (['auto', 'gemini', 'groq'].includes(patch.whProvider)) allowed.whProvider = patch.whProvider;
  if (['en', 'hi', 'kn'].includes(patch.whLang)) allowed.whLang = patch.whLang;
  if (typeof patch.whNoticeAck === 'boolean') allowed.whNoticeAck = patch.whNoticeAck;
  if (typeof patch.whHelper === 'boolean') allowed.whHelper = patch.whHelper;
  if (Object.keys(allowed).length > 0) await storageSet(allowed);
}

export async function getSavedDetails() {
  const res = await storageGet([DETAILS_KEY]);
  const raw = Array.isArray(res[DETAILS_KEY]) ? res[DETAILS_KEY] : [];
  return raw
    .filter((d) => d && typeof d.label === 'string' && d.label.trim())
    .map((d) => {
      const label = d.label.trim();
      return {
        id: String(d.id || `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        label,
        value: String(d.value ?? ''),
        group: String(d.group || 'General').trim() || 'General',
        sensitive: Boolean(d.sensitive || isSensitiveLabel(label))
      };
    });
}

export async function upsertSavedDetail(entry) {
  const label = String(entry.label || '').trim();
  const value = String(entry.value ?? '').trim();
  const group = String(entry.group || 'General').trim() || 'General';
  if (!label || !value) throw new Error('Label and value are required.');

  const list = await getSavedDetails();
  const item = {
    id: entry.id || `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    value,
    group,
    sensitive: Boolean(entry.sensitive || isSensitiveLabel(label))
  };

  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);

  await storageSet({ [DETAILS_KEY]: list });
  return list;
}

export async function deleteSavedDetail(id) {
  const list = await getSavedDetails();
  const next = list.filter((x) => x.id !== id);
  await storageSet({ [DETAILS_KEY]: next });
  return next;
}

export function clearAllData() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else {
        migrationPromise = null;
        resolve();
      }
    });
  });
}
