/**
 * İSTEK POLİTİKASI — timeout + retry + GET önbelleği.
 *
 * apiFetch'ten AYRI bir modül olmasının nedeni test edilebilirlik: apiFetch
 * firebase ve expo-constants'a bağımlı, Node altında çalıştırılamıyor. Buradaki
 * mantık saf — fetch dışında hiçbir şeye dokunmaz, Node'da gerçek bir sunucuya
 * karşı sınanabilir.
 *
 * Politikalar:
 *
 * TIMEOUT — RN'de fetch'in varsayılan zaman aşımı fiilen yok; zayıf şebekede
 * istek dakikalarca asılı kalır ve ekran "yükleniyor"da donar. Varsayılan
 * 15 sn, istek başına `timeoutMs` ile değiştirilebilir.
 *
 * RETRY — yalnızca güvenli metodlarda (GET/HEAD) ve yalnızca geçici hatalarda:
 * ağ hatası, zaman aşımı, 502/503/504. POST'lar KASITLI olarak tekrarlanmaz —
 * tahmin gönderimi/satın alma gibi uçlarda tekrar çift işlem riski taşır
 * (istek sunucuya ulaşıp yanıt kaybolduysa). 429'da da tekrar YOK: sunucunun
 * hız sınırına bilerek saygı gösterilir. Kısa backoff: 500ms, 1500ms.
 *
 * CACHE — isteğe bağlı (`cacheMs`), yalnızca GET. Aynı URL pencere içinde
 * tekrar istenirse ağa çıkılmaz. Response gövdesi bir kez okunabildiği için
 * metin olarak saklanır ve her isabette yeni Response üretilir.
 */

export type PolicyOptions = RequestInit & {
  /** İstek zaman aşımı (ms). Varsayılan 15000. 0 → kapalı. */
  timeoutMs?: number;
  /** Geçici hatada tekrar sayısı. Varsayılan: GET/HEAD → 2, diğerleri → 0. */
  retries?: number;
  /** GET yanıtını bu süre önbellekte tut (ms). Varsayılan: kapalı. */
  cacheMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [500, 1500];
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const CACHE_MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

const _cache = new Map<string, CacheEntry>();

function cacheGet(key: string): Response | null {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    _cache.delete(key);
    return null;
  }
  // Gövde tek kullanımlık olduğundan her isabette taze Response kurulur.
  return new Response(e.body, {
    status: e.status,
    statusText: e.statusText,
    headers: e.headers,
  });
}

async function cacheSet(key: string, res: Response, ttlMs: number): Promise<Response> {
  const body = await res.text();

  // Basit sınır: kapasite dolunca en eski girdi atılır (Map ekleme sıralı).
  if (_cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }

  const headers: [string, string][] = [];
  res.headers.forEach((v, k) => headers.push([k, v]));

  _cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
  });

  // Çağırana da okunabilir bir kopya dön (orijinalin gövdesi tüketildi).
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

/** Testlerin önbelleği sıfırlayabilmesi için. */
export function _clearFetchCache() {
  _cache.clear();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOnce(
  fetchFn: typeof fetch,
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) return fetchFn(url, opts);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  // Çağıran kendi signal'ını verdiyse ikisi birlikte çalışır: hangisi önce
  // iptal ederse istek düşer.
  const callerSignal = opts.signal;
  const onCallerAbort = () => ctl.abort();
  if (callerSignal) {
    if (callerSignal.aborted) ctl.abort();
    else callerSignal.addEventListener("abort", onCallerAbort);
  }

  try {
    return await fetchFn(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Politika uygulanmış fetch. `fetchFn` enjekte edilebilir (test için);
 * gerçek kullanımda global fetch geçilir.
 */
export async function fetchWithPolicy(
  fetchFn: typeof fetch,
  url: string,
  opts: PolicyOptions = {}
): Promise<Response> {
  const { timeoutMs, retries, cacheMs, ...rest } = opts;

  const method = String(rest.method || "GET").toUpperCase();
  const isSafe = method === "GET" || method === "HEAD";
  const effTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Güvenli olmayan metodlarda tekrar yalnızca AÇIKÇA istenirse yapılır.
  const effRetries = retries ?? (isSafe ? RETRY_DELAYS_MS.length : 0);

  // Önbellek yalnızca GET için anlamlı.
  const cacheKey = isSafe && cacheMs && cacheMs > 0 ? url : null;
  if (cacheKey) {
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
  }

  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= effRetries; attempt++) {
    // Çağıran isteği kendisi iptal ettiyse tekrar denemek anlamsız.
    if (rest.signal?.aborted) break;

    try {
      const res = await fetchOnce(fetchFn, url, rest, effTimeout);

      if (RETRYABLE_STATUS.has(res.status) && attempt < effRetries) {
        await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
        continue;
      }

      if (cacheKey && res.ok) return cacheSet(cacheKey, res, cacheMs!);
      return res;
    } catch (e) {
      lastErr = e;
      // Çağıranın kendi iptali tekrar edilmez; ağ hatası/zaman aşımı edilir.
      if (rest.signal?.aborted || attempt >= effRetries) break;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
