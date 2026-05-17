import { upsertDecks, getActiveDecks, toggleDeckInactive } from '../../dbService.js';

const DECKS_API = 'https://ringsdb.com/api/oauth2/decks';

export async function renderDecksTab(container) {
  container.innerHTML = '';

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

function buildDeckRow(deck, wrapper) {
  const row = document.createElement('div');
  row.className = 'list-item';

  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  toggle.title = deck.is_inactive ? 'Mark active' : 'Mark inactive';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !deck.is_inactive;

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  toggle.append(checkbox, slider);

  checkbox.addEventListener('change', async () => {
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

  row.append(toggle, info, inactiveLabel);
  return row;
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
