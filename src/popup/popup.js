import { renderPacksTab } from './tabs/packs.js';
import { renderDecksTab } from './tabs/decks.js';
import { renderCardsTab } from './tabs/cards.js';
import { renderSinglesTab } from './tabs/singles.js';

// Active toggle
const activeCheckbox = document.getElementById('active-toggle');
const activeStatus = document.getElementById('active-status');

function setActiveUI(isActive) {
  activeCheckbox.checked = isActive;
  activeStatus.textContent = isActive ? 'Active' : 'Off';
}

chrome.storage.local.get('lotrInventoryActive', (result) => {
  setActiveUI(result.lotrInventoryActive !== false);
});

activeCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ lotrInventoryActive: activeCheckbox.checked });
  setActiveUI(activeCheckbox.checked);
});

const TABS = {
  packs: { el: document.getElementById('tab-packs'), render: renderPacksTab },
  decks: { el: document.getElementById('tab-decks'), render: renderDecksTab },
  cards: { el: document.getElementById('tab-cards'), render: renderCardsTab },
  singles: { el: document.getElementById('tab-singles'), render: renderSinglesTab },
};

async function switchTab(name) {
  document.body.style.width = '';
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  Object.entries(TABS).forEach(([key, { el }]) => {
    el.classList.toggle('active', key === name);
  });
  await TABS[name].render(TABS[name].el);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

switchTab('packs');
