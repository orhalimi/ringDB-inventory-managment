import { getCards, searchCards } from '../../dbService.js';

export async function renderCardsTab(container) {
  container.innerHTML = '';

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-input';
  search.placeholder = 'Search by card name…';
  container.appendChild(search);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-height:0;overflow-y:auto;';
  container.appendChild(list);

  let debounceTimer;

  const renderList = async (query) => {
    list.innerHTML = '';
    const cards = query ? await searchCards(query) : await getCards();

    if (cards.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = query ? 'No cards match your search.' : 'Card database is loading…';
      list.appendChild(empty);
      return;
    }

    for (const card of cards) {
      list.appendChild(buildCardRow(card));
    }
  };

  search.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderList(search.value.trim()), 200);
  });

  await renderList('');
  search.focus();
}

function buildCardRow(card) {
  const wrapper = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'list-item';
  row.style.cursor = 'pointer';

  const name = document.createElement('span');
  name.className = 'list-item-name';
  name.textContent = card.name;

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

function buildDetail(card) {
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

function formatSphere(code) {
  const map = { leadership: 'L', tactics: 'T', spirit: 'S', lore: 'Lo', neutral: 'N' };
  return map[code] ?? code ?? '';
}
