/**
 * ÇIKIŞ SÜRÜMÜNDE GİZLİ ÖZELLİKLER — saf mantık (JSX ve react-native YOK).
 *
 * ⚠️ KULLANICI KARARI (13 Eylül 2026): Düello ve Maç Havuzu Play Store çıkış
 * sürümünde gizli. Play'in IARC anketi "simüle edilmiş şans oyunu" soruyor;
 * ikisi de ödülü başkalarının koyduğu LC'den üretiyor ve PEGI tanımına
 * düşüyor. Sunucu tarafı ve gerekçe: `api/lib/ozellikler.cjs`.
 *
 * ⚠️ OKUNAMAZSA GİZLİ. Bayrak `GET /api/config` → `ozellikler` bloğundan
 * geliyor; yanıt gelmezse, bozuksa ya da alan yoksa iki özellik de KAPALI
 * sayılır. Mağaza sürümü sunucuya ulaşamadığı an düello göstermemeli —
 * derecelendirme beyanı uygulamanın kendisi hakkında.
 *
 * Yalnızca açık `true` açar: `"true"`, `1`, `"1"` açmaz. Sunucu boolean
 * gönderiyor; başka bir şey geliyorsa sözleşme bozulmuştur ve güvenli taraf
 * kapalıdır.
 */

/** `premium`: mağaza gerçekten satın alma tamamlayabiliyor mu (sunucu STORE_MODE). */
export type Ozellikler = { duello: boolean; havuz: boolean; premium: boolean };

export const OZELLIK_VARSAYILAN: Readonly<Ozellikler> = Object.freeze({ duello: false, havuz: false, premium: false });

export function ozellikleriCoz(yanit: unknown): Ozellikler {
  const o = (yanit as { ozellikler?: Record<string, unknown> } | null | undefined)?.ozellikler;
  return { duello: o?.duello === true, havuz: o?.havuz === true, premium: o?.premium === true };
}

/**
 * Oyun modu kartı görünsün mü. Yalnızca bayrağı olan modlar süzülür; geri
 * kalanı her zaman açık — yeni bir mod eklemek bu fonksiyonu değiştirmez.
 */
export function modAcikMi(key: string, o: Ozellikler): boolean {
  if (key === "duello") return o.duello;
  if (key === "havuz") return o.havuz;
  return true;
}

/**
 * Özel sekme çubuğu gizli sekmeyi atlasın mı.
 *
 * ⚠️ expo-router `href: null` sekmeyi KENDİ çubuğunda gizliyor, özel çubukta
 * DEĞİL: `href` seçeneklerden sökülüp yerine `tabBarItemStyle: {display:
 * "none"}` konuyor ve `components/TabBar.tsx` rotaları körlemesine
 * çiziyordu. Bu işaret okunmazsa `href: null` hiçbir şey gizlemez.
 */
export function sekmeGizliMi(options: unknown): boolean {
  const stil = (options as { tabBarItemStyle?: unknown } | null | undefined)?.tabBarItemStyle;
  return !!stil && typeof stil === "object" && (stil as { display?: unknown }).display === "none";
}

/**
 * Düello bildirimine dokununca nereye gidilsin.
 *
 * Düello kapalıyken de bildirim GELEBİLİR: özellik kapanmadan önce açılmış
 * düellolar maç bitince sonuçlanıyor ya da iade ediliyor ve sunucu bunu
 * bildiriyor. O zaman kapalı ekrana değil, parayı gösteren LC geçmişine git.
 */
export function duelloBildirimHedefi(o: Ozellikler): string {
  return o.duello ? "/(tabs)/arena" : "/lc-ledger";
}
