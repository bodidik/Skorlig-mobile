/**
 * TÜRKÇE METİN KARŞILAŞTIRMASI — TEK KAYNAK.
 *
 * ⚠️ NEDEN AYRI DOSYA: bu normalleştirici `lib/countrySort.ts` içinde ÖZEL
 * duruyordu ve oradaki yorum onu gerçek bir kusurla gerekçelendiriyor —
 * ülke adı "Türkiye" iken kullanıcı "tur" yazıyor, `ü !== u` olduğu için
 * Türk kullanıcı KENDİ ülkesini arayınca "sonuç yok" görüyordu. Takım ve
 * kullanıcı araması aynı işi istiyor; ikinci bir kopya yazmak bu deponun
 * "iki gerçeklik" sınıfının ta kendisi olurdu: biri `â`yı ekler, öteki
 * eklemez ve iki arama kutusu aynı harfe farklı cevap verir.
 *
 * ⚠️ İKİ TARAF DA AYNI KURALDAN GEÇMELİ. `toLocaleLowerCase("tr")` büyük
 * `I`yı `ı` yapar, `İ`yi `i`; ASCII katlaması sonra ikisini de `i`ye
 * indiriyor. Yalnız bir tarafa uygulamak "İSTANBUL" ile "istanbul"u
 * ayrıştırır — deponun kayıtlı "Türkçe katlama" tuzağı.
 *
 * ⚠️ YAPRAK MODÜL: hiçbir şey içe aktarmıyor, React Native bağımlılığı yok.
 * Node altında `--experimental-strip-types` ile yüklenip sınanabiliyor.
 */

const ASCIILESTIR: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  â: "a", î: "i", û: "u",
};

/**
 * Karşılaştırma için metni indirger: kırp · Türkçe küçült · aksanı düşür.
 *
 * Girdi `null`/`undefined` olabilir — çağıranların çoğu sunucudan gelen
 * isteğe bağlı alanlarla çalışıyor ve orada boş dize doğru cevap.
 */
export function trNormal(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (h) => ASCIILESTIR[h] || h);
}

/** Türkçe alfabetik sıralama karşılaştırıcısı. */
export function trKarsilastir(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });
}
