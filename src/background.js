import { seedCards, seedPacks, getCards, getAllPacks, getActiveDecks } from './dbService.js';

const CARDS_API = 'https://ringsdb.com/api/public/cards/';
const PACKS_API = 'https://ringsdb.com/api/public/packs/';

chrome.runtime.onInstalled.addListener(() => {
  initData();
});

async function initData() {
  try {
    const [cardsRes, packsRes] = await Promise.all([
      fetch(CARDS_API),
      fetch(PACKS_API),
    ]);

    if (!cardsRes.ok || !packsRes.ok) throw new Error('API fetch failed');

    const [cards, rawPacks] = await Promise.all([cardsRes.json(), packsRes.json()]);

    await seedCards(cards);

    const packs = rawPacks.map(p => ({
      pack_code: p.code,
      name: p.name,
      cycle_position: p.cycle_position,
      owned_count: 0,
      active_count: 0,
    }));
    await seedPacks(packs);

    console.log(`[LOTR] Seeded ${cards.length} cards and ${packs.length} packs.`);
  } catch (err) {
    console.error('[LOTR] Init failed:', err);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getCardAvailability') {
    computeAvailability(msg.deckId).then(sendResponse);
    return true;
  }
});

async function computeAvailability(currentDeckId) {
  const [cards, packs, decks] = await Promise.all([
    getCards(),
    getAllPacks(),
    getActiveDecks(),
  ]);

  const packMap = new Map(packs.map(p => [p.pack_code, p.active_count]));

  const totalOwned = new Map();
  for (const card of cards) {
    const activeCount = packMap.get(card.pack_code) ?? 0;
    totalOwned.set(card.code, card.quantity * activeCount);
  }

  const inUse = new Map();
  for (const deck of decks) {
    if (deck.deck_id === currentDeckId || deck.is_inactive) continue;
    for (const [code, qty] of Object.entries(deck.all_cards)) {
      inUse.set(code, (inUse.get(code) ?? 0) + qty);
    }
  }

  const free = {};
  for (const [code, total] of totalOwned) {
    free[code] = Math.max(0, total - (inUse.get(code) ?? 0));
  }
  return free;
}
