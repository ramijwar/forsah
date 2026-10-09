import { afterEach, expect, it, vi } from 'vitest';
import { API_BASE, apiRequest, apiUrl } from '../src/api';
afterEach(() => vi.unstubAllGlobals());
it('targets the production PHP file without appending a slash', () => {
  expect(API_BASE).toBe('https://t3lam.site/forsah/api.php');
  expect(apiUrl('support', { action: 'tickets' })).toBe('https://t3lam.site/forsah/api.php?resource=support&action=tickets');
});
it('rejects invalid URL schemes', () => {
  expect(() => apiUrl('ads', {}, 'file:///api.php')).toThrow();
});
it('returns real server data and sends JSON unchanged', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: 12 } }), { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  expect(await apiRequest('ads', { method: 'POST', body: '{"title":"test"}' })).toEqual({ id: 12 });
  expect(fetch.mock.calls[0][0]).toBe('https://t3lam.site/forsah/api.php?resource=ads');
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it.each([
  [200, '{"ok":false,"error":"rejected"}'],
  [500, '{"ok":true,"data":{}}'],
  [200, '<html>hosting error</html>'],
  [200, '{"ok":true}'],
])('never treats a malformed/failed response as success (%s)', async (status, body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
  await expect(apiRequest('ads')).rejects.toThrow();
});
it('propagates offline failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(apiRequest('ads')).rejects.toThrow('offline');
});
