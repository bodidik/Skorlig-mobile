import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";

/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ BURADA HAM `fetch` VARDI: zaman asimi ve yeniden deneme politikasi yoktu
 * (bkz. lib/fetchPolicy). Istek asildiginda ekran sonsuza kadar spinner
 * gosteriyor, kullanicinin iptal edecek bir seyi olmuyordu — "kings"
 * sekmesinde tam olarak bu yasandi. Ayni kopya 29 dosyada vardi.
 * Paylasilan surum auth basliklarini da kendisi ekliyor.
 */
async function apiFetch(path: string, init?: RequestInit) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

export default function FavScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [team, setTeam] = useState("");
  const [flag, setFlag] = useState("");

  async function save() {
    if (!userId.trim() || !team.trim()) {
      Alert.alert("SkorLig", "Kullanıcı ID ve takım zorunludur.");
      return;
    }

    try {
      // ⚠️ YOL DÜZELTİLDİ: `/api/stats/fav` diye bir uç YOK (POST'ta da 404).
      // Yani bu ekran hiçbir zaman kaydetmiyordu — kullanıcı "Kaydet"e basıp
      // hata mesajı alıyor, favori takımı hiç yazılmıyordu.
      // Gerçek uç: POST /api/users/set-main-team (kimlik `verifyToken`'dan
      // geldiği için gövdeye userId koymaya gerek yok).
      const r = await apiFetch("/api/users/set-main-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: team.trim(),
          flag: flag.trim() || null,
        }),
      });

      const j = await r.json();
      if (j?.ok) {
        Alert.alert("SkorLig", "Favori takım kaydedildi.");
        router.back();
      } else {
        Alert.alert("Hata", j?.error || "FAV_SAVE_FAILED");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800", color: "#e2e8f0" }}>
        Favori Takım Seç
      </Text>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>
          Kullanıcı ID
        </Text>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>
          Takım
        </Text>
        <TextInput
          value={team}
          onChangeText={setTeam}
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>
          Bayrak (opsiyonel)
        </Text>
        <TextInput
          value={flag}
          onChangeText={setFlag}
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>

      <TouchableOpacity
        onPress={save}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: Colors.live,
        }}
      >
        <Text
          style={{
            color: "#fff",
            textAlign: "center",
            fontWeight: "700",
          }}
        >
          Kaydet
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
