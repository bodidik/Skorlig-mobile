import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

export default function Gs1987VerifyScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("demo1");
  const [code, setCode] = useState<string>("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const uid = userId.trim();
    const raw = code.trim();

    if (!uid || !raw) {
      Alert.alert("SkorLig", "Kullanıcı ve kod alanları zorunludur.");
      return;
    }

    try {
      setSending(true);

      const res = await apiFetch(`/api/auth1987gs/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, code: raw }),
      });

      const txt = await res.text();
      let j: any = null;

      try {
        j = txt ? JSON.parse(txt) : null;
      } catch {
        Alert.alert(
          "Hata",
          `Sunucudan beklenmeyen cevap geldi:\n\n${txt.slice(0, 300)}`
        );
        return;
      }

      if (!res.ok || !j?.ok) {
        Alert.alert(
          "1987GS",
          j?.error === "INVALID_CODE"
            ? "Kod geçersiz."
            : j?.error === "CODE_EXHAUSTED"
            ? "Bu kod maksimum kullanımına ulaşmış."
            : j?.error || `DOĞRULAMA_HATASI (HTTP ${res.status})`
        );
        return;
      }

      const label = j?.code?.label || "1987GS";
      const remaining =
        typeof j?.code?.remaining === "number"
          ? `Kalan hak: ${j.code.remaining}`
          : "";

      Alert.alert("1987GS", `${label} erişimi açıldı.\n${remaining}`, [
        {
          text: "Tamam",
          onPress: () => {
            // İstersen direkt üye listesine atla:
            // router.push("/gs1987-members");
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      {/* Başlık + geri */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
            marginRight: 8,
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: Colors.slate900,
            }}
          >
            1987GS Kod Doğrulama
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: Colors.muted,
              marginTop: 2,
            }}
          >
            Özel kod / QR ile 1987 döngüsüne giriş.
          </Text>
        </View>
      </View>

      {/* Açıklama */}
      <View
        style={{
          padding: 10,
          borderRadius: 10,
          backgroundColor: "#020617",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#e5e7eb", fontSize: 12 }}>
          1987 üyeliği, verilen özel kod / barkod ile açılır. SkorLig hesabın 1987
          ile eşleştirildikten sonra, giriş yaptığın sürece 1987 alanına rahatça
          erişebilirsin.
        </Text>
      </View>

      {/* Kullanıcı ID */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: Colors.border,
          marginBottom: 12,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700", fontSize: 13 }}>Kullanıcı</Text>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          placeholder="ör: demo1"
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            fontSize: 13,
          }}
        />
        <Text style={{ fontSize: 11, color: Colors.muted }}>
          Uygulamada giriş yaptığın kullanıcı adı / ID burada kullanılacak.
        </Text>
      </View>

      {/* Kod alanı */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: Colors.border,
          marginBottom: 16,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700", fontSize: 13 }}>1987 Kodu</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="ör: GS1987-ABC123"
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            fontSize: 13,
          }}
        />
        <Text style={{ fontSize: 11, color: Colors.muted }}>
          Sana verilen tek kullanımlık veya çok kullanımlı 1987 kodunu gir.
        </Text>
      </View>

      {/* Gönder butonu */}
      <TouchableOpacity
        onPress={submit}
        disabled={sending}
        style={{
          padding: 14,
          borderRadius: 999,
          backgroundColor: sending ? Colors.muted : Colors.primary,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {sending && <ActivityIndicator size="small" color="#fff" />}
        <Text
          style={{
            marginLeft: sending ? 8 : 0,
            textAlign: "center",
            color: "#fff",
            fontWeight: "800",
            fontSize: 15,
          }}
        >
          {sending ? "Doğrulanıyor..." : "Kodu Doğrula"}
        </Text>
      </TouchableOpacity>

      {/* Üye listesi linki */}
      <TouchableOpacity
        onPress={() => router.push("/gs1987-members")}
        style={{ marginTop: 12, alignSelf: "center" }}
      >
        <Text
          style={{
            fontSize: 12,
            color: Colors.accent,
            textDecorationLine: "underline",
          }}
        >
          1987GS üye listesini gör →
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
