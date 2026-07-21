import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "skorlig.userId";

export async function getUserId(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v || "uDev";
  } catch {
    return "uDev";
  }
}

export async function setUserId(userId: string) {
  try { await AsyncStorage.setItem(KEY, String(userId)); } catch {}
}



