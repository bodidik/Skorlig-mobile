/**
 * TANITIM ŞERİDİ — kart listesi ve seçim mantığı (JSX YOK).
 *
 * ⚠️ NEDEN AYRI DOSYA: mobil testler `node --experimental-strip-types` ile
 * koşuyor ve o **`.tsx` yükleyemiyor** (ERR_UNKNOWN_FILE_EXTENSION — bu depoda
 * kayıtlı test altyapısı tuzağı). Saf mantık `.ts`'te durursa nöbetçi onu
 * doğrudan çağırabilir; bileşen yalnız çizim yapar.
 */

export type Kart = { anahtar: string; yol: string; emoji: string };

/**
 * Tanıtılan özellikler. `anahtar` i18n'de `tanitim_<anahtar>` olarak aranır —
 * ikisi ayrışırsa ekranda ham anahtar görünür (`react_*` ile aynı tuzak),
 * koruma tests/tanitimSeridi.test.ts'te.
 *
 * `yol` GERÇEK bir ekrana çözülmeli; yanlış yol Expo Router'da "Unmatched
 * Route" basar (bu depoda ölçülmüş kusur, bkz. tests/rotaHedefleri).
 */
export const KARTLAR: Kart[] = [
  { anahtar: "kupon",   yol: "/kupon",        emoji: "🎟️" },
  { anahtar: "duello",  yol: "/(tabs)/arena", emoji: "⚔️" },
  { anahtar: "gruplar", yol: "/friends",      emoji: "👥" },
  { anahtar: "premium", yol: "/premium",      emoji: "⭐" },
];

/**
 * Tohumdan kart seçer. DETERMİNİSTİK: aynı maçta hep aynı kart görünür —
 * kendiliğinden dönen şerit, kullanıcı tabloyu izlerken gözü çeker; hedef
 * tam tersi ("rahatsız etmeyen" kısıtı). Maçtan maça değişir.
 */
export function kartSec(tohum: string | null | undefined, uzunluk: number): number {
  const s = String(tohum || "");
  if (!s || uzunluk <= 0) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % uzunluk;
}
