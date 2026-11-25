// FormMitra — Shared Saved Details UI Renderer (reused by Side Panel Details tab and Settings page)

import {
  isSensitiveLabel,
  getSavedDetails,
  upsertSavedDetail,
  deleteSavedDetail
} from './storage.js';

export function mountSavedDetailsUI({
  container,
  allowInsert = false,
  onInsert,
  onStatus
}) {
  container.textContent = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'details-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'details-search';
  searchInput.placeholder = 'Search saved details...';
  searchInput.setAttribute('aria-label', 'Search saved details');

  const addToggleBtn = document.createElement('button');
  addToggleBtn.type = 'button';
  addToggleBtn.className = 'btn btn-primary btn-sm-detail';
  addToggleBtn.textContent = 'Add detail';
  toolbar.append(searchInput, addToggleBtn);

  const form = document.createElement('form');
  form.className = 'detail-form hidden';

  const labelIn = document.createElement('input');
  labelIn.type = 'text';
  labelIn.placeholder = 'Label (e.g. Full Name, Email, PAN)';
  labelIn.required = true;

  const valueIn = document.createElement('input');
  valueIn.type = 'text';
  valueIn.placeholder = 'Value';
  valueIn.required = true;

  const groupIn = document.createElement('input');
  groupIn.type = 'text';
  groupIn.placeholder = 'Group (e.g. Personal, Work)';

  const sensWrap = document.createElement('label');
  sensWrap.className = 'detail-sens-check';
  const sensIn = document.createElement('input');
  sensIn.type = 'checkbox';
  const sensTxt = document.createElement('span');
  sensTxt.textContent = 'Sensitive (never sent or auto-filled)';
  sensWrap.append(sensIn, sensTxt);

  const formActions = document.createElement('div');
  formActions.className = 'detail-form-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary btn-sm-detail';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary btn-sm-detail';
  cancelBtn.textContent = 'Cancel';
  formActions.append(saveBtn, cancelBtn);

  form.append(labelIn, valueIn, groupIn, sensWrap, formActions);

  const listWrap = document.createElement('div');
  listWrap.className = 'details-groups';
  container.append(toolbar, form, listWrap);

  let items = [];
  let editingId = null;

  const resetForm = () => {
    editingId = null;
    labelIn.value = '';
    valueIn.value = '';
    groupIn.value = '';
    sensIn.checked = false;
    form.classList.add('hidden');
  };

  labelIn.addEventListener('input', () => {
    if (isSensitiveLabel(labelIn.value)) sensIn.checked = true;
  });

  addToggleBtn.addEventListener('click', () => {
    resetForm();
    form.classList.remove('hidden');
    labelIn.focus();
  });

  cancelBtn.addEventListener('click', resetForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      items = await upsertSavedDetail({
        id: editingId,
        label: labelIn.value,
        value: valueIn.value,
        group: groupIn.value || 'General',
        sensitive: sensIn.checked
      });
      resetForm();
      renderList();
      if (onStatus) onStatus('Saved detail updated.', 'ok');
    } catch (err) {
      if (onStatus) onStatus(err.message, 'err');
    }
  });

  function renderList() {
    listWrap.textContent = '';
    const q = searchInput.value.trim().toLowerCase();
    const filtered = items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q) || (!it.sensitive && it.value.toLowerCase().includes(q)));

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'details-empty';
      empty.textContent = items.length === 0 ? 'No saved details yet. Click "Add detail" to save reusable text.' : 'No matching details.';
      listWrap.appendChild(empty);
      return;
    }

    const groups = new Map();
    filtered.forEach((it) => {
      if (!groups.has(it.group)) groups.set(it.group, []);
      groups.get(it.group).push(it);
    });

    for (const [grpName, grpItems] of groups) {
      const sec = document.createElement('div');
      sec.className = 'detail-group';

      const heading = document.createElement('div');
      heading.className = 'detail-group-title';
      heading.textContent = grpName;
      sec.appendChild(heading);

      grpItems.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'detail-row';

        const meta = document.createElement('div');
        meta.className = 'detail-meta';

        const top = document.createElement('div');
        top.className = 'detail-label-row';
        const lbl = document.createElement('span');
        lbl.className = 'detail-label';
        lbl.textContent = it.label;
        top.appendChild(lbl);

        if (it.sensitive) {
          const badge = document.createElement('span');
          badge.className = 'detail-badge-sens';
          badge.textContent = 'Sensitive';
          top.appendChild(badge);
        }

        const val = document.createElement('div');
        val.className = 'detail-value';
        val.textContent = it.sensitive ? '••••••••' : it.value;

        meta.append(top, val);

        const acts = document.createElement('div');
        acts.className = 'detail-actions';

        if (allowInsert && onInsert) {
          const insBtn = document.createElement('button');
          insBtn.type = 'button';
          insBtn.className = 'btn-card btn-allow';
          insBtn.textContent = 'Insert';
          insBtn.addEventListener('click', () => onInsert(it, insBtn));
          acts.appendChild(insBtn);
        }

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-card';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(it.value);
            copyBtn.textContent = 'Copied';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
          } catch (_) {
            if (onStatus) onStatus('Clipboard access failed.', 'err');
          }
        });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-card';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          editingId = it.id;
          labelIn.value = it.label;
          valueIn.value = it.value;
          groupIn.value = it.group;
          sensIn.checked = it.sensitive;
          form.classList.remove('hidden');
          labelIn.focus();
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-card';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          items = await deleteSavedDetail(it.id);
          renderList();
        });

        acts.append(copyBtn, editBtn, delBtn);
        row.append(meta, acts);
        sec.appendChild(row);
      });

      listWrap.appendChild(sec);
    }
  }

  searchInput.addEventListener('input', renderList);

  const reload = async () => {
    items = await getSavedDetails();
    renderList();
  };

  reload();
  return { reload };
}
