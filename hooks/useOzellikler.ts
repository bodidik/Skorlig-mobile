import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { OZELLIK_VARSAYILAN, ozellikleriCoz, type Ozellikler } from "../lib/ozellikler";

/**
 * ÖZELLİK BAYRAKLARI — uygulama oturumu boyunca TEK istek.
 *
 * Kurallar `lib/ozellikler.ts`te (saf, testli). Burada yalnızca yükleme ve
 * abonelik var: ilk kullanan ekran isteği başlatır, ötekiler aynı sözü
 * bekler. Yanıt gelene kadar ve istek düşerse değer GİZLİ kalır; düşen istek
 * bir sonraki kullanımda yeniden denenir.
 */

let deger: Ozellikler = OZELLIK_VARSAYILAN;
let yukleniyor: Promise<void> | null = null;
const dinleyiciler = new Set<(o: Ozellikler) => void>();

export function ozellikleriYukle(): Promise<void> {
  if (yukleniyor) return yukleniyor;
  yukleniyor = (async () => {
    try {
      const r = await apiFetch("/api/config");
      deger = ozellikleriCoz(await r.json());
      dinleyiciler.forEach((f) => f(deger));
    } catch {
      // Gizli kalır; sözü bırak ki bir sonraki ekran yeniden denesin.
      yukleniyor = null;
    }
  })();
  return yukleniyor;
}

/** Bileşen dışı okuma (bildirim yönlendirmesi gibi): o anki değer. */
export function ozellikAnlik(): Ozellikler {
  return deger;
}

export function useOzellikler(): Ozellikler {
  const [o, setO] = useState<Ozellikler>(deger);
  useEffect(() => {
    dinleyiciler.add(setO);
    // İlk çizim ile abonelik arasında değer gelmiş olabilir.
    if (o !== deger) setO(deger);
    ozellikleriYukle();
    return () => { dinleyiciler.delete(setO); };
  }, []);
  return o;
}
