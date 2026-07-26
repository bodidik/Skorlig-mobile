import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./apiFetch";

const CACHE_KEY = "skorlig.pushToken";

export type PushPrefs = {
  matchStart: boolean;
  result: boolean;
  duel: boolean;
  daily: boolean;
};

export const DEFAULT_PREFS: PushPrefs = {
  matchStart: true,
  result: true,
  duel: true,
  daily: true,
};

/** Uygulama ön plandayken de bildirim görünsün. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "SkorLig",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#f59e0b",
  });
}

/**
 * İzin iste, Expo push token al, sunucuya kaydet.
 * Kullanıcı reddederse sessizce null döner — uygulama akışı bozulmaz.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;

    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = res?.data;
    if (!token) return null;

    // Aynı token'ı her açılışta sunucuya yollamamak için önbellekle
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached !== token) {
      const r = await apiFetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (r.ok) await AsyncStorage.setItem(CACHE_KEY, token);
    }

    return token;
  } catch (e) {
    console.warn("[push] kayıt başarısız:", e);
    return null;
  }
}

/** Çıkışta cihazı sunucudan sök — yoksa bildirimler eski hesaba düşmeye devam eder. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(CACHE_KEY);
    await apiFetch("/api/push/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {}
}

export async function getPushPrefs(): Promise<{ prefs: PushPrefs; deviceCount: number }> {
  try {
    const r = await apiFetch("/api/push/prefs");
    const j = await r.json();
    if (j?.ok && j.prefs) {
      return {
        prefs: { ...DEFAULT_PREFS, ...j.prefs },
        deviceCount: Number(j.deviceCount || 0),
      };
    }
  } catch {}
  return { prefs: DEFAULT_PREFS, deviceCount: 0 };
}

export async function setPushPrefs(prefs: Partial<PushPrefs>): Promise<boolean> {
  try {
    const r = await apiFetch("/api/push/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    const j = await r.json();
    return !!j?.ok;
  } catch {
    return false;
  }
}
