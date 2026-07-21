// mobile/lib/adminToken.ts
// Admin token artık app.json'a GÖMÜLMEZ; admin cihazda elle girer,
// AsyncStorage'da saklanır. Sunucu x-admin-token header'ını doğrular.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "skorlig.adminToken";

let cached: string | null | undefined; // undefined = henüz okunmadı

export async function getAdminToken(): Promise<string> {
  if (cached === undefined) {
    try {
      cached = (await AsyncStorage.getItem(KEY)) ?? null;
    } catch {
      cached = null;
    }
  }
  return (cached ?? "").trim();
}

export async function setAdminToken(token: string): Promise<void> {
  const t = String(token || "").trim();
  cached = t || null;
  try {
    if (t) await AsyncStorage.setItem(KEY, t);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // storage hatasında en azından bellek içi cache çalışsın
  }
}

export async function clearAdminToken(): Promise<void> {
  await setAdminToken("");
}

export async function hasAdminToken(): Promise<boolean> {
  return (await getAdminToken()).length > 0;
}

/** Mevcut header objesine x-admin-token ekler (token yoksa dokunmaz). */
export async function withAdminHeaders(
  headers: Record<string, string> = {}
): Promise<Record<string, string>> {
  const t = await getAdminToken();
  if (t) headers["x-admin-token"] = t;
  return headers;
}
