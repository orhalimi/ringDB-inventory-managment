// Phase 5 — deferred
// calculateInventory(cards, packs, decks) => { card_code: available_qty }
export function calculateInventory(cards, packs, decks) {
  const ownedMap = {};
  const packMap = Object.fromEntries(packs.map(p => [p.pack_code, p]));

  for (const card of cards) {
    const pack = packMap[card.pack_code];
    ownedMap[card.code] = pack ? card.quantity * pack.active_count : 0;
  }

  const usedMap = {};
  for (const deck of decks) {
    if (deck.is_inactive) continue;
    for (const [code, qty] of Object.entries(deck.all_cards)) {
      usedMap[code] = (usedMap[code] || 0) + qty;
    }
  }

  const result = {};
  const allCodes = new Set([...Object.keys(ownedMap), ...Object.keys(usedMap)]);
  for (const code of allCodes) {
    result[code] = (ownedMap[code] || 0) - (usedMap[code] || 0);
  }
  return result;
}
