import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
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

type RaceRow = { rank: number; userId: string; points: number; inRace: boolean };
type RaceResp = {
  ok: boolean;
  state?: {
    status?: string;
    minute?: number | null;
    score?: { home: number; away: number } | null;
    home?: string | null;
    away?: string | null;
    firstGoal?: string | null;
    redAny?: boolean;
    penaltyAny?: boolean;
    updatedAt?: string | null;
  };
  totalPlayers?: number;
  inRaceCount?: number;
  top?: RaceRow[];
  me?: RaceRow | null;
  error?: string;
};

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const POLL_MS = 20000; // canlı maçta 20 sn'de bir yenile (sağlayıcıya değil, kendi API'mize)

export default function MatchRaceScreen() {
  const router = useRouter();
  const { fixtureId: qFid, userId: qUserId } = useLocalSearchParams<{ fixtureId?: string; userId?: string }>();
  const fixtureId = String(qFid || "").trim();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<RaceResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(
        `/api/rt/match-race?fixtureId=${encodeURIComponent(fixtureId)}&userId=${encodeURIComponent(userId)}&top=50`
      ).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [fixtureId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Canlı maçta otomatik yenile (kendi API'mizden — sağlayıcı sorgusu tetiklemez)
  useEffect(() => {
    const status = data?.state?.status || "";
    const isLive = LIVE_STATUSES.has(String(status).toUpperCase());
    if (timerRef.current) clearInterval(timerRef.current);
    if (isLive) timerRef.current = setInterval(load, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data?.state?.status, load]);

  const st = data?.state;
  const isFT = String(st?.status || "").toUpperCase() === "FT";
  const isLive = LIVE_STATUSES.has(String(st?.status || "").toUpperCase());
  const me = data?.me;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>Yarış panosu yükleniyor...</Text>
        </View>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316" }}>
          Pano yüklenemedi: {data?.error === "STATE_NOT_FOUND" ? "Maç henüz başlamadı (canlı veri yok)." : data?.error}
        </Text>
      )}

      {!loading && data?.ok && st && (
        <>
          {/* Skor kartı */}
          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: "#020617",
              borderWidth: 1,
              borderColor: isLive ? "#22c55e" : Colors.border,
              alignItems: "center",
              gap: 4,
            }}
          >
            {isLive && (
              <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "800" }}>
                🔴 CANLI {st.minute != null ? `· ${st.minute}'` : ""}
              </Text>
            )}
            {isFT && <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "800" }}>MAÇ SONUCU</Text>}
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
              {st.home || "Ev"} — {st.away || "Deplasman"}
            </Text>
            <Text style={{ color: "#a3e635", fontSize: 34, fontWeight: "900" }}>
              {st.score ? `${st.score.home} - ${st.score.away}` : "vs"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {st.firstGoal && (
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  İlk gol: {st.firstGoal === "H" ? "ev" : "deplasman"}
                </Text>
              )}
              {st.redAny && <Text style={{ color: "#ef4444", fontSize: 11 }}>🟥 kırmızı</Text>}
              {st.penaltyAny && <Text style={{ color: "#f59e0b", fontSize: 11 }}>⚪ penaltı</Text>}
            </View>
          </View>

          {/* Yarışta sayacı */}
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: Colors.border,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", fontSize: 13 }}>🏃 Yarışta</Text>
              <Text style={{ fontWeight: "900", fontSize: 13, color: "#059669" }}>
                {data.inRaceCount} / {data.totalPlayers}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
              <View
                style={{
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: "#22c55e",
                  width: `${data.totalPlayers ? Math.round(((data.inRaceCount || 0) / data.totalPlayers) * 100) : 0}%`,
                }}
              />
            </View>
            <Text style={{ color: Colors.muted, fontSize: 10 }}>
              Skor değiştikçe tahmini tutanların sayısı değişir. Puanlar her olayla anında güncellenir.
            </Text>
          </View>

          {/* Benim durumum */}
          {me ? (
            <View
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: me.inRace ? "#22c55e" : "#ef4444",
                backgroundColor: me.inRace ? "#f0fdf4" : "#fef2f2",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Text style={{ fontWeight: "900", fontSize: 15, color: Colors.slate900 }}>
                  Anlık sıran: {me.rank}. / {data.totalPlayers}
                </Text>
                <Text style={{ color: me.inRace ? "#059669" : "#dc2626", fontSize: 12, fontWeight: "700" }}>
                  {me.inRace ? "✅ Tahminin tutuyor" : "❌ Tahminin şu an tutmuyor"}
                </Text>
              </View>
              <Text style={{ fontWeight: "900", fontSize: 20, color: Colors.accent }}>{me.points}p</Text>
            </View>
          ) : (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              Bu maça tahminin yok — pano sadece izleme modunda.
            </Text>
          )}

          {/* İlk 50 */}
          <Text style={{ fontWeight: "700" }}>İlk {(data.top || []).length} · toplam {data.totalPlayers} tahminci</Text>
          {(data.top || []).map((r) => {
            const isMe = r.userId.toLowerCase() === userId.toLowerCase();
            const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : ` ${r.rank}.`;
            return (
              <View
                key={r.userId}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: isMe ? "#0f172a" : "#020617",
                  borderWidth: 1,
                  borderColor: isMe ? Colors.accent : Colors.border,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: isMe ? "900" : "600", flex: 1 }} numberOfLines={1}>
                  {medal} {r.userId}
                  {isMe ? " (ben)" : ""}
                </Text>
                <Text style={{ fontSize: 11, marginRight: 8 }}>{r.inRace ? "🟢" : "🔴"}</Text>
                <Text style={{ color: "#a3e635", fontWeight: "800" }}>{r.points}p</Text>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
