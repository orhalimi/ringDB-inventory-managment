export const STORAGE_KEYS = {
  PACKS_UPDATED_AT: 'lotrPacksUpdatedAt',
  CARD_FILTER: 'lotrCardFilter',
  OWNED_ONLY: 'lotrOwnedOnly',
};

export function notifyInventoryChanged() {
  chrome.storage.local.set({ [STORAGE_KEYS.PACKS_UPDATED_AT]: Date.now() });
}
