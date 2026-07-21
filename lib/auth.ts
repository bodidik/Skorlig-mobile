import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "./firebase";
import { Platform } from "react-native";

export type { User };

export async function signInWithGoogle(): Promise<User> {
  if (Platform.OS === "web") {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
  // React Native: expo-auth-session flow (see AuthContext for native handling)
  throw new Error("Use AuthContext.signInWithGoogle on native");
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function onAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
