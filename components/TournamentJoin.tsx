import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Props = {
  userId: string;
  onJoined?: (code: string) => void;
  onClose?: () => void;
};

export default function TournamentJoin({ userId, onJoined, onClose }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return Alert.alert("Hata", "Geçerli bir kod gir");
    setBusy(true);
    try {
      const base = await getApiBase();
      const authH = await getAuthHeaders();
      const r = await fetch(`${base}/api/tournaments/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ code: c }),
      });
      const json = await r.json();
      if (json.ok) {
        Alert.alert("Katıldın!", `${json.tournament.name} turnuvasına katıldın. Giriş: ${json.tournament.entryLC} LC`);
        onJoined?.(c);
      } else {
        const msg = json.error === "NOT_FOUND" ? "Turnuva bulunamadı"
          : json.error === "ALREADY_JOINED" ? "Zaten katılmışsın"
          : json.error === "CLOSED" ? "Turnuva kapanmış"
          : json.error || "Katılınamadı";
        Alert.alert("Hata", msg);
      }
    } catch (e: any) {
      Alert.alert("Hata", e.message);
    }
    setBusy(false);
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>🎟️ Turnuvaya Katıl</Text>
      <Text style={s.subtitle}>Arkadaşından aldığın 6 haneli kodu gir</Text>

      <TextInput
        style={s.input}
        placeholder="ABCD12"
        placeholderTextColor="#475569"
        value={code}
        onChangeText={t => setCode(t.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[s.joinBtn, (code.trim().length < 4 || busy) && s.joinBtnDisabled]}
        onPress={handleJoin}
        disabled={code.trim().length < 4 || busy}
      >
        {busy
          ? <ActivityIndicator color="#000" />
          : <Text style={s.joinBtnText}>Katıl</Text>
        }
      </TouchableOpacity>

      {onClose && (
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeBtnText}>Geri</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, alignItems: "center" },
  title: { color: "#f1f5f9", fontSize: 20, fontWeight: "900", marginBottom: 4 },
  subtitle: { color: "#64748b", fontSize: 12, marginBottom: 20 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 14, paddingHorizontal: 20,
    paddingVertical: 16, color: "#a3e635", fontSize: 28, fontWeight: "900",
    textAlign: "center", letterSpacing: 8, borderWidth: 2, borderColor: "#334155",
    width: "100%", marginBottom: 16,
  },
  joinBtn: {
    backgroundColor: "#a3e635", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", width: "100%", marginBottom: 10,
  },
  joinBtnDisabled: { opacity: 0.4 },
  joinBtnText: { color: "#0f172a", fontWeight: "900", fontSize: 15 },
  closeBtn: { paddingVertical: 10 },
  closeBtnText: { color: "#64748b", fontSize: 13 },
});
