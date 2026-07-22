import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
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

export default function FavTeamScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState("demo1");
  const [team, setTeam] = useState("");
  const [flag, setFlag] = useState("");

  const canSave = useMemo(() => {
    return String(userId || "").trim().length > 0 && String(team || "").trim().length > 0;
  }, [userId, team]);

  const save = useCallback(async () => {
    const uid = String(userId || "").trim();
    const t = String(team || "").trim();
    const f = String(flag || "").trim();

    if (!uid) {
      Alert.alert("SkorLig", "Kullanıcı ID boş olamaz.");
      return;
    }
    if (!t) {
      Alert.alert("SkorLig", "Takım adı boş olamaz.");
      return;
    }

    try {
      const res = await apiFetch(`/api/rt/fav-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, team: t, flag: f || null }),
      });
      const j = await res.json();
      if (j?.ok) {
        Alert.alert("SkorLig", "Favori takım kaydedildi.");
        router.back();
      } else {
        Alert.alert("Hata", j?.error || "FAV_SAVE_FAILED");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }, [userId, team, flag, router]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800", color: "#e2e8f0" }}>Favori Takım Seç</Text>

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
          autoCapitalize="none"
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
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>Takım</Text>
        <TextInput
          value={team}
          onChangeText={setTeam}
          autoCapitalize="words"
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
          autoCapitalize="characters"
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
        disabled={!canSave}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: !canSave ? Colors.muted : Colors.live,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>
          Kaydet
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
