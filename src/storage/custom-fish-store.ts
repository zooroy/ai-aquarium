export interface CustomFishRecord { id: string; createdAt: number; template: 'default'; png: Blob }
export interface CustomFishStore {
  list(): Promise<CustomFishRecord[]>;
  add(r: CustomFishRecord): Promise<void>;
  remove(id: string): Promise<void>;
}
const sorted = (records: CustomFishRecord[]) => records.sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id));

export class MemoryStore implements CustomFishStore {
  private records = new Map<string, CustomFishRecord>();
  async list(): Promise<CustomFishRecord[]> { return sorted([...this.records.values()].map(r => ({...r}))); }
  async add(record: CustomFishRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error('Duplicate custom fish id');
    this.records.set(record.id, {...record});
  }
  async remove(id: string): Promise<void> { this.records.delete(id); }
}

export class IndexedDbStore implements CustomFishStore {
  constructor(private readonly db: IDBDatabase) {}
  static open(factory: IDBFactory): Promise<IndexedDbStore> {
    return new Promise((resolve,reject) => {
      const request = factory.open('ai-aquarium',1);
      let failed = false;
      const fail = (error: unknown) => { failed=true; reject(error); };
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains('customFish'))
            request.result.createObjectStore('customFish',{keyPath:'id'});
        } catch(error) { request.transaction?.abort(); fail(error); }
      };
      request.onerror = () => fail(request.error ?? new Error('Cannot open IndexedDB'));
      request.onblocked = () => fail(new Error('IndexedDB upgrade blocked'));
      request.onsuccess = () => {
        if (failed) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(new IndexedDbStore(request.result));
      };
    });
  }
  /** Resolve only after commit; request success alone does not guarantee persistence.
   * Operation failures reject to the caller, which can show the save-failure notice. */
  private transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve,reject) => {
      const tx = this.db.transaction('customFish',mode);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      const request = operation(tx.objectStore('customFish'));
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(request.result);
    });
  }
  async list(): Promise<CustomFishRecord[]> {
    return sorted(await this.transaction<CustomFishRecord[]>('readonly',store => store.getAll()));
  }
  async add(record: CustomFishRecord): Promise<void> { await this.transaction('readwrite',store => store.add(record)); }
  async remove(id: string): Promise<void> { await this.transaction('readwrite',store => store.delete(id)); }
  close(): void { this.db.close(); }
}

/** Inject a store-opening factory; browser globals are accessed only inside the caught call. */
export async function createStore(
  factory: () => Promise<CustomFishStore> = () => {
    if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
    return IndexedDbStore.open(globalThis.indexedDB);
  },
): Promise<{ store: CustomFishStore; persistent: boolean }> {
  try { return {store:await factory(),persistent:true}; }
  catch(error) {
    console.warn('目前無法保存',error);
    return {store:new MemoryStore(),persistent:false};
  }
}
