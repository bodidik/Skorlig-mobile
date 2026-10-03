/**
 * BİRİKİM — puan ve LC'nin "gözle görülür" artışı (2026-10-03).
 *
 * Kullanıcı: "10 puan varsa alınan 0.7 puanı önce 0.7 olarak, sonra üzerine
 * ekleyip 11.7'yi görselli ekleyelim... birikim gözle görünsün."
 *
 * Saf mantık burada (Node altında test edilir), çizim components/BirikimKarti.
 *
 * ⚠️ LC İÇİN SİKKE YIĞINI YOK — kullanıcı kararı (2026-10-03): tek sikke +
 * sayaç. components/LcSikke.tsx başlığındaki IARC kararı ("yığın/pırıltı
 * yok") korundu; yığın seçeneği sunuldu ve seçilmedi.
 *
 * ⚠️ "SON GÖRÜLEN" CİHAZDA tutulur, sunucuda değil: soru "bu kullanıcı bu
 * ekranda en son neyi GÖRDÜ" — sunucunun bilemeyeceği bir şey. Bedeli:
 * ikinci cihazda aynı artış bir kez daha oynar. Kabul edilebilir.
 *
 * ⚠️ YALNIZ ARTIŞ CANLANIR. Harcama (LC düşüşü) ve ilk açılış sessizce
 * güncellenir — ilk açılışta 0'dan 1987'ye sayan bir sayaç "kazandın" demek
 * olurdu, yalan.
 */

export type Birikim = { puan: number; lc: number };

/** Kayan nokta artığını at: 11.7 - 10 = 1.6999999999999993 → 1.7 */
export function yuvarla(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Fark = {
  /** Canlandırılacak mı? İlk açılışta ve artış yoksa false. */
  canlandir: boolean;
  puanArti: number;
  lcArti: number;
  /** Saklanacak yeni "son görülen". */
  yeni: Birikim;
};

export function farkHesapla(onceki: Birikim | null, puan: number, lc: number): Fark {
  const yeni = { puan: yuvarla(Number(puan) || 0), lc: yuvarla(Number(lc) || 0) };
  if (!onceki) return { canlandir: false, puanArti: 0, lcArti: 0, yeni };
  const puanArti = Math.max(0, yuvarla(yeni.puan - onceki.puan));
  const lcArti = Math.max(0, yuvarla(yeni.lc - onceki.lc));
  return { canlandir: puanArti > 0 || lcArti > 0, puanArti, lcArti, yeni };
}

/** Depodan okunan ham değeri doğrular; bozuksa null (= ilk açılış). */
export function birikimCoz(ham: string | null): Birikim | null {
  if (!ham) return null;
  try {
    const o = JSON.parse(ham);
    if (o && Number.isFinite(o.puan) && Number.isFinite(o.lc)) return { puan: o.puan, lc: o.lc };
  } catch { /* bozuk kayıt → ilk açılış gibi davran */ }
  return null;
}

export const birikimAnahtari = (userId: string) => `skorlig:birikim:v1:${userId}`;
