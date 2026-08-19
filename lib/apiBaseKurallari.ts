/**
 * API ADRESİ KARARLARI — SAF ÇEKİRDEK.
 *
 * NEDEN AYRI DOSYA: `apiBase.ts` `expo-constants` ve `react-native` içe
 * aktarıyor, bu yüzden Node altında YÜKLENEMİYOR ve içindeki kurallar hiç
 * ölçülemiyordu. Oysa buradaki iki karar üretimde uygulamayı tamamen
 * kullanılamaz hâle getirdi:
 *
 *  1) 2026-08-09 — sunucuda `trust proxy` ayarlı olmadığı için
 *     `/api/runtime/config` yanıtı `apiBase: "http://skorlig87.onrender.com"`
 *     döndü. İstemci https adresini bu değerle EZDİ. Android yayın derlemesi
 *     cleartext HTTP'yi engellediği için sonraki her istek öldü — kullanıcı
 *     hiçbir ekranda maç göremedi. Sunucu sağlıklıydı, sorun yalnızca
 *     ADRESTEYDİ ve teşhisi zaman aldı.
 *
 *  2) Yayın derlemesinin YEREL bir adrese (LAN IP / localhost) düşmesi:
 *     uygulama herkeste ölü çıkar ve bu ancak mağazadan indirildikten sonra
 *     fark edilir.
 *
 * Bu modül yalnızca KARAR veriyor; log basmak, `Constants` okumak ve
 * `__DEV__` bakmak çağıranın işi. `gelistirme` bilerek parametre: global bir
 * bayrağa bakmak modülü yine test edilemez yapardı.
 *
 * Kural değişikliği burada yapılır — `apiBase.ts` yalnızca bu kararları
 * uygular. İkisini ayrı yerlerde tutmak, savunmanın birinde olup ötekinde
 * olmaması demektir; bu depoda en sık tekrarlayan kusur biçimi o.
 */

/** Adres yerel ağ/loopback mi? (LAN IP, localhost, .local) */
export function yerelAdresMi(url: string): boolean {
  const u = String(url || "").trim().toLowerCase();
  /* Boş yapılandırma "yerel" sayılır: otomatik LAN tespitinin devreye
   * girebilmesi için gereken davranış (bkz. apiBase.ts başlığı). */
  if (!u) return true;
  return (
    /^https?:\/\/localhost\b/.test(u) ||
    /^https?:\/\/127\./.test(u) ||
    /^https?:\/\/10\./.test(u) ||
    /^https?:\/\/192\.168\./.test(u) ||
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./.test(u) ||
    /\.local(:\d+)?/.test(u)
  );
}

export type AdresKarari =
  | { kabul: true; sebep: "uygun" }
  | { kabul: false; sebep: "bos" | "https-dusurulemez" | "yayinda-https-sart" };

/**
 * Sunucunun `/api/runtime/config` ile ilan ettiği adres kabul edilir mi?
 *
 * İKİ KURAL, ikisi de yukarıdaki (1) numaralı kesintiden çıktı:
 *   · https → http DÜŞÜŞÜ hiçbir modda kabul edilmez.
 *   · Yayın derlemesinde yalnızca https kabul edilir.
 *
 * @param mevcut      şu an kullanılan adres
 * @param aday        sunucunun ilan ettiği adres
 * @param gelistirme  `__DEV__` karşılığı
 */
export function ilanEdilenAdresKarari(
  mevcut: string,
  aday: string,
  gelistirme: boolean
): AdresKarari {
  const a = String(aday || "").trim();
  if (!a) return { kabul: false, sebep: "bos" };

  if (String(mevcut || "").startsWith("https://") && a.startsWith("http://")) {
    return { kabul: false, sebep: "https-dusurulemez" };
  }
  if (!gelistirme && !a.startsWith("https://")) {
    return { kabul: false, sebep: "yayinda-https-sart" };
  }
  return { kabul: true, sebep: "uygun" };
}

export type GuvenliBaseKarari = {
  base: string;
  durum: "gelistirme" | "uzak" | "yedege-dusuldu" | "yedek-yok";
};

/**
 * Açılış adresi seçimi: yayın derlemesi yerel adrese düşmemeli.
 *
 * `durum` çağıranın ne loglayacağını belirliyor — "yedek-yok" gerçek bir
 * yayın kusuru (uygulama sunucuya ULAŞAMAZ), "yedege-dusuldu" yalnızca uyarı.
 * Kararı sessizce vermek, sessizce kırık bir sürüm yayınlamak demek olurdu.
 */
export function guvenliBaseSec(
  aday: string,
  uzakYedek: string,
  gelistirme: boolean
): GuvenliBaseKarari {
  if (gelistirme) return { base: aday, durum: "gelistirme" };
  if (!yerelAdresMi(aday)) return { base: aday, durum: "uzak" };

  const y = String(uzakYedek || "").trim();
  if (y && !yerelAdresMi(y)) return { base: y, durum: "yedege-dusuldu" };

  return { base: aday, durum: "yedek-yok" };
}
