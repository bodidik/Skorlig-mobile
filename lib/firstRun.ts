import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "skorlig.firstRun";

export async function isFirstRun(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === null;
  } catch {
    return false;
  }
}

export async function markFirstRunDone(): Promise<void> {
  await AsyncStorage.setItem(KEY, "done");
}
