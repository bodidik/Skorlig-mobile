import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { t, useLang } from "../lib/i18n";
import Colors from "../constants/colors";

export default function LoginScreen() {
  useLang(); // dil değişince yeniden çizilsin
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)/live");
    }
  }, [user, loading]);

  if (loading || busy) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      // Başarılı — busy=true'da bırak; onAuthStateChanged tetiklenip
      // useEffect redirect'i login ekranını unmount edecek.
      // setBusy(false) çağırmıyoruz: çağırılırsa ekran anlık geri gelir.
      return;
    } catch {
      // İptal veya hata — düğmeyi geri göster.
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Text style={s.logo}>⚽</Text>
        <Text style={s.title}>SkorLig</Text>
        <Text style={s.sub}>Tahmin yap, puan kazan</Text>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity style={s.googleBtn} onPress={handleSignIn} activeOpacity={0.85}>
          <Text style={s.googleIcon}>G</Text>
          <Text style={s.googleText}>{t("googleSignInBtn")}</Text>
        </TouchableOpacity>

        <Text style={s.legal}>
          {t("termsNote")}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: "#020617", paddingHorizontal: 24 },
  center:     { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#020617" },
  hero:       { flex: 1, alignItems: "center", justifyContent: "center" },
  logo:       { fontSize: 72, marginBottom: 12 },
  title:      { fontSize: 36, fontWeight: "900", color: "#e2e8f0", letterSpacing: -1 },
  sub:        { fontSize: 16, color: "#64748b", marginTop: 8 },
  bottom:     { paddingBottom: 48 },
  googleBtn:  {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    elevation: 2,
    marginBottom: 16,
  },
  googleIcon: { fontSize: 20, fontWeight: "900", color: "#4285F4" },
  googleText: { fontSize: 16, fontWeight: "700", color: "#e2e8f0" },
  legal:      { fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 16 },
});
