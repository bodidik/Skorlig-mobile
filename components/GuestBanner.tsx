import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "../contexts/AuthContext";

/**
 * Misafir kullanıcılar için küçük, engelleyici olmayan kayıt şeridi.
 * Giriş yapılınca otomatik kaybolur.
 *
 * ⚠️ ESKİDEN HİÇ GÖRÜNMÜYORDU: koşul `isAnonymous` idi, yani Firebase anonim
 * oturumu gerektiriyordu — ama anonim giriş bu projede KAPALI. Dolayısıyla
 * bileşen ölü koddu. Artık koşul "oturum yok": giriş duvarı kaldırıldığı için
 * (bkz. app/_layout.tsx) gerçekten misafir kullanıcılar var.
 *
 * `linkWithGoogle` yerine `signInWithGoogle`: bağlanacak anonim hesap yok,
 * baştan giriş yapılıyor.
 */
export default function GuestBanner() {
  const { user, isAnonymous, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(false);

  // Oturum varsa ve anonim değilse: gösterme.
  if (user && !isAnonymous) return null;

  const handleLink = async () => {
    setBusy(true);
    setErr(false);
    try {
      await signInWithGoogle();
    } catch {
      setErr(true);
    }
    setBusy(false);
  };

  return (
    <TouchableOpacity style={s.bar} onPress={handleLink} disabled={busy} activeOpacity={0.8}>
      <Text style={s.icon}>👤</Text>
      <Text style={s.text}>
        {err ? "Hata oluştu, tekrar dene" : "Misafir olarak geziyorsun · Tahmin için giriş yap"}
      </Text>
      {busy
        ? <ActivityIndicator size="small" color="#f59e0b" />
        : <Text style={s.cta}>Google ile Giriş →</Text>
      }
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c1507",
    borderWidth: 1,
    borderColor: "#f59e0b44",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  icon: { fontSize: 14 },
  text: { flex: 1, fontSize: 12, color: "#a16207" },
  cta:  { fontSize: 12, fontWeight: "800", color: "#f59e0b" },
});
