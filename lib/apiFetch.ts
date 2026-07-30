import { auth } from "./firebase";
import { getApiBase, resetApiBase } from "./apiBase";
import { fetchWithPolicy, PolicyOptions } from "./fetchPolicy";

/**
 * Tüm API istekleri buradan geçer. Çıplak fetch'e göre üç ek politika:
 * timeout (varsayılan 15sn), güvenli metodlarda otomatik tekrar ve isteğe
 * bağlı GET önbelleği — ayrıntılar ve gerekçeler lib/fetchPolicy.ts'te.
 *
 * Kullanım aynı kaldı; mevcut çağıranlar değişiklik gerektirmez:
 *   apiFetch("/api/x")                          → 15sn timeout + 2 tekrar
 *   apiFetch("/api/x", { timeoutMs: 5000 })     → kısa timeout
 *   apiFetch("/api/x", { cacheMs: 30_000 })     → 30sn GET önbelleği
 *   apiFetch("/api/x", { method: "POST", ... }) → tekrar YOK (çift işlem riski)
 */

type FetchOptions = PolicyOptions & { skipAuth?: boolean };

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { "x-auth-token": token, "x-user-id": user.uid };
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  return istekYap(path, opts, false);
}

/**
 * ⚠️ AĞ HATASINDA API ADRESİNİ TAZELE — geliştirmede LAN IP'si değişiyor.
 *
 * Bu davranış 4 ekranın KENDİ yerel apiFetch kopyasında vardı (arena, predict,
 * duel, pool); paylaşılan sürümde yoktu. Kopyaları teke indirirken kaybolmasın
 * diye buraya taşındı — böylece tüm ekranlar kazanıyor.
 *
 * ⚠️ YALNIZCA GÜVENLİ YÖNTEMLER (GET/HEAD) tekrarlanır. POST'u tekrarlamak
 * çifte tahmin / çifte bahis demek olurdu; lib/fetchPolicy zaten aynı kuralı
 * uyguluyor ("POST'lar KASITLI olarak tekrarlanmaz") ve burada onu delmemek
 * gerekiyor.
 */
async function istekYap(
  path: string,
  opts: FetchOptions,
  yenidenDenendi: boolean
): Promise<Response> {
  const base    = await getApiBase();
  const url     = `${base}${path}`;
  const { skipAuth, ...rest } = opts;
  const headers = new Headers(rest.headers as HeadersInit);

  if (!skipAuth) {
    const authH = await getAuthHeaders();
    for (const [k, v] of Object.entries(authH)) headers.set(k, v);
  }

  try {
    return await fetchWithPolicy(fetch, url, { ...rest, headers });
  } catch (e) {
    const method = String((rest as any).method || "GET").toUpperCase();
    const guvenli = method === "GET" || method === "HEAD";
    if (!yenidenDenendi && guvenli) {
      resetApiBase();
      return istekYap(path, opts, true);
    }
    throw e;
  }
}
