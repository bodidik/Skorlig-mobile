/**
 * GÜNCELLEME DURUMU — cihaz tarafı (karar mantığı saf: lib/surum.ts).
 *
 * Kullanıcı (2026-10-16): "güncelleme gelince test kullanıcılarımıza mesaj
 * gitmiyor — ilk ekranda hemen güncelle seçeneği verilsin, her açılışta."
 *
 *   · `denetle()` /api/config'i ÖNBELLEKSİZ sorar; açılışta VE uygulama her
 *     ön plana döndüğünde çağrılır (Android süreci arka planda yaşar, "açılış"
 *     çoğu zaman soğuk başlatma değildir).
 *   · Sonuç modül düzeyinde tutulur; `useGuncelleme()` ana ekran şeridini
 *     besler — "Sonra" denince uyarı kapanır ama şerit kalır.
 */
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import * as Application from "expo-application";
import { apiFetch } from "./apiFetch";
import { PLAY_ADRESI, PLAY_WEB, kodCoz, surumCoz, surumKarari, type SurumBilgisi, type SurumKarari } from "./surum";

/** Cihazdaki derlemenin Android versionCode'u (EAS remote sürümlemesi: app.json'da YOK). */
export function yerelSurumKodu(): number {
  return kodCoz(Application.nativeBuildVersion);
}

export type GuncellemeDurumu = { karar: SurumKarari; bilgi: SurumBilgisi | null; yerel: number };

let _durum: GuncellemeDurumu = { karar: "yok", bilgi: null, yerel: 0 };
const _dinleyiciler = new Set<(d: GuncellemeDurumu) => void>();

export async function denetle(): Promise<GuncellemeDurumu> {
  try {
    const r = await apiFetch("/api/config", { cacheMs: 0 });
    const bilgi = surumCoz(await r.json());
    const yerel = yerelSurumKodu();
    _durum = { karar: surumKarari(yerel, bilgi), bilgi, yerel };
    _dinleyiciler.forEach((f) => f(_durum));
  } catch { /* ağ yoksa son bilinen durum kalır */ }
  return _durum;
}

export function guncellemeyiAc(): void {
  Linking.openURL(PLAY_ADRESI).catch(() => Linking.openURL(PLAY_WEB).catch(() => {}));
}

export function useGuncelleme(): GuncellemeDurumu {
  const [d, setD] = useState(_durum);
  useEffect(() => {
    _dinleyiciler.add(setD);
    setD(_durum);
    return () => { _dinleyiciler.delete(setD); };
  }, []);
  return d;
}
