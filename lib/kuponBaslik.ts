/**
 * KUPON BAŞLIĞI — İKİ EKRAN İÇİN TEK KAYNAK.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, kupon.tsx:193 ve
 * KuponKarti.tsx:110): sunucu ÜÇ tür kupon gönderiyor —
 * `ulke`, `avrupa`, `ortak` (api/lib/kupon.cjs:37) — istemci tipi ise
 * `"ulke" | "avrupa"` diyordu. Başlık tek bir üçlü ifadeyle kuruluyordu:
 *
 *     k.tur === "avrupa" ? t("kuponEurope") : t("kuponCountryLeague", { c: ulkeAdi(k.ulke) })
 *
 * TR40'ta açılan kupon `{ tur:"ortak", ulke:null }`. "avrupa" olmadığı için
 * ülke dalına düşüyor, `ulkeAdi(null)` boş dize dönüyor.
 *
 * ÖLÇÜLDÜ (gerçek i18n.ts ve gerçek ulkeler.ts sürülerek):
 *     tur=ortak   -> "⚽  Ligi"          / "⚽  League"     ← ADSIZ
 *     tur=ulke    -> "⚽ Türkiye Ligi"   / "⚽ Turkey League"
 *     tur=avrupa  -> "🏆 Avrupa Haftası" / "🏆 Europe Week"
 *     ulkeAdi(null) = ""
 *
 * Yani uygulamanın TR40'taki TEK ve birincil haftalık oyunu, hem ana ekran
 * kartında hem kupon ekranında adsız görünüyordu. Üstelik "tüm ülkeler aynı
 * tabloda" açıklaması da `tur === "avrupa"` koşuluna bağlı olduğu için
 * ORTAK kuponda hiç yazmıyordu — oysa o cümle tam olarak ORTAK'ı anlatıyor.
 *
 * ⚠️ İKİ KOPYA VARDI VE BİRİ KOPYA OLDUĞUNU BİLİYORDU. KuponKarti.tsx'in
 * kendi notu "Başlık app/kupon.tsx ile AYNI anahtardan — iki yüzey aynı
 * kuponu farklı adlandırırsa kullanıcı iki ayrı oyun sanır" diyor; niyet tek
 * kaynaktı, gerçek kopyaydı ve ikisi birlikte bozuldu.
 *
 * ⚠️ BİLİNMEYEN TÜR DE ADSIZ KALMIYOR. Eski kod "avrupa değilse ülke" diye
 * varsayıyordu; sunucu yarın dördüncü bir tür eklerse aynı kusur aynen geri
 * gelirdi. Artık ülke adı GERÇEKTEN varsa ülke başlığı kuruluyor, aksi
 * hâlde ülkesiz genel başlık. Kusurun sınıfı böyle kapanıyor.
 *
 * ⚠️ `t` VE `ulkeAdi` DIŞARIDAN VERİLİYOR. `lib/ulkeler.ts` uzantısız
 * `from "./i18n"` içe aktarımı yüzünden Node altında yüklenemiyor ve depo
 * kuralı uzantılı biçimi yalnızca `tests/` altına ayırıyor (bkz.
 * tsconfig.json notu). Bağımlılığı çağırana bırakmak modülü sınanabilir
 * tutuyor — aynı gerekçe `lib/friendSearch.ts` ve `lib/fetchPolicy.ts` için
 * de yazılı.
 */

export type KuponTur = "ulke" | "avrupa" | "ortak";

/** `t()` ile aynı imza. */
export type Sozluk = (anahtar: string, param?: Record<string, any>) => string;

export type KuponBasi = { tur?: string | null; ulke?: string | null };

/** Kupon kartının/ekranının başlığı. */
export function kuponBasligi(
  k: KuponBasi | null | undefined,
  t: Sozluk,
  ulkeAdi: (ham?: string | null) => string
): string {
  const tur = String(k?.tur || "");
  if (tur === "avrupa") return t("kuponEurope");
  if (tur === "ortak") return t("kuponOrtak");
  if (tur === "ulke") {
    const ad = String(ulkeAdi(k?.ulke ?? null) || "").trim();
    if (ad) return t("kuponCountryLeague", { c: ad });
  }
  /**
   * ⚠️ BİLİNMEYEN TÜR ORTAK'IN ADINI ÇALMIYOR. İlk sürümde yedek dal
   * `kuponOrtak` dönüyordu; sunucu yarın dördüncü bir tür eklerse o tür
   * ekranda "Türkiye Haftası" diye YANLIŞ adlandırılırdı — adsız kalmaktan
   * daha kötüsü, yanlış ad. Yedek, ekranın kendi genel başlığı.
   *
   * Aynı dal ülke türünde ülke adı boş kaldığında da çalışıyor: kusurun
   * tam biçimi ("⚽  Ligi") böyle kapanıyor.
   */
  return t("weeklyKupon");
}

/**
 * Başlık satırının sonuna eklenen açıklama.
 *
 * ORTAK kuponun tanımı "ülkeye bakılmaz, herkes aynı kuponu oynar"
 * (api/lib/kupon.cjs:31-35) — kullanıcının bunu ekranda görmesi gerekiyor.
 */
export function kuponAltMetni(k: KuponBasi | null | undefined, t: Sozluk): string {
  const tur = String(k?.tur || "");
  if (tur === "avrupa") return t("allCountriesSame");
  if (tur === "ortak") return t("kuponOrtakSame");
  return "";
}

/**
 * Ana ekran kartının göstereceği kupon.
 *
 * ⚠️ SIRA AÇIK YAZILIYOR. Eski hâli `acik.find(k => k.tur === "ulke") || acik[0]`
 * idi; ORTAK kupon yalnızca YEDEK dala düşerek görünüyordu. TR40'ta liste tek
 * elemanlı olduğu için sonuç doğru çıkıyordu — yani kural yanlış, sonuç
 * tesadüfen doğruydu. İki tür birlikte dönseydi ülke kuponu ORTAK'ı gizlerdi.
 */
export function birincilKupon<T extends KuponBasi & { durum?: string }>(
  liste: readonly T[] | null | undefined
): T | null {
  const acik = (liste || []).filter((k) => k?.durum === "open");
  return (
    acik.find((k) => String(k?.tur) === "ortak") ||
    acik.find((k) => String(k?.tur) === "ulke") ||
    acik[0] ||
    null
  );
}
