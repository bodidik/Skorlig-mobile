import Constants from "expo-constants";

let resolvedBase: string | null = null;

/**
 * API_BASE çözümleme stratejisi:
 * 1) DEV modda: Metro'nun sunulduğu LAN IP'si -> http://<ip>:4102
 *    (API'nin Metro ile aynı makinede çalıştığı varsayılır; ağ değişince
 *    .env/app.json içindeki sabit IP'yi elle güncellemeye gerek kalmaz)
 * 2) EXPO_PUBLIC_API_BASE (prod / tunnel / auto-detect başarısız olursa)
 * 3) app.json / extra.apiBase
 * 4) localhost fallback
 */
function resolveApiBase(): string {
  const pick = (x?: string | null) =>
    x && String(x).trim() ? String(x).trim() : "";

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

  const extraBase =
    (Constants?.expoConfig?.extra?.apiBase as string) ||
    (Constants as any)?.manifest?.extra?.apiBase;

  const envBase = process.env.EXPO_PUBLIC_API_BASE;

  const a = pick(envBase);
  if (a) return a;

  const b = pick(extraBase);
  if (b) return b;

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
