// Read-only production readiness check. Never creates production test data.
try {
const base = process.env.VITE_API_BASE_URL || 'https://t3lam.site/forsah/api.php';
const url = new URL(base);
if (url.protocol !== 'https:') throw new Error('Production API must use HTTPS');
url.searchParams.set('resource', 'services');
const healthUrl = new URL(base); healthUrl.searchParams.set('resource', 'health');
const healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(20000), redirect: 'error' });
if (!healthResponse.ok) throw new Error(`Server v2 is not deployed (health HTTP ${healthResponse.status})`);
const health = await healthResponse.json();
if (health.ok !== true || health.data?.version !== 2 || health.data?.images_supported !== true) throw new Error('Deploy server v2 with GD support before using this APK');
const origin = 'https://localhost'; // Capacitor Android WebView origin, not a backend URL.
const response = await fetch(url, { headers: { Origin: origin }, signal: AbortSignal.timeout(20000), redirect: 'error' });
if (!response.ok) throw new Error(`Services HTTP ${response.status}`);
if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Services returned non-JSON content (API not deployed or hosting error)');
const data = await response.json();
if (!response.ok || data.ok !== true || !Array.isArray(data.data) || !data.data.length || !data.data.every(item => typeof item.name === 'string')) throw new Error('Invalid services response');
const cors = response.headers.get('access-control-allow-origin');
if (cors !== '*' && cors !== origin) throw new Error('Server does not allow the Android WebView origin');
for (const method of ['POST', 'PATCH', 'DELETE']) {
  const preflight = await fetch(base, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': method,
    'Access-Control-Request-Headers': 'authorization,content-type',
  }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  const allowedOrigin = preflight.headers.get('access-control-allow-origin');
  const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
  if (!preflight.ok || !['*', origin].includes(allowedOrigin) || !(preflight.headers.get('access-control-allow-methods') || '').includes(method) || !allowedHeaders.includes('authorization') || !allowedHeaders.includes('content-type')) throw new Error(`CORS ${method} preflight failed`);
}
const admin = new URL(base); admin.searchParams.set('resource', 'admin'); admin.searchParams.set('action', 'stats');
const protectedResponse = await fetch(admin, { signal: AbortSignal.timeout(20000), redirect: 'error' });
if (protectedResponse.status !== 401) throw new Error('Admin endpoint must reject anonymous access');
console.log(`PASS: ${base}: TLS, services contract, Android CORS/preflight, admin access protection. No production data changed.`);

} catch (error) {
  const message = `${error.message}${error.cause ? ` (${error.cause.code || error.cause.message})` : ''}`;
  console.error(`::error title=Production API not ready::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exitCode = 1;
}
