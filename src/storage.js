const DB_NAME = 'acta-entrega-espacios';
const DB_VERSION = 2;
const DRAFT_STORE_NAME = 'drafts';
const FILE_STORE_NAME = 'generated-files';
const DRAFT_KEY = 'current';
const GENERATED_PDF_KEY = 'latest-pdf';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        request.result.createObjectStore(DRAFT_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) {
        request.result.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export function saveDraft(draft) {
  return withStore(DRAFT_STORE_NAME, 'readwrite', (store) => store.put(draft, DRAFT_KEY));
}

export function loadDraft() {
  return withStore(DRAFT_STORE_NAME, 'readonly', (store) => store.get(DRAFT_KEY));
}

export function clearDraft() {
  return withStore(DRAFT_STORE_NAME, 'readwrite', (store) => store.delete(DRAFT_KEY));
}

export function saveGeneratedPdf(record) {
  return withStore(FILE_STORE_NAME, 'readwrite', (store) => store.put(record, GENERATED_PDF_KEY));
}

export function loadGeneratedPdf() {
  return withStore(FILE_STORE_NAME, 'readonly', (store) => store.get(GENERATED_PDF_KEY));
}

export function clearGeneratedPdf() {
  return withStore(FILE_STORE_NAME, 'readwrite', (store) => store.delete(GENERATED_PDF_KEY));
}
