/**
 * Ülke listesi sıralama + arama önceliği.
 *
 * NEDEN AYRI: Onboarding (index.tsx) ve profil (me.tsx) aynı listeye bakıyor;
 * kural her iki yerde bozulunca sessizce farklı sıralar üretmek en kolayı.
 * Saf fonksiyon → gerçek cihaz gerekmeden test edilebilir.
 *
 * Kurallar (öncelikten daha düşüğe):
 *   1) Uygulama Türk kullanıcıya dönük — Türkiye/Türkİye her zaman en üstte.
 *   2) Arama girildiyse: ÖNCE arama teriminin BAŞTAN eşleştikleri, sonra
 *      ortada geçenler. "eng" → "England" | "en" → England ilk, Argentina
 *      sonra. `Array.includes` tek başına bunu üste itmez, "Argentina" da
 *      eşleşir ama alfabetik olarak önde çıkar.
 *   3) Türkçe alfabetik (tr yerelinde; "İ" ile "I" ayrı doğru sıralanır).
 *
 * Girdi/çıktı DAİMA aynı biçim — çağıran taraf `country`/`flag` alanlarını
 * kendi tipiyle geçirir, biz sadece sırayı belirleriz.
 */

/**
 * Liste alan adı sabit değil: onboarding {country}, profil {localName} kullanıyor.
 * Getter parametresiyle ikisine de aynı fonksiyondan hizmet veriliyor —
 * kural iki yerde ayrı yazılırsa sessizce farklı sıralar üretir.
 */
type Getter<T> = (it: T) => string;

const TR_ADLARI = new Set([
  "Türkiye", "Turkey", "Turkiye",
  "TR",              // profil ekranı ISO kodu kullanabiliyor
]);

/**
 * Türkçe harfleri ASCII karşılığına indirger.
 *
 * NEDEN ŞART (gerçek veriyle yakalandı): Ülke adı "Türkiye" ve kullanıcı
 * klavyeden en doğal haliyle "tur" yazıyor. `ü !== u` olduğu için baştan
 * eşleşme tutmuyordu ve Türk kullanıcı KENDİ ülkesini arayınca "sonuç yok"
 * görüyordu — hem de listenin en tepesinde dururken.
 *
 * Sıralama tarafında gerek yok (`localeCompare` sensitivity:"base" zaten
 * aksanı yok sayar); sorun yalnızca startsWith/includes karşılaştırmasında.
 */
const ASCIILESTIR: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  â: "a", î: "i", û: "u",
};

const norm = (s: string) =>
  (s || "")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (h) => ASCIILESTIR[h] || h);

function trCmp(a: string, b: string): number {
  return (a || "").localeCompare(b || "", "tr", { sensitivity: "base" });
}

/** Türkiye başta + tr-alfabetik. */
export function sortCountries<T>(list: T[], getName: Getter<T>): T[] {
  const isTR = (it: T) => TR_ADLARI.has((getName(it) || "").trim());
  const kopya = [...list];
  kopya.sort((a, b) => {
    const ta = isTR(a), tb = isTR(b);
    if (ta && !tb) return -1;
    if (tb && !ta) return 1;
    return trCmp(getName(a), getName(b));
  });
  return kopya;
}

/**
 * Arama terimine göre sıralı liste. Boş arama → sortCountries.
 * Öncelik:
 *   - Türkiye (Türk kullanıcı için sabit)
 *   - Baştan eşleşen (prefix)   ← "eng" yazınca England burada
 *   - Ortada eşleşen (contains) ← "en" yazsanız Argentina burada
 *   - Sıra içi: tr-alfabetik
 * Eşleşmeyen tamamen düşer.
 */
export function filterAndRankCountries<T>(
  list: T[],
  query: string,
  getName: Getter<T> = (it: any) => it?.country ?? ""
): T[] {
  const q = norm(query);
  if (!q) return sortCountries(list, getName);

  const isTR = (it: T) => TR_ADLARI.has((getName(it) || "").trim());
  type Sirali = { it: T; siniIf: 0 | 1 | 2 };
  const siralilar: Sirali[] = [];

  for (const it of list) {
    const ad = norm(getName(it));
    if (!ad) continue;

    if (isTR(it) && ad.includes(q)) {
      siralilar.push({ it, siniIf: 0 });
    } else if (ad.startsWith(q)) {
      siralilar.push({ it, siniIf: 1 });
    } else if (ad.includes(q)) {
      siralilar.push({ it, siniIf: 2 });
    }
  }

  siralilar.sort((a, b) => {
    if (a.siniIf !== b.siniIf) return a.siniIf - b.siniIf;
    return trCmp(getName(a.it), getName(b.it));
  });

  return siralilar.map((x) => x.it);
}
