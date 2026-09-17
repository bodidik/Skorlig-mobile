/**
 * KRALLAR ÖZETİ — ana ekrandaki "ilk 5" alanının saf hesabı.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "Ana ekranda kralların ilk 5 sırasını
 * gösteren bir alan da yapalım. İsteyen listeyi devamına tıklayarak krallar
 * kısmından devam edebilsin."
 *
 * ⚠️ SIRA KRALLAR SEKMESİYLE BİREBİR AYNI OLMALI. Kullanıcı "devamı"na basıp
 * Krallar'a geçtiğinde ilk 5 orada da aynı ilk 5 olmalı; yoksa iki ekran iki
 * ayrı tablo gösterir. Bu yüzden:
 *   · aynı uç: `/api/rt/totals` (Krallar `?limit=300`, burada `?limit=5` —
 *     sunucu SIRALADIKTAN sonra kesiyor, bkz. api routes/totals-read.cjs),
 *   · aynı bot kuralı: Krallar botları SÜZMÜYOR, burada da süzülmüyor
 *     (`?humans=1` eklenseydi iki ekranın 1. sırası farklı kişi olurdu),
 *   · aynı sıralama: `totalPoints` azalan, eşitlikte sunucu sırası (kararlı
 *     sıralama) ve sıra numarası `indeks + 1` — kings.tsx ile aynı ifade.
 */

export type KralSatiri = {
  userId: string;
  displayName?: string | null;
  totalPoints: number;
};

export type OzetSatiri = KralSatiri & { sira: number; ben: boolean };

export const OZET_ADEDI = 5;

/** Uç yolu — kings.tsx ile aynı uç, yalnız limit farklı. */
export const OZET_UCU = `/api/rt/totals?limit=${OZET_ADEDI}`;

export function ilkBes(items: KralSatiri[] | null | undefined, benUid?: string | null, adet = OZET_ADEDI): OzetSatiri[] {
  const ben = String(benUid || "").trim().toLowerCase();
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    .slice(0, adet)
    .map((it, i) => ({
      ...it,
      sira: i + 1,
      ben: !!ben && String(it.userId || "").trim().toLowerCase() === ben,
    }));
}

/**
 * Puan metni — Krallar sekmesiyle AYNI yuvarlama (kings.tsx `Math.round(row.totalPoints || 0)`).
 * Emülatörde görüldü: özet "142.5", sekme "143" yazıyordu — aynı kişi iki ekranda iki puan.
 */
export function ozetPuani(n: number | null | undefined): string {
  return String(Math.round(Number(n) || 0));
}

/** Sıra rozeti rengi: 1 altın, 2 gümüş, 3 bronz, diğerleri iç yüzey. */
export function siraRozeti(sira: number): { zemin: string; yazi: string } {
  if (sira === 1) return { zemin: "#fbbf24", yazi: "#020617" };
  if (sira === 2) return { zemin: "#cbd5e1", yazi: "#020617" };
  if (sira === 3) return { zemin: "#d97706", yazi: "#020617" };
  return { zemin: "#1d3b47", yazi: "#f8fafc" };
}
