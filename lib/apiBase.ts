import Constants from "expo-constants";

let resolvedBase: string | null = null;

/**
 * API_BASE çözümleme stratejisi.
 *
 * ÖNCELİK KURALI (2026-07-29'da düzeltildi):
 *   1) AÇIK yapılandırma UZAK bir adres ise (https://... ya da alan adı)
 *      her zaman kazanır — geliştirici bilerek production/staging seçmiştir.
 *   2) DEV modda: Metro'nun LAN IP'si -> http://<ip>:4102
 *   3) EXPO_PUBLIC_API_BASE / app.json extra.apiBase (LAN IP biçiminde olabilir)
 *   4) localhost
 *
 * NEDEN BU SIRA: Eskiden DEV dalı EN BAŞTAYDI ve açık yapılandırmayı koşulsuz
 * eziyordu. `.env` production'ı gösterse bile uygulama `http://192.168.x.x:4102`
 * deniyordu. Telefon **mobil veriye** geçtiğinde (ya da farklı ağdayken) o
 * adrese ulaşmak imkânsız — uygulama tamamen ölü görünüyordu:
 * "Network request failed", her ekranda. Yaşandı ve teşhisi zaman aldı çünkü
 * sunucu ayakta, API sağlıklı, sorun yalnızca ADRESTEYDİ.
 *
 * Otomatik LAN tespiti korunuyor: asıl amacı `.env`'de BAYATLAMIŞ bir LAN IP
 * varken ağ değişince elle güncelleme derdini kaldırmaktı. O yüzden yalnızca
 * yapılandırma da yerel bir adres gösteriyorsa (ya da hiç yoksa) devreye girer.
 */

/** Adres yerel ağ/loopback mi? (LAN IP, localhost, .local) */
function isLocalAddress(url: string): boolean {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return true; // yapılandırma yok sayılır → otomatik tespit serbest
  return (
    /^https?:\/\/localhost\b/.test(u) ||
    /^https?:\/\/127\./.test(u) ||
    /^https?:\/\/10\./.test(u) ||
    /^https?:\/\/192\.168\./.test(u) ||
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./.test(u) ||
    /\.local(:\d+)?/.test(u)
  );
}

function resolveApiBase(): string {
  const pick = (x?: string | null) =>
    x && String(x).trim() ? String(x).trim() : "";

  const envBase0 = pick(process.env.EXPO_PUBLIC_API_BASE);
  const extraBase0 = pick(
    (Constants?.expoConfig?.extra?.apiBase as string) ||
      (Constants as any)?.manifest?.extra?.apiBase
  );

  // `EXPO_PUBLIC_API_BASE=auto` → "yerel makinemdeki API'yi bul".
  //
  // NEDEN AYRI ANAHTAR: Yerel sunucuya dönmek için hem .env'i hem app.json'u
  // elle yorumlamak gerekiyordu (ikisi de production'ı gösteriyor) ve sonra
  // geri almayı unutmak kolay. Tek satırla gidip gelmek için açık bir değer.
  const otomatikIstendi = /^(auto|lan|local)$/i.test(envBase0);
  const acikBase = otomatikIstendi ? "" : envBase0 || extraBase0;

  // 1) Açıkça UZAK bir adres verilmişse otomatik tespit devreye GİRMEZ.
  //    Geliştirici production/staging'e bakmak istiyor demektir.
  if (acikBase && !isLocalAddress(acikBase)) return acikBase;

  // Web: sayfa hangi host'tan servis ediliyorsa API de o makinede (4102) varsayılır.
  // Ağ/IP değişimlerinden etkilenmez (tarayıcı zaten doğru makineye bağlı).
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4102`;
  }

  if (__DEV__) {
    const C = Constants as any;
    // Expo sürümleri bu bilgiyi farklı yerlerde tutuyor; tek bir yola
    // güvenmek sessiz başarısızlık demek (yaşandı: hepsi boş döndü ve
    // uygulama localhost'a düşüp "Network request failed" verdi).
    const adaylar: string[] = [
      C?.expoConfig?.hostUri,
      C?.expoGoConfig?.debuggerHost,
      C?.manifest2?.extra?.expoClient?.hostUri,
      C?.manifest?.debuggerHost,
      C?.manifest?.hostUri,
      C?.manifest2?.extra?.expoClient?.debuggerHost,
      C?.experienceUrl,
      C?.linkingUri,
    ].filter(Boolean).map(String);

    for (const aday of adaylar) {
      // "exp://192.168.0.58:8081", "192.168.0.58:8081" gibi biçimlerden IP çek
      const m = aday.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) return `http://${m[1]}:4102`;
    }

    if (otomatikIstendi) {
      // Açıkça "auto" istendi ama IP bulunamadı — sessizce localhost'a düşmek
      // "Network request failed" olarak görünür ve sebebi anlaşılmaz.
      console.warn(
        "[apiBase] EXPO_PUBLIC_API_BASE=auto ama Metro IP'si bulunamadi. " +
          "Bakilan alanlar bos. .env'e adresi elle yazin: " +
          "EXPO_PUBLIC_API_BASE=http://<bilgisayar-ip>:4102"
      );
    }
  }

  // 3) Yerel biçimdeki açık yapılandırma (bayat LAN IP olabilir; otomatik
  //    tespit başarısızsa yine de deneriz).
  if (acikBase) return acikBase;

  return "http://localhost:4102";
}

/**
 * YAYIN DERLEMESİ KORUMASI.
 *
 * `EXPO_PUBLIC_*` değişkenleri paket derlenirken KODUN İÇİNE gömülür. Geliştirme
 * sırasında `.env`'de LAN IP tutmak normaldir (`http://192.168.0.58:4102`) —
 * ama o hâlde alınan bir YAYIN derlemesi, tüm kullanıcılarda ulaşılamayan bir
 * özel ağ adresini arar. Uygulama herkeste tamamen ölü çıkar ve bu ancak
 * mağazadan indirildikten sonra fark edilir.
 *
 * Bu yüzden production derlemesinde yerel adres KABUL EDİLMEZ: app.json'daki
 * uzak adrese düşülür. app.json da yerelse hata net biçimde loglanır —
 * sessizce kırık bir sürüm yayınlamaktan iyidir.
 */
function guvenliBase(aday: string): string {
  if (__DEV__) return aday;
  if (!isLocalAddress(aday)) return aday;

  const uzakYedek =
    (Constants?.expoConfig?.extra?.apiBase as string) ||
    (Constants as any)?.manifest?.extra?.apiBase ||
    "";

  if (uzakYedek && !isLocalAddress(uzakYedek)) {
    console.warn(
      `[apiBase] YAYIN derlemesinde yerel adres (${aday}) yok sayildi; ` +
        `app.json'daki ${uzakYedek} kullaniliyor.`
    );
    return String(uzakYedek);
  }

  console.error(
    `[apiBase] YAYIN derlemesi YEREL adrese isaret ediyor (${aday}) ve uzak ` +
      `yedek yok. Uygulama sunucuya ULASAMAZ. .env'deki ` +
      `EXPO_PUBLIC_API_BASE degerini derlemeden once production adresi yapin.`
  );
  return aday;
}

// guvenliBase: yayın derlemesinde yerel adrese düşmeyi engeller (bkz. yukarı).
const FALLBACK_BASE = guvenliBase(resolveApiBase());

export async function getApiBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;

  resolvedBase = FALLBACK_BASE;

  try {
    const r = await fetch(`${resolvedBase}/api/runtime/config`);
    const j = await r.json();
    if (j?.ok && j.apiBase) {
      resolvedBase = String(j.apiBase);
    }
  } catch (e) {
    console.warn(`[apiBase] "${resolvedBase}" adresine ulaşılamadı, bu adresle devam ediliyor:`, e);
  }

  return resolvedBase;
}

export function resetApiBase() {
  resolvedBase = null;
}

/* =========================================================
  ⏱️ SERVER TIME SYNC  (NİHAİ EKLEME – BURADAN SONRASI YENİ)
   ========================================================= */

let serverOffsetMs = 0;

// ===== Server time sync (client) =====
export async function syncServerTime() {
  try {
    const base = await getApiBase();
    const r = await fetch(`${base}/health`);
    const j = await r.json();

    if (j?.ts) {
      const serverMs = new Date(j.ts).getTime();
      const localMs = Date.now();
      if (Number.isFinite(serverMs)) {
        serverOffsetMs = serverMs - localMs;
        return;
      }
    }
    serverOffsetMs = 0;
  } catch {
    serverOffsetMs = 0;
  }
}

export function nowFromServer(): number {
  return Date.now() + serverOffsetMs;
}
