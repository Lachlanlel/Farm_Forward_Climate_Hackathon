(() => {
  const storageKey = 'farm-forward:setup:v2';
  const legacyStorageKey = 'farm-forward:setup:v1';
  const empty = { farmLocation: null, paddockSizeHa: null, soilType: null, waterSupply: null };
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') return { ...empty, ...saved };
      // Earlier builds stored sample-looking choices. Keep the farmer's location and
      // paddock size, but require an explicit soil and water choice in this version.
      const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || 'null');
      return legacy && typeof legacy === 'object'
        ? { ...empty, farmLocation: legacy.farmLocation || null, paddockSizeHa: legacy.paddockSizeHa || null }
        : { ...empty };
    } catch { return { ...empty }; }
  };
  let current = read();
  const listeners = new Set();
  const snapshot = () => ({ ...current, farmLocation: current.farmLocation ? { ...current.farmLocation } : null });
  const notify = () => listeners.forEach(listener => listener(snapshot()));

  window.farmForwardState = Object.freeze({
    get: snapshot,
    update(patch) {
      current = { ...current, ...patch };
      try { localStorage.setItem(storageKey, JSON.stringify(current)); } catch { /* Keep this page's state available. */ }
      notify();
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { current = read(); notify(); }
  });
})();
