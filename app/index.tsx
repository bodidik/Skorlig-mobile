import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { markFirstRunDone } from "../lib/firstRun";
import { getDeviceCountry } from "../lib/locale";
import { apiFetch } from "../lib/apiFetch";

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDetectedCountry(getDeviceCountry());
  }, []);

  async function handleStart() {
    setBusy(true);
    try {
      // Tespit edilen ülkeyi sunucuya kaydet
      if (detectedCountry && user) {
        await apiFetch("/api/users/set-country", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: detectedCountry }),
        });
      }
    } catch {
      // Ülke kaydı başarısız olsa da devam et
    } finally {
      await markFirstRunDone();
      setBusy(false);
      router.replace("/(tabs)/live");
    }
  }

  const steps = [
    { icon: "⚽", title: "Tahmin Yap", desc: "Açık maçlardan seç: skor, ilk gol, kırmızı kart, penaltı..." },
    { icon: "📊", title: "Puan Topla", desc: "Doğru bilirsen puan kazan, yanlışta ceza. Herkes eşit kurallarla yarışır." },
    { icon: "🏆", title: "Sıralamada Yüksel", desc: "Maç anında sıranı canlı izle, haftalık liglerde LC ödülleri kap." },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#020617" }}
      contentContainerStyle={{ padding: 24, paddingTop: 60, gap: 16 }}
    >
      {/* Marka */}
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 44 }}>⚽</Text>
        <Text style={{ fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>
          Skor<Text style={{ color: "#a3e635" }}>Lig</Text>
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
          Maç tahmin ligi — bil, puanla, zirveye çık.
        </Text>
      </View>

      {/* Nasıl oynanır */}
      <View style={{ gap: 10, marginTop: 8 }}>
        {steps.map((s, ix) => (
          <View
            key={s.title}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#0f172a",
              borderWidth: 1,
              borderColor: "#1e293b",
            }}
          >
            <Text style={{ fontSize: 26 }}>{s.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                {ix + 1}. {s.title}
              </Text>
              <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{s.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Tespit edilen ülke */}
      {detectedCountry && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#a3e63544",
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 20 }}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 13 }}>
              Ülken: {detectedCountry}
            </Text>
            <Text style={{ color: "#64748b", fontSize: 11 }}>
              Cihaz ayarından tespit edildi. Profilden değiştirebilirsin.
            </Text>
          </View>
        </View>
      )}

      {/* Başla butonu */}
      <TouchableOpacity
        onPress={handleStart}
        disabled={busy}
        style={{
          marginTop: 4,
          paddingVertical: 16,
          borderRadius: 999,
          backgroundColor: "#a3e635",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {busy
          ? <ActivityIndicator color="#020617" />
          : <Text style={{ color: "#020617", fontWeight: "900", fontSize: 17 }}>Maçlara Git ⚽</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}
