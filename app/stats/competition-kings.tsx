import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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

async function fetchJson(path: string) {
  const res = await apiFetch(path);
  const txt = await res.text();
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    return { ok: false, error: "BAD_JSON", detail: txt?.slice?.(0, 200) };
  }
  return j;
}

type CupRow = {
  userId: string;
  totalPoints: number;
  matches: number;
  totalPenalty: number;
};

type CupMeta = {
  competitionId: string;
  name: string | null;
  shortName: string | null;
};

type CupMe = {
  userId: string;
  totalPoints: number;
  matches: number;
  totalPenalty: number;
  avg: number;
  lastAt: string | null;
  rank: number | null;
};

type RecentMatch = {
  fixtureId: string;
  points: number;
  updatedAt: string | null;
};

export default function CompetitionKingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId?: string;
    competitionId?: string;
  }>();

  const [userId, setUserId] = useState<string>(String(params.userId || "demo1"));
  const [competitionId, setCompetitionId] = useState<string>(
    String(params.competitionId || "")
  );

  const [refreshing, setRefreshing] = useState(false);

  const [cupRows, setCupRows] = useState<CupRow[]>([]);
  const [cupMeta, setCupMeta] = useState<CupMeta | null>(null);
  const [cupUpdatedAt, setCupUpdatedAt] = useState<string | null>(null);
  const [cupError, setCupError] = useState<string | null>(null);
  const [cupMe, setCupMe] = useState<CupMe | null>(null);
  const [cupCount, setCupCount] = useState<number | null>(null);

  const [myMatches, setMyMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(false);

  // URL paramları değişirse state’i güncelle
  useEffect(() => {
    const uid = String(params.userId || "demo1");
    const cid = String(params.competitionId || "");
    setUserId(uid);
    setCompetitionId(cid);
  }, [params.userId, params.competitionId]);

  // Kupa genel sıralama
  const loadCompetitionTotals = useCallback(async () => {
    if (!competitionId) {
      setCupRows([]);
      setCupMeta(null);
      setCupUpdatedAt(null);
      setCupError("competitionId tanımlı değil.");
      setCupMe(null);
      setCupCount(null);
      return;
    }

    const url = `/api/rt/competition-totals?competitionId=${encodeURIComponent(
      competitionId
    )}&userId=${encodeURIComponent(userId)}`;

    const j: any = await fetchJson(url);

    if (!j || !j.ok) {
      setCupRows([]);
      setCupMeta(
        competitionId ? { competitionId, name: null, shortName: null } : null
      );
      setCupUpdatedAt(j?.updatedAt || null);
      setCupError(j?.error || "COMPETITION_TOTALS_FAILED");
      setCupMe(null);
      setCupCount(null);
      return;
    }

    const rows: CupRow[] = (Array.isArray(j.items) ? j.items : []).map((it: any) => {
      const totalPoints = Number(it.totalPoints ?? it.total ?? 0);
      const matches = Number(it.matches ?? it.played ?? 0);
      const totalPenalty = Number(it.totalPenalty ?? it.penalties ?? 0);
      return {
        userId: String(it.userId || it.userIdLower || "-"),
        totalPoints,
        matches,
        totalPenalty,
      };
    });

    rows.sort((a, b) => b.totalPoints - a.totalPoints);

    setCupRows(rows);
    setCupMeta({
      competitionId: String(j.competitionId || competitionId),
      name: j.meta?.name ?? j.name ?? null,
      shortName: j.meta?.shortName ?? j.shortName ?? null,
    });
    setCupUpdatedAt(j.updatedAt || null);
    setCupError(null);

    // backend me + count
    if (j.me && j.me.userId) {
      setCupMe({
        userId: String(j.me.userId),
        totalPoints: Number(j.me.totalPoints || 0),
        matches: Number(j.me.matches || 0),
        totalPenalty: Number(j.me.totalPenalty || 0),
        avg: Number(j.me.avg || 0),
        lastAt: j.me.lastAt || null,
        rank: typeof j.me.rank === "number" && j.me.rank > 0 ? j.me.rank : null,
      });
    } else {
      setCupMe(null);
    }

    if (typeof j.count === "number") setCupCount(j.count);
    else setCupCount(rows.length);
  }, [competitionId, userId]);

  // Benim bu kupadaki son maçlarım (form)
  const loadMyCompetitionMatches = useCallback(async () => {
    setMyMatches([]);

    if (!competitionId) return;

    const statsUrl = `/api/stats/user?userId=${encodeURIComponent(userId)}`;
    const s: any = await fetchJson(statsUrl);
    if (!s || !s.ok || !Array.isArray(s.recentMatches)) return;

    const recent = (s.recentMatches as any[])
      .map((m: any) => ({
        fixtureId: String(m.fixtureId || ""),
        points: Number(m.points || 0),
        updatedAt: m.updatedAt || null,
      }))
      .filter((m) => m.fixtureId);

    const limited = recent.slice(0, 20);

    const result: RecentMatch[] = [];
    for (const m of limited) {
      const url = `/api/rt/fixture-competitions?fixtureId=${encodeURIComponent(m.fixtureId)}`;
      const fc: any = await fetchJson(url);
      if (!fc || !Array.isArray(fc.competitions)) continue;

      const belongs = fc.competitions.some(
        (c: any) =>
          String(c.competitionId || "").trim().toLowerCase() ===
            competitionId.toLowerCase() && c.countsForPoints !== false
      );

      if (belongs) {
        result.push({
          fixtureId: m.fixtureId,
          points: m.points,
          updatedAt: m.updatedAt,
        });
      }
    }

    result.sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );

    setMyMatches(result);
  }, [competitionId, userId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadCompetitionTotals();
      await loadMyCompetitionMatches();
    } finally {
      setLoading(false);
    }
  }, [loadCompetitionTotals, loadMyCompetitionMatches]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ---------- Derived ----------
  const cupTitle =
    cupMeta?.shortName ||
    cupMeta?.name ||
    cupMeta?.competitionId ||
    competitionId ||
    "Seçilmiş kupa";

  const myRow = useMemo(
    () =>
      cupRows.find((r) => String(r.userId || "").toLowerCase() === userId.toLowerCase()) ||
      null,
    [cupRows, userId]
  );

  const myRank = useMemo(() => {
    if (cupMe && typeof cupMe.rank === "number") return cupMe.rank;
    if (!myRow) return null;
    const idx = cupRows.findIndex(
      (r) => String(r.userId || "").toLowerCase() === userId.toLowerCase()
    );
    return idx === -1 ? null : idx + 1;
  }, [cupMe, cupRows, myRow, userId]);

  const formArray = myMatches.map((m) => m.points).slice(0, 10);

  const summaryPoints = cupMe?.totalPoints ?? myRow?.totalPoints ?? 0;
  const summaryMatches = cupMe?.matches ?? myRow?.matches ?? undefined;
  const myTotalPenalty = cupMe?.totalPenalty ?? myRow?.totalPenalty ?? 0;

  const totalPlayers = cupCount != null ? cupCount : cupRows.length || 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadAll();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={{ padding: 16, gap: 12 }}>
        {/* Başlık + geri */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
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
              style={{ fontSize: 18, fontWeight: "800", color: Colors.slate900 }}
              numberOfLines={1}
            >
              Kupa Kralları
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {cupTitle}
            </Text>
          </View>
        </View>

        {/* Loading */}
        {loading && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ActivityIndicator size="small" />
            <Text style={{ marginLeft: 8, color: Colors.muted, fontSize: 12 }}>
              Kupa verileri yükleniyor...
            </Text>
          </View>
        )}

        {/* Özet kartı */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#020617",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 4,
          }}
        >
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Benim kupa özetim</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>Kullanıcı: {userId}</Text>

          <Text style={{ fontSize: 26, fontWeight: "800", color: "#7dd3fc", marginTop: 4 }}>
            {summaryPoints} puan
          </Text>

          {typeof summaryMatches === "number" && (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>Maç: {summaryMatches}</Text>
          )}

          {typeof myRank === "number" && totalPlayers > 0 && (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              Kupa sıram: {myRank} / {totalPlayers}
            </Text>
          )}

          <Text style={{ color: Colors.muted, fontSize: 12 }}>Toplam ceza: {myTotalPenalty}</Text>

          {/* Form */}
          {formArray.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>
                Kupa formu (son {formArray.length} maç):
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {formArray.map((p, ix) => (
                  <View
                    key={ix}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 8,
                      backgroundColor: p >= 0 ? Colors.headerBlue : "#450a0a",
                      marginRight: 4,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: p >= 0 ? Colors.slate900 : "#fecaca" }}>
                      {p}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Meta / güncelleme */}
        <View style={{ gap: 2 }}>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>Kupa ID: {competitionId || "-"}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>Güncelleme: {cupUpdatedAt || "-"}</Text>
          {typeof totalPlayers === "number" && totalPlayers > 0 && (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>Toplam oyuncu: {totalPlayers}</Text>
          )}
          {cupError && <Text style={{ color: "#f97316", fontSize: 11 }}>Kupa verisi: {cupError}</Text>}
        </View>

        {/* Kupa genel leaderboard */}
        <View style={{ marginTop: 8 }}>
          {(cupRows.length ? cupRows.slice(0, 30) : []).map((r, ix) => {
            const isMe = String(r.userId || "").toLowerCase() === userId.toLowerCase();
            return (
              <View
                key={String(r.userId ?? "-") + "_" + String(ix)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: isMe ? "#0f172a" : "#020617",
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 8,
                  borderWidth: isMe ? 1 : 0,
                  borderColor: isMe ? "#7dd3fc" : "transparent",
                }}
              >
                <View>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    {ix + 1}. {r.userId}
                    {isMe ? " (ben)" : ""}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                    Maç: {r.matches} · Ceza: {r.totalPenalty}
                  </Text>
                </View>
                <Text style={{ color: "#7dd3fc", fontWeight: "700", fontSize: 14 }}>
                  {r.totalPoints} puan
                </Text>
              </View>
            );
          })}

          {cupRows.length === 0 && !cupError && (
            <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
              Bu kupa için henüz kayıtlı puan bulunmuyor.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
