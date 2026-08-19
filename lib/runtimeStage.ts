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

/** Bilinen profiller ve varsayılan sınırları. */
const PROFILLER: Record<
  string,
  { maxTeams: number; maxLeagues: number; label: string; level: NonNullable<RuntimeStage>["level"] }
> = {
  DEV_4_TEAMS:      { maxTeams: 4,   maxLeagues: 1,  label: "4 takımlı geliştirme modu",            level: "DEV" },
  TR_30_TEAMS:      { maxTeams: 30,  maxLeagues: 1,  label: "Türkiye ligi testi (≈30 takım)",       level: "TR" },
  GLOBAL_100_TEAMS: { maxTeams: 100, maxLeagues: 5,  label: "Kısıtlı global test modu (≈100 takım)", level: "GLOBAL_LIGHT" },
  GLOBAL_456_TEAMS: { maxTeams: 456, maxLeagues: 20, label: "Tam global yüksek yük modu",           level: "GLOBAL_FULL" },
};

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
