export type UploadResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'offline' | 'room-full' | 'invalid' | 'error' };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Client for the /api/rooms relay (design.md D2). `base` is '' for same-origin. */
export function createRelayClient(fetchFn: FetchFn = (input, init) => fetch(input, init), base = '') {
  const fishUrl = (room: string, id?: string) =>
    `${base}/api/rooms/${encodeURIComponent(room)}/fish${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;
  const expectOk = (response: Response, what: string) => {
    if (!response.ok) throw new Error(`${what} failed: HTTP ${response.status}`);
    return response;
  };

  return {
    async upload(room: string, png: Blob): Promise<UploadResult> {
      let response: Response;
      try {
        response = await fetchFn(fishUrl(room), { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
      } catch (error) {
        // fetch rejects with TypeError when the network is unreachable.
        return { ok: false, reason: error instanceof TypeError ? 'offline' : 'error' };
      }
      if (response.status === 201) {
        try {
          const body = (await response.json()) as { id?: unknown };
          if (typeof body.id === 'string') return { ok: true, id: body.id };
        } catch { /* fall through to a generic error */ }
        return { ok: false, reason: 'error' };
      }
      if (response.status === 429) return { ok: false, reason: 'room-full' };
      if (response.status === 400 || response.status === 413) return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'error' };
    },
    async list(room: string): Promise<string[]> {
      const body = (await expectOk(await fetchFn(fishUrl(room)), 'list').json()) as { fish?: { id?: unknown }[] };
      return (body.fish ?? []).map((item) => item.id).filter((id): id is string => typeof id === 'string');
    },
    async download(room: string, id: string): Promise<Blob> {
      return (await expectOk(await fetchFn(fishUrl(room, id)), 'download')).blob();
    },
    async remove(room: string, id: string): Promise<void> {
      expectOk(await fetchFn(fishUrl(room, id), { method: 'DELETE' }), 'remove');
    },
  };
}

export type RelayClient = ReturnType<typeof createRelayClient>;
