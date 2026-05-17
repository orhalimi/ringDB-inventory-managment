## RingsDB Inventory & Conflict Manager — Development Plan (V2)

All decisions below are finalized from the design review session.

---

### 🎯 Project Objective

A Chrome Extension that tracks a user's physical LOTR LCG card collection and shows real-time conflict warnings on RingsDB — alerting when the same physical card is required by multiple active decks simultaneously.

---

### 🧩 Finalized Scope & Decisions

| Decision | Choice |
|---|---|
| Card identity | `card_code` (`code` field from API) — one canonical entry per card, one pack |
| Reprint handling | Each reprint is a distinct `card_code`; no grouping in V1 |
| Inventory formula | `Total Owned(X) = card.quantity × pack.active_count` |
| Active decks | All decks active by default; user toggles individual decks **inactive** in Decks tab |
| Deck card pool | `heroes + slots + sideslots` merged into one unified `{card_code: qty}` map per deck |
| sideslots shape | Can be `[]` or `{}`; handle both. Include in "in use" pool |
| Conflict engine | Pure shared module `src/inventoryEngine.js` — **deferred until Phase 4** |
| Content script | **Deferred until Phase 4** — no DOM manipulation until all other phases complete |
| Deck sync | Manual: "Sync Decks" button in Decks tab; user must be logged in to RingsDB |

---

### 🗄️ Data Schema (IndexedDB via Dexie.js)

#### Cards Table
| Field | Type | Notes |
|---|---|---|
| `code` | String (PK) | e.g. `"01001"` — universal identifier |
| `name` | String | Display only |
| `pack_code` | String (FK → Packs) | Canonical pack this card belongs to |
| `quantity` | Integer | Copies in one unit of that pack (`initial_qty_per_source`) |
| `type_code` | String | hero / ally / attachment / event / etc. |
| `sphere_code` | String | leadership / tactics / spirit / lore |
| `deck_limit` | Integer | Max copies per deck |
| `imagesrc` | String | Relative image path from API |

#### Packs Table
| Field | Type | Notes |
|---|---|---|
| `pack_code` | String (PK) | e.g. `"Core"` |
| `name` | String | Display name |
| `cycle_position` | Integer | Used to group packs by cycle in UI |
| `owned_count` | Integer | Total copies the user physically owns |
| `active_count` | Integer | Copies contributing to inventory (0 ≤ active_count ≤ owned_count). Defaults to owned_count |

> Only packs with `owned_count > 0` are shown in the Packs tab. All pack metadata is seeded from the public API on init.

#### ActiveDecks Table
| Field | Type | Notes |
|---|---|---|
| `deck_id` | Integer (PK) | From RingsDB API `id` field |
| `name` | String | Display name |
| `all_cards` | JSON Object | Merged map `{card_code: qty}` from heroes + slots + sideslots |
| `date_update` | String | ISO timestamp from API; shown as "last synced" |
| `is_inactive` | Boolean | Default `false`. Set locally; not synced to RingsDB |

---

### 💡 Core Formula

```
Total Owned(X)  = card.quantity × pack.active_count
In Use(X)       = Σ all_cards[X] across all decks where is_inactive = false
Available(X)    = Total Owned(X) - In Use(X)
```

Conflict condition: `Available(X) < 0`

---

### 📁 File Structure

```
lotr_extention/
├── manifest.json
├── src/
│   ├── background.js        # Service worker: init fetches, data seeding
│   ├── content.js           # Content script: DOM manipulation (Phase 4)
│   ├── dbService.js         # Dexie.js schema, table accessors, init logic
│   ├── inventoryEngine.js   # Pure fn: calculateInventory(cards, packs, decks) → {card_code: available} (Phase 4)
│   └── popup/
│       ├── popup.html       # Popup shell with tab nav
│       ├── popup.js         # Tab routing, event wiring
│       ├── tabs/
│       │   ├── packs.js     # Packs tab logic
│       │   ├── decks.js     # Decks tab logic
│       │   └── cards.js     # Cards tab logic
│       └── popup.css
└── lib/
    └── dexie.min.js         # Bundled — no CDN in extensions
```

---

### 🚀 Build Phases

#### Phase 1 — Database Foundation (`src/dbService.js` + `src/background.js`)

- Define Dexie schema for Cards, Packs, ActiveDecks tables
- On extension install (`chrome.runtime.onInstalled`):
  - Fetch `GET /api/public/cards/` → seed Cards table
  - Fetch `GET /api/public/packs/` → seed Packs table (all with `owned_count: 0`, `active_count: 0`)
- Expose helper functions: `getCards()`, `getPacks()`, `getActiveDecks()`, `upsertPack()`, `upsertDecks()`, `toggleDeckInactive()`

#### Phase 2 — Packs Tab (`src/popup/tabs/packs.js`)

- Show only packs where `owned_count > 0`, grouped by `cycle_position`
- "Add Pack" button → search modal over all seeded packs → user selects → enters `owned_count`
- `active_count` input: spinner clamped to `[0, owned_count]`, defaults to `owned_count`
- Editing a pack row updates `owned_count` and `active_count` in IndexedDB

#### Phase 3 — Decks Tab (`src/popup/tabs/decks.js`)

- "Sync Decks" button → `GET /api/oauth2/decks`
  - If request fails/redirects: show banner *"Please log in to RingsDB to sync your decks"*
  - On success: merge `heroes + slots + sideslots` into `all_cards`, upsert into ActiveDecks table
- List all synced decks with toggle to mark as inactive (stored locally in `is_inactive`)
- Show `date_update` as "Last updated: X" per deck

#### Phase 4 — Cards Tab (`src/popup/tabs/cards.js`)

- Read all cards from IndexedDB
- Render as a scrollable list: card name + pack name + sphere
- Search bar filters by name (client-side, no re-fetch)
- Click a row → detail view: all card fields + owned/in-use/available counts

#### Phase 5 — Conflict Engine + Content Script (Deferred)

- Implement `src/inventoryEngine.js`: pure `calculateInventory(cards, packs, decks)` → `{card_code: available_qty}`
- Implement `src/content.js`: observe deck builder DOM, apply conflict highlights
- Scope content script activation to deck builder URL pattern only

---

### 🔌 API Endpoints Used

See `api_calls.md` for full request/response documentation.

| Endpoint | Auth | When |
|---|---|---|
| `GET /api/public/cards/` | None | Phase 1 init |
| `GET /api/public/packs/` | None | Phase 1 init |
| `GET /api/oauth2/decks` | Session cookie | Phase 3, on button press |
