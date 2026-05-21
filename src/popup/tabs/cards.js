import { getCards, searchCards, getOwnedPacks, getCustomCopies } from '../../dbService.js';
import { sphereColor, formatSphere } from './spheres.js';
import { STORAGE_KEYS } from './constants.js';

const FIELD_MAP = {
  k: 'traits', s: 'sphere_code', t: 'type_code',
  w: 'willpower', o: 'cost', a: 'attack', d: 'defense',
  h: 'health', b: 'threat', u: 'is_unique', x: 'text', e: 'pack_code',
};

function parseQuery(raw) {
  const tokens = [];
  const nameParts = [];
  for (const part of raw.trim().split(/\s+/)) {
    if (!part) continue;
    const m = part.match(/^([a-z])([:<>])(.+)$/i);
    if (m) tokens.push({ field: m[1].toLowerCase(), op: m[2], value: m[3] });
    else nameParts.push(part);
  }
  return { tokens, nameQuery: nameParts.join(' ') };
}

function applyFilters(cards, tokens) {
  return cards.filter(card =>
    tokens.every(({ field, op, value }) => {
      const key = FIELD_MAP[field];
      if (!key) return true;
      const cardVal = card[key];
      if (cardVal == null) return false;
      if (key === 'is_unique') {
        return Boolean(cardVal) === ['1', 'true', 'yes'].includes(value.toLowerCase());
      }
      if (typeof cardVal === 'number') {
        const num = parseFloat(value);
        if (isNaN(num)) return false;
        if (op === '>') return cardVal > num;
        if (op === '<') return cardVal < num;
        return cardVal === num;
      }
      const str = String(cardVal).toLowerCase();
      const val = value.toLowerCase();
      return op === '=' ? str === val : str.includes(val);
    })
  );
}

async function buildOwnedMap() {
  const [packs, copies] = await Promise.all([getOwnedPacks(), getCustomCopies()]);
  const packMap = Object.fromEntries(packs.map(p => [p.pack_code, p.active_count]));
  const customMap = Object.fromEntries(copies.map(c => [c.code, c.owned_count]));
  return { packMap, customMap };
}

function totalOwned(card, packMap, customMap) {
  const fromPack = (packMap[card.pack_code] ?? 0) * (card.quantity ?? 1);
  const fromSingles = customMap[card.code] ?? 0;
  return fromPack + fromSingles;
}

export async function renderCardsTab(container) {
  container.innerHTML = '';

  const stored = await new Promise(resolve =>
    chrome.storage.local.get([STORAGE_KEYS.CARD_FILTER, STORAGE_KEYS.OWNED_ONLY], resolve)
  );
  const savedQuery = stored[STORAGE_KEYS.CARD_FILTER] ?? '';
  const savedOwnedOnly = stored[STORAGE_KEYS.OWNED_ONLY] ?? false;

  const searchRow = document.createElement('div');
  searchRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-input';
  search.placeholder = 'Search or filter cards (supports RingsDB filters)';
  search.style.flex = '1';
  if (savedQuery) search.value = savedQuery;

  const helpWrap = document.createElement('div');
  helpWrap.className = 'filter-help-wrap';

  const helpBtn = document.createElement('div');
  helpBtn.className = 'filter-help-btn';
  helpBtn.textContent = '?';

  const tooltip = document.createElement('div');
  tooltip.className = 'filter-tooltip';
  tooltip.textContent = [
    'k: Traits       s: Sphere',
    'w: Willpower    o: Cost',
    'a: Attack       d: Defense',
    'h: Hit Points   b: Threat',
    't: Type code    u: Unique (1/0)',
    'x: Card text    e: Pack code',
    'Operators: > < : (contains)',
    'Example: k:silvan w>2',
  ].join('\n');

  helpWrap.append(helpBtn, tooltip);
  searchRow.append(search, helpWrap);
  container.appendChild(searchRow);

  const filterRow = document.createElement('label');
  filterRow.className = 'owned-filter-row';

  const ownedCheck = document.createElement('input');
  ownedCheck.type = 'checkbox';
  ownedCheck.checked = savedOwnedOnly;

  const ownedLabel = document.createElement('span');
  ownedLabel.textContent = 'Show owned only';

  filterRow.append(ownedCheck, ownedLabel);
  container.appendChild(filterRow);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;overflow-y:auto;';
  container.appendChild(list);

  let debounceTimer;

  const renderList = async (query, ownedOnly) => {
    list.innerHTML = '';
    const { tokens, nameQuery } = parseQuery(query);
    const [rawCards, { packMap, customMap }] = await Promise.all([
      nameQuery ? searchCards(nameQuery) : getCards(),
      buildOwnedMap(),
    ]);
    let cards = tokens.length > 0 ? applyFilters(rawCards, tokens) : rawCards;
    if (ownedOnly) cards = cards.filter(c => totalOwned(c, packMap, customMap) > 0);

    if (cards.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = (query || ownedOnly) ? 'No cards match your search.' : 'Card database is loading…';
      list.appendChild(empty);
      return;
    }

    for (const card of cards) {
      list.appendChild(buildCardRow(card, totalOwned(card, packMap, customMap)));
    }
  };

  search.addEventListener('input', () => {
    const q = search.value.trim();
    chrome.storage.local.set({ [STORAGE_KEYS.CARD_FILTER]: q });
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderList(q, ownedCheck.checked), 200);
  });

  ownedCheck.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEYS.OWNED_ONLY]: ownedCheck.checked });
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderList(search.value.trim(), ownedCheck.checked), 200);
  });

  await renderList(savedQuery, savedOwnedOnly);
  search.focus();
}

function buildCardRow(card, owned) {
  const wrapper = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'list-item';
  row.style.cursor = 'pointer';

  const name = document.createElement('span');
  name.className = 'list-item-name';
  name.textContent = card.name;
  name.style.color = sphereColor(card.sphere_code);
  if (card.is_unique) name.style.fontWeight = 'bold';

  if (owned > 0) {
    const count = document.createElement('span');
    count.className = 'owned-count';
    count.textContent = `(${owned})`;
    name.appendChild(count);
  }

  const sphere = document.createElement('span');
  sphere.className = 'list-item-meta';
  sphere.textContent = formatSphere(card.sphere_code);
  sphere.style.marginRight = '4px';

  const pack = document.createElement('span');
  pack.className = 'list-item-meta';
  pack.textContent = card.pack_code;

  row.append(name, sphere, pack);

  const detail = buildDetail(card);
  detail.style.display = 'none';

  row.addEventListener('click', () => {
    const open = detail.style.display !== 'none';
    detail.style.display = open ? 'none' : 'block';
  });

  wrapper.append(row, detail);
  return wrapper;
}

export function buildDetail(card) {
  const detail = document.createElement('div');
  detail.className = 'card-detail';
  detail.style.cssText = 'margin: 0 0 4px 0; border-top: none; border-radius: 0 0 4px 4px;';

  const fields = [
    ['Type', card.type_name ?? card.type_code],
    ['Sphere', card.sphere_name ?? card.sphere_code],
    ['Pack', card.pack_name ?? card.pack_code],
    ['Quantity in pack', card.quantity],
    ['Deck limit', card.deck_limit],
    card.threat != null ? ['Threat', card.threat] : null,
    card.willpower != null ? ['Willpower', card.willpower] : null,
    card.attack != null ? ['Attack', card.attack] : null,
    card.defense != null ? ['Defense', card.defense] : null,
    card.health != null ? ['Health', card.health] : null,
    card.traits ? ['Traits', card.traits] : null,
  ].filter(Boolean);

  for (const [label, value] of fields) {
    const row = document.createElement('div');
    row.className = 'field';

    const lbl = document.createElement('span');
    lbl.className = 'field-label';
    lbl.textContent = label;

    const val = document.createElement('span');
    val.textContent = value ?? '—';

    row.append(lbl, val);
    detail.appendChild(row);
  }

  if (card.text) {
    const textRow = document.createElement('div');
    textRow.className = 'field';
    textRow.style.marginTop = '6px';

    const lbl = document.createElement('span');
    lbl.className = 'field-label';
    lbl.textContent = 'Text';

    const val = document.createElement('span');
    val.style.whiteSpace = 'pre-wrap';
    val.textContent = card.text.replace(/<[^>]+>/g, '');

    textRow.append(lbl, val);
    detail.appendChild(textRow);
  }

  return detail;
}

export { sphereColor, formatSphere };
