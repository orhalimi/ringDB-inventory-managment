import { upsertDecks, getActiveDecks, toggleDeckInactive, getOwnedPacks, getCustomCopies, getCardsByCodes } from '../../dbService.js';
import { buildDetail, formatSphere, sphereColor } from './cards.js';

const DECKS_API = 'https://ringsdb.com/api/oauth2/decks';

export async function renderDecksTab(container) {
  container.innerHTML = '';
  document.body.style.width = '';

  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

  const syncBtn = document.createElement('button');
  syncBtn.className = 'btn btn-primary';
  syncBtn.textContent = 'Sync Decks';

  const spinner = document.createElement('span');
  spinner.style.cssText = 'font-size:11px;color:#8a7a60;display:none;';
  spinner.textContent = 'Syncing…';

  topBar.append(syncBtn, spinner);
  container.appendChild(topBar);

  const banner = document.createElement('div');
  banner.className = 'banner banner-warn';
  banner.style.display = 'none';
  banner.textContent = 'Could not reach RingsDB. Make sure you are logged in at ringsdb.com and try again.';
  container.appendChild(banner);

  const listWrapper = document.createElement('div');
  listWrapper.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto;';
  container.appendChild(listWrapper);

  await renderDeckList(listWrapper);

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    spinner.style.display = 'inline';
    banner.style.display = 'none';

    try {
      const res = await fetch(DECKS_API, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rawDecks = await res.json();
      const decks = rawDecks.map(transformDeck);
      await upsertDecks(decks);
      await renderDeckList(listWrapper);
    } catch {
      banner.style.display = 'block';
    } finally {
      syncBtn.disabled = false;
      spinner.style.display = 'none';
    }
  });
}

async function renderDeckList(wrapper) {
  wrapper.innerHTML = '';
  document.body.style.width = '';

  const decks = await getActiveDecks();

  if (decks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No decks synced yet. Make sure you are logged in at ringsdb.com, then click "Sync Decks" above.';
    wrapper.appendChild(empty);
    return;
  }

  for (const deck of decks) {
    wrapper.appendChild(buildDeckRow(deck, wrapper));
  }
}

function buildDeckRow(deck, listWrapper) {
  const rowWrapper = document.createElement('div');
  rowWrapper.style.cssText = 'display:flex;flex-direction:column;flex-shrink:0;';

  const row = document.createElement('div');
  row.className = 'list-item';
  row.style.cursor = 'pointer';

  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  toggle.title = deck.is_inactive ? 'Mark active' : 'Mark inactive';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !deck.is_inactive;

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  toggle.append(checkbox, slider);

  checkbox.addEventListener('change', async (e) => {
    e.stopPropagation();
    await toggleDeckInactive(deck.deck_id, !checkbox.checked);
  });

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';

  const name = document.createElement('div');
  name.className = 'list-item-name';
  name.textContent = deck.name;

  const meta = document.createElement('div');
  meta.className = 'list-item-meta';
  meta.textContent = formatDate(deck.date_update);

  info.append(name, meta);

  const inactiveLabel = document.createElement('span');
  inactiveLabel.className = 'inactive-label';
  inactiveLabel.textContent = 'inactive';
  inactiveLabel.style.display = deck.is_inactive ? 'inline' : 'none';

  checkbox.addEventListener('change', () => {
    inactiveLabel.style.display = checkbox.checked ? 'none' : 'inline';
  });

  const chevron = document.createElement('span');
  chevron.className = 'deck-chevron';
  chevron.textContent = '▶';

  row.append(toggle, info, inactiveLabel, chevron);

  const expandEl = document.createElement('div');
  expandEl.className = 'deck-expand';
  expandEl.style.display = 'none';

  row.addEventListener('click', async (e) => {
    if (e.target.closest('label.toggle')) return;

    const isOpen = expandEl.style.display !== 'none';

    // Close all
    listWrapper.querySelectorAll('.deck-expand').forEach(el => { el.style.display = 'none'; });
    listWrapper.querySelectorAll('.deck-chevron').forEach(el => { el.style.transform = ''; });
    document.body.style.width = '';

    if (!isOpen) {
      expandEl.style.display = 'block';
      chevron.style.transform = 'rotate(90deg)';
      document.body.style.width = '480px';
      await renderDeckExpand(deck, expandEl);
    }
  });

  rowWrapper.append(row, expandEl);
  return rowWrapper;
}

async function renderDeckExpand(deck, container) {
  container.innerHTML = '<p style="font-size:11px;color:#8a7a60;padding:6px 4px;">Loading…</p>';

  const codes = Object.keys(deck.all_cards);
  const [cards, packs, allDecks, customCopies] = await Promise.all([
    getCardsByCodes(codes),
    getOwnedPacks(),
    getActiveDecks(),
    getCustomCopies(),
  ]);

  const cardMap = Object.fromEntries(cards.map(c => [c.code, c]));
  const packMap = Object.fromEntries(packs.map(p => [p.pack_code, p.active_count]));
  const customMap = Object.fromEntries(customCopies.map(c => [c.code, c.owned_count]));

  const inUseByOthers = {};
  for (const d of allDecks) {
    if (d.deck_id === deck.deck_id || d.is_inactive) continue;
    for (const [code, qty] of Object.entries(d.all_cards)) {
      inUseByOthers[code] = (inUseByOthers[code] || 0) + qty;
    }
  }

  const entries = Object.entries(deck.all_cards).map(([code, qty]) => {
    const card = cardMap[code];
    const fromPack = card ? (packMap[card.pack_code] ?? 0) * card.quantity : 0;
    const fromSingles = customMap[code] ?? 0;
    const available = fromPack + fromSingles - (inUseByOthers[code] ?? 0);
    return { code, qty, card, conflict: qty > available };
  });

  const grouped = {
    hero:       entries.filter(e => e.card?.type_code === 'hero'),
    ally:       entries.filter(e => e.card?.type_code === 'ally'),
    attachment: entries.filter(e => e.card?.type_code === 'attachment'),
    event:      entries.filter(e => e.card?.type_code === 'event'),
    extra:      entries.filter(e => !['hero', 'ally', 'attachment', 'event'].includes(e.card?.type_code)),
  };

  container.innerHTML = '';
  container.style.cssText = 'display:flex;gap:8px;padding:8px 4px 4px;';

  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;';

  const rightCol = document.createElement('div');
  rightCol.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;';

  appendGroup(leftCol, 'Heroes', grouped.hero);
  appendGroup(leftCol, 'Allies', grouped.ally);
  appendGroup(rightCol, 'Attachments', grouped.attachment);
  appendGroup(rightCol, 'Events', grouped.event);
  if (grouped.extra.length > 0) appendGroup(rightCol, 'Extra', grouped.extra);

  container.append(leftCol, rightCol);
}

function appendGroup(col, title, entries) {
  if (entries.length === 0) return;

  const total = entries.reduce((s, e) => s + e.qty, 0);

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = `${title} (${total})`;
  col.appendChild(label);

  for (const entry of entries) {
    col.appendChild(buildCardEntry(entry));
  }
}

function buildCardEntry({ code, qty, card, conflict }) {
  const wrapper = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'deck-card-row';

  if (conflict) {
    const warn = document.createElement('span');
    warn.className = 'deck-card-warn';
    warn.textContent = '(!)';
    row.appendChild(warn);
  }

  const qtySpan = document.createElement('span');
  qtySpan.className = 'deck-card-qty';
  qtySpan.textContent = `${qty}×`;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'deck-card-name';
  nameSpan.textContent = card ? card.name : code;
  if (card?.sphere_code) nameSpan.style.color = sphereColor(card.sphere_code);
  if (card?.is_unique) nameSpan.style.fontWeight = 'bold';

  row.append(qtySpan, nameSpan);

  if (card?.sphere_code) {
    const sphereSpan = document.createElement('span');
    sphereSpan.className = 'deck-card-sphere';
    sphereSpan.textContent = `[${formatSphere(card.sphere_code)}]`;
    row.appendChild(sphereSpan);
  }

  if (card) {
    const detail = buildDetail(card);
    detail.style.display = 'none';
    detail.style.marginTop = '2px';
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
    wrapper.append(row, detail);
  } else {
    wrapper.appendChild(row);
  }

  return wrapper;
}

function transformDeck(raw) {
  const all_cards = { ...raw.heroes, ...raw.slots };

  const sideslots = raw.sideslots;
  if (sideslots && !Array.isArray(sideslots)) {
    for (const [code, qty] of Object.entries(sideslots)) {
      all_cards[code] = (all_cards[code] || 0) + qty;
    }
  }

  return {
    deck_id: raw.id,
    name: raw.name,
    date_update: raw.date_update,
    all_cards,
    is_inactive: false,
  };
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `Updated ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
