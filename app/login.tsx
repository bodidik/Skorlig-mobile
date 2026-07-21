import React, { useEffect } from "react";
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
import Colors from "../constants/colors";

export default function LoginScreen() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)/live");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Text style={s.logo}>⚽</Text>
        <Text style={s.title}>SkorLig</Text>
        <Text style={s.sub}>Tahmin yap, puan kazan</Text>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity style={s.googleBtn} onPress={signInWithGoogle} activeOpacity={0.85}>
          <Text style={s.googleIcon}>G</Text>
          <Text style={s.googleText}>Google ile Giriş Yap</Text>
        </TouchableOpacity>

        <Text style={s.legal}>
          Giriş yaparak Kullanım Koşulları ve Gizlilik Politikası'nı kabul etmiş olursunuz.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 24 },
  center:     { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  hero:       { flex: 1, alignItems: "center", justifyContent: "center" },
  logo:       { fontSize: 72, marginBottom: 12 },
  title:      { fontSize: 36, fontWeight: "900", color: Colors.slate900, letterSpacing: -1 },
  sub:        { fontSize: 16, color: Colors.muted, marginTop: 8 },
  bottom:     { paddingBottom: 48 },
  googleBtn:  {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  googleIcon: { fontSize: 20, fontWeight: "900", color: "#4285F4" },
  googleText: { fontSize: 16, fontWeight: "700", color: Colors.slate900 },
  legal:      { fontSize: 11, color: Colors.muted, textAlign: "center", lineHeight: 16 },
});
