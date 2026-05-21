import { renderPacksTab } from './tabs/packs.js';
import { renderDecksTab } from './tabs/decks.js';
import { renderCardsTab } from './tabs/cards.js';
import { renderSinglesTab } from './tabs/singles.js';

const TABS = {
  packs: { el: document.getElementById('tab-packs'), render: renderPacksTab },
  decks: { el: document.getElementById('tab-decks'), render: renderDecksTab },
  cards: { el: document.getElementById('tab-cards'), render: renderCardsTab },
  singles: { el: document.getElementById('tab-singles'), render: renderSinglesTab },
};

let activeTab = 'packs';

async function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  Object.entries(TABS).forEach(([key, { el }]) => {
    el.classList.toggle('active', key === name);
  });
  activeTab = name;
  await TABS[name].render(TABS[name].el);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

switchTab('packs');
