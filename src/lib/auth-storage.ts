/** Keep Supabase's existing storage keys. Restricted browsers may allow tab
 * storage while blocking local storage; avoid silently falling back to memory. */
export function browserAuthStorage() {
  const memory = new Map<string, string>();
  let preferred: Storage | undefined;
  const stores = () => {
    const result: Storage[] = [];
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      try { result.push(window[name]); } catch { /* Try the next browser store. */ }
    }
    return preferred ? [preferred, ...result.filter(store => store !== preferred)] : result;
  };
  return {
    getItem(key: string) {
      if (memory.has(key)) return memory.get(key)!;
      for (const storage of stores()) {
        try {
          const value = storage.getItem(key);
          if (value !== null) { preferred = storage; return value; }
        } catch { /* Try tab storage if persistent storage is unavailable. */ }
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      for (const storage of stores()) {
        try {
          storage.setItem(key, value);
          preferred = storage;
          // Remove an older fallback so it cannot resurrect after sign-out or
          // supersede a rotated refresh token if storage availability changes.
          for (const other of stores()) if (other !== storage) {
            try { other.removeItem(key); } catch { /* Unavailable store. */ }
          }
          memory.delete(key);
          return;
        } catch { /* Quota or browser restriction. */ }
      }
      memory.set(key, value);
    },
    removeItem(key: string) {
      for (const storage of stores()) {
        try { storage.removeItem(key); } catch { /* Other available stores are still cleared. */ }
      }
      memory.delete(key);
    },
  };
}
