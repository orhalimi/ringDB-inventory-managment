import { getAllPacks, getOwnedPacks, upsertPack } from '../../dbService.js';
import { notifyInventoryChanged } from './constants.js';

export async function renderPacksTab(container) {
  container.innerHTML = '';

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ Add Pack';
  addBtn.addEventListener('click', () => openAddPackModal(container));

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-primary';
  importBtn.textContent = 'Import from RingsDB';

  const spinner = document.createElement('span');
  spinner.style.cssText = 'font-size:11px;color:#8a7a60;display:none;';
  spinner.textContent = 'Importing…';

  topBar.append(addBtn, importBtn, spinner);
  container.appendChild(topBar);

  const statusMsg = document.createElement('div');
  statusMsg.style.cssText = 'font-size:11px;margin-top:4px;min-height:16px;';
  container.appendChild(statusMsg);

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    addBtn.disabled = true;
    spinner.style.display = 'inline';
    statusMsg.textContent = '';

    const { added, error } = await doImport();

    spinner.style.display = 'none';
    importBtn.disabled = false;
    addBtn.disabled = false;

    if (error) {
      statusMsg.style.color = '#c0392b';
      statusMsg.textContent = error;
    } else {
      statusMsg.style.color = '#8a7a60';
      statusMsg.textContent = added > 0
        ? `Added ${added} pack${added !== 1 ? 's' : ''}.`
        : 'No new packs to import.';
      if (added > 0) await renderOwnedList(container);
    }
  });

  await renderOwnedList(container);
}

async function doImport() {
  try {
    const res = await fetch('https://ringsdb.com/collection/packs', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const activePacks = parseActivePacks(html);

    if (activePacks.size === 0) {
      return { added: 0, error: 'No marked packs found. Make sure you are logged in at ringsdb.com.' };
    }

    const allPacks = await getAllPacks();
    const byName = new Map(allPacks.map(p => [p.name.toLowerCase().trim(), p]));

    let added = 0;
    for (const { name, count } of activePacks.values()) {
      if (!name) continue;
      const pack = byName.get(name.toLowerCase().trim());
      if (!pack || pack.owned_count > 0) continue;
      await upsertPack({ ...pack, owned_count: count, active_count: count });
      added++;
    }

    if (added > 0) notifyInventoryChanged();
    return { added, error: null };
  } catch {
    return { added: 0, error: 'Could not reach ringsdb.com. Make sure you are logged in.' };
  }
}

function parseActivePacks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const labels = doc.querySelectorAll('label.btn.active[data-id]');
  const map = new Map();

  for (const label of labels) {
    const dataId = label.getAttribute('data-id');
    const dashIdx = dataId.indexOf('-');
    const baseId = dashIdx === -1 ? dataId : dataId.slice(0, dashIdx);
    const isCopy = dashIdx !== -1;

    if (!map.has(baseId)) map.set(baseId, { name: null, count: 0 });
    const entry = map.get(baseId);
    entry.count++;
    if (!isCopy) entry.name = label.textContent.trim();
  }

  return map;
}

async function renderOwnedList(container) {
  const existing = container.querySelector('.owned-list');
  const scrollTop = existing ? existing.scrollTop : 0;
  if (existing) existing.remove();

  const packs = await getOwnedPacks();

  const wrapper = document.createElement('div');
  wrapper.className = 'owned-list';
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto;';

  if (packs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No packs added yet. Click "+ Add Pack" to start.';
    wrapper.appendChild(empty);
  } else {
    // Group by cycle
    const cycles = groupByCycle(packs);
    for (const [cycle, cyclePacks] of cycles) {
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = `Cycle ${cycle}`;
      wrapper.appendChild(label);

      for (const pack of cyclePacks) {
        wrapper.appendChild(buildPackRow(pack, container));
      }
    }
  }

  container.appendChild(wrapper);
  wrapper.scrollTop = scrollTop;
}

function buildPackRow(pack, container) {
  const row = document.createElement('div');
  row.className = 'list-item';

  const name = document.createElement('span');
  name.className = 'list-item-name';
  name.textContent = pack.name;

  const ownedPair = buildQtyPair('Owned', pack.owned_count, 0, 99, async (val) => {
    const newOwned = val;
    const newActive = Math.min(pack.active_count, newOwned);
    await upsertPack({ ...pack, owned_count: newOwned, active_count: newActive });
    notifyInventoryChanged();
    await renderOwnedList(container);
  });

  const activePair = buildQtyPair('Active', pack.active_count, 0, pack.owned_count, async (val) => {
    await upsertPack({ ...pack, active_count: val });
    notifyInventoryChanged();
    await renderOwnedList(container);
  });

  row.append(name, ownedPair, activePair);
  return row;
}

function buildQtyPair(label, value, min, max, onChange) {
  const pair = document.createElement('div');
  pair.className = 'qty-pair';

  const lbl = document.createElement('span');
  lbl.textContent = label + ':';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'qty-input';
  input.value = value;
  input.min = min;
  input.max = max;

  input.addEventListener('change', () => {
    let val = parseInt(input.value, 10);
    if (isNaN(val)) val = min;
    val = Math.max(min, Math.min(max, val));
    input.value = val;
    onChange(val);
  });

  pair.append(lbl, input);
  return pair;
}

async function openAddPackModal(container) {
  const allPacks = await getAllPacks();
  const unowned = allPacks.filter(p => p.owned_count === 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h2');
  title.textContent = 'Add a Pack';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-input';
  search.placeholder = 'Search packs…';

  const list = document.createElement('div');
  list.className = 'modal-list';

  const renderList = (query) => {
    list.innerHTML = '';
    const filtered = query
      ? unowned.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
      : unowned;

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No packs found.';
      list.appendChild(empty);
      return;
    }

    for (const pack of filtered) {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.style.cursor = 'pointer';

      const name = document.createElement('span');
      name.className = 'list-item-name';
      name.textContent = pack.name;

      item.appendChild(name);
      item.addEventListener('click', async () => {
        await upsertPack({ ...pack, owned_count: 1, active_count: 1 });
        notifyInventoryChanged();
        overlay.remove();
        await renderOwnedList(container);
      });

      list.appendChild(item);
    }
  };

  search.addEventListener('input', () => renderList(search.value));
  renderList('');

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  actions.appendChild(cancelBtn);

  modal.append(title, search, list, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  search.focus();
}

function groupByCycle(packs) {
  const map = new Map();
  for (const p of packs) {
    const key = p.cycle_position ?? 0;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}
