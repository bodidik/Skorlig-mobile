import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

type UserProfile = {
  userId: string;
  mainTeam?: string | null;
  is1987?: boolean;
  createdAt?: string | null;
};

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

export default function ProfileUserScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();

  const userId = useMemo(() => String(qUserId || "").trim(), [qUserId]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const uid = userId.trim();
    if (!uid) {
      setError("USER_ID_MISSING");
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Projende iki farklı endpoint geçmişi vardı: get?userId= ve get?id=
      // Önce userId'li olanı dene, olmazsa id ile dene.
      let res = await apiFetch(`/api/users/get?userId=${encodeURIComponent(uid)}`);
      let j: any = await res.json().catch(() => null);

      if (!res.ok || !j?.ok) {
        res = await apiFetch(`/api/users/get?id=${encodeURIComponent(uid)}`);
        j = await res.json().catch(() => null);
      }

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `USER_GET_FAILED (HTTP ${res.status})`);
      }

      const p: UserProfile =
        j.user || j.profile || j.item || { userId: uid };

      setProfile(p);
    } catch (e: any) {
      setError(String(e?.message || e));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/live" as any); }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.slate900, flex: 1 }}>
          Profil
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/live" as any)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>🏠 Ana</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
            Yükleniyor...
          </Text>
        </View>
      ) : error ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#7f1d1d" }}>
          <Text style={{ color: "#fee2e2", fontSize: 12, fontWeight: "700" }}>
            Hata
          </Text>
          <Text style={{ color: "#fecaca", fontSize: 12, marginTop: 4 }}>
            {error}
          </Text>
        </View>
      ) : (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "800", color: Colors.slate900, fontSize: 16 }}>
            {profile?.userId || userId}
          </Text>

          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Ana takım: {profile?.mainTeam ? String(profile.mainTeam) : "—"}
          </Text>

          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            1987 üyesi: {profile?.is1987 ? "Evet" : "Hayır"}
          </Text>

          {!!profile?.createdAt && (
            <Text style={{ color: Colors.muted, fontSize: 11 }}>
              Kayıt: {String(profile.createdAt).slice(0, 10)}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}


