/**
 * GÜNCELLEME TEKLİFİ — SAF karar (Expo/RN içe aktarımı YOK, Node testleri yükler).
 *
 * Sunucu `GET /api/config` → `surum` bloğunda Play'deki son versionCode'u
 * bildirir (env: SKORLIG_SON_SURUM_KODU). Uygulama kendi kodu daha küçükse
 * teklif eder. Kodlar okunamazsa (0/NaN) HİÇBİR ŞEY yapılmaz — bilinmeyen
 * sürüme "güncelle" demek, güncel kullanıcıyı boşuna mağazaya yollamak olur.
 *
 * ⚠️ CİHAZIN KENDİ KODU `lib/guncelleme.ts`te okunur (expo-application).
 * 1–16 Eki 2026 arası burada `Constants.nativeBuildVersion` okunuyordu; o alan
 * Expo 54'ün expo-constants'ında YOK → hep 0 → karar hep "yok": teklif hiçbir
 * cihazda bir kez bile çıkmadı. Nöbetçi: tests/surum.test.ts.
 */
export type SurumBilgisi = { sonKod: number; enAzKod: number; notlar: string | null };
export type SurumKarari = "yok" | "teklif" | "zorunlu";

export const PLAY_ADRESI = "market://details?id=com.skorlig";
export const PLAY_WEB = "https://play.google.com/store/apps/details?id=com.skorlig";

/** Yerel sürüm kodunu (string | number | null) pozitif tamsayıya çevirir; okunamazsa 0. */
export function kodCoz(ham: unknown): number {
  const n = Number(ham);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function surumCoz(yanit: unknown): SurumBilgisi | null {
  const s = (yanit as { surum?: Record<string, unknown> } | null | undefined)?.surum;
  if (!s) return null;
  const sonKod = Number(s.sonKod) || 0;
  if (sonKod <= 0) return null;
  return {
    sonKod,
    enAzKod: Number(s.enAzKod) || 0,
    notlar: typeof s.notlar === "string" && s.notlar.trim() ? s.notlar.trim() : null,
  };
}

export function surumKarari(yerel: number, b: SurumBilgisi | null): SurumKarari {
  if (!b || !(yerel > 0)) return "yok";
  if (b.enAzKod > 0 && yerel < b.enAzKod) return "zorunlu";
  if (yerel < b.sonKod) return "teklif";
  return "yok";
}
