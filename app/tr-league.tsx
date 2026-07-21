import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type BoardRow = { userId: string; points: number; matches: number };
type FxView = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  round?: string | null;
  status?: string | null;
  score?: { home: number; away: number } | null;
  settled?: boolean;
};
type WeekResp = {
  ok: boolean;
  weekKey?: string;
  weekRange?: { fromISO?: string; toISO?: string };
  isCurrentWeek?: boolean;
  fixtures?: FxView[];
  board?: BoardRow[];
  settledCount?: number;
  fixtureCount?: number;
  finalized?: { winners?: string[]; rewards?: { userId: string; amount: number }[] } | null;
  myRank?: { rank: number; points: number } | null;
  error?: string;
};
type WeekSummary = {
  weekKey: string;
  fromISO: string;
  toISO: string;
  matchCount: number;
  status: string;
  winners?: string[] | null;
};

const REWARD_MEDALS = ["🥇", "🥈", "🥉"];

export default function TrLeagueScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<WeekResp | null>(null);
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [squad, setSquad] = useState<string[]>([]);
  const [rewards, setRewards] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tr-league/info`).then((x) => x.json());
      if (r?.ok) {
        setSquad((r.squad || []).map((t: any) => t.name));
        setRewards(r.weeklyRewards || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadWeek = useCallback(async () => {
    try {
      setLoading(true);
      const path = selectedWeek
        ? `/api/tr-league/week/${encodeURIComponent(selectedWeek)}?userId=${encodeURIComponent(userId)}`
        : `/api/tr-league/current?userId=${encodeURIComponent(userId)}`;
      const r = await apiFetch(path).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, userId]);

  const loadWeeks = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tr-league/weeks`).then((x) => x.json());
      setWeeks(r?.ok && Array.isArray(r.weeks) ? r.weeks : []);
    } catch {
      setWeeks([]);
    }
  }, []);

  useEffect(() => {
    loadInfo();
    loadWeeks();
  }, [loadInfo, loadWeeks]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const statusLabel: Record<string, string> = {
    upcoming: "Yaklaşan",
    live: "Bu hafta",
    pending: "Sonuç bekleniyor",
    settled: "Bitti",
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([loadWeek(), loadWeeks()]);
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>🇹🇷 Türkiye Tahmin Ligi</Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        Süper Lig'e paralel haftalık tahmin ligi. Doğru bilirsen puan, yanlışta ceza. Her hafta ilk 3'e LC ödülü
        {rewards.length ? ` (${rewards.join(" / ")} LC)` : ""}.
      </Text>
      {squad.length > 0 && (
        <Text style={{ color: Colors.muted, fontSize: 11 }}>Kadro: {squad.join(", ")}</Text>
      )}

      {/* Hafta seçici */}
      {weeks.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => setSelectedWeek(null)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: !selectedWeek ? Colors.accent : Colors.border,
              backgroundColor: !selectedWeek ? Colors.accent : "#fff",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: !selectedWeek ? "#fff" : Colors.slate900 }}>
              Güncel
            </Text>
          </TouchableOpacity>
          {weeks.map((w) => {
            const active = selectedWeek === w.weekKey;
            return (
              <TouchableOpacity
                key={w.weekKey}
                onPress={() => setSelectedWeek(w.weekKey)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? Colors.accent : Colors.border,
                  backgroundColor: active ? Colors.accent : "#fff",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : Colors.slate900 }}>
                  {w.weekKey.replace(/^\d+-W/, "H")} {w.status === "settled" ? "✓" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>Yükleniyor...</Text>
        </View>
      )}

      {!loading && data?.ok && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <Text style={{ fontWeight: "800", fontSize: 15, color: Colors.slate900 }}>
              {data.weekKey?.replace(/^\d+-W/, "Hafta ")}
            </Text>
            {data.weekRange?.fromISO && (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                {data.weekRange.fromISO} — {data.weekRange.toISO}
              </Text>
            )}
          </View>

          {/* Kazanan pankartı */}
          {data.finalized && (data.finalized.winners || []).length > 0 && (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: "#fbbf24",
                backgroundColor: "#fffbeb",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 22 }}>🏆</Text>
              <Text style={{ fontWeight: "900", color: "#92400e", fontSize: 15, textAlign: "center" }}>
                Haftanın Şampiyonu: {(data.finalized.winners || []).join(", ")}
              </Text>
            </View>
          )}

          {data.fixtureCount === 0 ? (
            <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 8 }}>
              Bu hafta için henüz maç yok. Süper Lig sezonu başlayınca kadro takımlarının maçları burada belirir.
            </Text>
          ) : (
            <>
              {/* Sıralama */}
              <Text style={{ fontWeight: "700", marginTop: 4 }}>
                Haftalık Sıralama · {data.settledCount}/{data.fixtureCount} maç işlendi
              </Text>
              {(data.board || []).length === 0 && (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Henüz puan yok. Bu haftanın maçlarına tahmin gir!
                </Text>
              )}
              {(data.board || []).map((row, ix) => {
                const isMe = row.userId.toLowerCase() === userId.toLowerCase();
                const medal = ix < 3 ? REWARD_MEDALS[ix] : ` ${ix + 1}.`;
                const reward = rewards[ix];
                return (
                  <View
                    key={row.userId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: isMe ? "#0f172a" : "#020617",
                      borderWidth: 1,
                      borderColor: isMe ? Colors.accent : Colors.border,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: isMe ? "900" : "600", flex: 1 }} numberOfLines={1}>
                      {medal} {row.userId}
                      {isMe ? " (ben)" : ""}
                    </Text>
                    {ix < 3 && reward ? (
                      <Text style={{ color: "#fbbf24", fontSize: 10, marginRight: 8 }}>+{reward} LC</Text>
                    ) : null}
                    <Text style={{ color: "#a3e635", fontWeight: "800" }}>
                      {row.points} p
                      <Text style={{ color: Colors.muted, fontSize: 10 }}> ({row.matches})</Text>
                    </Text>
                  </View>
                );
              })}

              {data.myRank && (
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  Senin sıran: {data.myRank.rank}. · {data.myRank.points} puan
                </Text>
              )}

              {/* Maçlar */}
              <Text style={{ fontWeight: "700", marginTop: 8 }}>Bu Haftanın Maçları</Text>
              {(data.fixtures || []).map((f) => {
                const ko = f.kickoffISO ? new Date(f.kickoffISO) : null;
                const upcoming = ko && ko.getTime() > Date.now();
                return (
                  <TouchableOpacity
                    key={f.fixtureId}
                    disabled={!upcoming}
                    onPress={() =>
                      router.push({ pathname: "/(tabs)/predict", params: { fixtureId: f.fixtureId, userId } })
                    }
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: "#020617",
                      borderWidth: 1,
                      borderColor: Colors.border,
                      opacity: f.settled ? 0.75 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                        {f.home} — {f.away}
                      </Text>
                      {f.score ? (
                        <Text style={{ color: "#a3e635", fontWeight: "900" }}>
                          {f.score.home}-{f.score.away}
                        </Text>
                      ) : (
                        <Text style={{ color: Colors.muted, fontSize: 11 }}>{f.status || "NS"}</Text>
                      )}
                    </View>
                    <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                      {ko
                        ? ko.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : ""}
                      {upcoming ? " · tahmin için dokun" : f.settled ? " · puanlandı ✓" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316", marginTop: 8 }}>Lig yüklenemedi: {data?.error || "?"}</Text>
      )}
    </ScrollView>
  );
}
