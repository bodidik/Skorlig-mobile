/**
 * GERİ SAYIM METNİ — TEK KAYNAK.
 *
 * ⚠️ İKİ KOPYA VARDI: `components/KuponKarti.tsx` ve `app/kupon.tsx` aynı
 * fonksiyonu ayrı ayrı taşıyordu ve İKİSİNİN DE yorumunda "AYNI kural"
 * yazıyordu — yani kopya olduğu biliniyordu, ama ayrışma engellenmiyordu.
 * Üçüncü bir tüketici (ana ekrandaki "şimdi" şeridi) eklenirken kopyayı
 * çoğaltmak yerine taban buraya çıkarıldı.
 *
 * ⚠️ `t` DIŞARIDAN VERİLİYOR, İÇE AKTARILMIYOR. `from "./i18n"` uzantısız
 * bir içe aktarım ve Node altında çözülmüyor; depo kuralı uzantılı biçimi
 * yalnızca `tests/` altına ayırıyor. Bağımlılığı çağırana bırakmak modülü
 * sınanabilir tutuyor — aynı gerekçe `lib/kuponBaslik.ts`,
 * `lib/friendSearch.ts` ve `lib/fetchPolicy.ts` başlıklarında da yazılı.
 */

/** `t()` ile aynı imza — `lib/kuponBaslik.ts` ile AYNI tip. */
export type Sozluk = (anahtar: string, param?: Record<string, any>) => string;

/**
 * Kalan saniyeyi okunur metne çevirir: "2 gün 3 sa", "2 sa 10 dk", "45 dk".
 *
 * ⚠️ DAVRANIŞ DEĞİŞMEDİ (bir sınır dışında): gün/saat/dakika kademeleri ve
 * i18n anahtarları (`daysHours` · `hoursMin` · `nMin` · `closedLower`)
 * birebir eski iki kopyadaki gibi.
 */
export function sureMetni(saniye: number, t: Sozluk): string {
  const sn = Math.floor(Number(saniye) || 0);
  if (sn <= 0) return t("closedLower");

  const g = Math.floor(sn / 86400);
  const s = Math.floor((sn % 86400) / 3600);
  const d = Math.floor((sn % 3600) / 60);

  if (g > 0) return t("daysHours", { g, s });
  if (s > 0) return t("hoursMin", { s, d });

  /* ⚠️ ASGARİ 1 DK — TEK DAVRANIŞ DEĞİŞİKLİĞİ. Eski iki kopyada bu sınır
   * YOKTU: 40 saniye kala "0 dk" yazıyordu ve kapanmış gibi okunuyordu.
   * "Kapandı" ayrı bir dal (yukarıda), o yüzden 0 burada yalnızca
   * yuvarlamadan gelebilir. */
  return t("nMin", { n: Math.max(1, d) });
}
