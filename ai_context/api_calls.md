# RingsDB API Reference

All endpoints are on `https://ringsdb.com`. Authenticated endpoints require the user to be logged in via browser session (cookies sent automatically).

---

## 1. Public Cards

**Endpoint:** `GET https://ringsdb.com/api/public/cards/`
**Auth:** None
**Use:** Fetch the full card database on extension init. Results stored in IndexedDB `Cards` table.

### Response (array of card objects)
```json
[
  {
    "pack_code": "Core",
    "pack_name": "Core Set",
    "type_code": "hero",
    "type_name": "Hero",
    "sphere_code": "leadership",
    "sphere_name": "Leadership",
    "position": 1,
    "code": "01001",
    "name": "Aragorn",
    "traits": "Dúnedain. Noble. Ranger.",
    "text": "Sentinel.\n<b>Response:</b> After Aragorn commits to a quest, spend 1 resource from his resource pool to ready him.",
    "flavor": "\"I am Aragorn son of Arathorn...\"\n<cite>The Fellowship of the Ring</cite>",
    "is_unique": true,
    "threat": 12,
    "willpower": 2,
    "attack": 3,
    "defense": 2,
    "health": 5,
    "quantity": 1,
    "deck_limit": 1,
    "illustrator": "John Stanko",
    "octgnid": "51223bd0-ffd1-11df-a976-0801200c9001",
    "has_errata": false,
    "url": "https://ringsdb.com/card/01001",
    "imagesrc": "/bundles/cards/01001.png"
  }
]
```

### Key fields for this extension
| Field | Use |
|---|---|
| `code` | Primary key (`card_code`) |
| `pack_code` | FK to Packs table |
| `quantity` | Copies of this card in one pack unit (`initial_qty_per_source`) |
| `deck_limit` | Max allowed in a single deck (1 for unique cards) |
| `name` | Display only |

---

## 2. Public Packs

**Endpoint:** `GET https://ringsdb.com/api/public/packs/`
**Auth:** None
**Use:** Fetch the full pack/set list on extension init. Used to populate the Packs UI so the user can enter their collection.

### Response (array of pack objects)
```json
[
  {
    "name": "Core Set",
    "code": "Core",
    "position": 1,
    "cycle_position": 1,
    "available": "2011-04-20",
    "known": 73,
    "total": 73,
    "url": "https://ringsdb.com/set/Core",
    "id": 1
  },
  {
    "name": "Revised Core Set (Campaign Only)",
    "code": "RevCore",
    "position": 1,
    "cycle_position": 2,
    "available": "2011-04-21",
    "known": 7,
    "total": 7,
    "url": "https://ringsdb.com/set/RevCore",
    "id": 85
  },
  {
    "name": "The Dark of Mirkwood",
    "code": "TDoM",
    "position": 15,
    "cycle_position": 50,
    "available": "2011-04-22",
    "known": 9,
    "total": 9,
    "url": "https://ringsdb.com/set/TDoM",
    "id": 86
  },
  {
    "name": "Two-Player Limited Edition Starter",
    "code": "Starter",
    "position": 1,
    "cycle_position": 60,
    "available": "2011-04-25",
    "known": 65,
    "total": 65,
    "url": "https://ringsdb.com/set/Starter",
    "id": 61
  },
  {
    "name": "Dwarves of Durin",
    "code": "DoD",
    "position": 1,
    "cycle_position": 61,
    "available": "2011-04-26",
    "known": 31,
    "total": 31,
    "url": "https://ringsdb.com/set/DoD",
    "id": 98
  }
]
```

### Key fields for this extension
| Field | Use |
|---|---|
| `code` | Primary key (`pack_code`), joins to `Cards.pack_code` |
| `name` | Display in pack collection UI |
| `cycle_position` | Group packs by cycle in the UI |

---

## 3. User Decks (Authenticated)

**Endpoint:** `GET https://ringsdb.com/api/oauth2/decks`
**Auth:** Browser session cookie (user must be logged in to ringsdb.com)
**Use:** Fetch user's saved decks on init and on "Sync Decks" button press. Results stored in IndexedDB `ActiveDecks` table.

### Response (array of deck objects)
```json
[
  {
    "id": 671202,
    "name": "attachment",
    "date_creation": "2026-05-09T11:29:07+00:00",
    "date_update": "2026-05-15T19:16:12+00:00",
    "description_md": "",
    "user_id": 39058,
    "heroes": {
      "01008": 1,
      "18001": 1,
      "18002": 1
    },
    "slots": {
      "01008": 1,
      "18001": 1,
      "18002": 1,
      "18003": 3,
      "18004": 3,
      "18007": 2
    },
    "sideslots": [],
    "version": "1.5",
    "last_pack": {},
    "is_published": false,
    "problem": null,
    "tags": "leadership spirit"
  },
  {
    "id": 671214,
    "name": "Beorn and things",
    "date_creation": "2026-05-09T12:31:45+00:00",
    "date_update": "2026-05-09T15:30:09+00:00",
    "description_md": "",
    "user_id": 39058,
    "heroes": {
      "08056": 1,
      "19001": 1,
      "19145": 1
    },
    "slots": {
      "01031": 3,
      "01059": 2,
      "01061": 2,
      "08056": 1,
      "18010": 3,
      "19001": 1
    },
    "sideslots": [],
    "version": "1.7",
    "last_pack": {},
    "is_published": false,
    "problem": null,
    "tags": "tactics lore"
  }
]
```

### Key fields for this extension
| Field | Use |
|---|---|
| `id` | Primary key (`deck_id`) |
| `name` | Display in Decks tab |
| `heroes` | Merged into unified card map for conflict calculation |
| `slots` | Main deck cards — merged with heroes + sideslots |
| `sideslots` | Side deck cards — included in "in use" pool (may be `[]` or `{}`) |
| `date_update` | Show last sync time in UI |

### Storage transformation
When storing a deck, merge `heroes`, `slots`, and `sideslots` into one unified map:
```js
const allCards = { ...deck.heroes, ...deck.slots };
if (!Array.isArray(deck.sideslots)) {
  for (const [code, qty] of Object.entries(deck.sideslots)) {
    allCards[code] = (allCards[code] || 0) + qty;
  }
}
```

---

## Notes

- All public endpoints (`/api/public/`) work without auth and can be called from the background service worker.
- The decks endpoint (`/api/oauth2/decks`) requires an active RingsDB session. If the user is not logged in, the request will return a redirect or 401. The extension must handle this gracefully (show "Please log in to RingsDB" in the popup).
- `sideslots` can be either `[]` (empty array) or `{}` (object with card_code keys) — handle both shapes.
