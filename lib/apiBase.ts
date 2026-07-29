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
  const acikBase = envBase0 || extraBase0;

  // 1) Açıkça UZAK bir adres verilmişse otomatik tespit devreye GİRMEZ.
  //    Geliştirici production/staging'e bakmak istiyor demektir.
  if (acikBase && !isLocalAddress(acikBase)) return acikBase;

  // Web: sayfa hangi host'tan servis ediliyorsa API de o makinede (4102) varsayılır.
  // Ağ/IP değişimlerinden etkilenmez (tarayıcı zaten doğru makineye bağlı).
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4102`;
  }

  if (__DEV__) {
    const dbg =
      (Constants as any)?.expoConfig?.hostUri ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost ||
      (Constants as any)?.manifest2?.extra?.expoClient?.debuggerHost ||
      "";

    const host = String(dbg || "");
    const ip = host.split(":")[0]?.trim();
    if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return `http://${ip}:4102`;
    }
  }

  // 3) Yerel biçimdeki açık yapılandırma (bayat LAN IP olabilir; otomatik
  //    tespit başarısızsa yine de deneriz).
  if (acikBase) return acikBase;

  return "http://localhost:4102";
}

const FALLBACK_BASE = resolveApiBase();

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
