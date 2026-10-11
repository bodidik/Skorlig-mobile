/**
 * İLK OYUN — oyuncu ilk tahminini yaptı mı?
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-10-11): "Test kullanıcılarım uygulamaya girince
 * kayboluyorlar… oyun onları içine çekmeli hemencecik, sistemi çözmek daha
 * sonra lazım onlara." Ana ekran ilk açılışta beş-altı bloğu birden
 * gösteriyordu ve hangisinin "önce bu" olduğu belli değildi.
 *
 * Bu bayrak açık değilken Oyun Merkezi yalnız Skor Tahmini kartını tam boy
 * gösterir, diğer oyunlar tek satırda katlı durur. İlk başarılı tahminden
 * sonra (ya da sunucu listesinde daha önce yapılmış bir tahmin görülünce)
 * bayrak kalıcı olarak açılır ve ekran normal düzenine döner.
 *
 * Cihaza özel: yeni cihazda eski oyuncu bir kez daha sade ekranı görebilir,
 * ama Skor kartı yüklendiğinde geçmiş tahminini görüp bayrağı hemen açar.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "skorlig.ilkTahmin";

type Dinleyici = () => void;
const dinleyiciler = new Set<Dinleyici>();

export async function ilkTahminYapildiMi(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    /* Depo okunamıyorsa sade ekranda takılı kalmasın: eski düzen. */
    return true;
  }
}

export async function ilkTahminYapildi(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(KEY)) === "1") return;
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    /* Yazılamazsa da bu oturumda haber ver — ekran yine açılsın. */
  }
  dinleyiciler.forEach((f) => f());
}

/** Bayrak açıldığında haber al (aynı oturumda ekranı hemen açmak için). */
export function ilkTahminAboneOl(f: Dinleyici): () => void {
  dinleyiciler.add(f);
  return () => { dinleyiciler.delete(f); };
}
