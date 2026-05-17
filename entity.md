# entity.md

## RingsDB Inventory & Conflict Manager Entities Definition

This document defines the core data entities used by the application's local database (IndexedDB/Dexie.js). All relationships are based on the `card_code` as the unique identifier.

---

### 🃏 Card Entity (`Cards Table`)
The master record for every card type tracked by the user. This is a cached version of the RingsDB public API data.

| Field Name | Data Type | Description | Key/Constraint | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `card_code` | String | The unique, immutable code for the card (e.g., "SETA-001"). | Primary Key | **Must be used as the universal identifier.** |
| `name` | String | Display name of the card. | - | Used for display purposes only. |
| `pack_code` | String | The pack/set the card originated from (if applicable). | - | Helps with grouping. |
| `initial_qty_per_source` | Integer | The quantity of this card contained within a single source unit (e.g., 1 copy per booster pack). | - | This value is multiplied by owned count. |

### 📦 Pack Entity (`Packs Table`)
Represents the user's physical collection sources, which provide the total inventory.

| Field Name | Data Type | Description | Key/Constraint | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `pack_code` | String | Unique identifier for this source (e.g., "BOSTER-BOX-A"). | Primary Key / Composite Index | Used to group packs by Cycle. |
| `name` | String | Descriptive name of the pack/source. | - | User visible label. |
| `owned_count` | Integer | The user's total quantity of this source (e.g., 5 booster boxes). | - | This multiplier drives inventory calculation. |

### 📚 Deck Entity (`ActiveDecks Table`)
Represents a specific, built deck by the user. It links card codes to their usage quantities within that deck.

| Field Name | Data Type | Description | Key/Constraint | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `deck_id` | String | Unique identifier for this specific instance of a deck build. | Primary Key | Generated upon creation. |
| `deck_name` | String | User-friendly name (e.g., "Aggro Build"). | - | Used by the user UI. |
| `card_list` | JSON Object | A map detailing card usage: `{card_code: quantity}`. | Index on `card_code` | This list determines "In Use" count for conflict checking. |

---