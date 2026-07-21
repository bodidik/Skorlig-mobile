import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type TeamRow = {
  userId: string;
  points: number;
  team?: string | null;
  flag?: string | null;
};

export default function TeamTotalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const team = String((params as any)?.team ?? "").trim();
  const userId = String((params as any)?.userId ?? "").trim();

  const title = useMemo(() => {
    if (team) return `Takım Sıralaması • ${team}`;
    return "Takım Sıralaması";
  }, [team]);

  const [items, setItems] = useState<TeamRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJson = useCallback(async (url: string) => {
    const r = await apiFetch(url);
    const j = await r.json().catch(() => null);
    return j;
  }, []);

  const load = useCallback(async () => {
    const t = String(team || "").trim();
    if (!t) {
      setItems([]);
      setUpdatedAt(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Not: backend path’in farklıysa sadece bu satırı değiştir.
      const url = `/api/rt/team-totals?team=${encodeURIComponent(
        t
      )}&userId=${encodeURIComponent(userId)}`;

      const j: any = await fetchJson(url);

      if (!j?.ok) {
        setItems([]);
        setUpdatedAt(j?.updatedAt || null);
        return;
      }

      const rows: TeamRow[] = Array.isArray(j.items)
        ? j.items.map((x: any) => ({
            userId: String(x.userId || x.userIdLower || ""),
            points: Number(x.points ?? x.totalPoints ?? 0),
            team: x.team ?? null,
            flag: x.flag ?? null,
          }))
        : [];

      rows.sort((a, b) => (b.points || 0) - (a.points || 0));

      setItems(rows);
      setUpdatedAt(j.updatedAt || null);
    } catch (e: any) {
      setItems([]);
      setUpdatedAt(null);
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [team, userId, fetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: Colors.slate900,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
            Güncelleme: {updatedAt || "-"}
          </Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator />
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 8 }}>
            Yükleniyor...
          </Text>
        </View>
      )}

      {/* List */}
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          overflow: "hidden",
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 12, color: Colors.muted }}>
            Kayıt bulunamadı.
          </Text>
        ) : (
          items.map((x, idx) => (
            <View
              key={`${x.userId || "u"}_${idx}`}
              style={{
                padding: 12,
                borderTopWidth: idx ? 1 : 0,
                borderColor: Colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ width: 28, textAlign: "right", fontWeight: "700" }}>
                {idx + 1}
              </Text>
              <Text style={{ width: 26, textAlign: "center" }}>
                {x.flag || ""}
              </Text>
              <Text style={{ flex: 1 }}>
                {x.userId}
                {x.team ? ` • ${x.team}` : ""}
              </Text>
              <Text style={{ fontWeight: "800" }}>{x.points}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
