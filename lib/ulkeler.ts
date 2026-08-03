/**
 * ÜLKE ADI VE BAYRAĞI — TEK KAYNAK.
 *
 * ⚠️ BU BİR ÇEVİRİ TABLOSU DEĞİL, GİRİŞ EŞLEME TABLOSUDUR.
 *
 * Sunucu ülke adını bazen İngilizce (Turkey), bazen Türkçe (Türkiye)
 * gönderiyor — kaynağa göre değişiyor. Eski hâlde livescores ekranındaki
 * bayrak haritası iki yazımı da bayrağa eşliyordu ve ekran ülke adını HAM
 * basıyordu. Sonuç: Japon kullanıcı ekranda Türkiye ya da Turkey görüyordu;
 * hangisini göreceği sunucunun o anki kaynağına bağlıydı.
 *
 * ⚠️ ALIAS LİSTESİ t() ANAHTARINA ÇEVRİLEMEZ. Eşleşmesi gereken şey
 * KULLANICININ DİLİ değil SUNUCUNUN GÖNDERDİĞİ metindir; anahtara çevirmek
 * aramayı kırar ve bayrak yedek sembole düşer. Doğru katmanlama:
 *     ham ad --(alias)--> kanonik anahtar --(t)--> gösterilecek ad
 *
 * Bilinmeyen ülke HAM adıyla gösterilir: yanlış çeviri yerine gerçek veri.
 */
import { t } from "./i18n";

type Ulke = { k: string; bayrak: string; adlar: string[] };

const ULKELER: Ulke[] = [
  { k: "ulke_turkey", bayrak: "🇹🇷", adlar: ["Turkey", "Türkiye"] },
  { k: "ulke_england", bayrak: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", adlar: ["England", "İngiltere"] },
  { k: "ulke_spain", bayrak: "🇪🇸", adlar: ["Spain", "İspanya"] },
  { k: "ulke_germany", bayrak: "🇩🇪", adlar: ["Germany", "Almanya"] },
  { k: "ulke_france", bayrak: "🇫🇷", adlar: ["France", "Fransa"] },
  { k: "ulke_italy", bayrak: "🇮🇹", adlar: ["Italy", "İtalya"] },
  { k: "ulke_netherlands", bayrak: "🇳🇱", adlar: ["Netherlands", "Hollanda"] },
  { k: "ulke_portugal", bayrak: "🇵🇹", adlar: ["Portugal", "Portekiz"] },
  { k: "ulke_belgium", bayrak: "🇧🇪", adlar: ["Belgium", "Belçika"] },
  { k: "ulke_scotland", bayrak: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", adlar: ["Scotland", "İskoçya"] },
  { k: "ulke_europe", bayrak: "🏆", adlar: ["Europe", "Avrupa"] },
  { k: "ulke_world", bayrak: "🌍", adlar: ["World", "Dünya"] },
  { k: "ulke_brazil", bayrak: "🇧🇷", adlar: ["Brazil", "Brezilya"] },
  { k: "ulke_argentina", bayrak: "🇦🇷", adlar: ["Argentina", "Arjantin"] },
  { k: "ulke_usa", bayrak: "🇺🇸", adlar: ["USA", "ABD", "United States"] },
  { k: "ulke_mexico", bayrak: "🇲🇽", adlar: ["Mexico", "Meksika"] },
  { k: "ulke_russia", bayrak: "🇷🇺", adlar: ["Russia", "Rusya"] },
  { k: "ulke_south_korea", bayrak: "🇰🇷", adlar: ["South Korea", "Güney Kore"] },
  { k: "ulke_japan", bayrak: "🇯🇵", adlar: ["Japan", "Japonya"] },
  { k: "ulke_china", bayrak: "🇨🇳", adlar: ["China", "Çin"] },
  { k: "ulke_greece", bayrak: "🇬🇷", adlar: ["Greece", "Yunanistan"] },
  { k: "ulke_croatia", bayrak: "🇭🇷", adlar: ["Croatia", "Hırvatistan"] },
  { k: "ulke_serbia", bayrak: "🇷🇸", adlar: ["Serbia", "Sırbistan"] },
  { k: "ulke_ukraine", bayrak: "🇺🇦", adlar: ["Ukraine", "Ukrayna"] },
  { k: "ulke_poland", bayrak: "🇵🇱", adlar: ["Poland", "Polonya"] },
  { k: "ulke_austria", bayrak: "🇦🇹", adlar: ["Austria", "Avusturya"] },
  { k: "ulke_switzerland", bayrak: "🇨🇭", adlar: ["Switzerland", "İsviçre"] },
  { k: "ulke_sweden", bayrak: "🇸🇪", adlar: ["Sweden", "İsveç"] },
  { k: "ulke_denmark", bayrak: "🇩🇰", adlar: ["Denmark", "Danimarka"] },
  { k: "ulke_norway", bayrak: "🇳🇴", adlar: ["Norway", "Norveç"] },
  { k: "ulke_romania", bayrak: "🇷🇴", adlar: ["Romania", "Romanya"] },
  { k: "ulke_hungary", bayrak: "🇭🇺", adlar: ["Hungary", "Macaristan"] },
  { k: "ulke_morocco", bayrak: "🇲🇦", adlar: ["Morocco", "Fas"] },
  { k: "ulke_egypt", bayrak: "🇪🇬", adlar: ["Egypt", "Mısır"] },
  { k: "ulke_saudi_arabia", bayrak: "🇸🇦", adlar: ["Saudi Arabia", "Suudi Arabistan"] },
  { k: "ulke_algeria", bayrak: "🇩🇿", adlar: ["Algeria", "Cezayir"] },
  { k: "ulke_nigeria", bayrak: "🇳🇬", adlar: ["Nigeria", "Nijerya"] },
  { k: "ulke_colombia", bayrak: "🇨🇴", adlar: ["Colombia", "Kolombiya"] },
  { k: "ulke_chile", bayrak: "🇨🇱", adlar: ["Chile"] },
  { k: "ulke_iran", bayrak: "🇮🇷", adlar: ["Iran", "İran"] },
  { k: "ulke_qatar", bayrak: "🇶🇦", adlar: ["Qatar", "Katar"] },
  { k: "ulke_israel", bayrak: "🇮🇱", adlar: ["Israel", "İsrail"] },
  { k: "ulke_australia", bayrak: "🇦🇺", adlar: ["Australia", "Avustralya"] },
  { k: "ulke_czechia", bayrak: "🇨🇿", adlar: ["Czechia", "Czech Republic"] },
  { k: "ulke_finland", bayrak: "🇫🇮", adlar: ["Finland", "Finlandiya"] },
  { k: "ulke_bulgaria", bayrak: "🇧🇬", adlar: ["Bulgaria", "Bulgaristan"] },
  { k: "ulke_ecuador", bayrak: "🇪🇨", adlar: ["Ecuador", "Ekvador"] },
  { k: "ulke_bolivia", bayrak: "🇧🇴", adlar: ["Bolivia", "Bolivya"] },
  { k: "ulke_paraguay", bayrak: "🇵🇾", adlar: ["Paraguay"] },
  { k: "ulke_estonia", bayrak: "🇪🇪", adlar: ["Estonia", "Estonya"] },
  { k: "ulke_canada", bayrak: "🇨🇦", adlar: ["Canada", "Kanada"] },
  { k: "ulke_uzbekistan", bayrak: "🇺🇿", adlar: ["Uzbekistan", "Özbekistan"] },
  { k: "ulke_new_zealand", bayrak: "🇳🇿", adlar: ["New Zealand", "Yeni Zelanda"] },
  { k: "ulke_mozambique", bayrak: "🇲🇿", adlar: ["Mozambique", "Mozambik"] },
  { k: "ulke_ireland", bayrak: "🇮🇪", adlar: ["Ireland", "İrlanda"] },
  { k: "ulke_northern_ireland", bayrak: "🇬🇧", adlar: ["Northern Ireland"] },
  { k: "ulke_south_america", bayrak: "🌎", adlar: ["South America", "Güney Amerika"] },
  { k: "ulke_asia", bayrak: "🌏", adlar: ["Asia", "Asya"] },
];

/** ham ad (herhangi bir yazım) -> kanonik anahtar */
const ANAHTAR = new Map<string, string>();
/** kanonik anahtar -> bayrak */
const BAYRAK = new Map<string, string>();
for (const u of ULKELER) {
  BAYRAK.set(u.k, u.bayrak);
  for (const ad of u.adlar) ANAHTAR.set(ad.toLocaleLowerCase("tr"), u.k);
}

/** Ham ülke adını kanonik anahtara çevirir; tanımadıysa null. */
export function ulkeAnahtari(ham?: string | null): string | null {
  const s = String(ham || "").trim();
  if (!s) return null;
  return ANAHTAR.get(s.toLocaleLowerCase("tr")) ?? null;
}

/** Kullanıcının dilinde ülke adı. Tanınmayan ülke HAM adıyla döner. */
export function ulkeAdi(ham?: string | null): string {
  const k = ulkeAnahtari(ham);
  return k ? t(k as any) : String(ham || "").trim();
}

/** Ülke bayrağı; tanınmıyorsa yedek sembol. */
export function ulkeBayragi(ham?: string | null): string {
  const k = ulkeAnahtari(ham);
  return (k && BAYRAK.get(k)) || "⚽";
}

/**
 * LİG ETİKETİ — "hangi 3. Lig?" sorusunu ortadan kaldırır.
 *
 * ⚠️ BULUNAN SORUN (2026-08-03, kullanıcı bildirimi + ölçüm): liste yalnızca
 * lig ADINI yazıyordu ve lig adları ülkeden bağımsız olarak tekrar ediyor.
 * Üretim fikstürlerinde ölçüldü (1944 maç, 298 lig+ülke çifti):
 *     32 lig adı BİRDEN FAZLA ülkede geçiyor
 *     "Premier Lig"  → 24 ülke
 *     "1. Lig"       → 18 ülke
 *     "2. Lig"       → 13 ülke
 *     "Serie A"      → İtalya, Brezilya, Ekvador
 *     "Championship" → İngiltere, İskoçya
 * Yani ekranda "3. Lig" yazınca kullanıcı hangi ülkenin ligi olduğunu
 * bilemiyordu.
 *
 * ÇÖZÜM: bayrak + ülke + lig. Ülke adı kullanıcının dilinde (`ulkeAdi`),
 * yani tek kaynak korunuyor.
 *
 * ⚠️ TEKRAR ETMEZ: lig adı ülkeyi zaten içeriyorsa ("Türkiye Kupası")
 * "Türkiye · Türkiye Kupası" yazmaz. Kıyaslama Türkçe küçük harfle yapılıyor —
 * `"İ".toLowerCase()` tuzağı bu depoda daha önce ısırdı.
 *
 * @example ligEtiketi("3. Lig", "Türkiye")  → "🇹🇷 Türkiye · 3. Lig"
 * @example ligEtiketi("Türkiye Kupası", "Türkiye") → "🇹🇷 Türkiye Kupası"
 * @example ligEtiketi("Şampiyonlar Ligi", "Europe") → "🏆 Avrupa · Şampiyonlar Ligi"
 * @example ligEtiketi("3. Lig", null) → "3. Lig"
 */
export function ligEtiketi(lig?: string | null, ulke?: string | null): string {
  const l = String(lig || "").trim();
  const anahtar = ulkeAnahtari(ulke);
  const ad = anahtar ? ulkeAdi(ulke) : "";
  const bayrak = anahtar ? ulkeBayragi(ulke) : "";

  if (!l) return ad ? `${bayrak} ${ad}`.trim() : "";
  if (!ad) return l;                       // ülke bilinmiyor: ham lig adı

  const kucuk = (s: string) => s.toLocaleLowerCase("tr");
  if (kucuk(l).includes(kucuk(ad))) return `${bayrak} ${l}`.trim();

  return `${bayrak} ${ad} · ${l}`.trim();
}

/**
 * Sıralama için lig anahtarı: aynı ülkenin ligleri bir arada kalsın.
 * Etiketin kendisiyle sıralamak bayrak emojisi yüzünden tuhaf sıra üretirdi.
 */
export function ligSiraAnahtari(lig?: string | null, ulke?: string | null): string {
  const ad = ulkeAnahtari(ulke) ? ulkeAdi(ulke) : "";
  return `${ad} ${String(lig || "").trim()}`.toLocaleLowerCase("tr");
}
