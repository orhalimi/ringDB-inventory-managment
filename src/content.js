(function () {
  const editMatch = location.pathname.match(/^\/deck\/edit\/(\d+)/);
  const viewMatch = location.pathname.match(/^\/deck\/view\/(\d+)/);

  if (!editMatch && !viewMatch) return;

  const deckId = parseInt((editMatch || viewMatch)[1]);
  const isEdit = !!editMatch;
  const MARKER  = 'lotr-inv-warn';
  const WARN_ID = 'lotr-inv-save-warn';
  const WIDGET_ID = 'lotr-inv-widget';

  // --- Styles ---
  const style = document.createElement('style');
  style.textContent = `
    .${MARKER} {
      color: #c0392b;
      font-weight: bold;
      cursor: help;
      position: relative;
      margin-left: 3px;
      font-size: 0.85em;
    }
    .${MARKER}::after {
      content: attr(data-tip);
      position: absolute;
      bottom: 130%;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 99999;
      font-weight: normal;
    }
    .${MARKER}:hover::after { opacity: 1; }

    #${WIDGET_ID} {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      margin-bottom: 12px;
      font-size: 13px;
      font-family: inherit;
      color: #555;
      border-bottom: 1px solid #e5e5e5;
      user-select: none;
    }
    #${WIDGET_ID} .lotr-label { font-weight: bold; letter-spacing: 0.03em; }
    #${WIDGET_ID} .lotr-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    #${WIDGET_ID} .lotr-toggle input { display: none; }
    #${WIDGET_ID} .lotr-pill {
      width: 32px;
      height: 16px;
      background: #555;
      border-radius: 8px;
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #${WIDGET_ID} .lotr-pill::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: #fff;
      border-radius: 50%;
      transition: left 0.2s;
    }
    #${WIDGET_ID} input:checked ~ .lotr-pill { background: #27ae60; }
    #${WIDGET_ID} input:checked ~ .lotr-pill::after { left: 18px; }
    #${WIDGET_ID} .lotr-status { font-size: 11px; color: #888; min-width: 48px; }
    #${WIDGET_ID} input:checked ~ .lotr-status { color: #2ecc71; }

    #${WARN_ID} {
      color: #c0392b;
      font-size: 13px;
      font-weight: 500;
      margin-top: 10px;
    }
  `;
  document.head.appendChild(style);

  // --- Widget ---
  let isActive = true;

  const widget = document.createElement('div');
  widget.id = WIDGET_ID;
  widget.innerHTML = `
    <span class="lotr-label">LOTR Inventory</span>
    <label class="lotr-toggle">
      <input type="checkbox" checked>
      <span class="lotr-pill"></span>
      <span class="lotr-status">Active</span>
    </label>
  `;
  const deckContentEl = document.getElementById('deck-content');
  if (deckContentEl) {
    deckContentEl.parentNode.insertBefore(widget, deckContentEl);
  } else {
    document.body.appendChild(widget);
  }

  const toggleInput = widget.querySelector('input[type="checkbox"]');
  const statusLabel = widget.querySelector('.lotr-status');

  function applyActiveState(active) {
    isActive = active;
    toggleInput.checked = active;
    statusLabel.textContent = active ? 'Active' : 'Inactive';
    if (!active) {
      document.querySelectorAll('.' + MARKER).forEach(el => el.remove());
      removeSaveWarning();
    } else {
      annotate();
    }
  }

  // Persist toggle to shared storage so any part of the extension can read/write it
  toggleInput.addEventListener('change', () => {
    chrome.storage.local.set({ lotrInventoryActive: toggleInput.checked });
  });

  // React to changes from anywhere in the extension
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('lotrInventoryActive' in changes) {
      applyActiveState(changes.lotrInventoryActive.newValue);
    }
    if ('lotrPacksUpdatedAt' in changes && isActive) {
      chrome.runtime.sendMessage({ type: 'getCardAvailability', deckId }, (resp) => {
        if (chrome.runtime.lastError) return;
        availability = resp;
        annotate();
      });
    }
  });

  // --- Annotation ---
  let availability = null;
  let debounceTimer = null;

  function scheduleAnnotation(mutations) {
    if (mutations) {
      const allOurs = mutations.every(m =>
        [...m.addedNodes, ...m.removedNodes].every(
          n => n.nodeType !== Node.ELEMENT_NODE || n.classList?.contains(MARKER)
        )
      );
      if (allOurs) return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(annotate, 300);
  }

  function annotate() {
    if (!availability || !isActive) return;
    annotateDeckContent();
    if (isEdit) annotateCollection();
  }

  function annotateDeckContent() {
    const deckContent = document.getElementById('deck-content');
    if (!deckContent) return;

    deckContent.querySelectorAll('.' + MARKER).forEach(el => el.remove());

    for (const link of deckContent.querySelectorAll('a.card[data-code]')) {
      const code = link.getAttribute('data-code');
      const free = availability[code] ?? 0;
      const countSpan = link.parentElement?.querySelector('span.card-count');
      const qty = countSpan ? (parseInt(countSpan.textContent) || 1) : 1;

      if (qty > free) {
        link.after(makeMarker('Not enough copies in your active packs'));
      }
    }

    if (isEdit) {
      const hasConflicts = deckContent.querySelectorAll('.' + MARKER).length > 0;
      hasConflicts ? showSaveWarning() : removeSaveWarning();
    }
  }

  function annotateCollection() {
    const tbody = document.getElementById('collection-table');
    if (!tbody) return;

    tbody.querySelectorAll('.' + MARKER).forEach(el => el.remove());

    for (const row of tbody.querySelectorAll('tr.card-container')) {
      const link = row.querySelector('a.card[data-code]');
      if (!link) continue;

      const code = link.getAttribute('data-code');
      const free = availability[code] ?? 0;
      const activeInput = row.querySelector('label.btn.active input[type="radio"]');
      const selectedQty = activeInput ? parseInt(activeInput.value) : 0;

      if (selectedQty >= free) {
        link.after(makeMarker('Not enough copies to add more cards'));
      }
    }
  }

  function makeMarker(tooltip) {
    const span = document.createElement('span');
    span.className = MARKER;
    span.textContent = '(!)';
    span.setAttribute('data-tip', tooltip);
    return span;
  }

  function showSaveWarning() {
    if (document.getElementById(WARN_ID)) return;
    const form = document.getElementById('save_form');
    if (!form) return;
    const warn = document.createElement('div');
    warn.id = WARN_ID;
    warn.textContent = 'This deck uses cards that are not available in your active packs.';
    form.appendChild(warn);
  }

  function removeSaveWarning() {
    document.getElementById(WARN_ID)?.remove();
  }

  // --- Init ---
  chrome.storage.local.get('lotrInventoryActive', (result) => {
    // Default true if never set
    const stored = result.lotrInventoryActive;
    if (stored === false) applyActiveState(false);

    chrome.runtime.sendMessage({ type: 'getCardAvailability', deckId }, (resp) => {
      if (chrome.runtime.lastError) return;
      availability = resp;
      annotate();

      const deckContent = document.getElementById('deck-content');
      if (deckContent) {
        new MutationObserver(scheduleAnnotation).observe(deckContent, {
          childList: true,
          subtree: true,
        });
      }

      if (isEdit) {
        const collectionTable = document.getElementById('collection-table');
        if (collectionTable) {
          new MutationObserver(scheduleAnnotation).observe(collectionTable, {
            childList: true,
            subtree: true,
          });
        }
      }
    });
  });
})();
