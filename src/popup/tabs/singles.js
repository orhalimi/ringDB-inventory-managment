import { getCardByCode } from "../../dbService.js";
import {
  getCustomCopies,
  addCustomCopy,
  updateCustomCopy,
  deleteCustomCopy,
} from "../../dbService.js";

export async function renderSinglesTab(container) {
  container.innerHTML = "";

  const subtitle = document.createElement("p");
  subtitle.className = "tab-subtitle";
  subtitle.textContent =
    "Track individual cards you own outside of any pack (proxies, trades, etc.)";
  container.appendChild(subtitle);

  const addRow = document.createElement("div");
  addRow.style.cssText =
    "display:flex;gap:6px;align-items:center;flex-shrink:0;";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-input";
  input.style.flex = "1";
  input.placeholder = "RingsDB card code(s), comma-separated (e.g. 01001, 01002)";

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-primary";
  addBtn.textContent = "Add";

  addRow.append(input, addBtn);
  container.appendChild(addRow);

  const errorMsg = document.createElement("div");
  errorMsg.style.cssText =
    "font-size:11px;color:#c0392b;min-height:16px;margin-top:2px;";
  container.appendChild(errorMsg);

  const listWrapper = document.createElement("div");
  listWrapper.style.cssText =
    "display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow-y:auto;margin-top:6px;";
  container.appendChild(listWrapper);

  await renderList(listWrapper);

  addBtn.addEventListener("click", () =>
    handleAdd(input, errorMsg, listWrapper),
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdd(input, errorMsg, listWrapper);
  });
}

async function handleAdd(input, errorMsg, listWrapper) {
  const raw = input.value.trim();
  if (!raw) return;

  const codes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const failed = [];

  for (const code of codes) {
    const card = await getCardByCode(code);
    if (!card) {
      failed.push(code);
      continue;
    }
    await addCustomCopy(code);
  }

  if (failed.length > 0) {
    errorMsg.textContent = `Not found: ${failed.join(", ")}`;
    setTimeout(() => {
      errorMsg.textContent = "";
    }, 2000);
  }

  const added = codes.length - failed.length;
  if (added > 0) {
    input.value = "";
    notifySinglesUpdated();
    await renderList(listWrapper);
  }
}

async function renderList(wrapper) {
  wrapper.innerHTML = "";
  const copies = await getCustomCopies();

  if (copies.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "No singles added yet. Enter a card code above to get started.";
    wrapper.appendChild(empty);
    return;
  }

  const cards = await Promise.all(copies.map((c) => getCardByCode(c.code)));
  const rows = copies.map((copy, i) => ({ copy, card: cards[i] }));

  for (const { copy, card } of rows) {
    wrapper.appendChild(buildRow(copy, card, wrapper));
  }
}

function buildRow(copy, card, wrapper) {
  const row = document.createElement("div");
  row.className = "list-item";

  const info = document.createElement("div");
  info.style.cssText = "flex:1;min-width:0;";

  const name = document.createElement("div");
  name.className = "list-item-name";
  name.textContent = card ? card.name : copy.code;

  const meta = document.createElement("div");
  meta.className = "list-item-meta";
  meta.textContent = card ? `${copy.code} · ${card.pack_code}` : copy.code;

  info.append(name, meta);

  const qtyPair = document.createElement("div");
  qtyPair.className = "qty-pair";

  const lbl = document.createElement("span");
  lbl.textContent = "Owned:";

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.className = "qty-input";
  qtyInput.value = copy.owned_count;
  qtyInput.min = 1;
  qtyInput.max = 99;

  qtyInput.addEventListener("change", async () => {
    let val = parseInt(qtyInput.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    val = Math.min(99, val);
    qtyInput.value = val;
    await updateCustomCopy(copy.code, val);
    notifySinglesUpdated();
  });

  qtyPair.append(lbl, qtyInput);

  const delBtn = document.createElement("button");
  delBtn.className = "btn";
  delBtn.textContent = "✕";
  delBtn.title = "Remove single";
  delBtn.style.cssText = "padding:2px 7px;font-size:11px;";

  delBtn.addEventListener("click", async () => {
    await deleteCustomCopy(copy.code);
    notifySinglesUpdated();
    await renderList(wrapper);
  });

  row.append(info, qtyPair, delBtn);
  return row;
}

function notifySinglesUpdated() {
  chrome.storage.local.set({ lotrPacksUpdatedAt: Date.now() });
}
