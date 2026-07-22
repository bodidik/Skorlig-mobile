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
import { getAuthHeaders } from "../../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
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
      const r = await apiFetch("/api/stats/fav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
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
