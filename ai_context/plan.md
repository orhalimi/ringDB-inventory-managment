## RingsDB Inventory & Conflict Manager — Current State

This document reflects the fully implemented extension as of V2+.

---

### 🎯 Project Objective

A Chrome Extension that tracks a user's physical LOTR LCG card collection and shows real-time conflict warnings on RingsDB — alerting when the same physical card is required by multiple active decks simultaneously.

---

### 🧩 Finalized Decisions

| Decision | Choice |
|---|---|
| Card identity | `card_code` (`code` field from API) — one canonical entry per card, one pack |
| Reprint handling | Each reprint is a distinct `card_code`; no grouping |
| Inventory formula | `Total Owned(X) = card.quantity × pack.active_count + customCopies[X].owned_count` |
| Active decks | All decks active by default; user toggles individual decks **inactive** in Decks tab |
| Deck card pool | `heroes + slots + sideslots` merged into one unified `{card_code: qty}` map per deck |
| sideslots shape | Can be `[]` or `{}`; handle both. Include in "in use" pool |
| Conflict engine | `src/inventoryEngine.js` — pure shared module used by background and content script |
| Content script | Active on RingsDB deck builder pages; annotates cards with `(!)` conflict markers |
| Deck sync | Manual: "Sync Decks" button in Decks tab; user must be logged in to RingsDB |

---

### 🗄️ Data Schema (IndexedDB via Dexie.js)

Two versioned schemas must both be present so existing user databases migrate correctly.

#### `db.version(1)` — original tables
```
cards: 'code, pack_code, name, type_code, sphere_code'
packs: 'pack_code, cycle_position'
activeDecks: 'deck_id'
```

#### `db.version(2)` — adds customCopies
```
cards: 'code, pack_code, name, type_code, sphere_code'
packs: 'pack_code, cycle_position'
activeDecks: 'deck_id'
customCopies: 'code'
```

#### Cards Table
Full card objects are stored raw from the API via `bulkPut`. All API fields are available (including `is_unique`, `traits`, `text`, `threat`, `willpower`, etc.) even though only a subset are indexed.

| Field | Notes |
|---|---|
| `code` | Primary key |
| `pack_code` | FK → Packs |
| `name` | Display |
| `quantity` | Copies per pack unit |
| `type_code` | hero / ally / attachment / event / etc. |
| `sphere_code` | leadership / tactics / spirit / lore / neutral / baggins / fellowship |
| `is_unique` | Boolean — whether the card has the ◆ unique marker |
| `deck_limit` | Max copies per deck |

#### Packs Table
| Field | Notes |
|---|---|
| `pack_code` | Primary key |
| `name` | Display name |
| `cycle_position` | Groups packs by cycle |
| `owned_count` | Physical copies owned |
| `active_count` | Copies contributing to inventory (0 ≤ active_count ≤ owned_count) |

Only packs with `owned_count > 0` are shown in the Packs tab.

#### ActiveDecks Table
| Field | Notes |
|---|---|
| `deck_id` | Primary key (RingsDB `id`) |
| `name` | Display name |
| `all_cards` | Merged `{card_code: qty}` from heroes + slots + sideslots |
| `date_update` | ISO timestamp; shown as "Updated …" |
| `is_inactive` | Default `false`; set locally, never synced to RingsDB |

#### CustomCopies Table
Tracks individual physical cards owned outside of any pack (proxies, trades, etc.). Separate table so `seedCards` `bulkPut` never overwrites these records.

| Field | Notes |
|---|---|
| `code` | Primary key (card code) |
| `owned_count` | Number of singles owned (min 1) |

---

### 💡 Core Formulas

```
Total Owned(X)  = card.quantity × pack.active_count + customCopies[X].owned_count
In Use(X)       = Σ all_cards[X] across all active decks (excluding current deck in deck-view)
Available(X)    = Total Owned(X) - In Use(X)
Conflict        = Available(X) < 0
```

---

### 📁 File Structure

```
lotr_extention/
├── manifest.json
├── src/
│   ├── background.js          # Service worker: init fetches, data seeding, conflict message handler
│   ├── content.js             # Content script: annotates RingsDB DOM with (!) conflict markers
│   ├── dbService.js           # Dexie schema (v1+v2), all table accessors
│   ├── inventoryEngine.js     # Pure fn: calculateInventory(cards, packs, decks, customCopies)
│   └── popup/
│       ├── popup.html         # Popup shell with 4-tab nav
│       ├── popup.js           # Tab routing; resets body width on every tab switch
│       ├── popup.css          # Dark parchment theme; all component styles
│       └── tabs/
│           ├── packs.js       # Packs tab: add/edit owned packs
│           ├── decks.js       # Decks tab: sync, list, expand, conflict view
│           ├── cards.js       # Cards tab: searchable list with owned count; exports buildDetail, formatSphere, sphereColor
│           └── singles.js     # Singles tab: add/edit/delete individual card copies
└── lib/
    └── dexie.mjs              # Bundled Dexie — no CDN in extensions
```

---

### 🖥️ Tab Descriptions

#### Packs Tab
- Shows only packs with `owned_count > 0`, grouped by `cycle_position`
- "Add Pack" button → search modal → enter `owned_count`; `active_count` defaults to `owned_count`
- Editing updates both counts in IndexedDB
- Changes fire `lotrPacksUpdatedAt` storage event → content script re-fetches availability

#### Decks Tab
- "Sync Decks" → `GET /api/oauth2/decks`; shows error banner on failure
- Lists all synced decks with toggle to mark as inactive
- Click a deck row (not the toggle) to expand it:
  - Fetches cards/packs/decks/customCopies fresh every time (no caching)
  - Two-column layout: left = Heroes + Allies, right = Attachments + Events + Extra
  - Each card shows: `(!) qty× Name [sphere]` — `(!)` appears if conflict
  - Conflict: `qty > (fromPack + fromSingles − inUseByOthers)`; excludes current deck and inactive decks
  - Card names are sphere-colored and bold if unique; click to expand detail panel
  - Popup widens to 480px on expand; reverts to 400px on collapse, tab switch, or re-render

#### Cards Tab
- Searchable list of all seeded cards (debounced 200ms)
- Card name is colored by sphere; bold if unique
- `(N)` owned count badge in gold shows total from packs + singles
- Click a row to expand an inline detail panel (type, sphere, stats, text, etc.)

#### Singles Tab
- Subtitle: "Track individual cards you own outside of any pack (proxies, trades, etc.)"
- Input accepts comma-separated RingsDB card codes; validates each against local DB (no API call)
- Invalid codes show a 2-second error toast; valid codes each add 1 copy
- List shows name + `code · pack_code`, editable qty spinner (min 1, max 99), delete button
- Changes fire `lotrPacksUpdatedAt` → content script updates `(!)` markers

---

### 🎨 Visual Conventions

#### Sphere Colors (applied to card name text)
| Sphere | Color |
|---|---|
| Leadership | `#b07fd4` (soft purple) |
| Tactics | `#e07070` (soft red) |
| Spirit | `#70a0e0` (soft blue) |
| Lore | `#70bb70` (soft green) |
| Neutral | `#a09888` (warm grey) |
| Baggins | `#e8c86a` (gold) |
| Fellowship | `#c8a060` (brown-gold) |

- **Unique cards** (`is_unique: true`): card name is **bold** in both Cards tab and deck expand
- Sphere coloring + bold apply consistently in both Cards tab and Deck expand rows

---

### 🔌 API Endpoints Used

See `api_calls.md` for full request/response documentation.

| Endpoint | Auth | When |
|---|---|---|
| `GET /api/public/cards/` | None | On install — seeds Cards table |
| `GET /api/public/packs/` | None | On install — seeds Packs table |
| `GET /api/oauth2/decks` | Session cookie | On "Sync Decks" button press |

---

### ⚙️ Key Implementation Notes

- **`seedCards` uses `bulkPut`** — overwrites entire card records on re-seed. Never store user data (like custom counts) on the Cards table.
- **`customCopies` is immune to re-seeding** because it is a separate table.
- **Width lifecycle**: `document.body.style.width` is set to `480px` on deck expand and reset to `''` on collapse, sync, and every tab switch. Never gets stuck wide.
- **Conflict notification**: `chrome.storage.local.set({ lotrPacksUpdatedAt: Date.now() })` is the signal that triggers the content script to re-fetch the availability map from the background.
- **`sphereColor` and `formatSphere`** are exported from `cards.js` and imported in `decks.js` — single source of truth for sphere display logic.
- **Dexie versioning**: both `version(1)` and `version(2)` blocks must remain so existing user databases migrate without data loss.
