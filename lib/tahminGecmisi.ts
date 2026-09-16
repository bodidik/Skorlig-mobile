/**
 * TAHMİN GEÇMİŞİ — profil ekranının sıra bağımlı hesapları.
 *
 * ⚠️ SIRA SÖZLEŞMESİ: `/api/rt/pred/history` öğeleri `computedAt` ARTAN
 * (en eski önce) döndürüyor; limit aşılınca EN YENİ N maç seçiliyor
 * (api/lib/match-results.cjs `kullaniciGecmisi`, devir 5u). Buradaki her
 * hesap bu sıraya dayanıyor:
 *   - `currentStreak` diziyi SONDAN sayar → son öğe en yeni maç olmalı.
 *   - `sonTahminler` en yeniyi ÜSTE koyar.
 *
 * ⚠️ NEDEN AYRI DOSYA (2026-09-16, üretimde ölçüldü): "Son Tahminler" listesi
 * `history.slice(0, 15)` idi, yani artan dizinin İLK 15'i — en ESKİ 15 maç.
 * 1764 kullanıcının 1731'inde 15'ten fazla kayıt var; başlık "son" derken
 * neredeyse herkese ilk maçları gösteriyordu. Ekran içindeki fonksiyonlar
 * sınanamıyordu, sıra da bu yüzden hiç ölçülmemişti.
 */

type SonucluOge = { detail?: { outcome?: number } | null };

export function winRate(items: SonucluOge[]): number | null {
  if (!items.length) return null;
  const correct = items.filter(i => (i.detail?.outcome ?? 0) > 0).length;
  return Math.round((correct / items.length) * 100);
}

/** Güncel seri: EN YENİ maçtan geriye, ilk bilinmeyen/yanlışa kadar. */
export function currentStreak(items: SonucluOge[]): number {
  let streak = 0;
  for (const it of [...items].reverse()) {
    if ((it.detail?.outcome ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

export function bestStreak(items: SonucluOge[]): number {
  let best = 0, cur = 0;
  for (const it of items) {
    if ((it.detail?.outcome ?? 0) > 0) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

/** "Son Tahminler": artan diziden en yeni `adet` maç, EN YENİ ÜSTTE. Girdiyi bozmaz. */
export function sonTahminler<T>(items: T[], adet = 15): T[] {
  if (adet <= 0) return [];
  return items.slice(-adet).reverse();
}
