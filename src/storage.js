const DB_NAME = 'acta-entrega-espacios';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'current';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export function saveDraft(draft) {
  return withStore('readwrite', (store) => store.put(draft, DRAFT_KEY));
}

export function loadDraft() {
  return withStore('readonly', (store) => store.get(DRAFT_KEY));
}

export function clearDraft() {
  return withStore('readwrite', (store) => store.delete(DRAFT_KEY));
}
