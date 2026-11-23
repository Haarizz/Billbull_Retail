import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

// jsdom has no IndexedDB. The till persists every checkout there before sending it (Phase 0 /
// M2.2.2), so tests get a spec-conformant in-memory implementation, fresh for every test: a pending
// checkout one test leaves behind must never gate the next test's sale. (pendingCheckoutStore
// re-opens its connection whenever globalThis.indexedDB is a different factory.)
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
