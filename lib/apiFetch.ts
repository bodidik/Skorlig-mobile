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

/**
 * BAŞARISIZ İSTEKLER SESSİZ KALMAZ.
 *
 * ⚠️ NEDEN VAR: bugün dört ekran, VAR OLMAYAN uçlara istek atarken aylarca
 * fark edilmeden çalıştı:
 *   • kings      → /api/users            (404) → "Takımım" sekmesi küresel
 *                                                listeyi takım sanıp gösterdi
 *   • board2     → /api/stats/board2     (404) → ekran hep boş
 *   • live/fav   → /api/stats/fav        (404) → favori takım hiç kaydedilmedi
 *   • stats/fav  → /api/rt/fav-team      (404) → aynısı, farklı yanlış yol
 *
 * Dördü de aynı desenle saklandı: `catch {}` ya da `if (!j.ok) return` —
 * hata yutuluyor, ekran boş/işlevsiz kalıyor, hiçbir yerde iz yok.
 *
 * DÖRDÜ DE 404'TÜ. Yani tek bir kural hepsini yakalardı, ve artık yakalıyor:
 * 2xx dışındaki her yanıt loga düşüyor. Yanıtın GÖVDESİ okunmuyor (klonlamak
 * her isteği iki kez ayrıştırmak demekti; sezon tablosu 182 KB) — durum kodu
 * bu sınıf hata için zaten yeterli.
 *
 * ⚠️ SADECE LOG: davranış değişmiyor, hata fırlatılmıyor. Çağıranların akışını
 * bozmak, sessiz hatayı gürültülü çökmeye çevirirdi.
 */
function basarisizligiBildir(path: string, res: Response) {
  if (res.ok) return;

  const ipucu =
    res.status === 404
      ? " — böyle bir uç YOK. Yol yanlış olabilir (mount edildiği prefix'i kontrol et)."
      : res.status === 401 || res.status === 403
      ? " — yetki/kimlik sorunu."
      : res.status >= 500
      ? " — sunucu hatası."
      : "";

  console.warn(`[apiFetch] ${res.status} ${path}${ipucu}`);
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const res = await istekYap(path, opts, false);
  basarisizligiBildir(path, res);
  return res;
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
