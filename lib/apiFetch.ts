import { auth } from "./firebase";
import { getApiBase } from "./apiBase";
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
  const base    = await getApiBase();
  const url     = `${base}${path}`;
  const { skipAuth, ...rest } = opts;
  const headers = new Headers(rest.headers as HeadersInit);

  if (!skipAuth) {
    const authH = await getAuthHeaders();
    for (const [k, v] of Object.entries(authH)) headers.set(k, v);
  }

  return fetchWithPolicy(fetch, url, { ...rest, headers });
}
