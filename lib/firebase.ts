import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// AsyncStorage ile kalıcı oturum (uygulama kapansa bile giriş korunur)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // zaten init edilmişse (hot reload) mevcut instance'ı al
  auth = getAuth(app);
}

export { auth };
