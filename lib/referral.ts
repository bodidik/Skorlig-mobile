import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { apiFetch } from "./apiFetch";

/**
 * DAVET KODU YAKALAMA
 *
 * Paylaşılan bağlantılar ?ref=KOD taşır. Kullanıcı o bağlantıyla geldiğinde
 * kod saklanır, giriş yaptıktan SONRA sunucuya uygulanır — girişten önce
 * denenirse kimlik başlığı boş gider ve 401 alınır.
 *
 * Kod bir kez uygulanır: sunucu ikinci denemeyi zaten reddeder ama boşuna
 * istek atmamak için yerelde de işaretlenir.
 */

const PENDING_KEY = "skorlig.pendingRef";
const APPLIED_KEY = "skorlig.refApplied";

/** Bağlantıdaki ?ref= kodunu sakla. Zaten uygulanmışsa yok sayar. */
export async function capturePendingRef(code: string | null | undefined): Promise<void> {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return;
  try {
    if (await AsyncStorage.getItem(APPLIED_KEY)) return; // bir kez yeter
    await AsyncStorage.setItem(PENDING_KEY, c);
  } catch {}
}

/** Uygulama açılışındaki URL'den ref kodunu yakala (soğuk başlatma). */
export async function captureRefFromInitialUrl(): Promise<void> {
  try {
    const url = await Linking.getInitialURL();
    if (!url) return;
    const { queryParams } = Linking.parse(url);
    const ref = queryParams?.ref;
    if (typeof ref === "string") await capturePendingRef(ref);
  } catch {}
}

/**
 * Bekleyen kodu uygula. Giriş yapıldıktan sonra çağrılmalı.
 * @returns kod işlendiyse sunucu yanıtı, yoksa null
 */
export async function applyPendingRef(): Promise<{ ok: boolean; reward?: number } | null> {
  try {
    if (await AsyncStorage.getItem(APPLIED_KEY)) return null;
    const code = await AsyncStorage.getItem(PENDING_KEY);
    if (!code) return null;

    const r = await apiFetch("/api/friends/use-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((x) => x.json());

    // Geçersiz/kendi kodu gibi kalıcı hatalarda tekrar denemeye gerek yok;
    // ağ hatasında kod beklemede kalsın ki sonraki açılışta denenebilsin.
    if (r?.ok) {
      await AsyncStorage.multiSet([[APPLIED_KEY, "1"]]);
      await AsyncStorage.removeItem(PENDING_KEY);
      return { ok: true, reward: Number(r.reward) || undefined };
    }
    if (r?.error && r.error !== "NETWORK") {
      await AsyncStorage.setItem(APPLIED_KEY, "1");
      await AsyncStorage.removeItem(PENDING_KEY);
    }
    return { ok: false };
  } catch {
    return null; // ağ hatası: kod beklemede kalır
  }
}
