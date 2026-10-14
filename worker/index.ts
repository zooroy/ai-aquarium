// 暫時的入口，任務 1.1 會換成 handleRelay 與 R2 轉接。
export default {
  async fetch(): Promise<Response> {
    return new Response(JSON.stringify({ error: 'not-found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  },
} satisfies ExportedHandler;
