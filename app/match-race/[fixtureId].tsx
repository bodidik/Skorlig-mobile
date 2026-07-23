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
type Participant = { userId: string; joinedAt?: string | null };
type RaceResp = {
  ok: boolean;
  phase?: "pre" | "live";
  state?: {
    status?: string;
    minute?: number | null;
    score?: { home: number; away: number } | null;
    home?: string | null;
    away?: string | null;
    date?: string | null;
    time?: string | null;
    league?: string | null;
    firstGoal?: string | null;
    redAny?: boolean;
    penaltyAny?: boolean;
    updatedAt?: string | null;
  };
  totalPlayers?: number;
  inRaceCount?: number;
  top?: RaceRow[];
  participants?: Participant[];
  meJoined?: boolean;
  me?: RaceRow | null;
  error?: string;
};

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const POLL_MS = 20000;
const PRE_POLL_MS = 60000;

export default function MatchRaceScreen() {
  const router = useRouter();
  const { fixtureId: qFid, userId: qUserId } = useLocalSearchParams<{ fixtureId?: string; userId?: string }>();
  const fixtureId = String(qFid || "").trim();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<RaceResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

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

  useEffect(() => {
    const phase = data?.phase || "";
    const status = data?.state?.status || "";
    const isLive = LIVE_STATUSES.has(String(status).toUpperCase());

    if (timerRef.current) clearInterval(timerRef.current);

    if (isLive) {
      timerRef.current = setInterval(load, POLL_MS);
    } else if (phase === "pre") {
      timerRef.current = setInterval(load, PRE_POLL_MS);
    }

    if (prevPhaseRef.current === "pre" && phase === "live" && notifyOn) {
      // Phase just transitioned from pre to live
    }
    prevPhaseRef.current = phase;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data?.phase, data?.state?.status, load, notifyOn]);

  const st = data?.state;
  const phase = data?.phase || "";
  const isPre = phase === "pre";
  const isFT = String(st?.status || "").toUpperCase() === "FT";
  const isLive = LIVE_STATUSES.has(String(st?.status || "").toUpperCase());

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
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      {/* Üst bar: geri + hızlı navigasyon */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.replace({ pathname: "/(tabs)/live", params: { tab: "open" } })}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>Maçlar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace({ pathname: "/(tabs)/live", params: { tab: "mine" } })}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>Tahminlerim</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>Yarış panosu yükleniyor...</Text>
        </View>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316" }}>
          Pano yüklenemedi: {data?.error || "Bilinmeyen hata"}
        </Text>
      )}

      {/* ===== PRE-MATCH ===== */}
      {!loading && data?.ok && isPre && st && (
        <>
          {/* Maç kartı */}
          <View
            style={{
              padding: 20,
              borderRadius: 14,
              backgroundColor: "#020617",
              borderWidth: 1,
              borderColor: "#3b82f644",
              alignItems: "center",
              gap: 6,
            }}
          >
            {st.league && (
              <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700" }}>{st.league}</Text>
            )}
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" }}>
              {st.home || "Ev"} — {st.away || "Deplasman"}
            </Text>
            <Text style={{ color: "#a3e635", fontSize: 28, fontWeight: "900" }}>vs</Text>
            {(st.date || st.time) && (
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {st.date ? `📅 ${st.date}` : ""}{st.time ? ` ⏰ ${st.time}` : ""}
              </Text>
            )}
            <View style={{ marginTop: 4, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}>
              <Text style={{ color: "#fbbf24", fontSize: 11, fontWeight: "700" }}>⏳ Maç henüz başlamadı</Text>
            </View>
          </View>

          {/* Katılımcı sayacı */}
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: "#0f172a",
              borderWidth: 1,
              borderColor: Colors.border,
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "900", fontSize: 32, color: Colors.accent }}>
              {data.totalPlayers || 0}
            </Text>
            <Text style={{ fontWeight: "700", fontSize: 13, color: "#e2e8f0" }}>
              kişi bu maça tahmin gönderdi
            </Text>
            {data.meJoined && (
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e66" }}>
                <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "700" }}>✅ Sen de yarışa katıldın</Text>
              </View>
            )}
          </View>

          {/* Bildirim al */}
          <TouchableOpacity
            onPress={() => setNotifyOn((v) => !v)}
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: notifyOn ? "#052e16" : "#1e293b",
              borderWidth: 1,
              borderColor: notifyOn ? "#22c55e" : Colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 18 }}>{notifyOn ? "🔔" : "🔕"}</Text>
            <View>
              <Text style={{ fontWeight: "700", color: notifyOn ? "#4ade80" : "#e2e8f0", fontSize: 14 }}>
                {notifyOn ? "Bildirim açık — maç başlayınca güncellenecek" : "Maç başlayınca bildir"}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                {notifyOn ? "Ekranı açık tut, maç başlayınca otomatik canlı yarışa geçer." : "Bu ekranda kal, maç başladığında canlı sıralama otomatik açılır."}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Katılımcı listesi */}
          <Text style={{ fontWeight: "700", color: "#e2e8f0", marginTop: 4 }}>
            Katılımcılar ({data.totalPlayers || 0})
          </Text>
          {(data.participants || []).map((p, i) => {
            const isMe = p.userId.toLowerCase() === userId.toLowerCase();
            return (
              <View
                key={p.userId + i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: isMe ? "#0f172a" : "#020617",
                  borderWidth: 1,
                  borderColor: isMe ? Colors.accent : Colors.border,
                }}
              >
                <Text style={{ color: Colors.muted, fontWeight: "600", width: 30, fontSize: 12 }}>
                  {i + 1}.
                </Text>
                <Text style={{ color: "#fff", fontWeight: isMe ? "900" : "600", flex: 1 }} numberOfLines={1}>
                  {p.userId}{isMe ? " (ben)" : ""}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11 }}>⚽</Text>
              </View>
            );
          })}
        </>
      )}

      {/* ===== CANLI / BİTEN MAÇ ===== */}
      {!loading && data?.ok && !isPre && st && (
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
              backgroundColor: "#0f172a",
              borderWidth: 1,
              borderColor: Colors.border,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", fontSize: 13, color: "#e2e8f0" }}>🏃 Yarışta</Text>
              <Text style={{ fontWeight: "900", fontSize: 13, color: "#059669" }}>
                {data.inRaceCount} / {data.totalPlayers}
              </Text>
            </View>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: "#1e293b", overflow: "hidden" }}>
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
          {data.me ? (
            <View
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: data.me.inRace ? "#22c55e" : "#ef4444",
                backgroundColor: data.me.inRace ? "#052e16" : "#2a0a0a",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Text style={{ fontWeight: "900", fontSize: 15, color: "#e2e8f0" }}>
                  Anlık sıran: {data.me.rank}. / {data.totalPlayers}
                </Text>
                <Text style={{ color: data.me.inRace ? "#059669" : "#dc2626", fontSize: 12, fontWeight: "700" }}>
                  {data.me.inRace ? "✅ Tahminin tutuyor" : "❌ Tahminin şu an tutmuyor"}
                </Text>
              </View>
              <Text style={{ fontWeight: "900", fontSize: 20, color: Colors.accent }}>{data.me.points}p</Text>
            </View>
          ) : (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              Bu maça tahminin yok — pano sadece izleme modunda.
            </Text>
          )}

          {/* İlk 50 */}
          <Text style={{ fontWeight: "700", color: "#e2e8f0" }}>İlk {(data.top || []).length} · toplam {data.totalPlayers} tahminci</Text>
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
