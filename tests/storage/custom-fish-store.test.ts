import { expect,it,vi } from 'vitest';
import { MemoryStore,createStore } from '../../src/storage/custom-fish-store';
const record=(id:string,createdAt:number)=>({id,createdAt,template:'default' as const,png:new Blob(['png'])});
it('stores records sorted by creation time, removes them, and isolates metadata',async()=>{
  const store=new MemoryStore(),r=record('b',2);
  await store.add(r);await store.add(record('a',1));r.createdAt=0;
  const list=await store.list();expect(list.map(r=>r.id)).toEqual(['a','b']);
  list[0].id='changed';expect((await store.list())[0].id).toBe('a');
  await expect(store.add(record('a',3))).rejects.toThrow();
  await store.remove('a');await store.remove('missing');
  expect((await store.list()).map(r=>r.id)).toEqual(['b']);
});
it.each(['throw','reject','unavailable'])('falls back safely when opening %s',async(mode)=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try {
    const factory=()=>{if(mode==='throw') throw new Error('denied');return Promise.reject(new Error('failed'));};
    if(mode==='unavailable') vi.stubGlobal('indexedDB',undefined);
    const result=await (mode==='unavailable'?createStore():createStore(factory));
    expect(result.persistent).toBe(false);expect(result.store).toBeInstanceOf(MemoryStore);
    await result.store.add(record('a',1));expect(await result.store.list()).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('目前無法保存',expect.any(Error));
  } finally {warn.mockRestore();vi.unstubAllGlobals();}
});
it('uses a successfully opened injected store',async()=>{
  const store=new MemoryStore();
  expect(await createStore(async()=>store)).toEqual({store,persistent:true});
});
