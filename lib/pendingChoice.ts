import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./apiFetch";

/**
 * "Onboarding'de seç, oturum açılınca gönder" deseninin ORTAK tabanı.
 *
 * ⚠️ NEDEN ORTAK: bu desen ülke için yazılmıştı ve bir hata sınıfını
 * kapatıyor — onboarding auth'tan ÖNCE göründüğü için `if (secim && user)`
 * koşulu seçimi sessizce düşürüyordu (839 kullanıcının 837'sinin ülkesiz
 * kalmasının sebebi buydu). Takım seçimi aynı anda, aynı ekranda ve aynı
 * kısıtla yapılıyor.
 *
 * İkinci bir kopya yazmak yerine tek taban çıkarıldı: aksi hâlde ileride
 * gönderim mantığında bir düzeltme birinde yapılıp öbüründe unutulurdu —
 * bu depoda tekrar tekrar görülen kusur şekli.
 *
 * `pendingCountry.ts`'in dışa açık işlev adları DEĞİŞMEDİ; yalnızca gövdesi
 * buraya taşındı.
 */
export type BekleyenSecim = {
  save: (deger: string) => Promise<void>;
  get: () => Promise<string | null>;
  clear: () => Promise<void>;
  flush: () => Promise<string | null>;
};

export function bekleyenSecimOlustur(opt: {
  /** AsyncStorage anahtarı */
  key: string;
  /** Gönderilecek uç, ör. "/api/users/set-country" */
  endpoint: string;
  /** Gövde alanının adı, ör. "country" */
  field: string;
  /**
   * Sunucu bu hata kodlarını döndürürse tekrar denemenin anlamı yok:
   * kayıt düşürülür ki kullanıcı profilden yeniden seçebilsin.
   */
  dropOnError?: string[];
}): BekleyenSecim {
  const { key, endpoint, field, dropOnError = [] } = opt;

  const get = async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const clear = async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  };

  const save = async (deger: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, deger);
    } catch {}
  };

  /**
   * Bekleyen seçimi sunucuya gönderir. Yalnızca sunucu kabul ederse yerel
   * kayıt silinir; aksi hâlde bir sonraki açılışta tekrar denenir.
   */
  const flush = async (): Promise<string | null> => {
    const deger = await get();
    if (!deger) return null;

    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: deger }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        await clear();
        return deger;
      }

      if (data?.error && dropOnError.includes(String(data.error))) {
        await clear();
      }
      return null;
    } catch {
      // Ağ hatası: kayıt dursun, sonraki açılışta yeniden denenir.
      return null;
    }
  };

  return { save, get, clear, flush };
}
