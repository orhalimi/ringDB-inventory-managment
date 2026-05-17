import Dexie from '../lib/dexie.mjs';

const db = new Dexie('RingsDBInventory');

db.version(1).stores({
  cards: 'code, pack_code, name, type_code, sphere_code',
  packs: 'pack_code, cycle_position',
  activeDecks: 'deck_id',
});

// --- Cards ---

export async function seedCards(cards) {
  await db.cards.bulkPut(cards);
}

export async function getCards() {
  return db.cards.orderBy('name').toArray();
}

export async function searchCards(query) {
  const q = query.toLowerCase();
  return db.cards.filter(c => c.name.toLowerCase().includes(q)).toArray();
}

export async function getCardByCode(code) {
  return db.cards.get(code);
}

// --- Packs ---

export async function seedPacks(packs) {
  const existingKeys = new Set(await db.packs.toCollection().primaryKeys());
  const newPacks = packs.filter(p => !existingKeys.has(p.pack_code));
  if (newPacks.length > 0) await db.packs.bulkAdd(newPacks);
}

export async function getAllPacks() {
  return db.packs.orderBy('cycle_position').toArray();
}

export async function getOwnedPacks() {
  return db.packs.filter(p => p.owned_count > 0).toArray();
}

export async function upsertPack(packData) {
  return db.packs.put(packData);
}

// --- Active Decks ---

export async function upsertDecks(decks) {
  const existing = await db.activeDecks.bulkGet(decks.map(d => d.deck_id));
  const merged = decks.map((deck, i) => ({
    ...deck,
    is_inactive: existing[i]?.is_inactive ?? false,
  }));
  return db.activeDecks.bulkPut(merged);
}

export async function getActiveDecks() {
  return db.activeDecks.toArray();
}

export async function toggleDeckInactive(deckId, isInactive) {
  return db.activeDecks.update(deckId, { is_inactive: isInactive });
}

export default db;
