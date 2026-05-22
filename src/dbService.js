import Dexie from '../lib/dexie.mjs';

const db = new Dexie('RingsDBInventory');

db.version(1).stores({
  cards: 'code, pack_code, name, type_code, sphere_code',
  packs: 'pack_code, cycle_position',
  activeDecks: 'deck_id',
});

db.version(2).stores({
  cards: 'code, pack_code, name, type_code, sphere_code',
  packs: 'pack_code, cycle_position',
  activeDecks: 'deck_id',
  customCopies: 'code',
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

export async function getCardsByCodes(codes) {
  const results = await db.cards.bulkGet(codes);
  return results.filter(Boolean);
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

export async function deleteDeck(deckId) {
  return db.activeDecks.delete(deckId);
}

// --- Custom Copies (singles) ---

export async function getCustomCopies() {
  return db.customCopies.toArray();
}

export async function addCustomCopy(code) {
  const existing = await db.customCopies.get(code);
  if (existing) {
    return db.customCopies.update(code, { owned_count: existing.owned_count + 1 });
  }
  return db.customCopies.add({ code, owned_count: 1 });
}

export async function updateCustomCopy(code, owned_count) {
  return db.customCopies.update(code, { owned_count });
}

export async function deleteCustomCopy(code) {
  return db.customCopies.delete(code);
}

export default db;
