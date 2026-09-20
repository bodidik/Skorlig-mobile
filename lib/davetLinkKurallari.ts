/**
 * DAVET BAĞLANTISI KURALLARI — SAF ÇEKİRDEK.
 *
 * ⚠️ NEDEN AYRI DOSYA: `lib/share.ts` `react-native` ve `./apiBase` (o da
 * `expo-constants` + `react-native`) içe aktarıyor, yani Node altında
 * YÜKLENEMİYOR ve içindeki kurallar hiç ölçülemiyor. Aynı sebeple
 * `apiBaseKurallari.ts` de ayrılmıştı ve o başlıkta yazıyor: kurallar
 * ölçülemediği için İKİ KEZ üretimde kesintiye yol açmışlardı.
 *
 * Buraya YALNIZCA saf mantık girer: dize, URL, doğrulama. Bir `react-native`
 * içe aktarımı eklenirse dosya yine kapanır ve testler sessizce durur.
 */

/** İniş sayfasının tanıdığı hedefler — `api/routes/davet.cjs` HEDEFLER ile AYNI. */
export type DavetHedefi =
  | { y?: undefined }
  | { y: "predict"; m?: string }
  | { y: "race"; m: string }
  | { y: "duel"; d: string };

/** Davet kodu alfabesi — `api/routes/friends.cjs` ve `davet.cjs` ile AYNI. */
const KOD_DESENI = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * `https://<taban>/d/<KOD>?y=…` — paylaşılacak iniş sayfası bağlantısı.
 *
 * ⚠️ HEDEF ANAHTARI GÖNDERİLİR, YOL DEĞİL. Sunucu `y`yi kapalı bir listeden
 * çözüp uygulama içi yolu KENDİ yazıyor. Buradan yol göndermek, sunucuyu
 * istemcinin verdiği yola yönlendiren bir açık olurdu.
 *
 * ⚠️ KOD BİÇİMİ BURADA DA DENETLENİYOR. Sunucu zaten denetliyor; buradaki
 * denetim "kod alınamadı" ile "kod bozuk geldi" durumlarını aynı yere
 * (null → derin bağlantı yedeği) düşürmek için. Bozuk kodla kurulan bir
 * `/d/` bağlantısı alıcıda 404 gösterirdi — paylaşan bunu hiç görmez.
 *
 * @returns bağlantı, ya da kod/taban geçersizse null (çağıran yedeğe düşer)
 */
export function davetLinkiKur(
  taban: string | null | undefined,
  kod: string | null | undefined,
  hedef: DavetHedefi = {}
): string | null {
  const k = String(kod || "").trim().toUpperCase();
  if (!KOD_DESENI.test(k)) return null;

  const t = String(taban || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(t)) return null;

  const qs = new URLSearchParams();
  if (hedef.y) qs.set("y", hedef.y);
  if ("m" in hedef && hedef.m) qs.set("m", String(hedef.m));
  if ("d" in hedef && hedef.d) qs.set("d", String(hedef.d));
  const q = qs.toString();

  return `${t}/d/${k}${q ? `?${q}` : ""}`;
}
