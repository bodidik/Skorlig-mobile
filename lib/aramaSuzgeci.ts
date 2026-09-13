import { trNormal } from "./metinNormal.ts";

/**
 * LİSTE ARAMASI — TAKIM VE KULLANICI ADI. Saf, yaprak, sınanabilir.
 *
 * ⚠️ KULLANICI KARARI (2026-09-13): "3 harf yazınca öneriler vermeye başlasın."
 * Eşik `EN_AZ_HARF`te tek kaynakta; üç yüzey (canlı maçlar, tahmin listesi,
 * başarı listesi) aynı sayıyı ayrı ayrı yazsaydı biri değiştiğinde ötekiler
 * sessizce ayrışırdı.
 *
 * ⚠️ "HENÜZ KISA" İLE "SONUÇ YOK" AYRI DURUMLAR. İkisini de boş liste diye
 * döndürmek ekranı "bulunamadı" demeye zorlar — kullanıcı iki harf yazmışken
 * aradığının olmadığını sanır ve vazgeçer. Bu deponun kayıtlı
 * "değerlendiremedim ile olumsuz karışıyor" sınıfı; `durum` alanı onu ayırıyor.
 *
 * ⚠️ BAŞTAN EŞLEŞEN ÖNCE. "gal" yazan kişi Galatasaray'ı arıyor, "Portugal"i
 * değil. `includes` tek başına sıralamayı alfabeye bırakır ve aranan takım
 * listenin altında kalır — `countrySort.ts` aynı kusuru ülke listesinde
 * ölçmüştü, aynı kural buraya taşındı.
 *
 * ⚠️ ARANAN ALANLAR ÇAĞIRANDAN GELİYOR. Fikstürde ev/deplasman, sıralamada
 * görünen ad ve kimlik aranıyor. Modül alan adı bilmiyor: bilseydi her yeni
 * yüzey burayı değiştirmek zorunda kalırdı.
 */

/** Sunucuya ya da süzgece gitmeden önce istenen en az harf sayısı. */
export const EN_AZ_HARF = 3;

export type AramaDurumu = "bos" | "kisa" | "sonuc" | "bulunamadi";

export type AramaCiktisi<T> = {
  durum: AramaDurumu;
  items: T[];
  /** Süzgeçten geçen öge sayısı — ekran "12 sonuç" yazabilsin diye. */
  sayi: number;
};

/**
 * Terim metinde geçiyor mu (Türkçe-duyarsız).
 * Boş terim HER ŞEYLE eşleşir — çağıran zaten eşiği aşmadan buraya gelmiyor,
 * ama `true` döndürmek "boş arama her şeyi gösterir" beklentisiyle uyumlu.
 */
export function eslesiyorMu(metin: string | null | undefined, terim: string): boolean {
  const t = trNormal(terim);
  if (!t) return true;
  return trNormal(metin).includes(t);
}

/**
 * Bir ögenin eşleşme kalitesi: 0 = eşleşmiyor, 1 = ortada geçiyor,
 * 2 = bir kelimenin başında, 3 = alanın en başında.
 *
 * ⚠️ KELİME BAŞI AYRI BİR BASAMAK: "sar" yazınca "Sarıyer" (alan başı) ile
 * "Fatih Karagümrük Sarıyer" (kelime başı) ikisi de üste gelmeli, ama
 * "Basaksehir" (hiç) gelmemeli. Yalnızca `startsWith` kullanmak ikinci
 * takımı listenin dibine atardı.
 */
export function eslesmeSkoru(metin: string | null | undefined, terim: string): number {
  const t = trNormal(terim);
  if (!t) return 1;
  const m = trNormal(metin);
  if (!m.includes(t)) return 0;
  if (m.startsWith(t)) return 3;
  /* Kelime sınırını ELLE kuruyoruz: JS sınır işareti ASCII'ye göre çalışıyor
   * ve Türkçe harfleri sınır sanıyor (deponun kayıtlı tuzağı). Normalleştirme
   * zaten ASCII'ye indirdiği için boşluk/tire aramak yeterli ve kesin. */
  for (const ayrac of [" ", "-", ".", "/"]) {
    if (m.includes(ayrac + t)) return 2;
  }
  return 1;
}

/**
 * Listeyi süzer ve eşleşme kalitesine göre sıralar.
 *
 * @param liste   süzülecek ögeler
 * @param terim   kullanıcının yazdığı metin
 * @param alanlar her öge için aranacak metinleri veren fonksiyon
 *
 * ⚠️ SIRALAMA KARARLI: eşit skorlu ögeler GİRDİ SIRASINI koruyor. Listenin
 * kendi sırası anlam taşıyor (maçlar saate göre, sıralama puana göre);
 * arama onu skor eşitken bozmamalı.
 */
export function suz<T>(
  liste: readonly T[],
  terim: string,
  alanlar: (it: T) => (string | null | undefined)[]
): AramaCiktisi<T> {
  const t = String(terim || "").trim();
  if (!t) return { durum: "bos", items: [...liste], sayi: liste.length };
  if (trNormal(t).length < EN_AZ_HARF) return { durum: "kisa", items: [], sayi: 0 };

  const puanli: { it: T; skor: number; sira: number }[] = [];
  liste.forEach((it, sira) => {
    let enIyi = 0;
    for (const alan of alanlar(it)) {
      const s = eslesmeSkoru(alan, t);
      if (s > enIyi) enIyi = s;
    }
    if (enIyi > 0) puanli.push({ it, skor: enIyi, sira });
  });

  puanli.sort((a, b) => (b.skor - a.skor) || (a.sira - b.sira));
  const items = puanli.map((x) => x.it);
  return { durum: items.length ? "sonuc" : "bulunamadi", items, sayi: items.length };
}

/**
 * Yazarken gösterilecek öneri etiketleri — tekrarsız, en fazla `enFazla`.
 *
 * ⚠️ TEKRARSIZLIK GÖRÜNEN METNE GÖRE, ÖGEYE GÖRE DEĞİL. Aynı takım birden
 * çok maçta geçiyor; öneri listesinde "Galatasaray"ı üç kez göstermek
 * kullanıcıya seçenek değil gürültü verir.
 */
export function oneriler<T>(
  liste: readonly T[],
  terim: string,
  etiketler: (it: T) => (string | null | undefined)[],
  enFazla = 6
): string[] {
  const t = String(terim || "").trim();
  if (trNormal(t).length < EN_AZ_HARF) return [];

  const gorulen = new Set<string>();
  const puanli: { etiket: string; skor: number }[] = [];
  for (const it of liste) {
    for (const ham of etiketler(it)) {
      const etiket = String(ham ?? "").trim();
      if (!etiket) continue;
      const anahtar = trNormal(etiket);
      if (gorulen.has(anahtar)) continue;
      const skor = eslesmeSkoru(etiket, t);
      if (skor > 0) { gorulen.add(anahtar); puanli.push({ etiket, skor }); }
    }
  }
  puanli.sort((a, b) => b.skor - a.skor);
  return puanli.slice(0, enFazla).map((x) => x.etiket);
}
