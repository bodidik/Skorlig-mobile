import { auth } from "./firebase";
import { getApiBase, resetApiBase } from "./apiBase";
import { fetchWithPolicy, PolicyOptions } from "./fetchPolicy";
import { govdeCoz } from "./govdeCoz";

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

/**
 * YANITIN `.json()`i FIRLATMAZ — 170 ÇAĞRI YERİNİ TEK NOKTADAN KORUR.
 *
 * ⚠️ ÖLÇÜLDÜ: uygulamada 49 dosyada 170 doğrudan `.json()` çağrısı var;
 * güvenli sarmalayıcı `apiJson` yalnızca 5 dosyada kullanılıyor. Yani
 * "ortak katmana taşındı" diyen yorum yazıldı ama GÖÇ HİÇ YAPILMADI.
 *
 * Sunucu JSON döndürmediğinde (Render 502/504 HTML sayfası, askıya alınmış
 * serviste 503 + "Service Suspended" HTML, soğuk kapta boş gövde) o 170
 * noktanın hepsi FIRLATIYOR ve sessiz bir `catch`e düşüyor: ekran boş kalıyor,
 * kullanıcı sebebini hiçbir yerde göremiyor.
 *
 * ⚠️ ÇAĞIRANLARIN DESENİ BU DÜZELTMEYİ GÜVENLİ KILIYOR — ölçüldü: baskın
 * kalıp `const j = await r.json(); if (!j?.ok) { … }`, yani zaten `ok` alanı
 * taşıyan bir NESNE bekleniyor. Fırlatma yerine `{ ok:false, error:… }`
 * dönmek o dalı ÇALIŞTIRIR ve `lib/hataMesaji.ts` sözlüğü (BAD_JSON /
 * EMPTY_RESPONSE zaten yazılı) doğru cümleyi gösterir. Tek satır kod
 * değişmeden 170 ekran kazanıyor.
 *
 * ⚠️ GÖVDE BİR KEZ OKUNUR. `text()` ve `json()` aynı önbelleklenmiş metinden
 * beslenir; yoksa ikisini birden çağıran bir ekran (predict.tsx, gs1987-verify,
 * competition-kings) "body already read" hatası alırdı.
 *
 * Durum kodu ve başlıklar DEĞİŞMEZ: `res.ok` / `res.status` okuyanlar
 * etkilenmez.
 */
function govdeyiGuvenliYap(res: Response): Response {
  const hamText = res.text.bind(res);
  let metinSozu: Promise<string> | null = null;
  const metin = () => (metinSozu ||= hamText().catch(() => ""));

  (res as any).text = metin;
  (res as any).json = async () => govdeCoz(await metin());
  return res;
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const res = await istekYap(path, opts, false);
  basarisizligiBildir(path, res);
  return govdeyiGuvenliYap(res);
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

/**
 * JSON bekleyen istekler için güvenli sarmalayıcı.
 *
 * ⚠️ NEDEN VAR: uygulamada 114 yerde doğrudan `(await apiFetch(...)).json()`
 * çağrılıyordu. Sunucu JSON DÖNDÜRMEYEBİLİR — Render 502/504 verdiğinde HTML
 * hata sayfası döner, soğuk kap açılırken gövde boş gelebilir. O durumda
 * `.json()` FIRLATIR; çağrı bir try/catch içinde değilse ekran çöker ya da
 * sessizce yarım kalır.
 *
 * Bu desen `live.tsx` içinde yerel olarak zaten çözülmüştü; tek ekranda kalması
 * diğer 113 çağrıyı korumasız bırakıyordu. Ortak katmana taşındı.
 *
 * Fırlatmaz: her zaman bir nesne döner. Ayrıştırılamayan yanıt
 * `{ ok:false, error:"BAD_JSON" }` olur — hataMesaji.ts bunu kullanıcıya
 * anlaşılır bir cümleyle çevirir.
 *
 * ⚠️ `ok` alanı SUNUCUNUN alanıdır, HTTP durumu değil. HTTP durumunu da
 * bilmen gerekiyorsa `apiFetch` kullanıp yanıtı kendin oku.
 */
export async function apiJson(path: string, opts: FetchOptions = {}): Promise<any> {
  let metin = "";
  try {
    const r = await apiFetch(path, opts);
    metin = await r.text();
  } catch (e: any) {
    // Ağ/zaman aşımı: apiFetch kendi politikasını uyguladı ve yine de başarısız.
    return { ok: false, error: "NETWORK", detail: String(e?.message || e) };
  }
  // Ayrıştırma TEK KAYNAKTAN: lib/govdeCoz.ts. İki ayrı kopya tutmak, biri
  // düzeltilip öteki unutulduğunda sessizce ayrışırdı.
  return govdeCoz(metin);
}
