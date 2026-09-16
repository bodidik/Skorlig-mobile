import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously as fbSignInAnonymously,
  linkWithCredential,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import type { User } from "firebase/auth";
import { Alert } from "react-native";
import { googleGirisHatasi } from "../lib/googleGirisHatasi";

let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  const mod = require("@react-native-google-signin/google-signin");
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
} catch {}

type AuthCtx = {
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithGoogle: () => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  isAnonymous: false,
  signInWithGoogle: async () => {},
  linkWithGoogle: async () => {},
  logout: async () => {},
  getToken: async () => null,
});

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

if (GoogleSignin) {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
}

/**
 * Google giriş hatasını KULLANICIYA gösterir.
 *
 * ⚠️ Bu fonksiyon var olana kadar üç çağrı yerinin üçü de hatayı yutuyordu;
 * mağaza derlemesinde girişin neden düştüğünü öğrenmenin yolu yoktu
 * (bkz. lib/googleGirisHatasi.ts — DEVELOPER_ERROR / kod 10).
 *
 * @returns iptal miydi — `true` ise çağıran sessizce dönmeli.
 */
function googleHatasiniBildir(e: unknown): boolean {
  const h = googleGirisHatasi(e, (statusCodes as any)?.SIGN_IN_CANCELLED);
  if (h.sessiz) return true;
  console.error("[auth] google giriş hatası:", h.kod, h.mesaj);
  Alert.alert("Google Girişi", h.mesaj);
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        setLoading(false);
      } else {
        // Oturum yok → anonim giriş dene. Başarısız olursa MİSAFİR devam:
        // uygulama maç listesini, sıralamaları vs. zaten oturumsuz gösteriyor.
        try {
          const cred = await fbSignInAnonymously(auth);
          setUser(cred.user);
        } catch (e: any) {
          const kod = String(e?.code || "");
          // Firebase konsolunda "Anonymous" sağlayıcısı KAPALIYSA bu hata gelir.
          // Google girişi kullanan bir kurulumda bu bilinçli bir tercihtir —
          // hata DEĞİL. console.error kullanmak geliştirmede kırmızı LogBox
          // ekranı açıp ekranı kapatıyordu; beklenen durum için gürültü.
          if (kod === "auth/admin-restricted-operation" || kod === "auth/operation-not-allowed") {
            console.warn(
              "[auth] anonim giriş kapalı (Firebase), misafir olarak devam ediliyor. " +
                "Açmak isterseniz: Firebase Console → Authentication → Sign-in method → Anonymous."
            );
          } else {
            console.error("[auth] anonim giriş başarısız:", e?.message || e);
          }
          setUser(null);
        }
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const getGoogleCredential = async () => {
    if (!GoogleSignin) {
      /* Uyarıyı burada BASMIYORUZ: kodu taşıyan hata `googleHatasiniBildir`
       * tarafından gösterilir, yoksa aynı ekrana iki uyarı düşerdi. */
      throw Object.assign(new Error("GoogleSignin not available"), { code: "EXPO_GO" });
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    const idToken = (result as any)?.data?.idToken ?? (result as any)?.idToken;
    if (!idToken) throw new Error("No idToken from Google");
    return GoogleAuthProvider.credential(idToken);
  };

  // Anonim kullanıcı → Google ile yükselt (UID değişmez, tüm veri korunur)
  const linkWithGoogle = useCallback(async () => {
    try {
      const credential = await getGoogleCredential();
      if (auth.currentUser) {
        const linked = await linkWithCredential(auth.currentUser, credential);
        setUser(linked.user);
      }
    } catch (e: any) {
      // Hesap zaten farklı bir UID'ye bağlıysa doğrudan o hesaba geç
      if (
        e.code === "auth/credential-already-in-use" ||
        e.code === "auth/email-already-in-use"
      ) {
        const credential = await getGoogleCredential();
        await signInWithCredential(auth, credential);
        return;
      }
      if (googleHatasiniBildir(e)) return; // kullanıcı vazgeçti
      throw e;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const credential = await getGoogleCredential();
      await signInWithCredential(auth, credential);
    } catch (e: any) {
      if (googleHatasiniBildir(e)) return; // kullanıcı vazgeçti
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    /* Cihaz jetonunu SUNUCUDAN sök — signOut'tan ÖNCE, token hâlâ
     * geçerliyken (unregister ucu kimlik istiyor; sonra çağrılsa 401).
     * Sökülmezse eski kullanıcının jetonu kayıtlı kalır ve aynı cihaza
     * yeni biri girene kadar ONUN bildirimleri bu cihaza düşer. */
    try { await require("../lib/push").unregisterPush(); } catch {}
    try { if (GoogleSignin) await GoogleSignin.signOut(); } catch {}
    await signOut(auth);
    // Çıkıştan sonra onAuthStateChanged tetiklenir → yeni anonim oturum açılır
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <Ctx.Provider value={{
      user,
      loading,
      isAnonymous: !!(user?.isAnonymous),
      signInWithGoogle,
      linkWithGoogle,
      logout,
      getToken,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
