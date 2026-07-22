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
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { auth } from "../lib/firebase";
import type { User } from "firebase/auth";

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

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        setLoading(false);
      } else {
        // Oturum yok → anonim giriş yap (sessizce)
        try {
          const cred = await fbSignInAnonymously(auth);
          setUser(cred.user);
        } catch {
          setUser(null);
        }
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const getGoogleCredential = async () => {
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
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      // Hesap zaten farklı bir UID'ye bağlıysa doğrudan o hesaba geç
      if (
        e.code === "auth/credential-already-in-use" ||
        e.code === "auth/email-already-in-use"
      ) {
        const credential = await getGoogleCredential();
        await signInWithCredential(auth, credential);
      } else {
        throw e;
      }
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const credential = await getGoogleCredential();
      await signInWithCredential(auth, credential);
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      console.error("[auth] google sign-in error:", e.message || e);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try { await GoogleSignin.signOut(); } catch {}
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
