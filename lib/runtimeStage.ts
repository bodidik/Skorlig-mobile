/**
 * ÇALIŞMA PROFİLİ → KULLANICIYA GÖSTERİLEN AŞAMA — SAF ÇEKİRDEK.
 *
 * NEDEN AYRI DOSYA: `runtimeConfig.ts` `expo-constants` içe aktarıyor VE
 * `API_BASE`'i modül yüklenirken hesaplıyor, yani Node altında hiç
 * çalıştırılamıyor. (i18n'de işe yarayan "tembel require" numarası burada
 * çare değil: expo-constants Node'da zaten yüklenmiyor ve çağrı modül
 * yükleme anında yapılıyor.) Bu eşleme ise tamamen saf — girdisi sunucudan
 * gelen bir nesne, çıktısı ekranda gösterilen sınırlar.
 *
 * NE BELİRLİYOR: kullanıcıya "kaç takım / kaç lig" sınırında olduğunu ve
 * hangi etiketin gösterileceğini. Sunucu `RUNTIME_STAGE` / `FEATURES_MODE`
 * ortam değişkenleriyle profil ilan ediyor; ilan tanınmazsa buradaki son
 * dal devreye giriyor ve profil adı OLDUĞU GİBİ gösteriliyor.
 *
 * ⚠️ TANINMAYAN PROFİL SESSİZCE YUTULMAZ. Bilinmeyen bir profil `null`
 * dönseydi ekranda hiçbir aşama görünmez ve yanlış yapılandırma fark
 * edilmezdi; "CUSTOM" seviyesiyle görünür kalması bilinçli.
 */

export type RuntimeMode = {
  profile?: string;
  maxTeams?: number | null;
  maxLeagues?: number | null;
  notes?: string;
};

export type RuntimeStage =
  | {
      profile: string;
      maxTeams: number | null;
      maxLeagues: number | null;
      label: string;
      level: "DEV" | "TR" | "GLOBAL_LIGHT" | "GLOBAL_FULL" | "CUSTOM";
    }
  | null;

/**
 * Bilinen profiller — ÇALIŞMA MODU İÇİN TEK KAYNAK.
 *
 * ⚠️ BU TABLO ÜÇ KOPYANIN BİRİYDİ ve düzeltme yalnız buraya uygulanmıştı.
 * 2026-09-07'de TR_40_TEAMS buraya eklendi; aynı işi yapan ÖTEKİ İKİ liste
 * `app/(tabs)/stats.tsx` içinde olduğu gibi kaldı (ölçüldü, 2026-09-11):
 *
 *   mapProfileLabel  — TR_40 yok, ekranda "Custom: TR_40_TEAMS" yazıyordu
 *   presetProfiles   — TR_40 yok; TR_30 için 30/1 yazıyor, sunucu 40/2 diyor
 *
 * Bir kopyayı düzeltip ötekileri ölçmemek, bu kusurun ilk kez nasıl
 * oluştuğuysa odur. İkisi de artık bu tablodan besleniyor.
 *
 * ⚠️ SAYILAR SUNUCUNUN ÖN AYARIYLA AYNI OLMAK ZORUNDA: yönetici paneli bu
 * değerleri GÖVDEDE gönderiyor (`payload.maxTeams`) ve sunucu onları olduğu
 * gibi yazıyor. Ayrıştıkları an panelden seçilen profil, varsayılan profilden
 * farklı sınırlarla çalışır. Nöbetçi: api/tests/profil-on-ayar-tek-kaynak.
 */
const PROFILLER: Record<
  string,
  {
    maxTeams: number;
    maxLeagues: number;
    label: string;
    level: NonNullable<RuntimeStage>["level"];
    /** i18n anahtarları — ekranlar ham Türkçe basmasın. */
    i18nUzun: string;
    i18nKisa: string;
    /** Yönetici panelinde ön ayar olarak sunulsun mu? */
    onAyar: boolean;
  }
> = {
  DEV_4_TEAMS: {
    maxTeams: 4, maxLeagues: 1, label: "4 takımlı geliştirme modu", level: "DEV",
    i18nUzun: "profDev4", i18nKisa: "profDev4Short", onAyar: true,
  },
  /* ⚠️ ÇALIŞAN PROFİL BU TABLODA YOKTU (2026-09-07 TR40 denetimi).
   * Sunucu TR_40_TEAMS ile çalışırken `mapRuntimeStage` son dala düşüp
   * level:"CUSTOM" veriyordu ve ekranda "Custom profil: TR_40_TEAMS" yazıyordu
   * — uygulama, ürünün VARSAYILAN profilini tanımadığını ilan ediyordu.
   * Sunucu tarafındaki ikizi: server.cjs PROFIL_ETIKET. */
  TR_40_TEAMS: {
    maxTeams: 40, maxLeagues: 2, label: "Türkiye: Süper Lig + 1. Lig (≈38 takım)", level: "TR",
    i18nUzun: "profTr40Full", i18nKisa: "profTr40Short", onAyar: true,
  },
  /* ⚠️ ESKİ AD, SAYILARI TR_40 İLE AYNI. Sunucu ön ayarı
   * `{ ...TR_40_ON_AYAR, profile: "TR_30_TEAMS" }` (api/routes/admin-runtime.cjs)
   * yani 40/2. Burada 30/1 yazıyordu: panelde TR seçen yönetici canlı
   * profilin sınırlarını DARALTIYORDU ve runtime-mode.cjs Mongo'yu üstün
   * tuttuğu için ön ayar bir daha geri gelmiyordu. */
  TR_30_TEAMS: {
    maxTeams: 40, maxLeagues: 2, label: "Türkiye ligi (eski ad, TR_40 ile aynı)", level: "TR",
    i18nUzun: "profTr30Full", i18nKisa: "profTr30Short", onAyar: true,
  },
  GLOBAL_100_TEAMS: {
    maxTeams: 100, maxLeagues: 5, label: "Kısıtlı global test modu (≈100 takım)", level: "GLOBAL_LIGHT",
    i18nUzun: "profG100Full", i18nKisa: "profG100", onAyar: true,
  },
  GLOBAL_456_TEAMS: {
    maxTeams: 456, maxLeagues: 20, label: "Tam global yüksek yük modu", level: "GLOBAL_FULL",
    i18nUzun: "profG456Full", i18nKisa: "profG456Short", onAyar: true,
  },
};

export type OnAyar = {
  key: string;
  maxTeams: number;
  maxLeagues: number;
  i18nUzun: string;
  i18nKisa: string;
};

/** Yönetici panelinin sunacağı ön ayarlar — tablodan türetiliyor. */
export function onAyarlar(): OnAyar[] {
  return Object.entries(PROFILLER)
    .filter(([, v]) => v.onAyar)
    .map(([key, v]) => ({
      key,
      maxTeams: v.maxTeams,
      maxLeagues: v.maxLeagues,
      i18nUzun: v.i18nUzun,
      i18nKisa: v.i18nKisa,
    }));
}

/**
 * Profilin kullanıcıya gösterilecek adı.
 *
 * ⚠️ TANINMAYAN PROFİLDE `notes` DENENİYOR. Sunucu zaten Türkçe bir açıklama
 * gönderiyor (runtime-mode.json `notes`); eski kod onu hiç okumayıp ham
 * anahtarı "Custom: TR_40_TEAMS" diye basıyordu.
 */
export function profilEtiketi(
  profile: string | null | undefined,
  ceviri: (k: string) => string,
  notes?: string | null
): string | null {
  const p = String(profile || "").toUpperCase();
  if (!p) return null;
  const bilinen = PROFILLER[p];
  if (bilinen) return ceviri(bilinen.i18nUzun);
  const not = String(notes || "").trim();
  return not || p;
}

/**
 * Sunucunun ilan ettiği profili ekranda gösterilecek aşamaya çevirir.
 *
 * Sunucu sayı gönderirse O kullanılır; göndermezse profilin varsayılanı.
 * Bu ayrım önemli: sunucu sınırı daralttığında (kota, yük) istemci eski
 * varsayılanı göstermemeli.
 */
export function mapRuntimeStage(mode: RuntimeMode | null | undefined): RuntimeStage {
  if (!mode) return null;

  const profile = String(mode.profile || "").toUpperCase();
  const maxTeams = typeof mode.maxTeams === "number" ? mode.maxTeams : null;
  const maxLeagues = typeof mode.maxLeagues === "number" ? mode.maxLeagues : null;

  const bilinen = PROFILLER[profile];
  if (bilinen) {
    return {
      profile,
      maxTeams: maxTeams ?? bilinen.maxTeams,
      maxLeagues: maxLeagues ?? bilinen.maxLeagues,
      label: bilinen.label,
      level: bilinen.level,
    };
  }

  return {
    profile,
    maxTeams,
    maxLeagues,
    label: mode.notes || `Custom profil: ${profile}`,
    level: "CUSTOM",
  };
}
