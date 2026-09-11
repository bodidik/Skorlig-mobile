import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, type Auth, type Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Firebase config → console.firebase.google.com > Proje Ayarları > Web uygulaması
const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FB_API_KEY || "",
  authDomain:        process.env.EXPO_PUBLIC_FB_AUTH_DOMAIN || "",
  projectId:         process.env.EXPO_PUBLIC_FB_PROJECT_ID || "",
  storageBucket:     process.env.EXPO_PUBLIC_FB_STORAGE_BUCKET || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FB_MESSAGING_SENDER_ID || "",
  appId:             process.env.EXPO_PUBLIC_FB_APP_ID || "",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/**
 * OTURUM KALICILIĞI — AsyncStorage.
 *
 * ⚠️ ESKİ HÂLİ SESSİZCE KALICILIĞI KAYBEDİYOR OLABİLİR.
 *
 * Kod `getReactNativePersistence`'ı doğrudan `firebase/auth`'tan import
 * ediyordu. Ama firebase@12'de o paketin `package.json`'ında `react-native`
 * alanı YOK; Metro `browser`/`main` girişine düşüyor ve o girişlerde bu
 * fonksiyon HİÇ BULUNMUYOR (ölçüldü: `dist/esm/index.esm.js` ve
 * `dist/index.cjs.js` içinde 0 geçiş; fonksiyon yalnızca `@firebase/auth`'un
 * RN girişinde — `dist/rn/index.js`, 8 geçiş).
 *
 * `undefined` bir fonksiyonu çağırmak TypeError atar; alttaki `catch` bunu
 * yutup kalıcılıksız `getAuth(app)`'a düşüyordu. Kullanıcı tarafındaki sonuç:
 * uygulama tamamen kapanıp açıldığında OTURUM KAYBOLUR — ve hiçbir yerde
 * hata görünmez.
 *
 * Aşağısı bilerek SAVUNMACI: iki paketten de aramayı dener, bulamazsa
 * SESSİZ KALMAZ. Sessiz düşüş, bu hatanın fark edilmemesinin tek sebebiydi.
 */
function rnPersistenceBul(): ((s: unknown) => Persistence) | null {
  // 1) Umbrella paket — bazı sürümlerde RN girişi buradan da gelebiliyor.
  try {
    const m = require("firebase/auth");
    if (typeof m?.getReactNativePersistence === "function") {
      return m.getReactNativePersistence;
    }
  } catch {}

  // 2) Alt paket — RN girişi burada tanımlı (`react-native: dist/rn/index.js`),
  //    Metro bare import'ta oraya çözer.
  try {
    const m = require("@firebase/auth");
    if (typeof m?.getReactNativePersistence === "function") {
      return m.getReactNativePersistence;
    }
  } catch {}

  return null;
}

/**
 * WEB KALICILIĞI — AYRI BİR ŞEY.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-11, önizlemede görüldü): kalıcılık yalnızca
 * `getReactNativePersistence` üzerinden aranıyordu. O fonksiyon
 * `@firebase/auth`un SADECE RN girişinde var — ölçüldü (1.13.3):
 *
 *     react-native  dist/rn/index.js     9 geçiş
 *     browser       dist/esm/index.js    0
 *     main          dist/node/index.js   0
 *
 * Yani TELEFONDA sorun yok (Metro `react-native` girişini seçiyor). Ama
 * WEB'de bulunamıyor, kod kalıcılıksız `initializeAuth(app)`a düşüyor ve
 * oturum YALNIZCA BELLEKTE kalıyor. Ölçüldü: her tam sayfa yüklemesinde
 * YENİ anonim kimlik alınıyordu (uid her seferinde başka) — puan ve cüzdan
 * kimliğe bağlı olduğu için web'de hiçbir şey birikmez.
 *
 * ⚠️ HATA MESAJI DA YANILTIYORDU: web'de çıkıp "sürümleri kontrol edin"
 * diyordu, oysa web'in doğru cevabı `browserLocalPersistence`. Yanlış yere
 * bakan bir uyarı, hiç uyarmamaktan daha çok vakit kaybettirir.
 *
 * ⚠️ `browserLocalPersistence` TEMBEL ÇÖZÜLÜYOR: RN girişinde o sembol YOK
 * (ölçüldü: 0 geçiş), statik içe aktarım telefonda `undefined` olurdu.
 */
function webPersistenceBul(): Persistence | null {
  try {
    const m = require("firebase/auth");
    return m?.browserLocalPersistence ?? null;
  } catch {
    return null;
  }
}

let auth: Auth;

const webMi = Platform.OS === "web";
const persistenceFn = webMi ? null : rnPersistenceBul();
const webPersistence = webMi ? webPersistenceBul() : null;

if (webMi ? !webPersistence : !persistenceFn) {
  // ⚠️ GÜRÜLTÜLÜ OL. Bu satır görünüyorsa oturum KALICI DEĞİL ve kullanıcılar
  // uygulamayı kapatınca çıkış yapmış olur. Mesaj PLATFORMA göre: yanlış
  // yere bakan bir uyarı vakit kaybettirir.
  console.error(
    webMi
      ? "[firebase] browserLocalPersistence bulunamadi — OTURUM KALICI DEGIL (web). " +
        "Her sayfa yenilemesinde yeni kimlik alinir."
      : "[firebase] getReactNativePersistence bulunamadi — OTURUM KALICI DEGIL. " +
        "Kullanicilar uygulamayi kapatinca cikis yapmis olacak. " +
        "firebase / @firebase/auth surumlerini kontrol edin."
  );
}

try {
  const secilen: Persistence | null = webMi
    ? webPersistence
    : persistenceFn
      ? persistenceFn(AsyncStorage)
      : null;
  auth = secilen ? initializeAuth(app, { persistence: secilen }) : initializeAuth(app);
} catch (e) {
  // Beklenen tek durum: "zaten initialize edilmiş" (hot reload).
  // Başka bir sebep varsa GÖRÜNSÜN — eskiden bu blok her şeyi yutuyordu.
  const msg = String((e as Error)?.message || e);
  if (!/already.*initializ/i.test(msg)) {
    console.error("[firebase] initializeAuth beklenmedik hata:", msg);
  }
  auth = getAuth(app);
}

export { auth };
