export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://t3lam.site/forsah/api.php').replace(/\/+$/, '');

export function apiUrl(resource: string, params: Record<string, string> = {}, base = API_BASE): string {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('عنوان الخادم غير صالح');
  url.searchParams.set('resource', resource);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function apiRequest<T>(resource: string, options: RequestInit = {}, params: Record<string, string> = {}): Promise<T> {
  const response = await fetch(apiUrl(resource, params), {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
  let result: { ok?: boolean; data?: T; error?: string };
  try { result = await response.json(); } catch { throw new Error('استجابة الخادم غير صالحة'); }
  if (!response.ok || result.ok !== true || result.data === undefined) {
    throw new ApiError(result.error || 'تعذر إتمام الطلب', response.status);
  }
  return result.data;
}
