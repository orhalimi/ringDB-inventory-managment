(function () {
  const editMatch       = location.pathname.match(/^\/deck\/edit\/(\d+)/);
  const viewMatch       = location.pathname.match(/^\/deck\/view\/(\d+)/);
  const decklistMatch   = location.pathname.match(/^\/decklist\/view\/(\d+)/);
  const fellowshipMatch = location.pathname.match(/^\/fellowship\/view\/(\d+)/);

  if (!editMatch && !viewMatch && !decklistMatch && !fellowshipMatch) return;

  const deckId      = (editMatch || viewMatch) ? parseInt((editMatch || viewMatch)[1]) : null;
  const isEdit      = !!editMatch;
  const isFellowship = !!fellowshipMatch;
  const MARKER  = 'lotr-inv-warn';
  const WARN_ID = 'lotr-inv-save-warn';

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

    #${WARN_ID} {
      color: #c0392b;
      font-size: 13px;
      font-weight: 500;
      margin-top: 10px;
    }
  `;
  document.head.appendChild(style);

  let isActive = true;
  let availability = null;
  let debounceTimer = null;

  function applyActiveState(active) {
    isActive = active;
    if (!active) {
      document.querySelectorAll('.' + MARKER).forEach(el => el.remove());
      removeSaveWarning();
    } else {
      annotate();
    }
  }

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

  // --- Element finding ---
  function getDeckContents() {
    if (isFellowship) {
      return [...document.querySelectorAll('.deck-content')]
        .filter(el => !el.closest('[id$="-side-content"]'));
    }
    const el = document.getElementById('deck-content') || document.querySelector('.deck-content');
    return el ? [el] : [];
  }

  // --- Observer setup ---
  function setupContentObservers(contents) {
    for (const deckContent of contents) {
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
  }

  // --- Annotation ---
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
    for (const deckContent of getDeckContents()) {
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
    if (result.lotrInventoryActive === false) isActive = false;

    chrome.runtime.sendMessage({ type: 'getCardAvailability', deckId }, (resp) => {
      if (chrome.runtime.lastError) return;
      availability = resp;

      const foundContents = getDeckContents();
      annotate();
      setupContentObservers(foundContents);

      // Fallback for pages that inject deck content after document_end
      if (foundContents.length === 0) {
        const bodyObserver = new MutationObserver(() => {
          const found = getDeckContents();
          if (found.length > 0) {
            bodyObserver.disconnect();
            annotate();
            setupContentObservers(found);
          }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  });
})();
