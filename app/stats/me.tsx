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

type RecentItem = {
  fixtureId: string;
  home?: number | null;
  away?: number | null;
  outcome?: string | null;
  firstGoal?: string | null;
  firstHalf?: string | null;
  live?: any;
};

type MeResponse = {
  ok: boolean;
  userId?: string;
  flag?: string | null;
  team?: string | null;
  total?: number;
  items?: RecentItem[];
  error?: string;
};

export default function StatsMeScreen() {
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();

  const userId = useMemo(() => String(qUser || "demo1").trim(), [qUser]);

  const [loading, setLoading] = useState(false);

  const [flag, setFlag] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<RecentItem[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);

      // Not: endpoint backend’de farklıysa sadece burayı değiştiririz.
      const r = await apiFetch(`/api/stats/user?userId=${encodeURIComponent(userId)}`);
      const j: MeResponse = await r.json();

      if (!j?.ok) {
        throw new Error(j?.error || "STATS_ME_FAILED");
      }

      setFlag(String(j.flag || ""));
      setTeam(String(j.team || ""));
      setTotal(Number(j.total || 0));
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      setFlag("");
      setTeam("");
      setTotal(0);
      setItems([]);
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const Btn = ({ title, to }: { title: string; to: string }) => (
    <TouchableOpacity
      onPress={() => router.push({ pathname: to as any, params: { userId } } as any)}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: Colors.headerBlue,
        borderRadius: 10,
      }}
    >
      <Text style={{ fontWeight: "600" }}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Benim İstatistiklerim</Text>
        <Text style={{ color: Colors.muted }}>
          {flag || ""} {userId}
          {team ? ` • ${team}` : ""}
        </Text>

        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700" }}>Genel Puan</Text>

          {loading ? (
            <View style={{ marginTop: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: Colors.muted }}>Yükleniyor...</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 28, fontWeight: "900", marginTop: 4 }}>{total}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Btn title="Açık Maçlar" to="/live" />
            <Btn title="Favori Takımım" to="/live/fav" />
            <Btn title="Liderlik (bayraklı)" to="/stats/board2" />
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Text style={{ padding: 12, fontWeight: "700" }}>Son Oynadıklarım</Text>

          {items.length === 0 ? (
            <Text style={{ padding: 12, color: Colors.muted }}>Kayıt yok.</Text>
          ) : (
            items.map((it, idx) => (
              <View
                key={it.fixtureId + "_" + idx}
                style={{
                  padding: 12,
                  borderTopWidth: idx ? 1 : 0,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ fontWeight: "600" }}>
                  {it.live?.home || "Ev"} – {it.live?.away || "Dep"}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Tahmin: {it.home}-{it.away}
                  {it.outcome ? ` (${it.outcome})` : ""}
                  {it.firstGoal ? ` • FG:${it.firstGoal}` : ""}
                  {it.firstHalf ? ` • 1Y:${it.firstHalf}` : ""}
                </Text>
                {it.live ? (
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    Canlı: {it.live.status} • {it.live.minute}' • {it.live.score.home}-
                    {it.live.score.away}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
