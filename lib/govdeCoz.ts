/**
 * YANIT GÖVDESİ → NESNE. Tek kaynak, saf fonksiyon, Node altında sınanabilir.
 *
 * ⚠️ NEDEN AYRI DOSYA: `lib/apiFetch.ts` firebase ve react-native içe
 * aktarıyor, yani Node altında yüklenemiyor. Ayrıştırma mantığı orada
 * kaldığı sürece yalnızca uygulamayı çalıştırarak sınanabiliyordu.
 *
 * ⚠️ NEDEN VAR: sunucu her zaman JSON DÖNDÜRMEZ.
 *   • Render 502/504 → HTML hata sayfası
 *   • Render'da askıya alınmış servis → 503 + "Service Suspended" HTML
 *   • soğuk kap açılırken → boş gövde
 *
 * O durumda `res.json()` FIRLATIR. Uygulamada 170 yerde doğrudan
 * `(await apiFetch(...)).json()` çağrılıyor ve çağıranların ezici çoğunluğu
 * `const j = await r.json(); if (!j?.ok) { … }` yazıyor — yani `ok` alanı
 * taşıyan bir NESNE bekliyor. Fırlatma o dalı hiç çalıştırmıyor; istek
 * sessiz bir `catch`e düşüyor ve ekran BOŞ kalıyor. Kullanıcı "uygulama boş"
 * görüyor, sebebini hiçbir yerde göremiyor.
 *
 * Bu fonksiyon fırlatmaz: her zaman bir nesne döner. Dönen hata kodları
 * `lib/hataMesaji.ts` sözlüğünde zaten karşılanıyor, yani mevcut ekranlar
 * ek bir değişiklik olmadan doğru cümleyi gösterir.
 */

export type GovdeHatasi = { ok: false; error: "EMPTY_RESPONSE" | "BAD_JSON"; detail?: string };

/** Hata ayıklarken gövdenin başı yeter; tamamı loga taşınırsa gürültü olur. */
const DETAY_UZUNLUK = 240;

export function govdeCoz(metin: unknown): any {
  const m = typeof metin === "string" ? metin : "";
  /* ⚠️ `trim()` ŞART: soğuk kaptan gelen gövde çoğu zaman boş değil, tek bir
   * satır sonu oluyor. Ham uzunluğa bakan bir denetim onu "dolu" sayıp
   * JSON.parse'a gönderir ve EMPTY_RESPONSE yerine BAD_JSON raporlar —
   * kullanıcıya gösterilen cümle yanlış olur. */
  if (!m.trim()) return { ok: false, error: "EMPTY_RESPONSE" } satisfies GovdeHatasi;
  try {
    const j = JSON.parse(m);
    /* ⚠️ JSON.parse "null", "3", "\"metin\"" gibi SKALER değerleri de kabul
     * eder. Çağıranlar `j?.ok` okuyor; skaler dönersek `undefined` çıkar ve
     * ekran "başarısız ama sebepsiz" duruma düşer (hataMesaji yedek cümleye,
     * "Bir şeyler ters gitti"ye iner).
     *
     * ⚠️ DİZİLER GEÇER, reddedilmez. Onlar da `ok` alanı taşımıyor ama
     * GEÇERLİ bir JSON yükü; bu fonksiyonun işi JSON OLMAYAN gövdeyi
     * yakalamak, sunucunun yük ŞEKLİNİ denetlemek değil. Ölçüldü: bugün
     * hiçbir uç çıplak dizi döndürmüyor (`res.json([` → 0 eşleşme), yani
     * seçim kullanıcıyı etkilemiyor; daha az müdahaleci olan seçildi ki
     * ileride dizi dönen bir uç eklenirse sessizce kırılmasın. */
    if (j === null || typeof j !== "object") {
      return { ok: false, error: "BAD_JSON", detail: m.slice(0, DETAY_UZUNLUK) } satisfies GovdeHatasi;
    }
    return j;
  } catch {
    return { ok: false, error: "BAD_JSON", detail: m.slice(0, DETAY_UZUNLUK) } satisfies GovdeHatasi;
  }
}

export default govdeCoz;
