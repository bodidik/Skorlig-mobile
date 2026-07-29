import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./apiFetch";

/**
 * Ülke seçimi onboarding'de yapılır ama oturum (Firebase user) o an henüz
 * hazır olmayabilir. Eski akışta `if (country && user)` koşulu yüzünden seçim
 * sessizce kayboluyordu — 839 kullanıcının 837'sinin ülkesiz kalmasının sebebi.
 *
 * Çözüm: seçim önce yerelde saklanır, oturum açılır açılmaz sunucuya gönderilir.
 * Gönderim başarılı olana kadar kayıt durur; her açılışta tekrar denenir.
 */

const KEY = "skorlig.pendingCountry";

export async function savePendingCountry(country: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, country);
  } catch {}
}

export async function getPendingCountry(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingCountry(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/**
 * Bekleyen ülkeyi sunucuya gönderir. Oturum hazır olduğunda çağrılır.
 * Yalnızca sunucu kabul ederse yerel kayıt silinir; aksi halde bir sonraki
 * açılışta tekrar denenir.
 *
 * @returns kaydedilen ülke, gönderilecek bir şey yoksa veya başarısızsa null
 */
export async function flushPendingCountry(): Promise<string | null> {
  const country = await getPendingCountry();
  if (!country) return null;

  try {
    const res = await apiFetch("/api/users/set-country", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country }),
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      await clearPendingCountry();
      return country;
    }

    // Sunucu ülkeyi tanımadıysa tekrar denemenin anlamı yok — kaydı düşür ki
    // kullanıcı profilden yeniden seçebilsin.
    if (data?.error === "COUNTRY_NOT_SUPPORTED") {
      await clearPendingCountry();
    }
    return null;
  } catch {
    // Ağ hatası: kayıt dursun, sonraki açılışta yeniden denenir.
    return null;
  }
}
